import { useEffect, useRef, useState } from 'react';
import {
  FileText,
  Loader2,
  Plus,
  Send,
  Sparkles,
  Trash2,
} from 'lucide-react';
import type {
  AiConversation,
  AiMessage,
  AiProvider,
  AiReference,
  AiReview,
  StudyModule,
} from '../types.ts';
import { api, daysAgoString, todayDateString } from '../api.ts';
import { MarkdownView } from './MarkdownView.tsx';

interface AiHubViewProps {
  modules: StudyModule[];
  providers: AiProvider[];
  initialTab?: 'review' | 'chat';
  autoTriggerDaily?: boolean;
  onAutoTriggerConsumed?: () => void;
  onJumpToReference?: (ref: AiReference) => void;
  onToast: (msg: string, type?: 'ok' | 'err') => void;
}

export function AiHubView({
  modules,
  providers,
  initialTab = 'review',
  autoTriggerDaily,
  onAutoTriggerConsumed,
  onJumpToReference,
  onToast,
}: AiHubViewProps) {
  const [subTab, setSubTab] = useState<'review' | 'chat'>(initialTab);
  const [selectedProviderId, setSelectedProviderId] = useState<string>('');

  const [reviews, setReviews] = useState<AiReview[]>([]);
  const [activeReview, setActiveReview] = useState<AiReview | null>(null);
  const [reviewScope, setReviewScope] = useState<'daily' | 'weekly' | 'module' | 'custom'>('daily');
  const [dateFrom, setDateFrom] = useState(todayDateString());
  const [dateTo, setDateTo] = useState(todayDateString());
  const [reviewModuleId, setReviewModuleId] = useState('');
  const [reviewExtra, setReviewExtra] = useState('');
  const [generatingReview, setGeneratingReview] = useState(false);

  const [conversations, setConversations] = useState<AiConversation[]>([]);
  const [activeConvId, setActiveConvId] = useState<string | null>(null);
  const [messages, setMessages] = useState<AiMessage[]>([]);
  const [chatMode, setChatMode] = useState<'all' | 'study' | 'ideas' | 'module'>('all');
  const [chatModuleId, setChatModuleId] = useState('');
  const [chatInput, setChatInput] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [streamDraft, setStreamDraft] = useState('');
  const [streamRefs, setStreamRefs] = useState<AiReference[]>([]);
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setSubTab(initialTab);
  }, [initialTab]);

  useEffect(() => {
    const active = providers.find((p) => p.is_active) || providers[0];
    if (active && !selectedProviderId) setSelectedProviderId(active.id);
  }, [providers, selectedProviderId]);

  const loadReviews = async () => {
    const list = await api.getReviews();
    setReviews(list);
    if (list.length > 0 && !activeReview) setActiveReview(list[0]);
  };

  const loadConversations = async () => {
    const list = await api.getConversations();
    setConversations(list);
    if (list.length > 0 && !activeConvId) {
      setActiveConvId(list[0].id);
    }
  };

  useEffect(() => {
    loadReviews();
    loadConversations();
  }, []);

  useEffect(() => {
    if (!activeConvId) {
      setMessages([]);
      return;
    }
    api.getMessages(activeConvId).then(setMessages).catch(() => {});
  }, [activeConvId]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streamDraft]);

  useEffect(() => {
    if (autoTriggerDaily) {
      setSubTab('review');
      setReviewScope('daily');
      setDateFrom(todayDateString());
      setDateTo(todayDateString());
      setReviewModuleId('');
      onAutoTriggerConsumed?.();
    }
  }, [autoTriggerDaily, onAutoTriggerConsumed]);

  const visibleCategories = modules.filter((m) => (m.log_count ?? 0) > 0);

  const applyPresetScope = (scope: 'daily' | 'weekly' | 'module') => {
    setReviewScope(scope);
    if (scope === 'daily') {
      setDateFrom(todayDateString());
      setDateTo(todayDateString());
      setReviewModuleId('');
    } else if (scope === 'weekly') {
      setDateFrom(daysAgoString(6));
      setDateTo(todayDateString());
      setReviewModuleId('');
    } else if (scope === 'module') {
      setDateFrom(daysAgoString(29));
      setDateTo(todayDateString());
      if (!reviewModuleId && visibleCategories[0]) setReviewModuleId(visibleCategories[0].id);
    }
  };

  const handleGenerateReview = async () => {
    setGeneratingReview(true);
    try {
      const created = await api.generateReview({
        scope: reviewScope,
        date_from: dateFrom,
        date_to: dateTo,
        module_id: reviewModuleId || undefined,
        custom_instruction: reviewExtra.trim() || undefined,
        provider_id: selectedProviderId || undefined,
      });
      setReviews((prev) => [created, ...prev]);
      setActiveReview(created);
      setReviewExtra('');
      onToast('复盘已生成');
    } catch (e) {
      onToast(e instanceof Error ? e.message : '生成复盘失败', 'err');
    } finally {
      setGeneratingReview(false);
    }
  };

  const handleDeleteReview = async (id: string) => {
    await api.deleteReview(id);
    const next = reviews.filter((r) => r.id !== id);
    setReviews(next);
    if (activeReview?.id === id) setActiveReview(next[0] || null);
    onToast('已删除');
  };

  const handleNewConversation = async () => {
    const conv = await api.createConversation({
      title: '新对话',
      context_mode: chatMode,
      module_id: chatModuleId,
    });
    setConversations((prev) => [conv, ...prev]);
    setActiveConvId(conv.id);
    setMessages([]);
  };

  const handleDeleteConversation = async (id: string) => {
    await api.deleteConversation(id);
    const next = conversations.filter((c) => c.id !== id);
    setConversations(next);
    if (activeConvId === id) setActiveConvId(next[0]?.id || null);
  };

  const handleSendChat = async () => {
    const text = chatInput.trim();
    if (!text || streaming) return;

    let convId = activeConvId;
    if (!convId) {
      const conv = await api.createConversation({
        title: text.slice(0, 20),
        context_mode: chatMode,
        module_id: chatModuleId,
      });
      setConversations((prev) => [conv, ...prev]);
      convId = conv.id;
      setActiveConvId(conv.id);
    }

    const tempUser: AiMessage = {
      id: `tmp_u_${Date.now()}`,
      conversation_id: convId,
      role: 'user',
      content: text,
      references: [],
      created_at: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, tempUser]);
    setChatInput('');
    setStreaming(true);
    setStreamDraft('');
    setStreamRefs([]);

    let acc = '';
    try {
      await api.streamChat(
        convId,
        {
          message: text,
          provider_id: selectedProviderId || undefined,
          context_mode: chatMode,
          module_id: chatMode === 'module' ? chatModuleId : '',
        },
        {
          onMeta: (refs) => setStreamRefs(refs),
          onDelta: (delta) => {
            acc += delta;
            setStreamDraft(acc);
          },
          onDone: async () => {
            const refreshed = await api.getMessages(convId!);
            setMessages(refreshed);
            setStreamDraft('');
            setStreamRefs([]);
            loadConversations();
          },
          onError: (err) => {
            onToast(err, 'err');
          },
        }
      );
    } catch (e) {
      onToast(e instanceof Error ? e.message : '发送失败', 'err');
    } finally {
      setStreaming(false);
    }
  };

  return (
    <div className="lg:h-full flex flex-col gap-4 max-w-5xl mx-auto min-w-0">
      {/* Top Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 min-w-0">
        <div className="flex items-center gap-4">
          <h1 className="text-xl font-semibold tracking-tight shrink-0">AI 参谋</h1>
          <div className="inline-flex items-center gap-1 p-1 rounded-lg surface text-xs">
            <button
              onClick={() => setSubTab('review')}
              className={`px-3 py-1 rounded-sm font-medium transition-colors duration-100 whitespace-nowrap ${
                subTab === 'review' ? 'btn-primary' : 'text-secondary hover:text-primary'
              }`}
            >
              复盘
            </button>
            <button
              onClick={() => setSubTab('chat')}
              className={`px-3 py-1 rounded-sm font-medium transition-colors duration-100 whitespace-nowrap ${
                subTab === 'chat' ? 'btn-primary' : 'text-secondary hover:text-primary'
              }`}
            >
              对话
            </button>
          </div>
        </div>

        <select
          value={selectedProviderId}
          onChange={(e) => setSelectedProviderId(e.target.value)}
          className="min-w-0 w-full sm:w-auto max-w-full px-3 py-1.5 rounded-lg surface text-xs text-primary focus:outline-none focus:border-strong truncate"
        >
          {providers.map((p) => (
            <option key={p.id} value={p.id} className="bg-[var(--bg-surface)] text-[var(--text-primary)]">
              {p.name} · {p.model}
            </option>
          ))}
        </select>
      </div>

      {/* TAB 1: REVIEW */}
      {subTab === 'review' && (
        <div className="flex flex-col lg:grid lg:grid-cols-12 gap-4 lg:flex-1 lg:min-h-0">
          {/* Left: Generator + History */}
          <div className="lg:col-span-4 flex flex-col gap-4 lg:min-h-0">
            <div className="surface rounded-xl p-4 space-y-3">
              <div className="grid grid-cols-3 gap-1 p-1 rounded-lg surface-elevated text-xs">
                {(
                  [
                    ['daily', '今日'],
                    ['weekly', '近 7 天'],
                    ['module', '按分类'],
                  ] as const
                ).map(([key, label]) => (
                  <button
                    key={key}
                    onClick={() => applyPresetScope(key)}
                    className={`py-1 rounded-sm font-medium transition-colors duration-100 ${
                      reviewScope === key ? 'btn-primary' : 'text-secondary hover:text-primary'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>

              <div className="grid grid-cols-2 gap-2 text-xs">
                <input
                  type="date"
                  value={dateFrom}
                  onChange={(e) => setDateFrom(e.target.value)}
                  className="px-2.5 py-1.5 rounded-lg surface-elevated text-secondary focus:outline-none tabular-nums"
                />
                <input
                  type="date"
                  value={dateTo}
                  onChange={(e) => setDateTo(e.target.value)}
                  className="px-2.5 py-1.5 rounded-lg surface-elevated text-secondary focus:outline-none tabular-nums"
                />
              </div>

              <select
                value={reviewModuleId}
                onChange={(e) => setReviewModuleId(e.target.value)}
                className="w-full px-2.5 py-1.5 rounded-lg surface-elevated text-xs text-primary focus:outline-none"
              >
                <option value="" className="bg-[var(--bg-surface)] text-[var(--text-primary)]">
                  全部分类
                </option>
                {visibleCategories.map((m) => (
                  <option key={m.id} value={m.id} className="bg-[var(--bg-surface)] text-[var(--text-primary)]">
                    {m.name}
                  </option>
                ))}
              </select>

              <textarea
                rows={2}
                value={reviewExtra}
                onChange={(e) => setReviewExtra(e.target.value)}
                placeholder="补充要求（可选）"
                className="w-full px-3 py-2 rounded-lg surface-elevated text-xs focus:outline-none focus:border-strong resize-none"
              />

              <button
                onClick={handleGenerateReview}
                disabled={generatingReview}
                className="w-full py-2 rounded-lg btn-primary text-xs font-medium flex items-center justify-center gap-1.5 transition-colors duration-100 disabled:opacity-50"
              >
                {generatingReview ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Sparkles className="w-3.5 h-3.5" />
                )}
                {generatingReview ? '生成中...' : '生成复盘'}
              </button>
            </div>

            {/* History */}
            <div className="surface rounded-xl p-4 flex-1 overflow-y-auto space-y-2 min-h-[160px]">
              <div className="text-xs font-medium text-muted">历史记录</div>
              {reviews.length === 0 ? (
                <p className="text-xs text-muted py-4 text-center">暂无复盘</p>
              ) : (
                <div className="divide-y divide-[var(--border-subtle)]">
                  {reviews.map((rev) => (
                    <button
                      key={rev.id}
                      onClick={() => setActiveReview(rev)}
                      className={`w-full text-left py-2.5 px-2 -mx-2 rounded-lg transition-colors duration-100 ${
                        activeReview?.id === rev.id ? 'bg-[var(--bg-elevated)]' : 'hover:bg-[var(--bg-elevated)]/60'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm font-medium line-clamp-1">{rev.title}</span>
                        {rev.score > 0 && (
                          <span className="text-xs text-secondary font-medium tabular-nums shrink-0">
                            {rev.score}
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-muted mt-0.5 tabular-nums">{rev.created_at.slice(0, 10)}</div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Right: Active Review Reader */}
          <div className="lg:col-span-8 surface rounded-xl p-5 lg:overflow-y-auto min-h-[240px]">
            {!activeReview ? (
              <div className="h-full flex items-center justify-center text-sm text-muted py-10">
                生成或选择一条复盘查看
              </div>
            ) : (
              <div key={activeReview.id} className="space-y-4 anim-view">
                <div className="flex items-start justify-between gap-3 pb-3 border-b border-subtle">
                  <div>
                    <div className="flex items-center gap-2.5 flex-wrap">
                      <h2 className="text-base font-semibold">{activeReview.title}</h2>
                      {activeReview.score > 0 && (
                        <span className="px-2 py-0.5 rounded-md bg-[var(--bg-elevated)] text-xs font-medium tabular-nums">
                          {activeReview.score} / 100
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-muted mt-1 tabular-nums">
                      {activeReview.date_from} ~ {activeReview.date_to} · {activeReview.model_used}
                    </p>
                  </div>
                  <button
                    onClick={() => handleDeleteReview(activeReview.id)}
                    title="删除"
                    className="p-1.5 rounded-lg text-muted hover:text-rose-500"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
                <MarkdownView content={activeReview.content} />
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 2: CHAT */}
      {subTab === 'chat' && (
        <div className="flex flex-col lg:grid lg:grid-cols-12 gap-4 lg:flex-1 lg:min-h-0">
          {/* Conversation List */}
          <div className="lg:col-span-3 surface rounded-xl p-3 flex flex-col gap-2 lg:min-h-0">
            <button
              onClick={handleNewConversation}
              className="w-full py-1.5 rounded-lg surface-elevated hover:border-strong text-xs font-medium text-primary flex items-center justify-center gap-1.5 transition-colors duration-100"
            >
              <Plus className="w-3.5 h-3.5" /> 新建对话
            </button>

            <div className="space-y-0.5 overflow-y-auto flex-1 max-h-40 lg:max-h-none">
              {conversations.map((c) => (
                <div
                  key={c.id}
                  onClick={() => setActiveConvId(c.id)}
                  className={`group flex items-center justify-between gap-2 px-2.5 py-2 rounded-lg text-xs cursor-pointer transition-colors duration-100 ${
                    activeConvId === c.id
                      ? 'bg-[var(--bg-elevated)] text-primary font-medium'
                      : 'text-secondary hover:bg-[var(--bg-elevated)]/60'
                  }`}
                >
                  <span className="truncate">{c.title}</span>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDeleteConversation(c.id);
                    }}
                    className="opacity-0 group-hover:opacity-100 text-muted hover:text-rose-500"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* Chat Pane */}
          <div className="lg:col-span-9 surface rounded-xl flex flex-col min-h-[460px] overflow-hidden">
            {/* Context Scope Bar */}
            <div className="px-4 py-2.5 border-b border-subtle flex items-center gap-1.5 flex-wrap text-xs">
              <span className="text-muted mr-1">范围</span>
              {(
                [
                  ['all', '全部'],
                  ['study', '学习'],
                  ['ideas', '灵感'],
                  ['module', '指定分类'],
                ] as const
              ).map(([k, label]) => (
                <button
                  key={k}
                  onClick={() => {
                    setChatMode(k);
                    if (k === 'module' && !chatModuleId && visibleCategories[0]) setChatModuleId(visibleCategories[0].id);
                  }}
                  className={`px-2.5 py-1 rounded-md transition-colors duration-100 ${
                    chatMode === k ? 'btn-primary font-medium' : 'text-secondary hover:text-primary hover:bg-[var(--bg-elevated)]'
                  }`}
                >
                  {label}
                </button>
              ))}
              {chatMode === 'module' && visibleCategories.length > 0 && (
                <select
                  value={chatModuleId}
                  onChange={(e) => setChatModuleId(e.target.value)}
                  className="px-2 py-1 rounded-md surface-elevated text-primary focus:outline-none"
                >
                  {visibleCategories.map((m) => (
                    <option key={m.id} value={m.id} className="bg-[var(--bg-surface)] text-[var(--text-primary)]">
                      {m.name}
                    </option>
                  ))}
                </select>
              )}
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {messages.length === 0 && !streamDraft ? (
                <div className="h-full flex flex-col items-center justify-center text-center py-8 space-y-3">
                  <p className="text-sm text-secondary">基于你的学习日志与游戏灵感提问</p>
                  <div className="flex flex-wrap justify-center gap-2 max-w-lg">
                    {[
                      '总结最近学过的核心知识点',
                      '哪些游戏灵感适合用最近学的技术做原型？',
                    ].map((q) => (
                      <button
                        key={q}
                        onClick={() => setChatInput(q)}
                        className="text-xs px-3 py-1.5 rounded-lg surface-elevated hover:border-strong text-secondary hover:text-primary transition-colors duration-100"
                      >
                        {q}
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                <>
                  {messages.map((m) => (
                    <div
                      key={m.id}
                      className={`flex flex-col ${m.role === 'user' ? 'items-end' : 'items-start'}`}
                    >
                      <div
                        className={`max-w-[90%] sm:max-w-[82%] rounded-xl px-4 py-3 ${
                          m.role === 'user'
                            ? 'btn-primary text-sm'
                            : 'surface-elevated'
                        }`}
                      >
                        {m.role === 'user' ? (
                          <p className="whitespace-pre-wrap leading-relaxed">{m.content}</p>
                        ) : (
                          <MarkdownView content={m.content} />
                        )}
                      </div>
                      {m.role === 'assistant' && m.references.length > 0 && (
                        <div className="flex items-center gap-1.5 flex-wrap mt-1.5 max-w-[88%]">
                          {m.references.slice(0, 5).map((r) => (
                            <button
                              key={`${r.type}_${r.id}`}
                              onClick={() => onJumpToReference?.(r)}
                              className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-md surface hover:border-strong text-secondary hover:text-primary transition-colors duration-100"
                            >
                              <FileText className="w-3 h-3 text-muted" />
                              <span className="truncate max-w-[140px]">{r.title}</span>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}

                  {streaming && (
                    <div className="flex flex-col items-start">
                      <div className="max-w-[90%] sm:max-w-[82%] rounded-xl px-4 py-3 surface-elevated">
                        {streamDraft ? (
                          <MarkdownView content={streamDraft} />
                        ) : (
                          <span className="text-xs text-muted flex items-center gap-1.5">
                            <Loader2 className="w-3.5 h-3.5 animate-spin" /> 思考中...
                          </span>
                        )}
                      </div>
                      {streamRefs.length > 0 && (
                        <span className="text-xs text-muted mt-1">关联 {streamRefs.length} 条记录</span>
                      )}
                    </div>
                  )}
                  <div ref={chatEndRef} />
                </>
              )}
            </div>

            {/* Composer */}
            <div className="p-3 border-t border-subtle flex items-end gap-2">
              <textarea
                rows={2}
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleSendChat();
                  }
                }}
                placeholder="输入问题..."
                className="flex-1 px-3 py-2 rounded-lg surface-elevated text-sm focus:outline-none focus:border-strong resize-none"
              />
              <button
                onClick={handleSendChat}
                disabled={streaming || !chatInput.trim()}
                className="p-2.5 rounded-lg btn-primary transition-colors duration-100 disabled:opacity-40"
              >
                {streaming ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
