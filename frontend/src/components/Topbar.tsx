"use client";

import { useRouter } from "next/navigation";
import { clearToken } from "@/lib/api";
import { useAuthUsername } from "@/lib/use-auth";

export function Topbar() {
  const router = useRouter();
  const username = useAuthUsername();

  function handleLogout() {
    clearToken();
    router.push("/login");
  }

  return (
    <header className="flex h-16 shrink-0 items-center justify-between border-b border-slate-200 bg-white px-6">
      <div />
      <div className="flex items-center gap-4">
        <span className="text-sm text-slate-600">خوش آمدید، {username}</span>
        <button
          onClick={handleLogout}
          className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-600 transition hover:bg-slate-50"
        >
          خروج
        </button>
      </div>
    </header>
  );
}
