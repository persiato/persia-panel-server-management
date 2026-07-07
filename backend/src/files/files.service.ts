import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import * as fs from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import * as path from 'node:path';
import { PrismaService } from '../prisma/prisma.service';

const MAX_TEXT_FILE_BYTES = 5 * 1024 * 1024; // 5MB, generous ceiling for an in-panel text editor

export interface FileEntry {
  name: string;
  type: 'file' | 'directory';
  size: number;
  modifiedAt: Date;
}

@Injectable()
export class FilesService {
  constructor(private readonly prisma: PrismaService) {}

  private async getDomainRoot(
    domainId: string,
    ownerId: string,
    isAdmin: boolean,
  ): Promise<string> {
    const domain = await this.prisma.domain.findUnique({
      where: { id: domainId },
    });
    if (!domain || (!isAdmin && domain.ownerId !== ownerId)) {
      throw new NotFoundException('Domain not found');
    }
    return domain.documentRoot;
  }

  // Resolves a user-supplied relative path against the domain root and
  // guarantees the result cannot escape that root (blocks ../ traversal,
  // absolute-path override, and symlink escapes).
  private async resolveSafePath(
    root: string,
    relativePath: string,
  ): Promise<string> {
    const normalizedRelative = path
      .normalize(relativePath ?? '.')
      .replace(/^(\.\.(\/|\\|$))+/, '');
    const resolvedRoot = await fs
      .realpath(root)
      .catch(() => path.resolve(root));
    const target = path.resolve(resolvedRoot, normalizedRelative);

    if (
      target !== resolvedRoot &&
      !target.startsWith(resolvedRoot + path.sep)
    ) {
      throw new ForbiddenException('Path escapes the allowed directory');
    }

    // If the target itself already exists, also verify its realpath (defends
    // against symlinks planted inside the root that point elsewhere).
    const real = await fs.realpath(target).catch(() => target);
    if (real !== resolvedRoot && !real.startsWith(resolvedRoot + path.sep)) {
      throw new ForbiddenException('Path escapes the allowed directory');
    }

    return target;
  }

  private rethrowAsNotFound = (err: NodeJS.ErrnoException): never => {
    if (err.code === 'ENOENT') {
      throw new NotFoundException('Path not found');
    }
    throw err;
  };

  async list(
    domainId: string,
    ownerId: string,
    isAdmin: boolean,
    relativePath: string,
  ): Promise<FileEntry[]> {
    const root = await this.getDomainRoot(domainId, ownerId, isAdmin);
    const dir = await this.resolveSafePath(root, relativePath);
    const entries = await fs
      .readdir(dir, { withFileTypes: true })
      .catch(this.rethrowAsNotFound);
    const results: FileEntry[] = [];
    for (const entry of entries) {
      const stat = await fs.stat(path.join(dir, entry.name));
      results.push({
        name: entry.name,
        type: entry.isDirectory() ? 'directory' : 'file',
        size: stat.size,
        modifiedAt: stat.mtime,
      });
    }
    return results.sort((a, b) => a.name.localeCompare(b.name));
  }

  async readText(
    domainId: string,
    ownerId: string,
    isAdmin: boolean,
    relativePath: string,
  ): Promise<string> {
    const root = await this.getDomainRoot(domainId, ownerId, isAdmin);
    const target = await this.resolveSafePath(root, relativePath);
    const stat = await fs.stat(target).catch(this.rethrowAsNotFound);
    if (stat.size > MAX_TEXT_FILE_BYTES) {
      throw new BadRequestException('File too large to open in the editor');
    }
    return fs.readFile(target, 'utf8');
  }

  async writeText(
    domainId: string,
    ownerId: string,
    isAdmin: boolean,
    relativePath: string,
    content: string,
  ): Promise<void> {
    const root = await this.getDomainRoot(domainId, ownerId, isAdmin);
    const target = await this.resolveSafePath(root, relativePath);
    await fs.writeFile(target, content, 'utf8');
  }

  async writeBuffer(
    domainId: string,
    ownerId: string,
    isAdmin: boolean,
    relativePath: string,
    data: Buffer,
  ): Promise<void> {
    const root = await this.getDomainRoot(domainId, ownerId, isAdmin);
    const target = await this.resolveSafePath(root, relativePath);
    await fs.writeFile(target, data);
  }

  async mkdir(
    domainId: string,
    ownerId: string,
    isAdmin: boolean,
    relativePath: string,
  ): Promise<void> {
    const root = await this.getDomainRoot(domainId, ownerId, isAdmin);
    const target = await this.resolveSafePath(root, relativePath);
    await fs.mkdir(target, { recursive: true });
  }

  async remove(
    domainId: string,
    ownerId: string,
    isAdmin: boolean,
    relativePath: string,
  ): Promise<void> {
    const root = await this.getDomainRoot(domainId, ownerId, isAdmin);
    if (path.normalize(relativePath ?? '.') === '.') {
      throw new BadRequestException('Cannot delete the document root');
    }
    const target = await this.resolveSafePath(root, relativePath);
    await fs.rm(target, { recursive: true, force: true });
  }

  async rename(
    domainId: string,
    ownerId: string,
    isAdmin: boolean,
    relativePath: string,
    newName: string,
  ): Promise<void> {
    if (
      newName.includes('/') ||
      newName.includes('\\') ||
      newName === '.' ||
      newName === '..'
    ) {
      throw new BadRequestException('Invalid new name');
    }
    const root = await this.getDomainRoot(domainId, ownerId, isAdmin);
    const source = await this.resolveSafePath(root, relativePath);
    const destination = await this.resolveSafePath(
      root,
      path.join(path.dirname(relativePath), newName),
    );
    await fs.rename(source, destination);
  }

  async getReadableStream(
    domainId: string,
    ownerId: string,
    isAdmin: boolean,
    relativePath: string,
  ) {
    const root = await this.getDomainRoot(domainId, ownerId, isAdmin);
    const target = await this.resolveSafePath(root, relativePath);
    const stat = await fs.stat(target).catch(this.rethrowAsNotFound);
    if (stat.isDirectory()) {
      throw new BadRequestException('Cannot download a directory');
    }
    return {
      stream: createReadStream(target),
      size: stat.size,
      name: path.basename(target),
    };
  }
}
