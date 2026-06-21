import { execFile } from 'node:child_process';
import { stat, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { GitStatusDTO, GitFileChange } from '../protocol.js';

/** Run git with array args (no shell, so no injection) inside `cwd`. */
function git(cwd: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile('git', args, { cwd, timeout: 8000, maxBuffer: 4 * 1024 * 1024 }, (err, stdout) => {
      if (err) reject(err);
      else resolve(stdout);
    });
  });
}

/** Like `git()` but resolves stdout even on a non-zero exit. `git diff --no-index`
 *  exits 1 when there ARE differences, so for those we still want the output. */
function gitOut(cwd: string, args: string[]): Promise<string> {
  return new Promise((resolve) => {
    execFile('git', args, { cwd, timeout: 8000, maxBuffer: 8 * 1024 * 1024 }, (_err, stdout) => {
      resolve(stdout || '');
    });
  });
}

/** Parse the `## branch...upstream [ahead N, behind M]` porcelain header. */
function parseBranchLine(line: string): { branch?: string; ahead?: number; behind?: number } {
  // e.g. "## main...origin/main [ahead 2, behind 1]" or "## main" or "## HEAD (no branch)"
  const m = line.match(/^## (?:(?:Initial commit on |No commits yet on )?)([^.\s]+)/);
  const branch = m ? m[1] : undefined;
  const ahead = line.match(/ahead (\d+)/);
  const behind = line.match(/behind (\d+)/);
  return {
    branch: branch === 'HEAD' ? undefined : branch,
    ahead: ahead ? Number(ahead[1]) : undefined,
    behind: behind ? Number(behind[1]) : undefined,
  };
}

/** Sum insertions/deletions from a `git diff --shortstat` line. */
function parseShortstat(out: string): { insertions: number; deletions: number } {
  const ins = out.match(/(\d+) insertion/);
  const del = out.match(/(\d+) deletion/);
  return { insertions: ins ? Number(ins[1]) : 0, deletions: del ? Number(del[1]) : 0 };
}

/**
 * Unified diff for a single file in the working tree. `path` is interpreted
 * relative to `cwd` — the same basis `git status --porcelain` used to produce it,
 * so the two stay consistent regardless of where the session's cwd sits.
 *
 * Tracked files: staged + unstaged changes vs HEAD (falls back to plain
 * worktree diff when there's no HEAD yet). Untracked files: synthesized as an
 * all-added diff via `--no-index`.
 */
export async function gitDiff(cwd: string, path: string): Promise<string> {
  try {
    await git(cwd, ['rev-parse', '--is-inside-work-tree']);
  } catch {
    return '';
  }

  // Untracked file? `git diff` won't show it — synthesize an all-added diff.
  const tracked = await git(cwd, ['ls-files', '--error-unmatch', '--', path])
    .then(() => true)
    .catch(() => false);
  if (!tracked) {
    // --no-index exits 1 when differences exist, so use the fail-tolerant runner.
    return gitOut(cwd, ['diff', '--no-index', '--', '/dev/null', path]);
  }

  let out = await git(cwd, ['diff', 'HEAD', '--', path]).catch(() => '');
  if (!out.trim()) out = await git(cwd, ['diff', '--', path]).catch(() => '');
  return out;
}

export async function gitStatus(cwd: string): Promise<GitStatusDTO> {
  try {
    await git(cwd, ['rev-parse', '--is-inside-work-tree']);
  } catch {
    return { isRepo: false, files: [], insertions: 0, deletions: 0, clean: true };
  }

  const [statusOut, unstaged, staged] = await Promise.all([
    // `--untracked-files=all` expands new directories into individual files so
    // each one can be opened and diffed (a collapsed "dir/" entry can't be).
    git(cwd, ['status', '--porcelain=v1', '--branch', '--untracked-files=all']).catch(() => ''),
    git(cwd, ['diff', '--shortstat']).catch(() => ''),
    git(cwd, ['diff', '--cached', '--shortstat']).catch(() => ''),
  ]);

  let branch: string | undefined;
  let ahead: number | undefined;
  let behind: number | undefined;
  const files: GitFileChange[] = [];

  for (const raw of statusOut.split('\n')) {
    if (!raw) continue;
    if (raw.startsWith('## ')) {
      const parsed = parseBranchLine(raw);
      branch = parsed.branch;
      ahead = parsed.ahead;
      behind = parsed.behind;
      continue;
    }
    // "XY <path>" — X = index/staged side, Y = worktree side.
    const code = raw.slice(0, 2);
    let path = raw.slice(3);
    // Renames look like "R  old -> new"; keep the new path.
    const arrow = path.indexOf(' -> ');
    if (arrow >= 0) path = path.slice(arrow + 4);
    files.push({ path, code, staged: code[0] !== ' ' && code[0] !== '?' });
  }

  const u = parseShortstat(unstaged);
  const s = parseShortstat(staged);

  // `--shortstat` only covers tracked changes; untracked ('??') files contribute
  // nothing. Count their lines so the +N stat reflects newly-added files too
  // (e.g. a whole new directory). Bounded reads, binary files skipped.
  let untrackedInsertions = 0;
  await Promise.all(
    files
      .filter((f) => f.code === '??')
      .map(async (f) => {
        try {
          const abs = join(cwd, f.path);
          const st = await stat(abs);
          if (!st.isFile() || st.size > 5_000_000) return;
          const buf = await readFile(abs);
          if (buf.includes(0)) return; // binary
          let lines = 0;
          for (let i = 0; i < buf.length; i++) if (buf[i] === 0x0a) lines++;
          if (buf.length > 0 && buf[buf.length - 1] !== 0x0a) lines++; // last line w/o newline
          untrackedInsertions += lines;
        } catch {
          /* unreadable / quoted path — skip */
        }
      }),
  );

  return {
    isRepo: true,
    branch,
    ahead,
    behind,
    files,
    insertions: u.insertions + s.insertions + untrackedInsertions,
    deletions: u.deletions + s.deletions,
    clean: files.length === 0,
  };
}
