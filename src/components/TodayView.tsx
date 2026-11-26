import {
  BookOpen,
  CalendarDays,
  Flame,
  Gamepad2,
  Plus,
  Sparkles,
} from 'lucide-react';
import type { DashboardStats, GameIdea, StudyLog, StudyModule } from '../types.ts';
import { MarkdownView } from './MarkdownView.tsx';

interface TodayViewProps {
  stats: DashboardStats | null;
  modules: StudyModule[];
  todayLogs: StudyLog[];
  recentIdeas: GameIdea[];
  onRefresh: () => void;
  onOpenNewLog: () => void;
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
  onOpenNewLog,
  onOpenNewIdea,
  onSelectLog,
  onSelectIdea,
  onTriggerDailyReview,
  onSelectModule,
}: TodayViewProps) {
  const moduleMap = new Map(modules.map((m) => [m.id, m]));
  const visibleCategories = modules.filter((m) => (m.log_count ?? 0) > 0);

  const weekLogs =
    stats?.weekLogs ??
    (stats?.moduleBreakdown || []).reduce((sum, b) => sum + b.logs, 0);

  const heatColor = (count: number) => {
    if (count === 0) return 'bg-white/[0.04] dark:bg-white/[0.05] border border-subtle';
    if (count === 1) return 'bg-indigo-500/35 border border-indigo-400/25';
    if (count === 2) return 'bg-indigo-500/65 border border-indigo-400/35';
    return 'bg-indigo-500 border border-indigo-300/40 shadow-xs shadow-indigo-500/30';
  };

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-wider text-muted font-medium">
            {stats?.todayDate || new Date().toISOString().slice(0, 10)} · PERLICA
          </p>
          <h1 className="text-2xl font-bold tracking-tight mt-1">今日概览</h1>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={onOpenNewLog}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-indigo-500 hover:bg-indigo-400 text-white text-sm font-medium transition shadow-sm shadow-indigo-500/25"
          >
            <Plus className="w-4 h-4" /> 记今日所学
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

      {/* Clean KPI Strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="surface rounded-2xl p-4">
          <div className="flex items-center justify-between text-xs text-muted">
            <span>今日学习</span>
            <BookOpen className="w-4 h-4 text-indigo-400" />
          </div>
          <div className="text-2xl font-bold mt-2 tracking-tight">
            {todayLogs.length} <span className="text-sm font-normal text-muted">条</span>
          </div>
          <div className="text-xs text-secondary mt-1">
            {todayLogs.filter((l) => l.ai_feedback).length} 条已由 AI 整理
          </div>
        </div>

        <div className="surface rounded-2xl p-4">
          <div className="flex items-center justify-between text-xs text-muted">
            <span>近 7 天记录</span>
            <CalendarDays className="w-4 h-4 text-sky-400" />
          </div>
          <div className="text-2xl font-bold mt-2 tracking-tight">
            {weekLogs} <span className="text-sm font-normal text-muted">条</span>
          </div>
          <div className="text-xs text-secondary mt-1">累计 {stats?.totalLogs ?? 0} 条学习记录</div>
        </div>

        <div className="surface rounded-2xl p-4">
          <div className="flex items-center justify-between text-xs text-muted">
            <span>连续记录</span>
            <Flame className="w-4 h-4 text-orange-400" />
          </div>
          <div className="text-2xl font-bold mt-2 tracking-tight">
            {stats?.streakDays ?? 0} <span className="text-sm font-normal text-muted">天</span>
          </div>
          <div className="text-xs text-secondary mt-1">每天一点积累</div>
        </div>

        <div className="surface rounded-2xl p-4">
          <div className="flex items-center justify-between text-xs text-muted">
            <span>游戏灵感</span>
            <Gamepad2 className="w-4 h-4 text-amber-400" />
          </div>
          <div className="text-2xl font-bold mt-2 tracking-tight">
            {stats?.totalIdeas ?? 0} <span className="text-sm font-normal text-muted">条</span>
          </div>
          <div className="text-xs text-secondary mt-1">随手保留灵感原文</div>
        </div>
      </div>

      {/* Main Grid */}
      <div className="grid lg:grid-cols-3 gap-5">
        {/* Left 2 cols: Today's Study Logs */}
        <div className="lg:col-span-2 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold flex items-center gap-2">
              <BookOpen className="w-4 h-4 text-indigo-400" /> 今日学习记录
            </h2>
            <span className="text-xs text-muted">{todayLogs.length} 条</span>
          </div>

          {todayLogs.length === 0 ? (
            <div className="surface rounded-2xl p-8 text-center space-y-3">
              <p className="text-secondary text-sm">今天还没有记录学习内容，随手写几句，AI 会自动帮你分类整理。</p>
              <button
                onClick={onOpenNewLog}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-indigo-500 hover:bg-indigo-400 text-white text-xs font-medium transition"
              >
                <Plus className="w-3.5 h-3.5" /> 记今日所学
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              {todayLogs.map((log) => {
                const cat = moduleMap.get(log.module_id);
                const previewText = log.ai_feedback || log.content;
                return (
                  <div
                    key={log.id}
                    onClick={() => onSelectLog(log)}
                    className="surface rounded-2xl p-4 hover:border-strong transition cursor-pointer"
                  >
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <div className="flex items-center gap-2 flex-wrap">
                        {cat && (
                          <span
                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium"
                            style={{ backgroundColor: `${cat.color}20`, color: cat.color }}
                          >
                            {cat.icon} {cat.name}
                          </span>
                        )}
                        {log.ai_feedback && (
                          <span className="inline-flex items-center gap-0.5 text-[11px] text-indigo-400">
                            <Sparkles className="w-3 h-3" /> AI 已整理
                          </span>
                        )}
                      </div>
                      <span className="text-xs text-muted">查看详情</span>
                    </div>

                    <div className="mt-2 text-base font-semibold">{log.title}</div>

                    {previewText && (
                      <div className="mt-2.5 pt-2.5 border-t border-subtle max-h-32 overflow-hidden relative">
                        <MarkdownView content={previewText} className="text-sm opacity-90" />
                        <div className="absolute inset-x-0 bottom-0 h-10 bg-gradient-to-t from-[var(--bg-surface)] to-transparent pointer-events-none" />
                      </div>
                    )}

                    {log.tags.length > 0 && (
                      <div className="flex items-center gap-1.5 flex-wrap mt-2.5">
                        {log.tags.slice(0, 5).map((t) => (
                          <span
                            key={t}
                            className="text-[11px] px-1.5 py-0.5 rounded bg-white/[0.06] text-secondary"
                          >
                            #{t}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Right Col: Heatmap + Auto Categories + Recent Ideas */}
        <div className="space-y-4">
          {/* 28-Day Heatmap */}
          <div className="surface rounded-2xl p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold">近 28 天学习打卡</h3>
              <span className="text-[11px] text-muted">深浅代表篇数</span>
            </div>
            <div className="grid grid-cols-7 gap-1.5">
              {(stats?.heatmap || []).map((cell) => (
                <div
                  key={cell.date}
                  title={`${cell.date}: ${cell.count} 条学习记录`}
                  className={`aspect-square rounded-md transition ${heatColor(cell.count)}`}
                />
              ))}
            </div>
          </div>

          {/* AI Auto Categories */}
          <div className="surface rounded-2xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold">AI 自动分类</h3>
              <span className="text-[11px] text-muted">按记录自动归类</span>
            </div>
            {visibleCategories.length === 0 ? (
              <p className="text-xs text-muted py-2">写下学习记录后，AI 会自动帮你归纳分类。</p>
            ) : (
              <div className="space-y-2">
                {visibleCategories.map((c) => {
                  const total = c.log_count ?? 0;
                  const maxCount = Math.max(1, ...visibleCategories.map((x) => x.log_count ?? 0));
                  const pct = Math.max(10, Math.round((total / maxCount) * 100));
                  return (
                    <button
                      key={c.id}
                      onClick={() => onSelectModule(c.id)}
                      className="w-full text-left p-2.5 rounded-xl surface-elevated hover:border-strong transition"
                    >
                      <div className="flex items-center justify-between text-sm">
                        <span className="font-medium flex items-center gap-1.5">
                          <span>{c.icon}</span> {c.name}
                        </span>
                        <span className="text-xs text-muted">{total} 条</span>
                      </div>
                      <div className="h-1.5 rounded-full bg-white/[0.06] mt-2 overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all"
                          style={{ width: `${pct}%`, backgroundColor: c.color }}
                        />
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
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
                      {idea.ai_notes && (
                        <span className="text-[10px] text-indigo-400 shrink-0">✨ 已整理</span>
                      )}
                    </div>
                    {idea.content && (
                      <p className="text-xs text-secondary mt-1 line-clamp-2">{idea.content}</p>
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
