import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import type {
  StudyModule,
  StudyLog,
  StudyTask,
  GameIdea,
  IdeaStatus,
  AiReview,
  AiProvider,
  PromptTemplate,
  AiConversation,
  AiMessage,
  AiReference,
} from '../src/types.ts';

const DATA_DIR = process.env.DATA_DIR
  ? path.resolve(process.env.DATA_DIR)
  : path.resolve(process.cwd(), 'data');

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const DB_PATH = path.join(DATA_DIR, 'perlica.db');
export const db = new DatabaseSync(DB_PATH);

db.exec('PRAGMA journal_mode = WAL;');
db.exec('PRAGMA foreign_keys = ON;');

export function uid(prefix = ''): string {
  const id = crypto.randomUUID().replace(/-/g, '').slice(0, 12);
  return prefix ? `${prefix}_${id}` : id;
}

export function todayStr(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function initDb(): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS app_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sync_tombstones (
      entity_type TEXT NOT NULL,
      entity_id TEXT NOT NULL,
      deleted_at TEXT NOT NULL,
      PRIMARY KEY (entity_type, entity_id)
    );

    CREATE TABLE IF NOT EXISTS modules (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      icon TEXT NOT NULL DEFAULT '📘',
      color TEXT NOT NULL DEFAULT '#6366f1',
      description TEXT DEFAULT '',
      goal TEXT DEFAULT '',
      sort_order INTEGER DEFAULT 0,
      archived INTEGER DEFAULT 0,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS study_logs (
      id TEXT PRIMARY KEY,
      module_id TEXT NOT NULL,
      log_date TEXT NOT NULL,
      title TEXT NOT NULL,
      content TEXT DEFAULT '',
      tasks_json TEXT DEFAULT '[]',
      duration_minutes INTEGER DEFAULT 0,
      rating INTEGER DEFAULT 0,
      tags_json TEXT DEFAULT '[]',
      ai_feedback TEXT DEFAULT '',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (module_id) REFERENCES modules(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS game_ideas (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      summary TEXT DEFAULT '',
      content TEXT DEFAULT '',
      category TEXT DEFAULT '玩法机制',
      status TEXT DEFAULT 'spark',
      priority INTEGER DEFAULT 2,
      tags_json TEXT DEFAULT '[]',
      related_ids_json TEXT DEFAULT '[]',
      ai_notes TEXT DEFAULT '',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS ai_reviews (
      id TEXT PRIMARY KEY,
      scope TEXT NOT NULL,
      title TEXT NOT NULL,
      date_from TEXT DEFAULT '',
      date_to TEXT DEFAULT '',
      module_id TEXT DEFAULT '',
      score INTEGER DEFAULT 0,
      content TEXT NOT NULL,
      model_used TEXT DEFAULT '',
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS ai_providers (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      protocol TEXT NOT NULL DEFAULT 'openai',
      base_url TEXT NOT NULL,
      api_key TEXT DEFAULT '',
      model TEXT NOT NULL,
      is_active INTEGER DEFAULT 0,
      temperature REAL DEFAULT 0.7,
      max_tokens INTEGER DEFAULT 2048,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS prompt_templates (
      id TEXT PRIMARY KEY,
      key TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      description TEXT DEFAULT '',
      system_prompt TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS ai_conversations (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      context_mode TEXT NOT NULL DEFAULT 'all',
      module_id TEXT DEFAULT '',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS ai_messages (
      id TEXT PRIMARY KEY,
      conversation_id TEXT NOT NULL,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      references_json TEXT DEFAULT '[]',
      created_at TEXT NOT NULL,
      FOREIGN KEY (conversation_id) REFERENCES ai_conversations(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_study_logs_date ON study_logs(log_date);
    CREATE INDEX IF NOT EXISTS idx_study_logs_module ON study_logs(module_id);
    CREATE INDEX IF NOT EXISTS idx_game_ideas_status ON game_ideas(status);
  `);

  ensureDefaultAiConfig();
  ensureIdeaOrganizePrompt();
  ensureSessionSecret();
}

const IDEA_ORGANIZE_PROMPT = `你是一位克制、严谨的灵感整理助手。用户会发给你一段口语化或碎片化的原始游戏灵感。
你的唯一任务是帮用户把这段原文整理得条理清晰、方便日后查阅，必须严格遵守以下规则：
1. 【严禁添油加醋】绝对不要自行发明、扩写、猜测或脑补原文里没有提到的玩法、剧情、数值、美术或系统！
2. 【完整保留原意】原文里的每一个有效点子、比喻、条件、限制和关键词都必须保留，不得遗漏或篡改含义。
3. 【只做结构化梳理】提炼一个简短准确的标题（15字以内），2~4个精准标签，并把原文按逻辑自然分条整理成清晰的 Markdown（原文很短就简洁分条，不要硬凑空洞大纲）。
4. 仅返回合法 JSON 对象（不要用 \`\`\`json 包裹），格式严格为：
{"title": "简短标题", "tags": ["标签1", "标签2"], "organized": "忠实原文整理后的 Markdown 文本"}`;

function ensureIdeaOrganizePrompt(): void {
  const exists = db.prepare("SELECT id FROM prompt_templates WHERE key = 'idea_organize'").get();
  if (!exists) {
    db.prepare(
      `INSERT INTO prompt_templates (id, key, name, description, system_prompt, updated_at)
       VALUES (?, 'idea_organize', '游戏灵感忠实整理（不添油加醋）', '仅按原文梳理结构、提炼标题与标签，严禁自行脑补扩写。', ?, ?)`
    ).run(uid('tpl'), IDEA_ORGANIZE_PROMPT, new Date().toISOString());
  }
}

export function getSetting(key: string): string | null {
  const row = db.prepare('SELECT value FROM app_settings WHERE key = ?').get(key) as
    | { value: string }
    | undefined;
  return row ? row.value : null;
}

export function setSetting(key: string, value: string): void {
  db.prepare(
    `INSERT INTO app_settings (key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`
  ).run(key, value);
}

export function deleteSetting(key: string): void {
  db.prepare('DELETE FROM app_settings WHERE key = ?').run(key);
}

function ensureSessionSecret(): string {
  let secret = getSetting('session_secret');
  if (!secret) {
    secret = crypto.randomBytes(32).toString('hex');
    setSetting('session_secret', secret);
  }
  return secret;
}

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

export function verifyPassword(password: string): boolean {
  const envPass = process.env.PERLICA_PASSWORD?.trim();
  if (envPass) {
    const a = Buffer.from(password);
    const b = Buffer.from(envPass);
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  }
  const stored = getSetting('auth_password_hash');
  if (!stored) return true;
  const [salt, keyHex] = stored.split(':');
  if (!salt || !keyHex) return false;
  const derived = crypto.scryptSync(password, salt, 64);
  const keyBuf = Buffer.from(keyHex, 'hex');
  return derived.length === keyBuf.length && crypto.timingSafeEqual(derived, keyBuf);
}

export function isAuthEnabled(): boolean {
  return Boolean(process.env.PERLICA_PASSWORD?.trim() || getSetting('auth_password_hash'));
}

export function createSessionToken(): string {
  const secret = ensureSessionSecret();
  const exp = Date.now() + 30 * 24 * 60 * 60 * 1000; // 30 days
  const nonce = crypto.randomBytes(8).toString('hex');
  const payload = `${exp}.${nonce}`;
  const sig = crypto.createHmac('sha256', secret).update(payload).digest('hex');
  return `${payload}.${sig}`;
}

export function verifySessionToken(token: string | undefined | null): boolean {
  if (!token) return false;
  const parts = token.split('.');
  if (parts.length !== 3) return false;
  const [expStr, nonce, sig] = parts;
  const exp = Number(expStr);
  if (!Number.isFinite(exp) || Date.now() > exp) return false;
  const secret = ensureSessionSecret();
  const expected = crypto.createHmac('sha256', secret).update(`${expStr}.${nonce}`).digest('hex');
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export function rotateSessionSecret(): void {
  setSetting('session_secret', crypto.randomBytes(32).toString('hex'));
}

export function recordDeletion(entityType: string, entityId: string): void {
  db.prepare(
    `INSERT INTO sync_tombstones (entity_type, entity_id, deleted_at)
     VALUES (?, ?, ?)
     ON CONFLICT(entity_type, entity_id) DO UPDATE SET deleted_at = excluded.deleted_at`
  ).run(entityType, entityId, new Date().toISOString());
}

export function resetUserData(keepAiConfig = true): void {
  db.exec(`
    DELETE FROM ai_messages;
    DELETE FROM ai_conversations;
    DELETE FROM ai_reviews;
    DELETE FROM study_logs;
    DELETE FROM game_ideas;
    DELETE FROM modules;
    DELETE FROM sync_tombstones;
  `);
  if (!keepAiConfig) {
    db.exec(`
      DELETE FROM ai_providers;
      DELETE FROM prompt_templates;
    `);
    ensureDefaultAiConfig();
  }
}

function ensureDefaultAiConfig(): void {
  const now = new Date().toISOString();

  const providerCount = (db.prepare('SELECT COUNT(*) as c FROM ai_providers').get() as { c: number }).c;
  if (providerCount === 0) {
    const insertProvider = db.prepare(`
      INSERT INTO ai_providers (id, name, protocol, base_url, api_key, model, is_active, temperature, max_tokens, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    insertProvider.run('prov_deepseek', 'DeepSeek', 'openai', 'https://api.deepseek.com/v1', '', 'deepseek-chat', 1, 0.7, 2048, now);
    insertProvider.run('prov_openai', 'OpenAI', 'openai', 'https://api.openai.com/v1', '', 'gpt-4o-mini', 0, 0.7, 2048, now);
    insertProvider.run('prov_gemini', 'Google Gemini', 'gemini', 'https://generativelanguage.googleapis.com/v1beta', '', 'gemini-2.5-flash', 0, 0.7, 2048, now);
    insertProvider.run('prov_claude', 'Anthropic Claude', 'anthropic', 'https://api.anthropic.com', '', 'claude-3-7-sonnet-latest', 0, 0.7, 2048, now);
    insertProvider.run('prov_ollama', '本地 Ollama', 'openai', 'http://127.0.0.1:11434/v1', 'ollama', 'qwen2.5:14b', 0, 0.7, 2048, now);
  }

  const tplCount = (db.prepare('SELECT COUNT(*) as c FROM prompt_templates').get() as { c: number }).c;
  if (tplCount === 0) {
    const insertTpl = db.prepare(`
      INSERT INTO prompt_templates (id, key, name, description, system_prompt, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    const templates = [
      {
        key: 'daily_review',
        name: '每日/阶段学习复盘评价',
        description: '汇总指定日期或板块的学习日志，客观打分、指出亮点与盲区并给出可执行建议。',
        system_prompt: `你是一位严格但善解人意的私人学习导师与技术教练。请根据用户提交的学习日志与任务完成情况，输出结构化 Markdown 复盘报告：
1. 第一行请给出客观综合评分，格式严格为：\`综合评分：XX/100\`
2. **核心成果汇总**：按板块提炼真正掌握的知识点与产出。
3. **问题与薄弱项诊断**：指出时间分配、深度不足、未完成任务或知识衔接漏洞（不要一味夸奖，要直击痛点）。
4. **明日/下阶段可执行行动**：给出 3 条具体、可落地的下一步建议（如练习题、源码阅读、微项目验证）。`,
      },
      {
        key: 'single_log_eval',
        name: '单篇日志深度点评',
        description: '对单条学习记录进行知识查漏补缺与延伸提问。',
        system_prompt: `你是一位精通计算机图形学、游戏引擎（Unreal Engine）和高等数学的技术导师。请针对用户的单条学习日志：
1. 检验笔记中是否存在概念偏差或遗漏的关键前提；
2. 提出 2 个检验真懂与否的思考题；
3. 给出一个 15 分钟内可完成的小实践建议。使用简洁的 Markdown（支持 LaTeX 与代码块）。`,
      },
      {
        key: 'idea_expand',
        name: '游戏灵感机制扩写',
        description: '把一条零碎的灵感扩写成核心循环、系统拆解与最小原型方案。',
        system_prompt: `你是一位资深独立游戏制作人与主策划。请把用户的游戏灵感深化为可落地的设计草案，包含：
1. **核心钩子（Core Hook）**：一句话提炼最抓人的玩家情绪与差异化。
2. **核心玩法循环（Core Loop）**：30秒微观循环 + 10分钟中观循环。
3. **关键系统拆解**：至少拆出 3 个互相咬合的机制，说明正负反馈。
4. **MVP 原型验证方案**：在 UE5 或轻量引擎中 1 周内怎么做出可玩灰盒验证乐趣。`,
      },
      {
        key: 'idea_critique',
        name: '游戏灵感挑刺与风险评估',
        description: '以毒舌主策划视角找出玩法漏洞、开发陷阱与玩家疲劳点。',
        system_prompt: `你是一位以犀利著称的资深游戏策划评审。请无情但建设性地挑出这个游戏灵感的潜在问题：
1. **玩法与体验漏洞**：是否存在最优解退化、重复疲劳、上手门槛过高或目标感缺失？
2. **制作范围风险（Scope Creep）**：哪些地方对个人/小团队来说制作成本过高？
3. **破局修正建议**：针对上述每个痛点，给出具体的“做减法”或机制替代方案。`,
      },
      {
        key: 'idea_crosslink',
        name: '跨灵感碰撞与融合',
        description: '结合历史游戏灵感库，寻找化学反应并提出融合方向。',
        system_prompt: `你是一位擅长创意组合的游戏设计师。请阅读当前目标灵感以及用户的历史灵感列表，找出 2~3 个最具化学反应的关联点，并提出 2 个具体的“跨灵感融合提案”（说明如何把不同灵感的机制/氛围/叙事拼成更有辨识度的作品）。`,
      },
      {
        key: 'auto_tag',
        name: '智能标签与摘要提取',
        description: '自动分析日志或灵感内容，输出精炼标签与一句话摘要。',
        system_prompt: `请分析输入的内容，仅返回合法的 JSON 对象（不要 Markdown 代码块包裹），结构为：
{"tags": ["标签1", "标签2", "标签3"], "summary": "25字以内的一句话核心概括", "category": "仅游戏灵感时填写最匹配分类如玩法机制/世界观剧情/美术风格/系统数值/关卡体验/音频氛围"}
标签数量控制在 2~5 个，简短精准。`,
      },
      {
        key: 'knowledge_chat',
        name: '个人知识库 AI 对话助手',
        description: '基于全部历史学习日志和游戏灵感进行问答、检索与规划。',
        system_prompt: `你是 Perlica 的内置个人 AI 参谋，熟悉用户的学习路线与游戏创意积累。
你会收到从用户数据库中检索出的相关学习日志和游戏灵感片段。请优先结合这些真实记录回答用户，明确引用相关记录标题，帮助用户串联知识（例如把数学分析中的概念联系到 UE5 渲染/物理，或把学到的技术联系到游戏灵感落地）。如果记录中没有相关信息，请坦诚说明并给出专业补充。`,
      },
    ];
    for (const t of templates) {
      insertTpl.run(uid('tpl'), t.key, t.name, t.description, t.system_prompt, now);
    }
  }
}

function safeJsonParse<T>(raw: string | null | undefined, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function mapStudyLog(row: Record<string, unknown>): StudyLog {
  return {
    id: String(row.id),
    module_id: String(row.module_id),
    log_date: String(row.log_date),
    title: String(row.title),
    content: String(row.content ?? ''),
    tasks: safeJsonParse<StudyTask[]>(row.tasks_json as string, []),
    duration_minutes: Number(row.duration_minutes ?? 0),
    rating: Number(row.rating ?? 0),
    tags: safeJsonParse<string[]>(row.tags_json as string, []),
    ai_feedback: String(row.ai_feedback ?? ''),
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
  };
}

export function mapGameIdea(row: Record<string, unknown>): GameIdea {
  return {
    id: String(row.id),
    title: String(row.title),
    summary: String(row.summary ?? ''),
    content: String(row.content ?? ''),
    category: String(row.category ?? '玩法机制'),
    status: (row.status as IdeaStatus) || 'spark',
    priority: Number(row.priority ?? 2),
    tags: safeJsonParse<string[]>(row.tags_json as string, []),
    related_ids: safeJsonParse<string[]>(row.related_ids_json as string, []),
    ai_notes: String(row.ai_notes ?? ''),
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
  };
}

export function mapAiMessage(row: Record<string, unknown>): AiMessage {
  return {
    id: String(row.id),
    conversation_id: String(row.conversation_id),
    role: row.role as 'user' | 'assistant',
    content: String(row.content ?? ''),
    references: safeJsonParse<AiReference[]>(row.references_json as string, []),
    created_at: String(row.created_at),
  };
}

export function getActiveProvider(providerId?: string): AiProvider | null {
  if (providerId) {
    const row = db.prepare('SELECT * FROM ai_providers WHERE id = ?').get(providerId) as AiProvider | undefined;
    if (row) return row;
  }
  const active = db.prepare('SELECT * FROM ai_providers WHERE is_active = 1 LIMIT 1').get() as AiProvider | undefined;
  if (active) return active;
  const first = db.prepare('SELECT * FROM ai_providers LIMIT 1').get() as AiProvider | undefined;
  return first ?? null;
}

export function getPromptTemplate(key: string): PromptTemplate | null {
  const row = db.prepare('SELECT * FROM prompt_templates WHERE key = ?').get(key) as PromptTemplate | undefined;
  return row ?? null;
}

export function listModulesWithStats(): StudyModule[] {
  const rows = db.prepare(`
    SELECT m.*,
      COUNT(l.id) as log_count,
      COALESCE(SUM(l.duration_minutes), 0) as total_minutes
    FROM modules m
    LEFT JOIN study_logs l ON l.module_id = m.id
    WHERE m.archived = 0
    GROUP BY m.id
    ORDER BY m.sort_order ASC, m.created_at ASC
  `).all() as unknown as StudyModule[];
  return rows;
}

export function listAllReviews(): AiReview[] {
  return db.prepare('SELECT * FROM ai_reviews ORDER BY created_at DESC LIMIT 60').all() as unknown as AiReview[];
}

export function listConversations(): AiConversation[] {
  return db.prepare('SELECT * FROM ai_conversations ORDER BY updated_at DESC LIMIT 50').all() as unknown as AiConversation[];
}
