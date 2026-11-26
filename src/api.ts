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
  TunnelStatus,
} from './types.ts';
import { localEngine } from './localEngine.ts';

export const IS_STATIC_MODE: boolean =
  import.meta.env.VITE_STATIC_MODE === 'true' ||
  (typeof window !== 'undefined' &&
    (window.location.hostname.endsWith('.github.io') || window.location.protocol === 'file:'));

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json', ...(init?.headers || {}) },
    ...init,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error((data as { error?: string }).error || `请求失败 (${res.status})`);
  }
  return data as T;
}

const serverApi = {
  getAuthStatus: () => request<AuthStatus>('/api/auth/status'),
  login: (password: string) =>
    request<{ ok: boolean }>('/api/auth/login', { method: 'POST', body: JSON.stringify({ password }) }),
  logout: () => request<{ ok: boolean }>('/api/auth/logout', { method: 'POST' }),
  updatePassword: (body: { newPassword?: string; disable?: boolean }) =>
    request<{ ok: boolean; enabled: boolean }>('/api/auth/password', {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  getStats: () => request<DashboardStats>('/api/dashboard/stats'),
  getNetwork: () => request<NetworkInfo>('/api/system/network'),
  getTunnelStatus: () => request<TunnelStatus>('/api/system/tunnel'),
  startTunnel: (body?: { token?: string; customUrl?: string }) =>
    request<TunnelStatus>('/api/system/tunnel/start', { method: 'POST', body: JSON.stringify(body || {}) }),
  stopTunnel: () => request<TunnelStatus>('/api/system/tunnel/stop', { method: 'POST' }),
  resetData: (keepAiConfig = true) =>
    request<{ ok: boolean }>('/api/system/reset', {
      method: 'POST',
      body: JSON.stringify({ keepAiConfig }),
    }),
  getGithubSyncStatus: () => request<GithubSyncStatus>('/api/sync/github/status'),
  configureGithubSync: (body: { token?: string; gistId?: string; autoSync?: boolean }) =>
    request<GithubSyncStatus>('/api/sync/github/config', { method: 'POST', body: JSON.stringify(body) }),
  syncGithubNow: () => request<GithubSyncStatus>('/api/sync/github/now', { method: 'POST' }),
  disconnectGithub: () => request<GithubSyncStatus>('/api/sync/github/disconnect', { method: 'POST' }),

  getModules: () => request<StudyModule[]>('/api/modules'),
  createModule: (body: Partial<StudyModule>) =>
    request<StudyModule>('/api/modules', { method: 'POST', body: JSON.stringify(body) }),
  updateModule: (id: string, body: Partial<StudyModule>) =>
    request<StudyModule>(`/api/modules/${id}`, { method: 'PUT', body: JSON.stringify(body) }),
  deleteModule: (id: string) =>
    request<{ ok: boolean }>(`/api/modules/${id}`, { method: 'DELETE' }),

  getLogs: (params?: { module_id?: string; date?: string; date_from?: string; date_to?: string; q?: string }) => {
    const sp = new URLSearchParams();
    if (params?.module_id) sp.set('module_id', params.module_id);
    if (params?.date) sp.set('date', params.date);
    if (params?.date_from) sp.set('date_from', params.date_from);
    if (params?.date_to) sp.set('date_to', params.date_to);
    if (params?.q) sp.set('q', params.q);
    const qs = sp.toString();
    return request<StudyLog[]>(`/api/logs${qs ? `?${qs}` : ''}`);
  },
  createLog: (body: Partial<StudyLog>) =>
    request<StudyLog>('/api/logs', { method: 'POST', body: JSON.stringify(body) }),
  updateLog: (id: string, body: Partial<StudyLog>) =>
    request<StudyLog>(`/api/logs/${id}`, { method: 'PUT', body: JSON.stringify(body) }),
  deleteLog: (id: string) =>
    request<{ ok: boolean }>(`/api/logs/${id}`, { method: 'DELETE' }),

  getIdeas: (params?: { status?: string; category?: string; q?: string }) => {
    const sp = new URLSearchParams();
    if (params?.status) sp.set('status', params.status);
    if (params?.category) sp.set('category', params.category);
    if (params?.q) sp.set('q', params.q);
    const qs = sp.toString();
    return request<GameIdea[]>(`/api/ideas${qs ? `?${qs}` : ''}`);
  },
  createIdea: (body: Partial<GameIdea>) =>
    request<GameIdea>('/api/ideas', { method: 'POST', body: JSON.stringify(body) }),
  updateIdea: (id: string, body: Partial<GameIdea>) =>
    request<GameIdea>(`/api/ideas/${id}`, { method: 'PUT', body: JSON.stringify(body) }),
  deleteIdea: (id: string) =>
    request<{ ok: boolean }>(`/api/ideas/${id}`, { method: 'DELETE' }),

  getProviders: () => request<AiProvider[]>('/api/ai/providers'),
  createProvider: (body: Partial<AiProvider>) =>
    request<AiProvider>('/api/ai/providers', { method: 'POST', body: JSON.stringify(body) }),
  updateProvider: (id: string, body: Partial<AiProvider>) =>
    request<AiProvider>(`/api/ai/providers/${id}`, { method: 'PUT', body: JSON.stringify(body) }),
  deleteProvider: (id: string) =>
    request<{ ok: boolean }>(`/api/ai/providers/${id}`, { method: 'DELETE' }),
  testProvider: (id: string) =>
    request<{ ok: boolean; latencyMs: number; reply: string }>(`/api/ai/providers/${id}/test`, { method: 'POST' }),

  getPrompts: () => request<PromptTemplate[]>('/api/ai/prompts'),
  updatePrompt: (id: string, body: Partial<PromptTemplate>) =>
    request<PromptTemplate>(`/api/ai/prompts/${id}`, { method: 'PUT', body: JSON.stringify(body) }),

  getReviews: () => request<AiReview[]>('/api/ai/reviews'),
  deleteReview: (id: string) =>
    request<{ ok: boolean }>(`/api/ai/reviews/${id}`, { method: 'DELETE' }),
  generateReview: (body: {
    scope: 'daily' | 'weekly' | 'module' | 'custom';
    date_from: string;
    date_to: string;
    module_id?: string;
    custom_instruction?: string;
    provider_id?: string;
  }) => request<AiReview>('/api/ai/review', { method: 'POST', body: JSON.stringify(body) }),
  evaluateLog: (id: string, provider_id?: string) =>
    request<StudyLog>(`/api/ai/evaluate-log/${id}`, { method: 'POST', body: JSON.stringify({ provider_id }) }),
  organizeLog: (id: string, provider_id?: string) =>
    request<StudyLog>(`/api/ai/organize-log/${id}`, { method: 'POST', body: JSON.stringify({ provider_id }) }),
  organizeIdea: (id: string, provider_id?: string) =>
    request<GameIdea>(`/api/ai/organize-idea/${id}`, { method: 'POST', body: JSON.stringify({ provider_id }) }),
  assistIdea: (
    id: string,
    body: { action: 'expand' | 'critique' | 'crosslink'; custom_instruction?: string; provider_id?: string }
  ) => request<{ idea: GameIdea; latest: string }>(`/api/ai/idea-assist/${id}`, { method: 'POST', body: JSON.stringify(body) }),
  autoTag: (body: { title: string; content: string; kind: 'study' | 'idea'; provider_id?: string }) =>
    request<{ tags: string[]; summary: string; category: string }>('/api/ai/auto-tag', {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  getConversations: () => request<AiConversation[]>('/api/ai/conversations'),
  createConversation: (body: { title?: string; context_mode?: string; module_id?: string }) =>
    request<AiConversation>('/api/ai/conversations', { method: 'POST', body: JSON.stringify(body) }),
  deleteConversation: (id: string) =>
    request<{ ok: boolean }>(`/api/ai/conversations/${id}`, { method: 'DELETE' }),
  getMessages: (convId: string) => request<AiMessage[]>(`/api/ai/conversations/${convId}/messages`),

  streamChat: async (
    convId: string,
    body: { message: string; provider_id?: string; context_mode?: string; module_id?: string },
    handlers: {
      onMeta?: (references: AiReference[]) => void;
      onDelta: (text: string) => void;
      onDone?: (references: AiReference[]) => void;
      onError?: (err: string) => void;
    }
  ) => {
    const res = await fetch(`/api/ai/conversations/${convId}/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok || !res.body) {
      const data = await res.json().catch(() => ({}));
      throw new Error((data as { error?: string }).error || `对话失败 (${res.status})`);
    }
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const chunks = buffer.split('\n\n');
      buffer = chunks.pop() || '';
      for (const chunk of chunks) {
        const line = chunk.trim();
        if (!line.startsWith('data:')) continue;
        try {
          const payload = JSON.parse(line.slice(5).trim()) as {
            type: string;
            content?: string;
            references?: AiReference[];
            error?: string;
          };
          if (payload.type === 'meta' && payload.references) handlers.onMeta?.(payload.references);
          else if (payload.type === 'delta' && payload.content) handlers.onDelta(payload.content);
          else if (payload.type === 'done') handlers.onDone?.(payload.references || []);
          else if (payload.type === 'error') handlers.onError?.(payload.error || 'AI 生成中断');
        } catch {
          // ignore
        }
      }
    }
  },

  importJson: (payload: unknown) =>
    request<{ ok: boolean; importedModules: number; importedLogs: number; importedIdeas: number }>('/api/import/json', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
};

export const api = IS_STATIC_MODE ? localEngine : serverApi;

export function downloadExport(format: 'json' | 'markdown'): void {
  if (!IS_STATIC_MODE) {
    window.location.href = `/api/export/${format}`;
    return;
  }
  const { filename, content, mime } = localEngine.exportPayload(format);
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function todayDateString(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function daysAgoString(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
