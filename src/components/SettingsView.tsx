import { useEffect, useState } from 'react';
import {
  Check,
  Cloud,
  Cpu,
  Download,
  ExternalLink,
  Eye,
  EyeOff,
  FileDown,
  Github,
  Globe,
  Loader2,
  Lock,
  Plus,
  QrCode,
  RefreshCw,
  RotateCcw,
  Save,
  Sliders,
  Square,
  Trash2,
  Unlock,
  Upload,
  Zap,
} from 'lucide-react';
import type {
  AiProtocol,
  AiProvider,
  AuthStatus,
  GithubSyncStatus,
  NetworkInfo,
  PromptTemplate,
  TunnelStatus,
} from '../types.ts';
import { api, downloadExport, IS_STATIC_MODE } from '../api.ts';

interface SettingsViewProps {
  providers: AiProvider[];
  authStatus: AuthStatus | null;
  githubStatus: GithubSyncStatus | null;
  onProvidersChange: () => void;
  onDataImported: () => void;
  onAuthChanged: () => void;
  onGithubChanged: () => void;
  onToast: (msg: string, type?: 'ok' | 'err') => void;
}

const PROTOCOL_PRESETS: Array<{
  label: string;
  protocol: AiProtocol;
  base_url: string;
  model: string;
}> = [
  { label: '千问 AI 平台', protocol: 'openai', base_url: 'https://maas.qianwenaiapi.com/compatible-mode/v1', model: 'qwen-plus' },
  { label: 'DeepSeek', protocol: 'openai', base_url: 'https://api.deepseek.com/v1', model: 'deepseek-chat' },
  { label: 'OpenAI', protocol: 'openai', base_url: 'https://api.openai.com/v1', model: 'gpt-4o-mini' },
  { label: 'Google Gemini', protocol: 'gemini', base_url: 'https://generativelanguage.googleapis.com/v1beta', model: 'gemini-2.5-flash' },
  { label: 'Anthropic Claude', protocol: 'anthropic', base_url: 'https://api.anthropic.com', model: 'claude-3-7-sonnet-latest' },
  { label: '本地 Ollama', protocol: 'openai', base_url: 'http://127.0.0.1:11434/v1', model: 'qwen2.5:14b' },
];

export function SettingsView({
  providers,
  authStatus,
  githubStatus,
  onProvidersChange,
  onDataImported,
  onAuthChanged,
  onGithubChanged,
  onToast,
}: SettingsViewProps) {
  const [section, setSection] = useState<'sync' | 'models' | 'prompts' | 'data'>('sync');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showKey, setShowKey] = useState<Record<string, boolean>>({});
  const [testingId, setTestingId] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, AiProvider>>({});

  const [adding, setAdding] = useState(false);
  const [newProv, setNewProv] = useState({
    name: '',
    protocol: 'openai' as AiProtocol,
    base_url: 'https://api.openai.com/v1',
    api_key: '',
    model: 'gpt-4o-mini',
    temperature: 0.7,
    max_tokens: 2048,
    is_active: 1,
  });

  const [prompts, setPrompts] = useState<PromptTemplate[]>([]);
  const [savingPromptId, setSavingPromptId] = useState<string | null>(null);
  const [network, setNetwork] = useState<NetworkInfo | null>(null);
  const [tunnel, setTunnel] = useState<TunnelStatus | null>(null);
  const [tunnelBusy, setTunnelBusy] = useState(false);

  const [ghToken, setGhToken] = useState('');
  const [ghGistId, setGhGistId] = useState('');
  const [ghAutoSync, setGhAutoSync] = useState(true);
  const [ghBusy, setGhBusy] = useState(false);

  const [newPassword, setNewPassword] = useState('');
  const [authBusy, setAuthBusy] = useState(false);
  const [resetBusy, setResetBusy] = useState(false);

  useEffect(() => {
    const map: Record<string, AiProvider> = {};
    for (const p of providers) map[p.id] = { ...p };
    setDrafts(map);
  }, [providers]);

  useEffect(() => {
    if (githubStatus) {
      setGhGistId(githubStatus.gistId || '');
      setGhAutoSync(githubStatus.autoSync);
    }
  }, [githubStatus]);

  useEffect(() => {
    api.getPrompts().then(setPrompts).catch(() => {});
    api.getNetwork().then(setNetwork).catch(() => {});
    api.getTunnelStatus().then(setTunnel).catch(() => {});
  }, []);

  const handleConnectGithub = async () => {
    if (!ghToken.trim() && !githubStatus?.configured) {
      onToast('请先填入 GitHub Token（勾选 gist 权限）', 'err');
      return;
    }
    setGhBusy(true);
    try {
      await api.configureGithubSync({
        token: ghToken.trim() || undefined,
        gistId: ghGistId.trim() || undefined,
        autoSync: ghAutoSync,
      });
      setGhToken('');
      onGithubChanged();
      onDataImported();
      onToast('同步成功');
    } catch (e) {
      onToast(e instanceof Error ? e.message : '同步失败', 'err');
    } finally {
      setGhBusy(false);
    }
  };

  const handleSyncGithubNow = async () => {
    setGhBusy(true);
    try {
      await api.syncGithubNow();
      onGithubChanged();
      onDataImported();
      onToast('已同步');
    } catch (e) {
      onToast(e instanceof Error ? e.message : '同步失败', 'err');
    } finally {
      setGhBusy(false);
    }
  };

  const handleDisconnectGithub = async () => {
    if (!confirm('确定断开 GitHub 同步吗？（云端数据不会删除）')) return;
    await api.disconnectGithub();
    onGithubChanged();
    onToast('已断开');
  };

  const handleSetPassword = async () => {
    if (newPassword.trim().length < 4) {
      onToast('访问密码至少 4 位', 'err');
      return;
    }
    setAuthBusy(true);
    try {
      await api.updatePassword({ newPassword: newPassword.trim() });
      setNewPassword('');
      onAuthChanged();
      onToast('密码锁已开启');
    } catch (e) {
      onToast(e instanceof Error ? e.message : '设置失败', 'err');
    } finally {
      setAuthBusy(false);
    }
  };

  const handleDisablePassword = async () => {
    if (!confirm('确定关闭访问密码锁吗？')) return;
    setAuthBusy(true);
    try {
      await api.updatePassword({ disable: true });
      onAuthChanged();
      onToast('已关闭');
    } catch (e) {
      onToast(e instanceof Error ? e.message : '关闭失败', 'err');
    } finally {
      setAuthBusy(false);
    }
  };

  const handleStartTunnel = async () => {
    setTunnelBusy(true);
    try {
      const st = await api.startTunnel();
      setTunnel(st);
      if (st.url) onToast('公网隧道已开启');
      else if (st.error) onToast(st.error, 'err');
    } catch (e) {
      onToast(e instanceof Error ? e.message : '启动失败', 'err');
    } finally {
      setTunnelBusy(false);
    }
  };

  const handleStopTunnel = async () => {
    const st = await api.stopTunnel();
    setTunnel(st);
    onToast('隧道已停止');
  };

  const handleResetAll = async (keepAiConfig: boolean) => {
    if (!confirm('确定清空所有学习记录、游戏灵感、复盘与对话记录吗？（保留 AI 配置）')) return;
    setResetBusy(true);
    try {
      await api.resetData(keepAiConfig);
      onDataImported();
      onProvidersChange();
      onToast('已清空记录');
    } catch (e) {
      onToast(e instanceof Error ? e.message : '重置失败', 'err');
    } finally {
      setResetBusy(false);
    }
  };

  const handleSaveProvider = async (id: string) => {
    const draft = drafts[id];
    if (!draft) return;
    try {
      await api.updateProvider(id, draft);
      onProvidersChange();
      setEditingId(null);
      onToast('已保存');
    } catch (e) {
      onToast(e instanceof Error ? e.message : '保存失败', 'err');
    }
  };

  const handleActivateProvider = async (p: AiProvider) => {
    await api.updateProvider(p.id, { is_active: 1 });
    onProvidersChange();
    onToast(`默认模型：${p.name}`);
  };

  const handleTestProvider = async (id: string) => {
    setTestingId(id);
    try {
      if (drafts[id]) {
        await api.updateProvider(id, drafts[id]);
        onProvidersChange();
      }
      const res = await api.testProvider(id);
      onToast(`连接正常 (${res.latencyMs}ms)`);
    } catch (e) {
      onToast(e instanceof Error ? e.message : '连接失败', 'err');
    } finally {
      setTestingId(null);
    }
  };

  const handleCreateProvider = async () => {
    if (!newProv.name.trim() || !newProv.base_url.trim() || !newProv.model.trim()) {
      onToast('请填写名称、Base URL 和模型名', 'err');
      return;
    }
    try {
      await api.createProvider(newProv);
      setAdding(false);
      setNewProv({
        name: '',
        protocol: 'openai',
        base_url: 'https://api.openai.com/v1',
        api_key: '',
        model: 'gpt-4o-mini',
        temperature: 0.7,
        max_tokens: 2048,
        is_active: 1,
      });
      onProvidersChange();
      onToast('已添加模型');
    } catch (e) {
      onToast(e instanceof Error ? e.message : '添加失败', 'err');
    }
  };

  const handleDeleteProvider = async (id: string) => {
    if (!confirm('确定删除这个模型配置吗？')) return;
    await api.deleteProvider(id);
    onProvidersChange();
    onToast('已删除');
  };

  const handleSavePrompt = async (tpl: PromptTemplate) => {
    setSavingPromptId(tpl.id);
    try {
      await api.updatePrompt(tpl.id, { system_prompt: tpl.system_prompt });
      onToast('已保存');
    } catch (e) {
      onToast(e instanceof Error ? e.message : '保存失败', 'err');
    } finally {
      setSavingPromptId(null);
    }
  };

  const handleImportFile = async (file: File) => {
    try {
      const text = await file.text();
      const json = JSON.parse(text);
      const res = await api.importJson(json);
      onDataImported();
      onToast(`导入 ${res.importedLogs} 条学习记录、${res.importedIdeas} 条灵感`);
    } catch (e) {
      onToast(e instanceof Error ? e.message : '导入失败', 'err');
    }
  };

  return (
    <div className="max-w-5xl mx-auto space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <h1 className="text-xl font-semibold tracking-tight">设置</h1>

        <div className="flex items-center gap-1 p-1 rounded-lg surface overflow-x-auto max-w-full">
          {(
            [
              ['sync', '同步', Github],
              ['models', '模型', Cpu],
              ['prompts', '提示词', Sliders],
              ['data', '数据', Download],
            ] as const
          ).map(([key, label, Icon]) => (
            <button
              key={key}
              onClick={() => setSection(key)}
              className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-sm text-xs font-medium whitespace-nowrap transition-colors duration-100 ${
                section === key ? 'btn-primary' : 'text-secondary hover:text-primary'
              }`}
            >
              <Icon className="w-3.5 h-3.5" /> {label}
            </button>
          ))}
        </div>
      </div>

      {/* SECTION: SYNC */}
      {section === 'sync' && (
        <div key="sync" className="space-y-4 anim-view">
          <div className="surface rounded-xl p-5 space-y-4">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div className="flex items-center gap-2.5">
                <h2 className="text-base font-semibold">GitHub 私有 Gist 同步</h2>
                {githubStatus?.configured && (
                  <span className="text-xs px-2 py-0.5 rounded-md bg-[var(--bg-elevated)] text-secondary">
                    @{githubStatus.username}
                  </span>
                )}
              </div>
              {githubStatus?.configured && (
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleSyncGithubNow}
                    disabled={ghBusy}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg btn-primary text-xs font-medium disabled:opacity-50"
                  >
                    {ghBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                    同步
                  </button>
                  <button
                    onClick={handleDisconnectGithub}
                    className="px-2.5 py-1.5 rounded-lg surface-elevated text-xs text-rose-500"
                  >
                    断开
                  </button>
                </div>
              )}
            </div>

            <div className="grid sm:grid-cols-2 gap-3 text-xs">
              <label className="space-y-1.5 sm:col-span-2">
                <span className="text-muted flex items-center justify-between">
                  <span>GitHub Token（勾选 gist 权限）</span>
                  <a
                    href="https://github.com/settings/tokens/new?scopes=gist&description=Perlica-Sync"
                    target="_blank"
                    rel="noreferrer"
                    className="text-secondary hover:text-primary inline-flex items-center gap-1 underline"
                  >
                    生成 Token <ExternalLink className="w-3 h-3" />
                  </a>
                </span>
                <input
                  type="password"
                  value={ghToken}
                  onChange={(e) => setGhToken(e.target.value)}
                  placeholder={githubStatus?.configured ? '已保存（如需更换请重新输入）' : 'ghp_...'}
                  className="w-full px-3 py-2 rounded-lg surface-elevated font-mono focus:outline-none focus:border-strong"
                />
              </label>

              <label className="space-y-1.5">
                <span className="text-muted">Gist ID（留空自动匹配）</span>
                <input
                  value={ghGistId}
                  onChange={(e) => setGhGistId(e.target.value)}
                  placeholder="自动匹配 perlica-sync.json"
                  className="w-full px-3 py-2 rounded-lg surface-elevated font-mono focus:outline-none focus:border-strong"
                />
              </label>

              <div className="flex items-end justify-between gap-2">
                <label className="flex items-center gap-2 py-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={ghAutoSync}
                    onChange={(e) => setGhAutoSync(e.target.checked)}
                    className="w-4 h-4"
                  />
                  <span className="text-secondary">自动同步</span>
                </label>

                <button
                  onClick={handleConnectGithub}
                  disabled={ghBusy}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg btn-primary font-medium disabled:opacity-50 shrink-0"
                >
                  {ghBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Cloud className="w-3.5 h-3.5" />}
                  {githubStatus?.configured ? '保存' : '连接'}
                </button>
              </div>
            </div>

            {githubStatus?.configured && (
              <div className="pt-3 border-t border-subtle text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div className="text-muted tabular-nums">
                  最近同步：
                  <span className="text-secondary">
                    {githubStatus.lastSyncAt
                      ? new Date(githubStatus.lastSyncAt).toLocaleString('zh-CN', { hour12: false })
                      : '未同步'}
                  </span>
                  {githubStatus.lastError && <span className="text-rose-500 ml-2">{githubStatus.lastError}</span>}
                </div>
                {githubStatus.gistUrl && (
                  <a
                    href={githubStatus.gistUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="text-secondary hover:text-primary inline-flex items-center gap-1 underline shrink-0"
                  >
                    打开 Gist <ExternalLink className="w-3 h-3" />
                  </a>
                )}
              </div>
            )}
          </div>

          {!IS_STATIC_MODE && (
            <div className="grid md:grid-cols-2 gap-4">
              {/* Password Lock */}
              <div className="surface rounded-xl p-5 space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold">访问密码锁</h3>
                  <span className="text-xs text-muted">{authStatus?.enabled ? '已开启' : '未开启'}</span>
                </div>
                {authStatus?.envLocked ? (
                  <p className="text-xs text-secondary">由环境变量 PERLICA_PASSWORD 控制</p>
                ) : (
                  <div className="flex items-center gap-2">
                    <input
                      type="password"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      placeholder="至少 4 位密码"
                      className="flex-1 px-3 py-1.5 rounded-lg surface-elevated text-xs focus:outline-none focus:border-strong"
                    />
                    <button
                      onClick={handleSetPassword}
                      disabled={authBusy}
                      className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg btn-primary text-xs font-medium shrink-0"
                    >
                      <Lock className="w-3.5 h-3.5" /> {authStatus?.enabled ? '修改' : '开启'}
                    </button>
                    {authStatus?.enabled && (
                      <button
                        onClick={handleDisablePassword}
                        disabled={authBusy}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg surface-elevated text-xs text-rose-500 shrink-0"
                      >
                        <Unlock className="w-3.5 h-3.5" /> 关闭
                      </button>
                    )}
                  </div>
                )}
              </div>

              {/* Tunnel & LAN */}
              <div className="surface rounded-xl p-5 space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-sm font-semibold">局域网与公网隧道</h3>
                  {tunnel?.running ? (
                    <button
                      onClick={handleStopTunnel}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg surface-elevated text-rose-500 text-xs font-medium"
                    >
                      <Square className="w-3 h-3" /> 停止
                    </button>
                  ) : (
                    <button
                      onClick={handleStartTunnel}
                      disabled={tunnelBusy}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg surface-elevated hover:border-strong text-xs font-medium disabled:opacity-50"
                    >
                      {tunnelBusy ? <Loader2 className="w-3 h-3 animate-spin" /> : <Globe className="w-3 h-3" />}
                      开启公网隧道
                    </button>
                  )}
                </div>

                {tunnel?.url && (
                  <div className="px-3 py-1.5 rounded-lg surface-elevated font-mono text-xs select-all break-all">
                    {tunnel.url}
                  </div>
                )}
                {network?.urls && network.urls.length > 0 && (
                  <div className="flex items-center gap-2 text-xs text-secondary font-mono">
                    <QrCode className="w-3.5 h-3.5 text-muted shrink-0" />
                    <span className="select-all truncate">{network.urls[0]}</span>
                  </div>
                )}
                {tunnel?.error && <p className="text-xs text-rose-500">{tunnel.error}</p>}
              </div>
            </div>
          )}
        </div>
      )}

      {/* SECTION: MODELS */}
      {section === 'models' && (
        <div key="models" className="space-y-4 anim-view">
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted">模型与 API Key 随私有 Gist 同步</span>
            <button
              onClick={() => setAdding((v) => !v)}
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg btn-primary text-xs font-medium shrink-0"
            >
              <Plus className="w-3.5 h-3.5" /> 新增模型
            </button>
          </div>

          {adding && (
            <div className="surface rounded-xl p-4 space-y-3">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <span className="text-sm font-semibold">新增模型</span>
                <div className="flex items-center gap-1.5 flex-wrap">
                  {PROTOCOL_PRESETS.map((preset) => (
                    <button
                      key={preset.label}
                      type="button"
                      onClick={() =>
                        setNewProv({
                          ...newProv,
                          name: preset.label,
                          protocol: preset.protocol,
                          base_url: preset.base_url,
                          model: preset.model,
                        })
                      }
                      className="text-xs px-2 py-0.5 rounded-md surface-elevated hover:border-strong text-secondary"
                    >
                      {preset.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid sm:grid-cols-2 gap-3 text-xs">
                <label className="space-y-1">
                  <span className="text-muted">名称</span>
                  <input
                    value={newProv.name}
                    onChange={(e) => setNewProv({ ...newProv, name: e.target.value })}
                    placeholder="如：千问 DeepSeek"
                    className="w-full px-3 py-2 rounded-lg surface-elevated focus:outline-none focus:border-strong"
                  />
                </label>
                <label className="space-y-1">
                  <span className="text-muted">协议</span>
                  <select
                    value={newProv.protocol}
                    onChange={(e) => setNewProv({ ...newProv, protocol: e.target.value as AiProtocol })}
                    className="w-full px-3 py-2 rounded-lg surface-elevated focus:outline-none"
                  >
                    <option value="openai" className="bg-[var(--bg-surface)] text-[var(--text-primary)]">OpenAI 兼容</option>
                    <option value="gemini" className="bg-[var(--bg-surface)] text-[var(--text-primary)]">Google Gemini</option>
                    <option value="anthropic" className="bg-[var(--bg-surface)] text-[var(--text-primary)]">Anthropic Claude</option>
                  </select>
                </label>
                <label className="space-y-1">
                  <span className="text-muted">Base URL</span>
                  <input
                    value={newProv.base_url}
                    onChange={(e) => setNewProv({ ...newProv, base_url: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg surface-elevated focus:outline-none font-mono"
                  />
                </label>
                <label className="space-y-1">
                  <span className="text-muted">Model ID</span>
                  <input
                    value={newProv.model}
                    onChange={(e) => setNewProv({ ...newProv, model: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg surface-elevated focus:outline-none font-mono"
                  />
                </label>
                <label className="space-y-1 sm:col-span-2">
                  <span className="text-muted">API Key</span>
                  <input
                    type="password"
                    value={newProv.api_key}
                    onChange={(e) => setNewProv({ ...newProv, api_key: e.target.value })}
                    placeholder="sk-..."
                    className="w-full px-3 py-2 rounded-lg surface-elevated focus:outline-none font-mono"
                  />
                </label>
              </div>
              <div className="flex justify-end gap-2">
                <button onClick={() => setAdding(false)} className="px-3 py-1.5 rounded-lg surface-elevated text-xs">
                  取消
                </button>
                <button onClick={handleCreateProvider} className="px-3.5 py-1.5 rounded-lg btn-primary text-xs font-medium">
                  保存
                </button>
              </div>
            </div>
          )}

          <div className="space-y-2.5">
            {providers.map((p) => {
              const draft = drafts[p.id] || p;
              const isOpen = editingId === p.id || !p.api_key;
              return (
                <div
                  key={p.id}
                  className={`surface rounded-xl p-4 space-y-3 ${p.is_active ? 'border-strong' : ''}`}
                >
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-sm">{p.name}</span>
                      <span className="text-xs px-2 py-0.5 rounded-md bg-[var(--bg-elevated)] text-secondary font-mono">
                        {p.model}
                      </span>
                      {p.is_active === 1 && (
                        <span className="text-xs text-emerald-500 inline-flex items-center gap-1 font-medium">
                          <Check className="w-3.5 h-3.5" /> 默认
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-1.5">
                      {p.is_active !== 1 && (
                        <button
                          onClick={() => handleActivateProvider(p)}
                          className="px-2.5 py-1 rounded-lg surface-elevated hover:border-strong text-xs"
                        >
                          设为默认
                        </button>
                      )}
                      <button
                        onClick={() => handleTestProvider(p.id)}
                        disabled={testingId === p.id}
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg surface-elevated hover:border-strong text-xs"
                      >
                        {testingId === p.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Zap className="w-3.5 h-3.5" />}
                        测试
                      </button>
                      <button
                        onClick={() => setEditingId(editingId === p.id ? null : p.id)}
                        className="px-2.5 py-1 rounded-lg surface-elevated text-xs text-secondary"
                      >
                        {isOpen ? '收起' : '编辑'}
                      </button>
                      <button onClick={() => handleDeleteProvider(p.id)} className="p-1.5 rounded-lg text-muted hover:text-rose-500">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  {isOpen && (
                    <div className="grid sm:grid-cols-2 gap-3 pt-3 border-t border-subtle text-xs">
                      <label className="space-y-1">
                        <span className="text-muted">Base URL</span>
                        <input
                          value={draft.base_url}
                          onChange={(e) => setDrafts({ ...drafts, [p.id]: { ...draft, base_url: e.target.value } })}
                          className="w-full px-3 py-1.5 rounded-lg surface-elevated font-mono focus:outline-none"
                        />
                      </label>
                      <label className="space-y-1">
                        <span className="text-muted">Model ID</span>
                        <input
                          value={draft.model}
                          onChange={(e) => setDrafts({ ...drafts, [p.id]: { ...draft, model: e.target.value } })}
                          className="w-full px-3 py-1.5 rounded-lg surface-elevated font-mono focus:outline-none"
                        />
                      </label>
                      <label className="space-y-1 sm:col-span-2">
                        <span className="text-muted">API Key</span>
                        <div className="flex items-center gap-1.5">
                          <input
                            type={showKey[p.id] ? 'text' : 'password'}
                            value={draft.api_key}
                            onChange={(e) => setDrafts({ ...drafts, [p.id]: { ...draft, api_key: e.target.value } })}
                            placeholder="填入 API Key"
                            className="flex-1 px-3 py-1.5 rounded-lg surface-elevated font-mono focus:outline-none"
                          />
                          <button
                            type="button"
                            onClick={() => setShowKey({ ...showKey, [p.id]: !showKey[p.id] })}
                            className="p-2 rounded-lg surface-elevated text-secondary"
                          >
                            {showKey[p.id] ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                          </button>
                          <button
                            type="button"
                            onClick={() => handleSaveProvider(p.id)}
                            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg btn-primary font-medium"
                          >
                            <Save className="w-3.5 h-3.5" /> 保存
                          </button>
                        </div>
                      </label>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* SECTION: PROMPTS */}
      {section === 'prompts' && (
        <div key="prompts" className="space-y-3 anim-view">
          {prompts.map((tpl) => (
            <div key={tpl.id} className="surface rounded-xl p-4 space-y-2.5">
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-sm font-semibold">{tpl.name}</h3>
                <button
                  onClick={() => handleSavePrompt(tpl)}
                  disabled={savingPromptId === tpl.id}
                  className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg btn-primary text-xs font-medium shrink-0"
                >
                  {savingPromptId === tpl.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                  保存
                </button>
              </div>
              <textarea
                rows={4}
                value={tpl.system_prompt}
                onChange={(e) =>
                  setPrompts((prev) =>
                    prev.map((item) => (item.id === tpl.id ? { ...item, system_prompt: e.target.value } : item))
                  )
                }
                className="w-full p-3 rounded-lg surface-elevated text-xs font-mono leading-relaxed focus:outline-none focus:border-strong"
              />
            </div>
          ))}
        </div>
      )}

      {/* SECTION: DATA */}
      {section === 'data' && (
        <div key="data" className="space-y-4 anim-view">
          <div className="grid sm:grid-cols-3 gap-3">
            <button
              type="button"
              onClick={() => downloadExport('json')}
              className="surface rounded-xl p-4 hover:border-strong transition-colors duration-100 space-y-1.5 block text-left"
            >
              <Download className="w-4 h-4 text-secondary" />
              <h3 className="text-sm font-semibold">导出 JSON</h3>
              <p className="text-xs text-muted">完整数据备份</p>
            </button>

            <button
              type="button"
              onClick={() => downloadExport('markdown')}
              className="surface rounded-xl p-4 hover:border-strong transition-colors duration-100 space-y-1.5 block text-left"
            >
              <FileDown className="w-4 h-4 text-secondary" />
              <h3 className="text-sm font-semibold">导出 Markdown</h3>
              <p className="text-xs text-muted">纯文本归档</p>
            </button>

            <label className="surface rounded-xl p-4 hover:border-strong transition-colors duration-100 space-y-1.5 cursor-pointer block">
              <Upload className="w-4 h-4 text-secondary" />
              <h3 className="text-sm font-semibold">导入 JSON</h3>
              <p className="text-xs text-muted">合并恢复备份</p>
              <input
                type="file"
                accept="application/json"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleImportFile(file);
                }}
              />
            </label>
          </div>

          <div className="surface rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold">清空记录</h3>
              <p className="text-xs text-muted mt-0.5">保留 AI 模型与提示词配置</p>
            </div>
            <button
              onClick={() => handleResetAll(true)}
              disabled={resetBusy}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg surface-elevated text-rose-500 hover:border-rose-500/40 text-xs font-medium shrink-0 disabled:opacity-50"
            >
              {resetBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RotateCcw className="w-3.5 h-3.5" />}
              清空记录
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
