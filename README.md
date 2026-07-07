# پرشیا پنل (Persia Panel)

پنل مدیریت سرور خودمیزبان (self-hosted)، مشابه cPanel/WHM، برای Ubuntu
24.04 — مدیریت دامنه‌ها و وب‌سایت‌ها، فایل منیجر، دیتابیس‌ها، کرون جاب‌ها،
نصب یک‌کلیکی اپ‌ها، ایمیل (Postfix + Dovecot)، DNS (BIND9)، SSL خودکار
(ACME)، بک‌آپ، امنیت و فایروال، اتصال جایگزین از طریق تونل SSH، و یک لایه
کلید API برای اتصال ابزارهای بیرونی (مثلاً یک سایت‌ساز اختصاصی) با همان
سطح دسترسی یک کاربر واردشده.

نصاب این پروژه مخصوص سرورهایی طراحی شده که اتصال شبکه‌شان پایدار/بدون
محدودیت نیست (مثلاً سرورهای با IP ایران): هر مرحله نصب با retry و مسیر
جایگزین (mirror fallback) کار می‌کند و در صورت شکست یک بخش، کل نصب متوقف
نمی‌شود.

## ویژگی‌ها

- **دامنه‌ها و وب‌سایت‌ها** — نصب و پیکربندی خودکار nginx + PHP-FPM (چند
  نسخه هم‌زمان) برای هر دامنه
- **فایل منیجر** تحت وب
- **دیتابیس‌ها** — MySQL/MariaDB و PostgreSQL
- **کرون جاب‌ها**
- **نصب یک‌کلیکی** (WordPress، phpMyAdmin و...)
- **ایمیل** — صندوق‌های ایمیل مجازی روی Postfix + Dovecot
- **DNS** — مدیریت کامل رکوردهای BIND9 (A/AAAA/CNAME/MX/TXT/NS/SRV)
- **SSL** — صدور و تمدید خودکار گواهی با ACME
- **بک‌آپ** و **امنیت/فایروال** (fail2ban، ufw)
- **اتصال جایگزین (SSH tunnel)** برای زمانی که اتصال مستقیم مسدود است
- **کلیدهای API** — دسترسی کامل برنامه‌نویسی‌شده به تمام قابلیت‌های پنل
  برای اتصال یک سیستم بیرونی (مثلاً سایت‌ساز اختصاصی)

## ساختار مخزن

```
backend/      بک‌اند NestJS (Prisma + PostgreSQL)
frontend/     پنل مدیریت Next.js
installer/    اسکریپت‌های آماده‌سازی سرور (Ubuntu 24.04) و دیپلوی
```

## نصب روی یک سرور تمیز Ubuntu 24.04

۱. کلون کردن این مخزن روی سرور (به‌عنوان root یا با sudo)، مثلاً در
   مسیر `/opt/persia-panel`:

```bash
sudo git clone https://github.com/persiato/persia-panel-server-management.git /opt/persia-panel
cd /opt/persia-panel
```

۲. آماده‌سازی سیستم‌عامل — نصب nginx، PHP-FPM (چند نسخه)، MariaDB،
   PostgreSQL، BIND9، Postfix، Dovecot، fail2ban، acme.sh، ufw، Node.js:

```bash
sudo bash installer/install.sh
```

۳. دیپلوی خود برنامه (ساخت بک‌اند و فرانت‌اند، ساخت دیتابیس، تولید
   secretها، ثبت سرویس‌های systemd، و تنظیم nginx برای پنل روی پورت
   ۲۰۸۷):

```bash
sudo bash installer/deploy.sh
```

   در این مرحله آدرس/دامنه‌ای که با آن به پنل وصل می‌شوید پرسیده می‌شود
   (یا از قبل با `PANEL_HOST=panel.example.com sudo bash installer/deploy.sh`
   مشخص کنید). در پایان، آدرس پنل و **رمز عبور ادمین** (فقط همین یک‌بار)
   چاپ می‌شود — حتماً ذخیره کنید.

۴. آدرس `https://<panel-host>:2087` را در مرورگر باز کنید (گواهی اولیه
   self-signed است، پس مرورگر یک هشدار نشان می‌دهد) و با اطلاعات چاپ‌شده
   وارد شوید.

### بروزرسانی یک نصب موجود

```bash
cd /opt/persia-panel
sudo git pull
sudo bash installer/deploy.sh   # idempotent — secretهای موجود را دوباره نمی‌سازد
```

## توسعه محلی (Local development)

برای اجرای محلی به `backend/README.md` و `frontend/README.md` (روال
استاندارد Nest/Next.js — `npm run start:dev`، `npm run dev` و غیره) و
`backend/.env.example` / `frontend/.env.local.example` (متغیرهای محیطی
موردنیاز هر بخش) مراجعه کنید.
