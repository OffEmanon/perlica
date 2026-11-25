import { useEffect, useState } from 'react';
import {
  ArrowLeft,
  Flame,
  Gamepad2,
  GitMerge,
  LayoutGrid,
  Loader2,
  Plus,
  Save,
  Search,
  Sparkles,
  Tag,
  Target,
  Trash2,
  Wand2,
  X,
} from 'lucide-react';
import type { GameIdea, IdeaStatus } from '../types.ts';
import { api } from '../api.ts';
import { MarkdownEditor } from './MarkdownEditor.tsx';
import { MarkdownView } from './MarkdownView.tsx';

interface IdeasViewProps {
  ideas: GameIdea[];
  selectedIdeaId: string | null;
  onSelectIdeaId: (id: string | null) => void;
  onRefresh: () => void;
  onToast: (msg: string, type?: 'ok' | 'err') => void;
}

const CATEGORIES = ['玩法机制', '世界观剧情', '美术风格', '系统数值', '关卡体验', '音频氛围', '完整立项'];
const STATUS_META: Record<IdeaStatus, { label: string; color: string }> = {
  spark: { label: '闪念火花', color: '#f59e0b' },
  developing: { label: '深化打磨', color: '#6366f1' },
  prototype: { label: '原型验证', color: '#10b981' },
  archived: { label: '归档封存', color: '#64748b' },
};

export function IdeasView({
  ideas,
  selectedIdeaId,
  onSelectIdeaId,
  onRefresh,
  onToast,
}: IdeasViewProps) {
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [catFilter, setCatFilter] = useState<string>('all');
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<GameIdea | null>(null);
  const [saving, setSaving] = useState(false);
  const [aiAction, setAiAction] = useState<string | null>(null);
  const [customAiPrompt, setCustomAiPrompt] = useState('');
  const [newTag, setNewTag] = useState('');

  useEffect(() => {
    if (selectedIdeaId) {
      const found = ideas.find((i) => i.id === selectedIdeaId);
      if (found) setEditing({ ...found });
    }
  }, [selectedIdeaId, ideas]);

  const filtered = ideas.filter((i) => {
    if (statusFilter !== 'all' && i.status !== statusFilter) return false;
    if (catFilter !== 'all' && i.category !== catFilter) return false;
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      return (
        i.title.toLowerCase().includes(q) ||
        i.summary.toLowerCase().includes(q) ||
        i.content.toLowerCase().includes(q) ||
        i.tags.some((t) => t.toLowerCase().includes(q))
      );
    }
    return true;
  });

  const handleNewIdea = async () => {
    try {
      const created = await api.createIdea({
        title: '未命名游戏灵感',
        summary: '',
        content: '### 核心直觉\n\n### 玩家体验钩子\n',
        category: '玩法机制',
        status: 'spark',
        priority: 2,
        tags: [],
      });
      onRefresh();
      onSelectIdeaId(created.id);
      setEditing(created);
      onToast('已创建新灵感卡片');
    } catch (e) {
      onToast(e instanceof Error ? e.message : '创建失败', 'err');
    }
  };

  const handleSave = async () => {
    if (!editing) return;
    setSaving(true);
    try {
      const updated = await api.updateIdea(editing.id, editing);
      setEditing(updated);
      onRefresh();
      onToast('游戏灵感已保存');
    } catch (e) {
      onToast(e instanceof Error ? e.message : '保存失败', 'err');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('确定删除这条游戏灵感吗？')) return;
    await api.deleteIdea(id);
    if (editing?.id === id) {
      setEditing(null);
      onSelectIdeaId(null);
    }
    onRefresh();
    onToast('灵感已删除');
  };

  const handleAiAssist = async (action: 'expand' | 'critique' | 'crosslink') => {
    if (!editing) return;
    setAiAction(action);
    try {
      await api.updateIdea(editing.id, editing);
      const res = await api.assistIdea(editing.id, {
        action,
        custom_instruction: customAiPrompt.trim() || undefined,
      });
      setEditing(res.idea);
      setCustomAiPrompt('');
      onRefresh();
      onToast('AI 陪跑分析已追加到灵感笔记');
    } catch (e) {
      onToast(e instanceof Error ? e.message : 'AI 陪跑失败', 'err');
    } finally {
      setAiAction(null);
    }
  };

  const handleAutoTag = async () => {
    if (!editing) return;
    setAiAction('tag');
    try {
      const res = await api.autoTag({
        title: editing.title,
        content: `${editing.summary}\n${editing.content}`,
        kind: 'idea',
      });
      setEditing({
        ...editing,
        tags: Array.from(new Set([...editing.tags, ...res.tags])),
        summary: editing.summary.trim() ? editing.summary : res.summary,
        category: CATEGORIES.includes(res.category) ? res.category : editing.category,
      });
      onToast('AI 已智能补充标签与概括');
    } catch (e) {
      onToast(e instanceof Error ? e.message : 'AI 打标失败', 'err');
    } finally {
      setAiAction(null);
    }
  };

  const addTag = () => {
    if (!editing || !newTag.trim()) return;
    const t = newTag.trim();
    if (!editing.tags.includes(t)) {
      setEditing({ ...editing, tags: [...editing.tags, t] });
    }
    setNewTag('');
  };

  return (
    <div className="lg:h-full flex flex-col gap-4 max-w-7xl mx-auto min-w-0">
      {/* Header & Filters */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2">
            <Gamepad2 className="w-5 h-5 text-amber-400" /> 游戏灵感库
          </h1>
          <p className="text-xs text-muted mt-0.5">
            捕获碎片闪念，借助 AI 主策划一键扩写机制、犀利挑刺、碰撞历史脑洞
          </p>
        </div>
        <button
          onClick={handleNewIdea}
          className="inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-sm font-semibold transition shadow-sm shadow-amber-500/20"
        >
          <Plus className="w-4 h-4" /> 捕获新灵感
        </button>
      </div>

      {/* Filter Bar */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[180px] max-w-xs">
          <Search className="w-4 h-4 text-muted absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="搜索灵感、标签..."
            className="w-full pl-9 pr-3 py-1.5 rounded-xl surface text-xs focus:outline-none focus:border-amber-400"
          />
        </div>

        <div className="flex items-center gap-1 overflow-x-auto">
          {(['all', 'spark', 'developing', 'prototype', 'archived'] as const).map((st) => (
            <button
              key={st}
              onClick={() => setStatusFilter(st)}
              className={`px-2.5 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition ${
                statusFilter === st
                  ? 'bg-indigo-500 text-white'
                  : 'surface text-secondary hover:text-primary'
              }`}
            >
              {st === 'all' ? '全部状态' : STATUS_META[st].label}
            </button>
          ))}
        </div>

        <select
          value={catFilter}
          onChange={(e) => setCatFilter(e.target.value)}
          className="px-2.5 py-1.5 rounded-lg surface text-xs text-secondary focus:outline-none"
        >
          <option value="all" className="bg-[#141720]">
            全部分类
          </option>
          {CATEGORIES.map((c) => (
            <option key={c} value={c} className="bg-[#141720]">
              {c}
            </option>
          ))}
        </select>
      </div>

      {/* Main Split View */}
      <div className="flex flex-col lg:grid lg:grid-cols-12 gap-4 lg:flex-1 lg:min-h-0">
        {/* Idea List */}
        <div
          className={`lg:col-span-4 space-y-2.5 lg:overflow-y-auto lg:pr-1 ${
            editing ? 'hidden lg:block' : 'block'
          }`}
        >
          {filtered.length === 0 ? (
            <div className="surface rounded-2xl p-8 text-center text-sm text-muted">
              暂无符合条件的灵感卡片
            </div>
          ) : (
            filtered.map((idea) => {
              const st = STATUS_META[idea.status] || STATUS_META.spark;
              const selected = editing?.id === idea.id;
              return (
                <button
                  key={idea.id}
                  onClick={() => {
                    setEditing({ ...idea });
                    onSelectIdeaId(idea.id);
                  }}
                  className={`w-full text-left p-4 rounded-2xl border transition ${
                    selected
                      ? 'bg-amber-500/10 border-amber-400/40'
                      : 'surface hover:border-strong'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2 text-[11px]">
                    <span
                      className="px-2 py-0.5 rounded-md font-medium"
                      style={{ backgroundColor: `${st.color}20`, color: st.color }}
                    >
                      {st.label}
                    </span>
                    <span className="text-muted">{idea.category}</span>
                  </div>
                  <div className="font-semibold text-sm mt-2">{idea.title}</div>
                  {idea.summary && (
                    <p className="text-xs text-secondary mt-1 line-clamp-2">{idea.summary}</p>
                  )}
                  <div className="flex items-center justify-between gap-2 mt-2.5">
                    <div className="flex items-center gap-1 flex-wrap">
                      {idea.tags.slice(0, 3).map((t) => (
                        <span key={t} className="text-[10px] px-1.5 py-0.5 rounded bg-white/[0.06] text-secondary">
                          #{t}
                        </span>
                      ))}
                    </div>
                    {idea.ai_notes && (
                      <span className="text-[11px] text-indigo-400 inline-flex items-center gap-0.5 shrink-0">
                        <Sparkles className="w-3 h-3" /> AI
                      </span>
                    )}
                  </div>
                </button>
              );
            })
          )}
        </div>

        {/* Idea Editor + AI Co-pilot */}
        <div
          className={`lg:col-span-8 flex flex-col min-h-0 ${
            editing ? 'flex' : 'hidden lg:flex'
          }`}
        >
          {!editing ? (
            <div className="surface rounded-2xl flex-1 flex flex-col items-center justify-center p-10 text-center text-muted">
              <LayoutGrid className="w-8 h-8 mb-2 opacity-40" />
              <p className="text-sm">选择一条游戏灵感进行深化，或点击「捕获新灵感」。</p>
            </div>
          ) : (
            <div className="surface rounded-2xl p-4 sm:p-5 space-y-4 overflow-y-auto flex-1">
              {/* Top Actions */}
              <div className="flex items-center justify-between gap-2 pb-3 border-b border-subtle flex-wrap">
                <button
                  onClick={() => {
                    setEditing(null);
                    onSelectIdeaId(null);
                  }}
                  className="lg:hidden inline-flex items-center gap-1 text-xs text-secondary hover:text-primary"
                >
                  <ArrowLeft className="w-4 h-4" /> 返回列表
                </button>
                <div className="flex items-center gap-2 ml-auto flex-wrap">
                  <button
                    onClick={handleAutoTag}
                    disabled={aiAction !== null}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg surface-elevated hover:border-strong text-xs font-medium disabled:opacity-50"
                  >
                    {aiAction === 'tag' ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Tag className="w-3.5 h-3.5 text-sky-400" />
                    )}
                    AI 概括打标
                  </button>
                  <button
                    onClick={handleSave}
                    disabled={saving}
                    className="inline-flex items-center gap-1 px-3.5 py-1.5 rounded-lg bg-indigo-500 hover:bg-indigo-400 text-white text-xs font-medium"
                  >
                    {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                    保存
                  </button>
                  <button
                    onClick={() => handleDelete(editing.id)}
                    className="p-1.5 rounded-lg text-muted hover:text-rose-400 hover:bg-rose-500/10"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Title + Pitch */}
              <div className="space-y-2">
                <input
                  value={editing.title}
                  onChange={(e) => setEditing({ ...editing, title: e.target.value })}
                  placeholder="灵感标题..."
                  className="w-full text-xl font-bold bg-transparent focus:outline-none"
                />
                <input
                  value={editing.summary}
                  onChange={(e) => setEditing({ ...editing, summary: e.target.value })}
                  placeholder="一句话 Elevator Pitch：这个点子最抓人的地方是什么？"
                  className="w-full text-sm text-secondary bg-transparent border-b border-subtle pb-2 focus:outline-none focus:border-amber-400"
                />
              </div>

              {/* Meta Row */}
              <div className="grid grid-cols-3 gap-2.5 text-xs">
                <label className="surface-elevated rounded-xl px-2.5 py-2 flex flex-col gap-1">
                  <span className="text-[11px] text-muted">分类</span>
                  <select
                    value={editing.category}
                    onChange={(e) => setEditing({ ...editing, category: e.target.value })}
                    className="bg-transparent font-medium focus:outline-none"
                  >
                    {CATEGORIES.map((c) => (
                      <option key={c} value={c} className="bg-[#141720]">
                        {c}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="surface-elevated rounded-xl px-2.5 py-2 flex flex-col gap-1">
                  <span className="text-[11px] text-muted">孵化阶段</span>
                  <select
                    value={editing.status}
                    onChange={(e) => setEditing({ ...editing, status: e.target.value as IdeaStatus })}
                    className="bg-transparent font-medium focus:outline-none"
                  >
                    {Object.entries(STATUS_META).map(([k, v]) => (
                      <option key={k} value={k} className="bg-[#141720]">
                        {v.label}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="surface-elevated rounded-xl px-2.5 py-2 flex flex-col gap-1">
                  <span className="text-[11px] text-muted flex items-center gap-1">
                    <Flame className="w-3 h-3 text-amber-400" /> 优先级
                  </span>
                  <select
                    value={editing.priority}
                    onChange={(e) => setEditing({ ...editing, priority: Number(e.target.value) })}
                    className="bg-transparent font-medium focus:outline-none"
                  >
                    <option value={3} className="bg-[#141720]">P1 · 极高兴奋度</option>
                    <option value={2} className="bg-[#141720]">P2 · 值得深化</option>
                    <option value={1} className="bg-[#141720]">P3 · 备选储备</option>
                  </select>
                </label>
              </div>

              {/* Tags */}
              <div className="flex items-center gap-1.5 flex-wrap">
                {editing.tags.map((tag) => (
                  <span
                    key={tag}
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-amber-500/12 text-amber-300 text-xs"
                  >
                    #{tag}
                    <button
                      onClick={() =>
                        setEditing({ ...editing, tags: editing.tags.filter((t) => t !== tag) })
                      }
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                ))}
                <input
                  value={newTag}
                  onChange={(e) => setNewTag(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      addTag();
                    }
                  }}
                  placeholder="+ 标签回车"
                  className="text-xs px-2 py-1 rounded-lg bg-transparent border border-subtle focus:outline-none w-24"
                />
              </div>

              {/* Markdown Editor */}
              <MarkdownEditor
                value={editing.content}
                onChange={(content) => setEditing({ ...editing, content })}
                placeholder="记录玩法循环、操作手感、美术氛围、UE5 实现设想..."
                minHeight="210px"
              />

              {/* AI Co-pilot Panel */}
              <div className="rounded-2xl border border-indigo-500/30 bg-indigo-500/[0.05] p-4 space-y-3">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div className="text-xs font-semibold text-indigo-400 flex items-center gap-1.5">
                    <Sparkles className="w-4 h-4" /> 游戏灵感 AI 主策划陪跑
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <button
                      disabled={aiAction !== null}
                      onClick={() => handleAiAssist('expand')}
                      className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-indigo-500 hover:bg-indigo-400 text-white text-xs font-medium transition disabled:opacity-50"
                    >
                      {aiAction === 'expand' ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Wand2 className="w-3.5 h-3.5" />
                      )}
                      扩写玩法与 MVP
                    </button>
                    <button
                      disabled={aiAction !== null}
                      onClick={() => handleAiAssist('critique')}
                      className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-rose-500/15 hover:bg-rose-500/25 text-rose-300 border border-rose-500/25 text-xs font-medium transition disabled:opacity-50"
                    >
                      {aiAction === 'critique' ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Target className="w-3.5 h-3.5" />
                      )}
                      犀利挑刺找漏洞
                    </button>
                    <button
                      disabled={aiAction !== null}
                      onClick={() => handleAiAssist('crosslink')}
                      className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 border border-amber-500/25 text-xs font-medium transition disabled:opacity-50"
                    >
                      {aiAction === 'crosslink' ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <GitMerge className="w-3.5 h-3.5" />
                      )}
                      碰撞历史灵感
                    </button>
                  </div>
                </div>

                <input
                  value={customAiPrompt}
                  onChange={(e) => setCustomAiPrompt(e.target.value)}
                  placeholder="可选补充要求，例如：偏向魂类节奏、控制在单人 UE5 两周可做完的体量..."
                  className="w-full px-3 py-2 rounded-xl bg-[var(--bg-surface)] border border-subtle text-xs focus:outline-none focus:border-indigo-500"
                />

                {editing.ai_notes && (
                  <div className="pt-3 border-t border-subtle max-h-[420px] overflow-y-auto pr-1">
                    <MarkdownView content={editing.ai_notes} />
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
