"use client";

import { useEffect, useState } from "react";
import { api, Domain } from "@/lib/api";

export default function DashboardPage() {
  const [domains, setDomains] = useState<Domain[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .listDomains()
      .then(setDomains)
      .catch(() => setDomains([]))
      .finally(() => setLoading(false));
  }, []);

  const stats = [
    { label: "دامنه‌ها", value: domains.length },
    { label: "سایت‌های فعال", value: domains.filter((d) => !d.isSuspended).length },
    { label: "دارای SSL", value: domains.filter((d) => d.sslEnabled).length },
  ];

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">داشبورد</h1>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {stats.map((s) => (
          <div key={s.label} className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-sm text-slate-500">{s.label}</p>
            <p className="mt-1 text-3xl font-bold text-indigo-600">
              {loading ? "…" : s.value}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
