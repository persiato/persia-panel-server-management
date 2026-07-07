# Persia Panel

A self-hosted, cPanel/WHM-style server control panel for Ubuntu 24.04 —
domains & websites, file manager, databases, cron jobs, one-click app
installer, email (Postfix + Dovecot), DNS (BIND9), SSL (ACME), backups,
security/firewall, SSH-tunnel fallback connectivity, and an external
API-key layer so third-party tools (e.g. a custom site builder) can manage
the panel programmatically with the same privileges as a logged-in user.

The installer is built for servers with unreliable/sanctioned connectivity
(e.g. Iranian IPs): every install step retries with mirror fallbacks and
degrades gracefully instead of aborting the whole install.

## Repository layout

```
backend/      NestJS API (Prisma + PostgreSQL)
frontend/     Next.js admin UI
installer/    Ubuntu 24.04 server bootstrap + deploy scripts
```

## Installing on a fresh Ubuntu 24.04 server

1. Clone this repo onto the server (as root or a sudo-capable user), e.g.
   into `/opt/persia-panel`:

   ```bash
   sudo git clone <this-repo-url> /opt/persia-panel
   cd /opt/persia-panel
   ```

2. Prepare the OS — installs nginx, PHP-FPM (multiple versions), MariaDB,
   PostgreSQL, BIND9, Postfix, Dovecot, fail2ban, acme.sh, ufw, Node.js:

   ```bash
   sudo bash installer/install.sh
   ```

3. Deploy the application (builds backend + frontend, creates the database,
   generates secrets, installs systemd services, and configures the nginx
   reverse proxy for the panel UI on port 2087):

   ```bash
   sudo bash installer/deploy.sh
   ```

   You'll be prompted for the hostname/IP the panel will be reached at (or
   set `PANEL_HOST=panel.example.com` beforehand to skip the prompt). At the
   end it prints the panel URL and a one-time admin password — save it, it
   is not shown again (it lives in `backend/.env`).

4. Open `https://<panel-host>:2087` in your browser (the first-run
   certificate is self-signed, so your browser will warn once) and log in
   with the printed admin credentials.

### Updating an existing install

```bash
cd /opt/persia-panel
sudo git pull
sudo bash installer/deploy.sh   # idempotent — reuses existing secrets/.env
```

## Local development

See `backend/README.md` and `frontend/README.md` for the standard
Nest/Next.js dev workflows (`npm run start:dev`, `npm run dev`, etc.), and
`backend/.env.example` / `frontend/.env.local.example` for the environment
variables each app expects.
