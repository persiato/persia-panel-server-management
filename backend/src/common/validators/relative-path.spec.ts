import { assertValidRelativePath, isValidRelativePath } from './relative-path';

describe('relative-path validator', () => {
  it('accepts the empty string (install at document root)', () => {
    expect(isValidRelativePath('')).toBe(true);
  });

  it('accepts simple alphanumeric segments', () => {
    expect(isValidRelativePath('phpmyadmin')).toBe(true);
    expect(isValidRelativePath('blog')).toBe(true);
    expect(isValidRelativePath('my-app_v2')).toBe(true);
  });

  it('accepts nested segments', () => {
    expect(isValidRelativePath('tools/phpmyadmin')).toBe(true);
  });

  it('rejects a leading slash', () => {
    expect(isValidRelativePath('/phpmyadmin')).toBe(false);
  });

  it('rejects a trailing slash (empty final segment)', () => {
    expect(isValidRelativePath('phpmyadmin/')).toBe(false);
  });

  it('rejects directory traversal', () => {
    expect(isValidRelativePath('../etc/passwd')).toBe(false);
    expect(isValidRelativePath('foo/../../etc')).toBe(false);
  });

  it('rejects backslashes', () => {
    expect(isValidRelativePath('foo\\bar')).toBe(false);
  });

  it('rejects empty segments from double slashes', () => {
    expect(isValidRelativePath('foo//bar')).toBe(false);
  });

  it('rejects disallowed characters', () => {
    expect(isValidRelativePath('foo bar')).toBe(false);
    expect(isValidRelativePath('foo;rm -rf')).toBe(false);
    expect(isValidRelativePath('$(whoami)')).toBe(false);
  });

  describe('assertValidRelativePath', () => {
    it('does not throw for a valid path', () => {
      expect(() => assertValidRelativePath('phpmyadmin')).not.toThrow();
    });

    it('throws for an invalid path', () => {
      expect(() => assertValidRelativePath('../escape')).toThrow(
        'Invalid install path: ../escape',
      );
    });
  });
});
