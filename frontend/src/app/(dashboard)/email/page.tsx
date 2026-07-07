"use client";

import { useEffect, useState, FormEvent } from "react";
import { api, ApiError, Domain, EmailAccount } from "@/lib/api";

export default function EmailPage() {
  const [accounts, setAccounts] = useState<EmailAccount[]>([]);
  const [domains, setDomains] = useState<Domain[]>([]);
  const [domainId, setDomainId] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const [localPart, setLocalPart] = useState("");
  const [quotaMb, setQuotaMb] = useState("1024");

  function fetchDomains() {
    return api
      .listDomains()
      .then((doms) => {
        setDomains(doms);
        if (!domainId && doms.length > 0) setDomainId(doms[0].id);
        if (doms.length === 0) setLoading(false);
      })
      .catch((err) => {
        setError(err instanceof ApiError ? err.message : "خطا در دریافت دامنه‌ها");
        setLoading(false);
      });
  }

  function fetchAccounts(id: string) {
    return api
      .listEmailAccounts(id)
      .then(setAccounts)
      .catch((err) => setError(err instanceof ApiError ? err.message : "خطا در دریافت صندوق‌های ایمیل"))
      .finally(() => setLoading(false));
  }

  function reload(id: string) {
    setLoading(true);
    fetchAccounts(id);
  }

  useEffect(() => {
    fetchDomains();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (domainId) fetchAccounts(domainId);
  }, [domainId]);

  function domainName(id: string) {
    return domains.find((d) => d.id === id)?.name ?? "";
  }

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    setNotice(null);
    try {
      const created = await api.createEmailAccount({
        domainId,
        localPart,
        quotaMb: quotaMb ? Number(quotaMb) : undefined,
      });
      setLocalPart("");
      setShowForm(false);
      setNotice(
        `صندوق ${created.localPart}@${domainName(domainId)} ساخته شد. رمز عبور (فقط یک‌بار نمایش داده می‌شود): ${created.password}`,
      );
      reload(domainId);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "خطا در ایجاد صندوق ایمیل");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleResetPassword(id: string) {
    setError(null);
    setNotice(null);
    try {
      const { password } = await api.resetEmailAccountPassword(id);
      setNotice(`رمز عبور جدید (فقط یک‌بار نمایش داده می‌شود): ${password}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "خطا در تغییر رمز عبور");
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("این صندوق ایمیل حذف شود؟ این عملیات غیرقابل بازگشت است.")) return;
    setError(null);
    try {
      await api.deleteEmailAccount(id);
      reload(domainId);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "خطا در حذف صندوق ایمیل");
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">ایمیل</h1>
        <button
          onClick={() => setShowForm((v) => !v)}
          disabled={domains.length === 0}
          className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-60"
        >
          {showForm ? "انصراف" : "+ افزودن صندوق ایمیل"}
        </button>
      </div>

      <p className="rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-500">
        صندوق‌های ایمیل روی این سرور با Postfix (تحویل) و Dovecot (IMAP/POP3) اجرا می‌شوند. رمز
        عبور هرگز در پایگاه‌داده پنل ذخیره نمی‌شود؛ فقط در فایل اعتبارسنجی Dovecot روی دیسک نگهداری
        می‌شود، پس هنگام ایجاد یا تغییر رمز، آن را یادداشت کنید.
      </p>

      {domains.length === 0 && !loading && (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-700">
          ابتدا باید حداقل یک دامنه ایجاد کنید.
        </p>
      )}

      {domains.length > 0 && (
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
            <label className="mb-1 block text-sm font-medium text-slate-700">آدرس ایمیل</label>
            <div className="flex max-w-md items-center gap-2" dir="ltr">
              <input
                value={localPart}
                onChange={(e) => setLocalPart(e.target.value)}
                placeholder="info"
                required
                className="w-40 rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
              />
              <span className="text-sm text-slate-500">@{domainName(domainId)}</span>
            </div>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">سهمیه فضا (مگابایت)</label>
            <input
              value={quotaMb}
              onChange={(e) => setQuotaMb(e.target.value)}
              type="number"
              dir="ltr"
              className="w-full max-w-sm rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
            />
          </div>
          <button
            type="submit"
            disabled={submitting}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-60"
          >
            {submitting ? "در حال ایجاد..." : "ایجاد صندوق"}
          </button>
        </form>
      )}

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full text-right text-sm">
          <thead className="bg-slate-50 text-slate-500">
            <tr>
              <th className="px-4 py-3 font-medium">آدرس ایمیل</th>
              <th className="px-4 py-3 font-medium">سهمیه (MB)</th>
              <th className="px-4 py-3 font-medium"></th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={3} className="px-4 py-6 text-center text-slate-400">
                  در حال بارگذاری...
                </td>
              </tr>
            )}
            {!loading && accounts.length === 0 && (
              <tr>
                <td colSpan={3} className="px-4 py-6 text-center text-slate-400">
                  هیچ صندوق ایمیلی ثبت نشده است.
                </td>
              </tr>
            )}
            {accounts.map((a) => (
              <tr key={a.id} className="border-t border-slate-100">
                <td className="px-4 py-3 font-medium" dir="ltr">
                  {a.localPart}@{domainName(a.domainId)}
                </td>
                <td className="px-4 py-3" dir="ltr">
                  {a.quotaMb}
                </td>
                <td className="flex justify-end gap-3 px-4 py-3 text-left">
                  <button
                    onClick={() => handleResetPassword(a.id)}
                    className="text-xs font-medium text-indigo-600 hover:underline"
                  >
                    تغییر رمز عبور
                  </button>
                  <button
                    onClick={() => handleDelete(a.id)}
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
