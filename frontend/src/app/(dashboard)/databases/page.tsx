"use client";

import { useEffect, useState, FormEvent } from "react";
import { api, ApiError, Domain, PanelDatabase } from "@/lib/api";

const ENGINE_LABELS: Record<PanelDatabase["engine"], string> = {
  MYSQL: "MySQL",
  POSTGRES: "PostgreSQL",
};

export default function DatabasesPage() {
  const [databases, setDatabases] = useState<PanelDatabase[]>([]);
  const [domains, setDomains] = useState<Domain[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);

  const [domainId, setDomainId] = useState("");
  const [engine, setEngine] = useState<PanelDatabase["engine"]>("MYSQL");
  const [name, setName] = useState("");
  const [submitting, setSubmitting] = useState(false);

  function fetchData() {
    return Promise.all([api.listDatabases(), api.listDomains()])
      .then(([dbs, doms]) => {
        setDatabases(dbs);
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

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    setNotice(null);
    try {
      const created = await api.createDatabase({ domainId, engine, name });
      setName("");
      setShowForm(false);
      setNotice(`دیتابیس ساخته شد. رمز عبور (فقط یک‌بار نمایش داده می‌شود): ${created.password}`);
      reload();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "خطا در ایجاد دیتابیس");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleResetPassword(id: string) {
    setError(null);
    setNotice(null);
    try {
      const { password } = await api.resetDatabasePassword(id);
      setNotice(`رمز عبور جدید (فقط یک‌بار نمایش داده می‌شود): ${password}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "خطا در تغییر رمز عبور");
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("این دیتابیس حذف شود؟ این عملیات غیرقابل بازگشت است.")) return;
    try {
      await api.deleteDatabase(id);
      reload();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "خطا در حذف دیتابیس");
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">دیتابیس‌ها</h1>
        <button
          onClick={() => setShowForm((v) => !v)}
          disabled={domains.length === 0}
          className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-60"
        >
          {showForm ? "انصراف" : "+ افزودن دیتابیس"}
        </button>
      </div>

      {domains.length === 0 && !loading && (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-700">
          ابتدا باید حداقل یک دامنه ایجاد کنید.
        </p>
      )}

      {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}
      {notice && (
        <p className="break-all rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700" dir="ltr">
          {notice}
        </p>
      )}

      {showForm && (
        <form
          onSubmit={handleCreate}
          className="space-y-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm"
        >
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
            <label className="mb-1 block text-sm font-medium text-slate-700">نوع دیتابیس</label>
            <select
              value={engine}
              onChange={(e) => setEngine(e.target.value as PanelDatabase["engine"])}
              className="w-full max-w-sm rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
            >
              {Object.entries(ENGINE_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">نام دیتابیس</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="mydb"
              required
              className="w-full max-w-sm rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
              dir="ltr"
            />
          </div>
          <button
            type="submit"
            disabled={submitting}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-60"
          >
            {submitting ? "در حال ایجاد..." : "ایجاد دیتابیس"}
          </button>
        </form>
      )}

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full text-right text-sm">
          <thead className="bg-slate-50 text-slate-500">
            <tr>
              <th className="px-4 py-3 font-medium">نام</th>
              <th className="px-4 py-3 font-medium">نوع</th>
              <th className="px-4 py-3 font-medium">کاربر</th>
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
            {!loading && databases.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-6 text-center text-slate-400">
                  هیچ دیتابیسی ثبت نشده است.
                </td>
              </tr>
            )}
            {databases.map((d) => (
              <tr key={d.id} className="border-t border-slate-100">
                <td className="px-4 py-3 font-medium" dir="ltr">
                  {d.name}
                </td>
                <td className="px-4 py-3">{ENGINE_LABELS[d.engine]}</td>
                <td className="px-4 py-3" dir="ltr">
                  {d.username}
                </td>
                <td className="flex justify-end gap-3 px-4 py-3 text-left">
                  <button
                    onClick={() => handleResetPassword(d.id)}
                    className="text-xs font-medium text-indigo-600 hover:underline"
                  >
                    تغییر رمز عبور
                  </button>
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
