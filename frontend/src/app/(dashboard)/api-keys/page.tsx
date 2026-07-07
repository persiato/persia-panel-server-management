"use client";

import { useEffect, useState, FormEvent } from "react";
import { api, ApiError, ApiKey } from "@/lib/api";

export default function ApiKeysPage() {
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [label, setLabel] = useState("");
  const [submitting, setSubmitting] = useState(false);

  function fetchData() {
    return api
      .listApiKeys()
      .then(setKeys)
      .catch((err) => setError(err instanceof ApiError ? err.message : "خطا در دریافت کلیدهای API"))
      .finally(() => setLoading(false));
  }

  function reload() {
    setLoading(true);
    fetchData();
  }

  useEffect(() => {
    fetchData();
  }, []);

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    setNotice(null);
    try {
      const created = await api.createApiKey(label);
      setLabel("");
      setShowForm(false);
      setNotice(
        `کلید API ساخته شد. این مقدار فقط همین یک‌بار نمایش داده می‌شود — آن را جایی امن ذخیره کنید: ${created.token}`,
      );
      reload();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "خطا در ایجاد کلید API");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleRevoke(id: string) {
    if (!confirm("این کلید API باطل شود؟ هر سیستمی که از آن استفاده می‌کند بلافاصله قطع دسترسی می‌شود.")) return;
    setError(null);
    try {
      await api.revokeApiKey(id);
      reload();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "خطا در باطل‌کردن کلید API");
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">کلیدهای API</h1>
        <button
          onClick={() => setShowForm((v) => !v)}
          className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-60"
        >
          {showForm ? "انصراف" : "+ ساخت کلید جدید"}
        </button>
      </div>

      <p className="rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-500">
        با یک کلید API می‌توانید یک سیستم بیرونی (مثلاً سایت‌ساز اختصاصی خودتان) را به کل API این
        پنل متصل کنید — همان دسترسی‌هایی که خودتان با ورود به حساب کاربری دارید، از طریق هدر{" "}
        <code dir="ltr" className="rounded bg-slate-100 px-1 py-0.5 text-xs">
          X-API-Key
        </code>{" "}
        در دسترس آن سیستم قرار می‌گیرد. مقدار کلید فقط یک‌بار، در لحظه ساخت نمایش داده می‌شود و
        هرگز به‌صورت خام در پایگاه‌داده ذخیره نمی‌شود.
      </p>

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
            <label className="mb-1 block text-sm font-medium text-slate-700">عنوان کلید</label>
            <input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="سایت‌ساز اختصاصی"
              required
              maxLength={100}
              className="w-full max-w-sm rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
            />
          </div>
          <button
            type="submit"
            disabled={submitting}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-60"
          >
            {submitting ? "در حال ساخت..." : "ساخت کلید"}
          </button>
        </form>
      )}

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full text-right text-sm">
          <thead className="bg-slate-50 text-slate-500">
            <tr>
              <th className="px-4 py-3 font-medium">عنوان</th>
              <th className="px-4 py-3 font-medium">پیشوند</th>
              <th className="px-4 py-3 font-medium">آخرین استفاده</th>
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
            {!loading && keys.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-slate-400">
                  هیچ کلید API ساخته نشده است.
                </td>
              </tr>
            )}
            {keys.map((k) => (
              <tr key={k.id} className="border-t border-slate-100">
                <td className="px-4 py-3 font-medium">{k.label}</td>
                <td className="px-4 py-3" dir="ltr">
                  {k.prefix}…
                </td>
                <td className="px-4 py-3" dir="ltr">
                  {k.lastUsedAt ? new Date(k.lastUsedAt).toLocaleString("fa-IR") : "—"}
                </td>
                <td className="px-4 py-3">
                  {k.revokedAt ? (
                    <span className="rounded-full bg-red-50 px-2 py-0.5 text-xs text-red-600">باطل‌شده</span>
                  ) : (
                    <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs text-emerald-700">فعال</span>
                  )}
                </td>
                <td className="flex justify-end px-4 py-3 text-left">
                  {!k.revokedAt && (
                    <button
                      onClick={() => handleRevoke(k.id)}
                      className="text-xs font-medium text-red-600 hover:underline"
                    >
                      باطل‌کردن
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
