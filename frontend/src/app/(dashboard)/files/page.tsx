"use client";

import { useEffect, useRef, useState } from "react";
import { api, ApiError, Domain, FileEntry } from "@/lib/api";

function joinPath(base: string, name: string): string {
  return base === "." ? name : `${base}/${name}`;
}

function parentOf(p: string): string {
  if (p === "." || !p.includes("/")) return ".";
  return p.slice(0, p.lastIndexOf("/"));
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} بایت`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} کیلوبایت`;
  return `${(bytes / 1024 / 1024).toFixed(1)} مگابایت`;
}

export default function FilesPage() {
  const [domains, setDomains] = useState<Domain[]>([]);
  const [domainId, setDomainId] = useState("");
  const [path, setPath] = useState(".");
  const [entries, setEntries] = useState<FileEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [editingFile, setEditingFile] = useState<string | null>(null);
  const [editingContent, setEditingContent] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    api
      .listDomains()
      .then((doms) => {
        setDomains(doms);
        if (doms.length > 0) setDomainId(doms[0].id);
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : "خطا در دریافت دامنه‌ها"));
  }, []);

  function fetchEntries() {
    if (!domainId) return;
    return api
      .listFiles(domainId, path)
      .then(setEntries)
      .catch((err) => setError(err instanceof ApiError ? err.message : "خطا در دریافت فایل‌ها"))
      .finally(() => setLoading(false));
  }

  function reloadEntries() {
    setLoading(true);
    fetchEntries();
  }

  useEffect(() => {
    fetchEntries();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [domainId, path]);

  function openEntry(entry: FileEntry) {
    if (entry.type === "directory") {
      setPath(joinPath(path, entry.name));
      return;
    }
    const target = joinPath(path, entry.name);
    setError(null);
    api
      .readFileContent(domainId, target)
      .then(({ content }) => {
        setEditingFile(target);
        setEditingContent(content);
      })
      .catch((err) =>
        setError(err instanceof ApiError ? err.message : "این فایل قابل نمایش نیست (باینری یا حجیم)"),
      );
  }

  async function handleSaveEdit() {
    if (!editingFile) return;
    setSavingEdit(true);
    try {
      await api.writeFileContent(domainId, editingFile, editingContent);
      setEditingFile(null);
      reloadEntries();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "خطا در ذخیره فایل");
    } finally {
      setSavingEdit(false);
    }
  }

  async function handleMkdir() {
    const name = prompt("نام پوشه جدید:");
    if (!name) return;
    try {
      await api.mkdir(domainId, joinPath(path, name));
      reloadEntries();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "خطا در ایجاد پوشه");
    }
  }

  async function handleRename(entry: FileEntry) {
    const newName = prompt("نام جدید:", entry.name);
    if (!newName || newName === entry.name) return;
    try {
      await api.renameFile(domainId, joinPath(path, entry.name), newName);
      reloadEntries();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "خطا در تغییر نام");
    }
  }

  async function handleDelete(entry: FileEntry) {
    if (!confirm(`«${entry.name}» حذف شود؟ این عملیات غیرقابل بازگشت است.`)) return;
    try {
      await api.deleteFile(domainId, joinPath(path, entry.name));
      reloadEntries();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "خطا در حذف");
    }
  }

  async function handleUpload(fileList: FileList | null) {
    if (!fileList || fileList.length === 0) return;
    try {
      await api.uploadFile(domainId, path, fileList[0]);
      reloadEntries();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "خطا در آپلود فایل");
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">فایل منیجر</h1>
        <select
          value={domainId}
          onChange={(e) => {
            setDomainId(e.target.value);
            setPath(".");
          }}
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
        >
          {domains.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </select>
      </div>

      {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}

      <div className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
        <div className="flex items-center gap-2 text-sm text-slate-500" dir="ltr">
          <button onClick={() => setPath(".")} className="font-medium text-indigo-600 hover:underline">
            /
          </button>
          <span dir="ltr">{path === "." ? "" : path}</span>
        </div>
        <div className="flex gap-2">
          {path !== "." && (
            <button
              onClick={() => setPath(parentOf(path))}
              className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium hover:bg-slate-50"
            >
              بازگشت
            </button>
          )}
          <button
            onClick={handleMkdir}
            className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium hover:bg-slate-50"
          >
            + پوشه جدید
          </button>
          <button
            onClick={() => fileInputRef.current?.click()}
            className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-700"
          >
            آپلود فایل
          </button>
          <input
            ref={fileInputRef}
            type="file"
            className="hidden"
            onChange={(e) => handleUpload(e.target.files)}
          />
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full text-right text-sm">
          <thead className="bg-slate-50 text-slate-500">
            <tr>
              <th className="px-4 py-3 font-medium">نام</th>
              <th className="px-4 py-3 font-medium">حجم</th>
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
            {!loading && entries.length === 0 && (
              <tr>
                <td colSpan={3} className="px-4 py-6 text-center text-slate-400">
                  این پوشه خالی است.
                </td>
              </tr>
            )}
            {entries.map((entry) => (
              <tr key={entry.name} className="border-t border-slate-100">
                <td className="px-4 py-3 font-medium">
                  <button
                    onClick={() => openEntry(entry)}
                    className="flex items-center gap-2 hover:text-indigo-600"
                    dir="ltr"
                  >
                    <span>{entry.type === "directory" ? "📁" : "📄"}</span>
                    <span>{entry.name}</span>
                  </button>
                </td>
                <td className="px-4 py-3 text-slate-500">
                  {entry.type === "file" ? formatSize(entry.size) : "—"}
                </td>
                <td className="flex justify-end gap-3 px-4 py-3 text-left">
                  {entry.type === "file" && (
                    <a
                      href={api.fileDownloadUrl(domainId, joinPath(path, entry.name))}
                      className="text-xs font-medium text-indigo-600 hover:underline"
                    >
                      دانلود
                    </a>
                  )}
                  <button
                    onClick={() => handleRename(entry)}
                    className="text-xs font-medium text-slate-600 hover:underline"
                  >
                    تغییر نام
                  </button>
                  <button
                    onClick={() => handleDelete(entry)}
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

      {editingFile && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="flex max-h-[80vh] w-full max-w-3xl flex-col rounded-xl bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3">
              <h2 className="font-semibold" dir="ltr">
                {editingFile}
              </h2>
              <button onClick={() => setEditingFile(null)} className="text-slate-400 hover:text-slate-600">
                ✕
              </button>
            </div>
            <textarea
              value={editingContent}
              onChange={(e) => setEditingContent(e.target.value)}
              className="flex-1 resize-none p-4 font-mono text-sm outline-none"
              dir="ltr"
              spellCheck={false}
              rows={20}
            />
            <div className="flex justify-end gap-2 border-t border-slate-200 px-5 py-3">
              <button
                onClick={() => setEditingFile(null)}
                className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium hover:bg-slate-50"
              >
                انصراف
              </button>
              <button
                onClick={handleSaveEdit}
                disabled={savingEdit}
                className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-60"
              >
                {savingEdit ? "در حال ذخیره..." : "ذخیره"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
