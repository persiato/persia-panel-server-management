#!/usr/bin/env bash
# Persia Panel installer — targets Ubuntu 24.04 LTS
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/lib/network.sh"

PANEL_DIR="/opt/persia-panel"
PANEL_USER="persiapanel"
NODE_MAJOR="20"

require_root() {
  if [[ "${EUID}" -ne 0 ]]; then
    log_error "Run this installer as root (sudo bash install.sh)"
    exit 1
  fi
}

check_os() {
  if ! grep -qi 'ubuntu' /etc/os-release 2>/dev/null || ! grep -q '24.04' /etc/os-release 2>/dev/null; then
    log_warn "This installer is tested on Ubuntu 24.04. Continuing anyway."
  fi
}

preflight_network() {
  log_info "Checking outbound connectivity to required services..."
  local ok=1
  url_reachable "https://registry.npmjs.org/" || { log_warn "npm default registry unreachable, will use mirror"; ok=0; }
  url_reachable "http://archive.ubuntu.com/ubuntu/" || log_warn "Ubuntu archive slow/unreachable, will try local mirror"
  url_reachable "https://acme-v02.api.letsencrypt.org/directory" || log_warn "Let's Encrypt unreachable, will fall back to ZeroSSL for SSL issuance"
  if [[ "$ok" -eq 1 ]]; then
    log_ok "Connectivity checks passed"
  fi
}

install_base_packages() {
  log_info "Installing base packages"
  safe_apt_install ca-certificates curl gnupg lsb-release software-properties-common ufw
}

install_nodejs() {
  if command -v node >/dev/null && [[ "$(node -v)" == v${NODE_MAJOR}.* ]]; then
    log_ok "Node.js ${NODE_MAJOR} already installed"
    return
  fi
  log_info "Installing Node.js ${NODE_MAJOR}.x"
  if ! retry curl -fsSL "https://deb.nodesource.com/setup_${NODE_MAJOR}.x" -o /tmp/nodesource_setup.sh; then
    log_error "Could not reach NodeSource setup script after retries."
    log_error "If this server is behind restrictive routing, set an HTTPS_PROXY env var and re-run:"
    log_error "  HTTPS_PROXY=http://<proxy-host>:<port> bash install.sh"
    exit 1
  fi
  bash /tmp/nodesource_setup.sh
  safe_apt_install nodejs
}

configure_npm_registry() {
  local registry
  registry="$(pick_npm_registry)"
  log_info "Using npm registry: ${registry}"
  npm config set registry "${registry}"
}

install_webserver_and_runtimes() {
  log_info "Installing Nginx, PHP-FPM (multiple versions), database engines"
  safe_apt_install nginx
  add-apt-repository -y ppa:ondrej/php >/dev/null 2>&1 || log_warn "ondrej/php PPA unavailable, using default Ubuntu PHP version only"

  # Multiple PHP-FPM versions are installed side-by-side (separate systemd units,
  # e.g. php8.1-fpm/php8.3-fpm) so each site can pick the version its app needs —
  # older WordPress plugins often need 7.4/8.0, Laravel 10+ needs 8.1+.
  local php_versions=("7.4" "8.0" "8.1" "8.2" "8.3")
  local php_installed=0
  for version in "${php_versions[@]}"; do
    if safe_apt_install \
      "php${version}-fpm" "php${version}-mysql" "php${version}-pgsql" \
      "php${version}-cli" "php${version}-curl" "php${version}-gd" \
      "php${version}-mbstring" "php${version}-xml" "php${version}-zip" \
      "php${version}-bcmath" "php${version}-intl"; then
      php_installed=1
    else
      log_warn "Could not install php${version}-fpm, skipping this version"
    fi
  done
  if [ "${php_installed}" -eq 0 ]; then
    log_warn "No PHP-FPM version installed successfully; PHP sites will not work until this is resolved"
  fi

  safe_apt_install mariadb-server postgresql
  safe_apt_install python3-venv python3-pip
}

install_dns_server() {
  # Authoritative DNS backing the panel's DNS section
  # (backend/src/system/dns/dns.service.ts). This server is
  # authoritative-only for domains hosted here — it must never act as an
  # open recursive resolver, so recursion is explicitly disabled below.
  log_info "Installing BIND9 (authoritative DNS server)"
  if ! safe_apt_install bind9 bind9utils bind9-dnsutils; then
    log_warn "Could not install bind9; the DNS panel section will be unavailable"
    return
  fi

  # Matches BIND_ZONES_DIR's default in backend/.env.example exactly, so the
  # panel works out of the box with zero .env overrides.
  mkdir -p /etc/bind/zones
  chown root:bind /etc/bind/zones
  chmod 755 /etc/bind/zones

  cat > /etc/bind/named.conf.options <<'EOF'
// Managed by Persia Panel installer — authoritative-only resolver.
// Recursion is disabled so this server can never be abused as an open
// resolver; it only answers for zones explicitly declared in
// named.conf.local (appended to at runtime by the panel's DNS section).
options {
	directory "/var/cache/bind";
	recursion no;
	allow-transfer { none; };
	dnssec-validation auto;
	listen-on-v6 { any; };
};
EOF

  # named.conf.local is intentionally NOT overwritten (only created if
  # missing) — SystemDnsService idempotently appends a `zone { ... };`
  # stanza per domain at runtime, the same append-not-replace idiom
  # NginxService uses for server blocks. Wiping this file on every
  # installer re-run would drop every domain already registered with bind.
  touch /etc/bind/named.conf.local

  # The bind9 package normally auto-generates /etc/bind/rndc.key on first
  # install, but guarantee it exists regardless — SystemDnsService shells
  # out to `rndc` directly and needs a working key to reload/reconfig.
  if [[ ! -f /etc/bind/rndc.key ]]; then
    log_info "Generating rndc key"
    if rndc-confgen -a -c /etc/bind/rndc.key >/dev/null 2>&1; then
      chown root:bind /etc/bind/rndc.key 2>/dev/null || true
      chmod 640 /etc/bind/rndc.key 2>/dev/null || true
    else
      log_warn "Could not generate rndc.key automatically; rndc-based reloads may fail"
    fi
  fi

  named-checkconf /etc/bind/named.conf 2>/dev/null \
    || log_warn "named.conf failed validation — check /etc/bind manually"

  systemctl enable --now named >/dev/null 2>&1 \
    || systemctl enable --now bind9 >/dev/null 2>&1 \
    || log_warn "Could not enable/start bind9 (named) service"

  local public_ip
  if public_ip="$(detect_public_ip)"; then
    log_ok "Detected public IP ${public_ip} — set SERVER_PUBLIC_IP=${public_ip} in backend/.env to auto-seed @/www A records for new domains"
  else
    log_warn "Could not auto-detect public IP; set SERVER_PUBLIC_IP manually in backend/.env if you want DNS auto-seeding"
  fi
}

install_mail_server() {
  # Postfix (delivery) + Dovecot (IMAP/POP3 + SASL auth) backing the panel's
  # Email section (backend/src/system/mail/mail.service.ts). Mailboxes are
  # virtual (not real Unix accounts), all owned by one dedicated "vmail"
  # system uid/gid — matches VMAIL_UID/VMAIL_GID defaults in
  # backend/.env.example so the panel works with zero .env overrides.
  log_info "Installing Postfix + Dovecot (virtual mailbox email hosting)"
  echo "postfix postfix/main_mailer_type string 'Internet Site'" | debconf-set-selections
  echo "postfix postfix/mailname string $(hostname -f 2>/dev/null || hostname)" | debconf-set-selections
  if ! safe_apt_install postfix; then
    log_warn "Could not install postfix; the Email panel section will be unavailable"
    return
  fi
  if ! safe_apt_install dovecot-core dovecot-imapd dovecot-pop3d; then
    log_warn "Could not install dovecot; the Email panel section will be unavailable"
    return
  fi

  if ! id -u vmail >/dev/null 2>&1; then
    log_info "Creating vmail system user (uid/gid 5000)"
    groupadd -g 5000 vmail 2>/dev/null || true
    useradd --system --uid 5000 --gid 5000 --home /var/mail/vhosts \
      --shell /usr/sbin/nologin vmail 2>/dev/null || true
  fi

  mkdir -p /var/mail/vhosts
  chown vmail:vmail /var/mail/vhosts
  chmod 750 /var/mail/vhosts

  # Pre-create empty, postmap'd virtual maps so Postfix doesn't refuse to
  # start referencing a hash: table with no backing .db file yet — the panel
  # appends real entries at runtime (SystemMailService), always followed by
  # its own `postmap` call, same "render + validate + reload" idiom as bind.
  touch /etc/postfix/vmail_domains /etc/postfix/vmail_mailbox
  postmap hash:/etc/postfix/vmail_domains
  postmap hash:/etc/postfix/vmail_mailbox

  touch /etc/dovecot/vmail_passwd
  chown root:dovecot /etc/dovecot/vmail_passwd 2>/dev/null || true
  chmod 640 /etc/dovecot/vmail_passwd

  postconf -e "virtual_mailbox_domains = hash:/etc/postfix/vmail_domains"
  postconf -e "virtual_mailbox_maps = hash:/etc/postfix/vmail_mailbox"
  postconf -e "virtual_mailbox_base = /var/mail/vhosts"
  postconf -e "virtual_minimum_uid = 5000"
  postconf -e "virtual_uid_maps = static:5000"
  postconf -e "virtual_gid_maps = static:5000"
  postconf -e "virtual_transport = virtual"
  postconf -e "smtpd_sasl_auth_enable = yes"
  postconf -e "smtpd_sasl_type = dovecot"
  postconf -e "smtpd_sasl_path = private/auth"
  postconf -e "smtpd_sasl_security_options = noanonymous"
  postconf -e "smtpd_relay_restrictions = permit_sasl_authenticated,permit_mynetworks,reject_unauth_destination"

  cat > /etc/dovecot/conf.d/99-persia-panel.conf <<'EOF'
# Managed by Persia Panel installer — do not edit manually. Virtual mailbox
# auth/storage backing system/mail/mail.service.ts: mailbox passwords live
# only in this passwd-file (never in Postgres, same invariant as the SSH
# tunnel key store), and Maildir storage is keyed by domain/localpart to
# match SystemMailService's on-disk layout exactly.
mail_location = maildir:/var/mail/vhosts/%d/%n

passdb {
  driver = passwd-file
  args = username_format=%u /etc/dovecot/vmail_passwd
}

userdb {
  driver = static
  args = uid=5000 gid=5000 home=/var/mail/vhosts/%d/%n
}

service auth {
  unix_listener /var/spool/postfix/private/auth {
    mode = 0660
    user = postfix
    group = postfix
  }
}

disable_plaintext_auth = no
EOF

  systemctl enable --now postfix >/dev/null 2>&1 || log_warn "Could not enable/start postfix service"
  systemctl enable --now dovecot >/dev/null 2>&1 || log_warn "Could not enable/start dovecot service"
  systemctl restart postfix >/dev/null 2>&1 || log_warn "Could not restart postfix after configuration"
  systemctl restart dovecot >/dev/null 2>&1 || log_warn "Could not restart dovecot after configuration"
}

install_ssl_tooling() {
  log_info "Installing acme.sh for SSL issuance"
  local ca
  ca="$(pick_acme_ca)"
  log_info "Selected ACME CA: ${ca}"
  if ! retry curl -fsSL https://get.acme.sh -o /tmp/acme-install.sh; then
    log_warn "Could not download acme.sh installer, skipping automatic SSL setup for now"
    return
  fi
  bash /tmp/acme-install.sh --home /opt/acme.sh --accountemail "admin@localhost" >/dev/null
  /opt/acme.sh/acme.sh --set-default-ca --server "${ca}" || true
}

configure_acme_webroot() {
  # Shared, nginx-served HTTP-01 challenge directory used by AcmeService
  # (backend/src/system/acme/acme.service.ts) regardless of a site's runtime
  # (PHP/Node/Python/static) or document-root permissions. Also pre-creates
  # the directory nginx.service.ts writes issued certificates into.
  log_info "Preparing ACME HTTP-01 webroot and SSL certificate directories"
  mkdir -p /var/www/acme-challenge
  chown -R www-data:www-data /var/www/acme-challenge
  chmod 755 /var/www/acme-challenge
  mkdir -p /etc/nginx/ssl
  chmod 700 /etc/nginx/ssl
}

install_security_tools() {
  # fail2ban backs the panel's "Security" section (system/security/fail2ban.service.ts)
  # — bans repeat-offender IPs at the OS level after failed SSH login attempts.
  # Never hard-fails the installer: a missing/failed fail2ban just means that
  # one panel feature reports "unavailable" rather than blocking setup.
  log_info "Installing fail2ban (SSH brute-force protection)"
  if ! safe_apt_install fail2ban; then
    log_warn "Could not install fail2ban; the Security panel section will be unavailable"
    return
  fi

  cat > /etc/fail2ban/jail.local <<'EOF'
# Managed by Persia Panel installer — safe to customize further, this file
# will not be overwritten by fail2ban package upgrades.
[DEFAULT]
bantime  = 1h
findtime = 10m
maxretry = 5

[sshd]
enabled = true
EOF

  systemctl enable --now fail2ban >/dev/null 2>&1 || log_warn "Could not enable/start fail2ban service"
}

configure_backups() {
  # Root-owned, non-world-readable: backup archives can contain full database
  # dumps and site source (including .env secrets), so keep this locked down
  # like SSL_CERT_DIR.
  log_info "Preparing backup storage directory"
  mkdir -p /var/backups/persia-panel
  chmod 700 /var/backups/persia-panel
}

create_panel_user() {
  if ! id -u "${PANEL_USER}" >/dev/null 2>&1; then
    log_info "Creating system user ${PANEL_USER}"
    useradd --system --home "${PANEL_DIR}" --shell /usr/sbin/nologin "${PANEL_USER}"
  fi
}

setup_firewall() {
  log_info "Configuring firewall (ufw)"
  ufw allow OpenSSH >/dev/null || true
  ufw allow 80/tcp >/dev/null || true
  ufw allow 443/tcp >/dev/null || true
  ufw allow 2087/tcp >/dev/null || true # panel UI port
  ufw allow 53/tcp >/dev/null || true   # DNS (bind9, TCP fallback/zone data)
  ufw allow 53/udp >/dev/null || true   # DNS (bind9)
  ufw allow 25/tcp >/dev/null || true   # SMTP (postfix, inbound mail)
  ufw allow 587/tcp >/dev/null || true  # SMTP submission (postfix, authenticated)
  ufw allow 143/tcp >/dev/null || true  # IMAP (dovecot)
  ufw allow 993/tcp >/dev/null || true  # IMAPS (dovecot)
  ufw allow 110/tcp >/dev/null || true  # POP3 (dovecot)
  ufw allow 995/tcp >/dev/null || true  # POP3S (dovecot)
  ufw --force enable >/dev/null || true
}

main() {
  require_root
  check_os
  preflight_network
  install_base_packages
  install_nodejs
  configure_npm_registry
  install_webserver_and_runtimes
  install_dns_server
  install_mail_server
  install_ssl_tooling
  configure_acme_webroot
  install_security_tools
  configure_backups
  create_panel_user
  setup_firewall
  log_ok "Base system prepared. Deploy Persia Panel app files to ${PANEL_DIR} next."
}

main "$@"
