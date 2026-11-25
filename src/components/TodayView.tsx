import { useState } from 'react';
import {
  BookOpen,
  CheckCircle2,
  Circle,
  Clock,
  Flame,
  Gamepad2,
  Plus,
  Sparkles,
  TrendingUp,
} from 'lucide-react';
import type { DashboardStats, GameIdea, StudyLog, StudyModule } from '../types.ts';
import { api } from '../api.ts';
import { MarkdownView } from './MarkdownView.tsx';

interface TodayViewProps {
  stats: DashboardStats | null;
  modules: StudyModule[];
  todayLogs: StudyLog[];
  recentIdeas: GameIdea[];
  onRefresh: () => void;
  onOpenNewLog: (moduleId?: string) => void;
  onOpenNewIdea: () => void;
  onSelectLog: (log: StudyLog) => void;
  onSelectIdea: (idea: GameIdea) => void;
  onTriggerDailyReview: () => void;
  onSelectModule: (moduleId: string) => void;
}

export function TodayView({
  stats,
  modules,
  todayLogs,
  recentIdeas,
  onRefresh,
  onOpenNewLog,
  onOpenNewIdea,
  onSelectLog,
  onSelectIdea,
  onTriggerDailyReview,
  onSelectModule,
}: TodayViewProps) {
  const [busyTaskId, setBusyTaskId] = useState<string | null>(null);
  const moduleMap = new Map(modules.map((m) => [m.id, m]));

  const toggleTask = async (log: StudyLog, taskId: string) => {
    setBusyTaskId(taskId);
    try {
      const nextTasks = log.tasks.map((t) => (t.id === taskId ? { ...t, done: !t.done } : t));
      await api.updateLog(log.id, { tasks: nextTasks });
      onRefresh();
    } finally {
      setBusyTaskId(null);
    }
  };

  const formatHours = (mins: number) => {
    if (mins < 60) return `${mins}m`;
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return m ? `${h}h ${m}m` : `${h}h`;
  };

  const heatColor = (minutes: number) => {
    if (minutes === 0) return 'bg-white/[0.04] dark:bg-white/[0.05] border border-subtle';
    if (minutes < 45) return 'bg-indigo-500/25 border border-indigo-400/20';
    if (minutes < 100) return 'bg-indigo-500/55 border border-indigo-400/30';
    return 'bg-indigo-500 border border-indigo-300/40 shadow-xs shadow-indigo-500/30';
  };

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-wider text-muted font-medium">
            {stats?.todayDate || new Date().toISOString().slice(0, 10)} · CREATOR WORKBENCH
          </p>
          <h1 className="text-2xl font-bold tracking-tight mt-1">今日概览与专注日程</h1>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => onOpenNewLog()}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-indigo-500 hover:bg-indigo-400 text-white text-sm font-medium transition shadow-sm shadow-indigo-500/25"
          >
            <Plus className="w-4 h-4" /> 记学习日程
          </button>
          <button
            onClick={onOpenNewIdea}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl surface hover:border-strong text-sm font-medium transition"
          >
            <Gamepad2 className="w-4 h-4 text-amber-400" /> 捕游戏灵感
          </button>
          <button
            onClick={onTriggerDailyReview}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-indigo-500/12 hover:bg-indigo-500/20 text-indigo-400 border border-indigo-500/25 text-sm font-medium transition"
          >
            <Sparkles className="w-4 h-4" /> AI 今日复盘
          </button>
        </div>
      </div>

      {/* KPI Strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="surface rounded-2xl p-4">
          <div className="flex items-center justify-between text-xs text-muted">
            <span>今日投入</span>
            <Clock className="w-4 h-4 text-indigo-400" />
          </div>
          <div className="text-2xl font-bold mt-2 tracking-tight">
            {formatHours(stats?.todayMinutes ?? 0)}
          </div>
          <div className="text-xs text-secondary mt-1">
            今日任务 {stats?.todayCompletedTasks ?? 0}/{stats?.todayTotalTasks ?? 0} 已完成
          </div>
        </div>

        <div className="surface rounded-2xl p-4">
          <div className="flex items-center justify-between text-xs text-muted">
            <span>近 7 天学习</span>
            <TrendingUp className="w-4 h-4 text-sky-400" />
          </div>
          <div className="text-2xl font-bold mt-2 tracking-tight">
            {formatHours(stats?.weekMinutes ?? 0)}
          </div>
          <div className="text-xs text-secondary mt-1">累计 {stats?.totalLogs ?? 0} 篇学习记录</div>
        </div>

        <div className="surface rounded-2xl p-4">
          <div className="flex items-center justify-between text-xs text-muted">
            <span>连续记录</span>
            <Flame className="w-4 h-4 text-orange-400" />
          </div>
          <div className="text-2xl font-bold mt-2 tracking-tight">
            {stats?.streakDays ?? 0} <span className="text-sm font-normal text-muted">天</span>
          </div>
          <div className="text-xs text-secondary mt-1">保持节奏，复利积累</div>
        </div>

        <div className="surface rounded-2xl p-4">
          <div className="flex items-center justify-between text-xs text-muted">
            <span>游戏灵感库</span>
            <Gamepad2 className="w-4 h-4 text-amber-400" />
          </div>
          <div className="text-2xl font-bold mt-2 tracking-tight">{stats?.activeIdeas ?? 0}</div>
          <div className="text-xs text-secondary mt-1">活跃孵化中 · 总计 {stats?.totalIdeas ?? 0} 条</div>
        </div>
      </div>

      {/* Main Grid */}
      <div className="grid lg:grid-cols-3 gap-5">
        {/* Left 2 cols: Today's Study Schedule */}
        <div className="lg:col-span-2 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold flex items-center gap-2">
              <BookOpen className="w-4 h-4 text-indigo-400" /> 今日学习日程
            </h2>
            <span className="text-xs text-muted">{todayLogs.length} 条记录</span>
          </div>

          {todayLogs.length === 0 ? (
            <div className="surface rounded-2xl p-8 text-center space-y-3">
              {modules.length === 0 ? (
                <>
                  <p className="text-secondary text-sm">当前工作台已清空，先创建你的第一个自定义学习板块吧。</p>
                  <button
                    onClick={() => onSelectModule('__new__')}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-indigo-500 hover:bg-indigo-400 text-white text-xs font-medium transition"
                  >
                    <Plus className="w-3.5 h-3.5" /> 创建第一个学习板块（如虚幻引擎 / 数学分析）
                  </button>
                </>
              ) : (
                <>
                  <p className="text-secondary text-sm">今天还没有记录学习日程，选一个板块开始吧。</p>
                  <div className="flex items-center justify-center gap-2 flex-wrap">
                    {modules.map((m) => (
                      <button
                        key={m.id}
                        onClick={() => onOpenNewLog(m.id)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl surface-elevated hover:border-strong text-xs font-medium transition"
                      >
                        <span>{m.icon}</span> {m.name}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              {todayLogs.map((log) => {
                const mod = moduleMap.get(log.module_id);
                const doneCount = log.tasks.filter((t) => t.done).length;
                return (
                  <div
                    key={log.id}
                    className="surface rounded-2xl p-4 hover:border-strong transition group"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          {mod && (
                            <span
                              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium"
                              style={{ backgroundColor: `${mod.color}20`, color: mod.color }}
                            >
                              {mod.icon} {mod.name}
                            </span>
                          )}
                          <span className="text-xs text-muted">{log.duration_minutes} 分钟</span>
                          {log.rating > 0 && (
                            <span className="text-xs text-amber-400">{'★'.repeat(log.rating)}</span>
                          )}
                        </div>
                        <button
                          onClick={() => onSelectLog(log)}
                          className="text-left block mt-1.5 text-base font-semibold hover:text-indigo-400 transition"
                        >
                          {log.title}
                        </button>
                      </div>
                      <button
                        onClick={() => onSelectLog(log)}
                        className="text-xs text-muted hover:text-primary px-2.5 py-1 rounded-lg surface-elevated shrink-0"
                      >
                        编辑 / AI点评
                      </button>
                    </div>

                    {log.tasks.length > 0 && (
                      <div className="mt-3 pt-3 border-t border-subtle space-y-1.5">
                        <div className="flex items-center justify-between text-xs text-muted mb-1">
                          <span>日程清单</span>
                          <span>
                            {doneCount}/{log.tasks.length}
                          </span>
                        </div>
                        {log.tasks.map((task) => (
                          <button
                            key={task.id}
                            disabled={busyTaskId === task.id}
                            onClick={() => toggleTask(log, task.id)}
                            className="w-full flex items-center gap-2 text-left text-sm py-1 px-1.5 -mx-1.5 rounded-lg hover:bg-white/[0.04] transition"
                          >
                            {task.done ? (
                              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                            ) : (
                              <Circle className="w-4 h-4 text-muted shrink-0" />
                            )}
                            <span className={task.done ? 'line-through text-muted' : 'text-primary'}>
                              {task.text}
                            </span>
                          </button>
                        ))}
                      </div>
                    )}

                    {log.content && (
                      <div
                        onClick={() => onSelectLog(log)}
                        className="mt-3 pt-3 border-t border-subtle max-h-32 overflow-hidden relative cursor-pointer"
                      >
                        <MarkdownView content={log.content} className="text-sm opacity-90" />
                        <div className="absolute inset-x-0 bottom-0 h-10 bg-gradient-to-t from-[var(--bg-surface)] to-transparent pointer-events-none" />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Right Col: Modules Overview + Heatmap + Recent Game Ideas */}
        <div className="space-y-4">
          {/* 28-Day Heatmap */}
          <div className="surface rounded-2xl p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold">近 28 天专注热力图</h3>
              <span className="text-[11px] text-muted">深浅代表时长</span>
            </div>
            <div className="grid grid-cols-7 gap-1.5">
              {(stats?.heatmap || []).map((cell) => (
                <div
                  key={cell.date}
                  title={`${cell.date}: ${cell.minutes} 分钟 (${cell.count} 篇)`}
                  className={`aspect-square rounded-md transition ${heatColor(cell.minutes)}`}
                />
              ))}
            </div>
          </div>

          {/* Module Quick Cards */}
          <div className="surface rounded-2xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold">自定义学习板块（近7天）</h3>
            </div>
            <div className="space-y-2">
              {modules.map((m) => {
                const stat = stats?.moduleBreakdown.find((b) => b.module_id === m.id);
                const weekMins = stat?.minutes ?? 0;
                const maxMins = Math.max(60, ...(stats?.moduleBreakdown.map((b) => b.minutes) || [60]));
                const pct = Math.min(100, Math.round((weekMins / maxMins) * 100));
                return (
                  <button
                    key={m.id}
                    onClick={() => onSelectModule(m.id)}
                    className="w-full text-left p-2.5 rounded-xl surface-elevated hover:border-strong transition"
                  >
                    <div className="flex items-center justify-between text-sm">
                      <span className="font-medium flex items-center gap-1.5">
                        <span>{m.icon}</span> {m.name}
                      </span>
                      <span className="text-xs text-muted">{formatHours(weekMins)}</span>
                    </div>
                    <div className="h-1.5 rounded-full bg-white/[0.06] mt-2 overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all"
                        style={{ width: `${pct}%`, backgroundColor: m.color }}
                      />
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Recent Game Ideas */}
          <div className="surface rounded-2xl p-4 space-y-2.5">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold flex items-center gap-1.5">
                <Gamepad2 className="w-4 h-4 text-amber-400" /> 最新游戏灵感
              </h3>
              <button onClick={onOpenNewIdea} className="text-xs text-indigo-400 hover:underline">
                + 记一条
              </button>
            </div>
            {recentIdeas.length === 0 ? (
              <p className="text-xs text-muted py-2">还没有游戏灵感，随时捕获你的脑洞！</p>
            ) : (
              <div className="space-y-2">
                {recentIdeas.slice(0, 4).map((idea) => (
                  <button
                    key={idea.id}
                    onClick={() => onSelectIdea(idea)}
                    className="w-full text-left p-2.5 rounded-xl surface-elevated hover:border-strong transition"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-medium truncate">{idea.title}</span>
                      <span className="text-[11px] px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-400 shrink-0">
                        {idea.category}
                      </span>
                    </div>
                    {idea.summary && (
                      <p className="text-xs text-secondary mt-1 line-clamp-2">{idea.summary}</p>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
