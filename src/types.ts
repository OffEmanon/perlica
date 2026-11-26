export interface StudyTask {
  id: string;
  text: string;
  done: boolean;
}

export interface StudyModule {
  id: string;
  name: string;
  icon: string;
  color: string;
  description: string;
  goal: string;
  sort_order: number;
  archived: number;
  created_at: string;
  log_count?: number;
  total_minutes?: number;
}

export interface StudyLog {
  id: string;
  module_id: string;
  log_date: string;
  title: string;
  content: string;
  tasks: StudyTask[];
  duration_minutes: number;
  rating: number;
  tags: string[];
  ai_feedback: string;
  created_at: string;
  updated_at: string;
}

export type IdeaStatus = 'spark' | 'developing' | 'prototype' | 'archived';

export interface GameIdea {
  id: string;
  title: string;
  summary: string;
  content: string;
  category: string;
  status: IdeaStatus;
  priority: number;
  tags: string[];
  related_ids: string[];
  ai_notes: string;
  created_at: string;
  updated_at: string;
}

export interface AiReview {
  id: string;
  scope: 'daily' | 'weekly' | 'module' | 'custom';
  title: string;
  date_from: string;
  date_to: string;
  module_id: string;
  score: number;
  content: string;
  model_used: string;
  created_at: string;
}

export type AiProtocol = 'openai' | 'anthropic' | 'gemini';

export interface AiProvider {
  id: string;
  name: string;
  protocol: AiProtocol;
  base_url: string;
  api_key: string;
  model: string;
  is_active: number;
  temperature: number;
  max_tokens: number;
  created_at: string;
}

export interface PromptTemplate {
  id: string;
  key: string;
  name: string;
  description: string;
  system_prompt: string;
  updated_at: string;
}

export interface AiConversation {
  id: string;
  title: string;
  context_mode: 'all' | 'study' | 'ideas' | 'module';
  module_id: string;
  created_at: string;
  updated_at: string;
}

export interface AiReference {
  type: 'study_log' | 'game_idea';
  id: string;
  title: string;
  meta: string;
}

export interface AiMessage {
  id: string;
  conversation_id: string;
  role: 'user' | 'assistant';
  content: string;
  references: AiReference[];
  created_at: string;
}

export interface NetworkInfo {
  port: number;
  urls: string[];
  qrDataUrl: string | null;
  primaryLanUrl: string | null;
  tailscaleUrl?: string | null;
}

export interface AuthStatus {
  enabled: boolean;
  authenticated: boolean;
  envLocked: boolean;
}

export interface TunnelStatus {
  installed: boolean;
  running: boolean;
  mode: 'quick' | 'token' | null;
  url: string | null;
  qrDataUrl: string | null;
  error: string | null;
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

export interface DashboardStats {
  todayDate: string;
  todayMinutes: number;
  todayCompletedTasks: number;
  todayTotalTasks: number;
  weekMinutes: number;
  weekLogs?: number;
  streakDays: number;
  totalLogs: number;
  totalIdeas: number;
  activeIdeas: number;
  moduleBreakdown: Array<{
    module_id: string;
    name: string;
    icon: string;
    color: string;
    minutes: number;
    logs: number;
  }>;
  heatmap: Array<{ date: string; minutes: number; count: number }>;
}
