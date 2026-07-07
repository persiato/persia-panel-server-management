"use client";

import { useEffect, useState, FormEvent } from "react";
import { api, ApiError, Domain, DnsRecord } from "@/lib/api";

const TYPE_LABELS: Record<DnsRecord["type"], string> = {
  A: "A",
  AAAA: "AAAA",
  CNAME: "CNAME",
  MX: "MX",
  TXT: "TXT",
  NS: "NS",
  SRV: "SRV",
};

const RECORD_TYPES = Object.keys(TYPE_LABELS) as DnsRecord["type"][];
const NEEDS_PRIORITY: DnsRecord["type"][] = ["MX", "SRV"];

export default function DnsPage() {
  const [records, setRecords] = useState<DnsRecord[]>([]);
  const [domains, setDomains] = useState<Domain[]>([]);
  const [domainId, setDomainId] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const [type, setType] = useState<DnsRecord["type"]>("A");
  const [name, setName] = useState("@");
  const [value, setValue] = useState("");
  const [ttl, setTtl] = useState("3600");
  const [priority, setPriority] = useState("10");

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

  function fetchRecords(id: string) {
    return api
      .listDnsRecords(id)
      .then(setRecords)
      .catch((err) => setError(err instanceof ApiError ? err.message : "خطا در دریافت رکوردهای DNS"))
      .finally(() => setLoading(false));
  }

  function reload(id: string) {
    setLoading(true);
    fetchRecords(id);
  }

  useEffect(() => {
    fetchDomains();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (domainId) fetchRecords(domainId);
  }, [domainId]);

  function resetForm() {
    setType("A");
    setName("@");
    setValue("");
    setTtl("3600");
    setPriority("10");
    setEditingId(null);
    setShowForm(false);
  }

  function startEdit(record: DnsRecord) {
    setType(record.type);
    setName(record.name);
    setValue(record.value);
    setTtl(String(record.ttl));
    setPriority(record.priority != null ? String(record.priority) : "10");
    setEditingId(record.id);
    setShowForm(true);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    setNotice(null);
    try {
      const payload = {
        domainId,
        type,
        name,
        value,
        ttl: ttl ? Number(ttl) : undefined,
        priority: NEEDS_PRIORITY.includes(type) && priority ? Number(priority) : undefined,
      };
      if (editingId) {
        await api.updateDnsRecord(editingId, payload);
        setNotice("رکورد DNS به‌روزرسانی شد.");
      } else {
        await api.createDnsRecord(payload);
        setNotice("رکورد DNS ایجاد شد.");
      }
      resetForm();
      reload(domainId);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "خطا در ذخیره رکورد DNS");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("این رکورد DNS حذف شود؟")) return;
    setError(null);
    try {
      await api.deleteDnsRecord(id);
      reload(domainId);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "خطا در حذف رکورد DNS");
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">DNS</h1>
        <button
          onClick={() => (showForm ? resetForm() : setShowForm(true))}
          disabled={domains.length === 0}
          className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-60"
        >
          {showForm ? "انصراف" : "+ افزودن رکورد"}
        </button>
      </div>

      <p className="rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-500">
        مدیریت رکوردهای DNS برای دامنه‌های سرویس‌دهی‌شده روی این پنل. با هر تغییر، فایل zone مربوطه
        به‌طور کامل بازسازی و روی سرویس bind9 بارگذاری می‌شود.
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
      {notice && <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{notice}</p>}

      {showForm && (
        <form
          onSubmit={handleSubmit}
          className="space-y-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm"
        >
          <div className="grid gap-3 md:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">نوع رکورد</label>
              <select
                value={type}
                onChange={(e) => setType(e.target.value as DnsRecord["type"])}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
              >
                {RECORD_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {TYPE_LABELS[t]}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">نام (نسبت به دامنه)</label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="@ یا www"
                required
                dir="ltr"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">مقدار</label>
              <input
                value={value}
                onChange={(e) => setValue(e.target.value)}
                placeholder={type === "A" ? "203.0.113.10" : "example.com"}
                required
                dir="ltr"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">TTL (ثانیه)</label>
              <input
                value={ttl}
                onChange={(e) => setTtl(e.target.value)}
                type="number"
                dir="ltr"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
              />
            </div>
            {NEEDS_PRIORITY.includes(type) && (
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">Priority</label>
                <input
                  value={priority}
                  onChange={(e) => setPriority(e.target.value)}
                  type="number"
                  dir="ltr"
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
                />
              </div>
            )}
          </div>
          <button
            type="submit"
            disabled={submitting}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-60"
          >
            {submitting ? "در حال ذخیره..." : editingId ? "به‌روزرسانی رکورد" : "ایجاد رکورد"}
          </button>
        </form>
      )}

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full text-right text-sm">
          <thead className="bg-slate-50 text-slate-500">
            <tr>
              <th className="px-4 py-3 font-medium">نوع</th>
              <th className="px-4 py-3 font-medium">نام</th>
              <th className="px-4 py-3 font-medium">مقدار</th>
              <th className="px-4 py-3 font-medium">TTL</th>
              <th className="px-4 py-3 font-medium">Priority</th>
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
            {!loading && records.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-slate-400">
                  هیچ رکورد DNS ثبت نشده است.
                </td>
              </tr>
            )}
            {records.map((r) => (
              <tr key={r.id} className="border-t border-slate-100">
                <td className="px-4 py-3 font-medium" dir="ltr">
                  {r.type}
                </td>
                <td className="px-4 py-3" dir="ltr">
                  {r.name}
                </td>
                <td className="max-w-xs truncate px-4 py-3" dir="ltr" title={r.value}>
                  {r.value}
                </td>
                <td className="px-4 py-3" dir="ltr">
                  {r.ttl}
                </td>
                <td className="px-4 py-3" dir="ltr">
                  {r.priority ?? "—"}
                </td>
                <td className="flex justify-end gap-3 px-4 py-3 text-left">
                  <button
                    onClick={() => startEdit(r)}
                    className="text-xs font-medium text-indigo-600 hover:underline"
                  >
                    ویرایش
                  </button>
                  <button
                    onClick={() => handleDelete(r.id)}
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
