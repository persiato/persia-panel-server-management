"use client";

import { useEffect, useState, FormEvent } from "react";
import { api, ApiError, AppDefinition, Domain, InstalledApp } from "@/lib/api";

const STATUS_LABELS: Record<InstalledApp["status"], string> = {
  INSTALLING: "در حال نصب",
  COMPLETE: "نصب شده",
  FAILED: "ناموفق",
};

const STATUS_STYLES: Record<InstalledApp["status"], string> = {
  INSTALLING: "bg-amber-50 text-amber-700",
  COMPLETE: "bg-emerald-50 text-emerald-700",
  FAILED: "bg-red-50 text-red-600",
};

export default function AppsPage() {
  const [catalog, setCatalog] = useState<AppDefinition[]>([]);
  const [installed, setInstalled] = useState<InstalledApp[]>([]);
  const [domains, setDomains] = useState<Domain[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const [selectedApp, setSelectedApp] = useState<AppDefinition | null>(null);
  const [domainId, setDomainId] = useState("");
  const [targetPath, setTargetPath] = useState("");
  const [installing, setInstalling] = useState(false);

  function fetchData() {
    return Promise.all([api.listAppCatalog(), api.listInstalledApps(), api.listDomains()])
      .then(([apps, ia, doms]) => {
        setCatalog(apps);
        setInstalled(ia);
        setDomains(doms);
        if (!domainId && doms.length > 0) setDomainId(doms[0].id);
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : "خطا در دریافت اطلاعات"))
      .finally(() => setLoading(false));
  }

  function reload() {
    setLoading(true);
    fetchData();
  }

  useEffect(() => {
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function openInstallForm(app: AppDefinition) {
    setSelectedApp(app);
    setTargetPath(app.id === "wordpress" ? "" : app.id);
    setNotice(null);
    setError(null);
  }

  async function handleInstall(e: FormEvent) {
    e.preventDefault();
    if (!selectedApp || !domainId) return;
    setInstalling(true);
    setError(null);
    setNotice(null);
    try {
      await api.installApp({ domainId, appId: selectedApp.id, targetPath: targetPath || undefined });
      setNotice(`نصب ${selectedApp.name} با موفقیت انجام شد.`);
      setSelectedApp(null);
      reload();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "خطا در نصب برنامه");
    } finally {
      setInstalling(false);
    }
  }

  async function handleRemove(id: string) {
    if (!confirm("این برنامه حذف شود؟ فایل‌ها و دیتابیس اختصاصی آن (در صورت وجود) نیز حذف می‌شوند.")) return;
    setBusyId(id);
    setError(null);
    try {
      await api.removeInstalledApp(id);
      reload();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "خطا در حذف برنامه");
    } finally {
      setBusyId(null);
    }
  }

  function appName(appId: string): string {
    return catalog.find((a) => a.id === appId)?.name ?? appId;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">نصب یک‌کلیکی برنامه‌ها</h1>
      </div>

      {domains.length === 0 && !loading && (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-700">
          ابتدا باید حداقل یک دامنه ایجاد کنید.
        </p>
      )}

      {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}
      {notice && (
        <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{notice}</p>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {catalog.map((app) => (
          <div
            key={app.id}
            className="flex flex-col justify-between rounded-xl border border-slate-200 bg-white p-5 shadow-sm"
          >
            <div>
              <div className="flex items-center justify-between">
                <h2 className="font-bold">{app.name}</h2>
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-500" dir="ltr">
                  v{app.version}
                </span>
              </div>
              <p className="mt-2 text-sm text-slate-500">{app.description}</p>
              {app.requiresDatabase && (
                <span className="mt-3 inline-block rounded-full bg-indigo-50 px-2 py-0.5 text-[11px] text-indigo-600">
                  نیازمند دیتابیس اختصاصی
                </span>
              )}
            </div>
            <button
              onClick={() => openInstallForm(app)}
              disabled={domains.length === 0}
              className="mt-4 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-60"
            >
              نصب
            </button>
          </div>
        ))}
      </div>

      {selectedApp && (
        <form
          onSubmit={handleInstall}
          className="space-y-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm"
        >
          <h3 className="font-bold">نصب {selectedApp.name}</h3>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">دامنه</label>
            <select
              value={domainId}
              onChange={(e) => setDomainId(e.target.value)}
              className="w-full max-w-sm rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
            >
              {domains.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">
              مسیر نصب (نسبت به ریشه سایت)
            </label>
            <input
              value={targetPath}
              onChange={(e) => setTargetPath(e.target.value)}
              placeholder="مثلا phpmyadmin — خالی یعنی ریشه سایت"
              className="w-full max-w-sm rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
              dir="ltr"
            />
          </div>
          <div className="flex gap-3">
            <button
              type="submit"
              disabled={installing}
              className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-60"
            >
              {installing ? "در حال نصب..." : "شروع نصب"}
            </button>
            <button
              type="button"
              onClick={() => setSelectedApp(null)}
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
            >
              انصراف
            </button>
          </div>
        </form>
      )}

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full text-right text-sm">
          <thead className="bg-slate-50 text-slate-500">
            <tr>
              <th className="px-4 py-3 font-medium">برنامه</th>
              <th className="px-4 py-3 font-medium">دامنه</th>
              <th className="px-4 py-3 font-medium">مسیر</th>
              <th className="px-4 py-3 font-medium">وضعیت</th>
              <th className="px-4 py-3 font-medium">تاریخ</th>
              <th className="px-4 py-3 font-medium"></th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-slate-400">
                  در حال بارگذاری...
                </td>
              </tr>
            )}
            {!loading && installed.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-slate-400">
                  هیچ برنامه‌ای نصب نشده است.
                </td>
              </tr>
            )}
            {installed.map((ia) => (
              <tr key={ia.id} className="border-t border-slate-100">
                <td className="px-4 py-3 font-medium">{appName(ia.appId)}</td>
                <td className="px-4 py-3" dir="ltr">
                  {ia.domain.name}
                </td>
                <td className="px-4 py-3 text-slate-500" dir="ltr">
                  /{ia.targetPath}
                </td>
                <td className="px-4 py-3">
                  <span className={`rounded-full px-2 py-0.5 text-xs ${STATUS_STYLES[ia.status]}`}>
                    {STATUS_LABELS[ia.status]}
                  </span>
                  {ia.status === "FAILED" && ia.error && (
                    <p className="mt-1 max-w-xs truncate text-[11px] text-red-400" title={ia.error}>
                      {ia.error}
                    </p>
                  )}
                </td>
                <td className="px-4 py-3 text-slate-500">
                  {new Date(ia.createdAt).toLocaleString("fa-IR")}
                </td>
                <td className="flex justify-end px-4 py-3 text-left">
                  <button
                    onClick={() => handleRemove(ia.id)}
                    disabled={busyId === ia.id}
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
    </div>
  );
}
