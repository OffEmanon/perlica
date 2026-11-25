import type { AiProvider, AiReference, GameIdea, StudyLog, StudyModule } from '../src/types.ts';
import { db, mapGameIdea, mapStudyLog } from './db.ts';

export interface ChatTurn {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

function normalizeBaseUrl(url: string): string {
  return url.trim().replace(/\/+$/, '');
}

export async function callLlm(
  provider: AiProvider,
  messages: ChatTurn[],
  options?: { temperature?: number; maxTokens?: number }
): Promise<string> {
  if (!provider.api_key && !provider.base_url.includes('127.0.0.1') && !provider.base_url.includes('localhost')) {
    throw new Error(`请先在「设置 -> AI 模型配置」中为 ${provider.name} 填写 API Key`);
  }

  const temperature = options?.temperature ?? provider.temperature ?? 0.7;
  const maxTokens = options?.maxTokens ?? provider.max_tokens ?? 2048;
  const baseUrl = normalizeBaseUrl(provider.base_url);

  if (provider.protocol === 'anthropic') {
    const systemText = messages.filter((m) => m.role === 'system').map((m) => m.content).join('\n\n');
    const chatMessages = messages
      .filter((m) => m.role !== 'system')
      .map((m) => ({ role: m.role, content: m.content }));

    const endpoint = baseUrl.endsWith('/v1') ? `${baseUrl}/messages` : `${baseUrl}/v1/messages`;
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': provider.api_key,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: provider.model,
        max_tokens: maxTokens,
        temperature,
        system: systemText || undefined,
        messages: chatMessages,
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Anthropic API 错误 (${res.status}): ${errText.slice(0, 300)}`);
    }
    const data = (await res.json()) as { content?: Array<{ type: string; text?: string }> };
    return (data.content || [])
      .filter((c) => c.type === 'text')
      .map((c) => c.text || '')
      .join('');
  }

  if (provider.protocol === 'gemini') {
    const systemText = messages.filter((m) => m.role === 'system').map((m) => m.content).join('\n\n');
    const contents = messages
      .filter((m) => m.role !== 'system')
      .map((m) => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: m.content }],
      }));

    const endpoint = `${baseUrl}/models/${encodeURIComponent(provider.model)}:generateContent`;
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': provider.api_key,
      },
      body: JSON.stringify({
        system_instruction: systemText ? { parts: [{ text: systemText }] } : undefined,
        contents,
        generationConfig: {
          temperature,
          maxOutputTokens: maxTokens,
        },
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Gemini API 错误 (${res.status}): ${errText.slice(0, 300)}`);
    }
    const data = (await res.json()) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    };
    return (data.candidates?.[0]?.content?.parts || []).map((p) => p.text || '').join('');
  }

  // Default: OpenAI-compatible protocol (OpenAI, DeepSeek, Ollama, OpenRouter, Moonshot, etc.)
  const endpoint = baseUrl.endsWith('/chat/completions')
    ? baseUrl
    : `${baseUrl}/chat/completions`;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (provider.api_key) {
    headers.Authorization = `Bearer ${provider.api_key}`;
  }

  const res = await fetch(endpoint, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model: provider.model,
      messages,
      temperature,
      max_tokens: maxTokens,
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`AI API 错误 (${res.status}): ${errText.slice(0, 300)}`);
  }

  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: string; reasoning_content?: string } }>;
  };
  const msg = data.choices?.[0]?.message;
  return msg?.content || msg?.reasoning_content || '';
}

export async function streamLlm(
  provider: AiProvider,
  messages: ChatTurn[],
  onDelta: (chunk: string) => void
): Promise<string> {
  if (!provider.api_key && !provider.base_url.includes('127.0.0.1') && !provider.base_url.includes('localhost')) {
    throw new Error(`请先在「设置 -> AI 模型配置」中为 ${provider.name} 填写 API Key`);
  }

  const temperature = provider.temperature ?? 0.7;
  const maxTokens = provider.max_tokens ?? 2048;
  const baseUrl = normalizeBaseUrl(provider.base_url);

  if (provider.protocol === 'openai') {
    const endpoint = baseUrl.endsWith('/chat/completions')
      ? baseUrl
      : `${baseUrl}/chat/completions`;
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (provider.api_key) headers.Authorization = `Bearer ${provider.api_key}`;

    const res = await fetch(endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model: provider.model,
        messages,
        temperature,
        max_tokens: maxTokens,
        stream: true,
      }),
    });

    if (!res.ok || !res.body) {
      const errText = await res.text();
      throw new Error(`AI API 错误 (${res.status}): ${errText.slice(0, 300)}`);
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let fullText = '';

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';
      for (const rawLine of lines) {
        const line = rawLine.trim();
        if (!line.startsWith('data:')) continue;
        const payload = line.slice(5).trim();
        if (!payload || payload === '[DONE]') continue;
        try {
          const parsed = JSON.parse(payload) as {
            choices?: Array<{ delta?: { content?: string } }>;
          };
          const delta = parsed.choices?.[0]?.delta?.content;
          if (delta) {
            fullText += delta;
            onDelta(delta);
          }
        } catch {
          // ignore partial SSE JSON
        }
      }
    }
    return fullText;
  }

  // Fallback for Anthropic / Gemini: single request then emit smoothly
  const text = await callLlm(provider, messages);
  onDelta(text);
  return text;
}

export function extractScore(markdown: string): number {
  const m = markdown.match(/综合评分[：:]\s*(\d{1,3})\s*\/\s*100/) || markdown.match(/(\d{1,3})\s*\/\s*100/);
  if (!m) return 0;
  const val = Number(m[1]);
  return Number.isFinite(val) ? Math.max(0, Math.min(100, val)) : 0;
}

export function buildKnowledgeContext(
  query: string,
  mode: 'all' | 'study' | 'ideas' | 'module',
  moduleId?: string
): { contextText: string; references: AiReference[] } {
  const tokens = query
    .toLowerCase()
    .split(/[\s,，。！？、;；:：()（）\[\]]+/)
    .filter((t) => t.length >= 2);

  const modules = db.prepare('SELECT * FROM modules').all() as unknown as StudyModule[];
  const moduleMap = new Map(modules.map((m) => [m.id, m]));

  const references: AiReference[] = [];
  const blocks: string[] = [];

  if (mode === 'all' || mode === 'study' || mode === 'module') {
    const rawLogs = (
      mode === 'module' && moduleId
        ? db.prepare('SELECT * FROM study_logs WHERE module_id = ? ORDER BY log_date DESC, updated_at DESC LIMIT 80').all(moduleId)
        : db.prepare('SELECT * FROM study_logs ORDER BY log_date DESC, updated_at DESC LIMIT 80').all()
    ) as Record<string, unknown>[];

    const logs = rawLogs.map(mapStudyLog);
    const scoredLogs = logs
      .map((log, idx) => {
        const mod = moduleMap.get(log.module_id);
        const hay = `${log.title} ${log.content} ${log.tags.join(' ')} ${mod?.name ?? ''}`.toLowerCase();
        let score = Math.max(0, 12 - idx * 0.4); // recency boost
        for (const t of tokens) {
          if (hay.includes(t)) score += 15;
        }
        return { log, mod, score };
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, mode === 'all' ? 8 : 12);

    if (scoredLogs.length > 0) {
      blocks.push('## 相关学习日志');
      for (const { log, mod } of scoredLogs) {
        const doneCount = log.tasks.filter((t) => t.done).length;
        const modName = mod ? `${mod.icon} ${mod.name}` : '未分类板块';
        blocks.push(
          `### [${log.log_date}] ${modName} — ${log.title}\n- 耗时：${log.duration_minutes}分钟 | 自评：${log.rating}/5 | 任务：${doneCount}/${log.tasks.length} | 标签：${log.tags.join(', ') || '无'}\n${log.content.slice(0, 650)}`
        );
        references.push({
          type: 'study_log',
          id: log.id,
          title: log.title,
          meta: `${log.log_date} · ${mod?.name ?? '学习'}`,
        });
      }
    }
  }

  if (mode === 'all' || mode === 'ideas') {
    const rawIdeas = db
      .prepare('SELECT * FROM game_ideas ORDER BY updated_at DESC LIMIT 60')
      .all() as Record<string, unknown>[];
    const ideas = rawIdeas.map(mapGameIdea);

    const scoredIdeas = ideas
      .map((idea, idx) => {
        const hay = `${idea.title} ${idea.summary} ${idea.content} ${idea.category} ${idea.tags.join(' ')}`.toLowerCase();
        let score = Math.max(0, 10 - idx * 0.4);
        for (const t of tokens) {
          if (hay.includes(t)) score += 15;
        }
        return { idea, score };
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, mode === 'all' ? 6 : 12);

    if (scoredIdeas.length > 0) {
      blocks.push('## 相关游戏灵感');
      for (const { idea } of scoredIdeas) {
        blocks.push(
          `### [灵感:${idea.category}|状态:${idea.status}] ${idea.title}\n- 一句话：${idea.summary}\n- 标签：${idea.tags.join(', ') || '无'}\n${idea.content.slice(0, 650)}`
        );
        references.push({
          type: 'game_idea',
          id: idea.id,
          title: idea.title,
          meta: `${idea.category} · ${idea.status}`,
        });
      }
    }
  }

  return {
    contextText: blocks.join('\n\n') || '（当前数据库暂无匹配记录）',
    references: references.slice(0, 10),
  };
}

export function formatStudyLogsForReview(logs: StudyLog[], moduleMap: Map<string, StudyModule>): string {
  if (logs.length === 0) return '（该范围内暂无学习记录）';
  return logs
    .map((log) => {
      const mod = moduleMap.get(log.module_id);
      const taskSummary = log.tasks.length
        ? log.tasks.map((t) => `  - [${t.done ? 'x' : ' '}] ${t.text}`).join('\n')
        : '  - （无任务清单）';
      return [
        `### ${log.log_date} | 板块：${mod ? `${mod.icon} ${mod.name}` : '未知'} | 标题：${log.title}`,
        `- 时长：${log.duration_minutes} 分钟 | 自评：${log.rating}/5 | 标签：${log.tags.join(', ') || '无'}`,
        mod?.goal ? `- 板块长期目标：${mod.goal}` : '',
        `- 任务清单：\n${taskSummary}`,
        `- 笔记内容：\n${log.content.slice(0, 1200)}`,
      ]
        .filter(Boolean)
        .join('\n');
    })
    .join('\n\n---\n\n');
}

export function formatIdeaForAi(idea: GameIdea): string {
  return [
    `# 游戏灵感：${idea.title}`,
    `- 分类：${idea.category} | 状态：${idea.status} | 优先级：P${idea.priority}`,
    `- 一句话概括：${idea.summary || '暂无'}`,
    `- 标签：${idea.tags.join(', ') || '无'}`,
    `## 详细描述\n${idea.content || '（暂无详细正文）'}`,
  ].join('\n');
}
