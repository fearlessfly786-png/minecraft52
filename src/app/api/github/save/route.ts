import { NextResponse } from 'next/server';
import { execFile } from 'child_process';
import { spawn } from 'child_process';
import { randomUUID } from 'node:crypto';
import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';

/**
 * POST /api/github/save   → starts an export job, returns { ok, jobId } AT ONCE
 * GET  /api/github/save?jobId=… → { ok, status, stage, progress, files, url, error }
 *
 * Pushes the ENTIRE game source (src/, public/, prisma/ + root config files)
 * to the caller's GitHub account.
 *
 * Body: { token: string; repo: string }
 *   - token: a GitHub personal access token. Classic token needs the "repo"
 *     scope; a fine-grained token needs Contents read/write (+ Administration
 *     read/write when the repository has to be created).
 *   - repo:  repository name. Created under the caller's account when it does
 *     not exist yet; otherwise the source is pushed on top of / over whatever
 *     is already there.
 *
 * WHY ASYNC?  The full source is >100 MB and the sandbox preview gateway cuts
 * proxied responses off at ~30 s. The original synchronous implementation
 * uploaded everything in one request, so the browser always received
 * "502 Bad Gateway" while the server quietly kept working — the classic
 * "GitHub request failed (502)" loop. The export now runs as a background
 * job in this Node process; the browser polls GET for live stage/percent.
 *
 * WHY IT IS FAST ON REPEAT SAVES: uploads go through a PERSISTENT object
 * cache repository (a plain git repo under the OS temp dir). Every save
 * re-syncs that working tree, commits, and pushes — git only ever uploads
 * blobs the remote is missing, so the first save transfers ~115 MB and every
 * later save takes seconds. The cache never stores the token: the push URL
 * is passed per-command on argv and never written to disk.
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const GITHUB_API = 'https://api.github.com';
const MAX_FILE_BYTES = 95 * 1024 * 1024; // GitHub hard-rejects blobs > 100 MB
const GIT_TIMEOUT_MS = 240_000; // hard cap per git command (anti-hang)
const JOB_TTL_MS = 15 * 60_000; // finished jobs are garbage after 15 minutes
const MAX_JOBS = 50;

/** Source directories pushed to the repository (relative to the project root). */
const SOURCE_DIRS = ['src', 'public', 'prisma'];

/** Standalone config / lock files pushed from the project root. */
const SOURCE_ROOT_FILES = new Set([
  'package.json',
  'bun.lock',
  'tsconfig.json',
  'next.config.ts',
  'postcss.config.mjs',
  'components.json',
  'eslint.config.mjs',
  'next-env.d.ts',
  '.gitignore',
  'README.md',
]);

/** Directories never descended into while walking the source tree. */
const SKIP_DIRS = new Set(['node_modules', '.next', '.git', '.turbo', '.vercel']);

/** Long-lived folder holding the git object cache between saves. */
const CACHE_ROOT = path.join(os.tmpdir(), 'ratfire-gh-export-cache');

interface RepoFile {
  /** Slash-separated path relative to the project root. */
  path: string;
  /** Absolute source path — files are STREAM-COPIED from here into the
   *  cache working tree instead of being buffered in JS (public/ alone is
   *  >100 MB; fs.copyFile moves the bytes through the filesystem without
   *  any JS-side buffer). */
  src: string;
}

type JobStatus = 'working' | 'done' | 'error';
type JobStage = 'token' | 'repo' | 'collect' | 'commit' | 'push';

interface GhJob {
  id: string;
  status: JobStatus;
  stage: JobStage;
  /** 0-100 while the push streams its progress, otherwise null. */
  progress: number | null;
  files: number;
  url: string;
  error: string;
  createdAt: number;
  finishedAt: number | null;
}

/** Survives dev-server HMR recompiles — module scope would not. */
const globalStore = globalThis as unknown as {
  __ghExportJobs?: Map<string, GhJob>;
  __ghExportQueue?: Promise<void>;
};
const jobs: Map<string, GhJob> =
  globalStore.__ghExportJobs ?? (globalStore.__ghExportJobs = new Map());

/** Serialises exports — the object cache must not be mutated concurrently. */
const queue: Promise<void> =
  globalStore.__ghExportQueue ?? (globalStore.__ghExportQueue = Promise.resolve());

/** Error carrying the HTTP status from a failed GitHub REST call. */
class GitHubError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

/** Minimal typed GitHub REST call with consistent headers + error extraction. */
async function github(
  token: string,
  endpoint: string,
  init: RequestInit = {}
): Promise<Record<string, unknown>> {
  const res = await fetch(`${GITHUB_API}${endpoint}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'ratfire-game-source-export',
      'Content-Type': 'application/json',
      ...(init.headers ?? {}),
    },
    cache: 'no-store',
    signal: AbortSignal.timeout(20_000),
  });

  const text = await res.text();
  let payload: Record<string, unknown> = {};
  if (text) {
    try {
      payload = JSON.parse(text) as Record<string, unknown>;
    } catch {
      // non-JSON error body — fall through with the generic message
    }
  }
  if (!res.ok) {
    const message =
      (typeof payload.message === 'string' && payload.message) ||
      `GitHub API request failed (${res.status})`;
    throw new GitHubError(res.status, message);
  }
  return payload;
}

/** Strips the secret from any git output before it reaches logs or the client. */
function redact(text: string, token: string): string {
  let out = text.split(token).join('***');
  out = out.replace(/x-access-token:[^@\s]+@/g, 'x-access-token:***@');
  out = out.replace(/https:\/\/[^@\s/]+@github\.com/g, 'https://***@github.com');
  return out.slice(0, 400);
}

/** True when the error is the classic leftover-lock crash (dev restarts etc). */
function isStaleLock(detail: string): boolean {
  return /index\.lock|Unable to create .*lock/i.test(detail);
}

/** Runs one git command inside `cwd`; rejects with redacted stderr on failure. */
function runGit(args: string[], cwd: string, token: string): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(
      'git',
      args,
      {
        cwd,
        timeout: GIT_TIMEOUT_MS,
        maxBuffer: 32 * 1024 * 1024,
        env: {
          ...process.env,
          GIT_TERMINAL_PROMPT: '0',
          GIT_ASKPASS: 'echo',
          GIT_CONFIG_NOSYSTEM: '1',
          HOME: cwd, // isolate from the machine's global git credentials
        },
      },
      (error, stdout, stderr) => {
        if (error) {
          const detail = redact(
            `${stderr || stdout || error.message}`.trim(),
            token
          );
          reject(new Error(detail || 'git command failed'));
          return;
        }
        resolve(`${stdout}${stderr}`);
      }
    );
  });
}

/** runGit with one automatic retry after clearing a stale git lock file. */
async function runGitUnlocked(
  args: string[],
  cwd: string,
  token: string
): Promise<string> {
  try {
    return await runGit(args, cwd, token);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    if (!isStaleLock(detail)) throw error;
    await fs
      .rm(path.join(cwd, '.git', 'index.lock'), { force: true })
      .catch(() => {});
    return runGit(args, cwd, token);
  }
}

/**
 * The heavy step: `git push` with streamed progress. Spawn (not execFile) so
 * "Writing objects: NN%" lines update the job while the upload runs.
 */
function runPush(
  pushUrl: string,
  refspec: string,
  cwd: string,
  token: string,
  extraArgs: string[],
  onPercent: (pct: number) => void
): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(
      'git',
      ['push', ...extraArgs, '--progress', pushUrl, refspec],
      {
        cwd,
        env: {
          ...process.env,
          GIT_TERMINAL_PROMPT: '0',
          GIT_ASKPASS: 'echo',
          GIT_CONFIG_NOSYSTEM: '1',
          HOME: cwd,
        },
      }
    );

    let tail = '';
    let lastErrorLine = '';
    let timedOut = false;

    const swallow = (chunk: Buffer) => {
      const text = chunk.toString();
      for (const line of text.split(/[\r\n]+/)) {
        if (!line.trim()) continue;
        tail = `${tail}\n${line}`.slice(-4000);
        const pct = /Writing objects:\s+(\d+)%/.exec(line);
        if (pct) onPercent(Number(pct[1]));
        if (/^(fatal|error):/i.test(line)) lastErrorLine = line.trim();
      }
    };
    child.stdout.on('data', swallow);
    child.stderr.on('data', swallow);

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGKILL');
    }, GIT_TIMEOUT_MS);

    child.on('error', (spawnError) => {
      clearTimeout(timer);
      reject(new Error(redact(spawnError.message, token)));
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (code === 0) {
        resolve();
        return;
      }
      const detail =
        lastErrorLine || tail.trim() || `git push exited with code ${code}`;
      if (timedOut) {
        reject(new Error('Git push timed out — network to GitHub is too slow right now. Press Save again; repeat saves resume from cached objects.'));
        return;
      }
      reject(new Error(redact(detail, token)));
    });
  });
}

/** Recursively collects source files from one directory. */
async function collectDir(
  root: string,
  dir: string,
  out: RepoFile[]
): Promise<void> {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name.startsWith('.') || SKIP_DIRS.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      await collectDir(root, full, out);
    } else if (entry.isFile()) {
      const stat = await fs.stat(full);
      if (stat.size > MAX_FILE_BYTES) continue;
      const rel = path.relative(root, full).split(path.sep).join('/');
      out.push({ path: rel, src: full });
    }
  }
}

/** Gathers every file that belongs in the exported repository. */
async function collectFiles(root: string): Promise<RepoFile[]> {
  const out: RepoFile[] = [];
  for (const dir of SOURCE_DIRS) {
    const full = path.join(root, dir);
    try {
      await fs.access(full);
    } catch {
      continue;
    }
    await collectDir(root, full, out);
  }
  for (const name of SOURCE_ROOT_FILES) {
    try {
      const full = path.join(root, name);
      const stat = await fs.stat(full);
      if (stat.isFile() && stat.size <= MAX_FILE_BYTES) {
        out.push({ path: name, src: full });
      }
    } catch {
      // optional file — absent on this install
    }
  }
  return out;
}

/** Writes the collected files into the cache working tree (stream copy). */
async function writeFiles(baseDir: string, files: RepoFile[]): Promise<void> {
  await Promise.all(
    files.map(async (file) => {
      const target = path.join(baseDir, file.path);
      await fs.mkdir(path.dirname(target), { recursive: true });
      await fs.copyFile(file.src, target);
    })
  );
}

/** The full export pipeline — runs in the background, never blocks a request. */
async function runExport(job: GhJob, token: string, repoName: string): Promise<void> {
  try {
    // ---------- 1) identify the authenticated account ----------
    job.stage = 'token';
    const me = await github(token, '/user');
    const login = typeof me.login === 'string' ? me.login : '';
    if (!login) {
      throw new GitHubError(
        401,
        'Could not resolve the GitHub account for this token.'
      );
    }

    // ---------- 2) find or create the repository ----------
    job.stage = 'repo';
    let htmlUrl = `https://github.com/${login}/${repoName}`;
    let defaultBranch = 'main';

    try {
      const existing = await github(token, `/repos/${login}/${repoName}`);
      htmlUrl =
        typeof existing.html_url === 'string' ? existing.html_url : htmlUrl;
      if (
        typeof existing.default_branch === 'string' &&
        existing.default_branch
      ) {
        defaultBranch = existing.default_branch;
      }
    } catch (error) {
      if (error instanceof GitHubError && error.status === 404) {
        const newRepo = await github(token, '/user/repos', {
          method: 'POST',
          body: JSON.stringify({
            name: repoName,
            description:
              'RATFIRE — third-person three.js game built with Next.js',
            private: false,
            auto_init: false,
          }),
        });
        htmlUrl =
          typeof newRepo.html_url === 'string' ? newRepo.html_url : htmlUrl;
        if (
          typeof newRepo.default_branch === 'string' &&
          newRepo.default_branch
        ) {
          defaultBranch = newRepo.default_branch;
        }
      } else {
        throw error;
      }
    }

    // ---------- 3) collect every source file from disk ----------
    job.stage = 'collect';
    const files = await collectFiles(process.cwd());
    if (files.length === 0) {
      throw new Error('No source files found on the server to upload.');
    }
    job.files = files.length;

    // ---------- 4) sync the persistent object cache and push ----------
    job.stage = 'commit';
    await fs.mkdir(CACHE_ROOT, { recursive: true });
    const gitDir = path.join(CACHE_ROOT, '.git');
    try {
      await fs.access(gitDir);
    } catch {
      await runGitUnlocked(['init', '-b', 'main', '.'], CACHE_ROOT, token);
    }
    // Drop strays from an interrupted previous run, then re-sync the tree.
    await runGitUnlocked(['clean', '-fdq'], CACHE_ROOT, token).catch(() => {});
    await writeFiles(CACHE_ROOT, files);
    await runGitUnlocked(['add', '-A'], CACHE_ROOT, token);
    const committed = await runGitUnlocked(
      [
        '-c',
        'user.name=RATFIRE Export',
        '-c',
        'user.email=noreply@users.noreply.github.com',
        'commit',
        '-m',
        `Add RATFIRE game source (${new Date().toISOString()})`,
        '--no-gpg-sign',
      ],
      CACHE_ROOT,
      token
    ).catch((commitError) => {
      const detail = commitError instanceof Error ? commitError.message : '';
      if (/nothing to commit|no changes added/i.test(detail)) return '';
      throw commitError;
    });
    if (!committed) {
      // Working tree identical to the last export — refresh the tip anyway.
      await runGitUnlocked(
        [
          '-c',
          'user.name=RATFIRE Export',
          '-c',
          'user.email=noreply@users.noreply.github.com',
          'commit',
          '--allow-empty',
          '-m',
          `Add RATFIRE game source (${new Date().toISOString()})`,
          '--no-gpg-sign',
        ],
        CACHE_ROOT,
        token
      ).catch(() => {});
    }

    job.stage = 'push';
    job.progress = 0;
    const pushUrl = `https://x-access-token:${token}@github.com/${login}/${repoName}.git`;
    const refspec = `HEAD:refs/heads/${defaultBranch}`;
    try {
      await runPush(pushUrl, refspec, CACHE_ROOT, token, [], (pct) => {
        job.progress = pct;
      });
    } catch (pushError) {
      const detail =
        pushError instanceof Error ? pushError.message : String(pushError);
      if (/non-fast-forward|fetch first|rejected|stale info/i.test(detail)) {
        // Remote already has unrelated history — the export owns the
        // repository content, so overwrite it with the current source tree.
        await runPush(
          pushUrl,
          refspec,
          CACHE_ROOT,
          token,
          ['--force'],
          (pct) => {
            job.progress = pct;
          }
        );
      } else if (/authentication|could not read|403/i.test(detail)) {
        throw new GitHubError(
          401,
          'GitHub rejected the push for this token — make sure it has write access to the repository (classic token with the "repo" scope, or a fine-grained token with Contents read & write).'
        );
      } else {
        throw new Error(`Git push failed: ${detail}`);
      }
    }

    job.status = 'done';
    job.url = htmlUrl;
  } catch (error) {
    job.status = 'error';
    const isTimeout = error instanceof Error && error.name === 'TimeoutError';
    let message = error instanceof Error ? error.message : 'Unexpected error.';
    if (isTimeout) {
      message =
        'A GitHub request timed out (network or GitHub was slow) — press Save again to retry.';
    }
    const isGitHubError = error instanceof GitHubError;
    const hint =
      isGitHubError && (error.status === 401 || error.status === 403)
        ? ' — check that the token is valid and has the required permissions (classic token with the "repo" scope, or a fine-grained token with Contents + Administration read & write).'
        : '';
    job.error = `${message}${hint}`;
  } finally {
    job.progress = null;
    job.finishedAt = Date.now();
  }
}

/** Prunes finished jobs so the in-memory store cannot grow without bound. */
function pruneJobs(): void {
  const now = Date.now();
  for (const [id, job] of jobs) {
    if (job.finishedAt && now - job.finishedAt > JOB_TTL_MS) jobs.delete(id);
  }
  if (jobs.size <= MAX_JOBS) return;
  const finished = [...jobs.values()]
    .filter((job) => job.finishedAt)
    .sort((a, b) => (a.finishedAt ?? 0) - (b.finishedAt ?? 0));
  while (jobs.size > MAX_JOBS && finished.length > 0) {
    const oldest = finished.shift();
    if (oldest) jobs.delete(oldest.id);
  }
}

export async function POST(request: Request) {
  let body: { token?: unknown; repo?: unknown };
  try {
    body = (await request.json()) as { token?: unknown; repo?: unknown };
  } catch {
    return NextResponse.json(
      { ok: false, error: 'Invalid request body.' },
      { status: 400 }
    );
  }

  const token = typeof body.token === 'string' ? body.token.trim() : '';
  const repoName = typeof body.repo === 'string' ? body.repo.trim() : '';

  if (!token) {
    return NextResponse.json(
      { ok: false, error: 'A GitHub personal access token is required.' },
      { status: 400 }
    );
  }
  if (!/^[A-Za-z0-9_.-]{1,100}$/.test(repoName)) {
    return NextResponse.json(
      { ok: false, error: 'Repository name may only contain letters, numbers, dots, dashes and underscores.' },
      { status: 400 }
    );
  }

  pruneJobs();

  const job: GhJob = {
    id: randomUUID(),
    status: 'working',
    stage: 'token',
    progress: null,
    files: 0,
    url: '',
    error: '',
    createdAt: Date.now(),
    finishedAt: null,
  };
  jobs.set(job.id, job);

  // Chain onto the queue so concurrent saves reuse the object cache safely.
  globalStore.__ghExportQueue = queue
    .finally(() => runExport(job, token, repoName))
    .catch(() => {
      // runExport never throws (it captures into job.error) — belt & braces.
    });

  // Answer IMMEDIATELY — no proxy in front of this server can time the
  // request out any more, which is exactly what produced the old 502s.
  return NextResponse.json({ ok: true, jobId: job.id });
}

export async function GET(request: Request) {
  const jobId = new URL(request.url).searchParams.get('jobId') ?? '';
  const job = jobId ? jobs.get(jobId) : undefined;
  if (!job) {
    return NextResponse.json(
      { ok: false, error: 'Unknown or expired save job — please start again.' },
      { status: 404 }
    );
  }
  return NextResponse.json({
    ok: true,
    status: job.status,
    stage: job.stage,
    progress: job.progress,
    files: job.files,
    url: job.url,
    error: job.error,
  });
}
