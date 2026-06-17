import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import type { FsEntry, FsListResponse } from '../protocol.js';

/**
 * List the contents of a directory for the working-directory picker.
 * Directories are returned first (sorted), then files. Hidden entries are
 * omitted unless `includeHidden` is set.
 */
export function listDir(dirPath: string, includeHidden = false): FsListResponse {
  const resolved = path.resolve(expandHome(dirPath));
  const stat = fs.statSync(resolved); // throws if missing → caller maps to 404
  if (!stat.isDirectory()) throw new Error('Not a directory');

  let names: string[];
  try {
    names = fs.readdirSync(resolved);
  } catch (e: any) {
    if (e?.code === 'EACCES' || e?.code === 'EPERM') {
      const err = new Error('Permission denied');
      (err as any).code = 'EACCES';
      throw err;
    }
    throw e;
  }

  const entries: FsEntry[] = [];
  for (const name of names) {
    if (!includeHidden && name.startsWith('.')) continue;
    const full = path.join(resolved, name);
    let isDir = false;
    let isSymlink = false;
    try {
      const ls = fs.lstatSync(full);
      isSymlink = ls.isSymbolicLink();
      isDir = isSymlink ? safeIsDir(full) : ls.isDirectory();
    } catch {
      continue; // unreadable entry — skip
    }
    entries.push({ name, path: full, isDir, isSymlink });
  }

  entries.sort((a, b) => {
    if (a.isDir !== b.isDir) return a.isDir ? -1 : 1;
    return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
  });

  const parent = path.dirname(resolved);
  return {
    path: resolved,
    parent: parent === resolved ? null : parent,
    entries,
  };
}

function safeIsDir(p: string): boolean {
  try {
    return fs.statSync(p).isDirectory();
  } catch {
    return false;
  }
}

function expandHome(p: string): string {
  if (p === '~') return os.homedir();
  if (p.startsWith('~/')) return path.join(os.homedir(), p.slice(2));
  return p;
}

/** Create a new directory (used by the picker's "new folder" affordance). */
export function makeDir(parent: string, name: string): string {
  const safeName = name.replace(/[/\\]/g, '').trim();
  if (!safeName) throw new Error('Invalid folder name');
  const full = path.join(path.resolve(expandHome(parent)), safeName);
  fs.mkdirSync(full, { recursive: false });
  return full;
}
