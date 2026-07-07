import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "پرشیا پنل",
  description: "پنل مدیریت سرور و هاست",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="fa" dir="rtl" className="h-full antialiased">
      <body className="min-h-full flex flex-col bg-slate-100 text-slate-900">{children}</body>
    </html>
  );
}
