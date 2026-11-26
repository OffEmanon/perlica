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
  const [quickModuleId, setQuickModuleId] = useState('');
  const [quickBusy, setQuickBusy] = useState<'save' | 'ai' | null>(null);

  // Toast
  const [toast, setToast] = useState<{ msg: string; type: 'ok' | 'err' } | null>(null);

  const showToast = useCallback((msg: string, type: 'ok' | 'err' = 'ok') => {
    setToast({ msg, type });
    setTimeout(() => {
      setToast((cur) => (cur?.msg === msg ? null : cur));
    }, 3400);
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
      if (m.length > 0) {
        setQuickModuleId((cur) => (m.some((item) => item.id === cur) ? cur : m[0].id));
      } else {
        setQuickModuleId('');
      }
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
        // silent background failure; status shows in Settings
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
      showToast('GitHub 双端同步完成');
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
            showToast('灵感原文已保留，AI 整理完成');
          } catch (aiErr) {
            showToast(`原文已保存，AI 整理失败：${aiErr instanceof Error ? aiErr.message : ''}`, 'err');
          }
        } else {
          showToast('游戏灵感已保存');
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

    const modId = quickModuleId || modules[0]?.id;
    if (!modId) {
      setQuickOpen(false);
      setActiveModuleId('__new__');
      setTab('study');
      showToast('请先创建你的第一个学习板块', 'err');
      return;
    }

    setQuickBusy(autoOrganize ? 'ai' : 'save');
    try {
      const created = await api.createLog({
        module_id: modId,
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
          showToast('学习记录已保留原文，AI 整理归纳完成');
        } catch (aiErr) {
          showToast(`原文已保存，AI 整理失败：${aiErr instanceof Error ? aiErr.message : ''}`, 'err');
        }
      } else {
        showToast('学习记录已保存');
      }
      setActiveModuleId(modId);
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

  // Loading auth check
  if (!authStatus) {
    return (
      <div className="h-screen flex items-center justify-center bg-[var(--bg-app)]">
        <Loader2 className="w-6 h-6 animate-spin text-indigo-400" />
      </div>
    );
  }

  // Lock screen when password is enabled and unauthenticated
  if (authStatus.enabled && !authStatus.authenticated) {
    return (
      <div className="h-screen flex items-center justify-center bg-[var(--bg-app)] p-4">
        <form
          onSubmit={handleLogin}
          className="surface rounded-3xl w-full max-w-sm p-7 space-y-5 shadow-2xl text-center"
        >
          <img
            src="./icon.png"
            alt="Perlica"
            className="w-20 h-20 mx-auto rounded-2xl object-contain shadow-md"
          />
          <div>
            <h1 className="text-xl font-bold">Perlica</h1>
            <p className="text-xs text-muted mt-1">请输入访问密码以解锁你的学习与灵感工作台</p>
          </div>
          <div className="space-y-2 text-left">
            <input
              autoFocus
              type="password"
              value={loginPwd}
              onChange={(e) => setLoginPwd(e.target.value)}
              placeholder="输入访问密码..."
              className="w-full px-4 py-2.5 rounded-xl surface-elevated text-sm focus:outline-none focus:border-indigo-500"
            />
            {loginErr && <p className="text-xs text-rose-400">{loginErr}</p>}
          </div>
          <button
            type="submit"
            disabled={loginBusy || !loginPwd}
            className="w-full py-2.5 rounded-xl bg-indigo-500 hover:bg-indigo-400 text-white text-sm font-semibold inline-flex items-center justify-center gap-1.5 transition disabled:opacity-50"
          >
            {loginBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Lock className="w-4 h-4" />}
            解锁进入
          </button>
        </form>
      </div>
    );
  }

  const today = todayDateString();
  const todayLogs = logs.filter((l) => l.log_date === today);
  const activeProvider = providers.find((p) => p.is_active) || providers[0];

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
    { id: 'settings', label: '设置与同步', short: '设置', icon: Settings },
  ];

  return (
    <div className="h-[100dvh] flex flex-col md:flex-row overflow-hidden bg-[var(--bg-app)] text-[var(--text-primary)]">
      {/* DESKTOP SIDEBAR */}
      <aside className="hidden md:flex md:w-60 lg:w-64 shrink-0 flex-col border-r border-subtle bg-[var(--bg-sidebar)] p-3.5 justify-between">
        <div className="space-y-5 overflow-y-auto">
          {/* Brand */}
          <div className="flex items-center justify-between px-1.5">
            <div className="flex items-center gap-2.5">
              <img
                src="./icon.png"
                alt="Perlica"
                className="w-9 h-9 rounded-xl object-contain shadow-sm"
              />
              <div>
                <div className="font-bold text-sm tracking-tight leading-none">Perlica</div>
                <div className="text-[10px] text-muted mt-0.5">Creator & Study Log</div>
              </div>
            </div>
            <button
              onClick={() => setTheme((t) => (t === 'dark' ? 'light' : 'dark'))}
              title="切换明暗主题"
              className="p-1.5 rounded-lg text-secondary hover:text-primary hover:bg-white/[0.06] transition"
            >
              {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>
          </div>

          {/* Quick Capture Button */}
          <button
            onClick={() => setQuickOpen(true)}
            className="w-full flex items-center justify-between px-3 py-2 rounded-xl surface hover:border-indigo-400 text-xs text-secondary hover:text-primary transition"
          >
            <span className="flex items-center gap-1.5 font-medium">
              <Plus className="w-3.5 h-3.5 text-indigo-400" /> 快速闪念 / 日志
            </span>
            <kbd className="text-[10px] px-1.5 py-0.5 rounded bg-white/[0.06] text-muted font-mono">
              Ctrl K
            </kbd>
          </button>

          {/* Main Nav */}
          <nav className="space-y-1">
            {navItems.map((item) => {
              const Icon = item.icon;
              const active = tab === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => setTab(item.id)}
                  className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-sm font-medium transition ${
                    active
                      ? 'bg-indigo-500/15 text-indigo-400 border border-indigo-500/25'
                      : 'text-secondary hover:text-primary hover:bg-white/[0.04] border border-transparent'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  <span>{item.label}</span>
                </button>
              );
            })}
          </nav>

          {/* Direct Module Shortcuts */}
          <div className="pt-2 border-t border-subtle space-y-1">
            <div className="flex items-center justify-between px-2 mb-1.5">
              <span className="text-[11px] font-medium text-muted uppercase tracking-wider">
                我的学习板块
              </span>
              <button
                onClick={() => {
                  setActiveModuleId('__new__');
                  setTab('study');
                }}
                title="新建板块"
                className="text-muted hover:text-indigo-400 transition"
              >
                <Plus className="w-3.5 h-3.5" />
              </button>
            </div>
            {modules.length === 0 ? (
              <button
                onClick={() => {
                  setActiveModuleId('__new__');
                  setTab('study');
                }}
                className="w-full text-left px-2.5 py-2 rounded-lg text-xs text-muted hover:text-primary hover:bg-white/[0.04] transition"
              >
                + 点击创建第一个板块
              </button>
            ) : (
              modules.map((m) => (
                <button
                  key={m.id}
                  onClick={() => {
                    setActiveModuleId(m.id);
                    setTab('study');
                  }}
                  className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs transition ${
                    tab === 'study' && activeModuleId === m.id
                      ? 'bg-white/[0.08] text-primary font-medium'
                      : 'text-secondary hover:text-primary hover:bg-white/[0.04]'
                  }`}
                >
                  <span className="flex items-center gap-2 truncate">
                    <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: m.color }} />
                    <span>{m.icon}</span>
                    <span className="truncate">{m.name}</span>
                  </span>
                  <span className="text-[10px] text-muted">{m.log_count ?? 0}</span>
                </button>
              ))
            )}
          </div>
        </div>

        {/* Bottom Status Pills: GitHub Sync + AI Engine */}
        <div className="space-y-2 mt-3">
          <button
            onClick={handleQuickSyncGithub}
            disabled={syncingQuick}
            className="w-full p-2.5 rounded-xl surface hover:border-strong text-left transition flex items-center justify-between gap-2"
          >
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 text-[11px] text-muted">
                <Github className="w-3 h-3" />
                <span>GitHub 云同步</span>
              </div>
              <div className="text-xs font-medium truncate mt-0.5">
                {githubStatus?.configured ? `@${githubStatus.username}` : '点击配置双端同步'}
              </div>
            </div>
            {syncingQuick ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin text-indigo-400 shrink-0" />
            ) : (
              <RefreshCw className="w-3.5 h-3.5 text-muted shrink-0" />
            )}
          </button>

          <button
            onClick={() => setTab('settings')}
            className="w-full p-2.5 rounded-xl surface hover:border-strong text-left transition"
          >
            <div className="flex items-center justify-between text-[11px]">
              <span className="text-muted flex items-center gap-1">
                <span
                  className={`w-1.5 h-1.5 rounded-full ${
                    activeProvider?.api_key ? 'bg-emerald-400' : 'bg-amber-400'
                  }`}
                />
                AI 引擎
              </span>
              <span className="text-[10px] text-indigo-400">配置</span>
            </div>
            <div className="text-xs font-medium truncate mt-1">
              {activeProvider ? `${activeProvider.name} · ${activeProvider.model}` : '未配置模型'}
            </div>
          </button>
        </div>
      </aside>

      {/* MOBILE TOP HEADER */}
      <header className="md:hidden shrink-0 flex items-center justify-between px-4 py-2.5 border-b border-subtle bg-[var(--bg-sidebar)]">
        <div className="flex items-center gap-2">
          <img src="./icon.png" alt="Perlica" className="w-7 h-7 rounded-lg object-contain" />
          <span className="font-bold text-sm">Perlica</span>
        </div>
        <div className="flex items-center gap-1.5">
          {githubStatus?.configured && (
            <button
              onClick={handleQuickSyncGithub}
              disabled={syncingQuick}
              title="GitHub 双向同步"
              className="p-1.5 rounded-lg surface text-secondary"
            >
              <RefreshCw className={`w-4 h-4 ${syncingQuick ? 'animate-spin text-indigo-400' : ''}`} />
            </button>
          )}
          <button
            onClick={() => setQuickOpen(true)}
            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-indigo-500 text-white text-xs font-medium"
          >
            <Plus className="w-3.5 h-3.5" /> 速记
          </button>
          <button
            onClick={() => setTheme((t) => (t === 'dark' ? 'light' : 'dark'))}
            className="p-1.5 rounded-lg surface text-secondary"
          >
            {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          </button>
        </div>
      </header>

      {/* MAIN CONTENT */}
      <main className="flex-1 overflow-y-auto overflow-x-hidden p-3.5 sm:p-6 pb-24 md:pb-6 min-w-0">
        {IS_STATIC_MODE && githubStatus && !githubStatus.configured && tab !== 'settings' && (
          <div className="max-w-6xl mx-auto mb-4 rounded-2xl border border-indigo-500/35 bg-indigo-500/10 px-4 py-3 flex items-center justify-between gap-3 flex-wrap text-xs">
            <div className="flex items-center gap-2 text-primary">
              <Github className="w-4 h-4 text-indigo-400 shrink-0" />
              <span>当前正在 GitHub Pages 网页版运行。粘贴你的 GitHub Token 即可立即同步电脑端的所有学习板块、日志与游戏灵感。</span>
            </div>
            <button
              onClick={() => setTab('settings')}
              className="px-3 py-1.5 rounded-lg bg-indigo-500 hover:bg-indigo-400 text-white font-medium shrink-0"
            >
              立即填入 Token 同步
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
            onOpenNewLog={(modId) => {
              if (modules.length === 0) {
                setActiveModuleId('__new__');
                setTab('study');
                return;
              }
              if (modId) setActiveModuleId(modId);
              setQuickKind('study');
              if (modId) setQuickModuleId(modId);
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
      <nav className="md:hidden fixed bottom-0 inset-x-0 z-30 border-t border-subtle bg-[var(--bg-sidebar)]/95 backdrop-blur-md px-2 pt-1.5 pb-safe grid grid-cols-5">
        {navItems.map((item) => {
          const Icon = item.icon;
          const active = tab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => setTab(item.id)}
              className={`flex flex-col items-center justify-center gap-0.5 py-1 rounded-xl transition ${
                active ? 'text-indigo-400' : 'text-muted'
              }`}
            >
              <Icon className="w-5 h-5" />
              <span className="text-[10px] font-medium">{item.short}</span>
            </button>
          );
        })}
      </nav>

      {/* QUICK CAPTURE MODAL */}
      {quickOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4"
          onClick={() => setQuickOpen(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="surface w-full sm:max-w-lg rounded-t-3xl sm:rounded-2xl p-5 space-y-4 shadow-2xl"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 p-1 rounded-xl surface-elevated text-xs">
                <button
                  onClick={() => setQuickKind('study')}
                  className={`px-3 py-1 rounded-lg font-medium transition ${
                    quickKind === 'study' ? 'bg-indigo-500 text-white' : 'text-secondary'
                  }`}
                >
                  📘 今日学习
                </button>
                <button
                  onClick={() => setQuickKind('idea')}
                  className={`px-3 py-1 rounded-lg font-medium transition ${
                    quickKind === 'idea' ? 'bg-amber-500 text-slate-950' : 'text-secondary'
                  }`}
                >
                  🎮 游戏灵感
                </button>
              </div>
              <button onClick={() => setQuickOpen(false)} className="text-muted hover:text-primary">
                <X className="w-4 h-4" />
              </button>
            </div>

            {quickKind === 'study' && (
              <div className="flex items-center gap-1.5 flex-wrap">
                {modules.length === 0 ? (
                  <button
                    onClick={() => {
                      setQuickOpen(false);
                      setActiveModuleId('__new__');
                      setTab('study');
                    }}
                    className="text-xs text-indigo-400 hover:underline"
                  >
                    + 还没有学习板块，点此先新建一个板块
                  </button>
                ) : (
                  modules.map((m) => (
                    <button
                      key={m.id}
                      onClick={() => setQuickModuleId(m.id)}
                      className={`px-2.5 py-1 rounded-lg text-xs border transition ${
                        quickModuleId === m.id
                          ? 'text-white border-transparent'
                          : 'surface-elevated text-secondary'
                      }`}
                      style={quickModuleId === m.id ? { backgroundColor: m.color } : undefined}
                    >
                      {m.icon} {m.name}
                    </button>
                  ))
                )}
              </div>
            )}

            <textarea
              autoFocus
              rows={5}
              value={quickContent}
              onChange={(e) => setQuickContent(e.target.value)}
              placeholder={
                quickKind === 'idea'
                  ? '随手写一段你的游戏灵感（不用起标题，保留原文，可让 AI 帮你忠实整理）...'
                  : '写下今天学了什么（不用起标题，保留原文，可让 AI 帮你自动整理归纳）...'
              }
              className="w-full px-3.5 py-2.5 rounded-xl surface-elevated text-sm focus:outline-none focus:border-indigo-500 resize-none"
            />

            <div className="flex justify-end gap-2 flex-wrap">
              <button
                onClick={() => setQuickOpen(false)}
                disabled={quickBusy !== null}
                className="px-4 py-2 rounded-xl surface-elevated text-xs font-medium"
              >
                取消
              </button>
              <button
                onClick={() => handleQuickSubmit(false)}
                disabled={quickBusy !== null || !quickContent.trim()}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl surface-elevated hover:border-strong text-xs font-medium disabled:opacity-50"
              >
                {quickBusy === 'save' && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                仅保存原文
              </button>
              <button
                onClick={() => handleQuickSubmit(true)}
                disabled={quickBusy !== null || !quickContent.trim()}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-indigo-500 hover:bg-indigo-400 text-white text-xs font-semibold disabled:opacity-50"
              >
                {quickBusy === 'ai' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                保存并 AI 整理
              </button>
            </div>
          </div>
        </div>
      )}

      {/* TOAST */}
      {toast && (
        <div
          className={`fixed top-4 right-4 z-50 px-4 py-2.5 rounded-xl text-xs font-medium shadow-xl border backdrop-blur-md transition ${
            toast.type === 'err'
              ? 'bg-rose-500/90 text-white border-rose-400/40'
              : 'bg-[#171b26]/95 text-white border-indigo-500/40'
          }`}
        >
          {toast.msg}
        </div>
      )}
    </div>
  );
}
