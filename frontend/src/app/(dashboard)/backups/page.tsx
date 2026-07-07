"use client";

import { useEffect, useState } from "react";
import { api, ApiError, Backup, Domain } from "@/lib/api";

const STATUS_LABELS: Record<Backup["status"], string> = {
  PENDING: "در حال ایجاد",
  COMPLETE: "کامل",
  FAILED: "ناموفق",
};

const STATUS_STYLES: Record<Backup["status"], string> = {
  PENDING: "bg-amber-50 text-amber-700",
  COMPLETE: "bg-emerald-50 text-emerald-700",
  FAILED: "bg-red-50 text-red-600",
};

function formatSize(bytes: number): string {
  if (!bytes) return "-";
  const units = ["بایت", "کیلوبایت", "مگابایت", "گیگابایت"];
  let value = bytes;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex++;
  }
  return `${value.toFixed(1)} ${units[unitIndex]}`;
}

export default function BackupsPage() {
  const [backups, setBackups] = useState<Backup[]>([]);
  const [domains, setDomains] = useState<Domain[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [domainId, setDomainId] = useState("");
  const [creating, setCreating] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  function fetchData() {
    return Promise.all([api.listBackups(), api.listDomains()])
      .then(([bks, doms]) => {
        setBackups(bks);
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

  async function handleCreate() {
    if (!domainId) return;
    setCreating(true);
    setError(null);
    try {
      await api.createBackup(domainId);
      reload();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "خطا در ایجاد بک‌آپ");
    } finally {
      setCreating(false);
    }
  }

  async function handleRestore(id: string) {
    if (!confirm("این بک‌آپ روی وب‌سایت بازگردانی شود؟ فایل‌ها و دیتابیس‌های فعلی جایگزین می‌شوند.")) return;
    setBusyId(id);
    setError(null);
    try {
      await api.restoreBackup(id);
      alert("بازگردانی با موفقیت انجام شد.");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "خطا در بازگردانی بک‌آپ");
    } finally {
      setBusyId(null);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("این بک‌آپ حذف شود؟")) return;
    setBusyId(id);
    setError(null);
    try {
      await api.deleteBackup(id);
      reload();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "خطا در حذف بک‌آپ");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">بک‌آپ‌گیری</h1>
      </div>

      {domains.length === 0 && !loading && (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-700">
          ابتدا باید حداقل یک دامنه ایجاد کنید.
        </p>
      )}

      {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}

      {domains.length > 0 && (
        <div className="flex flex-wrap items-end gap-3 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
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
          <button
            onClick={handleCreate}
            disabled={creating}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-60"
          >
            {creating ? "در حال ایجاد بک‌آپ..." : "+ ایجاد بک‌آپ جدید"}
          </button>
          <p className="text-xs text-slate-400">
            یک آرشیو کامل شامل فایل‌های وب‌سایت و دیتابیس‌های متصل ساخته می‌شود.
          </p>
        </div>
      )}

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full text-right text-sm">
          <thead className="bg-slate-50 text-slate-500">
            <tr>
              <th className="px-4 py-3 font-medium">دامنه</th>
              <th className="px-4 py-3 font-medium">حجم</th>
              <th className="px-4 py-3 font-medium">وضعیت</th>
              <th className="px-4 py-3 font-medium">تاریخ</th>
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
            {!loading && backups.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-slate-400">
                  هیچ بک‌آپی ثبت نشده است.
                </td>
              </tr>
            )}
            {backups.map((b) => (
              <tr key={b.id} className="border-t border-slate-100">
                <td className="px-4 py-3 font-medium" dir="ltr">
                  {b.domain.name}
                </td>
                <td className="px-4 py-3" dir="ltr">
                  {formatSize(b.sizeBytes)}
                </td>
                <td className="px-4 py-3">
                  <span className={`rounded-full px-2 py-0.5 text-xs ${STATUS_STYLES[b.status]}`}>
                    {STATUS_LABELS[b.status]}
                  </span>
                  {b.status === "FAILED" && b.error && (
                    <p className="mt-1 max-w-xs truncate text-[11px] text-red-400" title={b.error}>
                      {b.error}
                    </p>
                  )}
                </td>
                <td className="px-4 py-3 text-slate-500">
                  {new Date(b.createdAt).toLocaleString("fa-IR")}
                </td>
                <td className="flex justify-end gap-3 px-4 py-3 text-left">
                  {b.status === "COMPLETE" && (
                    <>
                      <a
                        href={api.backupDownloadUrl(b.id)}
                        className="text-xs font-medium text-indigo-600 hover:underline"
                      >
                        دانلود
                      </a>
                      <button
                        onClick={() => handleRestore(b.id)}
                        disabled={busyId === b.id}
                        className="text-xs font-medium text-amber-600 hover:underline disabled:opacity-50"
                      >
                        بازگردانی
                      </button>
                    </>
                  )}
                  <button
                    onClick={() => handleDelete(b.id)}
                    disabled={busyId === b.id}
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
