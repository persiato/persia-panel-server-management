"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

interface NavItem {
  href: string;
  label: string;
  icon: string;
  enabled: boolean;
}

const NAV_ITEMS: NavItem[] = [
  { href: "/dashboard", label: "داشبورد", icon: "🏠", enabled: true },
  { href: "/domains", label: "دامنه‌ها و وب‌سایت‌ها", icon: "🌐", enabled: true },
  { href: "/files", label: "فایل منیجر", icon: "🗂️", enabled: true },
  { href: "/databases", label: "دیتابیس‌ها", icon: "🗄️", enabled: true },
  { href: "/cron-jobs", label: "کرون جاب‌ها", icon: "⏱️", enabled: true },
  { href: "/apps", label: "نصب یک‌کلیکی", icon: "📦", enabled: true },
  { href: "/email", label: "ایمیل", icon: "✉️", enabled: true },
  { href: "/dns", label: "DNS", icon: "🧭", enabled: true },
  { href: "/ssl", label: "SSL / گواهی امنیتی", icon: "🔒", enabled: false },
  { href: "/backups", label: "بک‌آپ", icon: "💾", enabled: true },
  { href: "/security", label: "امنیت و فایروال", icon: "🛡️", enabled: true },
  { href: "/connectivity", label: "اتصال جایگزین (SSH)", icon: "🔌", enabled: true },
  { href: "/api-keys", label: "کلیدهای API", icon: "🔑", enabled: true },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="flex h-screen w-64 shrink-0 flex-col border-l border-slate-200 bg-white">
      <div className="flex items-center gap-2 border-b border-slate-200 px-5 py-4">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-indigo-600 font-bold text-white">
          P
        </div>
        <span className="text-lg font-bold">پرشیا پنل</span>
      </div>

      <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4">
        {NAV_ITEMS.map((item) => {
          const active = pathname === item.href;
          if (!item.enabled) {
            return (
              <div
                key={item.href}
                className="flex cursor-not-allowed items-center gap-3 rounded-lg px-3 py-2 text-sm text-slate-400"
                title="به‌زودی"
              >
                <span>{item.icon}</span>
                <span className="flex-1">{item.label}</span>
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px]">
                  به‌زودی
                </span>
              </div>
            );
          }
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition ${
                active
                  ? "bg-indigo-50 text-indigo-700"
                  : "text-slate-600 hover:bg-slate-100"
              }`}
            >
              <span>{item.icon}</span>
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
