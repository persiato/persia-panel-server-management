// Identifiers that end up interpolated into SQL/DDL (neither MySQL nor
// PostgreSQL support parameter binding for identifiers). Keep this strict:
// letters, digits, underscore only, must start with a letter, max 32 chars
// so that `${prefix}_${suffix}` still fits MySQL's 32-char username limit.
const SQL_IDENTIFIER_RE = /^[a-zA-Z][a-zA-Z0-9_]{0,31}$/;

export function isValidSqlIdentifier(value: string): boolean {
  return SQL_IDENTIFIER_RE.test(value);
}

export function assertValidSqlIdentifier(value: string): void {
  if (!isValidSqlIdentifier(value)) {
    throw new Error(`Invalid identifier: ${value}`);
  }
}
