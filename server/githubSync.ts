import { db, deleteSetting, getSetting, setSetting } from './db.ts';

const GIST_FILENAME = 'perlica-sync.json';
const GIST_DESCRIPTION = 'Perlica Sync Data (Private Backup — Do Not Share)';

export interface GithubSyncConfig {
  token: string;
  gistId: string;
  username: string;
  autoSync: boolean;
  lastSyncAt: string | null;
  lastError: string | null;
}

export interface GithubSyncStatus {
  configured: boolean;
  username: string;
  gistId: string;
  gistUrl: string | null;
  autoSync: boolean;
  syncing: boolean;
  lastSyncAt: string | null;
  lastError: string | null;
}

interface SyncTombstone {
  entity_type: string;
  entity_id: string;
  deleted_at: string;
}

interface SyncSnapshot {
  version: number;
  syncedAt: string;
  tombstones: SyncTombstone[];
  modules: Record<string, unknown>[];
  study_logs: Record<string, unknown>[];
  game_ideas: Record<string, unknown>[];
  ai_reviews: Record<string, unknown>[];
  prompt_templates: Record<string, unknown>[];
  ai_conversations: Record<string, unknown>[];
  ai_messages: Record<string, unknown>[];
}

let isSyncing = false;
let autoSyncTimer: ReturnType<typeof setTimeout> | null = null;

export function getGithubConfig(): GithubSyncConfig {
  return {
    token: getSetting('github_token') || process.env.PERLICA_GITHUB_TOKEN?.trim() || '',
    gistId: getSetting('github_gist_id') || process.env.PERLICA_GITHUB_GIST_ID?.trim() || '',
    username: getSetting('github_username') || '',
    autoSync: getSetting('github_auto_sync') !== '0',
    lastSyncAt: getSetting('github_last_sync_at'),
    lastError: getSetting('github_last_error'),
  };
}

export function getGithubSyncStatus(): GithubSyncStatus {
  const cfg = getGithubConfig();
  return {
    configured: Boolean(cfg.token),
    username: cfg.username,
    gistId: cfg.gistId,
    gistUrl: cfg.gistId ? `https://gist.github.com/${cfg.gistId}` : null,
    autoSync: cfg.autoSync,
    syncing: isSyncing,
    lastSyncAt: cfg.lastSyncAt,
    lastError: cfg.lastError,
  };
}

export function disconnectGithub(): GithubSyncStatus {
  deleteSetting('github_token');
  deleteSetting('github_gist_id');
  deleteSetting('github_username');
  deleteSetting('github_last_sync_at');
  deleteSetting('github_last_error');
  if (autoSyncTimer) {
    clearTimeout(autoSyncTimer);
    autoSyncTimer = null;
  }
  return getGithubSyncStatus();
}

function ghHeaders(token: string): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'Content-Type': 'application/json',
    'User-Agent': 'Perlica-Sync/1.0',
  };
}

async function fetchGithubUser(token: string): Promise<string> {
  const res = await fetch('https://api.github.com/user', { headers: ghHeaders(token) });
  if (!res.ok) {
    throw new Error(`GitHub Token 验证失败 (${res.status})，请检查 Token 是否有效且勾选了 gist 权限`);
  }
  const data = (await res.json()) as { login?: string };
  return data.login || 'github-user';
}

async function discoverExistingGist(token: string): Promise<string | null> {
  const res = await fetch('https://api.github.com/gists?per_page=50', { headers: ghHeaders(token) });
  if (!res.ok) return null;
  const gists = (await res.json()) as Array<{ id: string; files?: Record<string, unknown> }>;
  const found = gists.find((g) => g.files && Object.prototype.hasOwnProperty.call(g.files, GIST_FILENAME));
  return found?.id || null;
}

async function fetchRemoteSnapshot(token: string, gistId: string): Promise<SyncSnapshot | null> {
  const res = await fetch(`https://api.github.com/gists/${encodeURIComponent(gistId)}`, {
    headers: ghHeaders(token),
  });
  if (res.status === 404) return null;
  if (!res.ok) {
    throw new Error(`拉取 GitHub Gist 失败 (${res.status})`);
  }
  const data = (await res.json()) as {
    files?: Record<string, { content?: string; truncated?: boolean; raw_url?: string }>;
  };
  const file = data.files?.[GIST_FILENAME];
  if (!file) return null;

  let raw = file.content || '';
  if (file.truncated && file.raw_url) {
    const rawRes = await fetch(file.raw_url, { headers: ghHeaders(token) });
    if (rawRes.ok) raw = await rawRes.text();
  }
  if (!raw.trim()) return null;
  try {
    return JSON.parse(raw) as SyncSnapshot;
  } catch {
    return null;
  }
}

async function pushSnapshot(token: string, gistId: string | null, snapshot: SyncSnapshot): Promise<string> {
  const body = JSON.stringify({
    description: GIST_DESCRIPTION,
    public: false,
    files: {
      [GIST_FILENAME]: {
        content: JSON.stringify(snapshot, null, 2),
      },
    },
  });

  const url = gistId
    ? `https://api.github.com/gists/${encodeURIComponent(gistId)}`
    : 'https://api.github.com/gists';
  const method = gistId ? 'PATCH' : 'POST';

  const res = await fetch(url, {
    method,
    headers: ghHeaders(token),
    body,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`推送到 GitHub Gist 失败 (${res.status}): ${text.slice(0, 200)}`);
  }
  const data = (await res.json()) as { id: string };
  return data.id;
}

function readLocalSnapshot(): SyncSnapshot {
  return {
    version: 1,
    syncedAt: new Date().toISOString(),
    tombstones: db.prepare('SELECT * FROM sync_tombstones').all() as unknown as SyncTombstone[],
    modules: db.prepare('SELECT * FROM modules').all() as Record<string, unknown>[],
    study_logs: db.prepare('SELECT * FROM study_logs').all() as Record<string, unknown>[],
    game_ideas: db.prepare('SELECT * FROM game_ideas').all() as Record<string, unknown>[],
    ai_reviews: db.prepare('SELECT * FROM ai_reviews').all() as Record<string, unknown>[],
    prompt_templates: db.prepare('SELECT * FROM prompt_templates').all() as Record<string, unknown>[],
    ai_conversations: db.prepare('SELECT * FROM ai_conversations').all() as Record<string, unknown>[],
    ai_messages: db.prepare('SELECT * FROM ai_messages').all() as Record<string, unknown>[],
  };
}

function rowTimestamp(row: Record<string, unknown>): string {
  return String(row.updated_at || row.created_at || '1970-01-01T00:00:00.000Z');
}

function mergeRows(
  entityType: string,
  localRows: Record<string, unknown>[],
  remoteRows: Record<string, unknown>[],
  tombMap: Map<string, string>,
  keyField = 'id'
): Record<string, unknown>[] {
  const byKey = new Map<string, Record<string, unknown>>();
  for (const r of localRows) {
    byKey.set(String(r[keyField]), r);
  }
  for (const r of remoteRows || []) {
    const k = String(r[keyField]);
    const existing = byKey.get(k);
    if (!existing || rowTimestamp(r) > rowTimestamp(existing)) {
      byKey.set(k, r);
    }
  }

  const result: Record<string, unknown>[] = [];
  for (const [k, row] of byKey.entries()) {
    const delAt = tombMap.get(`${entityType}:${k}`);
    if (delAt && delAt >= rowTimestamp(row)) {
      continue; // Deleted more recently than last edit
    }
    result.push(row);
  }
  return result;
}

function mergeSnapshots(local: SyncSnapshot, remote: SyncSnapshot | null): SyncSnapshot {
  if (!remote) return local;

  // Merge tombstones
  const tombMap = new Map<string, string>();
  for (const t of [...(local.tombstones || []), ...(remote.tombstones || [])]) {
    const k = `${t.entity_type}:${t.entity_id}`;
    const prev = tombMap.get(k);
    if (!prev || t.deleted_at > prev) {
      tombMap.set(k, t.deleted_at);
    }
  }
  const mergedTombstones: SyncTombstone[] = Array.from(tombMap.entries()).map(([k, deleted_at]) => {
    const idx = k.indexOf(':');
    return { entity_type: k.slice(0, idx), entity_id: k.slice(idx + 1), deleted_at };
  });

  const modules = mergeRows('modules', local.modules, remote.modules, tombMap);
  const validModuleIds = new Set(modules.map((m) => String(m.id)));
  const study_logs = mergeRows('study_logs', local.study_logs, remote.study_logs, tombMap).filter((l) =>
    validModuleIds.has(String(l.module_id))
  );
  const game_ideas = mergeRows('game_ideas', local.game_ideas, remote.game_ideas, tombMap);
  const ai_reviews = mergeRows('ai_reviews', local.ai_reviews, remote.ai_reviews, tombMap);
  const prompt_templates = mergeRows(
    'prompt_templates',
    local.prompt_templates,
    remote.prompt_templates,
    tombMap,
    'key'
  );
  const ai_conversations = mergeRows('ai_conversations', local.ai_conversations, remote.ai_conversations, tombMap);
  const validConvIds = new Set(ai_conversations.map((c) => String(c.id)));
  const ai_messages = mergeRows('ai_messages', local.ai_messages, remote.ai_messages, tombMap).filter((m) =>
    validConvIds.has(String(m.conversation_id))
  );

  return {
    version: 1,
    syncedAt: new Date().toISOString(),
    tombstones: mergedTombstones,
    modules,
    study_logs,
    game_ideas,
    ai_reviews,
    prompt_templates,
    ai_conversations,
    ai_messages,
  };
}

function applySnapshotToDb(snap: SyncSnapshot): void {
  db.exec('BEGIN TRANSACTION');
  try {
    db.exec('PRAGMA foreign_keys = OFF;');
    db.exec(`
      DELETE FROM sync_tombstones;
      DELETE FROM ai_messages;
      DELETE FROM ai_conversations;
      DELETE FROM ai_reviews;
      DELETE FROM study_logs;
      DELETE FROM game_ideas;
      DELETE FROM modules;
    `);

    const insTomb = db.prepare(
      `INSERT OR REPLACE INTO sync_tombstones (entity_type, entity_id, deleted_at) VALUES (?, ?, ?)`
    );
    for (const t of snap.tombstones) {
      insTomb.run(t.entity_type, t.entity_id, t.deleted_at);
    }

    const insMod = db.prepare(
      `INSERT OR REPLACE INTO modules (id, name, icon, color, description, goal, sort_order, archived, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );
    for (const m of snap.modules) {
      insMod.run(
        String(m.id),
        String(m.name),
        String(m.icon || '📘'),
        String(m.color || '#6366f1'),
        String(m.description || ''),
        String(m.goal || ''),
        Number(m.sort_order || 0),
        Number(m.archived || 0),
        String(m.created_at || new Date().toISOString())
      );
    }

    const insLog = db.prepare(
      `INSERT OR REPLACE INTO study_logs (id, module_id, log_date, title, content, tasks_json, duration_minutes, rating, tags_json, ai_feedback, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );
    for (const l of snap.study_logs) {
      insLog.run(
        String(l.id),
        String(l.module_id),
        String(l.log_date),
        String(l.title),
        String(l.content || ''),
        String(l.tasks_json || '[]'),
        Number(l.duration_minutes || 0),
        Number(l.rating || 0),
        String(l.tags_json || '[]'),
        String(l.ai_feedback || ''),
        String(l.created_at || new Date().toISOString()),
        String(l.updated_at || new Date().toISOString())
      );
    }

    const insIdea = db.prepare(
      `INSERT OR REPLACE INTO game_ideas (id, title, summary, content, category, status, priority, tags_json, related_ids_json, ai_notes, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );
    for (const i of snap.game_ideas) {
      insIdea.run(
        String(i.id),
        String(i.title),
        String(i.summary || ''),
        String(i.content || ''),
        String(i.category || '玩法机制'),
        String(i.status || 'spark'),
        Number(i.priority || 2),
        String(i.tags_json || '[]'),
        String(i.related_ids_json || '[]'),
        String(i.ai_notes || ''),
        String(i.created_at || new Date().toISOString()),
        String(i.updated_at || new Date().toISOString())
      );
    }

    const insRev = db.prepare(
      `INSERT OR REPLACE INTO ai_reviews (id, scope, title, date_from, date_to, module_id, score, content, model_used, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );
    for (const r of snap.ai_reviews) {
      insRev.run(
        String(r.id),
        String(r.scope),
        String(r.title),
        String(r.date_from || ''),
        String(r.date_to || ''),
        String(r.module_id || ''),
        Number(r.score || 0),
        String(r.content || ''),
        String(r.model_used || ''),
        String(r.created_at || new Date().toISOString())
      );
    }

    if (snap.prompt_templates.length > 0) {
      const updTpl = db.prepare(
        `INSERT INTO prompt_templates (id, key, name, description, system_prompt, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(key) DO UPDATE SET
           name = excluded.name,
           description = excluded.description,
           system_prompt = excluded.system_prompt,
           updated_at = excluded.updated_at`
      );
      for (const t of snap.prompt_templates) {
        updTpl.run(
          String(t.id),
          String(t.key),
          String(t.name),
          String(t.description || ''),
          String(t.system_prompt || ''),
          String(t.updated_at || new Date().toISOString())
        );
      }
    }

    const insConv = db.prepare(
      `INSERT OR REPLACE INTO ai_conversations (id, title, context_mode, module_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)`
    );
    for (const c of snap.ai_conversations) {
      insConv.run(
        String(c.id),
        String(c.title),
        String(c.context_mode || 'all'),
        String(c.module_id || ''),
        String(c.created_at || new Date().toISOString()),
        String(c.updated_at || new Date().toISOString())
      );
    }

    const insMsg = db.prepare(
      `INSERT OR REPLACE INTO ai_messages (id, conversation_id, role, content, references_json, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`
    );
    for (const m of snap.ai_messages) {
      insMsg.run(
        String(m.id),
        String(m.conversation_id),
        String(m.role),
        String(m.content || ''),
        String(m.references_json || '[]'),
        String(m.created_at || new Date().toISOString())
      );
    }

    db.exec('PRAGMA foreign_keys = ON;');
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    db.exec('PRAGMA foreign_keys = ON;');
    throw err;
  }
}

export async function configureGithubSync(options: {
  token?: string;
  gistId?: string;
  autoSync?: boolean;
}): Promise<GithubSyncStatus> {
  const cur = getGithubConfig();
  const token = options.token?.trim() || cur.token;
  if (!token) throw new Error('请输入 GitHub Personal Access Token（需包含 gist 权限）');

  const username = await fetchGithubUser(token);
  let gistId = options.gistId !== undefined ? options.gistId.trim() : cur.gistId;
  if (!gistId) {
    const discovered = await discoverExistingGist(token);
    if (discovered) gistId = discovered;
  }

  setSetting('github_token', token);
  setSetting('github_username', username);
  if (gistId) setSetting('github_gist_id', gistId);
  if (options.autoSync !== undefined) {
    setSetting('github_auto_sync', options.autoSync ? '1' : '0');
  }
  deleteSetting('github_last_error');

  return syncWithGithubNow();
}

export async function syncWithGithubNow(): Promise<GithubSyncStatus> {
  const cfg = getGithubConfig();
  if (!cfg.token) {
    throw new Error('尚未配置 GitHub Token');
  }
  if (isSyncing) {
    return getGithubSyncStatus();
  }

  isSyncing = true;
  try {
    let gistId = cfg.gistId;
    if (!gistId) {
      const discovered = await discoverExistingGist(cfg.token);
      if (discovered) {
        gistId = discovered;
        setSetting('github_gist_id', gistId);
      }
    }

    const remote = gistId ? await fetchRemoteSnapshot(cfg.token, gistId) : null;
    const local = readLocalSnapshot();
    const merged = mergeSnapshots(local, remote);

    applySnapshotToDb(merged);
    const finalGistId = await pushSnapshot(cfg.token, gistId || null, merged);

    setSetting('github_gist_id', finalGistId);
    setSetting('github_last_sync_at', new Date().toISOString());
    deleteSetting('github_last_error');
    return getGithubSyncStatus();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    setSetting('github_last_error', msg);
    throw err;
  } finally {
    isSyncing = false;
  }
}

export function scheduleAutoSync(): void {
  const cfg = getGithubConfig();
  if (!cfg.token || !cfg.autoSync) return;
  if (autoSyncTimer) clearTimeout(autoSyncTimer);
  autoSyncTimer = setTimeout(() => {
    autoSyncTimer = null;
    syncWithGithubNow().catch(() => {});
  }, 4000);
}
