// Validates a user-supplied relative install path (e.g. the "phpmyadmin" in
// "/phpmyadmin") before it is ever joined onto a domain's documentRoot. Only
// simple path segments are allowed — no leading slash, no "..", no
// backslash — so a malicious targetPath can never escape the document root
// even before path.resolve()/realpath() checks run.
const RELATIVE_PATH_RE = /^[a-zA-Z0-9](?:[a-zA-Z0-9_/-]{0,118}[a-zA-Z0-9])?$/;

export function isValidRelativePath(value: string): boolean {
  if (value === '') return true;
  if (!RELATIVE_PATH_RE.test(value)) return false;
  return !value
    .split('/')
    .some((segment) => segment === '' || segment === '..');
}

export function assertValidRelativePath(value: string): void {
  if (!isValidRelativePath(value)) {
    throw new Error(`Invalid install path: ${value}`);
  }
}
