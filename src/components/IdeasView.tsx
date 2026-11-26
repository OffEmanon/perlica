import { useEffect, useState } from 'react';
import {
  ArrowLeft,
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
          onToast('已保存并整理');
        } catch (aiErr) {
          onToast(
            `原文已保存，整理失败：${aiErr instanceof Error ? aiErr.message : '请检查模型配置'}`,
            'err'
          );
        }
      } else {
        onToast('已保存');
      }
      onRefresh();
      onSelectIdeaId(finalIdea.id);
      setEditing(finalIdea);
      setIsDirty(false);
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
      await api.updateIdea(editing.id, {
        title: editing.title.trim() || deriveShortTitle(editing.content),
        content: editing.content,
        tags: editing.tags,
      });
      const updated = await api.organizeIdea(editing.id);
      setEditing(updated);
      setIsDirty(false);
      onRefresh();
      onToast('整理完成');
    } catch (e) {
      onToast(e instanceof Error ? e.message : '整理失败', 'err');
    } finally {
      setOrganizing(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('确定删除这条灵感吗？')) return;
    await api.deleteIdea(id);
    if (editing?.id === id) {
      setEditing(null);
      setIsDirty(false);
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
    <div className="lg:h-full flex flex-col gap-4 max-w-5xl mx-auto min-w-0">
      <h1 className="text-xl font-semibold tracking-tight">游戏灵感</h1>

      {/* Flat Quick Composer */}
      <div className={`surface rounded-xl p-4 space-y-3 ${editing ? 'hidden lg:block' : 'block'}`}>
        <textarea
          rows={3}
          value={quickDraft}
          onChange={(e) => setQuickDraft(e.target.value)}
          placeholder="写下游戏灵感..."
          className="w-full bg-transparent text-sm leading-relaxed placeholder:text-muted focus:outline-none resize-none"
        />
        <div className="flex items-center justify-end gap-2 pt-3 border-t border-subtle">
          <button
            onClick={() => handleQuickCreate(false)}
            disabled={creating !== null || !quickDraft.trim()}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg surface-elevated hover:border-strong text-xs font-medium text-secondary hover:text-primary transition-colors duration-100 disabled:opacity-40"
          >
            {creating === 'save' && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            保存
          </button>
          <button
            onClick={() => handleQuickCreate(true)}
            disabled={creating !== null || !quickDraft.trim()}
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg btn-primary text-xs font-medium transition-colors duration-100 disabled:opacity-40"
          >
            {creating === 'ai' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
            保存并整理
          </button>
        </div>
      </div>

      {/* Main Split View */}
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
              placeholder="搜索灵感..."
              className="w-full pl-9 pr-3 py-2 rounded-lg surface text-sm focus:outline-none focus:border-strong"
            />
          </div>

          <div className="space-y-2 lg:overflow-y-auto lg:pr-1 flex-1">
            {filtered.length === 0 ? (
              <div className="surface rounded-xl p-8 text-center text-sm text-muted">
                暂无灵感
              </div>
            ) : (
              filtered.map((idea) => {
                const selected = editing?.id === idea.id;
                return (
                  <button
                    key={idea.id}
                    onClick={() => {
                      setEditing({ ...idea });
                      setIsDirty(false);
                      onSelectIdeaId(idea.id);
                    }}
                    className={`w-full text-left p-3.5 rounded-xl border card-interactive ${
                      selected
                        ? 'bg-[var(--bg-elevated)] border-strong'
                        : 'surface hover:border-strong'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium text-sm line-clamp-1">{idea.title}</span>
                      <span className="text-xs text-muted tabular-nums shrink-0">
                        {idea.created_at.slice(5, 10)}
                      </span>
                    </div>
                    <p className="text-xs text-secondary mt-1.5 line-clamp-2 leading-relaxed">
                      {idea.content}
                    </p>
                    {idea.tags.length > 0 && (
                      <div className="flex items-center gap-1.5 flex-wrap mt-2">
                        {idea.tags.slice(0, 4).map((t) => (
                          <span
                            key={t}
                            className="text-xs px-1.5 py-0.5 rounded-md bg-[var(--bg-elevated)] text-muted"
                          >
                            #{t}
                          </span>
                        ))}
                      </div>
                    )}
                  </button>
                );
              })
            )}
          </div>
        </div>

        {/* Flat Single-Layer Detail View */}
        <div
          className={`lg:col-span-7 flex flex-col lg:min-h-0 ${
            editing ? 'flex' : 'hidden lg:flex'
          }`}
        >
          {!editing ? (
            <div className="surface rounded-xl flex-1 flex items-center justify-center p-10 text-sm text-muted">
              选择左侧灵感查看详情
            </div>
          ) : (
            <div key={editing.id} className="surface rounded-xl p-5 space-y-5 lg:overflow-y-auto flex-1 anim-view">
              {/* Top Actions */}
              <div className="flex items-center justify-between gap-2 pb-3 border-b border-subtle">
                <button
                  onClick={() => {
                    setEditing(null);
                    setIsDirty(false);
                    onSelectIdeaId(null);
                  }}
                  className="lg:hidden inline-flex items-center gap-1 text-xs text-secondary hover:text-primary"
                >
                  <ArrowLeft className="w-4 h-4" /> 返回
                </button>
                <div className="flex items-center gap-2 ml-auto">
                  <button
                    onClick={handleOrganize}
                    disabled={organizing}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg surface-elevated hover:border-strong text-xs font-medium text-secondary hover:text-primary transition-colors duration-100 disabled:opacity-40"
                  >
                    {organizing ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Sparkles className="w-3.5 h-3.5" />
                    )}
                    {editing.ai_notes ? '重新整理' : 'AI 整理'}
                  </button>
                  <button
                    onClick={handleSave}
                    disabled={saving}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg btn-primary text-xs font-medium transition-colors duration-100"
                  >
                    {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                    保存
                  </button>
                  <button
                    onClick={() => handleDelete(editing.id)}
                    title="删除"
                    className="p-1.5 rounded-lg text-muted hover:text-rose-500 transition-colors duration-100"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Title & Tags */}
              <div className="space-y-3">
                <input
                  value={editing.title}
                  onChange={(e) => updateEditing({ ...editing, title: e.target.value })}
                  placeholder="标题"
                  className="w-full text-base font-semibold bg-transparent focus:outline-none"
                />

                <div className="flex items-center gap-1.5 flex-wrap">
                  {editing.tags.map((tag) => (
                    <span
                      key={tag}
                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-[var(--bg-elevated)] text-secondary text-xs"
                    >
                      #{tag}
                      <button
                        onClick={() =>
                          updateEditing({ ...editing, tags: editing.tags.filter((t) => t !== tag) })
                        }
                        className="text-muted hover:text-primary"
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
                    className="text-xs px-2 py-0.5 rounded-md bg-transparent border border-subtle focus:outline-none focus:border-strong w-20"
                  />
                </div>
              </div>

              {/* Section 1: Raw Original Inspiration */}
              <div className="pt-4 border-t border-subtle space-y-2">
                <div className="text-xs font-medium text-muted">原文</div>
                <textarea
                  rows={4}
                  value={editing.content}
                  onChange={(e) => updateEditing({ ...editing, content: e.target.value })}
                  placeholder="写下游戏灵感..."
                  className="w-full bg-transparent text-sm leading-relaxed text-primary focus:outline-none resize-y"
                />
              </div>

              {/* Section 2: Faithful AI Organized Version */}
              <div className="pt-4 border-t border-subtle space-y-3">
                <div className="text-xs font-medium text-muted">整理</div>
                {editing.ai_notes ? (
                  <MarkdownView content={editing.ai_notes} />
                ) : (
                  <button
                    onClick={handleOrganize}
                    disabled={organizing}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg surface-elevated hover:border-strong text-xs font-medium text-secondary hover:text-primary disabled:opacity-40"
                  >
                    {organizing ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Sparkles className="w-3.5 h-3.5" />
                    )}
                    AI 整理
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
