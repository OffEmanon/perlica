import { useEffect, useState } from 'react';
import {
  ArrowLeft,
  Calendar,
  CheckCircle2,
  Circle,
  Clock,
  Edit3,
  FolderPlus,
  Loader2,
  Plus,
  Save,
  Search,
  Sparkles,
  Star,
  Tag,
  Trash2,
  X,
} from 'lucide-react';
import type { StudyLog, StudyModule, StudyTask } from '../types.ts';
import { api, todayDateString } from '../api.ts';
import { MarkdownEditor } from './MarkdownEditor.tsx';
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
  const [search, setSearch] = useState('');
  const [editingLog, setEditingLog] = useState<StudyLog | null>(null);
  const [saving, setSaving] = useState(false);
  const [aiBusy, setAiBusy] = useState<'eval' | 'tag' | null>(null);
  const [newTaskText, setNewTaskText] = useState('');
  const [newTagText, setNewTagText] = useState('');

  // Module modal
  const [moduleModal, setModuleModal] = useState<{ open: boolean; editing: StudyModule | null }>({
    open: false,
    editing: null,
  });
  const [modForm, setModForm] = useState({
    name: '',
    icon: '🎮',
    color: '#6366f1',
    description: '',
    goal: '',
  });

  const moduleMap = new Map(modules.map((m) => [m.id, m]));

  const filteredLogs = logs.filter((l) => {
    if (activeModuleId && activeModuleId !== 'all' && l.module_id !== activeModuleId) return false;
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      return (
        l.title.toLowerCase().includes(q) ||
        l.content.toLowerCase().includes(q) ||
        l.tags.some((t) => t.toLowerCase().includes(q))
      );
    }
    return true;
  });

  useEffect(() => {
    if (activeModuleId === '__new__') {
      setModForm({ name: '', icon: '📘', color: '#6366f1', description: '', goal: '' });
      setModuleModal({ open: true, editing: null });
      onSelectModule('all');
    }
  }, [activeModuleId, onSelectModule]);

  useEffect(() => {
    if (selectedLogId) {
      const found = logs.find((l) => l.id === selectedLogId);
      if (found) setEditingLog({ ...found });
    }
  }, [selectedLogId, logs]);

  const startNewLog = async (preferredModId?: string) => {
    const targetModId =
      preferredModId || (activeModuleId !== 'all' ? activeModuleId : modules[0]?.id || '');
    if (!targetModId) {
      onToast('请先创建一个学习板块', 'err');
      return;
    }
    try {
      const created = await api.createLog({
        module_id: targetModId,
        log_date: todayDateString(),
        title: `${moduleMap.get(targetModId)?.name || '学习'} · ${todayDateString()} 日程`,
        content: '',
        tasks: [],
        duration_minutes: 45,
        rating: 4,
        tags: [],
      });
      onRefresh();
      onSelectLogId(created.id);
      setEditingLog(created);
      onToast('已创建新学习日程');
    } catch (e) {
      onToast(e instanceof Error ? e.message : '创建失败', 'err');
    }
  };

  const handleSaveLog = async () => {
    if (!editingLog) return;
    setSaving(true);
    try {
      const updated = await api.updateLog(editingLog.id, editingLog);
      setEditingLog(updated);
      onRefresh();
      onToast('学习日志已保存');
    } catch (e) {
      onToast(e instanceof Error ? e.message : '保存失败', 'err');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteLog = async (id: string) => {
    if (!confirm('确定删除这条学习日志吗？')) return;
    await api.deleteLog(id);
    if (editingLog?.id === id) {
      setEditingLog(null);
      onSelectLogId(null);
    }
    onRefresh();
    onToast('已删除学习日志');
  };

  const addTask = () => {
    if (!editingLog || !newTaskText.trim()) return;
    const nextTask: StudyTask = {
      id: `t_${Date.now()}`,
      text: newTaskText.trim(),
      done: false,
    };
    setEditingLog({ ...editingLog, tasks: [...editingLog.tasks, nextTask] });
    setNewTaskText('');
  };

  const toggleTask = (id: string) => {
    if (!editingLog) return;
    setEditingLog({
      ...editingLog,
      tasks: editingLog.tasks.map((t) => (t.id === id ? { ...t, done: !t.done } : t)),
    });
  };

  const removeTask = (id: string) => {
    if (!editingLog) return;
    setEditingLog({
      ...editingLog,
      tasks: editingLog.tasks.filter((t) => t.id !== id),
    });
  };

  const addTag = () => {
    if (!editingLog || !newTagText.trim()) return;
    const tag = newTagText.trim();
    if (!editingLog.tags.includes(tag)) {
      setEditingLog({ ...editingLog, tags: [...editingLog.tags, tag] });
    }
    setNewTagText('');
  };

  const handleAutoTag = async () => {
    if (!editingLog) return;
    setAiBusy('tag');
    try {
      const res = await api.autoTag({
        title: editingLog.title,
        content: editingLog.content,
        kind: 'study',
      });
      const merged = Array.from(new Set([...editingLog.tags, ...res.tags]));
      setEditingLog({ ...editingLog, tags: merged });
      onToast(`AI 已提取 ${res.tags.length} 个标签`);
    } catch (e) {
      onToast(e instanceof Error ? e.message : 'AI 打标失败', 'err');
    } finally {
      setAiBusy(null);
    }
  };

  const handleEvaluateLog = async () => {
    if (!editingLog) return;
    setAiBusy('eval');
    try {
      await api.updateLog(editingLog.id, editingLog);
      const updated = await api.evaluateLog(editingLog.id);
      setEditingLog(updated);
      onRefresh();
      onToast('AI 单篇深度点评已生成');
    } catch (e) {
      onToast(e instanceof Error ? e.message : 'AI 点评失败', 'err');
    } finally {
      setAiBusy(null);
    }
  };

  // Module modal handlers
  const openCreateModule = () => {
    setModForm({ name: '', icon: '📘', color: '#6366f1', description: '', goal: '' });
    setModuleModal({ open: true, editing: null });
  };

  const openEditModule = (mod: StudyModule) => {
    setModForm({
      name: mod.name,
      icon: mod.icon,
      color: mod.color,
      description: mod.description,
      goal: mod.goal,
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
        onToast('新板块已创建');
      }
      setModuleModal({ open: false, editing: null });
      onRefresh();
    } catch (e) {
      onToast(e instanceof Error ? e.message : '操作失败', 'err');
    }
  };

  const deleteModule = async (mod: StudyModule) => {
    if (!confirm(`确定删除板块「${mod.name}」吗？该板块下的学习日志也会一并删除。`)) return;
    await api.deleteModule(mod.id);
    if (activeModuleId === mod.id) onSelectModule('all');
    setModuleModal({ open: false, editing: null });
    onRefresh();
    onToast('板块已删除');
  };

  const activeModObj = activeModuleId !== 'all' ? moduleMap.get(activeModuleId) : null;

  return (
    <div className="h-full flex flex-col gap-4 max-w-7xl mx-auto">
      {/* Top Module Filter Strip */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 max-w-full">
          <button
            onClick={() => onSelectModule('all')}
            className={`px-3 py-1.5 rounded-xl text-xs font-medium whitespace-nowrap transition ${
              activeModuleId === 'all'
                ? 'bg-indigo-500 text-white'
                : 'surface text-secondary hover:text-primary'
            }`}
          >
            全部板块 ({logs.length})
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

        <button
          onClick={() => startNewLog()}
          className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-indigo-500 hover:bg-indigo-400 text-white text-xs sm:text-sm font-medium transition shrink-0"
        >
          <Plus className="w-4 h-4" /> 新建日程日志
        </button>
      </div>

      {/* Active Module Banner */}
      {activeModObj && (
        <div
          className="rounded-2xl p-3.5 border flex flex-col sm:flex-row sm:items-center justify-between gap-2"
          style={{
            backgroundColor: `${activeModObj.color}12`,
            borderColor: `${activeModObj.color}30`,
          }}
        >
          <div>
            <div className="flex items-center gap-2 font-semibold text-sm">
              <span className="text-base">{activeModObj.icon}</span>
              <span>{activeModObj.name}</span>
              {activeModObj.description && (
                <span className="text-xs font-normal text-secondary hidden sm:inline">
                  — {activeModObj.description}
                </span>
              )}
            </div>
            {activeModObj.goal && (
              <p className="text-xs text-secondary mt-1">🎯 长期目标：{activeModObj.goal}</p>
            )}
          </div>
          <div className="text-xs text-secondary shrink-0">
            累计投入 <strong className="text-primary">{activeModObj.total_minutes ?? 0}</strong> 分钟
          </div>
        </div>
      )}

      {/* Split Layout: List + Editor */}
      <div className="grid lg:grid-cols-12 gap-4 flex-1 min-h-0">
        {/* List Pane */}
        <div
          className={`lg:col-span-4 flex flex-col gap-3 min-h-0 ${
            editingLog ? 'hidden lg:flex' : 'flex'
          }`}
        >
          <div className="relative">
            <Search className="w-4 h-4 text-muted absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="搜索标题、笔记或标签..."
              className="w-full pl-9 pr-3 py-2 rounded-xl surface text-sm focus:outline-none focus:border-indigo-500"
            />
          </div>

          <div className="space-y-2 overflow-y-auto pr-1 flex-1">
            {filteredLogs.length === 0 ? (
              <div className="surface rounded-2xl p-6 text-center text-sm text-muted">
                暂无匹配的学习日志，点击右上角「新建日程日志」开始记录。
              </div>
            ) : (
              filteredLogs.map((log) => {
                const mod = moduleMap.get(log.module_id);
                const selected = editingLog?.id === log.id;
                const doneTasks = log.tasks.filter((t) => t.done).length;
                return (
                  <button
                    key={log.id}
                    onClick={() => {
                      setEditingLog({ ...log });
                      onSelectLogId(log.id);
                    }}
                    className={`w-full text-left p-3.5 rounded-2xl border transition ${
                      selected
                        ? 'bg-indigo-500/10 border-indigo-500/40'
                        : 'surface hover:border-strong'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2 text-[11px] text-muted">
                      <span className="flex items-center gap-1.5">
                        {mod && (
                          <span
                            className="px-1.5 py-0.5 rounded font-medium"
                            style={{ backgroundColor: `${mod.color}20`, color: mod.color }}
                          >
                            {mod.icon} {mod.name}
                          </span>
                        )}
                      </span>
                      <span>{log.log_date}</span>
                    </div>
                    <div className="font-semibold text-sm mt-1.5 line-clamp-1">{log.title}</div>
                    <div className="flex items-center gap-3 text-[11px] text-secondary mt-2">
                      <span className="inline-flex items-center gap-1">
                        <Clock className="w-3 h-3" /> {log.duration_minutes}m
                      </span>
                      {log.tasks.length > 0 && (
                        <span>
                          任务 {doneTasks}/{log.tasks.length}
                        </span>
                      )}
                      {log.ai_feedback && (
                        <span className="text-indigo-400 inline-flex items-center gap-0.5">
                          <Sparkles className="w-3 h-3" /> 已点评
                        </span>
                      )}
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>

        {/* Detail / Editor Pane */}
        <div
          className={`lg:col-span-8 flex flex-col min-h-0 ${
            editingLog ? 'flex' : 'hidden lg:flex'
          }`}
        >
          {!editingLog ? (
            <div className="surface rounded-2xl flex-1 flex flex-col items-center justify-center p-10 text-center text-muted">
              <p className="text-sm">从左侧选择一篇学习日志，或点击新建开始记录。</p>
              <p className="text-xs mt-1">支持 Markdown、C++/Python 代码高亮与 LaTeX 数学公式。</p>
            </div>
          ) : (
            <div className="surface rounded-2xl p-4 sm:p-5 space-y-4 overflow-y-auto flex-1">
              {/* Top Action Bar */}
              <div className="flex items-center justify-between gap-2 pb-3 border-b border-subtle flex-wrap">
                <button
                  onClick={() => {
                    setEditingLog(null);
                    onSelectLogId(null);
                  }}
                  className="lg:hidden inline-flex items-center gap-1 text-xs text-secondary hover:text-primary"
                >
                  <ArrowLeft className="w-4 h-4" /> 返回列表
                </button>
                <div className="flex items-center gap-2 ml-auto flex-wrap">
                  <button
                    onClick={handleAutoTag}
                    disabled={aiBusy !== null}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg surface-elevated hover:border-strong text-xs font-medium transition disabled:opacity-50"
                  >
                    {aiBusy === 'tag' ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Tag className="w-3.5 h-3.5 text-sky-400" />
                    )}
                    AI 智能打标
                  </button>
                  <button
                    onClick={handleEvaluateLog}
                    disabled={aiBusy !== null}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-indigo-500/12 hover:bg-indigo-500/20 text-indigo-400 border border-indigo-500/25 text-xs font-medium transition disabled:opacity-50"
                  >
                    {aiBusy === 'eval' ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Sparkles className="w-3.5 h-3.5" />
                    )}
                    AI 深度点评
                  </button>
                  <button
                    onClick={handleSaveLog}
                    disabled={saving}
                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-indigo-500 hover:bg-indigo-400 text-white text-xs font-medium transition"
                  >
                    {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                    保存
                  </button>
                  <button
                    onClick={() => handleDeleteLog(editingLog.id)}
                    title="删除日志"
                    className="p-1.5 rounded-lg text-muted hover:text-rose-400 hover:bg-rose-500/10 transition"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Title */}
              <input
                value={editingLog.title}
                onChange={(e) => setEditingLog({ ...editingLog, title: e.target.value })}
                placeholder="输入今日学习主题..."
                className="w-full text-xl font-bold bg-transparent focus:outline-none placeholder:text-muted"
              />

              {/* Meta Controls */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-xs">
                <label className="surface-elevated rounded-xl px-2.5 py-2 flex flex-col gap-1">
                  <span className="text-[11px] text-muted">所属板块</span>
                  <select
                    value={editingLog.module_id}
                    onChange={(e) => setEditingLog({ ...editingLog, module_id: e.target.value })}
                    className="bg-transparent text-primary font-medium focus:outline-none"
                  >
                    {modules.map((m) => (
                      <option key={m.id} value={m.id} className="bg-[#141720] text-white">
                        {m.icon} {m.name}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="surface-elevated rounded-xl px-2.5 py-2 flex flex-col gap-1">
                  <span className="text-[11px] text-muted flex items-center gap-1">
                    <Calendar className="w-3 h-3" /> 日期
                  </span>
                  <input
                    type="date"
                    value={editingLog.log_date}
                    onChange={(e) => setEditingLog({ ...editingLog, log_date: e.target.value })}
                    className="bg-transparent text-primary font-medium focus:outline-none"
                  />
                </label>

                <label className="surface-elevated rounded-xl px-2.5 py-2 flex flex-col gap-1">
                  <span className="text-[11px] text-muted flex items-center gap-1">
                    <Clock className="w-3 h-3" /> 时长（分钟）
                  </span>
                  <input
                    type="number"
                    min={0}
                    step={5}
                    value={editingLog.duration_minutes}
                    onChange={(e) =>
                      setEditingLog({ ...editingLog, duration_minutes: Number(e.target.value) || 0 })
                    }
                    className="bg-transparent text-primary font-medium focus:outline-none"
                  />
                </label>

                <div className="surface-elevated rounded-xl px-2.5 py-2 flex flex-col gap-1">
                  <span className="text-[11px] text-muted">掌握度自评</span>
                  <div className="flex items-center gap-1">
                    {[1, 2, 3, 4, 5].map((n) => (
                      <button
                        key={n}
                        type="button"
                        onClick={() => setEditingLog({ ...editingLog, rating: n })}
                        className="p-0.5"
                      >
                        <Star
                          className={`w-3.5 h-3.5 ${
                            n <= editingLog.rating ? 'fill-amber-400 text-amber-400' : 'text-muted'
                          }`}
                        />
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Tags */}
              <div className="flex items-center gap-1.5 flex-wrap">
                {editingLog.tags.map((tag) => (
                  <span
                    key={tag}
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-indigo-500/12 text-indigo-300 text-xs"
                  >
                    #{tag}
                    <button
                      onClick={() =>
                        setEditingLog({
                          ...editingLog,
                          tags: editingLog.tags.filter((t) => t !== tag),
                        })
                      }
                      className="hover:text-white"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                ))}
                <input
                  value={newTagText}
                  onChange={(e) => setNewTagText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      addTag();
                    }
                  }}
                  placeholder="+ 添加标签回车"
                  className="text-xs px-2 py-1 rounded-lg bg-transparent border border-subtle focus:outline-none focus:border-indigo-500 w-28"
                />
              </div>

              {/* Tasks Checklist */}
              <div className="surface-elevated rounded-xl p-3 space-y-2">
                <div className="text-xs font-semibold text-secondary">每日学习任务清单</div>
                {editingLog.tasks.map((task) => (
                  <div key={task.id} className="flex items-center gap-2 group">
                    <button onClick={() => toggleTask(task.id)} className="shrink-0">
                      {task.done ? (
                        <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                      ) : (
                        <Circle className="w-4 h-4 text-muted" />
                      )}
                    </button>
                    <span className={`text-sm flex-1 ${task.done ? 'line-through text-muted' : ''}`}>
                      {task.text}
                    </span>
                    <button
                      onClick={() => removeTask(task.id)}
                      className="opacity-0 group-hover:opacity-100 text-muted hover:text-rose-400 p-1 transition"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
                <div className="flex items-center gap-2 pt-1">
                  <input
                    value={newTaskText}
                    onChange={(e) => setNewTaskText(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        addTask();
                      }
                    }}
                    placeholder="添加今日学习小目标，按回车确认..."
                    className="flex-1 text-xs px-2.5 py-1.5 rounded-lg bg-[var(--bg-surface)] border border-subtle focus:outline-none focus:border-indigo-500"
                  />
                  <button
                    onClick={addTask}
                    className="px-2.5 py-1.5 rounded-lg bg-indigo-500/15 text-indigo-400 text-xs font-medium hover:bg-indigo-500/25"
                  >
                    添加
                  </button>
                </div>
              </div>

              {/* Markdown + LaTeX Editor */}
              <MarkdownEditor
                value={editingLog.content}
                onChange={(content) => setEditingLog({ ...editingLog, content })}
                minHeight="240px"
              />

              {/* AI Feedback Card */}
              {editingLog.ai_feedback && (
                <div className="rounded-2xl border border-indigo-500/30 bg-indigo-500/[0.06] p-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-indigo-400 flex items-center gap-1.5">
                      <Sparkles className="w-3.5 h-3.5" /> AI 导师深度点评
                    </span>
                  </div>
                  <MarkdownView content={editingLog.ai_feedback} />
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Create / Edit Module Modal */}
      {moduleModal.open && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="surface rounded-2xl w-full max-w-md p-5 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold">
                {moduleModal.editing ? '编辑学习板块' : '新建自定义学习板块'}
              </h3>
              <button
                onClick={() => setModuleModal({ open: false, editing: null })}
                className="text-muted hover:text-primary"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3 text-sm">
              <div>
                <label className="text-xs text-muted block mb-1">板块名称 *</label>
                <input
                  value={modForm.name}
                  onChange={(e) => setModForm({ ...modForm, name: e.target.value })}
                  placeholder="例如：虚幻引擎 UE5、数学分析、计算机图形学"
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

              <div>
                <label className="text-xs text-muted block mb-1">简介</label>
                <input
                  value={modForm.description}
                  onChange={(e) => setModForm({ ...modForm, description: e.target.value })}
                  placeholder="简短描述学习范围"
                  className="w-full px-3 py-2 rounded-xl surface-elevated focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="text-xs text-muted block mb-1">长期目标（AI 复盘时会参考此目标）</label>
                <textarea
                  rows={2}
                  value={modForm.goal}
                  onChange={(e) => setModForm({ ...modForm, goal: e.target.value })}
                  placeholder="例如：3个月内掌握 UE5 GAS 框架并做出可玩战斗 Demo"
                  className="w-full px-3 py-2 rounded-xl surface-elevated focus:outline-none focus:border-indigo-500"
                />
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
                  className="px-4 py-2 rounded-xl bg-indigo-500 hover:bg-indigo-400 text-white text-xs font-medium"
                >
                  保存板块
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
