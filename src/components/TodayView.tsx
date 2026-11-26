import { Plus, Sparkles } from 'lucide-react';
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
    if (count === 0) return 'bg-[var(--bg-elevated)]';
    if (count === 1) return 'bg-emerald-500/35';
    if (count === 2) return 'bg-emerald-500/65';
    return 'bg-emerald-500';
  };

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-baseline gap-3">
          <h1 className="text-xl font-semibold tracking-tight">今日概览</h1>
          <span className="text-xs text-muted tabular-nums">
            {stats?.todayDate || new Date().toISOString().slice(0, 10)}
          </span>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={onOpenNewLog}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg btn-primary text-sm font-medium transition-colors duration-100"
          >
            <Plus className="w-4 h-4" /> 记录学习
          </button>
          <button
            onClick={onOpenNewIdea}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg surface hover:border-strong text-sm text-secondary hover:text-primary transition-colors duration-100"
          >
            记录灵感
          </button>
          <button
            onClick={onTriggerDailyReview}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg surface hover:border-strong text-sm text-secondary hover:text-primary transition-colors duration-100"
          >
            <Sparkles className="w-3.5 h-3.5" /> 复盘
          </button>
        </div>
      </div>

      {/* Flat Single-Layer Metric Bar */}
      <div className="surface rounded-xl grid grid-cols-2 lg:grid-cols-4">
        <div className="p-4 border-b border-r lg:border-b-0 border-subtle">
          <div className="text-xs text-muted">今日学习</div>
          <div className="text-xl font-semibold mt-1 tabular-nums">{todayLogs.length}</div>
        </div>
        <div className="p-4 border-b lg:border-b-0 lg:border-r border-subtle">
          <div className="text-xs text-muted">近 7 天</div>
          <div className="text-xl font-semibold mt-1 tabular-nums">{weekLogs}</div>
        </div>
        <div className="p-4 border-r border-subtle">
          <div className="text-xs text-muted">连续天数</div>
          <div className="text-xl font-semibold mt-1 tabular-nums">{stats?.streakDays ?? 0}</div>
        </div>
        <div className="p-4">
          <div className="text-xs text-muted">游戏灵感</div>
          <div className="text-xl font-semibold mt-1 tabular-nums">{stats?.totalIdeas ?? 0}</div>
        </div>
      </div>

      {/* Main Grid */}
      <div className="grid lg:grid-cols-3 gap-6">
        {/* Left 2 cols: Today's Study Logs */}
        <div className="lg:col-span-2 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold">今日记录</h2>
            <span className="text-xs text-muted tabular-nums">{todayLogs.length} 条</span>
          </div>

          {todayLogs.length === 0 ? (
            <div className="surface rounded-xl p-8 text-center space-y-3">
              <p className="text-sm text-secondary">今天还没有学习记录</p>
              <button
                onClick={onOpenNewLog}
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg btn-primary text-xs font-medium"
              >
                <Plus className="w-3.5 h-3.5" /> 记录学习
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
                    className="surface rounded-xl p-4 hover:border-strong transition-colors duration-100 cursor-pointer space-y-2.5"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-base font-semibold">{log.title}</span>
                      {cat && (
                        <span className="inline-flex items-center gap-1.5 text-xs text-secondary shrink-0">
                          <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: cat.color }} />
                          {cat.name}
                        </span>
                      )}
                    </div>

                    {previewText && (
                      <div className="max-h-36 overflow-hidden">
                        <MarkdownView content={previewText} />
                      </div>
                    )}

                    {log.tags.length > 0 && (
                      <div className="flex items-center gap-1.5 flex-wrap pt-1">
                        {log.tags.slice(0, 5).map((t) => (
                          <span
                            key={t}
                            className="text-xs px-2 py-0.5 rounded-md bg-[var(--bg-elevated)] text-secondary"
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

        {/* Right Col: Flat Single-Layer Sections (zero nested cards) */}
        <div className="space-y-6">
          {/* 28-Day Heatmap */}
          <section className="surface rounded-xl p-4 space-y-3">
            <h3 className="text-sm font-semibold">近 28 天</h3>
            <div className="grid grid-cols-7 gap-1.5">
              {(stats?.heatmap || []).map((cell) => (
                <div
                  key={cell.date}
                  title={`${cell.date}：${cell.count} 条`}
                  className={`aspect-square rounded-sm ${heatColor(cell.count)}`}
                />
              ))}
            </div>
          </section>

          {/* Auto Categories */}
          <section className="surface rounded-xl p-4 space-y-3">
            <h3 className="text-sm font-semibold">自动分类</h3>
            {visibleCategories.length === 0 ? (
              <p className="text-xs text-muted">暂无分类</p>
            ) : (
              <div className="space-y-2.5">
                {visibleCategories.map((c) => {
                  const total = c.log_count ?? 0;
                  const maxCount = Math.max(1, ...visibleCategories.map((x) => x.log_count ?? 0));
                  const pct = Math.max(8, Math.round((total / maxCount) * 100));
                  return (
                    <button
                      key={c.id}
                      onClick={() => onSelectModule(c.id)}
                      className="w-full text-left group space-y-1.5"
                    >
                      <div className="flex items-center justify-between text-sm">
                        <span className="flex items-center gap-2 text-primary group-hover:underline">
                          <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: c.color }} />
                          <span className="truncate">{c.name}</span>
                        </span>
                        <span className="text-xs text-muted tabular-nums">{total}</span>
                      </div>
                      <div className="h-1 rounded-full bg-[var(--bg-elevated)] overflow-hidden">
                        <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: c.color }} />
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </section>

          {/* Recent Game Ideas */}
          <section className="surface rounded-xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold">最新灵感</h3>
              <button onClick={onOpenNewIdea} className="text-xs text-secondary hover:text-primary">
                新增
              </button>
            </div>
            {recentIdeas.length === 0 ? (
              <p className="text-xs text-muted">暂无灵感</p>
            ) : (
              <div className="divide-y divide-[var(--border-subtle)]">
                {recentIdeas.slice(0, 4).map((idea) => (
                  <button
                    key={idea.id}
                    onClick={() => onSelectIdea(idea)}
                    className="w-full text-left py-2.5 first:pt-0 last:pb-0 group"
                  >
                    <div className="text-sm font-medium truncate group-hover:underline">{idea.title}</div>
                    {idea.content && (
                      <p className="text-xs text-secondary mt-0.5 line-clamp-2">{idea.content}</p>
                    )}
                  </button>
                ))}
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
