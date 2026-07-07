"use client";

import { useEffect, useState } from "react";
import { api, ApiError, SshTunnelStatus, getStoredUser } from "@/lib/api";

export default function ConnectivityPage() {
  const [authorized] = useState(() => {
    const user = getStoredUser();
    return !!user && user.role === "ADMIN";
  });
  const [status, setStatus] = useState<SshTunnelStatus | null>(null);
  const [loading, setLoading] = useState(authorized);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [testResult, setTestResult] = useState<string | null>(null);

  const [host, setHost] = useState("");
  const [port, setPort] = useState("22");
  const [username, setUsername] = useState("");
  const [localProxyPort, setLocalProxyPort] = useState("1080");
  const [privateKey, setPrivateKey] = useState("");

  function fetchStatus() {
    return api
      .getSshTunnelStatus()
      .then((s) => {
        setStatus(s);
        setHost(s.host ?? "");
        setPort(s.port ? String(s.port) : "22");
        setUsername(s.username ?? "");
        setLocalProxyPort(s.localProxyPort ? String(s.localProxyPort) : "1080");
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : "خطا در دریافت وضعیت اتصال"))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    if (!authorized) return;
    fetchStatus();
  }, [authorized]);

  async function handleSave(enabled: boolean) {
    if (!host || !username) return;
    setBusy(true);
    setError(null);
    setTestResult(null);
    try {
      const s = await api.saveSshTunnelConfig({
        host,
        port: port ? Number(port) : undefined,
        username,
        localProxyPort: localProxyPort ? Number(localProxyPort) : undefined,
        privateKey: privateKey || undefined,
        enabled,
      });
      setStatus(s);
      setPrivateKey("");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "خطا در ذخیره تنظیمات تونل SSH");
    } finally {
      setBusy(false);
    }
  }

  async function handleRemove() {
    if (!confirm("تونل SSH و کلید خصوصی آن حذف شود؟")) return;
    setBusy(true);
    setError(null);
    setTestResult(null);
    try {
      await api.removeSshTunnel();
      setHost("");
      setPort("22");
      setUsername("");
      setLocalProxyPort("1080");
      setPrivateKey("");
      await fetchStatus();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "خطا در حذف تونل SSH");
    } finally {
      setBusy(false);
    }
  }

  async function handleTest() {
    setBusy(true);
    setError(null);
    setTestResult(null);
    try {
      const result = await api.testSshTunnel();
      setTestResult(result.publicIp);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "تست اتصال ناموفق بود");
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
        <h1 className="text-2xl font-bold">اتصال جایگزین (تونل SSH)</h1>
      </div>

      <p className="rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-500">
        در صورتی که اتصال مستقیم سرور به برخی مقصدها (مثلاً به‌دلیل تحریم) مسدود یا ناپایدار باشد،
        می‌توانید یک تونل SSH به یک سرور واسط خارج از ایران تعریف کنید. این تونل به‌صورت یک پراکسی
        SOCKS5 محلی در دسترس قرار می‌گیرد و به‌عنوان سرویس systemd به‌صورت خودکار اجرا و در صورت قطعی
        دوباره وصل می‌شود.
      </p>

      {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}
      {testResult && (
        <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700" dir="ltr">
          اتصال موفق — IP عمومی مشاهده‌شده از طریق تونل: {testResult}
        </p>
      )}

      {loading && <p className="text-sm text-slate-400">در حال بارگذاری...</p>}

      {!loading && (
        <>
          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">وضعیت</h2>
              {status && (
                <div className="flex gap-2">
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs ${
                      status.configured ? "bg-indigo-50 text-indigo-700" : "bg-slate-100 text-slate-500"
                    }`}
                  >
                    {status.configured ? "پیکربندی‌شده" : "پیکربندی نشده"}
                  </span>
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs ${
                      status.active ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-600"
                    }`}
                  >
                    {status.active ? "فعال" : "غیرفعال"}
                  </span>
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs ${
                      status.enabled ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"
                    }`}
                  >
                    {status.enabled ? "اجرای خودکار: روشن" : "اجرای خودکار: خاموش"}
                  </span>
                </div>
              )}
            </div>
            {status?.lastError && (
              <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600" dir="ltr">
                آخرین خطا: {status.lastError}
              </p>
            )}
          </section>

          <section className="space-y-3 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-lg font-semibold">پیکربندی تونل</h2>
            <div className="grid gap-3 md:grid-cols-2">
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">هاست سرور واسط</label>
                <input
                  value={host}
                  onChange={(e) => setHost(e.target.value)}
                  placeholder="relay.example.com"
                  dir="ltr"
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">پورت SSH</label>
                <input
                  value={port}
                  onChange={(e) => setPort(e.target.value)}
                  type="number"
                  dir="ltr"
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">نام کاربری</label>
                <input
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="ubuntu"
                  dir="ltr"
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">پورت پراکسی محلی (SOCKS5)</label>
                <input
                  value={localProxyPort}
                  onChange={(e) => setLocalProxyPort(e.target.value)}
                  type="number"
                  dir="ltr"
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
                />
              </div>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">
                کلید خصوصی SSH {status?.hasPrivateKey && "(در صورت خالی‌ماندن، کلید قبلی حفظ می‌شود)"}
              </label>
              <textarea
                value={privateKey}
                onChange={(e) => setPrivateKey(e.target.value)}
                placeholder="-----BEGIN OPENSSH PRIVATE KEY-----"
                dir="ltr"
                rows={6}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-xs outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
              />
              <p className="mt-1 text-xs text-slate-400">
                فقط احراز هویت مبتنی بر کلید پشتیبانی می‌شود. خود کلید هرگز در پایگاه‌داده ذخیره
                نمی‌شود؛ تنها روی دیسک با دسترسی محدود (۰۶۰۰) نگهداری می‌شود.
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => handleSave(true)}
                disabled={busy || !host || !username}
                className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-60"
              >
                ذخیره و اتصال
              </button>
              <button
                onClick={() => handleSave(false)}
                disabled={busy || !host || !username}
                className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60"
              >
                فقط ذخیره (بدون اتصال)
              </button>
              {status?.configured && (
                <>
                  <button
                    onClick={handleTest}
                    disabled={busy}
                    className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60"
                  >
                    تست اتصال
                  </button>
                  <button
                    onClick={handleRemove}
                    disabled={busy}
                    className="rounded-lg bg-red-50 px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-100 disabled:opacity-60"
                  >
                    حذف تونل
                  </button>
                </>
              )}
            </div>
          </section>

          <button
            onClick={() => {
              setLoading(true);
              fetchStatus();
            }}
            className="text-xs font-medium text-indigo-600 hover:underline"
          >
            بازخوانی اطلاعات
          </button>
        </>
      )}
    </div>
  );
}
