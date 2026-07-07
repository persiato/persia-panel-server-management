"use client";

import { useEffect, useState, FormEvent } from "react";
import { api, ApiError, CronJob } from "@/lib/api";

export default function CronJobsPage() {
  const [jobs, setJobs] = useState<CronJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);

  const [schedule, setSchedule] = useState("* * * * *");
  const [command, setCommand] = useState("");
  const [submitting, setSubmitting] = useState(false);

  function fetchJobs() {
    return api
      .listCronJobs()
      .then(setJobs)
      .catch((err) => setError(err instanceof ApiError ? err.message : "خطا در دریافت کرون جاب‌ها"))
      .finally(() => setLoading(false));
  }

  function reload() {
    setLoading(true);
    fetchJobs();
  }

  useEffect(() => {
    fetchJobs();
  }, []);

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await api.createCronJob({ schedule, command });
      setSchedule("* * * * *");
      setCommand("");
      setShowForm(false);
      reload();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "خطا در ایجاد کرون جاب");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleToggle(job: CronJob) {
    try {
      await api.updateCronJob(job.id, { isEnabled: !job.isEnabled });
      reload();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "خطا در تغییر وضعیت");
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("این کرون جاب حذف شود؟")) return;
    try {
      await api.deleteCronJob(id);
      reload();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "خطا در حذف کرون جاب");
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">کرون جاب‌ها</h1>
        <button
          onClick={() => setShowForm((v) => !v)}
          className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700"
        >
          {showForm ? "انصراف" : "+ افزودن کرون جاب"}
        </button>
      </div>

      {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}

      {showForm && (
        <form
          onSubmit={handleCreate}
          className="space-y-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm"
        >
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">زمان‌بندی (cron)</label>
            <input
              value={schedule}
              onChange={(e) => setSchedule(e.target.value)}
              placeholder="* * * * *"
              required
              className="w-full max-w-sm rounded-lg border border-slate-300 px-3 py-2 font-mono text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
              dir="ltr"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">دستور</label>
            <input
              value={command}
              onChange={(e) => setCommand(e.target.value)}
              placeholder="/usr/bin/php /home/user/script.php"
              required
              className="w-full max-w-xl rounded-lg border border-slate-300 px-3 py-2 font-mono text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
              dir="ltr"
            />
          </div>
          <button
            type="submit"
            disabled={submitting}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-60"
          >
            {submitting ? "در حال ایجاد..." : "ایجاد کرون جاب"}
          </button>
        </form>
      )}

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full text-right text-sm">
          <thead className="bg-slate-50 text-slate-500">
            <tr>
              <th className="px-4 py-3 font-medium">زمان‌بندی</th>
              <th className="px-4 py-3 font-medium">دستور</th>
              <th className="px-4 py-3 font-medium">وضعیت</th>
              <th className="px-4 py-3 font-medium"></th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={4} className="px-4 py-6 text-center text-slate-400">
                  در حال بارگذاری...
                </td>
              </tr>
            )}
            {!loading && jobs.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-6 text-center text-slate-400">
                  هیچ کرون جابی ثبت نشده است.
                </td>
              </tr>
            )}
            {jobs.map((job) => (
              <tr key={job.id} className="border-t border-slate-100">
                <td className="px-4 py-3 font-mono" dir="ltr">
                  {job.schedule}
                </td>
                <td className="max-w-md truncate px-4 py-3 font-mono" dir="ltr" title={job.command}>
                  {job.command}
                </td>
                <td className="px-4 py-3">
                  <button onClick={() => handleToggle(job)}>
                    {job.isEnabled ? (
                      <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs text-emerald-700">
                        فعال
                      </span>
                    ) : (
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-500">
                        غیرفعال
                      </span>
                    )}
                  </button>
                </td>
                <td className="px-4 py-3 text-left">
                  <button
                    onClick={() => handleDelete(job.id)}
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
