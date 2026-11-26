import type {
  AiConversation,
  AiMessage,
  AiProvider,
  AiReference,
  AiReview,
  AuthStatus,
  DashboardStats,
  GameIdea,
  GithubSyncStatus,
  NetworkInfo,
  PromptTemplate,
  StudyLog,
  StudyModule,
  StudyTask,
  TunnelStatus,
} from './types.ts';

const STORAGE_KEY = 'perlica_static_db_v1';
const GIST_FILENAME = 'perlica-sync.json';
const GIST_DESCRIPTION = 'Perlica Sync Data (Private Backup — Do Not Share)';

interface Tombstone {
  entity_type: string;
  entity_id: string;
  deleted_at: string;
}

interface LocalDbState {
  modules: StudyModule[];
  study_logs: StudyLog[];
  game_ideas: GameIdea[];
  ai_reviews: AiReview[];
  ai_providers: AiProvider[];
  prompt_templates: PromptTemplate[];
  ai_conversations: AiConversation[];
  ai_messages: AiMessage[];
  tombstones: Tombstone[];
  github: {
    token: string;
    gistId: string;
    username: string;
    autoSync: boolean;
    lastSyncAt: string | null;
    lastError: string | null;
  };
}

interface SyncSnapshot {
  version: number;
  syncedAt: string;
  tombstones: Tombstone[];
  modules: Record<string, unknown>[];
  study_logs: Record<string, unknown>[];
  game_ideas: Record<string, unknown>[];
  ai_reviews: Record<string, unknown>[];
  ai_providers?: Record<string, unknown>[];
  prompt_templates: Record<string, unknown>[];
  ai_conversations: Record<string, unknown>[];
  ai_messages: Record<string, unknown>[];
}

function uid(prefix = ''): string {
  const raw =
    typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID().replace(/-/g, '').slice(0, 12)
      : Math.random().toString(36).slice(2, 14);
  return prefix ? `${prefix}_${raw}` : raw;
}

function todayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function defaultProviders(): AiProvider[] {
  const now = new Date().toISOString();
  return [
    { id: 'prov_deepseek', name: 'DeepSeek', protocol: 'openai', base_url: 'https://api.deepseek.com/v1', api_key: '', model: 'deepseek-chat', is_active: 1, temperature: 0.7, max_tokens: 2048, created_at: now },
    { id: 'prov_openai', name: 'OpenAI', protocol: 'openai', base_url: 'https://api.openai.com/v1', api_key: '', model: 'gpt-4o-mini', is_active: 0, temperature: 0.7, max_tokens: 2048, created_at: now },
    { id: 'prov_gemini', name: 'Google Gemini', protocol: 'gemini', base_url: 'https://generativelanguage.googleapis.com/v1beta', api_key: '', model: 'gemini-2.5-flash', is_active: 0, temperature: 0.7, max_tokens: 2048, created_at: now },
    { id: 'prov_claude', name: 'Anthropic Claude', protocol: 'anthropic', base_url: 'https://api.anthropic.com', api_key: '', model: 'claude-3-7-sonnet-latest', is_active: 0, temperature: 0.7, max_tokens: 2048, created_at: now },
    { id: 'prov_silicon', name: '硅基流动 SiliconFlow', protocol: 'openai', base_url: 'https://api.siliconflow.cn/v1', api_key: '', model: 'deepseek-ai/DeepSeek-V3', is_active: 0, temperature: 0.7, max_tokens: 2048, created_at: now },
  ];
}

function defaultPrompts(): PromptTemplate[] {
  const now = new Date().toISOString();
  return [
    {
      id: 'tpl_daily',
      key: 'daily_review',
      name: '每日/阶段学习复盘评价',
      description: '汇总指定日期或板块的学习日志，客观打分、指出亮点与盲区并给出可执行建议。',
      system_prompt: `你是一位严格但善解人意的私人学习导师与技术教练。请根据用户提交的学习日志与任务完成情况，输出结构化 Markdown 复盘报告：
1. 第一行请给出客观综合评分，格式严格为：\`综合评分：XX/100\`
2. **核心成果汇总**：按板块提炼真正掌握的知识点与产出。
3. **问题与薄弱项诊断**：指出时间分配、深度不足、未完成任务或知识衔接漏洞（不要一味夸奖，要直击痛点）。
4. **明日/下阶段可执行行动**：给出 3 条具体、可落地的下一步建议（如练习题、源码阅读、微项目验证）。`,
      updated_at: now,
    },
    {
      id: 'tpl_single',
      key: 'single_log_eval',
      name: '单篇日志深度点评',
      description: '对单条学习记录进行知识查漏补缺与延伸提问。',
      system_prompt: `你是一位精通计算机图形学、游戏引擎（Unreal Engine）和高等数学的技术导师。请针对用户的单条学习日志：
1. 检验笔记中是否存在概念偏差或遗漏的关键前提；
2. 提出 2 个检验真懂与否的思考题；
3. 给出一个 15 分钟内可完成的小实践建议。使用简洁的 Markdown（支持 LaTeX 与代码块）。`,
      updated_at: now,
    },
    {
      id: 'tpl_study_org',
      key: 'study_organize',
      name: '学习日志自动分类与整理',
      description: '根据记录内容自动归类，并保留原文整理为结构化复习要点。',
      system_prompt: `你是一位克制、条理清晰的学习笔记整理与分类助手。用户会发给你一段今天随手记下的原始学习记录（可能比较口语化或零散）。
你的任务是帮用户自动分类并整理归纳成清晰易复习的笔记，必须严格遵守以下规则：
1. 【自动分类】根据学习内容判断所属学科或领域分类（2~8字，简洁准确，如：虚幻引擎 UE5、数学分析、C++、计算机图形学、算法等）。如果消息中提供了「已有分类」，且内容明显属于其中某一类，请**优先复用完全一致的已有分类名称**，避免产生重复分类；同时给出一个贴切的单个 Emoji 图标。
2. 【忠于原文，不胡乱编造】严格以用户写下的内容为核心进行归纳，不要凭空编造用户根本没学过的大段章节；但可以对用户提到的数学公式规范化为标准 LaTeX（行内用 $...$，独立公式用 $$...$$），对提到的代码/引擎接口用规范代码块排版。
3. 【提炼标题与标签】提炼一个简短准确的标题（15字以内），以及 2~4 个精准的知识点标签。
4. 【结构化归纳】按逻辑将今日所学归纳为简洁的 Markdown 要点（仅在原文有对应内容时分条，原文简短就精炼分条，不要硬凑空洞大纲）。
5. 仅返回合法 JSON 对象（不要用 \`\`\`json 包裹），格式严格为：
{"category": "分类名称", "icon": "📘", "title": "简短标题", "tags": ["标签1", "标签2"], "organized": "整理归纳后的 Markdown 文本"}`,
      updated_at: now,
    },
    {
      id: 'tpl_organize',
      key: 'idea_organize',
      name: '游戏灵感忠实整理（不添油加醋）',
      description: '仅按原文梳理结构、提炼标题与标签，严禁自行脑补扩写。',
      system_prompt: `你是一位克制、严谨的灵感整理助手。用户会发给你一段口语化或碎片化的原始游戏灵感。
你的唯一任务是帮用户把这段原文整理得条理清晰、方便日后查阅，必须严格遵守以下规则：
1. 【严禁添油加醋】绝对不要自行发明、扩写、猜测或脑补原文里没有提到的玩法、剧情、数值、美术或系统！
2. 【完整保留原意】原文里的每一个有效点子、比喻、条件、限制和关键词都必须保留，不得遗漏或篡改含义。
3. 【只做结构化梳理】提炼一个简短准确的标题（15字以内），2~4个精准标签，并把原文按逻辑自然分条整理成清晰的 Markdown（原文很短就简洁分条，不要硬凑空洞大纲）。
4. 仅返回合法 JSON 对象（不要用 \`\`\`json 包裹），格式严格为：
{"title": "简短标题", "tags": ["标签1", "标签2"], "organized": "忠实原文整理后的 Markdown 文本"}`,
      updated_at: now,
    },
    {
      id: 'tpl_expand',
      key: 'idea_expand',
      name: '游戏灵感机制扩写',
      description: '把一条零碎的灵感扩写成核心循环、系统拆解与最小原型方案。',
      system_prompt: `你是一位资深独立游戏制作人与主策划。请把用户的游戏灵感深化为可落地的设计草案，包含：
1. **核心钩子（Core Hook）**：一句话提炼最抓人的玩家情绪与差异化。
2. **核心玩法循环（Core Loop）**：30秒微观循环 + 10分钟中观循环。
3. **关键系统拆解**：至少拆出 3 个互相咬合的机制，说明正负反馈。
4. **MVP 原型验证方案**：在 UE5 或轻量引擎中 1 周内怎么做出可玩灰盒验证乐趣。`,
      updated_at: now,
    },
    {
      id: 'tpl_critique',
      key: 'idea_critique',
      name: '游戏灵感挑刺与风险评估',
      description: '以毒舌主策划视角找出玩法漏洞、开发陷阱与玩家疲劳点。',
      system_prompt: `你是一位以犀利著称的资深游戏策划评审。请无情但建设性地挑出这个游戏灵感的潜在问题：
1. **玩法与体验漏洞**：是否存在最优解退化、重复疲劳、上手门槛过高或目标感缺失？
2. **制作范围风险（Scope Creep）**：哪些地方对个人/小团队来说制作成本过高？
3. **破局修正建议**：针对上述每个痛点，给出具体的“做减法”或机制替代方案。`,
      updated_at: now,
    },
    {
      id: 'tpl_cross',
      key: 'idea_crosslink',
      name: '跨灵感碰撞与融合',
      description: '结合历史游戏灵感库，寻找化学反应并提出融合方向。',
      system_prompt: `你是一位擅长创意组合的游戏设计师。请阅读当前目标灵感以及用户的历史灵感列表，找出 2~3 个最具化学反应的关联点，并提出 2 个具体的“跨灵感融合提案”。`,
      updated_at: now,
    },
    {
      id: 'tpl_tag',
      key: 'auto_tag',
      name: '智能标签与摘要提取',
      description: '自动分析日志或灵感内容，输出精炼标签与一句话摘要。',
      system_prompt: `请分析输入的内容，仅返回合法的 JSON 对象（不要 Markdown 代码块包裹），结构为：
{"tags": ["标签1", "标签2", "标签3"], "summary": "25字以内的一句话核心概括", "category": "仅游戏灵感时填写最匹配分类如玩法机制/世界观剧情/美术风格/系统数值/关卡体验/音频氛围"}
标签数量控制在 2~5 个，简短精准。`,
      updated_at: now,
    },
    {
      id: 'tpl_chat',
      key: 'knowledge_chat',
      name: '个人知识库 AI 对话助手',
      description: '基于全部历史学习日志和游戏灵感进行问答、检索与规划。',
      system_prompt: `你是 Perlica 的内置个人 AI 参谋，熟悉用户的学习路线与游戏创意积累。
你会收到从用户数据库中检索出的相关学习日志和游戏灵感片段。请优先结合这些真实记录回答用户，明确引用相关记录标题，帮助用户串联知识。如果记录中没有相关信息，请坦诚说明并给出专业补充。`,
      updated_at: now,
    },
  ];
}

function emptyState(): LocalDbState {
  return {
    modules: [],
    study_logs: [],
    game_ideas: [],
    ai_reviews: [],
    ai_providers: defaultProviders(),
    prompt_templates: defaultPrompts(),
    ai_conversations: [],
    ai_messages: [],
    tombstones: [],
    github: {
      token: '',
      gistId: '',
      username: '',
      autoSync: true,
      lastSyncAt: null,
      lastError: null,
    },
  };
}

function loadState(): LocalDbState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      const fresh = emptyState();
      localStorage.setItem(STORAGE_KEY, JSON.stringify(fresh));
      return fresh;
    }
    const parsed = JSON.parse(raw) as Partial<LocalDbState>;
    const base = emptyState();
    const mergedPrompts = parsed.prompt_templates?.length ? [...parsed.prompt_templates] : base.prompt_templates;
    if (!mergedPrompts.some((t) => t.key === 'idea_organize')) {
      const orgTpl = base.prompt_templates.find((t) => t.key === 'idea_organize');
      if (orgTpl) mergedPrompts.unshift(orgTpl);
    }
    const studyTplDefault = base.prompt_templates.find((t) => t.key === 'study_organize');
    const existingStudyIdx = mergedPrompts.findIndex((t) => t.key === 'study_organize');
    if (existingStudyIdx < 0 && studyTplDefault) {
      mergedPrompts.unshift(studyTplDefault);
    } else if (
      existingStudyIdx >= 0 &&
      studyTplDefault &&
      !mergedPrompts[existingStudyIdx].system_prompt.includes('"category"')
    ) {
      mergedPrompts[existingStudyIdx] = {
        ...mergedPrompts[existingStudyIdx],
        name: studyTplDefault.name,
        description: studyTplDefault.description,
        system_prompt: studyTplDefault.system_prompt,
        updated_at: new Date().toISOString(),
      };
    }
    return {
      ...base,
      ...parsed,
      ai_providers: parsed.ai_providers?.length ? parsed.ai_providers : base.ai_providers,
      prompt_templates: mergedPrompts,
      github: { ...base.github, ...(parsed.github || {}) },
    };
  } catch {
    return emptyState();
  }
}

function saveState(state: LocalDbState): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

let isSyncing = false;
let autoSyncTimer: ReturnType<typeof setTimeout> | null = null;

function scheduleAutoSync(): void {
  const st = loadState();
  if (!st.github.token || !st.github.autoSync) return;
  if (autoSyncTimer) clearTimeout(autoSyncTimer);
  autoSyncTimer = setTimeout(() => {
    autoSyncTimer = null;
    localEngine.syncGithubNow().catch(() => {});
  }, 1500);
}

const AUTO_CATEGORY_COLORS = ['#6366f1', '#0ea5e9', '#10b981', '#f59e0b', '#ec4899', '#8b5cf6', '#14b8a6', '#f97316'];

function pickLocalCategoryIcon(name: string, aiIcon?: string): string {
  const cleanAi = (aiIcon || '').trim();
  if (cleanAi && cleanAi.length <= 4 && !/[a-zA-Z0-9]/.test(cleanAi)) return cleanAi;
  const n = name.toLowerCase();
  if (/ue|unreal|虚幻|unity|godot|游戏|game/.test(n)) return '🎮';
  if (/数|微积分|线代|概率|代数|几何|拓扑|math/.test(n)) return '∫';
  if (/图形|渲染|shader|opengl|vulkan|directx|3d/.test(n)) return '🎨';
  if (/算法|数据结构|leetcode|刷题/.test(n)) return '🧩';
  if (/c\+\+|cpp|rust|python|java|ts|js|代码|编程|架构|系统|网络|linux/.test(n)) return '💻';
  if (/ai|机器学习|深度学习|llm|神经网络/.test(n)) return '🧠';
  if (/物理|力学|光学/.test(n)) return '🔬';
  if (/英|日|语|外语/.test(n)) return '🌐';
  return '📘';
}

function ensureLocalUncategorized(st: LocalDbState): string {
  const id = 'mod_uncategorized';
  if (!st.modules.some((m) => m.id === id)) {
    st.modules.push({
      id,
      name: '未分类',
      icon: '📝',
      color: '#64748b',
      description: '',
      goal: '',
      sort_order: 999,
      archived: 0,
      created_at: new Date().toISOString(),
    });
  }
  return id;
}

function findOrCreateLocalAutoCategory(st: LocalDbState, categoryName: string, aiIcon?: string): StudyModule {
  const trimmed = categoryName.trim().slice(0, 20);
  if (!trimmed || trimmed === '未分类') {
    const id = ensureLocalUncategorized(st);
    return st.modules.find((m) => m.id === id)!;
  }
  const exact = st.modules.find((m) => !m.archived && m.name.trim().toLowerCase() === trimmed.toLowerCase());
  if (exact) return exact;

  const existingRealCount = st.modules.filter((m) => !m.archived && m.id !== 'mod_uncategorized').length;
  const created: StudyModule = {
    id: uid('mod'),
    name: trimmed,
    icon: pickLocalCategoryIcon(trimmed, aiIcon),
    color: AUTO_CATEGORY_COLORS[existingRealCount % AUTO_CATEGORY_COLORS.length],
    description: '',
    goal: '',
    sort_order: existingRealCount,
    archived: 0,
    created_at: new Date().toISOString(),
  };
  st.modules.push(created);
  return created;
}

function recordDeletion(state: LocalDbState, entityType: string, entityId: string): void {
  const now = new Date().toISOString();
  const idx = state.tombstones.findIndex((t) => t.entity_type === entityType && t.entity_id === entityId);
  if (idx >= 0) state.tombstones[idx].deleted_at = now;
  else state.tombstones.push({ entity_type: entityType, entity_id: entityId, deleted_at: now });
}

// ---------- Browser-Direct GitHub Gist Sync ----------
function ghHeaders(token: string): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github+json',
    'Content-Type': 'application/json',
  };
}

function safeParse<T>(raw: unknown, fallback: T): T {
  if (typeof raw !== 'string') return (raw as T) ?? fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function stateToWireSnapshot(state: LocalDbState): SyncSnapshot {
  return {
    version: 1,
    syncedAt: new Date().toISOString(),
    tombstones: state.tombstones,
    modules: state.modules.map((m) => ({
      id: m.id,
      name: m.name,
      icon: m.icon,
      color: m.color,
      description: m.description,
      goal: m.goal,
      sort_order: m.sort_order,
      archived: m.archived,
      created_at: m.created_at,
    })),
    study_logs: state.study_logs.map((l) => ({
      id: l.id,
      module_id: l.module_id,
      log_date: l.log_date,
      title: l.title,
      content: l.content,
      tasks_json: JSON.stringify(l.tasks || []),
      duration_minutes: l.duration_minutes,
      rating: l.rating,
      tags_json: JSON.stringify(l.tags || []),
      ai_feedback: l.ai_feedback,
      created_at: l.created_at,
      updated_at: l.updated_at,
    })),
    game_ideas: state.game_ideas.map((i) => ({
      id: i.id,
      title: i.title,
      summary: i.summary,
      content: i.content,
      category: i.category,
      status: i.status,
      priority: i.priority,
      tags_json: JSON.stringify(i.tags || []),
      related_ids_json: JSON.stringify(i.related_ids || []),
      ai_notes: i.ai_notes,
      created_at: i.created_at,
      updated_at: i.updated_at,
    })),
    ai_reviews: state.ai_reviews.map((r) => ({ ...r })),
    ai_providers: state.ai_providers.map((p) => ({ ...p })),
    prompt_templates: state.prompt_templates.map((t) => ({ ...t })),
    ai_conversations: state.ai_conversations.map((c) => ({ ...c })),
    ai_messages: state.ai_messages.map((m) => ({
      id: m.id,
      conversation_id: m.conversation_id,
      role: m.role,
      content: m.content,
      references_json: JSON.stringify(m.references || []),
      created_at: m.created_at,
    })),
  };
}

function rowTs(row: Record<string, unknown>): string {
  return String(row.updated_at || row.created_at || '1970-01-01T00:00:00.000Z');
}

function mergeWireRows(
  entityType: string,
  localRows: Record<string, unknown>[],
  remoteRows: Record<string, unknown>[],
  tombMap: Map<string, string>,
  keyField = 'id'
): Record<string, unknown>[] {
  const byKey = new Map<string, Record<string, unknown>>();
  for (const r of localRows) byKey.set(String(r[keyField]), r);
  for (const r of remoteRows || []) {
    const k = String(r[keyField]);
    const existing = byKey.get(k);
    if (!existing || rowTs(r) > rowTs(existing)) byKey.set(k, r);
  }
  const out: Record<string, unknown>[] = [];
  for (const [k, row] of byKey.entries()) {
    const delAt = tombMap.get(`${entityType}:${k}`);
    if (delAt && delAt >= rowTs(row)) continue;
    out.push(row);
  }
  return out;
}

function applyMergedWireSnapshot(state: LocalDbState, snap: SyncSnapshot): LocalDbState {
  state.tombstones = snap.tombstones || [];
  state.modules = snap.modules.map((m) => ({
    id: String(m.id),
    name: String(m.name),
    icon: String(m.icon || '📘'),
    color: String(m.color || '#6366f1'),
    description: String(m.description || ''),
    goal: String(m.goal || ''),
    sort_order: Number(m.sort_order || 0),
    archived: Number(m.archived || 0),
    created_at: String(m.created_at || new Date().toISOString()),
  }));
  state.study_logs = snap.study_logs.map((l) => ({
    id: String(l.id),
    module_id: String(l.module_id),
    log_date: String(l.log_date),
    title: String(l.title),
    content: String(l.content || ''),
    tasks: safeParse<StudyTask[]>(l.tasks_json, []),
    duration_minutes: Number(l.duration_minutes || 0),
    rating: Number(l.rating || 0),
    tags: safeParse<string[]>(l.tags_json, []),
    ai_feedback: String(l.ai_feedback || ''),
    created_at: String(l.created_at || new Date().toISOString()),
    updated_at: String(l.updated_at || new Date().toISOString()),
  }));
  state.game_ideas = snap.game_ideas.map((i) => ({
    id: String(i.id),
    title: String(i.title),
    summary: String(i.summary || ''),
    content: String(i.content || ''),
    category: String(i.category || '玩法机制'),
    status: (i.status as GameIdea['status']) || 'spark',
    priority: Number(i.priority || 2),
    tags: safeParse<string[]>(i.tags_json, []),
    related_ids: safeParse<string[]>(i.related_ids_json, []),
    ai_notes: String(i.ai_notes || ''),
    created_at: String(i.created_at || new Date().toISOString()),
    updated_at: String(i.updated_at || new Date().toISOString()),
  }));
  state.ai_reviews = snap.ai_reviews.map((r) => ({
    id: String(r.id),
    scope: (r.scope as AiReview['scope']) || 'daily',
    title: String(r.title),
    date_from: String(r.date_from || ''),
    date_to: String(r.date_to || ''),
    module_id: String(r.module_id || ''),
    score: Number(r.score || 0),
    content: String(r.content || ''),
    model_used: String(r.model_used || ''),
    created_at: String(r.created_at || new Date().toISOString()),
  }));
  if (snap.ai_providers && snap.ai_providers.length > 0) {
    state.ai_providers = snap.ai_providers.map((p) => ({
      id: String(p.id),
      name: String(p.name),
      protocol: (p.protocol as AiProvider['protocol']) || 'openai',
      base_url: String(p.base_url || ''),
      api_key: String(p.api_key || ''),
      model: String(p.model || ''),
      is_active: Number(p.is_active || 0),
      temperature: Number(p.temperature ?? 0.7),
      max_tokens: Number(p.max_tokens ?? 2048),
      created_at: String(p.created_at || new Date().toISOString()),
    }));
  }
  if (snap.prompt_templates.length > 0) {
    state.prompt_templates = snap.prompt_templates.map((t) => ({
      id: String(t.id),
      key: String(t.key),
      name: String(t.name),
      description: String(t.description || ''),
      system_prompt: String(t.system_prompt || ''),
      updated_at: String(t.updated_at || new Date().toISOString()),
    }));
  }
  state.ai_conversations = snap.ai_conversations.map((c) => ({
    id: String(c.id),
    title: String(c.title),
    context_mode: (c.context_mode as AiConversation['context_mode']) || 'all',
    module_id: String(c.module_id || ''),
    created_at: String(c.created_at || new Date().toISOString()),
    updated_at: String(c.updated_at || new Date().toISOString()),
  }));
  state.ai_messages = snap.ai_messages.map((m) => ({
    id: String(m.id),
    conversation_id: String(m.conversation_id),
    role: (m.role as 'user' | 'assistant') || 'user',
    content: String(m.content || ''),
    references: safeParse<AiReference[]>(m.references_json, []),
    created_at: String(m.created_at || new Date().toISOString()),
  }));
  return state;
}

// ---------- Browser-Direct AI Caller ----------
interface ChatTurn {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

function getProvider(state: LocalDbState, providerId?: string): AiProvider {
  const p =
    (providerId ? state.ai_providers.find((x) => x.id === providerId) : null) ||
    state.ai_providers.find((x) => x.is_active === 1) ||
    state.ai_providers[0];
  if (!p) throw new Error('请先在「设置 → AI 模型与 API Key」中配置模型');
  return p;
}

async function callBrowserLlm(
  provider: AiProvider,
  messages: ChatTurn[],
  options?: { temperature?: number; maxTokens?: number }
): Promise<string> {
  if (!provider.api_key) {
    throw new Error(`请先在「设置 → AI 模型与 API Key」中为 ${provider.name} 填写 API Key`);
  }
  const baseUrl = provider.base_url.trim().replace(/\/+$/, '');
  const temperature = options?.temperature ?? provider.temperature ?? 0.7;
  const maxTokens = options?.maxTokens ?? provider.max_tokens ?? 2048;

  if (provider.protocol === 'anthropic') {
    const systemText = messages.filter((m) => m.role === 'system').map((m) => m.content).join('\n\n');
    const chatMessages = messages.filter((m) => m.role !== 'system');
    const endpoint = baseUrl.endsWith('/v1') ? `${baseUrl}/messages` : `${baseUrl}/v1/messages`;
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': provider.api_key,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify({ model: provider.model, max_tokens: maxTokens, temperature, system: systemText || undefined, messages: chatMessages }),
    });
    if (!res.ok) throw new Error(`Anthropic API 错误 (${res.status}): ${(await res.text()).slice(0, 220)}`);
    const data = (await res.json()) as { content?: Array<{ type: string; text?: string }> };
    return (data.content || []).filter((c) => c.type === 'text').map((c) => c.text || '').join('');
  }

  if (provider.protocol === 'gemini') {
    const systemText = messages.filter((m) => m.role === 'system').map((m) => m.content).join('\n\n');
    const contents = messages
      .filter((m) => m.role !== 'system')
      .map((m) => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] }));
    const endpoint = `${baseUrl}/models/${encodeURIComponent(provider.model)}:generateContent?key=${encodeURIComponent(provider.api_key)}`;
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        system_instruction: systemText ? { parts: [{ text: systemText }] } : undefined,
        contents,
        generationConfig: { temperature, maxOutputTokens: maxTokens },
      }),
    });
    if (!res.ok) throw new Error(`Gemini API 错误 (${res.status}): ${(await res.text()).slice(0, 220)}`);
    const data = (await res.json()) as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> };
    return (data.candidates?.[0]?.content?.parts || []).map((p) => p.text || '').join('');
  }

  const endpoint = baseUrl.endsWith('/chat/completions') ? baseUrl : `${baseUrl}/chat/completions`;
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${provider.api_key}`,
    },
    body: JSON.stringify({ model: provider.model, messages, temperature, max_tokens: maxTokens }),
  });
  if (!res.ok) throw new Error(`AI API 错误 (${res.status}): ${(await res.text()).slice(0, 220)}`);
  const data = (await res.json()) as { choices?: Array<{ message?: { content?: string; reasoning_content?: string } }> };
  const msg = data.choices?.[0]?.message;
  return msg?.content || msg?.reasoning_content || '';
}

async function streamBrowserLlm(
  provider: AiProvider,
  messages: ChatTurn[],
  onDelta: (chunk: string) => void
): Promise<string> {
  if (provider.protocol !== 'openai') {
    const full = await callBrowserLlm(provider, messages);
    onDelta(full);
    return full;
  }
  if (!provider.api_key) {
    throw new Error(`请先在「设置 → AI 模型与 API Key」中为 ${provider.name} 填写 API Key`);
  }
  const baseUrl = provider.base_url.trim().replace(/\/+$/, '');
  const endpoint = baseUrl.endsWith('/chat/completions') ? baseUrl : `${baseUrl}/chat/completions`;
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${provider.api_key}`,
    },
    body: JSON.stringify({
      model: provider.model,
      messages,
      temperature: provider.temperature ?? 0.7,
      max_tokens: provider.max_tokens ?? 2048,
      stream: true,
    }),
  });
  if (!res.ok || !res.body) {
    throw new Error(`AI API 错误 (${res.status}): ${(await res.text()).slice(0, 220)}`);
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = '';
  let full = '';
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    const lines = buf.split('\n');
    buf = lines.pop() || '';
    for (const raw of lines) {
      const line = raw.trim();
      if (!line.startsWith('data:')) continue;
      const payload = line.slice(5).trim();
      if (!payload || payload === '[DONE]') continue;
      try {
        const parsed = JSON.parse(payload) as { choices?: Array<{ delta?: { content?: string } }> };
        const delta = parsed.choices?.[0]?.delta?.content;
        if (delta) {
          full += delta;
          onDelta(delta);
        }
      } catch {
        // ignore partial chunk
      }
    }
  }
  return full;
}

function formatLogsForAi(logs: StudyLog[], moduleMap: Map<string, StudyModule>): string {
  if (logs.length === 0) return '（该范围内暂无学习记录）';
  return logs
    .map((log) => {
      const mod = moduleMap.get(log.module_id);
      return [
        `### ${log.log_date} | 板块：${mod ? `${mod.icon} ${mod.name}` : '未知'} | 标题：${log.title}`,
        log.tags.length ? `- 标签：${log.tags.join(', ')}` : '',
        `- 原始记录：\n${log.content.slice(0, 1200)}`,
        log.ai_feedback ? `- AI 整理归纳：\n${log.ai_feedback.slice(0, 1200)}` : '',
      ]
        .filter(Boolean)
        .join('\n');
    })
    .join('\n\n---\n\n');
}

function formatIdeaForAi(idea: GameIdea): string {
  return [
    `# 游戏灵感：${idea.title}`,
    `- 分类：${idea.category} | 状态：${idea.status} | 优先级：P${idea.priority}`,
    `- 一句话概括：${idea.summary || '暂无'}`,
    `- 标签：${idea.tags.join(', ') || '无'}`,
    `## 详细描述\n${idea.content || '（暂无详细正文）'}`,
  ].join('\n');
}

function extractScore(md: string): number {
  const m = md.match(/综合评分[：:]\s*(\d{1,3})\s*\/\s*100/) || md.match(/(\d{1,3})\s*\/\s*100/);
  if (!m) return 0;
  const v = Number(m[1]);
  return Number.isFinite(v) ? Math.max(0, Math.min(100, v)) : 0;
}

// ---------- Exported Static Browser Engine ----------
export const localEngine = {
  getAuthStatus: async (): Promise<AuthStatus> => ({
    enabled: false,
    authenticated: true,
    envLocked: false,
  }),
  login: async () => ({ ok: true }),
  logout: async () => ({ ok: true }),
  updatePassword: async () => {
    throw new Error('纯 GitHub Pages 网页版数据仅保存在你当前设备的浏览器与私有 GitHub Gist 中，无需服务端密码锁');
  },

  getNetwork: async (): Promise<NetworkInfo> => ({
    port: 443,
    urls: [window.location.origin + window.location.pathname],
    primaryLanUrl: window.location.href,
    qrDataUrl: null,
  }),
  getTunnelStatus: async (): Promise<TunnelStatus> => ({
    installed: false,
    running: false,
    mode: null,
    url: null,
    qrDataUrl: null,
    error: null,
  }),
  startTunnel: async (): Promise<TunnelStatus> => {
    throw new Error('当前已是公网 HTTPS 网页版，无需开启穿透隧道');
  },
  stopTunnel: async (): Promise<TunnelStatus> => ({
    installed: false,
    running: false,
    mode: null,
    url: null,
    qrDataUrl: null,
    error: null,
  }),

  resetData: async (keepAiConfig = true) => {
    const st = loadState();
    const fresh = emptyState();
    fresh.github = st.github;
    if (keepAiConfig) {
      fresh.ai_providers = st.ai_providers;
      fresh.prompt_templates = st.prompt_templates;
    }
    saveState(fresh);
    scheduleAutoSync();
    return { ok: true };
  },

  getGithubSyncStatus: async (): Promise<GithubSyncStatus> => {
    const g = loadState().github;
    return {
      configured: Boolean(g.token),
      username: g.username,
      gistId: g.gistId,
      gistUrl: g.gistId ? `https://gist.github.com/${g.gistId}` : null,
      autoSync: g.autoSync,
      syncing: isSyncing,
      lastSyncAt: g.lastSyncAt,
      lastError: g.lastError,
    };
  },

  configureGithubSync: async (body: { token?: string; gistId?: string; autoSync?: boolean }): Promise<GithubSyncStatus> => {
    const st = loadState();
    const token = body.token?.trim() || st.github.token;
    if (!token) throw new Error('请输入 GitHub Personal Access Token（勾选 gist 权限）');

    const userRes = await fetch('https://api.github.com/user', { headers: ghHeaders(token) });
    if (!userRes.ok) throw new Error(`GitHub Token 验证失败 (${userRes.status})，请检查 Token`);
    const userData = (await userRes.json()) as { login?: string };

    st.github.token = token;
    st.github.username = userData.login || 'github-user';
    if (body.gistId !== undefined) st.github.gistId = body.gistId.trim();
    if (body.autoSync !== undefined) st.github.autoSync = body.autoSync;
    st.github.lastError = null;
    saveState(st);

    return localEngine.syncGithubNow();
  },

  syncGithubNow: async (): Promise<GithubSyncStatus> => {
    const st = loadState();
    const token = st.github.token;
    if (!token) throw new Error('尚未配置 GitHub Token');
    if (isSyncing) return localEngine.getGithubSyncStatus();

    isSyncing = true;
    try {
      let gistId = st.github.gistId;
      if (!gistId) {
        const listRes = await fetch('https://api.github.com/gists?per_page=50', { headers: ghHeaders(token) });
        if (listRes.ok) {
          const gists = (await listRes.json()) as Array<{ id: string; files?: Record<string, unknown> }>;
          const found = gists.find((g) => g.files && Object.prototype.hasOwnProperty.call(g.files, GIST_FILENAME));
          if (found) gistId = found.id;
        }
      }

      let remote: SyncSnapshot | null = null;
      if (gistId) {
        const getRes = await fetch(`https://api.github.com/gists/${encodeURIComponent(gistId)}`, {
          headers: ghHeaders(token),
        });
        if (getRes.ok) {
          const gd = (await getRes.json()) as {
            files?: Record<string, { content?: string; truncated?: boolean; raw_url?: string }>;
          };
          const f = gd.files?.[GIST_FILENAME];
          if (f) {
            let content = f.content || '';
            if (f.truncated && f.raw_url) {
              const rawRes = await fetch(f.raw_url, { headers: ghHeaders(token) });
              if (rawRes.ok) content = await rawRes.text();
            }
            if (content.trim()) {
              try {
                remote = JSON.parse(content) as SyncSnapshot;
              } catch {
                remote = null;
              }
            }
          }
        } else if (getRes.status === 404) {
          gistId = '';
        }
      }

      const localSnap = stateToWireSnapshot(st);
      let merged = localSnap;
      if (remote) {
        const tombMap = new Map<string, string>();
        for (const t of [...(localSnap.tombstones || []), ...(remote.tombstones || [])]) {
          const k = `${t.entity_type}:${t.entity_id}`;
          const prev = tombMap.get(k);
          if (!prev || t.deleted_at > prev) tombMap.set(k, t.deleted_at);
        }
        const mergedTombs: Tombstone[] = Array.from(tombMap.entries()).map(([k, deleted_at]) => {
          const idx = k.indexOf(':');
          return { entity_type: k.slice(0, idx), entity_id: k.slice(idx + 1), deleted_at };
        });
        const modules = mergeWireRows('modules', localSnap.modules, remote.modules, tombMap);
        const validModIds = new Set(modules.map((m) => String(m.id)));
        const study_logs = mergeWireRows('study_logs', localSnap.study_logs, remote.study_logs, tombMap).filter((l) =>
          validModIds.has(String(l.module_id))
        );
        const game_ideas = mergeWireRows('game_ideas', localSnap.game_ideas, remote.game_ideas, tombMap);
        const ai_reviews = mergeWireRows('ai_reviews', localSnap.ai_reviews, remote.ai_reviews, tombMap);
        // Merge AI providers (prefer configured API keys)
        const provById = new Map<string, Record<string, unknown>>();
        for (const p of localSnap.ai_providers || []) provById.set(String(p.id), p);
        for (const p of remote.ai_providers || []) {
          const id = String(p.id);
          const cur = provById.get(id);
          if (!cur) {
            provById.set(id, p);
          } else {
            const lk = String(cur.api_key || '').trim();
            const rk = String(p.api_key || '').trim();
            if ((!lk && rk) || (lk && rk && rowTs(p) > rowTs(cur))) provById.set(id, p);
          }
        }
        const mergedProvRaw: Record<string, unknown>[] = [];
        for (const [id, p] of provById.entries()) {
          const delAt = tombMap.get(`ai_providers:${id}`);
          if (delAt && delAt >= rowTs(p)) continue;
          mergedProvRaw.push(p);
        }
        const activeKeyProv = mergedProvRaw.find((p) => Number(p.is_active) === 1 && String(p.api_key || '').trim() && String(p.api_key) !== 'ollama');
        const anyKeyProv = mergedProvRaw.find((p) => String(p.api_key || '').trim() && String(p.api_key) !== 'ollama');
        const chosenProvId = activeKeyProv ? String(activeKeyProv.id) : anyKeyProv ? String(anyKeyProv.id) : mergedProvRaw[0] ? String(mergedProvRaw[0].id) : '';
        const ai_providers = mergedProvRaw.map((p) => ({ ...p, is_active: String(p.id) === chosenProvId ? 1 : 0 }));

        const prompt_templates = mergeWireRows('prompt_templates', localSnap.prompt_templates, remote.prompt_templates, tombMap, 'key');
        const ai_conversations = mergeWireRows('ai_conversations', localSnap.ai_conversations, remote.ai_conversations, tombMap);
        const validConvIds = new Set(ai_conversations.map((c) => String(c.id)));
        const ai_messages = mergeWireRows('ai_messages', localSnap.ai_messages, remote.ai_messages, tombMap).filter((m) =>
          validConvIds.has(String(m.conversation_id))
        );
        merged = {
          version: 2,
          syncedAt: new Date().toISOString(),
          tombstones: mergedTombs,
          modules,
          study_logs,
          game_ideas,
          ai_reviews,
          ai_providers,
          prompt_templates,
          ai_conversations,
          ai_messages,
        };
      }

      const pushUrl = gistId
        ? `https://api.github.com/gists/${encodeURIComponent(gistId)}`
        : 'https://api.github.com/gists';
      const pushRes = await fetch(pushUrl, {
        method: gistId ? 'PATCH' : 'POST',
        headers: ghHeaders(token),
        body: JSON.stringify({
          description: GIST_DESCRIPTION,
          public: false,
          files: { [GIST_FILENAME]: { content: JSON.stringify(merged, null, 2) } },
        }),
      });
      if (!pushRes.ok) throw new Error(`推送到 GitHub Gist 失败 (${pushRes.status})`);
      const pushed = (await pushRes.json()) as { id: string };

      applyMergedWireSnapshot(st, merged);
      st.github.gistId = pushed.id;
      st.github.lastSyncAt = new Date().toISOString();
      st.github.lastError = null;
      saveState(st);
      return localEngine.getGithubSyncStatus();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      st.github.lastError = msg;
      saveState(st);
      throw e;
    } finally {
      isSyncing = false;
    }
  },

  disconnectGithub: async (): Promise<GithubSyncStatus> => {
    const st = loadState();
    st.github = { token: '', gistId: '', username: '', autoSync: true, lastSyncAt: null, lastError: null };
    saveState(st);
    return localEngine.getGithubSyncStatus();
  },

  // Dashboard Stats
  getStats: async (): Promise<DashboardStats> => {
    const st = loadState();
    const today = todayStr();
    const logs = st.study_logs;
    const todayLogs = logs.filter((l) => l.log_date === today);
    const todayMinutes = todayLogs.reduce((s, l) => s + l.duration_minutes, 0);
    let todayCompletedTasks = 0;
    let todayTotalTasks = 0;
    for (const l of todayLogs) {
      todayTotalTasks += l.tasks.length;
      todayCompletedTasks += l.tasks.filter((t) => t.done).length;
    }
    const formatLocalYmd = (d: Date): string =>
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const nowDate = new Date(`${today}T00:00:00`);
    const weekAgo = new Date(nowDate);
    weekAgo.setDate(nowDate.getDate() - 6);
    const weekStartStr = formatLocalYmd(weekAgo);
    const weekFilteredLogs = logs.filter((l) => l.log_date >= weekStartStr && l.log_date <= today);
    const weekMinutes = weekFilteredLogs.reduce((s, l) => s + l.duration_minutes, 0);
    const weekLogs = weekFilteredLogs.length;

    const dateSet = new Set(logs.map((l) => l.log_date));
    let streakDays = 0;
    const cursor = new Date(nowDate);
    if (!dateSet.has(today)) cursor.setDate(cursor.getDate() - 1);
    while (dateSet.has(formatLocalYmd(cursor))) {
      streakDays++;
      cursor.setDate(cursor.getDate() - 1);
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
      const ds = formatLocalYmd(d);
      heatmap.push({ date: ds, ...(heatMapRec.get(ds) || { minutes: 0, count: 0 }) });
    }

    const activeIdeas = st.game_ideas.filter((i) => ['spark', 'developing', 'prototype'].includes(i.status)).length;
    const moduleBreakdown = st.modules
      .filter((m) => !m.archived)
      .map((m) => {
        const ml = logs.filter((l) => l.module_id === m.id && l.log_date >= weekStartStr);
        return {
          module_id: m.id,
          name: m.name,
          icon: m.icon,
          color: m.color,
          minutes: ml.reduce((s, l) => s + l.duration_minutes, 0),
          logs: ml.length,
        };
      });

    return {
      todayDate: today,
      todayMinutes,
      todayCompletedTasks,
      todayTotalTasks,
      weekMinutes,
      weekLogs,
      streakDays,
      totalLogs: logs.length,
      totalIdeas: st.game_ideas.length,
      activeIdeas,
      moduleBreakdown,
      heatmap,
    };
  },

  // Modules
  getModules: async (): Promise<StudyModule[]> => {
    const st = loadState();
    return st.modules
      .filter((m) => !m.archived)
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((m) => {
        const ml = st.study_logs.filter((l) => l.module_id === m.id);
        return {
          ...m,
          log_count: ml.length,
          total_minutes: ml.reduce((s, l) => s + l.duration_minutes, 0),
        };
      });
  },
  createModule: async (body: Partial<StudyModule>): Promise<StudyModule> => {
    const st = loadState();
    const created: StudyModule = {
      id: uid('mod'),
      name: String(body.name || '').trim(),
      icon: body.icon || '📘',
      color: body.color || '#6366f1',
      description: body.description || '',
      goal: body.goal || '',
      sort_order: st.modules.length,
      archived: 0,
      created_at: new Date().toISOString(),
      log_count: 0,
      total_minutes: 0,
    };
    st.modules.push(created);
    saveState(st);
    scheduleAutoSync();
    return created;
  },
  updateModule: async (id: string, body: Partial<StudyModule>): Promise<StudyModule> => {
    const st = loadState();
    const idx = st.modules.findIndex((m) => m.id === id);
    if (idx < 0) throw new Error('板块不存在');
    st.modules[idx] = { ...st.modules[idx], ...body };
    saveState(st);
    scheduleAutoSync();
    return st.modules[idx];
  },
  deleteModule: async (id: string) => {
    const st = loadState();
    st.modules = st.modules.filter((m) => m.id !== id);
    for (const l of st.study_logs.filter((x) => x.module_id === id)) recordDeletion(st, 'study_logs', l.id);
    st.study_logs = st.study_logs.filter((l) => l.module_id !== id);
    recordDeletion(st, 'modules', id);
    saveState(st);
    scheduleAutoSync();
    return { ok: true };
  },

  // Logs
  getLogs: async (): Promise<StudyLog[]> => {
    const st = loadState();
    return [...st.study_logs].sort((a, b) => (b.log_date + b.updated_at).localeCompare(a.log_date + a.updated_at));
  },
  createLog: async (body: Partial<StudyLog>): Promise<StudyLog> => {
    const st = loadState();
    const now = new Date().toISOString();
    let resolvedModuleId = String(body.module_id || '').trim();
    if (!resolvedModuleId || !st.modules.some((m) => m.id === resolvedModuleId)) {
      resolvedModuleId = ensureLocalUncategorized(st);
    }
    const rawContent = body.content || '';
    const firstLine = rawContent.trim().split(/\r?\n/)[0] || '';
    const fallbackTitle = firstLine.length > 22 ? `${firstLine.slice(0, 22)}...` : firstLine;
    const created: StudyLog = {
      id: uid('log'),
      module_id: resolvedModuleId,
      log_date: body.log_date || todayStr(),
      title: String(body.title || '').trim() || fallbackTitle || '未命名学习记录',
      content: rawContent,
      tasks: body.tasks || [],
      duration_minutes: Number(body.duration_minutes ?? 0),
      rating: Number(body.rating ?? 0),
      tags: body.tags || [],
      ai_feedback: '',
      created_at: now,
      updated_at: now,
    };
    st.study_logs.unshift(created);
    saveState(st);
    scheduleAutoSync();
    return created;
  },
  updateLog: async (id: string, body: Partial<StudyLog>): Promise<StudyLog> => {
    const st = loadState();
    const idx = st.study_logs.findIndex((l) => l.id === id);
    if (idx < 0) throw new Error('日志不存在');
    st.study_logs[idx] = { ...st.study_logs[idx], ...body, updated_at: new Date().toISOString() };
    saveState(st);
    scheduleAutoSync();
    return st.study_logs[idx];
  },
  deleteLog: async (id: string) => {
    const st = loadState();
    st.study_logs = st.study_logs.filter((l) => l.id !== id);
    recordDeletion(st, 'study_logs', id);
    saveState(st);
    scheduleAutoSync();
    return { ok: true };
  },

  // Ideas
  getIdeas: async (): Promise<GameIdea[]> => {
    const st = loadState();
    return [...st.game_ideas].sort((a, b) => b.priority - a.priority || b.updated_at.localeCompare(a.updated_at));
  },
  createIdea: async (body: Partial<GameIdea>): Promise<GameIdea> => {
    const st = loadState();
    const now = new Date().toISOString();
    const created: GameIdea = {
      id: uid('idea'),
      title: String(body.title || '').trim(),
      summary: body.summary || '',
      content: body.content || '',
      category: body.category || '玩法机制',
      status: body.status || 'spark',
      priority: Number(body.priority ?? 2),
      tags: body.tags || [],
      related_ids: body.related_ids || [],
      ai_notes: '',
      created_at: now,
      updated_at: now,
    };
    st.game_ideas.unshift(created);
    saveState(st);
    scheduleAutoSync();
    return created;
  },
  updateIdea: async (id: string, body: Partial<GameIdea>): Promise<GameIdea> => {
    const st = loadState();
    const idx = st.game_ideas.findIndex((i) => i.id === id);
    if (idx < 0) throw new Error('灵感不存在');
    st.game_ideas[idx] = { ...st.game_ideas[idx], ...body, updated_at: new Date().toISOString() };
    saveState(st);
    scheduleAutoSync();
    return st.game_ideas[idx];
  },
  deleteIdea: async (id: string) => {
    const st = loadState();
    st.game_ideas = st.game_ideas.filter((i) => i.id !== id);
    recordDeletion(st, 'game_ideas', id);
    saveState(st);
    scheduleAutoSync();
    return { ok: true };
  },

  // AI Providers & Prompts
  getProviders: async () => loadState().ai_providers,
  createProvider: async (body: Partial<AiProvider>): Promise<AiProvider> => {
    const st = loadState();
    if (body.is_active) st.ai_providers.forEach((p) => (p.is_active = 0));
    const created: AiProvider = {
      id: uid('prov'),
      name: String(body.name || 'Custom'),
      protocol: body.protocol || 'openai',
      base_url: String(body.base_url || ''),
      api_key: String(body.api_key || ''),
      model: String(body.model || ''),
      is_active: body.is_active ? 1 : 0,
      temperature: Number(body.temperature ?? 0.7),
      max_tokens: Number(body.max_tokens ?? 2048),
      created_at: new Date().toISOString(),
    };
    st.ai_providers.push(created);
    saveState(st);
    scheduleAutoSync();
    return created;
  },
  updateProvider: async (id: string, body: Partial<AiProvider>): Promise<AiProvider> => {
    const st = loadState();
    if (body.is_active) st.ai_providers.forEach((p) => (p.is_active = 0));
    const idx = st.ai_providers.findIndex((p) => p.id === id);
    if (idx < 0) throw new Error('模型不存在');
    st.ai_providers[idx] = { ...st.ai_providers[idx], ...body };
    saveState(st);
    scheduleAutoSync();
    return st.ai_providers[idx];
  },
  deleteProvider: async (id: string) => {
    const st = loadState();
    st.ai_providers = st.ai_providers.filter((p) => p.id !== id);
    recordDeletion(st, 'ai_providers', id);
    if (!st.ai_providers.some((p) => p.is_active === 1) && st.ai_providers[0]) {
      st.ai_providers[0].is_active = 1;
    }
    saveState(st);
    scheduleAutoSync();
    return { ok: true };
  },
  testProvider: async (id: string) => {
    const st = loadState();
    const p = getProvider(st, id);
    const started = Date.now();
    const reply = await callBrowserLlm(p, [{ role: 'user', content: '请仅回复 OK 两个字母。' }], {
      maxTokens: 32,
      temperature: 0,
    });
    return { ok: true, latencyMs: Date.now() - started, reply: reply.trim().slice(0, 80) };
  },

  getPrompts: async () => loadState().prompt_templates,
  updatePrompt: async (id: string, body: Partial<PromptTemplate>): Promise<PromptTemplate> => {
    const st = loadState();
    const idx = st.prompt_templates.findIndex((t) => t.id === id);
    if (idx < 0) throw new Error('模板不存在');
    st.prompt_templates[idx] = { ...st.prompt_templates[idx], ...body, updated_at: new Date().toISOString() };
    saveState(st);
    scheduleAutoSync();
    return st.prompt_templates[idx];
  },

  // Reviews & AI Assists
  getReviews: async () => [...loadState().ai_reviews].sort((a, b) => b.created_at.localeCompare(a.created_at)),
  deleteReview: async (id: string) => {
    const st = loadState();
    st.ai_reviews = st.ai_reviews.filter((r) => r.id !== id);
    recordDeletion(st, 'ai_reviews', id);
    saveState(st);
    scheduleAutoSync();
    return { ok: true };
  },
  generateReview: async (body: {
    scope: 'daily' | 'weekly' | 'module' | 'custom';
    date_from: string;
    date_to: string;
    module_id?: string;
    custom_instruction?: string;
    provider_id?: string;
  }): Promise<AiReview> => {
    const st = loadState();
    const provider = getProvider(st, body.provider_id);
    const logs = st.study_logs.filter(
      (l) =>
        (!body.date_from || l.log_date >= body.date_from) &&
        (!body.date_to || l.log_date <= body.date_to) &&
        (!body.module_id || l.module_id === body.module_id)
    );
    if (logs.length === 0) throw new Error('选定范围内暂无学习日志可供复盘');
    const modMap = new Map(st.modules.map((m) => [m.id, m]));
    const tpl = st.prompt_templates.find((t) => t.key === 'daily_review');
    const totalMinutes = logs.reduce((s, l) => s + l.duration_minutes, 0);
    const modName = body.module_id ? modMap.get(body.module_id)?.name || '' : '全部板块';
    const content = await callBrowserLlm(provider, [
      { role: 'system', content: tpl?.system_prompt || '请对学习日志进行结构化复盘并打分。' },
      {
        role: 'user',
        content: [
          `复盘范围：${body.date_from} 至 ${body.date_to} | 板块：${modName} | 日志数：${logs.length} | 累计时长：${totalMinutes} 分钟`,
          body.custom_instruction ? `用户补充要求：${body.custom_instruction}` : '',
          `\n以下为原始学习日志：\n\n${formatLogsForAi(logs, modMap)}`,
        ]
          .filter(Boolean)
          .join('\n'),
      },
    ]);
    const rev: AiReview = {
      id: uid('rev'),
      scope: body.scope,
      title:
        body.scope === 'daily'
          ? `每日复盘 · ${body.date_from}`
          : body.scope === 'weekly'
            ? `周度复盘 · ${body.date_from} ~ ${body.date_to}`
            : `${modName} 专项复盘 · ${body.date_from} ~ ${body.date_to}`,
      date_from: body.date_from,
      date_to: body.date_to,
      module_id: body.module_id || '',
      score: extractScore(content),
      content,
      model_used: `${provider.name} (${provider.model})`,
      created_at: new Date().toISOString(),
    };
    st.ai_reviews.unshift(rev);
    saveState(st);
    scheduleAutoSync();
    return rev;
  },

  evaluateLog: async (id: string, provider_id?: string): Promise<StudyLog> => {
    const st = loadState();
    const idx = st.study_logs.findIndex((l) => l.id === id);
    if (idx < 0) throw new Error('日志不存在');
    const provider = getProvider(st, provider_id);
    const tpl = st.prompt_templates.find((t) => t.key === 'single_log_eval');
    const modMap = new Map(st.modules.map((m) => [m.id, m]));
    const feedback = await callBrowserLlm(provider, [
      { role: 'system', content: tpl?.system_prompt || '请点评这篇学习日志。' },
      { role: 'user', content: formatLogsForAi([st.study_logs[idx]], modMap) },
    ]);
    st.study_logs[idx].ai_feedback = feedback;
    st.study_logs[idx].updated_at = new Date().toISOString();
    saveState(st);
    scheduleAutoSync();
    return st.study_logs[idx];
  },

  organizeLog: async (id: string, provider_id?: string): Promise<StudyLog> => {
    const st = loadState();
    const idx = st.study_logs.findIndex((l) => l.id === id);
    if (idx < 0) throw new Error('学习日志不存在');
    const log = st.study_logs[idx];
    const rawText = (log.content || log.title || '').trim();
    if (!rawText) throw new Error('请先写下今天学了什么');

    const provider = getProvider(st, provider_id);
    const existingCats = st.modules
      .filter((m) => !m.archived && m.id !== 'mod_uncategorized' && st.study_logs.some((l) => l.module_id === m.id))
      .map((m) => m.name);

    const tpl = st.prompt_templates.find((t) => t.key === 'study_organize');
    const categoryHint = existingCats.length
      ? `已有自动分类（如属于同类请优先复用完全一致的名称）：${existingCats.join('、')}`
      : '当前暂无已有分类，请根据内容提炼一个简洁准确的分类名称（如：虚幻引擎 UE5、数学分析、C++ 等）';

    const raw = await callBrowserLlm(
      provider,
      [
        {
          role: 'system',
          content:
            tpl?.system_prompt ||
            '请根据内容自动分类，并将用户的每日学习记录整理归纳为清晰的 Markdown 笔记，仅返回 JSON: {"category":"","icon":"📘","title":"","tags":[],"organized":""}',
        },
        {
          role: 'user',
          content: `学习日期：${log.log_date}\n${categoryHint}\n\n以下是我今天写下的原始学习记录，请自动分类并整理归纳：\n\n${rawText}`,
        },
      ],
      { temperature: 0.25 }
    );

    let nextModuleId = log.module_id;
    let nextTitle = log.title;
    let nextTags = log.tags;
    let organized = raw.trim();

    try {
      const cleaned = raw.replace(/^```json\s*/i, '').replace(/```$/i, '').trim();
      const match = cleaned.match(/\{[\s\S]*\}/);
      const parsed = JSON.parse(match ? match[0] : cleaned) as {
        category?: string;
        icon?: string;
        title?: string;
        tags?: string[];
        organized?: string;
      };
      if (parsed.category?.trim()) {
        const autoMod = findOrCreateLocalAutoCategory(st, parsed.category, parsed.icon);
        nextModuleId = autoMod.id;
      }
      if (parsed.title?.trim()) nextTitle = parsed.title.trim().slice(0, 40);
      if (Array.isArray(parsed.tags) && parsed.tags.length > 0) {
        nextTags = Array.from(new Set(parsed.tags.slice(0, 5).map((t) => String(t).trim()).filter(Boolean)));
      }
      if (parsed.organized?.trim()) organized = parsed.organized.trim();
    } catch {
      // keep raw markdown fallback
    }

    // Preserve log.content untouched! Update auto-category, title, tags, and organized summary
    log.module_id = nextModuleId;
    log.title = nextTitle;
    log.tags = nextTags;
    log.ai_feedback = organized;
    log.updated_at = new Date().toISOString();
    saveState(st);
    scheduleAutoSync();
    return log;
  },

  organizeIdea: async (id: string, provider_id?: string): Promise<GameIdea> => {
    const st = loadState();
    const idx = st.game_ideas.findIndex((i) => i.id === id);
    if (idx < 0) throw new Error('灵感不存在');
    const idea = st.game_ideas[idx];
    const rawText = (idea.content || idea.title || '').trim();
    if (!rawText) throw new Error('请先写下你的原始灵感内容');

    const provider = getProvider(st, provider_id);
    const tpl = st.prompt_templates.find((t) => t.key === 'idea_organize');
    const raw = await callBrowserLlm(
      provider,
      [
        {
          role: 'system',
          content:
            tpl?.system_prompt ||
            '请忠实整理用户的原始灵感，严禁添油加醋，仅返回 JSON: {"title":"","tags":[],"organized":""}',
        },
        { role: 'user', content: `请忠实整理以下原始灵感（严禁脑补未提及的设定）：\n\n${rawText}` },
      ],
      { temperature: 0.25 }
    );

    let nextTitle = idea.title;
    let nextTags = idea.tags;
    let organized = raw.trim();

    try {
      const cleaned = raw.replace(/^```json\s*/i, '').replace(/```$/i, '').trim();
      const match = cleaned.match(/\{[\s\S]*\}/);
      const parsed = JSON.parse(match ? match[0] : cleaned) as {
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
      // keep raw markdown fallback
    }

    // Preserve idea.content (original text) untouched!
    idea.title = nextTitle;
    idea.tags = nextTags;
    idea.ai_notes = organized;
    idea.updated_at = new Date().toISOString();
    saveState(st);
    scheduleAutoSync();
    return idea;
  },

  assistIdea: async (
    id: string,
    body: { action: 'expand' | 'critique' | 'crosslink'; custom_instruction?: string; provider_id?: string }
  ): Promise<{ idea: GameIdea; latest: string }> => {
    const st = loadState();
    const idx = st.game_ideas.findIndex((i) => i.id === id);
    if (idx < 0) throw new Error('灵感不存在');
    const idea = st.game_ideas[idx];
    const provider = getProvider(st, body.provider_id);
    const keyMap = { expand: 'idea_expand', critique: 'idea_critique', crosslink: 'idea_crosslink' };
    const labelMap = { expand: '机制扩写与 MVP 草案', critique: '犀利挑刺与风险评审', crosslink: '历史灵感跨界碰撞' };
    const tpl = st.prompt_templates.find((t) => t.key === keyMap[body.action]);
    let userPrompt = formatIdeaForAi(idea);
    if (body.action === 'crosslink') {
      const others = st.game_ideas.filter((o) => o.id !== idea.id).slice(0, 15);
      userPrompt += `\n\n## 我的历史灵感库\n${
        others.length
          ? others.map((o) => `- **${o.title}**（${o.category}）：${o.summary || o.content.slice(0, 120)}`).join('\n')
          : '（暂无其他历史灵感）'
      }`;
    }
    if (body.custom_instruction) userPrompt += `\n\n## 补充需求\n${body.custom_instruction}`;
    const latest = await callBrowserLlm(provider, [
      { role: 'system', content: tpl?.system_prompt || '你是资深游戏策划。' },
      { role: 'user', content: userPrompt },
    ]);
    const stamp = new Date().toLocaleString('zh-CN', { hour12: false });
    const section = `> **AI ${labelMap[body.action]}** · ${provider.model} · ${stamp}\n\n${latest}`;
    idea.ai_notes = idea.ai_notes ? `${section}\n\n---\n\n${idea.ai_notes}` : section;
    idea.updated_at = new Date().toISOString();
    saveState(st);
    scheduleAutoSync();
    return { idea, latest };
  },

  autoTag: async (body: { title: string; content: string; kind: 'study' | 'idea'; provider_id?: string }) => {
    const st = loadState();
    const provider = getProvider(st, body.provider_id);
    const tpl = st.prompt_templates.find((t) => t.key === 'auto_tag');
    const raw = await callBrowserLlm(
      provider,
      [
        { role: 'system', content: tpl?.system_prompt || '输出 JSON: {"tags":[], "summary":""}' },
        { role: 'user', content: `类型：${body.kind === 'idea' ? '游戏灵感' : '学习日志'}\n标题：${body.title}\n内容：${body.content}` },
      ],
      { temperature: 0.3, maxTokens: 300 }
    );
    const cleaned = raw.replace(/^```json\s*/i, '').replace(/```$/i, '').trim();
    const match = cleaned.match(/\{[\s\S]*\}/);
    const parsed = JSON.parse(match ? match[0] : cleaned) as { tags?: string[]; summary?: string; category?: string };
    return {
      tags: Array.isArray(parsed.tags) ? parsed.tags.slice(0, 6).map(String) : [],
      summary: typeof parsed.summary === 'string' ? parsed.summary : '',
      category: typeof parsed.category === 'string' ? parsed.category : '',
    };
  },

  // Conversations & Streaming Chat
  getConversations: async () => [...loadState().ai_conversations].sort((a, b) => b.updated_at.localeCompare(a.updated_at)),
  createConversation: async (body: { title?: string; context_mode?: string; module_id?: string }): Promise<AiConversation> => {
    const st = loadState();
    const now = new Date().toISOString();
    const conv: AiConversation = {
      id: uid('conv'),
      title: body.title || '新知识库对话',
      context_mode: (body.context_mode as AiConversation['context_mode']) || 'all',
      module_id: body.module_id || '',
      created_at: now,
      updated_at: now,
    };
    st.ai_conversations.unshift(conv);
    saveState(st);
    scheduleAutoSync();
    return conv;
  },
  deleteConversation: async (id: string) => {
    const st = loadState();
    st.ai_conversations = st.ai_conversations.filter((c) => c.id !== id);
    st.ai_messages = st.ai_messages.filter((m) => m.conversation_id !== id);
    recordDeletion(st, 'ai_conversations', id);
    saveState(st);
    scheduleAutoSync();
    return { ok: true };
  },
  getMessages: async (convId: string) =>
    loadState()
      .ai_messages.filter((m) => m.conversation_id === convId)
      .sort((a, b) => a.created_at.localeCompare(b.created_at)),

  streamChat: async (
    convId: string,
    body: { message: string; provider_id?: string; context_mode?: string; module_id?: string },
    handlers: {
      onMeta?: (refs: AiReference[]) => void;
      onDelta: (text: string) => void;
      onDone?: (refs: AiReference[]) => void;
      onError?: (err: string) => void;
    }
  ) => {
    const st = loadState();
    const conv = st.ai_conversations.find((c) => c.id === convId);
    if (!conv) throw new Error('对话不存在');
    const provider = getProvider(st, body.provider_id);

    const now = new Date().toISOString();
    st.ai_messages.push({
      id: uid('msg'),
      conversation_id: convId,
      role: 'user',
      content: body.message.trim(),
      references: [],
      created_at: now,
    });
    if (conv.title === '新知识库对话') conv.title = body.message.trim().slice(0, 22);
    conv.updated_at = now;
    saveState(st);

    // Retrieve context
    const tokens = body.message.toLowerCase().split(/[\s,，。！？、;；:：]+/).filter((t) => t.length >= 2);
    const mode = (body.context_mode || conv.context_mode || 'all') as 'all' | 'study' | 'ideas' | 'module';
    const modMap = new Map(st.modules.map((m) => [m.id, m]));
    const refs: AiReference[] = [];
    const blocks: string[] = [];

    if (mode === 'all' || mode === 'study' || mode === 'module') {
      const candidateLogs =
        mode === 'module' && body.module_id
          ? st.study_logs.filter((l) => l.module_id === body.module_id)
          : st.study_logs;
      const top = candidateLogs
        .map((log, idx) => {
          const hay = `${log.title} ${log.content} ${log.tags.join(' ')} ${modMap.get(log.module_id)?.name || ''}`.toLowerCase();
          let score = Math.max(0, 12 - idx * 0.4);
          for (const t of tokens) if (hay.includes(t)) score += 15;
          return { log, score };
        })
        .sort((a, b) => b.score - a.score)
        .slice(0, 8);
      if (top.length > 0) {
        blocks.push('## 相关学习日志');
        for (const { log } of top) {
          const mod = modMap.get(log.module_id);
          const body = log.ai_feedback
            ? `【AI整理归纳】\n${log.ai_feedback.slice(0, 500)}\n【原始记录】\n${log.content.slice(0, 300)}`
            : log.content.slice(0, 600);
          blocks.push(`### [${log.log_date}] ${mod?.name || '学习'} — ${log.title}\n${body}`);
          refs.push({ type: 'study_log', id: log.id, title: log.title, meta: `${log.log_date} · ${mod?.name || '学习'}` });
        }
      }
    }

    if (mode === 'all' || mode === 'ideas') {
      const top = st.game_ideas
        .map((idea, idx) => {
          const hay = `${idea.title} ${idea.summary} ${idea.content} ${idea.tags.join(' ')}`.toLowerCase();
          let score = Math.max(0, 10 - idx * 0.4);
          for (const t of tokens) if (hay.includes(t)) score += 15;
          return { idea, score };
        })
        .sort((a, b) => b.score - a.score)
        .slice(0, 6);
      if (top.length > 0) {
        blocks.push('## 相关游戏灵感');
        for (const { idea } of top) {
          blocks.push(`### [${idea.category}] ${idea.title}\n- 概括：${idea.summary}\n${idea.content.slice(0, 600)}`);
          refs.push({ type: 'game_idea', id: idea.id, title: idea.title, meta: `${idea.category} · ${idea.status}` });
        }
      }
    }

    handlers.onMeta?.(refs);
    const tpl = st.prompt_templates.find((t) => t.key === 'knowledge_chat');
    const history = st.ai_messages.filter((m) => m.conversation_id === convId).slice(-12);
    const turns: ChatTurn[] = [
      {
        role: 'system',
        content: `${tpl?.system_prompt || '你是个人知识库助手。'}\n\n当前日期：${todayStr()}\n以下是检索到的历史记录：\n\n${blocks.join('\n\n') || '（暂无记录）'}`,
      },
      ...history.map((m) => ({ role: m.role, content: m.content })),
    ];

    try {
      const fullText = await streamBrowserLlm(provider, turns, handlers.onDelta);
      const st2 = loadState();
      st2.ai_messages.push({
        id: uid('msg'),
        conversation_id: convId,
        role: 'assistant',
        content: fullText,
        references: refs,
        created_at: new Date().toISOString(),
      });
      const c2 = st2.ai_conversations.find((c) => c.id === convId);
      if (c2) c2.updated_at = new Date().toISOString();
      saveState(st2);
      scheduleAutoSync();
      handlers.onDone?.(refs);
    } catch (e) {
      handlers.onError?.(e instanceof Error ? e.message : String(e));
    }
  },

  importJson: async (payload: unknown) => {
    const data = (payload || {}) as { modules?: StudyModule[]; study_logs?: StudyLog[]; game_ideas?: GameIdea[] };
    const st = loadState();
    let importedModules = 0;
    let importedLogs = 0;
    let importedIdeas = 0;
    for (const m of data.modules || []) {
      if (!st.modules.some((x) => x.id === m.id)) {
        st.modules.push(m);
        importedModules++;
      }
    }
    for (const l of data.study_logs || []) {
      if (!st.study_logs.some((x) => x.id === l.id)) {
        st.study_logs.push(l);
        importedLogs++;
      }
    }
    for (const i of data.game_ideas || []) {
      if (!st.game_ideas.some((x) => x.id === i.id)) {
        st.game_ideas.push(i);
        importedIdeas++;
      }
    }
    saveState(st);
    scheduleAutoSync();
    return { ok: true, importedModules, importedLogs, importedIdeas };
  },

  exportPayload: (format: 'json' | 'markdown'): { filename: string; content: string; mime: string } => {
    const st = loadState();
    if (format === 'json') {
      return {
        filename: `perlica-backup-${todayStr()}.json`,
        mime: 'application/json',
        content: JSON.stringify(
          {
            version: 1,
            exportedAt: new Date().toISOString(),
            modules: st.modules,
            study_logs: st.study_logs,
            game_ideas: st.game_ideas,
            ai_reviews: st.ai_reviews,
            prompt_templates: st.prompt_templates,
          },
          null,
          2
        ),
      };
    }
    const modMap = new Map(st.modules.map((m) => [m.id, m]));
    const lines = [
      `# Perlica 个人知识归档 (${todayStr()})`,
      '',
      '## 一、学习板块与日志',
      '',
      formatLogsForAi(st.study_logs, modMap),
      '',
      '## 二、游戏灵感库',
      '',
      ...st.game_ideas.map((i) => `${formatIdeaForAi(i)}\n\n${i.ai_notes ? `### AI 陪跑记录\n${i.ai_notes}` : ''}\n\n---`),
    ];
    return {
      filename: `perlica-archive-${todayStr()}.md`,
      mime: 'text/markdown;charset=utf-8',
      content: lines.join('\n'),
    };
  },
};
