import express from 'express';
import cors from 'cors';
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import QRCode from 'qrcode';
import {
  db,
  initDb,
  uid,
  todayStr,
  mapStudyLog,
  mapGameIdea,
  mapAiMessage,
  getActiveProvider,
  getPromptTemplate,
  listModulesWithStats,
  listAllReviews,
  listConversations,
  isAuthEnabled,
  verifyPassword,
  hashPassword,
  setSetting,
  deleteSetting,
  createSessionToken,
  verifySessionToken,
  rotateSessionSecret,
  resetUserData,
  recordDeletion,
} from './db.ts';
import {
  callLlm,
  streamLlm,
  extractScore,
  buildKnowledgeContext,
  formatStudyLogsForReview,
  formatIdeaForAi,
  type ChatTurn,
} from './ai.ts';
import { getTunnelStatus, startTunnel, stopTunnel } from './tunnel.ts';
import {
  configureGithubSync,
  disconnectGithub,
  getGithubConfig,
  getGithubSyncStatus,
  scheduleAutoSync,
  syncWithGithubNow,
} from './githubSync.ts';
import type { AiProvider, DashboardStats, StudyModule } from '../src/types.ts';

initDb();

const app = express();
const PORT = Number(process.env.PORT || (process.env.NODE_ENV === 'production' ? 3000 : 3001));

app.use(cors());
app.use(express.json({ limit: '5mb' }));

function parseCookies(cookieHeader: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!cookieHeader) return out;
  for (const part of cookieHeader.split(';')) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    const k = part.slice(0, idx).trim();
    const v = decodeURIComponent(part.slice(idx + 1).trim());
    out[k] = v;
  }
  return out;
}

function getRequestToken(req: express.Request): string | null {
  const cookies = parseCookies(req.headers.cookie);
  if (cookies.perlica_session) return cookies.perlica_session;
  const auth = req.headers.authorization;
  if (auth?.startsWith('Bearer ')) return auth.slice(7).trim();
  return null;
}

function setSessionCookie(res: express.Response, token: string): void {
  const maxAge = 30 * 24 * 60 * 60;
  res.setHeader(
    'Set-Cookie',
    `perlica_session=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}`
  );
}

function clearSessionCookie(res: express.Response): void {
  res.setHeader('Set-Cookie', `perlica_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`);
}

// ---------- Public Auth & Health Endpoints ----------
app.get('/api/health', (_req, res) => {
  res.json({ ok: true, time: new Date().toISOString() });
});

app.get('/api/auth/status', (req, res) => {
  const enabled = isAuthEnabled();
  const envLocked = Boolean(process.env.PERLICA_PASSWORD?.trim());
  const authenticated = !enabled || verifySessionToken(getRequestToken(req));
  res.json({ enabled, authenticated, envLocked });
});

app.post('/api/auth/login', (req, res) => {
  const { password = '' } = req.body || {};
  if (!isAuthEnabled()) {
    return res.json({ ok: true });
  }
  if (!verifyPassword(String(password))) {
    return res.status(401).json({ error: '访问密码不正确' });
  }
  const token = createSessionToken();
  setSessionCookie(res, token);
  res.json({ ok: true });
});

app.post('/api/auth/logout', (_req, res) => {
  clearSessionCookie(res);
  res.json({ ok: true });
});

// Protect all other /api/* routes when password lock is enabled
app.use('/api', (req, res, next) => {
  if (!isAuthEnabled()) return next();
  const token = getRequestToken(req);
  if (verifySessionToken(token)) return next();
  return res.status(401).json({ error: '需要输入访问密码', code: 'AUTH_REQUIRED' });
});

app.post('/api/auth/password', (req, res) => {
  if (process.env.PERLICA_PASSWORD?.trim()) {
    return res.status(400).json({ error: '当前密码由环境变量 PERLICA_PASSWORD 锁定，请在部署环境变量中修改' });
  }
  const { newPassword = '', disable = false } = req.body || {};
  if (disable) {
    deleteSetting('auth_password_hash');
    clearSessionCookie(res);
    return res.json({ ok: true, enabled: false });
  }
  const pwd = String(newPassword).trim();
  if (pwd.length < 4) {
    return res.status(400).json({ error: '密码长度至少为 4 位' });
  }
  setSetting('auth_password_hash', hashPassword(pwd));
  rotateSessionSecret();
  const token = createSessionToken();
  setSessionCookie(res, token);
  res.json({ ok: true, enabled: true });
});

// ---------- System, Network, Tunnel & Reset ----------
function getLanAddresses(): string[] {
  const nets = os.networkInterfaces();
  const addrs: string[] = [];
  for (const name of Object.keys(nets)) {
    for (const net of nets[name] || []) {
      if (net.family === 'IPv4' && !net.internal) {
        addrs.push(net.address);
      }
    }
  }
  const rank = (ip: string) => {
    if (ip.startsWith('192.168.')) return 0;
    if (ip.startsWith('10.')) return 1;
    if (/^172\.(1[6-9]|2\d|3[01])\./.test(ip)) return 2;
    if (/^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./.test(ip)) return 3; // Tailscale CGNAT
    return 4;
  };
  return addrs.sort((a, b) => rank(a) - rank(b));
}

app.get('/api/system/network', async (req, res) => {
  const hostHeader = req.headers.host || `localhost:${PORT}`;
  const reqPort = Number(hostHeader.split(':')[1]) || PORT;
  const ips = getLanAddresses();
  const urls = ips.map((ip) => `http://${ip}:${reqPort}`);
  const tailscaleUrl =
    urls.find((u) => /^http:\/\/100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./.test(u)) || null;
  const primaryLanUrl = urls[0] || null;
  let qrDataUrl: string | null = null;
  if (primaryLanUrl) {
    try {
      qrDataUrl = await QRCode.toDataURL(primaryLanUrl, {
        width: 200,
        margin: 1,
        color: { dark: '#e6e7ec', light: '#141720' },
      });
    } catch {
      qrDataUrl = null;
    }
  }
  res.json({ port: reqPort, urls, primaryLanUrl, tailscaleUrl, qrDataUrl });
});

app.get('/api/system/tunnel', async (_req, res) => {
  res.json(await getTunnelStatus());
});

app.post('/api/system/tunnel/start', async (req, res) => {
  const { token, customUrl } = req.body || {};
  const status = await startTunnel(PORT, { token, customUrl });
  res.json(status);
});

app.post('/api/system/tunnel/stop', (_req, res) => {
  res.json(stopTunnel());
});

app.post('/api/system/reset', (req, res) => {
  const { keepAiConfig = true } = req.body || {};
  resetUserData(Boolean(keepAiConfig));
  scheduleAutoSync();
  res.json({ ok: true });
});

// ---------- GitHub Private Gist Bidirectional Sync ----------
app.get('/api/sync/github/status', (_req, res) => {
  res.json(getGithubSyncStatus());
});

app.post('/api/sync/github/config', async (req, res) => {
  try {
    const { token, gistId, autoSync } = req.body || {};
    const status = await configureGithubSync({ token, gistId, autoSync });
    res.json(status);
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

app.post('/api/sync/github/now', async (_req, res) => {
  try {
    const status = await syncWithGithubNow();
    res.json(status);
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

app.post('/api/sync/github/disconnect', (_req, res) => {
  res.json(disconnectGithub());
});

// ---------- Dashboard Stats ----------
app.get('/api/dashboard/stats', (_req, res) => {
  const today = todayStr();
  const rawLogs = db.prepare('SELECT * FROM study_logs ORDER BY log_date DESC').all() as Record<string, unknown>[];
  const logs = rawLogs.map(mapStudyLog);
  const modules = listModulesWithStats();

  const todayLogs = logs.filter((l) => l.log_date === today);
  const todayMinutes = todayLogs.reduce((s, l) => s + l.duration_minutes, 0);
  let todayCompletedTasks = 0;
  let todayTotalTasks = 0;
  for (const l of todayLogs) {
    todayTotalTasks += l.tasks.length;
    todayCompletedTasks += l.tasks.filter((t) => t.done).length;
  }

  const nowDate = new Date(`${today}T00:00:00`);
  const weekAgo = new Date(nowDate);
  weekAgo.setDate(nowDate.getDate() - 6);
  const weekStartStr = weekAgo.toISOString().slice(0, 10);

  const weekMinutes = logs
    .filter((l) => l.log_date >= weekStartStr && l.log_date <= today)
    .reduce((s, l) => s + l.duration_minutes, 0);

  const dateSet = new Set(logs.map((l) => l.log_date));
  let streakDays = 0;
  const cursor = new Date(nowDate);
  if (!dateSet.has(today)) {
    cursor.setDate(cursor.getDate() - 1);
  }
  while (true) {
    const key = cursor.toISOString().slice(0, 10);
    if (dateSet.has(key)) {
      streakDays++;
      cursor.setDate(cursor.getDate() - 1);
    } else {
      break;
    }
  }

  const heatMapRec = new Map<string, { minutes: number; count: number }>();
  for (const l of logs) {
    const cur = heatMapRec.get(l.log_date) || { minutes: 0, count: 0 };
    cur.minutes += l.duration_minutes;
    cur.count += 1;
    heatMapRec.set(l.log_date, cur);
  }
  const heatmap: Array<{ date: string; minutes: number; count: number }> = [];
  for (let i = 27; i >= 0; i--) {
    const d = new Date(nowDate);
    d.setDate(nowDate.getDate() - i);
    const ds = d.toISOString().slice(0, 10);
    const entry = heatMapRec.get(ds) || { minutes: 0, count: 0 };
    heatmap.push({ date: ds, ...entry });
  }

  const ideaTotals = db
    .prepare(
      `SELECT COUNT(*) as total, SUM(CASE WHEN status IN ('spark','developing','prototype') THEN 1 ELSE 0 END) as active FROM game_ideas`
    )
    .get() as { total: number; active: number };

  const moduleBreakdown = modules.map((m) => {
    const mLogs = logs.filter((l) => l.module_id === m.id && l.log_date >= weekStartStr);
    return {
      module_id: m.id,
      name: m.name,
      icon: m.icon,
      color: m.color,
      minutes: mLogs.reduce((s, l) => s + l.duration_minutes, 0),
      logs: mLogs.length,
    };
  });

  const stats: DashboardStats = {
    todayDate: today,
    todayMinutes,
    todayCompletedTasks,
    todayTotalTasks,
    weekMinutes,
    streakDays,
    totalLogs: logs.length,
    totalIdeas: Number(ideaTotals.total || 0),
    activeIdeas: Number(ideaTotals.active || 0),
    moduleBreakdown,
    heatmap,
  };
  res.json(stats);
});

// ---------- Modules CRUD ----------
app.get('/api/modules', (_req, res) => {
  res.json(listModulesWithStats());
});

app.post('/api/modules', (req, res) => {
  const { name, icon = '📘', color = '#6366f1', description = '', goal = '' } = req.body || {};
  if (!name?.trim()) return res.status(400).json({ error: '板块名称不能为空' });
  const id = uid('mod');
  const maxOrder = (db.prepare('SELECT COALESCE(MAX(sort_order), -1) as m FROM modules').get() as { m: number }).m;
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO modules (id, name, icon, color, description, goal, sort_order, archived, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?)`
  ).run(id, name.trim(), icon, color, description, goal, maxOrder + 1, now);
  const created = db.prepare('SELECT * FROM modules WHERE id = ?').get(id);
  scheduleAutoSync();
  res.status(201).json({ ...created, log_count: 0, total_minutes: 0 });
});

app.put('/api/modules/:id', (req, res) => {
  const { id } = req.params;
  const existing = db.prepare('SELECT * FROM modules WHERE id = ?').get(id) as StudyModule | undefined;
  if (!existing) return res.status(404).json({ error: '板块不存在' });
  const {
    name = existing.name,
    icon = existing.icon,
    color = existing.color,
    description = existing.description,
    goal = existing.goal,
    sort_order = existing.sort_order,
    archived = existing.archived,
  } = req.body || {};
  db.prepare(
    `UPDATE modules SET name = ?, icon = ?, color = ?, description = ?, goal = ?, sort_order = ?, archived = ? WHERE id = ?`
  ).run(name.trim(), icon, color, description, goal, sort_order, archived, id);
  scheduleAutoSync();
  res.json(db.prepare('SELECT * FROM modules WHERE id = ?').get(id));
});

app.delete('/api/modules/:id', (req, res) => {
  db.prepare('DELETE FROM modules WHERE id = ?').run(req.params.id);
  recordDeletion('modules', req.params.id);
  scheduleAutoSync();
  res.json({ ok: true });
});

// ---------- Study Logs CRUD ----------
app.get('/api/logs', (req, res) => {
  const { module_id, date, date_from, date_to, q } = req.query as Record<string, string | undefined>;
  const conds: string[] = [];
  const params: string[] = [];

  if (module_id) {
    conds.push('module_id = ?');
    params.push(module_id);
  }
  if (date) {
    conds.push('log_date = ?');
    params.push(date);
  }
  if (date_from) {
    conds.push('log_date >= ?');
    params.push(date_from);
  }
  if (date_to) {
    conds.push('log_date <= ?');
    params.push(date_to);
  }
  if (q?.trim()) {
    conds.push('(title LIKE ? OR content LIKE ? OR tags_json LIKE ?)');
    const pat = `%${q.trim()}%`;
    params.push(pat, pat, pat);
  }

  const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';
  const rows = db
    .prepare(`SELECT * FROM study_logs ${where} ORDER BY log_date DESC, updated_at DESC LIMIT 200`)
    .all(...params) as Record<string, unknown>[];
  res.json(rows.map(mapStudyLog));
});

app.post('/api/logs', (req, res) => {
  const {
    module_id,
    log_date = todayStr(),
    title,
    content = '',
    tasks = [],
    duration_minutes = 30,
    rating = 0,
    tags = [],
  } = req.body || {};
  if (!module_id) return res.status(400).json({ error: '请选择学习板块' });
  if (!title?.trim()) return res.status(400).json({ error: '标题不能为空' });

  const id = uid('log');
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO study_logs (id, module_id, log_date, title, content, tasks_json, duration_minutes, rating, tags_json, ai_feedback, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, '', ?, ?)`
  ).run(
    id,
    module_id,
    log_date,
    title.trim(),
    content,
    JSON.stringify(tasks),
    Number(duration_minutes) || 0,
    Number(rating) || 0,
    JSON.stringify(tags),
    now,
    now
  );
  const created = db.prepare('SELECT * FROM study_logs WHERE id = ?').get(id) as Record<string, unknown>;
  scheduleAutoSync();
  res.status(201).json(mapStudyLog(created));
});

app.put('/api/logs/:id', (req, res) => {
  const existingRow = db.prepare('SELECT * FROM study_logs WHERE id = ?').get(req.params.id) as
    | Record<string, unknown>
    | undefined;
  if (!existingRow) return res.status(404).json({ error: '学习日志不存在' });
  const existing = mapStudyLog(existingRow);

  const {
    module_id = existing.module_id,
    log_date = existing.log_date,
    title = existing.title,
    content = existing.content,
    tasks = existing.tasks,
    duration_minutes = existing.duration_minutes,
    rating = existing.rating,
    tags = existing.tags,
    ai_feedback = existing.ai_feedback,
  } = req.body || {};

  const now = new Date().toISOString();
  db.prepare(
    `UPDATE study_logs
     SET module_id = ?, log_date = ?, title = ?, content = ?, tasks_json = ?, duration_minutes = ?, rating = ?, tags_json = ?, ai_feedback = ?, updated_at = ?
     WHERE id = ?`
  ).run(
    module_id,
    log_date,
    String(title).trim() || existing.title,
    content,
    JSON.stringify(tasks),
    Number(duration_minutes) || 0,
    Number(rating) || 0,
    JSON.stringify(tags),
    ai_feedback,
    now,
    req.params.id
  );
  const updated = db.prepare('SELECT * FROM study_logs WHERE id = ?').get(req.params.id) as Record<string, unknown>;
  scheduleAutoSync();
  res.json(mapStudyLog(updated));
});

app.delete('/api/logs/:id', (req, res) => {
  db.prepare('DELETE FROM study_logs WHERE id = ?').run(req.params.id);
  recordDeletion('study_logs', req.params.id);
  scheduleAutoSync();
  res.json({ ok: true });
});

// ---------- Game Ideas CRUD ----------
app.get('/api/ideas', (req, res) => {
  const { status, category, q } = req.query as Record<string, string | undefined>;
  const conds: string[] = [];
  const params: string[] = [];
  if (status && status !== 'all') {
    conds.push('status = ?');
    params.push(status);
  }
  if (category && category !== 'all') {
    conds.push('category = ?');
    params.push(category);
  }
  if (q?.trim()) {
    conds.push('(title LIKE ? OR summary LIKE ? OR content LIKE ? OR tags_json LIKE ?)');
    const pat = `%${q.trim()}%`;
    params.push(pat, pat, pat, pat);
  }
  const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';
  const rows = db
    .prepare(`SELECT * FROM game_ideas ${where} ORDER BY priority DESC, updated_at DESC LIMIT 200`)
    .all(...params) as Record<string, unknown>[];
  res.json(rows.map(mapGameIdea));
});

app.post('/api/ideas', (req, res) => {
  const {
    title,
    summary = '',
    content = '',
    category = '玩法机制',
    status = 'spark',
    priority = 2,
    tags = [],
    related_ids = [],
  } = req.body || {};
  if (!title?.trim()) return res.status(400).json({ error: '灵感标题不能为空' });

  const id = uid('idea');
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO game_ideas (id, title, summary, content, category, status, priority, tags_json, related_ids_json, ai_notes, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, '', ?, ?)`
  ).run(
    id,
    title.trim(),
    summary,
    content,
    category,
    status,
    Number(priority) || 2,
    JSON.stringify(tags),
    JSON.stringify(related_ids),
    now,
    now
  );
  const created = db.prepare('SELECT * FROM game_ideas WHERE id = ?').get(id) as Record<string, unknown>;
  scheduleAutoSync();
  res.status(201).json(mapGameIdea(created));
});

app.put('/api/ideas/:id', (req, res) => {
  const existingRow = db.prepare('SELECT * FROM game_ideas WHERE id = ?').get(req.params.id) as
    | Record<string, unknown>
    | undefined;
  if (!existingRow) return res.status(404).json({ error: '灵感不存在' });
  const existing = mapGameIdea(existingRow);

  const {
    title = existing.title,
    summary = existing.summary,
    content = existing.content,
    category = existing.category,
    status = existing.status,
    priority = existing.priority,
    tags = existing.tags,
    related_ids = existing.related_ids,
    ai_notes = existing.ai_notes,
  } = req.body || {};

  const now = new Date().toISOString();
  db.prepare(
    `UPDATE game_ideas
     SET title = ?, summary = ?, content = ?, category = ?, status = ?, priority = ?, tags_json = ?, related_ids_json = ?, ai_notes = ?, updated_at = ?
     WHERE id = ?`
  ).run(
    String(title).trim() || existing.title,
    summary,
    content,
    category,
    status,
    Number(priority) || 2,
    JSON.stringify(tags),
    JSON.stringify(related_ids),
    ai_notes,
    now,
    req.params.id
  );
  const updated = db.prepare('SELECT * FROM game_ideas WHERE id = ?').get(req.params.id) as Record<string, unknown>;
  scheduleAutoSync();
  res.json(mapGameIdea(updated));
});

app.delete('/api/ideas/:id', (req, res) => {
  db.prepare('DELETE FROM game_ideas WHERE id = ?').run(req.params.id);
  recordDeletion('game_ideas', req.params.id);
  scheduleAutoSync();
  res.json({ ok: true });
});

// ---------- AI Providers & Prompt Templates ----------
app.get('/api/ai/providers', (_req, res) => {
  const rows = db.prepare('SELECT * FROM ai_providers ORDER BY is_active DESC, created_at ASC').all();
  res.json(rows);
});

app.post('/api/ai/providers', (req, res) => {
  const {
    name,
    protocol = 'openai',
    base_url,
    api_key = '',
    model,
    is_active = 0,
    temperature = 0.7,
    max_tokens = 2048,
  } = req.body || {};
  if (!name?.trim() || !base_url?.trim() || !model?.trim()) {
    return res.status(400).json({ error: '名称、Base URL 和模型名均为必填项' });
  }
  const id = uid('prov');
  const now = new Date().toISOString();
  if (is_active) {
    db.prepare('UPDATE ai_providers SET is_active = 0').run();
  }
  db.prepare(
    `INSERT INTO ai_providers (id, name, protocol, base_url, api_key, model, is_active, temperature, max_tokens, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(id, name.trim(), protocol, base_url.trim(), api_key.trim(), model.trim(), is_active ? 1 : 0, temperature, max_tokens, now);
  scheduleAutoSync();
  res.status(201).json(db.prepare('SELECT * FROM ai_providers WHERE id = ?').get(id));
});

app.put('/api/ai/providers/:id', (req, res) => {
  const existing = db.prepare('SELECT * FROM ai_providers WHERE id = ?').get(req.params.id) as AiProvider | undefined;
  if (!existing) return res.status(404).json({ error: '模型配置不存在' });

  const {
    name = existing.name,
    protocol = existing.protocol,
    base_url = existing.base_url,
    api_key = existing.api_key,
    model = existing.model,
    is_active = existing.is_active,
    temperature = existing.temperature,
    max_tokens = existing.max_tokens,
  } = req.body || {};

  if (is_active) {
    db.prepare('UPDATE ai_providers SET is_active = 0').run();
  }
  db.prepare(
    `UPDATE ai_providers
     SET name = ?, protocol = ?, base_url = ?, api_key = ?, model = ?, is_active = ?, temperature = ?, max_tokens = ?
     WHERE id = ?`
  ).run(
    String(name).trim(),
    protocol,
    String(base_url).trim(),
    String(api_key).trim(),
    String(model).trim(),
    is_active ? 1 : 0,
    Number(temperature),
    Number(max_tokens),
    req.params.id
  );
  scheduleAutoSync();
  res.json(db.prepare('SELECT * FROM ai_providers WHERE id = ?').get(req.params.id));
});

app.delete('/api/ai/providers/:id', (req, res) => {
  db.prepare('DELETE FROM ai_providers WHERE id = ?').run(req.params.id);
  recordDeletion('ai_providers', req.params.id);
  const hasActive = db.prepare('SELECT COUNT(*) as c FROM ai_providers WHERE is_active = 1').get() as { c: number };
  if (hasActive.c === 0) {
    db.prepare('UPDATE ai_providers SET is_active = 1 WHERE id = (SELECT id FROM ai_providers LIMIT 1)').run();
  }
  scheduleAutoSync();
  res.json({ ok: true });
});

app.post('/api/ai/providers/:id/test', async (req, res) => {
  try {
    const provider = getActiveProvider(req.params.id);
    if (!provider) return res.status(404).json({ error: '未找到模型配置' });
    const started = Date.now();
    const reply = await callLlm(
      provider,
      [{ role: 'user', content: '请仅回复 OK 两个字母。' }],
      { maxTokens: 32, temperature: 0 }
    );
    res.json({ ok: true, latencyMs: Date.now() - started, reply: reply.trim().slice(0, 80) });
  } catch (err) {
    res.status(400).json({ ok: false, error: err instanceof Error ? err.message : String(err) });
  }
});

app.get('/api/ai/prompts', (_req, res) => {
  res.json(db.prepare('SELECT * FROM prompt_templates ORDER BY id ASC').all());
});

app.put('/api/ai/prompts/:id', (req, res) => {
  const { system_prompt, name, description } = req.body || {};
  const existing = db.prepare('SELECT * FROM prompt_templates WHERE id = ?').get(req.params.id) as
    | Record<string, string>
    | undefined;
  if (!existing) return res.status(404).json({ error: '提示词模板不存在' });
  const now = new Date().toISOString();
  db.prepare(
    `UPDATE prompt_templates SET name = ?, description = ?, system_prompt = ?, updated_at = ? WHERE id = ?`
  ).run(name ?? existing.name, description ?? existing.description, system_prompt ?? existing.system_prompt, now, req.params.id);
  res.json(db.prepare('SELECT * FROM prompt_templates WHERE id = ?').get(req.params.id));
});

// ---------- AI Reviews & Evaluation ----------
app.get('/api/ai/reviews', (_req, res) => {
  res.json(listAllReviews());
});

app.delete('/api/ai/reviews/:id', (req, res) => {
  db.prepare('DELETE FROM ai_reviews WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

app.post('/api/ai/review', async (req, res) => {
  try {
    const {
      scope = 'daily',
      date_from = todayStr(),
      date_to = todayStr(),
      module_id = '',
      custom_instruction = '',
      provider_id,
    } = req.body || {};

    const provider = getActiveProvider(provider_id);
    if (!provider) return res.status(400).json({ error: '请先配置可用的 AI 模型' });

    const conds: string[] = [];
    const params: string[] = [];
    if (date_from) {
      conds.push('log_date >= ?');
      params.push(date_from);
    }
    if (date_to) {
      conds.push('log_date <= ?');
      params.push(date_to);
    }
    if (module_id) {
      conds.push('module_id = ?');
      params.push(module_id);
    }
    const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';
    const rows = db
      .prepare(`SELECT * FROM study_logs ${where} ORDER BY log_date ASC`)
      .all(...params) as Record<string, unknown>[];
    const logs = rows.map(mapStudyLog);

    if (logs.length === 0) {
      return res.status(400).json({ error: '选定时间或板块范围内暂无学习日志可供复盘' });
    }

    const modules = listModulesWithStats();
    const moduleMap = new Map(modules.map((m) => [m.id, m]));
    const formatted = formatStudyLogsForReview(logs, moduleMap);
    const totalMinutes = logs.reduce((s, l) => s + l.duration_minutes, 0);

    const tpl = getPromptTemplate('daily_review');
    const systemPrompt = tpl?.system_prompt || '请对用户的学习日志进行结构化复盘并打分。';
    const modName = module_id ? moduleMap.get(module_id)?.name || '' : '全部板块';
    const userMsg = [
      `复盘范围：${date_from} 至 ${date_to} | 板块：${modName} | 日志数：${logs.length} 篇 | 累计时长：${totalMinutes} 分钟`,
      custom_instruction ? `用户补充要求：${custom_instruction}` : '',
      `\n以下为原始学习日志数据：\n\n${formatted}`,
    ]
      .filter(Boolean)
      .join('\n');

    const content = await callLlm(provider, [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userMsg },
    ]);

    const score = extractScore(content);
    const reviewTitle =
      scope === 'daily'
        ? `每日复盘 · ${date_from}${module_id ? ` (${modName})` : ''}`
        : scope === 'weekly'
          ? `周度复盘 · ${date_from} ~ ${date_to}`
          : `${modName} 专项复盘 · ${date_from} ~ ${date_to}`;

    const id = uid('rev');
    const now = new Date().toISOString();
    db.prepare(
      `INSERT INTO ai_reviews (id, scope, title, date_from, date_to, module_id, score, content, model_used, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(id, scope, reviewTitle, date_from, date_to, module_id, score, content, `${provider.name} (${provider.model})`, now);

    res.json(db.prepare('SELECT * FROM ai_reviews WHERE id = ?').get(id));
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// Single study log evaluation
app.post('/api/ai/evaluate-log/:id', async (req, res) => {
  try {
    const row = db.prepare('SELECT * FROM study_logs WHERE id = ?').get(req.params.id) as
      | Record<string, unknown>
      | undefined;
    if (!row) return res.status(404).json({ error: '学习日志不存在' });
    const log = mapStudyLog(row);
    const provider = getActiveProvider(req.body?.provider_id);
    if (!provider) return res.status(400).json({ error: '请先配置 AI 模型' });

    const modules = listModulesWithStats();
    const moduleMap = new Map(modules.map((m) => [m.id, m]));
    const tpl = getPromptTemplate('single_log_eval');
    const content = await callLlm(provider, [
      { role: 'system', content: tpl?.system_prompt || '请点评这篇学习日志。' },
      { role: 'user', content: formatStudyLogsForReview([log], moduleMap) },
    ]);

    const now = new Date().toISOString();
    db.prepare('UPDATE study_logs SET ai_feedback = ?, updated_at = ? WHERE id = ?').run(content, now, log.id);
    const updated = db.prepare('SELECT * FROM study_logs WHERE id = ?').get(log.id) as Record<string, unknown>;
    res.json(mapStudyLog(updated));
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// Game Idea Faithful AI Organize (preserve raw text, no embellishment)
app.post('/api/ai/organize-idea/:id', async (req, res) => {
  try {
    const row = db.prepare('SELECT * FROM game_ideas WHERE id = ?').get(req.params.id) as
      | Record<string, unknown>
      | undefined;
    if (!row) return res.status(404).json({ error: '灵感不存在' });
    const idea = mapGameIdea(row);
    const rawText = (idea.content || idea.title || '').trim();
    if (!rawText) return res.status(400).json({ error: '请先写下你的原始灵感内容' });

    const provider = getActiveProvider(req.body?.provider_id);
    if (!provider) return res.status(400).json({ error: '请先在设置中配置 AI 模型' });

    const tpl = getPromptTemplate('idea_organize');
    const systemPrompt =
      tpl?.system_prompt ||
      '请忠实整理用户的原始灵感，严禁添油加醋，仅返回 JSON: {"title":"","tags":[],"organized":""}';

    const raw = await callLlm(
      provider,
      [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: `请忠实整理以下原始灵感（严禁脑补未提及的设定）：\n\n${rawText}` },
      ],
      { temperature: 0.25 }
    );

    let nextTitle = idea.title;
    let nextTags = idea.tags;
    let organized = raw.trim();

    try {
      const cleaned = raw.replace(/^```json\s*/i, '').replace(/```$/i, '').trim();
      const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
      const parsed = JSON.parse(jsonMatch ? jsonMatch[0] : cleaned) as {
        title?: string;
        tags?: string[];
        organized?: string;
      };
      if (parsed.title?.trim()) nextTitle = parsed.title.trim().slice(0, 40);
      if (Array.isArray(parsed.tags) && parsed.tags.length > 0) {
        nextTags = Array.from(new Set(parsed.tags.slice(0, 5).map((t) => String(t).trim()).filter(Boolean)));
      }
      if (parsed.organized?.trim()) organized = parsed.organized.trim();
    } catch {
      // If model replied with plain markdown instead of JSON, keep it as organized text
    }

    const now = new Date().toISOString();
    // Preserve idea.content untouched! Only update title, tags, and ai_notes (organized version)
    db.prepare('UPDATE game_ideas SET title = ?, tags_json = ?, ai_notes = ?, updated_at = ? WHERE id = ?').run(
      nextTitle,
      JSON.stringify(nextTags),
      organized,
      now,
      idea.id
    );
    scheduleAutoSync();
    const updated = db.prepare('SELECT * FROM game_ideas WHERE id = ?').get(idea.id) as Record<string, unknown>;
    res.json(mapGameIdea(updated));
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// Game Idea AI Co-pilot (expand | critique | crosslink)
app.post('/api/ai/idea-assist/:id', async (req, res) => {
  try {
    const { action = 'expand', custom_instruction = '', provider_id } = req.body || {};
    const row = db.prepare('SELECT * FROM game_ideas WHERE id = ?').get(req.params.id) as
      | Record<string, unknown>
      | undefined;
    if (!row) return res.status(404).json({ error: '游戏灵感不存在' });
    const idea = mapGameIdea(row);
    const provider = getActiveProvider(provider_id);
    if (!provider) return res.status(400).json({ error: '请先配置 AI 模型' });

    const keyMap: Record<string, string> = {
      expand: 'idea_expand',
      critique: 'idea_critique',
      crosslink: 'idea_crosslink',
    };
    const labelMap: Record<string, string> = {
      expand: '机制扩写与 MVP 草案',
      critique: '犀利挑刺与风险评审',
      crosslink: '历史灵感跨界碰撞',
    };

    const tpl = getPromptTemplate(keyMap[action] || 'idea_expand');
    let userPrompt = formatIdeaForAi(idea);

    if (action === 'crosslink') {
      const others = (
        db.prepare('SELECT * FROM game_ideas WHERE id != ? ORDER BY updated_at DESC LIMIT 15').all(idea.id) as Record<
          string,
          unknown
        >[]
      ).map(mapGameIdea);
      const otherText = others.length
        ? others.map((o) => `- **${o.title}**（${o.category} | ${o.tags.join('/')}）：${o.summary || o.content.slice(0, 120)}`).join('\n')
        : '（暂无其他历史灵感，请结合常见经典游戏机制进行跨界发散）';
      userPrompt += `\n\n## 我的历史灵感库\n${otherText}`;
    }

    if (custom_instruction) {
      userPrompt += `\n\n## 补充需求\n${custom_instruction}`;
    }

    const result = await callLlm(provider, [
      { role: 'system', content: tpl?.system_prompt || '你是资深游戏策划。' },
      { role: 'user', content: userPrompt },
    ]);

    const stamp = new Date().toLocaleString('zh-CN', { hour12: false });
    const section = `> **AI ${labelMap[action] || '辅助'}** · ${provider.model} · ${stamp}\n\n${result}`;
    const mergedNotes = idea.ai_notes ? `${section}\n\n---\n\n${idea.ai_notes}` : section;
    const now = new Date().toISOString();

    db.prepare('UPDATE game_ideas SET ai_notes = ?, updated_at = ? WHERE id = ?').run(mergedNotes, now, idea.id);
    const updated = db.prepare('SELECT * FROM game_ideas WHERE id = ?').get(idea.id) as Record<string, unknown>;
    res.json({ idea: mapGameIdea(updated), latest: result });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// Auto-Tag & Summarize
app.post('/api/ai/auto-tag', async (req, res) => {
  try {
    const { title = '', content = '', kind = 'study', provider_id } = req.body || {};
    const provider = getActiveProvider(provider_id);
    if (!provider) return res.status(400).json({ error: '请先配置 AI 模型' });
    const tpl = getPromptTemplate('auto_tag');

    const raw = await callLlm(
      provider,
      [
        { role: 'system', content: tpl?.system_prompt || '输出 JSON: {"tags":[], "summary":""}' },
        { role: 'user', content: `类型：${kind === 'idea' ? '游戏灵感' : '学习日志'}\n标题：${title}\n内容：${content}` },
      ],
      { temperature: 0.3, maxTokens: 300 }
    );

    const cleaned = raw.replace(/^```json\s*/i, '').replace(/```$/i, '').trim();
    const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
    const parsed = JSON.parse(jsonMatch ? jsonMatch[0] : cleaned) as {
      tags?: string[];
      summary?: string;
      category?: string;
    };
    res.json({
      tags: Array.isArray(parsed.tags) ? parsed.tags.slice(0, 6).map(String) : [],
      summary: typeof parsed.summary === 'string' ? parsed.summary : '',
      category: typeof parsed.category === 'string' ? parsed.category : '',
    });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// ---------- AI Knowledge Base Chat (Multi-turn + Streaming SSE) ----------
app.get('/api/ai/conversations', (_req, res) => {
  res.json(listConversations());
});

app.post('/api/ai/conversations', (req, res) => {
  const { title = '新知识库对话', context_mode = 'all', module_id = '' } = req.body || {};
  const id = uid('conv');
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO ai_conversations (id, title, context_mode, module_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)`
  ).run(id, title, context_mode, module_id, now, now);
  res.status(201).json(db.prepare('SELECT * FROM ai_conversations WHERE id = ?').get(id));
});

app.delete('/api/ai/conversations/:id', (req, res) => {
  db.prepare('DELETE FROM ai_conversations WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

app.get('/api/ai/conversations/:id/messages', (req, res) => {
  const rows = db
    .prepare('SELECT * FROM ai_messages WHERE conversation_id = ? ORDER BY created_at ASC')
    .all(req.params.id) as Record<string, unknown>[];
  res.json(rows.map(mapAiMessage));
});

app.post('/api/ai/conversations/:id/chat', async (req, res) => {
  const convId = req.params.id;
  const conv = db.prepare('SELECT * FROM ai_conversations WHERE id = ?').get(convId) as
    | { id: string; title: string; context_mode: 'all' | 'study' | 'ideas' | 'module'; module_id: string }
    | undefined;
  if (!conv) return res.status(404).json({ error: '对话不存在' });

  const { message, provider_id, context_mode, module_id } = req.body || {};
  if (!message?.trim()) return res.status(400).json({ error: '消息不能为空' });

  const provider = getActiveProvider(provider_id);
  if (!provider) return res.status(400).json({ error: '请先在设置中配置 AI 模型' });

  const effectiveMode = context_mode || conv.context_mode || 'all';
  const effectiveModuleId = module_id ?? conv.module_id ?? '';

  const now = new Date().toISOString();
  const userMsgId = uid('msg');
  db.prepare(
    `INSERT INTO ai_messages (id, conversation_id, role, content, references_json, created_at) VALUES (?, ?, 'user', ?, '[]', ?)`
  ).run(userMsgId, convId, message.trim(), now);

  if (conv.title === '新知识库对话') {
    db.prepare('UPDATE ai_conversations SET title = ?, updated_at = ? WHERE id = ?').run(
      message.trim().slice(0, 22),
      now,
      convId
    );
  } else {
    db.prepare('UPDATE ai_conversations SET updated_at = ? WHERE id = ?').run(now, convId);
  }

  const { contextText, references } = buildKnowledgeContext(message, effectiveMode, effectiveModuleId);
  const historyRows = db
    .prepare('SELECT * FROM ai_messages WHERE conversation_id = ? ORDER BY created_at DESC LIMIT 12')
    .all(convId) as Record<string, unknown>[];
  const history = historyRows.reverse().map(mapAiMessage);

  const tpl = getPromptTemplate('knowledge_chat');
  const systemMessage = `${tpl?.system_prompt || '你是用户的个人知识库助手。'}\n\n当前日期：${todayStr()}\n以下是系统为你检索到的用户历史记录：\n\n${contextText}`;

  const turns: ChatTurn[] = [
    { role: 'system', content: systemMessage },
    ...history.map((m) => ({ role: m.role, content: m.content })),
  ];

  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  res.write(`data: ${JSON.stringify({ type: 'meta', references })}\n\n`);

  try {
    const fullText = await streamLlm(provider, turns, (delta) => {
      res.write(`data: ${JSON.stringify({ type: 'delta', content: delta })}\n\n`);
    });

    const assistantMsgId = uid('msg');
    const doneAt = new Date().toISOString();
    db.prepare(
      `INSERT INTO ai_messages (id, conversation_id, role, content, references_json, created_at) VALUES (?, ?, 'assistant', ?, ?, ?)`
    ).run(assistantMsgId, convId, fullText, JSON.stringify(references), doneAt);
    db.prepare('UPDATE ai_conversations SET updated_at = ? WHERE id = ?').run(doneAt, convId);

    res.write(`data: ${JSON.stringify({ type: 'done', id: assistantMsgId, references })}\n\n`);
    res.end();
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    res.write(`data: ${JSON.stringify({ type: 'error', error: errMsg })}\n\n`);
    res.end();
  }
});

// ---------- Export & Import ----------
app.get('/api/export/json', (_req, res) => {
  const payload = {
    version: 1,
    exportedAt: new Date().toISOString(),
    modules: db.prepare('SELECT * FROM modules').all(),
    study_logs: (db.prepare('SELECT * FROM study_logs').all() as Record<string, unknown>[]).map(mapStudyLog),
    game_ideas: (db.prepare('SELECT * FROM game_ideas').all() as Record<string, unknown>[]).map(mapGameIdea),
    ai_reviews: db.prepare('SELECT * FROM ai_reviews').all(),
    prompt_templates: db.prepare('SELECT * FROM prompt_templates').all(),
  };
  res.setHeader('Content-Disposition', `attachment; filename="perlica-backup-${todayStr()}.json"`);
  res.json(payload);
});

app.get('/api/export/markdown', (_req, res) => {
  const modules = listModulesWithStats();
  const moduleMap = new Map(modules.map((m) => [m.id, m]));
  const logs = (db.prepare('SELECT * FROM study_logs ORDER BY log_date DESC').all() as Record<string, unknown>[]).map(
    mapStudyLog
  );
  const ideas = (db.prepare('SELECT * FROM game_ideas ORDER BY updated_at DESC').all() as Record<string, unknown>[]).map(
    mapGameIdea
  );

  const lines: string[] = [
    `# Perlica 个人知识归档 (${todayStr()})`,
    '',
    '## 一、学习板块与日志',
    '',
    formatStudyLogsForReview(logs, moduleMap),
    '',
    '## 二、游戏灵感库',
    '',
    ...ideas.map((i) => `${formatIdeaForAi(i)}\n\n${i.ai_notes ? `### AI 陪跑记录\n${i.ai_notes}` : ''}\n\n---`),
  ];

  res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="perlica-archive-${todayStr()}.md"`);
  res.send(lines.join('\n'));
});

app.post('/api/import/json', (req, res) => {
  try {
    const data = req.body || {};
    let importedModules = 0;
    let importedLogs = 0;
    let importedIdeas = 0;

    if (Array.isArray(data.modules)) {
      const stmt = db.prepare(
        `INSERT OR IGNORE INTO modules (id, name, icon, color, description, goal, sort_order, archived, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      );
      for (const m of data.modules) {
        stmt.run(m.id, m.name, m.icon || '📘', m.color || '#6366f1', m.description || '', m.goal || '', m.sort_order || 0, m.archived || 0, m.created_at || new Date().toISOString());
        importedModules++;
      }
    }

    if (Array.isArray(data.study_logs)) {
      const stmt = db.prepare(
        `INSERT OR IGNORE INTO study_logs (id, module_id, log_date, title, content, tasks_json, duration_minutes, rating, tags_json, ai_feedback, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      );
      for (const l of data.study_logs) {
        stmt.run(
          l.id,
          l.module_id,
          l.log_date,
          l.title,
          l.content || '',
          JSON.stringify(l.tasks || []),
          l.duration_minutes || 0,
          l.rating || 0,
          JSON.stringify(l.tags || []),
          l.ai_feedback || '',
          l.created_at || new Date().toISOString(),
          l.updated_at || new Date().toISOString()
        );
        importedLogs++;
      }
    }

    if (Array.isArray(data.game_ideas)) {
      const stmt = db.prepare(
        `INSERT OR IGNORE INTO game_ideas (id, title, summary, content, category, status, priority, tags_json, related_ids_json, ai_notes, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      );
      for (const i of data.game_ideas) {
        stmt.run(
          i.id,
          i.title,
          i.summary || '',
          i.content || '',
          i.category || '玩法机制',
          i.status || 'spark',
          i.priority || 2,
          JSON.stringify(i.tags || []),
          JSON.stringify(i.related_ids || []),
          i.ai_notes || '',
          i.created_at || new Date().toISOString(),
          i.updated_at || new Date().toISOString()
        );
        importedIdeas++;
      }
    }

    res.json({ ok: true, importedModules, importedLogs, importedIdeas });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// ---------- Serve Built Frontend (Production / Unified Mode) ----------
const DIST_DIR = path.resolve(process.cwd(), 'dist');
if (fs.existsSync(DIST_DIR)) {
  app.use(express.static(DIST_DIR));
  app.get('/{*splat}', (req, res, next) => {
    if (req.path.startsWith('/api/')) return next();
    res.sendFile(path.join(DIST_DIR, 'index.html'));
  });
}

app.listen(PORT, '0.0.0.0', () => {
  console.log(`\n✨ Perlica Server running:`);
  console.log(`   Local:   http://localhost:${PORT}`);
  for (const ip of getLanAddresses()) {
    console.log(`   Network: http://${ip}:${PORT}`);
  }
  const ghCfg = getGithubConfig();
  if (ghCfg.token && ghCfg.autoSync) {
    console.log(`   GitHub:  Auto-syncing private Gist...`);
    syncWithGithubNow().catch((e) => {
      console.warn(`   GitHub sync skipped: ${e instanceof Error ? e.message : String(e)}`);
    });
  }
  console.log('');
});

process.on('SIGINT', () => {
  stopTunnel();
  process.exit(0);
});
process.on('SIGTERM', () => {
  stopTunnel();
  process.exit(0);
});
