#!/usr/bin/env bash
# Network resilience helpers for hosts behind sanctions-related connectivity issues
# (e.g. Iranian server IPs where some upstream endpoints are geo-blocked, slow, or reset).
set -euo pipefail

PP_CONNECT_TIMEOUT="${PP_CONNECT_TIMEOUT:-5}"
PP_MAX_RETRIES="${PP_MAX_RETRIES:-4}"

log_info()  { echo -e "\033[1;34m[info]\033[0m $*"; }
log_warn()  { echo -e "\033[1;33m[warn]\033[0m $*"; }
log_error() { echo -e "\033[1;31m[error]\033[0m $*" >&2; }
log_ok()    { echo -e "\033[1;32m[ok]\033[0m $*"; }

# url_reachable URL - quick HEAD check with short timeout, never aborts the script
url_reachable() {
  local url="$1"
  curl -fsSL --connect-timeout "$PP_CONNECT_TIMEOUT" --max-time 10 -o /dev/null "$url" 2>/dev/null
}

# retry CMD... - retry a command with exponential backoff, does not exit on final failure
# caller must check the return code
retry() {
  local attempt=1
  local delay=2
  until "$@"; do
    if (( attempt >= PP_MAX_RETRIES )); then
      return 1
    fi
    log_warn "Attempt $attempt/$PP_MAX_RETRIES failed for: $* — retrying in ${delay}s"
    sleep "$delay"
    delay=$(( delay * 2 ))
    attempt=$(( attempt + 1 ))
  done
}

# pick_npm_registry - choose the fastest reachable npm registry
# default registry is tried first; falls back to mirrors that are not affected
# by upstream throttling/blocking seen from Iranian IP ranges
pick_npm_registry() {
  local candidates=(
    "https://registry.npmjs.org/"
    "https://registry.npmmirror.com/"
  )
  for reg in "${candidates[@]}"; do
    if url_reachable "${reg}"; then
      echo "$reg"
      return 0
    fi
  done
  # last resort: return default and let npm surface the real error
  echo "${candidates[0]}"
}

# pick_apt_mirror - Ubuntu archive is not sanctioned/geo-blocked in practice,
# but local mirrors are faster and more stable, so prefer one if reachable
pick_apt_mirror() {
  local candidates=(
    "http://ir.archive.ubuntu.com/ubuntu/"
    "http://archive.ubuntu.com/ubuntu/"
  )
  for mirror in "${candidates[@]}"; do
    if url_reachable "${mirror}"; then
      echo "$mirror"
      return 0
    fi
  done
  echo "${candidates[1]}"
}

# acme_ca_flag - choose an ACME CA for SSL issuance; Let's Encrypt normally works
# fine (validation is DNS/HTTP based, not IP-geo based), but ZeroSSL is kept as
# a fallback in case of rate limiting or transient outages
pick_acme_ca() {
  if url_reachable "https://acme-v02.api.letsencrypt.org/directory"; then
    echo "letsencrypt"
  elif url_reachable "https://acme.zerossl.com/v2/DV90"; then
    echo "zerossl"
  else
    echo "letsencrypt"
  fi
}

# safe_apt_install PKG... - apt-get with retry, non-interactive, and mirror fallback
safe_apt_install() {
  export DEBIAN_FRONTEND=noninteractive
  if ! retry apt-get update -qq; then
    log_warn "apt-get update failed on default mirror, switching to fallback mirror"
    local mirror
    mirror="$(pick_apt_mirror)"
    sed -i.bak -E "s#https?://[a-zA-Z0-9.-]+/ubuntu/#${mirror}#g" /etc/apt/sources.list 2>/dev/null || true
    retry apt-get update -qq
  fi
  retry apt-get install -y -qq "$@"
}

# detect_public_ip - best-effort detection of this server's public IPv4
# address, trying several independent endpoints since any single one might
# be slow/geo-blocked from certain networks. Purely informational (used to
# hint the admin towards SERVER_PUBLIC_IP in backend/.env for DNS
# auto-seeding) — echoes nothing and returns non-zero if all attempts fail,
# callers must treat that as "skip, don't block install".
detect_public_ip() {
  local endpoints=(
    "https://ifconfig.me/ip"
    "https://icanhazip.com"
    "https://api.ipify.org"
  )
  local ip
  for ep in "${endpoints[@]}"; do
    if ip="$(curl -fsSL --connect-timeout "$PP_CONNECT_TIMEOUT" --max-time 10 "${ep}" 2>/dev/null)"; then
      ip="$(echo "$ip" | tr -d '[:space:]')"
      if [[ -n "$ip" ]]; then
        echo "$ip"
        return 0
      fi
    fi
  done
  return 1
}
