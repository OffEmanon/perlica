import { useEffect, useState } from 'react';
import {
  ArrowLeft,
  BookOpen,
  Calendar,
  Edit3,
  FolderPlus,
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

const PRESET_ICONS = ['🎮', '∫', '🧠', '⚙️', '🎨', '📐', '💻', '📚', '🔬', '🎵', '🚀', '🧩'];
const PRESET_COLORS = ['#6366f1', '#0ea5e9', '#10b981', '#f59e0b', '#ec4899', '#8b5cf6', '#ef4444', '#14b8a6'];

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
  // Quick daily write composer state
  const [quickDraft, setQuickDraft] = useState('');
  const [draftDate, setDraftDate] = useState(todayDateString());
  const [draftModuleId, setDraftModuleId] = useState('');
  const [creating, setCreating] = useState<'save' | 'ai' | null>(null);

  // List & detail state
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<StudyLog | null>(null);
  const [isDirty, setIsDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [organizing, setOrganizing] = useState(false);
  const [newTag, setNewTag] = useState('');

  // Minimal module modal (name + icon + color only)
  const [moduleModal, setModuleModal] = useState<{ open: boolean; editing: StudyModule | null }>({
    open: false,
    editing: null,
  });
  const [modForm, setModForm] = useState({
    name: '',
    icon: '📘',
    color: '#6366f1',
  });

  const moduleMap = new Map(modules.map((m) => [m.id, m]));

  const updateEditing = (next: StudyLog) => {
    setEditing(next);
    setIsDirty(true);
  };

  // Keep draftModuleId synced with activeModuleId or first module
  useEffect(() => {
    if (activeModuleId && activeModuleId !== 'all' && activeModuleId !== '__new__') {
      setDraftModuleId(activeModuleId);
    } else if (modules.length > 0 && !modules.some((m) => m.id === draftModuleId)) {
      setDraftModuleId(modules[0].id);
    } else if (modules.length === 0) {
      setDraftModuleId('');
    }
  }, [activeModuleId, modules, draftModuleId]);

  useEffect(() => {
    if (activeModuleId === '__new__') {
      setModForm({ name: '', icon: '📘', color: '#6366f1' });
      setModuleModal({ open: true, editing: null });
      onSelectModule('all');
    }
  }, [activeModuleId, onSelectModule]);

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
      return (
        l.title.toLowerCase().includes(q) ||
        l.content.toLowerCase().includes(q) ||
        l.ai_feedback.toLowerCase().includes(q) ||
        l.tags.some((t) => t.toLowerCase().includes(q))
      );
    }
    return true;
  });

  const handleQuickCreate = async (withAi: boolean) => {
    const raw = quickDraft.trim();
    if (!raw) return;
    const targetModId = draftModuleId || modules[0]?.id;
    if (!targetModId) {
      onToast('请先创建一个学习板块', 'err');
      openCreateModule();
      return;
    }

    setCreating(withAi ? 'ai' : 'save');
    try {
      const created = await api.createLog({
        module_id: targetModId,
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
          onToast('已保留原始记录，AI 整理归纳完成');
        } catch (aiErr) {
          onToast(
            `原始记录已保存，但 AI 整理失败：${aiErr instanceof Error ? aiErr.message : '请检查模型配置'}`,
            'err'
          );
        }
      } else {
        onToast('学习记录已保存');
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
      onToast('AI 整理归纳完成（原文已完整保留）');
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

  // Module modal handlers
  const openCreateModule = () => {
    setModForm({ name: '', icon: '📘', color: '#6366f1' });
    setModuleModal({ open: true, editing: null });
  };

  const openEditModule = (mod: StudyModule) => {
    setModForm({
      name: mod.name,
      icon: mod.icon,
      color: mod.color,
    });
    setModuleModal({ open: true, editing: mod });
  };

  const saveModule = async () => {
    if (!modForm.name.trim()) return;
    try {
      if (moduleModal.editing) {
        await api.updateModule(moduleModal.editing.id, modForm);
        onToast('板块已更新');
      } else {
        const created = await api.createModule(modForm);
        onSelectModule(created.id);
        setDraftModuleId(created.id);
        onToast('新板块已创建');
      }
      setModuleModal({ open: false, editing: null });
      onRefresh();
    } catch (e) {
      onToast(e instanceof Error ? e.message : '操作失败', 'err');
    }
  };

  const deleteModule = async (mod: StudyModule) => {
    if (!confirm(`确定删除板块「${mod.name}」吗？该板块下的学习记录也会一并删除。`)) return;
    await api.deleteModule(mod.id);
    if (activeModuleId === mod.id) onSelectModule('all');
    if (editing?.module_id === mod.id) {
      setEditing(null);
      onSelectLogId(null);
    }
    setModuleModal({ open: false, editing: null });
    onRefresh();
    onToast('板块已删除');
  };

  return (
    <div className="lg:h-full flex flex-col gap-4 max-w-6xl mx-auto min-w-0">
      {/* Minimal Header */}
      <div>
        <h1 className="text-xl font-bold flex items-center gap-2">
          <BookOpen className="w-5 h-5 text-indigo-400" /> 学习日志
        </h1>
        <p className="text-xs text-muted mt-0.5">
          每天随手写下学了什么，AI 自动整理归纳要点、提炼标题与标签，保留原始记录
        </p>
      </div>

      {/* Top Module Filter Strip */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1 max-w-full">
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
        {modules.map((m) => (
          <div key={m.id} className="inline-flex items-center shrink-0">
            <button
              onClick={() => onSelectModule(m.id)}
              className={`px-3 py-1.5 rounded-l-xl text-xs font-medium whitespace-nowrap transition flex items-center gap-1.5 border ${
                activeModuleId === m.id
                  ? 'text-white border-transparent'
                  : 'surface text-secondary hover:text-primary'
              }`}
              style={activeModuleId === m.id ? { backgroundColor: m.color } : undefined}
            >
              <span>{m.icon}</span>
              <span>{m.name}</span>
              <span className="opacity-70 text-[11px]">({m.log_count ?? 0})</span>
            </button>
            <button
              title="编辑板块"
              onClick={() => openEditModule(m)}
              className="px-1.5 py-1.5 rounded-r-xl surface border-l-0 text-muted hover:text-primary transition"
            >
              <Edit3 className="w-3 h-3" />
            </button>
          </div>
        ))}
        <button
          onClick={openCreateModule}
          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl border border-dashed border-strong text-xs text-secondary hover:text-primary hover:border-indigo-400 whitespace-nowrap transition shrink-0"
        >
          <FolderPlus className="w-3.5 h-3.5" /> 新建板块
        </button>
      </div>

      {/* Ultra-Simple Daily Study Composer (hidden on mobile while viewing detail) */}
      <div className={`surface rounded-2xl p-3.5 sm:p-4 space-y-3 ${editing ? 'hidden lg:block' : 'block'}`}>
        {modules.length === 0 ? (
          <div className="py-3 text-center space-y-2.5">
            <p className="text-xs text-secondary">先建一个学习板块（比如 虚幻引擎 UE5、数学分析），就可以开始每天记录了。</p>
            <button
              onClick={openCreateModule}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-indigo-500 hover:bg-indigo-400 text-white text-xs font-semibold transition"
            >
              <FolderPlus className="w-3.5 h-3.5" /> 创建第一个学习板块
            </button>
          </div>
        ) : (
          <>
            {/* Compact Module + Date Row */}
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div className="flex items-center gap-1.5 flex-wrap">
                {modules.map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => setDraftModuleId(m.id)}
                    className={`px-2.5 py-1 rounded-lg text-xs font-medium border transition ${
                      draftModuleId === m.id
                        ? 'text-white border-transparent'
                        : 'surface-elevated text-secondary hover:text-primary'
                    }`}
                    style={draftModuleId === m.id ? { backgroundColor: m.color } : undefined}
                  >
                    {m.icon} {m.name}
                  </button>
                ))}
              </div>
              <label className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg surface-elevated text-xs text-secondary shrink-0">
                <Calendar className="w-3.5 h-3.5 text-muted" />
                <input
                  type="date"
                  value={draftDate}
                  onChange={(e) => setDraftDate(e.target.value)}
                  className="bg-transparent text-primary focus:outline-none text-xs"
                />
              </label>
            </div>

            <textarea
              rows={3}
              value={quickDraft}
              onChange={(e) => setQuickDraft(e.target.value)}
              placeholder="今天学了什么？随手写下学到的知识点、公式、代码或踩过的坑（不用起标题也不用管排版）..."
              className="w-full bg-transparent text-sm leading-relaxed placeholder:text-muted focus:outline-none resize-none"
            />

            <div className="flex items-center justify-between gap-2 pt-2 border-t border-subtle flex-wrap">
              <span className="text-[11px] text-muted">
                保留原始记录，AI 自动整理归纳（支持 LaTeX 公式与代码高亮）
              </span>
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
                  保存并 AI 整理归纳
                </button>
              </div>
            </div>
          </>
        )}
      </div>

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
              placeholder="搜索学习记录、AI归纳或标签..."
              className="w-full pl-9 pr-3 py-2 rounded-xl surface text-xs focus:outline-none focus:border-indigo-500"
            />
          </div>

          <div className="space-y-2 lg:overflow-y-auto lg:pr-1 flex-1">
            {filteredLogs.length === 0 ? (
              <div className="surface rounded-2xl p-8 text-center text-xs text-muted">
                还没有学习记录，在上方输入框写下今天学了什么吧。
              </div>
            ) : (
              filteredLogs.map((log) => {
                const mod = moduleMap.get(log.module_id);
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
                        {mod && (
                          <span
                            className="px-1.5 py-0.5 rounded font-medium"
                            style={{ backgroundColor: `${mod.color}20`, color: mod.color }}
                          >
                            {mod.icon} {mod.name}
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
                    {editing.ai_feedback ? 'AI 重新整理' : 'AI 整理归纳'}
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

              {/* Compact Inline Meta: Module + Date + Tags */}
              <div className="flex items-center gap-2 flex-wrap text-xs">
                <select
                  value={editing.module_id}
                  onChange={(e) => updateEditing({ ...editing, module_id: e.target.value })}
                  className="px-2.5 py-1 rounded-lg surface-elevated text-primary font-medium focus:outline-none"
                >
                  {modules.map((m) => (
                    <option key={m.id} value={m.id} className="bg-[#141720] text-white">
                      {m.icon} {m.name}
                    </option>
                  ))}
                </select>

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
                  <span className="text-[11px] text-muted">忠于原文 · 支持公式与代码高亮</span>
                </div>
                {editing.ai_feedback ? (
                  <MarkdownView content={editing.ai_feedback} />
                ) : (
                  <div className="py-4 text-center space-y-2">
                    <p className="text-xs text-muted">
                      还没有整理，点击按钮让 AI 把今天学的内容归纳成清晰的复习笔记。
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
                      AI 整理归纳这条记录
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Minimal Create / Edit Module Modal */}
      {moduleModal.open && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="surface rounded-2xl w-full max-w-sm p-5 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold">
                {moduleModal.editing ? '编辑学习板块' : '新建学习板块'}
              </h3>
              <button
                onClick={() => setModuleModal({ open: false, editing: null })}
                className="text-muted hover:text-primary"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3.5 text-sm">
              <div>
                <label className="text-xs text-muted block mb-1">板块名称 *</label>
                <input
                  autoFocus
                  value={modForm.name}
                  onChange={(e) => setModForm({ ...modForm, name: e.target.value })}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') saveModule();
                  }}
                  placeholder="例如：虚幻引擎 UE5、数学分析"
                  className="w-full px-3 py-2 rounded-xl surface-elevated focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="text-xs text-muted block mb-1">图标</label>
                <div className="flex items-center gap-1.5 flex-wrap">
                  {PRESET_ICONS.map((ic) => (
                    <button
                      key={ic}
                      type="button"
                      onClick={() => setModForm({ ...modForm, icon: ic })}
                      className={`w-8 h-8 rounded-lg flex items-center justify-center text-base border transition ${
                        modForm.icon === ic ? 'border-indigo-400 bg-indigo-500/20' : 'border-subtle surface-elevated'
                      }`}
                    >
                      {ic}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-xs text-muted block mb-1">主题色</label>
                <div className="flex items-center gap-2 flex-wrap">
                  {PRESET_COLORS.map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setModForm({ ...modForm, color: c })}
                      className={`w-6 h-6 rounded-full transition ${
                        modForm.color === c ? 'ring-2 ring-white ring-offset-2 ring-offset-[#141720]' : ''
                      }`}
                      style={{ backgroundColor: c }}
                    />
                  ))}
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between pt-2">
              {moduleModal.editing ? (
                <button
                  onClick={() => deleteModule(moduleModal.editing!)}
                  className="text-xs text-rose-400 hover:underline"
                >
                  删除该板块
                </button>
              ) : (
                <span />
              )}
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setModuleModal({ open: false, editing: null })}
                  className="px-3.5 py-2 rounded-xl surface-elevated text-xs font-medium"
                >
                  取消
                </button>
                <button
                  onClick={saveModule}
                  disabled={!modForm.name.trim()}
                  className="px-4 py-2 rounded-xl bg-indigo-500 hover:bg-indigo-400 text-white text-xs font-medium disabled:opacity-40"
                >
                  保存
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
