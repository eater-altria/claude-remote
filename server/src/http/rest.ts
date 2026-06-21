import express, { type Request, type Response, type NextFunction } from 'express';
import cors from 'cors';
import path from 'node:path';
import fs from 'node:fs';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import type { AppConfig } from '../config.js';
import type { SessionManager } from '../claude/manager.js';
import { listDir, makeDir } from './fsbrowse.js';
import { gitStatus, gitDiff } from './git.js';
import type { CreateSessionRequest, HealthResponse, PermissionDecision, QuestionAnswer } from '../protocol.js';
import { PROTOCOL_VERSION } from '../protocol.js';
import { createLogger } from '../logger.js';

const log = createLogger('rest');
const require = createRequire(import.meta.url);

function claudeCodeVersion(): string {
  try {
    const entry = require.resolve('@anthropic-ai/claude-agent-sdk');
    const pkgPath = path.join(path.dirname(entry), 'package.json');
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
    return pkg.claudeCodeVersion ?? pkg.version ?? 'unknown';
  } catch {
    return 'unknown';
  }
}

export function buildApp(cfg: AppConfig, manager: SessionManager) {
  const app = express();
  app.use(cors());
  app.use(express.json({ limit: '4mb' }));

  // --- Auth middleware (bearer token) -------------------------------------
  const auth = (req: Request, res: Response, next: NextFunction) => {
    if (req.path === '/api/health') return next();
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : (req.query.token as string | undefined);
    if (token !== cfg.token) return res.status(401).json({ error: 'Unauthorized' });
    next();
  };
  app.use(auth);

  const wrap =
    (fn: (req: Request, res: Response) => Promise<void> | void) => async (req: Request, res: Response) => {
      try {
        await fn(req, res);
      } catch (e: any) {
        const code = e?.code === 'ENOENT' ? 404 : e?.code === 'EACCES' ? 403 : 400;
        log.warn(`${req.method} ${req.path} -> ${code}: ${e?.message}`);
        res.status(code).json({ error: e?.message || 'Error' });
      }
    };

  // --- Health -------------------------------------------------------------
  app.get(
    '/api/health',
    wrap((_req, res) => {
      const body: HealthResponse = {
        ok: true,
        name: 'claude-remote-server',
        version: '1.0.0',
        protocol: PROTOCOL_VERSION,
        claudeCodeVersion: claudeCodeVersion(),
        platform: process.platform,
      };
      res.json(body);
    }),
  );

  // --- Filesystem picker --------------------------------------------------
  app.get(
    '/api/fs/roots',
    wrap((_req, res) => {
      res.json({ roots: cfg.fsRoots });
    }),
  );

  app.get(
    '/api/fs/list',
    wrap((req, res) => {
      const p = (req.query.path as string) || cfg.fsRoots[0]?.path || process.cwd();
      const includeHidden = req.query.hidden === '1' || req.query.hidden === 'true';
      res.json(listDir(p, includeHidden));
    }),
  );

  app.post(
    '/api/fs/mkdir',
    wrap((req, res) => {
      const { parent, name } = req.body as { parent: string; name: string };
      const full = makeDir(parent, name);
      res.json({ path: full });
    }),
  );

  // --- Capabilities (commands / models / agents for the palette) ----------
  app.get(
    '/api/capabilities',
    wrap((_req, res) => {
      res.json({ capabilities: manager.getCapabilities() });
    }),
  );

  // --- Sessions -----------------------------------------------------------
  app.get(
    '/api/sessions',
    wrap((_req, res) => {
      res.json({ sessions: manager.list() });
    }),
  );

  app.post(
    '/api/sessions',
    wrap(async (req, res) => {
      const body = req.body as CreateSessionRequest;
      if (!body?.cwd) {
        res.status(400).json({ error: 'cwd is required' });
        return;
      }
      const meta = await manager.create(body);
      res.json({ session: meta });
    }),
  );

  app.get(
    '/api/sessions/:id',
    wrap((req, res) => {
      const meta = manager.getMeta(req.params.id);
      if (!meta) {
        res.status(404).json({ error: 'Not found' });
        return;
      }
      res.json({ session: meta });
    }),
  );

  app.get(
    '/api/sessions/:id/messages',
    wrap(async (req, res) => {
      const meta = manager.getMeta(req.params.id);
      if (!meta) {
        res.status(404).json({ error: 'Not found' });
        return;
      }
      const events = await manager.getHistory(req.params.id);
      res.json({ events, session: meta });
    }),
  );

  app.delete(
    '/api/sessions/:id',
    wrap(async (req, res) => {
      const ok = await manager.delete(req.params.id);
      res.json({ deleted: ok });
    }),
  );

  // --- Git status for a session's working directory ------------------------
  app.get(
    '/api/sessions/:id/git',
    wrap(async (req, res) => {
      const meta = manager.getMeta(req.params.id);
      if (!meta) {
        res.status(404).json({ error: 'Not found' });
        return;
      }
      res.json({ git: await gitStatus(meta.cwd) });
    }),
  );

  // --- Unified diff for a single file in a session's working directory ------
  app.get(
    '/api/sessions/:id/git/diff',
    wrap(async (req, res) => {
      const meta = manager.getMeta(req.params.id);
      if (!meta) {
        res.status(404).json({ error: 'Not found' });
        return;
      }
      const filePath = typeof req.query.path === 'string' ? req.query.path : '';
      if (!filePath) {
        res.status(400).json({ error: 'path query parameter is required' });
        return;
      }
      res.json({ diff: await gitDiff(meta.cwd, filePath) });
    }),
  );

  // Respond to a permission / question over REST too, so a notification action
  // can resolve a prompt even when no WebSocket is currently connected.
  app.post(
    '/api/sessions/:id/permission',
    wrap(async (req, res) => {
      const { requestId, decision, remember } = req.body as { requestId: string; decision: PermissionDecision; remember?: boolean };
      if (!requestId || (decision !== 'allow' && decision !== 'deny')) {
        res.status(400).json({ error: 'requestId and decision (allow|deny) are required' });
        return;
      }
      const ok = await manager.respondPermission(req.params.id, requestId, decision, remember ?? false);
      res.json({ ok });
    }),
  );

  app.post(
    '/api/sessions/:id/question',
    wrap(async (req, res) => {
      const { requestId, answer } = req.body as { requestId: string; answer: QuestionAnswer };
      if (!requestId || !answer) {
        res.status(400).json({ error: 'requestId and answer are required' });
        return;
      }
      const ok = await manager.respondQuestion(req.params.id, requestId, answer);
      res.json({ ok });
    }),
  );

  // --- File download (files staged by the send_file tool) -----------------
  // Only fileIds explicitly staged by `send_file` are downloadable — the
  // server filesystem path never leaves the process, so this is NOT a generic
  // "download any path" endpoint.
  app.get(
    '/api/sessions/:id/files/:fileId',
    wrap((req, res) => {
      const session = manager.getLive(req.params.id);
      const file = session?.getStagedFile(req.params.fileId);
      if (!file) {
        res.status(404).json({ error: 'File is no longer available' });
        return;
      }
      let stat: fs.Stats;
      try {
        stat = fs.statSync(file.path);
      } catch {
        res.status(404).json({ error: 'File no longer exists on the server' });
        return;
      }
      res.setHeader('Content-Type', file.mime);
      res.setHeader('Content-Length', String(stat.size));
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="${file.name.replace(/[^\x20-\x7e]/g, '_')}"; filename*=UTF-8''${encodeURIComponent(file.name)}`,
      );
      const stream = fs.createReadStream(file.path);
      stream.on('error', (e) => {
        log.warn(`file stream error for ${req.params.fileId}: ${(e as Error).message}`);
        if (!res.headersSent) res.status(500).json({ error: 'Read error' });
        else res.destroy();
      });
      stream.pipe(res);
    }),
  );

  // --- File upload (phone → host) -----------------------------------------
  // The app sends raw file bytes; we persist them under the data dir (keeping
  // the user's project tree clean) and hand back an absolute path the agent can
  // Read. `name`/`mime` ride in the query string; the body is the raw file.
  app.post(
    '/api/sessions/:id/upload',
    express.raw({ type: () => true, limit: '64mb' }),
    wrap((req, res) => {
      const meta = manager.getMeta(req.params.id);
      if (!meta) {
        res.status(404).json({ error: 'Not found' });
        return;
      }
      const body = req.body;
      if (!Buffer.isBuffer(body) || body.length === 0) {
        res.status(400).json({ error: 'Empty upload' });
        return;
      }
      const rawName = typeof req.query.name === 'string' ? req.query.name : 'upload';
      const displayName = path.basename(rawName).trim() || 'upload';
      // ASCII-safe on-disk name (the absolute path is what the agent Reads);
      // the original display name is returned for the app's attachment chip.
      const safe = displayName.replace(/[^\w.\-]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 128) || 'upload';
      const dir = path.join(cfg.dataDir, 'uploads', req.params.id);
      fs.mkdirSync(dir, { recursive: true });
      const dest = path.join(dir, `${Date.now().toString(36)}-${safe}`);
      fs.writeFileSync(dest, body);
      log.info(`upload ${dest} (${body.length} bytes) for session ${req.params.id}`);
      res.json({ path: dest, name: displayName, size: body.length });
    }),
  );

  return app;
}
