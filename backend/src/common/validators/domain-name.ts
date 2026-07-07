// Strict validation for anything that ends up in a filesystem path or shell command.
// Domain labels: letters, digits, hyphens; 1-63 chars per label; no leading/trailing hyphen.
const DOMAIN_NAME_RE =
  /^(?=.{1,253}$)(?!-)[a-zA-Z0-9-]{1,63}(?<!-)(\.(?!-)[a-zA-Z0-9-]{1,63}(?<!-))+$/;

export function isValidDomainName(name: string): boolean {
  return DOMAIN_NAME_RE.test(name);
}

export function assertValidDomainName(name: string): void {
  if (!isValidDomainName(name)) {
    throw new Error(`Invalid domain name: ${name}`);
  }
}
