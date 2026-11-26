import { useCallback, useEffect, useRef, useState } from 'react';
import {
  BookOpen,
  CalendarCheck,
  Gamepad2,
  Github,
  Loader2,
  Lock,
  Moon,
  Plus,
  RefreshCw,
  Settings,
  Sparkles,
  Sun,
  X,
} from 'lucide-react';
import type {
  AiProvider,
  AiReference,
  AuthStatus,
  DashboardStats,
  GameIdea,
  GithubSyncStatus,
  StudyLog,
  StudyModule,
} from './types.ts';
import { api, IS_STATIC_MODE, todayDateString } from './api.ts';
import { TodayView } from './components/TodayView.tsx';
import { StudyView } from './components/StudyView.tsx';
import { IdeasView } from './components/IdeasView.tsx';
import { AiHubView } from './components/AiHubView.tsx';
import { SettingsView } from './components/SettingsView.tsx';

type NavTab = 'today' | 'study' | 'ideas' | 'ai' | 'settings';

export default function App() {
  const [tab, setTab] = useState<NavTab>('today');
  const [theme, setTheme] = useState<'dark' | 'light'>(() => {
    const saved = localStorage.getItem('perlica_theme') || localStorage.getItem('forgelog_theme');
    return saved === 'light' ? 'light' : 'dark';
  });

  // Auth gate state
  const [authStatus, setAuthStatus] = useState<AuthStatus | null>(null);
  const [loginPwd, setLoginPwd] = useState('');
  const [loginErr, setLoginErr] = useState('');
  const [loginBusy, setLoginBusy] = useState(false);

  // Global data
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [modules, setModules] = useState<StudyModule[]>([]);
  const [logs, setLogs] = useState<StudyLog[]>([]);
  const [ideas, setIdeas] = useState<GameIdea[]>([]);
  const [providers, setProviders] = useState<AiProvider[]>([]);
  const [githubStatus, setGithubStatus] = useState<GithubSyncStatus | null>(null);
  const [syncingQuick, setSyncingQuick] = useState(false);
  const lastAutoSyncRef = useRef<number>(0);
  const autoSyncBusyRef = useRef<boolean>(false);

  // View focus state
  const [activeModuleId, setActiveModuleId] = useState<string>('all');
  const [selectedLogId, setSelectedLogId] = useState<string | null>(null);
  const [selectedIdeaId, setSelectedIdeaId] = useState<string | null>(null);
  const [aiInitialTab, setAiInitialTab] = useState<'review' | 'chat'>('review');
  const [autoTriggerDaily, setAutoTriggerDaily] = useState(false);

  // Quick capture modal
  const [quickOpen, setQuickOpen] = useState(false);
  const [quickKind, setQuickKind] = useState<'idea' | 'study'>('study');
  const [quickContent, setQuickContent] = useState('');
  const [quickBusy, setQuickBusy] = useState<'save' | 'ai' | null>(null);

  // Toast
  const [toast, setToast] = useState<{ msg: string; type: 'ok' | 'err' } | null>(null);

  const showToast = useCallback((msg: string, type: 'ok' | 'err' = 'ok') => {
    setToast({ msg, type });
    setTimeout(() => {
      setToast((cur) => (cur?.msg === msg ? null : cur));
    }, 3200);
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'dark') root.classList.add('dark');
    else root.classList.remove('dark');
    localStorage.setItem('perlica_theme', theme);
  }, [theme]);

  const refreshAuth = useCallback(async () => {
    try {
      const st = await api.getAuthStatus();
      setAuthStatus(st);
      return st;
    } catch {
      return null;
    }
  }, []);

  const refreshGithub = useCallback(async () => {
    try {
      setGithubStatus(await api.getGithubSyncStatus());
    } catch {
      // ignore when locked
    }
  }, []);

  const refreshAll = useCallback(async () => {
    try {
      const [s, m, l, i, p, g] = await Promise.all([
        api.getStats(),
        api.getModules(),
        api.getLogs(),
        api.getIdeas(),
        api.getProviders(),
        api.getGithubSyncStatus(),
      ]);
      setStats(s);
      setModules(m);
      setLogs(l);
      setIdeas(i);
      setProviders(p);
      setGithubStatus(g);
    } catch (e) {
      const msg = e instanceof Error ? e.message : '数据加载失败';
      if (msg.includes('访问密码')) {
        refreshAuth();
      } else {
        showToast(msg, 'err');
      }
    }
  }, [showToast, refreshAuth]);

  const runSilentAutoSync = useCallback(
    async (minGapMs = 6000) => {
      if (autoSyncBusyRef.current) return;
      if (Date.now() - lastAutoSyncRef.current < minGapMs) return;
      autoSyncBusyRef.current = true;
      setSyncingQuick(true);
      try {
        await api.syncGithubNow();
        lastAutoSyncRef.current = Date.now();
        await refreshAll();
      } catch {
        // silent background failure
      } finally {
        autoSyncBusyRef.current = false;
        setSyncingQuick(false);
      }
    },
    [refreshAll]
  );

  useEffect(() => {
    refreshAuth().then((st) => {
      if (st?.authenticated) {
        refreshAll().then(() => {
          api
            .getGithubSyncStatus()
            .then((g) => {
              if (g.configured && g.autoSync) {
                runSilentAutoSync(0);
              }
            })
            .catch(() => {});
        });
      }
    });
  }, [refreshAuth, refreshAll, runSilentAutoSync]);

  // Automatic background sync on tab return / app resume / network reconnect + 25s foreground poll
  useEffect(() => {
    if (!githubStatus?.configured || !githubStatus.autoSync) return;

    const handleResume = () => {
      if (document.visibilityState === 'visible') {
        runSilentAutoSync(5000);
      }
    };
    const handleOnline = () => runSilentAutoSync(2000);

    document.addEventListener('visibilitychange', handleResume);
    window.addEventListener('focus', handleResume);
    window.addEventListener('online', handleOnline);

    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') {
        runSilentAutoSync(20000);
      }
    }, 25000);

    return () => {
      document.removeEventListener('visibilitychange', handleResume);
      window.removeEventListener('focus', handleResume);
      window.removeEventListener('online', handleOnline);
      window.clearInterval(timer);
    };
  }, [githubStatus?.configured, githubStatus?.autoSync, runSilentAutoSync]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setQuickOpen((v) => !v);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginErr('');
    setLoginBusy(true);
    try {
      await api.login(loginPwd);
      setLoginPwd('');
      await refreshAuth();
      await refreshAll();
    } catch (err) {
      setLoginErr(err instanceof Error ? err.message : '密码错误');
    } finally {
      setLoginBusy(false);
    }
  };

  const handleQuickSyncGithub = async () => {
    if (!githubStatus?.configured) {
      setTab('settings');
      return;
    }
    setSyncingQuick(true);
    try {
      await api.syncGithubNow();
      await refreshAll();
      showToast('已同步');
    } catch (e) {
      showToast(e instanceof Error ? e.message : '同步失败', 'err');
    } finally {
      setSyncingQuick(false);
    }
  };

  const handleQuickSubmit = async (autoOrganize = false) => {
    const raw = quickContent.trim();
    if (!raw || quickBusy !== null) return;
    const firstLine = raw.split(/\r?\n/)[0] || '';
    const autoTitle = firstLine.length > 22 ? `${firstLine.slice(0, 22)}...` : firstLine;

    if (quickKind === 'idea') {
      setQuickBusy(autoOrganize ? 'ai' : 'save');
      try {
        const created = await api.createIdea({
          title: autoTitle || '未命名灵感',
          summary: '',
          content: raw,
          status: 'spark',
          category: '玩法机制',
        });
        let finalIdea = created;
        if (autoOrganize) {
          try {
            finalIdea = await api.organizeIdea(created.id);
            showToast('已保存并整理');
          } catch (aiErr) {
            showToast(`原文已保存，整理失败：${aiErr instanceof Error ? aiErr.message : ''}`, 'err');
          }
        } else {
          showToast('已保存');
        }
        setSelectedIdeaId(finalIdea.id);
        setTab('ideas');
        setQuickContent('');
        setQuickOpen(false);
        refreshAll();
      } catch (e) {
        showToast(e instanceof Error ? e.message : '保存失败', 'err');
      } finally {
        setQuickBusy(null);
      }
      return;
    }

    setQuickBusy(autoOrganize ? 'ai' : 'save');
    try {
      const created = await api.createLog({
        log_date: todayDateString(),
        title: autoTitle || '未命名学习记录',
        content: raw,
        duration_minutes: 0,
        rating: 0,
      });
      let finalLog = created;
      if (autoOrganize) {
        try {
          finalLog = await api.organizeLog(created.id);
          showToast('已自动分类并整理');
        } catch (aiErr) {
          showToast(`原文已保存，整理失败：${aiErr instanceof Error ? aiErr.message : ''}`, 'err');
        }
      } else {
        showToast('已保存');
      }
      setActiveModuleId('all');
      setSelectedLogId(finalLog.id);
      setTab('study');
      setQuickContent('');
      setQuickOpen(false);
      refreshAll();
    } catch (e) {
      showToast(e instanceof Error ? e.message : '保存失败', 'err');
    } finally {
      setQuickBusy(null);
    }
  };

  if (!authStatus) {
    return (
      <div className="h-screen flex items-center justify-center bg-[var(--bg-app)]">
        <Loader2 className="w-5 h-5 animate-spin text-muted" />
      </div>
    );
  }

  if (authStatus.enabled && !authStatus.authenticated) {
    return (
      <div className="h-screen flex items-center justify-center bg-[var(--bg-app)] p-4">
        <form onSubmit={handleLogin} className="surface rounded-xl w-full max-w-sm p-6 space-y-5 text-center">
          <img src="./icon.png" alt="Perlica" className="w-16 h-16 mx-auto rounded-lg object-contain" />
          <h1 className="text-xl font-semibold">Perlica</h1>
          <div className="space-y-2 text-left">
            <input
              autoFocus
              type="password"
              value={loginPwd}
              onChange={(e) => setLoginPwd(e.target.value)}
              placeholder="输入访问密码"
              className="w-full px-3 py-2 rounded-lg surface-elevated text-sm focus:outline-none focus:border-strong"
            />
            {loginErr && <p className="text-xs text-rose-500">{loginErr}</p>}
          </div>
          <button
            type="submit"
            disabled={loginBusy || !loginPwd}
            className="w-full py-2 rounded-lg btn-primary text-sm font-medium inline-flex items-center justify-center gap-1.5 transition-colors duration-100 disabled:opacity-40"
          >
            {loginBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Lock className="w-4 h-4" />}
            解锁
          </button>
        </form>
      </div>
    );
  }

  const today = todayDateString();
  const todayLogs = logs.filter((l) => l.log_date === today);
  const activeProvider = providers.find((p) => p.is_active) || providers[0];
  const visibleCategories = modules.filter((m) => (m.log_count ?? 0) > 0);

  const handleJumpToReference = (ref: AiReference) => {
    if (ref.type === 'study_log') {
      setSelectedLogId(ref.id);
      setActiveModuleId('all');
      setTab('study');
    } else {
      setSelectedIdeaId(ref.id);
      setTab('ideas');
    }
  };

  const navItems: Array<{ id: NavTab; label: string; short: string; icon: typeof CalendarCheck }> = [
    { id: 'today', label: '今日概览', short: '今日', icon: CalendarCheck },
    { id: 'study', label: '学习日志', short: '学习', icon: BookOpen },
    { id: 'ideas', label: '游戏灵感', short: '灵感', icon: Gamepad2 },
    { id: 'ai', label: 'AI 参谋', short: 'AI', icon: Sparkles },
    { id: 'settings', label: '设置', short: '设置', icon: Settings },
  ];

  return (
    <div className="h-[100dvh] flex flex-col md:flex-row overflow-hidden bg-[var(--bg-app)] text-[var(--text-primary)]">
      {/* DESKTOP SIDEBAR */}
      <aside className="hidden md:flex md:w-56 lg:w-60 shrink-0 flex-col border-r border-subtle bg-[var(--bg-sidebar)] p-3 justify-between">
        <div className="space-y-4 overflow-y-auto">
          {/* Brand */}
          <div className="flex items-center justify-between px-1.5 pt-0.5">
            <div className="flex items-center gap-2.5">
              <img src="./icon.png" alt="Perlica" className="w-7 h-7 rounded-md object-contain" />
              <span className="font-semibold text-base tracking-tight">Perlica</span>
            </div>
            <button
              onClick={() => setTheme((t) => (t === 'dark' ? 'light' : 'dark'))}
              title="切换明暗主题"
              className="p-1.5 rounded-md text-muted hover:text-primary hover:bg-[var(--bg-elevated)] transition-colors duration-100"
            >
              {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>
          </div>

          {/* Quick Capture Button */}
          <button
            onClick={() => setQuickOpen(true)}
            className="w-full flex items-center justify-between px-3 py-2 rounded-lg surface hover:border-strong text-xs text-secondary hover:text-primary transition-colors duration-100"
          >
            <span className="flex items-center gap-1.5 font-medium">
              <Plus className="w-3.5 h-3.5" /> 速记
            </span>
            <kbd className="text-xs text-muted font-mono">Ctrl K</kbd>
          </button>

          {/* Main Nav */}
          <nav className="space-y-0.5">
            {navItems.map((item) => {
              const Icon = item.icon;
              const active = tab === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => setTab(item.id)}
                  className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors duration-100 ${
                    active
                      ? 'bg-[var(--bg-elevated)] text-primary font-medium'
                      : 'text-secondary hover:text-primary hover:bg-[var(--bg-elevated)]/60'
                  }`}
                >
                  <Icon className="w-4 h-4 shrink-0" />
                  <span>{item.label}</span>
                </button>
              );
            })}
          </nav>

          {/* Auto-Generated Category Shortcuts */}
          {visibleCategories.length > 0 && (
            <div className="pt-3 border-t border-subtle space-y-0.5">
              <div className="px-3 mb-1.5 text-xs text-muted font-medium">分类</div>
              {visibleCategories.map((m) => (
                <button
                  key={m.id}
                  onClick={() => {
                    setActiveModuleId(m.id);
                    setTab('study');
                  }}
                  className={`w-full flex items-center justify-between px-3 py-1.5 rounded-lg text-xs transition-colors duration-100 ${
                    tab === 'study' && activeModuleId === m.id
                      ? 'bg-[var(--bg-elevated)] text-primary font-medium'
                      : 'text-secondary hover:text-primary hover:bg-[var(--bg-elevated)]/60'
                  }`}
                >
                  <span className="flex items-center gap-2 truncate">
                    <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: m.color }} />
                    <span className="truncate">{m.name}</span>
                  </span>
                  <span className="text-xs text-muted tabular-nums">{m.log_count ?? 0}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Bottom Status Footer (flat hairline separation, no nested cards) */}
        <div className="pt-3 mt-3 border-t border-subtle space-y-1">
          <button
            onClick={handleQuickSyncGithub}
            disabled={syncingQuick}
            className="w-full px-2.5 py-2 rounded-lg hover:bg-[var(--bg-elevated)] text-left transition-colors duration-100 flex items-center justify-between gap-2"
          >
            <span className="flex items-center gap-2 text-xs text-secondary truncate">
              <Github className="w-3.5 h-3.5 shrink-0 text-muted" />
              <span className="truncate">
                {githubStatus?.configured ? `@${githubStatus.username}` : '配置同步'}
              </span>
            </span>
            {syncingQuick ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin text-muted shrink-0" />
            ) : (
              <RefreshCw className="w-3.5 h-3.5 text-muted shrink-0" />
            )}
          </button>

          <button
            onClick={() => setTab('settings')}
            className="w-full px-2.5 py-2 rounded-lg hover:bg-[var(--bg-elevated)] text-left transition-colors duration-100 flex items-center gap-2"
          >
            <span
              className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                activeProvider?.api_key ? 'bg-emerald-500' : 'bg-amber-500'
              }`}
            />
            <span className="text-xs text-secondary truncate">
              {activeProvider ? activeProvider.model : '未配置模型'}
            </span>
          </button>
        </div>
      </aside>

      {/* MOBILE TOP HEADER */}
      <header className="md:hidden shrink-0 flex items-center justify-between px-4 py-2.5 border-b border-subtle bg-[var(--bg-sidebar)]">
        <div className="flex items-center gap-2">
          <img src="./icon.png" alt="Perlica" className="w-6 h-6 rounded-md object-contain" />
          <span className="font-semibold text-base">Perlica</span>
        </div>
        <div className="flex items-center gap-1.5">
          {githubStatus?.configured && (
            <button
              onClick={handleQuickSyncGithub}
              disabled={syncingQuick}
              title="同步"
              className="p-2 rounded-lg surface text-secondary"
            >
              <RefreshCw className={`w-4 h-4 ${syncingQuick ? 'animate-spin' : ''}`} />
            </button>
          )}
          <button
            onClick={() => setQuickOpen(true)}
            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg btn-primary text-xs font-medium"
          >
            <Plus className="w-3.5 h-3.5" /> 速记
          </button>
          <button
            onClick={() => setTheme((t) => (t === 'dark' ? 'light' : 'dark'))}
            className="p-2 rounded-lg surface text-secondary"
          >
            {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          </button>
        </div>
      </header>

      {/* MAIN CONTENT */}
      <main className="flex-1 overflow-y-auto overflow-x-hidden p-4 sm:p-6 pb-24 md:pb-6 min-w-0">
        {IS_STATIC_MODE && githubStatus && !githubStatus.configured && tab !== 'settings' && (
          <div className="max-w-5xl mx-auto mb-5 rounded-xl surface px-4 py-3 flex items-center justify-between gap-3 flex-wrap text-xs">
            <span className="text-secondary">配置 GitHub Token 以同步电脑端数据</span>
            <button
              onClick={() => setTab('settings')}
              className="px-3 py-1.5 rounded-lg btn-primary font-medium shrink-0"
            >
              去配置
            </button>
          </div>
        )}

        {tab === 'today' && (
          <TodayView
            stats={stats}
            modules={modules}
            todayLogs={todayLogs}
            recentIdeas={ideas}
            onRefresh={refreshAll}
            onOpenNewLog={() => {
              setQuickKind('study');
              setQuickOpen(true);
            }}
            onOpenNewIdea={() => {
              setQuickKind('idea');
              setQuickOpen(true);
            }}
            onSelectLog={(log) => {
              setActiveModuleId(log.module_id);
              setSelectedLogId(log.id);
              setTab('study');
            }}
            onSelectIdea={(idea) => {
              setSelectedIdeaId(idea.id);
              setTab('ideas');
            }}
            onTriggerDailyReview={() => {
              setAiInitialTab('review');
              setAutoTriggerDaily(true);
              setTab('ai');
            }}
            onSelectModule={(modId) => {
              setActiveModuleId(modId);
              setTab('study');
            }}
          />
        )}

        {tab === 'study' && (
          <StudyView
            modules={modules}
            logs={logs}
            activeModuleId={activeModuleId}
            selectedLogId={selectedLogId}
            onSelectModule={setActiveModuleId}
            onSelectLogId={setSelectedLogId}
            onRefresh={refreshAll}
            onToast={showToast}
          />
        )}

        {tab === 'ideas' && (
          <IdeasView
            ideas={ideas}
            selectedIdeaId={selectedIdeaId}
            onSelectIdeaId={setSelectedIdeaId}
            onRefresh={refreshAll}
            onToast={showToast}
          />
        )}

        {tab === 'ai' && (
          <AiHubView
            modules={modules}
            providers={providers}
            initialTab={aiInitialTab}
            autoTriggerDaily={autoTriggerDaily}
            onAutoTriggerConsumed={() => setAutoTriggerDaily(false)}
            onJumpToReference={handleJumpToReference}
            onToast={showToast}
          />
        )}

        {tab === 'settings' && (
          <SettingsView
            providers={providers}
            authStatus={authStatus}
            githubStatus={githubStatus}
            onProvidersChange={refreshAll}
            onDataImported={refreshAll}
            onAuthChanged={refreshAuth}
            onGithubChanged={refreshGithub}
            onToast={showToast}
          />
        )}
      </main>

      {/* MOBILE BOTTOM TAB BAR */}
      <nav className="md:hidden fixed bottom-0 inset-x-0 z-30 border-t border-subtle bg-[var(--bg-sidebar)] px-2 pt-1.5 pb-safe grid grid-cols-5">
        {navItems.map((item) => {
          const Icon = item.icon;
          const active = tab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => setTab(item.id)}
              className={`flex flex-col items-center justify-center gap-0.5 py-1 rounded-lg transition-colors duration-100 ${
                active ? 'text-primary font-medium' : 'text-muted'
              }`}
            >
              <Icon className="w-4 h-4" />
              <span className="text-xs">{item.short}</span>
            </button>
          );
        })}
      </nav>

      {/* QUICK CAPTURE MODAL */}
      {quickOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/50 flex items-end sm:items-center justify-center p-0 sm:p-4"
          onClick={() => setQuickOpen(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="surface w-full sm:max-w-lg rounded-t-xl sm:rounded-xl p-4 space-y-3"
          >
            <div className="flex items-center justify-between">
              <div className="inline-flex items-center gap-1 p-1 rounded-lg surface-elevated text-xs">
                <button
                  onClick={() => setQuickKind('study')}
                  className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-sm font-medium transition-colors duration-100 ${
                    quickKind === 'study' ? 'btn-primary' : 'text-secondary hover:text-primary'
                  }`}
                >
                  <BookOpen className="w-3.5 h-3.5" /> 学习
                </button>
                <button
                  onClick={() => setQuickKind('idea')}
                  className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-sm font-medium transition-colors duration-100 ${
                    quickKind === 'idea' ? 'btn-primary' : 'text-secondary hover:text-primary'
                  }`}
                >
                  <Gamepad2 className="w-3.5 h-3.5" /> 灵感
                </button>
              </div>
              <button onClick={() => setQuickOpen(false)} className="p-1 text-muted hover:text-primary">
                <X className="w-4 h-4" />
              </button>
            </div>

            <textarea
              autoFocus
              rows={5}
              value={quickContent}
              onChange={(e) => setQuickContent(e.target.value)}
              placeholder={quickKind === 'idea' ? '写下游戏灵感...' : '写下今天学了什么...'}
              className="w-full px-3 py-2.5 rounded-lg surface-elevated text-sm leading-relaxed focus:outline-none focus:border-strong resize-none"
            />

            <div className="flex justify-end gap-2">
              <button
                onClick={() => setQuickOpen(false)}
                disabled={quickBusy !== null}
                className="px-3 py-1.5 rounded-lg surface-elevated text-xs font-medium text-secondary hover:text-primary"
              >
                取消
              </button>
              <button
                onClick={() => handleQuickSubmit(false)}
                disabled={quickBusy !== null || !quickContent.trim()}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg surface-elevated hover:border-strong text-xs font-medium disabled:opacity-40"
              >
                {quickBusy === 'save' && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                保存
              </button>
              <button
                onClick={() => handleQuickSubmit(true)}
                disabled={quickBusy !== null || !quickContent.trim()}
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg btn-primary text-xs font-medium disabled:opacity-40"
              >
                {quickBusy === 'ai' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                保存并整理
              </button>
            </div>
          </div>
        </div>
      )}

      {/* TOAST */}
      {toast && (
        <div
          className={`fixed top-4 right-4 z-50 px-3.5 py-2 rounded-lg text-xs font-medium border ${
            toast.type === 'err'
              ? 'bg-rose-600 text-white border-rose-500'
              : 'surface text-primary border-strong'
          }`}
        >
          {toast.msg}
        </div>
      )}
    </div>
  );
}
