import { useEffect, useState } from 'react';
import {
  ArrowLeft,
  Gamepad2,
  Loader2,
  Save,
  Search,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';
import type { GameIdea } from '../types.ts';
import { api } from '../api.ts';
import { MarkdownView } from './MarkdownView.tsx';

interface IdeasViewProps {
  ideas: GameIdea[];
  selectedIdeaId: string | null;
  onSelectIdeaId: (id: string | null) => void;
  onRefresh: () => void;
  onToast: (msg: string, type?: 'ok' | 'err') => void;
}

function deriveShortTitle(raw: string): string {
  const firstLine = raw.trim().split(/\r?\n/)[0] || '未命名灵感';
  return firstLine.length > 22 ? `${firstLine.slice(0, 22)}...` : firstLine;
}

export function IdeasView({
  ideas,
  selectedIdeaId,
  onSelectIdeaId,
  onRefresh,
  onToast,
}: IdeasViewProps) {
  const [quickDraft, setQuickDraft] = useState('');
  const [creating, setCreating] = useState<'save' | 'ai' | null>(null);
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<GameIdea | null>(null);
  const [isDirty, setIsDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [organizing, setOrganizing] = useState(false);
  const [newTag, setNewTag] = useState('');

  const updateEditing = (next: GameIdea) => {
    setEditing(next);
    setIsDirty(true);
  };

  useEffect(() => {
    if (!selectedIdeaId) return;
    const found = ideas.find((i) => i.id === selectedIdeaId);
    if (!found) return;
    setEditing((cur) => {
      if (!cur || cur.id !== found.id) {
        setIsDirty(false);
        return { ...found };
      }
      if (!isDirty && cur.updated_at !== found.updated_at) {
        return { ...found };
      }
      return cur;
    });
  }, [selectedIdeaId, ideas, isDirty]);

  const filtered = ideas.filter((i) => {
    if (!search.trim()) return true;
    const q = search.trim().toLowerCase();
    return (
      i.title.toLowerCase().includes(q) ||
      i.content.toLowerCase().includes(q) ||
      i.ai_notes.toLowerCase().includes(q) ||
      i.tags.some((t) => t.toLowerCase().includes(q))
    );
  });

  const handleQuickCreate = async (withAi: boolean) => {
    const raw = quickDraft.trim();
    if (!raw) return;
    setCreating(withAi ? 'ai' : 'save');
    try {
      const created = await api.createIdea({
        title: deriveShortTitle(raw),
        content: raw,
        summary: '',
        category: '玩法机制',
        status: 'spark',
        priority: 2,
        tags: [],
      });
      setQuickDraft('');
      let finalIdea = created;
      if (withAi) {
        try {
          finalIdea = await api.organizeIdea(created.id);
          onToast('已保留原文并由 AI 整理完成');
        } catch (aiErr) {
          onToast(
            `原始灵感已保存，但 AI 整理失败：${aiErr instanceof Error ? aiErr.message : '请检查模型配置'}`,
            'err'
          );
        }
      } else {
        onToast('原始灵感已保存');
      }
      onRefresh();
      onSelectIdeaId(finalIdea.id);
      setEditing(finalIdea);
    } catch (e) {
      onToast(e instanceof Error ? e.message : '保存失败', 'err');
    } finally {
      setCreating(null);
    }
  };

  const handleSave = async () => {
    if (!editing) return;
    setSaving(true);
    try {
      const updated = await api.updateIdea(editing.id, {
        title: editing.title.trim() || deriveShortTitle(editing.content),
        content: editing.content,
        tags: editing.tags,
        ai_notes: editing.ai_notes,
      });
      setEditing(updated);
      setIsDirty(false);
      onRefresh();
      onToast('已保存');
    } catch (e) {
      onToast(e instanceof Error ? e.message : '保存失败', 'err');
    } finally {
      setSaving(false);
    }
  };

  const handleOrganize = async () => {
    if (!editing) return;
    setOrganizing(true);
    try {
      // Save latest original text first so AI organizes the current draft
      await api.updateIdea(editing.id, {
        title: editing.title.trim() || deriveShortTitle(editing.content),
        content: editing.content,
        tags: editing.tags,
      });
      const updated = await api.organizeIdea(editing.id);
      setEditing(updated);
      setIsDirty(false);
      onRefresh();
      onToast('AI 已忠实整理完成（原文已完整保留）');
    } catch (e) {
      onToast(e instanceof Error ? e.message : 'AI 整理失败', 'err');
    } finally {
      setOrganizing(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('确定删除这条灵感吗？')) return;
    await api.deleteIdea(id);
    if (editing?.id === id) {
      setEditing(null);
      onSelectIdeaId(null);
    }
    onRefresh();
    onToast('已删除');
  };

  const addTag = () => {
    if (!editing || !newTag.trim()) return;
    const t = newTag.trim();
    if (!editing.tags.includes(t)) {
      updateEditing({ ...editing, tags: [...editing.tags, t] });
    }
    setNewTag('');
  };

  return (
    <div className="lg:h-full flex flex-col gap-4 max-w-6xl mx-auto min-w-0">
      {/* Minimal Header */}
      <div>
        <h1 className="text-xl font-bold flex items-center gap-2">
          <Gamepad2 className="w-5 h-5 text-amber-400" /> 游戏灵感
        </h1>
        <p className="text-xs text-muted mt-0.5">
          随手写下你的原始想法，AI 帮你梳理条理、提炼标题与标签，原汁原味保留原文不添油加醋
        </p>
      </div>

      {/* Ultra-Simple Quick Capture Box (hidden on mobile while viewing detail) */}
      <div className={`surface rounded-2xl p-3.5 sm:p-4 space-y-3 ${editing ? 'hidden lg:block' : 'block'}`}>
        <textarea
          rows={3}
          value={quickDraft}
          onChange={(e) => setQuickDraft(e.target.value)}
          placeholder="随手写一段你的游戏灵感（想到什么写什么，不用起标题也不用管格式）..."
          className="w-full bg-transparent text-sm leading-relaxed placeholder:text-muted focus:outline-none resize-none"
        />
        <div className="flex items-center justify-between gap-2 pt-2 border-t border-subtle flex-wrap">
          <span className="text-[11px] text-muted">
            原文永久保留，AI 整理仅做结构化梳理
          </span>
          <div className="flex items-center gap-2 ml-auto">
            <button
              onClick={() => handleQuickCreate(false)}
              disabled={creating !== null || !quickDraft.trim()}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl surface-elevated hover:border-strong text-xs font-medium transition disabled:opacity-40"
            >
              {creating === 'save' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
              仅保存原文
            </button>
            <button
              onClick={() => handleQuickCreate(true)}
              disabled={creating !== null || !quickDraft.trim()}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-indigo-500 hover:bg-indigo-400 text-white text-xs font-semibold transition disabled:opacity-40"
            >
              {creating === 'ai' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
              保存并 AI 整理
            </button>
          </div>
        </div>
      </div>

      {/* Main Split View: Clean List + Clean Detail */}
      <div className="flex flex-col lg:grid lg:grid-cols-12 gap-4 lg:flex-1 lg:min-h-0">
        {/* Idea List */}
        <div
          className={`lg:col-span-5 flex flex-col gap-2.5 lg:min-h-0 ${
            editing ? 'hidden lg:flex' : 'flex'
          }`}
        >
          <div className="relative">
            <Search className="w-4 h-4 text-muted absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="搜索灵感关键词或标签..."
              className="w-full pl-9 pr-3 py-2 rounded-xl surface text-xs focus:outline-none focus:border-indigo-500"
            />
          </div>

          <div className="space-y-2 lg:overflow-y-auto lg:pr-1 flex-1">
            {filtered.length === 0 ? (
              <div className="surface rounded-2xl p-8 text-center text-xs text-muted">
                还没有灵感记录，在上方输入框随手记第一段话吧。
              </div>
            ) : (
              filtered.map((idea) => {
                const selected = editing?.id === idea.id;
                return (
                  <button
                    key={idea.id}
                    onClick={() => {
                      setEditing({ ...idea });
                      onSelectIdeaId(idea.id);
                    }}
                    className={`w-full text-left p-3.5 rounded-2xl border transition ${
                      selected
                        ? 'bg-indigo-500/10 border-indigo-500/40'
                        : 'surface hover:border-strong'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-semibold text-sm line-clamp-1">{idea.title}</span>
                      <span className="text-[10px] text-muted shrink-0">
                        {idea.created_at.slice(5, 10)}
                      </span>
                    </div>
                    <p className="text-xs text-secondary mt-1.5 line-clamp-2 leading-relaxed">
                      {idea.content}
                    </p>
                    <div className="flex items-center justify-between gap-2 mt-2.5">
                      <div className="flex items-center gap-1 flex-wrap">
                        {idea.tags.slice(0, 4).map((t) => (
                          <span
                            key={t}
                            className="text-[10px] px-1.5 py-0.5 rounded bg-white/[0.06] text-secondary"
                          >
                            #{t}
                          </span>
                        ))}
                      </div>
                      {idea.ai_notes && (
                        <span className="text-[10px] text-indigo-400 inline-flex items-center gap-0.5 shrink-0">
                          <Sparkles className="w-3 h-3" /> 已整理
                        </span>
                      )}
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>

        {/* Clean Two-Section Detail View: Original + AI Organized */}
        <div
          className={`lg:col-span-7 flex flex-col lg:min-h-0 ${
            editing ? 'flex' : 'hidden lg:flex'
          }`}
        >
          {!editing ? (
            <div className="surface rounded-2xl flex-1 flex flex-col items-center justify-center p-10 text-center text-muted">
              <Sparkles className="w-7 h-7 mb-2 opacity-35" />
              <p className="text-sm">点击左侧任意灵感查看原文与 AI 整理版</p>
            </div>
          ) : (
            <div className="surface rounded-2xl p-4 sm:p-5 space-y-4 lg:overflow-y-auto flex-1">
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
                <div className="flex items-center gap-2 ml-auto">
                  <button
                    onClick={handleOrganize}
                    disabled={organizing}
                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-indigo-500/15 hover:bg-indigo-500/25 text-indigo-300 border border-indigo-500/30 text-xs font-medium transition disabled:opacity-50"
                  >
                    {organizing ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Sparkles className="w-3.5 h-3.5" />
                    )}
                    {editing.ai_notes ? 'AI 重新整理' : 'AI 忠实整理'}
                  </button>
                  <button
                    onClick={handleSave}
                    disabled={saving}
                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-indigo-500 hover:bg-indigo-400 text-white text-xs font-medium transition"
                  >
                    {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                    保存
                  </button>
                  <button
                    onClick={() => handleDelete(editing.id)}
                    title="删除"
                    className="p-1.5 rounded-lg text-muted hover:text-rose-400 hover:bg-rose-500/10"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Editable Title */}
              <input
                value={editing.title}
                onChange={(e) => updateEditing({ ...editing, title: e.target.value })}
                placeholder="灵感标题..."
                className="w-full text-lg font-bold bg-transparent focus:outline-none"
              />

              {/* Compact Tags */}
              <div className="flex items-center gap-1.5 flex-wrap">
                {editing.tags.map((tag) => (
                  <span
                    key={tag}
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-indigo-500/12 text-indigo-300 text-xs"
                  >
                    #{tag}
                    <button
                      onClick={() =>
                        updateEditing({ ...editing, tags: editing.tags.filter((t) => t !== tag) })
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
                  placeholder="+ 标签"
                  className="text-xs px-2 py-0.5 rounded-lg bg-transparent border border-subtle focus:outline-none w-20"
                />
              </div>

              {/* Section 1: Raw Original Inspiration (NEVER overwritten by AI) */}
              <div className="rounded-2xl surface-elevated p-3.5 space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-amber-400">我的原始灵感</span>
                  <span className="text-[11px] text-muted">完整保留原文，AI 绝不改写</span>
                </div>
                <textarea
                  rows={5}
                  value={editing.content}
                  onChange={(e) => updateEditing({ ...editing, content: e.target.value })}
                  placeholder="在这里写下你的原始想法..."
                  className="w-full bg-transparent text-sm leading-relaxed text-primary focus:outline-none resize-y"
                />
              </div>

              {/* Section 2: Faithful AI Organized Version */}
              <div className="rounded-2xl border border-indigo-500/25 bg-indigo-500/[0.04] p-4 space-y-2.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-indigo-400 flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5" /> AI 整理版
                  </span>
                  <span className="text-[11px] text-muted">仅梳理结构，不添油加醋</span>
                </div>
                {editing.ai_notes ? (
                  <MarkdownView content={editing.ai_notes} />
                ) : (
                  <div className="py-4 text-center space-y-2">
                    <p className="text-xs text-muted">
                      还没有整理，点击按钮让 AI 把上面的原文梳理成清晰要点。
                    </p>
                    <button
                      onClick={handleOrganize}
                      disabled={organizing}
                      className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-indigo-500 hover:bg-indigo-400 text-white text-xs font-medium transition disabled:opacity-50"
                    >
                      {organizing ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Sparkles className="w-3.5 h-3.5" />
                      )}
                      AI 整理这段灵感
                    </button>
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
