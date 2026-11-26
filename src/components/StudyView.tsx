import { useEffect, useState } from 'react';
import {
  ArrowLeft,
  Calendar,
  Loader2,
  Save,
  Search,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';
import type { StudyLog, StudyModule } from '../types.ts';
import { api, todayDateString } from '../api.ts';
import { MarkdownView } from './MarkdownView.tsx';

interface StudyViewProps {
  modules: StudyModule[];
  logs: StudyLog[];
  activeModuleId: string;
  selectedLogId: string | null;
  onSelectModule: (id: string) => void;
  onSelectLogId: (id: string | null) => void;
  onRefresh: () => void;
  onToast: (msg: string, type?: 'ok' | 'err') => void;
}

function deriveShortTitle(raw: string): string {
  const firstLine = raw.trim().split(/\r?\n/)[0] || '未命名学习记录';
  return firstLine.length > 22 ? `${firstLine.slice(0, 22)}...` : firstLine;
}

export function StudyView({
  modules,
  logs,
  activeModuleId,
  selectedLogId,
  onSelectModule,
  onSelectLogId,
  onRefresh,
  onToast,
}: StudyViewProps) {
  const [quickDraft, setQuickDraft] = useState('');
  const [draftDate, setDraftDate] = useState(todayDateString());
  const [creating, setCreating] = useState<'save' | 'ai' | null>(null);

  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<StudyLog | null>(null);
  const [isDirty, setIsDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [organizing, setOrganizing] = useState(false);
  const [newTag, setNewTag] = useState('');

  const moduleMap = new Map(modules.map((m) => [m.id, m]));
  const visibleCategories = modules.filter((m) => (m.log_count ?? 0) > 0);

  const updateEditing = (next: StudyLog) => {
    setEditing(next);
    setIsDirty(true);
  };

  useEffect(() => {
    if (
      activeModuleId !== 'all' &&
      !visibleCategories.some((c) => c.id === activeModuleId)
    ) {
      onSelectModule('all');
    }
  }, [activeModuleId, visibleCategories, onSelectModule]);

  useEffect(() => {
    if (!selectedLogId) return;
    const found = logs.find((l) => l.id === selectedLogId);
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
  }, [selectedLogId, logs, isDirty]);

  const filteredLogs = logs.filter((l) => {
    if (activeModuleId && activeModuleId !== 'all' && l.module_id !== activeModuleId) return false;
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      const catName = moduleMap.get(l.module_id)?.name.toLowerCase() || '';
      return (
        l.title.toLowerCase().includes(q) ||
        l.content.toLowerCase().includes(q) ||
        l.ai_feedback.toLowerCase().includes(q) ||
        catName.includes(q) ||
        l.tags.some((t) => t.toLowerCase().includes(q))
      );
    }
    return true;
  });

  const handleQuickCreate = async (withAi: boolean) => {
    const raw = quickDraft.trim();
    if (!raw) return;

    setCreating(withAi ? 'ai' : 'save');
    try {
      const created = await api.createLog({
        log_date: draftDate || todayDateString(),
        title: deriveShortTitle(raw),
        content: raw,
        tasks: [],
        duration_minutes: 0,
        rating: 0,
        tags: [],
      });
      setQuickDraft('');
      let finalLog = created;
      if (withAi) {
        try {
          finalLog = await api.organizeLog(created.id);
          onToast('已自动分类并整理');
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
      onSelectLogId(finalLog.id);
      setEditing(finalLog);
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
      const updated = await api.updateLog(editing.id, {
        module_id: editing.module_id,
        log_date: editing.log_date,
        title: editing.title.trim() || deriveShortTitle(editing.content),
        content: editing.content,
        tags: editing.tags,
        ai_feedback: editing.ai_feedback,
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
      await api.updateLog(editing.id, {
        module_id: editing.module_id,
        log_date: editing.log_date,
        title: editing.title.trim() || deriveShortTitle(editing.content),
        content: editing.content,
        tags: editing.tags,
      });
      const updated = await api.organizeLog(editing.id);
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
    if (!confirm('确定删除这条学习记录吗？')) return;
    await api.deleteLog(id);
    if (editing?.id === id) {
      setEditing(null);
      setIsDirty(false);
      onSelectLogId(null);
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

  const editingCategory = editing ? moduleMap.get(editing.module_id) : null;

  return (
    <div className="lg:h-full flex flex-col gap-4 max-w-5xl mx-auto min-w-0">
      <h1 className="text-xl font-semibold tracking-tight">学习日志</h1>

      {/* Flat Daily Composer */}
      <div className={`surface rounded-xl p-4 space-y-3 ${editing ? 'hidden lg:block' : 'block'}`}>
        <textarea
          rows={3}
          value={quickDraft}
          onChange={(e) => setQuickDraft(e.target.value)}
          placeholder="写下今天学了什么..."
          className="w-full bg-transparent text-sm leading-relaxed placeholder:text-muted focus:outline-none resize-none"
        />

        <div className="flex items-center justify-between gap-2 pt-3 border-t border-subtle flex-wrap">
          <label className="inline-flex items-center gap-1.5 text-xs text-secondary">
            <Calendar className="w-3.5 h-3.5 text-muted" />
            <input
              type="date"
              value={draftDate}
              onChange={(e) => setDraftDate(e.target.value)}
              className="bg-transparent text-secondary focus:outline-none text-xs"
            />
          </label>

          <div className="flex items-center gap-2 ml-auto">
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
              {creating === 'ai' ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Sparkles className="w-3.5 h-3.5" />
              )}
              保存并整理
            </button>
          </div>
        </div>
      </div>

      {/* Auto-Category Filter Row */}
      {visibleCategories.length > 0 && (
        <div className={`flex items-center gap-1.5 overflow-x-auto pb-0.5 max-w-full ${editing ? 'hidden lg:flex' : 'flex'}`}>
          <button
            onClick={() => onSelectModule('all')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors duration-100 shrink-0 ${
              activeModuleId === 'all'
                ? 'btn-primary'
                : 'surface text-secondary hover:text-primary'
            }`}
          >
            全部 {logs.length}
          </button>
          {visibleCategories.map((cat) => {
            const active = activeModuleId === cat.id;
            return (
              <button
                key={cat.id}
                onClick={() => onSelectModule(cat.id)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors duration-100 flex items-center gap-1.5 shrink-0 ${
                  active
                    ? 'btn-primary'
                    : 'surface text-secondary hover:text-primary'
                }`}
              >
                <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: cat.color }} />
                <span>{cat.name}</span>
                <span className="opacity-65 tabular-nums">{cat.log_count ?? 0}</span>
              </button>
            );
          })}
        </div>
      )}

      {/* Main Split View */}
      <div className="flex flex-col lg:grid lg:grid-cols-12 gap-4 lg:flex-1 lg:min-h-0">
        {/* Log List */}
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
              placeholder="搜索记录..."
              className="w-full pl-9 pr-3 py-2 rounded-lg surface text-sm focus:outline-none focus:border-strong"
            />
          </div>

          <div className="space-y-2 lg:overflow-y-auto lg:pr-1 flex-1">
            {filteredLogs.length === 0 ? (
              <div className="surface rounded-xl p-8 text-center text-sm text-muted">
                暂无学习记录
              </div>
            ) : (
              filteredLogs.map((log) => {
                const cat = moduleMap.get(log.module_id);
                const selected = editing?.id === log.id;
                return (
                  <button
                    key={log.id}
                    onClick={() => {
                      setEditing({ ...log });
                      setIsDirty(false);
                      onSelectLogId(log.id);
                    }}
                    className={`w-full text-left p-3.5 rounded-xl border card-interactive ${
                      selected
                        ? 'bg-[var(--bg-elevated)] border-strong'
                        : 'surface hover:border-strong'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2 text-xs text-muted">
                      {cat ? (
                        <span className="inline-flex items-center gap-1.5 text-secondary">
                          <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: cat.color }} />
                          {cat.name}
                        </span>
                      ) : (
                        <span />
                      )}
                      <span className="tabular-nums shrink-0">{log.log_date}</span>
                    </div>

                    <div className="font-medium text-sm mt-1.5 line-clamp-1">{log.title}</div>

                    {log.content && (
                      <p className="text-xs text-secondary mt-1 line-clamp-2 leading-relaxed">
                        {log.content}
                      </p>
                    )}

                    {log.tags.length > 0 && (
                      <div className="flex items-center gap-1.5 flex-wrap mt-2">
                        {log.tags.slice(0, 4).map((t) => (
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

        {/* Flat Single-Layer Detail View (whitespace + hairline dividers, zero nested cards) */}
        <div
          className={`lg:col-span-7 flex flex-col lg:min-h-0 ${
            editing ? 'flex' : 'hidden lg:flex'
          }`}
        >
          {!editing ? (
            <div className="surface rounded-xl flex-1 flex items-center justify-center p-10 text-sm text-muted">
              选择左侧记录查看详情
            </div>
          ) : (
            <div key={editing.id} className="surface rounded-xl p-5 space-y-5 lg:overflow-y-auto flex-1 anim-view">
              {/* Action Bar */}
              <div className="flex items-center justify-between gap-2 pb-3 border-b border-subtle">
                <button
                  onClick={() => {
                    setEditing(null);
                    setIsDirty(false);
                    onSelectLogId(null);
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
                    {editing.ai_feedback ? '重新整理' : 'AI 整理'}
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

              {/* Title & Meta */}
              <div className="space-y-3">
                <input
                  value={editing.title}
                  onChange={(e) => updateEditing({ ...editing, title: e.target.value })}
                  placeholder="标题"
                  className="w-full text-base font-semibold bg-transparent focus:outline-none"
                />

                <div className="flex items-center gap-2 flex-wrap text-xs">
                  {visibleCategories.length > 1 ? (
                    <select
                      value={editing.module_id}
                      onChange={(e) => updateEditing({ ...editing, module_id: e.target.value })}
                      className="px-2 py-1 rounded-md surface-elevated text-secondary focus:outline-none"
                    >
                      {visibleCategories.map((c) => (
                        <option key={c.id} value={c.id} className="bg-[var(--bg-surface)] text-[var(--text-primary)]">
                          {c.name}
                        </option>
                      ))}
                    </select>
                  ) : (
                    editingCategory && (
                      <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md bg-[var(--bg-elevated)] text-secondary">
                        <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: editingCategory.color }} />
                        {editingCategory.name}
                      </span>
                    )
                  )}

                  <input
                    type="date"
                    value={editing.log_date}
                    onChange={(e) => updateEditing({ ...editing, log_date: e.target.value })}
                    className="px-2 py-1 rounded-md surface-elevated text-secondary focus:outline-none tabular-nums"
                  />

                  {editing.tags.map((tag) => (
                    <span
                      key={tag}
                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-[var(--bg-elevated)] text-secondary"
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

              {/* Section 1: Raw Original Note (flat, no nested card) */}
              <div className="pt-4 border-t border-subtle space-y-2">
                <div className="text-xs font-medium text-muted">原文</div>
                <textarea
                  rows={4}
                  value={editing.content}
                  onChange={(e) => updateEditing({ ...editing, content: e.target.value })}
                  placeholder="写下今天学了什么..."
                  className="w-full bg-transparent text-sm leading-relaxed text-primary focus:outline-none resize-y"
                />
              </div>

              {/* Section 2: AI Organized Notes (flat, no nested card) */}
              <div className="pt-4 border-t border-subtle space-y-3">
                <div className="text-xs font-medium text-muted">整理</div>
                {editing.ai_feedback ? (
                  <MarkdownView content={editing.ai_feedback} />
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
