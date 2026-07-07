"use client";

import { useEffect, useState } from "react";
import { api, ApiError, FirewallStatus, JailStatus, getStoredUser } from "@/lib/api";

function BanIpForm({
  jail,
  onBan,
  busy,
}: {
  jail: string;
  onBan: (jail: string, ip: string) => Promise<void>;
  busy: boolean;
}) {
  const [ip, setIp] = useState("");

  return (
    <div className="flex items-center gap-2">
      <input
        value={ip}
        onChange={(e) => setIp(e.target.value)}
        placeholder="IP آدرس"
        dir="ltr"
        className="w-40 rounded-lg border border-slate-300 px-2 py-1 text-xs outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
      />
      <button
        onClick={() => ip && onBan(jail, ip).then(() => setIp(""))}
        disabled={busy || !ip}
        className="rounded-lg bg-red-600 px-3 py-1 text-xs font-medium text-white hover:bg-red-700 disabled:opacity-50"
      >
        بن کردن
      </button>
    </div>
  );
}

export default function SecurityPage() {
  const [authorized] = useState(() => {
    const user = getStoredUser();
    return !!user && user.role === "ADMIN";
  });
  const [firewall, setFirewall] = useState<FirewallStatus | null>(null);
  const [jails, setJails] = useState<JailStatus[]>([]);
  const [loading, setLoading] = useState(authorized);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [action, setAction] = useState<"allow" | "deny">("allow");
  const [port, setPort] = useState("");
  const [proto, setProto] = useState<"tcp" | "udp">("tcp");
  const [from, setFrom] = useState("");

  function fetchData() {
    return Promise.all([api.getFirewallRules(), api.getSecurityStatus()])
      .then(([fw, jl]) => {
        setFirewall(fw);
        setJails(jl);
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : "خطا در دریافت اطلاعات"))
      .finally(() => setLoading(false));
  }

  function reload() {
    setLoading(true);
    fetchData();
  }

  useEffect(() => {
    if (!authorized) return;
    fetchData();
  }, [authorized]);

  async function handleAddRule() {
    if (!port) return;
    setBusy(true);
    setError(null);
    try {
      const fw = await api.addFirewallRule({
        action,
        port: Number(port),
        proto,
        from: from || undefined,
      });
      setFirewall(fw);
      setPort("");
      setFrom("");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "خطا در افزودن قانون فایروال");
    } finally {
      setBusy(false);
    }
  }

  async function handleDeleteRule(number: number) {
    if (!confirm("این قانون فایروال حذف شود؟")) return;
    setBusy(true);
    setError(null);
    try {
      const fw = await api.deleteFirewallRule(number);
      setFirewall(fw);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "خطا در حذف قانون فایروال");
    } finally {
      setBusy(false);
    }
  }

  async function handleBan(jail: string, ip: string) {
    setBusy(true);
    setError(null);
    try {
      const jl = await api.banIp(jail, ip);
      setJails(jl);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "خطا در بن کردن IP");
    } finally {
      setBusy(false);
    }
  }

  async function handleUnban(jail: string, ip: string) {
    if (!confirm(`رفع بن ${ip}؟`)) return;
    setBusy(true);
    setError(null);
    try {
      const jl = await api.unbanIp(jail, ip);
      setJails(jl);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "خطا در رفع بن IP");
    } finally {
      setBusy(false);
    }
  }

  if (!authorized) {
    return (
      <div className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-700">
        این بخش تنها برای مدیر سیستم قابل دسترسی است.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">امنیت و فایروال</h1>
      </div>

      {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}

      {loading && <p className="text-sm text-slate-400">در حال بارگذاری...</p>}

      {!loading && (
        <>
          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">فایروال (ufw)</h2>
              {firewall && (
                <span
                  className={`rounded-full px-2 py-0.5 text-xs ${
                    firewall.active ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-600"
                  }`}
                >
                  {firewall.active ? "فعال" : "غیرفعال"}
                </span>
              )}
            </div>

            <div className="flex flex-wrap items-end gap-3 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">عملیات</label>
                <select
                  value={action}
                  onChange={(e) => setAction(e.target.value as "allow" | "deny")}
                  className="rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
                >
                  <option value="allow">اجازه (allow)</option>
                  <option value="deny">مسدود (deny)</option>
                </select>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">پورت</label>
                <input
                  value={port}
                  onChange={(e) => setPort(e.target.value)}
                  type="number"
                  dir="ltr"
                  className="w-28 rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">پروتکل</label>
                <select
                  value={proto}
                  onChange={(e) => setProto(e.target.value as "tcp" | "udp")}
                  className="rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
                >
                  <option value="tcp">TCP</option>
                  <option value="udp">UDP</option>
                </select>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">مبدأ (اختیاری)</label>
                <input
                  value={from}
                  onChange={(e) => setFrom(e.target.value)}
                  placeholder="مثلاً 1.2.3.4/32"
                  dir="ltr"
                  className="w-44 rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
                />
              </div>
              <button
                onClick={handleAddRule}
                disabled={busy || !port}
                className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-60"
              >
                + افزودن قانون
              </button>
            </div>

            <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
              <table className="w-full text-right text-sm">
                <thead className="bg-slate-50 text-slate-500">
                  <tr>
                    <th className="px-4 py-3 font-medium">مقصد</th>
                    <th className="px-4 py-3 font-medium">عملیات</th>
                    <th className="px-4 py-3 font-medium">مبدأ</th>
                    <th className="px-4 py-3 font-medium"></th>
                  </tr>
                </thead>
                <tbody>
                  {(!firewall || firewall.rules.length === 0) && (
                    <tr>
                      <td colSpan={4} className="px-4 py-6 text-center text-slate-400">
                        هیچ قانونی ثبت نشده است.
                      </td>
                    </tr>
                  )}
                  {firewall?.rules.map((r) => (
                    <tr key={r.number} className="border-t border-slate-100">
                      <td className="px-4 py-3" dir="ltr">
                        {r.to}
                      </td>
                      <td className="px-4 py-3" dir="ltr">
                        {r.action}
                      </td>
                      <td className="px-4 py-3" dir="ltr">
                        {r.from}
                      </td>
                      <td className="px-4 py-3 text-left">
                        <button
                          onClick={() => handleDeleteRule(r.number)}
                          disabled={busy}
                          className="text-xs font-medium text-red-600 hover:underline disabled:opacity-50"
                        >
                          حذف
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-semibold">fail2ban</h2>
            {jails.length === 0 && (
              <p className="rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-400">
                هیچ jail فعالی یافت نشد (ممکن است fail2ban نصب نباشد).
              </p>
            )}
            <div className="grid gap-4 md:grid-cols-2">
              {jails.map((j) => (
                <div key={j.name} className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
                  <div className="mb-3 flex items-center justify-between">
                    <h3 className="font-semibold" dir="ltr">
                      {j.name}
                    </h3>
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
                      {j.currentlyBanned} بن فعال
                    </span>
                  </div>
                  <div className="mb-3 grid grid-cols-2 gap-2 text-xs text-slate-500">
                    <span>تلاش‌های ناموفق فعلی: {j.currentlyFailed}</span>
                    <span>کل تلاش‌های ناموفق: {j.totalFailed}</span>
                    <span>بن‌های فعلی: {j.currentlyBanned}</span>
                    <span>کل بن‌ها: {j.totalBanned}</span>
                  </div>
                  {j.bannedIps.length > 0 && (
                    <ul className="mb-3 space-y-1">
                      {j.bannedIps.map((ip) => (
                        <li
                          key={ip}
                          className="flex items-center justify-between rounded-lg bg-slate-50 px-2 py-1 text-xs"
                        >
                          <span dir="ltr">{ip}</span>
                          <button
                            onClick={() => handleUnban(j.name, ip)}
                            disabled={busy}
                            className="font-medium text-indigo-600 hover:underline disabled:opacity-50"
                          >
                            رفع بن
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                  <BanIpForm jail={j.name} onBan={handleBan} busy={busy} />
                </div>
              ))}
            </div>
          </section>

          <button
            onClick={reload}
            className="text-xs font-medium text-indigo-600 hover:underline"
          >
            بازخوانی اطلاعات
          </button>
        </>
      )}
    </div>
  );
}
