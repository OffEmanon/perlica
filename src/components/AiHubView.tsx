import { useEffect, useRef, useState } from 'react';
import {
  Award,
  Bot,
  CalendarRange,
  FileText,
  Loader2,
  MessageSquare,
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

  // Review state
  const [reviews, setReviews] = useState<AiReview[]>([]);
  const [activeReview, setActiveReview] = useState<AiReview | null>(null);
  const [reviewScope, setReviewScope] = useState<'daily' | 'weekly' | 'module' | 'custom'>('daily');
  const [dateFrom, setDateFrom] = useState(todayDateString());
  const [dateTo, setDateTo] = useState(todayDateString());
  const [reviewModuleId, setReviewModuleId] = useState('');
  const [reviewExtra, setReviewExtra] = useState('');
  const [generatingReview, setGeneratingReview] = useState(false);

  // Chat state
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
      if (!reviewModuleId && modules[0]) setReviewModuleId(modules[0].id);
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
      onToast('AI 复盘报告生成成功');
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
    onToast('已删除复盘记录');
  };

  const handleNewConversation = async () => {
    const conv = await api.createConversation({
      title: '新知识库对话',
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
    <div className="lg:h-full flex flex-col gap-4 max-w-7xl mx-auto min-w-0">
      {/* Top Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 min-w-0">
        <div className="grid grid-cols-2 sm:flex items-center gap-1.5 p-1 rounded-xl surface w-full sm:w-fit">
          <button
            onClick={() => setSubTab('review')}
            className={`inline-flex items-center justify-center gap-1.5 px-2.5 sm:px-3.5 py-1.5 rounded-lg text-xs font-medium transition whitespace-nowrap ${
              subTab === 'review' ? 'bg-indigo-500 text-white' : 'text-secondary hover:text-primary'
            }`}
          >
            <Award className="w-3.5 h-3.5 shrink-0" /> 自动复盘汇总
          </button>
          <button
            onClick={() => setSubTab('chat')}
            className={`inline-flex items-center justify-center gap-1.5 px-2.5 sm:px-3.5 py-1.5 rounded-lg text-xs font-medium transition whitespace-nowrap ${
              subTab === 'chat' ? 'bg-indigo-500 text-white' : 'text-secondary hover:text-primary'
            }`}
          >
            <MessageSquare className="w-3.5 h-3.5 shrink-0" /> 知识库对话
          </button>
        </div>

        {/* Model Switcher */}
        <div className="flex items-center gap-2 text-xs w-full sm:w-auto min-w-0">
          <span className="text-muted shrink-0 whitespace-nowrap">当前模型：</span>
          <select
            value={selectedProviderId}
            onChange={(e) => setSelectedProviderId(e.target.value)}
            className="min-w-0 flex-1 sm:flex-none max-w-full px-3 py-1.5 rounded-xl surface text-primary font-medium focus:outline-none focus:border-indigo-500 truncate"
          >
            {providers.map((p) => (
              <option key={p.id} value={p.id} className="bg-[#141720]">
                {p.name} · {p.model}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* TAB 1: AI REVIEW & EVALUATION */}
      {subTab === 'review' && (
        <div className="flex flex-col lg:grid lg:grid-cols-12 gap-4 lg:flex-1 lg:min-h-0">
          {/* Left: Generator + History */}
          <div className="lg:col-span-4 flex flex-col gap-4 lg:min-h-0">
            <div className="surface rounded-2xl p-4 space-y-3">
              <div className="text-sm font-semibold flex items-center gap-1.5">
                <Sparkles className="w-4 h-4 text-indigo-400" /> 生成学习复盘评价
              </div>

              <div className="grid grid-cols-3 gap-1.5 text-xs">
                <button
                  onClick={() => applyPresetScope('daily')}
                  className={`py-1.5 rounded-lg font-medium border transition ${
                    reviewScope === 'daily'
                      ? 'bg-indigo-500/15 border-indigo-500/40 text-indigo-300'
                      : 'surface-elevated text-secondary'
                  }`}
                >
                  今日复盘
                </button>
                <button
                  onClick={() => applyPresetScope('weekly')}
                  className={`py-1.5 rounded-lg font-medium border transition ${
                    reviewScope === 'weekly'
                      ? 'bg-indigo-500/15 border-indigo-500/40 text-indigo-300'
                      : 'surface-elevated text-secondary'
                  }`}
                >
                  近7天周报
                </button>
                <button
                  onClick={() => applyPresetScope('module')}
                  className={`py-1.5 rounded-lg font-medium border transition ${
                    reviewScope === 'module'
                      ? 'bg-indigo-500/15 border-indigo-500/40 text-indigo-300'
                      : 'surface-elevated text-secondary'
                  }`}
                >
                  板块专项
                </button>
              </div>

              <div className="grid grid-cols-2 gap-2 text-xs">
                <label className="surface-elevated rounded-xl px-2.5 py-1.5">
                  <span className="text-[10px] text-muted block">开始日期</span>
                  <input
                    type="date"
                    value={dateFrom}
                    onChange={(e) => setDateFrom(e.target.value)}
                    className="bg-transparent w-full focus:outline-none mt-0.5"
                  />
                </label>
                <label className="surface-elevated rounded-xl px-2.5 py-1.5">
                  <span className="text-[10px] text-muted block">结束日期</span>
                  <input
                    type="date"
                    value={dateTo}
                    onChange={(e) => setDateTo(e.target.value)}
                    className="bg-transparent w-full focus:outline-none mt-0.5"
                  />
                </label>
              </div>

              <label className="surface-elevated rounded-xl px-2.5 py-1.5 block text-xs">
                <span className="text-[10px] text-muted block">筛选学习板块</span>
                <select
                  value={reviewModuleId}
                  onChange={(e) => setReviewModuleId(e.target.value)}
                  className="bg-transparent w-full focus:outline-none mt-0.5"
                >
                  <option value="" className="bg-[#141720]">
                    全部板块汇总
                  </option>
                  {modules.map((m) => (
                    <option key={m.id} value={m.id} className="bg-[#141720]">
                      {m.icon} {m.name}
                    </option>
                  ))}
                </select>
              </label>

              <textarea
                rows={2}
                value={reviewExtra}
                onChange={(e) => setReviewExtra(e.target.value)}
                placeholder="可选额外指令，例如：重点检查我数学分析和 UE5 的时间平衡，严格打分..."
                className="w-full px-3 py-2 rounded-xl surface-elevated text-xs focus:outline-none focus:border-indigo-500"
              />

              <button
                onClick={handleGenerateReview}
                disabled={generatingReview}
                className="w-full py-2.5 rounded-xl bg-indigo-500 hover:bg-indigo-400 text-white text-xs font-semibold flex items-center justify-center gap-1.5 transition disabled:opacity-60"
              >
                {generatingReview ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" /> AI 正在汇总评价中...
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4" /> 一键生成 AI 评价汇总
                  </>
                )}
              </button>
            </div>

            {/* Historical Reviews */}
            <div className="surface rounded-2xl p-3 flex-1 overflow-y-auto space-y-2 min-h-[180px]">
              <div className="text-xs font-semibold text-muted px-1">历史复盘档案 ({reviews.length})</div>
              {reviews.length === 0 ? (
                <p className="text-xs text-muted p-3 text-center">暂无历史复盘报告</p>
              ) : (
                reviews.map((rev) => (
                  <button
                    key={rev.id}
                    onClick={() => setActiveReview(rev)}
                    className={`w-full text-left p-3 rounded-xl border transition ${
                      activeReview?.id === rev.id
                        ? 'bg-indigo-500/12 border-indigo-500/40'
                        : 'surface-elevated hover:border-strong'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-semibold line-clamp-1">{rev.title}</span>
                      {rev.score > 0 && (
                        <span className="text-[11px] px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-400 font-bold shrink-0">
                          {rev.score}分
                        </span>
                      )}
                    </div>
                    <div className="text-[11px] text-muted mt-1 flex items-center justify-between">
                      <span>{rev.model_used}</span>
                      <span>{rev.created_at.slice(0, 10)}</span>
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>

          {/* Right: Active Review Reader */}
          <div className="lg:col-span-8 surface rounded-2xl p-4 sm:p-5 lg:overflow-y-auto min-h-[240px]">
            {!activeReview ? (
              <div className="h-full flex flex-col items-center justify-center text-center text-muted py-10">
                <CalendarRange className="w-9 h-9 mb-2 opacity-35" />
                <p className="text-sm">点击「一键生成 AI 评价汇总」，自动分析你的学习进度与任务完成度。</p>
                <p className="text-xs mt-1">支持在设置中自由定制复盘评分标准与导师风格。</p>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="flex items-start justify-between gap-3 pb-3 border-b border-subtle">
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <h2 className="text-lg font-bold">{activeReview.title}</h2>
                      {activeReview.score > 0 && (
                        <span className="px-2.5 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 text-xs font-bold border border-emerald-500/25">
                          综合评分 {activeReview.score} / 100
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-muted mt-1">
                      范围：{activeReview.date_from} ~ {activeReview.date_to} · 模型：{activeReview.model_used}
                    </p>
                  </div>
                  <button
                    onClick={() => handleDeleteReview(activeReview.id)}
                    className="p-1.5 rounded-lg text-muted hover:text-rose-400 hover:bg-rose-500/10"
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

      {/* TAB 2: KNOWLEDGE BASE AI CHAT */}
      {subTab === 'chat' && (
        <div className="flex flex-col lg:grid lg:grid-cols-12 gap-4 lg:flex-1 lg:min-h-0">
          {/* Conversation List */}
          <div className="lg:col-span-3 surface rounded-2xl p-3 flex flex-col gap-2 lg:min-h-0">
            <button
              onClick={handleNewConversation}
              className="w-full py-2 rounded-xl bg-indigo-500/15 hover:bg-indigo-500/25 text-indigo-300 border border-indigo-500/25 text-xs font-medium flex items-center justify-center gap-1.5 transition"
            >
              <Plus className="w-3.5 h-3.5" /> 新建对话
            </button>

            <div className="space-y-1.5 overflow-y-auto flex-1 max-h-40 lg:max-h-none">
              {conversations.map((c) => (
                <div
                  key={c.id}
                  onClick={() => setActiveConvId(c.id)}
                  className={`group flex items-center justify-between gap-2 px-3 py-2 rounded-xl text-xs cursor-pointer transition ${
                    activeConvId === c.id
                      ? 'bg-indigo-500/15 text-primary border border-indigo-500/30'
                      : 'text-secondary hover:bg-white/[0.04]'
                  }`}
                >
                  <span className="truncate">{c.title}</span>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDeleteConversation(c.id);
                    }}
                    className="opacity-0 group-hover:opacity-100 text-muted hover:text-rose-400"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* Chat Pane */}
          <div className="lg:col-span-9 surface rounded-2xl flex flex-col min-h-[460px] overflow-hidden">
            {/* Context Scope Bar */}
            <div className="px-4 py-2.5 border-b border-subtle bg-[var(--bg-elevated)] flex items-center justify-between gap-2 flex-wrap text-xs">
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-muted">知识库检索范围：</span>
                {(
                  [
                    ['all', '全部记录'],
                    ['study', '仅学习日志'],
                    ['ideas', '仅游戏灵感'],
                    ['module', '指定板块'],
                  ] as const
                ).map(([k, label]) => (
                  <button
                    key={k}
                    onClick={() => {
                      setChatMode(k);
                      if (k === 'module' && !chatModuleId && modules[0]) setChatModuleId(modules[0].id);
                    }}
                    className={`px-2.5 py-1 rounded-lg transition ${
                      chatMode === k ? 'bg-indigo-500 text-white' : 'surface text-secondary'
                    }`}
                  >
                    {label}
                  </button>
                ))}
                {chatMode === 'module' && (
                  <select
                    value={chatModuleId}
                    onChange={(e) => setChatModuleId(e.target.value)}
                    className="px-2 py-1 rounded-lg surface text-primary focus:outline-none"
                  >
                    {modules.map((m) => (
                      <option key={m.id} value={m.id} className="bg-[#141720]">
                        {m.icon} {m.name}
                      </option>
                    ))}
                  </select>
                )}
              </div>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {messages.length === 0 && !streamDraft ? (
                <div className="h-full flex flex-col items-center justify-center text-center py-8 space-y-3">
                  <Bot className="w-10 h-10 text-indigo-400 opacity-70" />
                  <div>
                    <p className="text-sm font-medium">向你的个人学习与灵感知识库提问</p>
                    <p className="text-xs text-muted mt-1">
                      AI 会自动检索你历史记录的 UE5 笔记、数学分析推导与游戏灵感来作答
                    </p>
                  </div>
                  <div className="flex flex-wrap justify-center gap-2 max-w-xl">
                    {[
                      '帮我总结最近虚幻引擎和数学分析的学习进度，有哪些未完成任务？',
                      '我记录的游戏灵感里，哪一个最适合拿我现在学的 UE5 技能做原型？',
                      '数学分析里的极限和连续性知识，在游戏开发里有哪些实际应用？',
                    ].map((q) => (
                      <button
                        key={q}
                        onClick={() => setChatInput(q)}
                        className="text-xs px-3 py-2 rounded-xl surface-elevated hover:border-strong text-secondary hover:text-primary transition text-left"
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
                        className={`max-w-[90%] sm:max-w-[82%] rounded-2xl px-4 py-3 ${
                          m.role === 'user'
                            ? 'bg-indigo-500 text-white text-sm'
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
                          <span className="text-[10px] text-muted">参考记录：</span>
                          {m.references.slice(0, 5).map((r) => (
                            <button
                              key={`${r.type}_${r.id}`}
                              onClick={() => onJumpToReference?.(r)}
                              className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-md surface hover:border-indigo-400 text-secondary hover:text-primary transition"
                            >
                              <FileText className="w-2.5 h-2.5 text-indigo-400" />
                              <span className="truncate max-w-[140px]">{r.title}</span>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}

                  {streaming && (
                    <div className="flex flex-col items-start">
                      <div className="max-w-[90%] sm:max-w-[82%] rounded-2xl px-4 py-3 surface-elevated">
                        {streamDraft ? (
                          <MarkdownView content={streamDraft} />
                        ) : (
                          <span className="text-xs text-muted flex items-center gap-1.5">
                            <Loader2 className="w-3.5 h-3.5 animate-spin" /> 检索历史记录并思考中...
                          </span>
                        )}
                      </div>
                      {streamRefs.length > 0 && (
                        <div className="flex items-center gap-1.5 flex-wrap mt-1.5">
                          <span className="text-[10px] text-muted">已关联 {streamRefs.length} 条记录</span>
                        </div>
                      )}
                    </div>
                  )}
                  <div ref={chatEndRef} />
                </>
              )}
            </div>

            {/* Composer */}
            <div className="p-3 border-t border-subtle bg-[var(--bg-elevated)] flex items-end gap-2">
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
                placeholder="输入问题，按 Enter 发送（Shift+Enter 换行）..."
                className="flex-1 px-3 py-2 rounded-xl bg-[var(--bg-surface)] border border-subtle text-sm focus:outline-none focus:border-indigo-500 resize-none"
              />
              <button
                onClick={handleSendChat}
                disabled={streaming || !chatInput.trim()}
                className="p-3 rounded-xl bg-indigo-500 hover:bg-indigo-400 text-white transition disabled:opacity-40"
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
