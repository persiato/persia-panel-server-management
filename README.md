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

### روش سریع — یک دستور تک‌خطی

اگر می‌خواهید کل نصب (دانلود کد + آماده‌سازی سیستم‌عامل + دیپلوی برنامه)
را با یک دستور کپی/پیست انجام دهید، همین یک خط را روی سرور اجرا کنید
(به‌جای `git clone` از دانلود مستقیم آرشیو zip استفاده می‌کند، چون
`git clone` روی سرورهایی با محدودیت شبکه‌ای روی گیت‌هاب معمولاً گیر
می‌کند، درحالی‌که دانلود مستقیم فایل zip از همان دامنه معمولاً کار
می‌کند):

```bash
sudo apt update && sudo apt install -y unzip && wget -O /tmp/pp.zip https://github.com/persiato/persia-panel-server-management/archive/refs/heads/main.zip && sudo mkdir -p /opt/persia-panel && unzip -oq /tmp/pp.zip -d /tmp && sudo cp -a /tmp/persia-panel-server-management-main/. /opt/persia-panel/ && rm -rf /tmp/persia-panel-server-management-main /tmp/pp.zip && cd /opt/persia-panel && sudo bash installer/quickstart.sh
```

در انتها آدرس پنل و **رمز عبور ادمین** (فقط همین یک‌بار) چاپ می‌شود —
حتماً ذخیره کنید. برای تعیین دامنه/آدرسی که با آن به پنل وصل می‌شوید،
همان دستور را با `PANEL_HOST=panel.example.com` قبل از آن اجرا کنید:

```bash
sudo apt update && sudo apt install -y unzip && wget -O /tmp/pp.zip https://github.com/persiato/persia-panel-server-management/archive/refs/heads/main.zip && sudo mkdir -p /opt/persia-panel && unzip -oq /tmp/pp.zip -d /tmp && sudo cp -a /tmp/persia-panel-server-management-main/. /opt/persia-panel/ && rm -rf /tmp/persia-panel-server-management-main /tmp/pp.zip && cd /opt/persia-panel && sudo PANEL_HOST=panel.example.com bash installer/quickstart.sh
```

سپس آدرس `https://<panel-host>:2087` را در مرورگر باز کنید (گواهی اولیه
self-signed است، پس مرورگر یک هشدار نشان می‌دهد) و با اطلاعات چاپ‌شده
وارد شوید.

### روش گام‌به‌گام (برای دیباگ یا کنترل بیشتر روی هر مرحله)

۱. دانلود این مخزن روی سرور و قرار دادن آن در مسیر `/opt/persia-panel`.

   اگر `git clone` روی سرور شما (مثلاً به‌دلیل محدودیت‌های شبکه‌ای روی
   پورت 443 برای گیت‌هاب) گیر می‌کند، به‌جای آن از دانلود مستقیم آرشیو
   zip استفاده کنید:

```bash
sudo apt update
sudo apt install unzip -y

wget https://github.com/persiato/persia-panel-server-management/archive/refs/heads/main.zip

mkdir -p /opt/persia-panel
unzip main.zip
mv persia-panel-server-management-main/* /opt/persia-panel/
mv persia-panel-server-management-main/.[!.]* /opt/persia-panel/ 2>/dev/null || true
rm -rf persia-panel-server-management-main main.zip

cd /opt/persia-panel
```

   اگر اتصال شما مشکلی ندارد، به‌جای این روش می‌توانید مستقیماً از
   `git clone` استفاده کنید:

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

   نکته: مراحل ۲ و ۳ را می‌توانید با یک دستور هم انجام دهید:
   `sudo bash installer/quickstart.sh` (دقیقاً معادل اجرای پشت‌سرهم
   `install.sh` و `deploy.sh`).

۴. آدرس `https://<panel-host>:2087` را در مرورگر باز کنید (گواهی اولیه
   self-signed است، پس مرورگر یک هشدار نشان می‌دهد) و با اطلاعات چاپ‌شده
   وارد شوید.

### بروزرسانی یک نصب موجود

```bash
cd /opt/persia-panel
sudo git pull
sudo bash installer/deploy.sh   # idempotent — secretهای موجود را دوباره نمی‌سازد
```

   اگر `git pull` هم به‌همان دلیل شبکه‌ای گیر کرد، آرشیو zip جدید را
   دوباره دانلود و جایگزین کنید (مرحله ۱ روش گام‌به‌گام بالا) و سپس
   دوباره `installer/deploy.sh` را اجرا کنید. برای بروزرسانی فقط
   `deploy.sh` کافی است — `install.sh`/`quickstart.sh` نیازی نیست
   دوباره اجرا شود مگر بخواهید بسته‌های سیستم‌عامل را هم به‌روز کنید.

## توسعه محلی (Local development)

برای اجرای محلی به `backend/README.md` و `frontend/README.md` (روال
استاندارد Nest/Next.js — `npm run start:dev`، `npm run dev` و غیره) و
`backend/.env.example` / `frontend/.env.local.example` (متغیرهای محیطی
موردنیاز هر بخش) مراجعه کنید.
