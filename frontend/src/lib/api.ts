const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000';

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

function getToken(): string | null {
  if (typeof window === 'undefined') return null;
  return window.localStorage.getItem('pp_token');
}

export function setToken(token: string) {
  window.localStorage.setItem('pp_token', token);
}

export function clearToken() {
  window.localStorage.removeItem('pp_token');
}

export function getStoredUser(): { username: string; role: string; email: string } | null {
  if (typeof window === 'undefined') return null;
  const raw = window.localStorage.getItem('pp_user');
  return raw ? JSON.parse(raw) : null;
}

export function setStoredUser(user: { username: string; role: string; email: string }) {
  window.localStorage.setItem('pp_user', JSON.stringify(user));
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getToken();
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({ message: res.statusText }));
    throw new ApiError(res.status, body.message ?? 'Request failed');
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export interface LoginResponse {
  accessToken: string;
  user: { id: string; username: string; email: string; role: string };
}

export const api = {
  login: (usernameOrEmail: string, password: string) =>
    request<LoginResponse>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ usernameOrEmail, password }),
    }),
  listDomains: () => request<Domain[]>('/domains'),
  createDomain: (payload: Partial<Domain> & { name: string }) =>
    request<Domain>('/domains', { method: 'POST', body: JSON.stringify(payload) }),
  deleteDomain: (id: string) => request<void>(`/domains/${id}`, { method: 'DELETE' }),
  issueSsl: (domainId: string) => request<Domain>(`/domains/${domainId}/ssl`, { method: 'POST' }),
  removeSsl: (domainId: string) => request<Domain>(`/domains/${domainId}/ssl`, { method: 'DELETE' }),

  listDatabases: () => request<PanelDatabase[]>('/databases'),
  createDatabase: (payload: { domainId: string; engine: 'MYSQL' | 'POSTGRES'; name: string }) =>
    request<PanelDatabase & { password: string }>('/databases', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  resetDatabasePassword: (id: string) =>
    request<{ password: string }>(`/databases/${id}/reset-password`, { method: 'POST' }),
  deleteDatabase: (id: string) => request<void>(`/databases/${id}`, { method: 'DELETE' }),

  listFiles: (domainId: string, path: string) =>
    request<FileEntry[]>(`/files?${new URLSearchParams({ domainId, path })}`),
  readFileContent: (domainId: string, path: string) =>
    request<{ content: string }>(`/files/content?${new URLSearchParams({ domainId, path })}`),
  writeFileContent: (domainId: string, path: string, content: string) =>
    request<void>('/files/content', {
      method: 'PUT',
      body: JSON.stringify({ domainId, path, content }),
    }),
  mkdir: (domainId: string, path: string) =>
    request<void>('/files/mkdir', { method: 'POST', body: JSON.stringify({ domainId, path }) }),
  renameFile: (domainId: string, path: string, newName: string) =>
    request<void>('/files/rename', {
      method: 'POST',
      body: JSON.stringify({ domainId, path, newName }),
    }),
  deleteFile: (domainId: string, path: string) =>
    request<void>(`/files?${new URLSearchParams({ domainId, path })}`, { method: 'DELETE' }),
  fileDownloadUrl: (domainId: string, path: string) =>
    `${API_BASE}/files/download?${new URLSearchParams({ domainId, path })}`,
  uploadFile: async (domainId: string, path: string, file: File) => {
    const token = getToken();
    const form = new FormData();
    form.append('file', file);
    const res = await fetch(`${API_BASE}/files/upload?${new URLSearchParams({ domainId, path })}`, {
      method: 'POST',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: form,
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({ message: res.statusText }));
      throw new ApiError(res.status, body.message ?? 'Upload failed');
    }
    return res.json();
  },

  listCronJobs: () => request<CronJob[]>('/cron-jobs'),
  createCronJob: (payload: { schedule: string; command: string }) =>
    request<CronJob>('/cron-jobs', { method: 'POST', body: JSON.stringify(payload) }),
  updateCronJob: (id: string, payload: Partial<{ schedule: string; command: string; isEnabled: boolean }>) =>
    request<CronJob>(`/cron-jobs/${id}`, { method: 'PATCH', body: JSON.stringify(payload) }),
  deleteCronJob: (id: string) => request<void>(`/cron-jobs/${id}`, { method: 'DELETE' }),

  listBackups: () => request<Backup[]>('/backups'),
  createBackup: (domainId: string) =>
    request<Backup>('/backups', { method: 'POST', body: JSON.stringify({ domainId }) }),
  restoreBackup: (id: string) => request<{ success: boolean }>(`/backups/${id}/restore`, { method: 'POST' }),
  deleteBackup: (id: string) => request<void>(`/backups/${id}`, { method: 'DELETE' }),
  backupDownloadUrl: (id: string) => `${API_BASE}/backups/${id}/download`,

  getFirewallRules: () => request<FirewallStatus>('/system/firewall/rules'),
  addFirewallRule: (payload: { action: 'allow' | 'deny'; port: number; proto?: 'tcp' | 'udp'; from?: string }) =>
    request<FirewallStatus>('/system/firewall/rules', { method: 'POST', body: JSON.stringify(payload) }),
  deleteFirewallRule: (number: number) =>
    request<FirewallStatus>(`/system/firewall/rules/${number}`, { method: 'DELETE' }),

  getSecurityStatus: () => request<JailStatus[]>('/system/security/status'),
  banIp: (jail: string, ip: string) =>
    request<JailStatus[]>('/system/security/ban', { method: 'POST', body: JSON.stringify({ jail, ip }) }),
  unbanIp: (jail: string, ip: string) =>
    request<JailStatus[]>('/system/security/unban', { method: 'POST', body: JSON.stringify({ jail, ip }) }),

  listAppCatalog: () => request<AppDefinition[]>('/apps/catalog'),
  listInstalledApps: () => request<InstalledApp[]>('/apps'),
  installApp: (payload: { domainId: string; appId: string; targetPath?: string }) =>
    request<InstalledApp>('/apps', { method: 'POST', body: JSON.stringify(payload) }),
  removeInstalledApp: (id: string) => request<void>(`/apps/${id}`, { method: 'DELETE' }),

  getSshTunnelStatus: () => request<SshTunnelStatus>('/system/ssh-tunnel'),
  saveSshTunnelConfig: (payload: {
    host: string;
    port?: number;
    username: string;
    localProxyPort?: number;
    privateKey?: string;
    enabled?: boolean;
  }) => request<SshTunnelStatus>('/system/ssh-tunnel', { method: 'PUT', body: JSON.stringify(payload) }),
  removeSshTunnel: () => request<{ success: boolean }>('/system/ssh-tunnel', { method: 'DELETE' }),
  testSshTunnel: () => request<{ success: boolean; publicIp: string }>('/system/ssh-tunnel/test', { method: 'POST' }),

  listDnsRecords: (domainId: string) =>
    request<DnsRecord[]>(`/dns-records?${new URLSearchParams({ domainId })}`),
  createDnsRecord: (payload: {
    domainId: string;
    type: DnsRecord['type'];
    name: string;
    value: string;
    ttl?: number;
    priority?: number;
  }) => request<DnsRecord>('/dns-records', { method: 'POST', body: JSON.stringify(payload) }),
  updateDnsRecord: (
    id: string,
    payload: Partial<{
      type: DnsRecord['type'];
      name: string;
      value: string;
      ttl: number;
      priority: number;
    }>,
  ) => request<DnsRecord>(`/dns-records/${id}`, { method: 'PATCH', body: JSON.stringify(payload) }),
  deleteDnsRecord: (id: string) => request<void>(`/dns-records/${id}`, { method: 'DELETE' }),

  listEmailAccounts: (domainId: string) =>
    request<EmailAccount[]>(`/email-accounts?${new URLSearchParams({ domainId })}`),
  createEmailAccount: (payload: { domainId: string; localPart: string; quotaMb?: number }) =>
    request<EmailAccount & { password: string }>('/email-accounts', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  resetEmailAccountPassword: (id: string) =>
    request<{ password: string }>(`/email-accounts/${id}/reset-password`, { method: 'POST' }),
  deleteEmailAccount: (id: string) => request<void>(`/email-accounts/${id}`, { method: 'DELETE' }),

  listApiKeys: () => request<ApiKey[]>('/api-keys'),
  createApiKey: (label: string) =>
    request<ApiKey & { token: string }>('/api-keys', { method: 'POST', body: JSON.stringify({ label }) }),
  revokeApiKey: (id: string) => request<{ success: boolean }>(`/api-keys/${id}`, { method: 'DELETE' }),
};

export interface Domain {
  id: string;
  name: string;
  documentRoot: string;
  runtime: 'STATIC' | 'PHP' | 'NODE' | 'PYTHON';
  phpVersion?: string | null;
  nodeVersion?: string | null;
  pythonVersion?: string | null;
  appEntryPoint?: string | null;
  appPort?: number | null;
  publicSubdir?: string | null;
  sslEnabled: boolean;
  sslIssuedAt?: string | null;
  sslExpiresAt?: string | null;
  isSuspended: boolean;
  createdAt: string;
}

export interface PanelDatabase {
  id: string;
  name: string;
  engine: 'MYSQL' | 'POSTGRES';
  username: string;
  domainId: string;
  createdAt: string;
}

export interface FileEntry {
  name: string;
  type: 'file' | 'directory';
  size: number;
  modifiedAt: string;
}

export interface CronJob {
  id: string;
  schedule: string;
  command: string;
  isEnabled: boolean;
  ownerId: string;
  createdAt: string;
}

export interface Backup {
  id: string;
  fileName: string;
  sizeBytes: number;
  status: 'PENDING' | 'COMPLETE' | 'FAILED';
  error?: string | null;
  createdAt: string;
  domainId: string;
  domain: { name: string };
}

export interface FirewallRule {
  number: number;
  to: string;
  action: string;
  from: string;
}

export interface FirewallStatus {
  active: boolean;
  rules: FirewallRule[];
}

export interface JailStatus {
  name: string;
  currentlyFailed: number;
  totalFailed: number;
  currentlyBanned: number;
  totalBanned: number;
  bannedIps: string[];
}

export interface AppDefinition {
  id: string;
  name: string;
  description: string;
  version: string;
  requiresDatabase: boolean;
}

export interface InstalledApp {
  id: string;
  appId: string;
  version: string;
  targetPath: string;
  status: 'INSTALLING' | 'COMPLETE' | 'FAILED';
  error?: string | null;
  createdAt: string;
  domainId: string;
  domain: { name: string };
  databaseId?: string | null;
}

// Server-wide fallback connectivity: an admin-configured SSH tunnel exposed
// locally as a SOCKS5 proxy, for when direct outbound connectivity to a given
// upstream is blocked/unreliable (e.g. sanctions-related restrictions).
export interface SshTunnelStatus {
  configured: boolean;
  active: boolean;
  enabled: boolean;
  hasPrivateKey: boolean;
  id?: string;
  host?: string;
  port?: number;
  username?: string;
  localProxyPort?: number;
  lastError?: string | null;
  updatedAt?: string;
}

export interface DnsRecord {
  id: string;
  type: 'A' | 'AAAA' | 'CNAME' | 'MX' | 'TXT' | 'NS' | 'SRV';
  name: string;
  value: string;
  ttl: number;
  priority?: number | null;
  domainId: string;
  createdAt: string;
  updatedAt: string;
}

export interface EmailAccount {
  id: string;
  localPart: string;
  quotaMb: number;
  domainId: string;
  createdAt: string;
  updatedAt: string;
}

// External API keys let a separate system (e.g. a custom site-builder
// product) authenticate against this panel's entire API with the same
// privileges as the owning user, via an `X-API-Key` header instead of a
// login session.
export interface ApiKey {
  id: string;
  label: string;
  prefix: string;
  lastUsedAt?: string | null;
  revokedAt?: string | null;
  createdAt: string;
  userId: string;
}
