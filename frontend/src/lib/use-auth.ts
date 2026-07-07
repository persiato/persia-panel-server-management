import { useSyncExternalStore } from "react";

function subscribe(callback: () => void) {
  window.addEventListener("storage", callback);
  return () => window.removeEventListener("storage", callback);
}

function getTokenSnapshot() {
  return window.localStorage.getItem("pp_token");
}

function getTokenServerSnapshot() {
  return null;
}

// Client-only auth token, synced with localStorage without causing hydration
// mismatches or effect-based setState cascades.
export function useAuthToken() {
  return useSyncExternalStore(subscribe, getTokenSnapshot, getTokenServerSnapshot);
}

function getUsernameSnapshot() {
  const raw = window.localStorage.getItem("pp_user");
  if (!raw) return "";
  try {
    return (JSON.parse(raw) as { username?: string }).username ?? "";
  } catch {
    return "";
  }
}

function getUsernameServerSnapshot() {
  return "";
}

export function useAuthUsername() {
  return useSyncExternalStore(subscribe, getUsernameSnapshot, getUsernameServerSnapshot);
}
