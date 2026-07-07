"use client";

import { useEffect, useState, FormEvent } from "react";
import { api, ApiError, Domain } from "@/lib/api";

const RUNTIME_LABELS: Record<Domain["runtime"], string> = {
  STATIC: "استاتیک (HTML)",
  PHP: "PHP (وردپرس، لاراول و ...)",
  NODE: "Node.js",
  PYTHON: "Python",
};

const PHP_VERSIONS = ["8.3", "8.2", "8.1", "8.0", "7.4"];

export default function DomainsPage() {
  const [domains, setDomains] = useState<Domain[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);

  const [name, setName] = useState("");
  const [runtime, setRuntime] = useState<Domain["runtime"]>("STATIC");
  const [phpVersion, setPhpVersion] = useState("8.3");
  const [publicSubdir, setPublicSubdir] = useState("");
  const [appEntryPoint, setAppEntryPoint] = useState("");
  const [appPort, setAppPort] = useState("3000");
  const [submitting, setSubmitting] = useState(false);
  const [sslBusyId, setSslBusyId] = useState<string | null>(null);

  function fetchDomains() {
    return api
      .listDomains()
      .then(setDomains)
      .catch((err) => setError(err instanceof ApiError ? err.message : "خطا در دریافت اطلاعات"))
      .finally(() => setLoading(false));
  }

  function reload() {
    setLoading(true);
    fetchDomains();
  }

  useEffect(() => {
    fetchDomains();
  }, []);

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await api.createDomain({
        name,
        runtime,
        ...(runtime === "PHP" && {
          phpVersion,
          publicSubdir: publicSubdir.trim() || undefined,
        }),
        ...((runtime === "NODE" || runtime === "PYTHON") && {
          appEntryPoint,
          appPort: Number(appPort),
        }),
      });
      setName("");
      setRuntime("STATIC");
      setPhpVersion("8.3");
      setPublicSubdir("");
      setAppEntryPoint("");
      setAppPort("3000");
      setShowForm(false);
      reload();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "خطا در ایجاد دامنه");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("این دامنه حذف شود؟ این عملیات غیرقابل بازگشت است.")) return;
    try {
      await api.deleteDomain(id);
      reload();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "خطا در حذف دامنه");
    }
  }

  async function handleIssueSsl(id: string) {
    setSslBusyId(id);
    setError(null);
    try {
      await api.issueSsl(id);
      reload();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "خطا در صدور گواهی SSL");
    } finally {
      setSslBusyId(null);
    }
  }

  async function handleRemoveSsl(id: string) {
    if (!confirm("SSL این دامنه غیرفعال شود؟")) return;
    setSslBusyId(id);
    setError(null);
    try {
      await api.removeSsl(id);
      reload();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "خطا در غیرفعال‌سازی SSL");
    } finally {
      setSslBusyId(null);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">دامنه‌ها و وب‌سایت‌ها</h1>
        <button
          onClick={() => setShowForm((v) => !v)}
          className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700"
        >
          {showForm ? "انصراف" : "+ افزودن دامنه"}
        </button>
      </div>

      {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}

      {showForm && (
        <form
          onSubmit={handleCreate}
          className="space-y-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm"
        >
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">نام دامنه</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="example.com"
              required
              className="w-full max-w-sm rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
              dir="ltr"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">نوع اجرا</label>
            <select
              value={runtime}
              onChange={(e) => setRuntime(e.target.value as Domain["runtime"])}
              className="w-full max-w-sm rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
            >
              {Object.entries(RUNTIME_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>

          {runtime === "PHP" && (
            <>
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">نسخه PHP</label>
                <select
                  value={phpVersion}
                  onChange={(e) => setPhpVersion(e.target.value)}
                  className="w-full max-w-sm rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
                  dir="ltr"
                >
                  {PHP_VERSIONS.map((v) => (
                    <option key={v} value={v}>
                      PHP {v}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">
                  پوشه عمومی (اختیاری)
                </label>
                <input
                  value={publicSubdir}
                  onChange={(e) => setPublicSubdir(e.target.value)}
                  placeholder="public"
                  className="w-full max-w-sm rounded-lg border border-slate-300 px-3 py-2 font-mono text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
                  dir="ltr"
                />
                <p className="mt-1 text-xs text-slate-400">
                  برای پروژه‌های لاراول مقدار «public» را وارد کنید. برای وردپرس معمولی خالی بگذارید.
                </p>
              </div>
            </>
          )}

          {(runtime === "NODE" || runtime === "PYTHON") && (
            <>
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">فایل اجرایی</label>
                <input
                  value={appEntryPoint}
                  onChange={(e) => setAppEntryPoint(e.target.value)}
                  placeholder={runtime === "NODE" ? "server.js" : "app.py"}
                  required
                  className="w-full max-w-sm rounded-lg border border-slate-300 px-3 py-2 font-mono text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
                  dir="ltr"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">پورت</label>
                <input
                  value={appPort}
                  onChange={(e) => setAppPort(e.target.value)}
                  type="number"
                  min={1}
                  required
                  className="w-full max-w-[10rem] rounded-lg border border-slate-300 px-3 py-2 font-mono text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
                  dir="ltr"
                />
              </div>
            </>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-60"
          >
            {submitting ? "در حال ایجاد..." : "ایجاد دامنه"}
          </button>
        </form>
      )}

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full text-right text-sm">
          <thead className="bg-slate-50 text-slate-500">
            <tr>
              <th className="px-4 py-3 font-medium">دامنه</th>
              <th className="px-4 py-3 font-medium">نوع</th>
              <th className="px-4 py-3 font-medium">SSL</th>
              <th className="px-4 py-3 font-medium">وضعیت</th>
              <th className="px-4 py-3 font-medium"></th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-slate-400">
                  در حال بارگذاری...
                </td>
              </tr>
            )}
            {!loading && domains.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-slate-400">
                  هیچ دامنه‌ای ثبت نشده است.
                </td>
              </tr>
            )}
            {domains.map((d) => (
              <tr key={d.id} className="border-t border-slate-100">
                <td className="px-4 py-3 font-medium" dir="ltr">
                  {d.name}
                </td>
                <td className="px-4 py-3">
                  {RUNTIME_LABELS[d.runtime]}
                  {d.runtime === "PHP" && d.phpVersion && (
                    <span className="mr-1 text-xs text-slate-400" dir="ltr">
                      ({d.phpVersion}
                      {d.publicSubdir ? `, /${d.publicSubdir}` : ""})
                    </span>
                  )}
                </td>
                <td className="px-4 py-3">
                  <div className="flex flex-col items-start gap-1">
                    {d.sslEnabled ? (
                      <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs text-emerald-700">
                        فعال
                      </span>
                    ) : (
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-500">
                        غیرفعال
                      </span>
                    )}
                    {d.sslEnabled && d.sslExpiresAt && (
                      <span className="text-[11px] text-slate-400" dir="ltr">
                        تا {new Date(d.sslExpiresAt).toLocaleDateString("fa-IR")}
                      </span>
                    )}
                    <button
                      onClick={() =>
                        d.sslEnabled ? handleRemoveSsl(d.id) : handleIssueSsl(d.id)
                      }
                      disabled={sslBusyId === d.id}
                      className="text-[11px] font-medium text-indigo-600 hover:underline disabled:opacity-50"
                    >
                      {sslBusyId === d.id
                        ? "در حال انجام..."
                        : d.sslEnabled
                          ? "غیرفعال کردن SSL"
                          : "فعال‌سازی SSL"}
                    </button>
                  </div>
                </td>
                <td className="px-4 py-3">
                  {d.isSuspended ? (
                    <span className="rounded-full bg-red-50 px-2 py-0.5 text-xs text-red-600">
                      معلق
                    </span>
                  ) : (
                    <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs text-emerald-700">
                      فعال
                    </span>
                  )}
                </td>
                <td className="px-4 py-3 text-left">
                  <button
                    onClick={() => handleDelete(d.id)}
                    className="text-xs font-medium text-red-600 hover:underline"
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
