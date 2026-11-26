import { useEffect, useState } from 'react';
import {
  ArrowLeft,
  BookOpen,
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
  // Ultra-simple daily write composer
  const [quickDraft, setQuickDraft] = useState('');
  const [draftDate, setDraftDate] = useState(todayDateString());
  const [creating, setCreating] = useState<'save' | 'ai' | null>(null);

  // List & detail state
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<StudyLog | null>(null);
  const [isDirty, setIsDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [organizing, setOrganizing] = useState(false);
  const [newTag, setNewTag] = useState('');

  const moduleMap = new Map(modules.map((m) => [m.id, m]));
  // Only show auto-generated categories that actually contain logs
  const visibleCategories = modules.filter((m) => (m.log_count ?? 0) > 0);

  const updateEditing = (next: StudyLog) => {
    setEditing(next);
    setIsDirty(true);
  };

  // Reset filter to 'all' if selected category no longer has logs
  useEffect(() => {
    if (
      activeModuleId !== 'all' &&
      visibleCategories.length > 0 &&
      !visibleCategories.some((c) => c.id === activeModuleId)
    ) {
      onSelectModule('all');
    } else if (activeModuleId !== 'all' && visibleCategories.length === 0) {
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
          onToast('已保留原文，AI 自动分类并整理完成');
        } catch (aiErr) {
          onToast(
            `原始记录已保存，但 AI 分类整理失败：${aiErr instanceof Error ? aiErr.message : '请检查模型配置'}`,
            'err'
          );
        }
      } else {
        onToast('原始记录已保存');
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
      onToast('AI 自动分类与整理完成（原文已保留）');
    } catch (e) {
      onToast(e instanceof Error ? e.message : 'AI 整理失败', 'err');
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
    <div className="lg:h-full flex flex-col gap-4 max-w-6xl mx-auto min-w-0">
      {/* Minimal Header */}
      <div>
        <h1 className="text-xl font-bold flex items-center gap-2">
          <BookOpen className="w-5 h-5 text-indigo-400" /> 学习日志
        </h1>
        <p className="text-xs text-muted mt-0.5">
          直接写下今天学了什么，AI 自动为你分类、整理归纳要点与标签，原汁原味保留原始记录
        </p>
      </div>

      {/* Zero-Setup Daily Write Box (always ready to type; hidden on mobile while viewing detail) */}
      <div className={`surface rounded-2xl p-3.5 sm:p-4 space-y-3 ${editing ? 'hidden lg:block' : 'block'}`}>
        <textarea
          rows={3}
          value={quickDraft}
          onChange={(e) => setQuickDraft(e.target.value)}
          placeholder="今天学了什么？随手写下学到的知识点、公式、代码或踩过的坑（不用选分类、不用起标题，AI 会自动帮你归类整理）..."
          className="w-full bg-transparent text-sm leading-relaxed placeholder:text-muted focus:outline-none resize-none"
        />

        <div className="flex items-center justify-between gap-2 pt-2 border-t border-subtle flex-wrap">
          <div className="flex items-center gap-2 flex-wrap">
            <label className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg surface-elevated text-xs text-secondary shrink-0">
              <Calendar className="w-3.5 h-3.5 text-muted" />
              <input
                type="date"
                value={draftDate}
                onChange={(e) => setDraftDate(e.target.value)}
                className="bg-transparent text-primary focus:outline-none text-xs"
              />
            </label>
            <span className="text-[11px] text-muted hidden sm:inline">
              AI 根据内容自动分类并整理（支持 LaTeX 与代码高亮）
            </span>
          </div>

          <div className="flex items-center gap-2 ml-auto">
            <button
              onClick={() => handleQuickCreate(false)}
              disabled={creating !== null || !quickDraft.trim()}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl surface-elevated hover:border-strong text-xs font-medium transition disabled:opacity-40"
            >
              {creating === 'save' ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Save className="w-3.5 h-3.5" />
              )}
              仅保存原文
            </button>
            <button
              onClick={() => handleQuickCreate(true)}
              disabled={creating !== null || !quickDraft.trim()}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-indigo-500 hover:bg-indigo-400 text-white text-xs font-semibold transition disabled:opacity-40"
            >
              {creating === 'ai' ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Sparkles className="w-3.5 h-3.5" />
              )}
              保存并 AI 自动分类整理
            </button>
          </div>
        </div>
      </div>

      {/* Auto-Generated Category Filter Strip (appears automatically once logs exist) */}
      {visibleCategories.length > 0 && (
        <div className={`flex items-center gap-1.5 overflow-x-auto pb-1 max-w-full ${editing ? 'hidden lg:flex' : 'flex'}`}>
          <button
            onClick={() => onSelectModule('all')}
            className={`px-3 py-1.5 rounded-xl text-xs font-medium whitespace-nowrap transition shrink-0 ${
              activeModuleId === 'all'
                ? 'bg-indigo-500 text-white'
                : 'surface text-secondary hover:text-primary'
            }`}
          >
            全部 ({logs.length})
          </button>
          {visibleCategories.map((cat) => (
            <button
              key={cat.id}
              onClick={() => onSelectModule(cat.id)}
              className={`px-3 py-1.5 rounded-xl text-xs font-medium whitespace-nowrap transition flex items-center gap-1.5 border shrink-0 ${
                activeModuleId === cat.id
                  ? 'text-white border-transparent'
                  : 'surface text-secondary hover:text-primary'
              }`}
              style={activeModuleId === cat.id ? { backgroundColor: cat.color } : undefined}
            >
              <span>{cat.icon}</span>
              <span>{cat.name}</span>
              <span className="opacity-70 text-[11px]">({cat.log_count ?? 0})</span>
            </button>
          ))}
        </div>
      )}

      {/* Main Split View: Clean List + Clean Two-Section Detail */}
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
              placeholder="搜索学习记录、分类、AI归纳或标签..."
              className="w-full pl-9 pr-3 py-2 rounded-xl surface text-xs focus:outline-none focus:border-indigo-500"
            />
          </div>

          <div className="space-y-2 lg:overflow-y-auto lg:pr-1 flex-1">
            {filteredLogs.length === 0 ? (
              <div className="surface rounded-2xl p-8 text-center text-xs text-muted">
                还没有学习记录，在上方输入框随手写下今天学了什么吧。
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
                    className={`w-full text-left p-3.5 rounded-2xl border transition ${
                      selected
                        ? 'bg-indigo-500/10 border-indigo-500/40'
                        : 'surface hover:border-strong'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2 text-[11px] text-muted">
                      <span>
                        {cat && (
                          <span
                            className="px-1.5 py-0.5 rounded font-medium"
                            style={{ backgroundColor: `${cat.color}20`, color: cat.color }}
                          >
                            {cat.icon} {cat.name}
                          </span>
                        )}
                      </span>
                      <span className="shrink-0">{log.log_date}</span>
                    </div>

                    <div className="font-semibold text-sm mt-1.5 line-clamp-1">{log.title}</div>

                    {log.content && (
                      <p className="text-xs text-secondary mt-1 line-clamp-2 leading-relaxed">
                        {log.content}
                      </p>
                    )}

                    <div className="flex items-center justify-between gap-2 mt-2.5">
                      <div className="flex items-center gap-1 flex-wrap">
                        {log.tags.slice(0, 4).map((t) => (
                          <span
                            key={t}
                            className="text-[10px] px-1.5 py-0.5 rounded bg-white/[0.06] text-secondary"
                          >
                            #{t}
                          </span>
                        ))}
                      </div>
                      {log.ai_feedback && (
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
              <p className="text-sm">点击左侧任意记录查看原始笔记与 AI 整理归纳</p>
            </div>
          ) : (
            <div className="surface rounded-2xl p-4 sm:p-5 space-y-4 lg:overflow-y-auto flex-1">
              {/* Top Actions */}
              <div className="flex items-center justify-between gap-2 pb-3 border-b border-subtle flex-wrap">
                <button
                  onClick={() => {
                    setEditing(null);
                    setIsDirty(false);
                    onSelectLogId(null);
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
                    {editing.ai_feedback ? 'AI 重新分类整理' : 'AI 自动分类整理'}
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
                placeholder="学习主题..."
                className="w-full text-lg font-bold bg-transparent focus:outline-none"
              />

              {/* Compact Inline Meta: Auto Category + Date + Tags */}
              <div className="flex items-center gap-2 flex-wrap text-xs">
                {visibleCategories.length > 1 ? (
                  <select
                    value={editing.module_id}
                    onChange={(e) => updateEditing({ ...editing, module_id: e.target.value })}
                    title="AI 自动分类（可微调）"
                    className="px-2.5 py-1 rounded-lg surface-elevated text-primary font-medium focus:outline-none"
                  >
                    {visibleCategories.map((c) => (
                      <option key={c.id} value={c.id} className="bg-[#141720] text-white">
                        {c.icon} {c.name}
                      </option>
                    ))}
                  </select>
                ) : (
                  editingCategory && (
                    <span
                      className="px-2.5 py-1 rounded-lg font-medium"
                      style={{ backgroundColor: `${editingCategory.color}20`, color: editingCategory.color }}
                    >
                      {editingCategory.icon} {editingCategory.name}
                    </span>
                  )
                )}

                <input
                  type="date"
                  value={editing.log_date}
                  onChange={(e) => updateEditing({ ...editing, log_date: e.target.value })}
                  className="px-2.5 py-1 rounded-lg surface-elevated text-secondary focus:outline-none"
                />

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

              {/* Section 1: Raw Daily Study Note (NEVER overwritten by AI) */}
              <div className="rounded-2xl surface-elevated p-3.5 space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-sky-400">我的原始记录</span>
                  <span className="text-[11px] text-muted">完整保留原文，AI 绝不覆盖</span>
                </div>
                <textarea
                  rows={5}
                  value={editing.content}
                  onChange={(e) => updateEditing({ ...editing, content: e.target.value })}
                  placeholder="在这里写下你今天学了什么..."
                  className="w-full bg-transparent text-sm leading-relaxed text-primary focus:outline-none resize-y"
                />
              </div>

              {/* Section 2: AI Organized Study Summary */}
              <div className="rounded-2xl border border-indigo-500/25 bg-indigo-500/[0.04] p-4 space-y-2.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-indigo-400 flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5" /> AI 整理归纳
                  </span>
                  <span className="text-[11px] text-muted">自动分类 · 忠于原文 · 支持公式与代码高亮</span>
                </div>
                {editing.ai_feedback ? (
                  <MarkdownView content={editing.ai_feedback} />
                ) : (
                  <div className="py-4 text-center space-y-2">
                    <p className="text-xs text-muted">
                      还没有整理，点击按钮让 AI 自动分类并归纳成清晰的复习笔记。
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
                      AI 自动分类并整理
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
