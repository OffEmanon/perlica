import { useEffect, useState } from 'react';
import {
  AlertTriangle,
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
  ShieldCheck,
  Sliders,
  Smartphone,
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
  { label: 'DeepSeek', protocol: 'openai', base_url: 'https://api.deepseek.com/v1', model: 'deepseek-chat' },
  { label: 'OpenAI', protocol: 'openai', base_url: 'https://api.openai.com/v1', model: 'gpt-4o-mini' },
  { label: 'Google Gemini (原生)', protocol: 'gemini', base_url: 'https://generativelanguage.googleapis.com/v1beta', model: 'gemini-2.5-flash' },
  { label: 'Anthropic Claude', protocol: 'anthropic', base_url: 'https://api.anthropic.com', model: 'claude-3-7-sonnet-latest' },
  { label: '本地 Ollama', protocol: 'openai', base_url: 'http://127.0.0.1:11434/v1', model: 'qwen2.5:14b' },
  { label: 'SiliconFlow / 硅基流动', protocol: 'openai', base_url: 'https://api.siliconflow.cn/v1', model: 'deepseek-ai/DeepSeek-V3' },
  { label: 'OpenRouter', protocol: 'openai', base_url: 'https://openrouter.ai/api/v1', model: 'google/gemini-2.5-flash' },
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

  // New provider form
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

  // Prompts, Network, Tunnel
  const [prompts, setPrompts] = useState<PromptTemplate[]>([]);
  const [savingPromptId, setSavingPromptId] = useState<string | null>(null);
  const [network, setNetwork] = useState<NetworkInfo | null>(null);
  const [tunnel, setTunnel] = useState<TunnelStatus | null>(null);
  const [tunnelBusy, setTunnelBusy] = useState(false);

  // GitHub Sync form
  const [ghToken, setGhToken] = useState('');
  const [ghGistId, setGhGistId] = useState('');
  const [ghAutoSync, setGhAutoSync] = useState(true);
  const [ghBusy, setGhBusy] = useState(false);

  // Auth password form
  const [newPassword, setNewPassword] = useState('');
  const [authBusy, setAuthBusy] = useState(false);

  // Reset state
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

  // GitHub Sync handlers
  const handleConnectGithub = async () => {
    if (!ghToken.trim() && !githubStatus?.configured) {
      onToast('请先填入 GitHub Personal Access Token（勾选 gist 权限）', 'err');
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
      onToast('GitHub 私有云双向同步成功！');
    } catch (e) {
      onToast(e instanceof Error ? e.message : 'GitHub 同步失败', 'err');
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
      onToast('已与 GitHub 完成双向合并同步');
    } catch (e) {
      onToast(e instanceof Error ? e.message : '同步失败', 'err');
    } finally {
      setGhBusy(false);
    }
  };

  const handleDisconnectGithub = async () => {
    if (!confirm('确定断开 GitHub 同步吗？（不会删除已同步到 GitHub Gist 的云端数据）')) return;
    await api.disconnectGithub();
    onGithubChanged();
    onToast('已断开 GitHub 同步');
  };

  // Password Lock handlers
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
      onToast('访问密码锁已启用！外网新设备打开时需先验证密码');
    } catch (e) {
      onToast(e instanceof Error ? e.message : '设置密码失败', 'err');
    } finally {
      setAuthBusy(false);
    }
  };

  const handleDisablePassword = async () => {
    if (!confirm('关闭密码锁后，任何拿到链接的人都可以直接访问，确定关闭吗？')) return;
    setAuthBusy(true);
    try {
      await api.updatePassword({ disable: true });
      onAuthChanged();
      onToast('访问密码锁已关闭');
    } catch (e) {
      onToast(e instanceof Error ? e.message : '关闭失败', 'err');
    } finally {
      setAuthBusy(false);
    }
  };

  // Tunnel handlers
  const handleStartTunnel = async () => {
    setTunnelBusy(true);
    try {
      const st = await api.startTunnel();
      setTunnel(st);
      if (st.url) onToast('公网 HTTPS 隧道已开启，手机不连同一 Wi-Fi 也能直接访问！');
      else if (st.error) onToast(st.error, 'err');
    } catch (e) {
      onToast(e instanceof Error ? e.message : '启动隧道失败', 'err');
    } finally {
      setTunnelBusy(false);
    }
  };

  const handleStopTunnel = async () => {
    const st = await api.stopTunnel();
    setTunnel(st);
    onToast('公网隧道已关闭');
  };

  // Reset handler
  const handleResetAll = async (keepAiConfig: boolean) => {
    const msg = keepAiConfig
      ? '确定清空所有学习板块、学习日志、游戏灵感、AI 复盘与对话记录吗？（将保留 AI API Key 与提示词配置）'
      : '确定彻底重置整个软件（包括清除所有日志、灵感以及 AI API Key）吗？';
    if (!confirm(msg)) return;
    setResetBusy(true);
    try {
      await api.resetData(keepAiConfig);
      onDataImported();
      onProvidersChange();
      onToast('已重置清空数据，重新开始吧！');
    } catch (e) {
      onToast(e instanceof Error ? e.message : '重置失败', 'err');
    } finally {
      setResetBusy(false);
    }
  };

  // AI Provider handlers
  const handleSaveProvider = async (id: string) => {
    const draft = drafts[id];
    if (!draft) return;
    try {
      await api.updateProvider(id, draft);
      onProvidersChange();
      setEditingId(null);
      onToast(`模型「${draft.name}」配置已保存`);
    } catch (e) {
      onToast(e instanceof Error ? e.message : '保存失败', 'err');
    }
  };

  const handleActivateProvider = async (p: AiProvider) => {
    await api.updateProvider(p.id, { is_active: 1 });
    onProvidersChange();
    onToast(`已切换默认模型为 ${p.name}`);
  };

  const handleTestProvider = async (id: string) => {
    setTestingId(id);
    try {
      if (drafts[id]) {
        await api.updateProvider(id, drafts[id]);
        onProvidersChange();
      }
      const res = await api.testProvider(id);
      onToast(`连接成功！延迟 ${res.latencyMs}ms，返回：${res.reply}`);
    } catch (e) {
      onToast(e instanceof Error ? e.message : '连接测试失败', 'err');
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
      onToast('已添加新模型配置');
    } catch (e) {
      onToast(e instanceof Error ? e.message : '添加失败', 'err');
    }
  };

  const handleDeleteProvider = async (id: string) => {
    if (!confirm('确定删除这个模型配置吗？')) return;
    await api.deleteProvider(id);
    onProvidersChange();
    onToast('模型配置已删除');
  };

  const handleSavePrompt = async (tpl: PromptTemplate) => {
    setSavingPromptId(tpl.id);
    try {
      await api.updatePrompt(tpl.id, { system_prompt: tpl.system_prompt });
      onToast(`提示词「${tpl.name}」已更新`);
    } catch (e) {
      onToast(e instanceof Error ? e.message : '更新失败', 'err');
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
      onToast(`导入成功：${res.importedModules} 板块，${res.importedLogs} 日志，${res.importedIdeas} 灵感`);
    } catch (e) {
      onToast(e instanceof Error ? e.message : '导入 JSON 失败', 'err');
    }
  };

  return (
    <div className="max-w-5xl mx-auto space-y-5">
      <div>
        <h1 className="text-xl font-bold">系统、跨端同步与 AI 设置</h1>
        <p className="text-xs text-muted mt-0.5">
          配置 GitHub 私有云双端同步、外网访问密码锁、公网穿透与多模型 API Key
        </p>
      </div>

      {/* Sub-navigation */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
        {(
          [
            ['sync', 'GitHub 同步 & 跨网访问', Github],
            ['models', 'AI 模型与 API Key', Cpu],
            ['prompts', '自定义 AI 提示词', Sliders],
            ['data', '备份、导出与重置', Download],
          ] as const
        ).map(([key, label, Icon]) => (
          <button
            key={key}
            onClick={() => setSection(key)}
            className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-medium whitespace-nowrap transition ${
              section === key
                ? 'bg-indigo-500 text-white'
                : 'surface text-secondary hover:text-primary'
            }`}
          >
            <Icon className="w-3.5 h-3.5" /> {label}
          </button>
        ))}
      </div>

      {/* SECTION 0: GITHUB SYNC & CROSS-NETWORK ACCESS */}
      {section === 'sync' && (
        <div className="space-y-4">
          {/* Card 1: GitHub Private Gist Sync */}
          <div className="surface rounded-2xl p-5 space-y-4 border-indigo-500/30">
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div className="space-y-1">
                <div className="flex items-center gap-2 font-semibold text-sm">
                  <Github className="w-4 h-4 text-indigo-400" /> GitHub 私有云双向同步（推荐）
                  {githubStatus?.configured && (
                    <span className="text-[11px] px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 font-medium">
                      已连接 @{githubStatus.username}
                    </span>
                  )}
                </div>
                <p className="text-xs text-secondary leading-relaxed">
                  将你的板块、学习日志、游戏灵感和 AI 复盘自动双向合并到你的 <strong>GitHub 私有（Secret）Gist</strong>。
                  电脑、云端部署或任意新设备只需填入同一个 GitHub Token，即可自动发现云端数据并实时互通（不同网络也能同步，且不包含你的 AI API Key 以保护隐私）。
                </p>
              </div>
              {githubStatus?.configured && (
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleSyncGithubNow}
                    disabled={ghBusy}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-indigo-500 hover:bg-indigo-400 text-white text-xs font-medium disabled:opacity-50"
                  >
                    {ghBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                    立即双向同步
                  </button>
                  <button
                    onClick={handleDisconnectGithub}
                    className="px-2.5 py-1.5 rounded-xl surface-elevated text-xs text-rose-400 hover:border-rose-400/40"
                  >
                    断开
                  </button>
                </div>
              )}
            </div>

            <div className="grid sm:grid-cols-2 gap-3 text-xs">
              <label className="space-y-1 sm:col-span-2">
                <span className="text-muted flex items-center justify-between">
                  <span>GitHub Personal Access Token（Classic，仅需勾选 gist 权限）</span>
                  <a
                    href="https://github.com/settings/tokens/new?scopes=gist&description=Perlica-Sync"
                    target="_blank"
                    rel="noreferrer"
                    className="text-indigo-400 hover:underline inline-flex items-center gap-0.5"
                  >
                    一键前往 GitHub 生成 Token <ExternalLink className="w-3 h-3" />
                  </a>
                </span>
                <input
                  type="password"
                  value={ghToken}
                  onChange={(e) => setGhToken(e.target.value)}
                  placeholder={
                    githubStatus?.configured
                      ? '已保存 Token（如需更换请重新输入 ghp_...）'
                      : '粘贴你的 GitHub Token (ghp_...)'
                  }
                  className="w-full px-3 py-2 rounded-xl surface-elevated font-mono focus:outline-none focus:border-indigo-500"
                />
              </label>

              <label className="space-y-1">
                <span className="text-muted">私有 Gist ID（留空则自动发现或自动创建）</span>
                <input
                  value={ghGistId}
                  onChange={(e) => setGhGistId(e.target.value)}
                  placeholder="留空自动匹配 perlica-sync.json"
                  className="w-full px-3 py-2 rounded-xl surface-elevated font-mono focus:outline-none"
                />
              </label>

              <div className="flex items-end justify-between gap-2">
                <label className="flex items-center gap-2 py-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={ghAutoSync}
                    onChange={(e) => setGhAutoSync(e.target.checked)}
                    className="accent-indigo-500 w-4 h-4"
                  />
                  <span className="text-secondary">数据修改后自动静默同步</span>
                </label>

                <button
                  onClick={handleConnectGithub}
                  disabled={ghBusy}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-indigo-500 hover:bg-indigo-400 text-white font-medium disabled:opacity-50 shrink-0"
                >
                  {ghBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Cloud className="w-3.5 h-3.5" />}
                  {githubStatus?.configured ? '保存并同步' : '连接 GitHub 并同步'}
                </button>
              </div>
            </div>

            {githubStatus?.configured && (
              <div className="rounded-xl surface-elevated p-3 text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div className="space-y-0.5">
                  <div className="text-secondary">
                    最近同步时间：
                    <strong className="text-primary">
                      {githubStatus.lastSyncAt
                        ? new Date(githubStatus.lastSyncAt).toLocaleString('zh-CN', { hour12: false })
                        : '尚未同步'}
                    </strong>
                  </div>
                  {githubStatus.lastError && (
                    <div className="text-rose-400">上次异常：{githubStatus.lastError}</div>
                  )}
                </div>
                {githubStatus.gistUrl && (
                  <a
                    href={githubStatus.gistUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="text-indigo-400 hover:underline inline-flex items-center gap-1 shrink-0"
                  >
                    查看私有 Gist <ExternalLink className="w-3 h-3" />
                  </a>
                )}
              </div>
            )}
          </div>

          {/* Card 2 & 3: Local Server Only Controls (or GitHub Pages PWA Tip) */}
          {IS_STATIC_MODE ? (
            <div className="surface rounded-2xl p-5 space-y-2">
              <div className="flex items-center gap-2 font-semibold text-sm">
                <Smartphone className="w-4 h-4 text-emerald-400" /> GitHub Pages 独立网页版（双端随时访问）
              </div>
              <p className="text-xs text-secondary leading-relaxed">
                当前运行在纯前端 GitHub Pages 模式下：电脑关机时手机也能通过 4G/5G 随时打开此网址读写数据，并通过上方 GitHub 私有 Gist 与本地电脑端保持双向互通。
              </p>
              <p className="text-xs text-muted">
                • iOS Safari：点击底部分享图标 →「添加到主屏幕」即可安装 Perlica App 图标<br />
                • Android Chrome / Edge：点击右上角菜单 →「安装应用 / 添加到主屏幕」
              </p>
            </div>
          ) : (
            <>
              {/* Card 2: Access Password Lock + 24/7 Cloud Deploy */}
              <div className="grid md:grid-cols-2 gap-4">
            <div className="surface rounded-2xl p-5 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 font-semibold text-sm">
                  <ShieldCheck className="w-4 h-4 text-emerald-400" /> 外网访问密码锁
                </div>
                <span
                  className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${
                    authStatus?.enabled
                      ? 'bg-emerald-500/15 text-emerald-400'
                      : 'bg-amber-500/15 text-amber-400'
                  }`}
                >
                  {authStatus?.enabled ? '已开启保护' : '未开启'}
                </span>
              </div>
              <p className="text-xs text-secondary leading-relaxed">
                当手机通过外网（云端部署或公网穿透）访问 Perlica 时，强烈建议开启密码锁，防止他人看到你的日志与 API Key。登录一次可保持 30 天有效。
              </p>

              {authStatus?.envLocked ? (
                <p className="text-xs text-amber-400">
                  当前密码由部署环境变量 PERLICA_PASSWORD 控制。
                </p>
              ) : (
                <div className="flex items-center gap-2">
                  <input
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder={authStatus?.enabled ? '输入新密码以修改（至少4位）' : '设置访问密码（至少4位）'}
                    className="flex-1 px-3 py-2 rounded-xl surface-elevated text-xs focus:outline-none focus:border-indigo-500"
                  />
                  <button
                    onClick={handleSetPassword}
                    disabled={authBusy}
                    className="inline-flex items-center gap-1 px-3.5 py-2 rounded-xl bg-indigo-500 hover:bg-indigo-400 text-white text-xs font-medium shrink-0"
                  >
                    <Lock className="w-3.5 h-3.5" /> {authStatus?.enabled ? '修改' : '开启'}
                  </button>
                  {authStatus?.enabled && (
                    <button
                      onClick={handleDisablePassword}
                      disabled={authBusy}
                      className="inline-flex items-center gap-1 px-2.5 py-2 rounded-xl surface-elevated text-xs text-rose-400 shrink-0"
                    >
                      <Unlock className="w-3.5 h-3.5" /> 关闭
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* 24/7 Cloud + GitHub Sync Architecture Guide */}
            <div className="surface rounded-2xl p-5 space-y-2.5">
              <div className="flex items-center gap-2 font-semibold text-sm">
                <Globe className="w-4 h-4 text-sky-400" /> 电脑关机时手机也能用（云端 + GitHub）
              </div>
              <p className="text-xs text-secondary leading-relaxed">
                项目已内置 <code className="px-1 py-0.5 rounded bg-white/10">Dockerfile</code> 与{' '}
                <code className="px-1 py-0.5 rounded bg-white/10">render.yaml</code>。将 Perlica 推送到你的 GitHub 私有仓库并一键部署到 Render / Zeabur / Railway：
              </p>
              <ol className="text-xs text-secondary space-y-1 list-decimal pl-4">
                <li>
                  在云平台环境变量填写 <code className="text-indigo-300">PERLICA_PASSWORD</code>（访问密码）与{' '}
                  <code className="text-indigo-300">PERLICA_GITHUB_TOKEN</code>（你的 GitHub Token）
                </li>
                <li>手机随时随地（4G/5G）直接打开云端 HTTPS 网址并「添加到主屏幕」</li>
                <li>电脑端既可以直接访问同一个云端网址，也可以本地运行并与云端通过 GitHub 自动双向同步！</li>
              </ol>
            </div>
          </div>

          {/* Card 3: Cloudflare Public Tunnel + LAN QR */}
          <div className="grid md:grid-cols-2 gap-4">
            <div className="surface rounded-2xl p-5 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 font-semibold text-sm">
                  <Smartphone className="w-4 h-4 text-amber-400" /> 零服务器外网穿透（Cloudflare 隧道）
                </div>
                {tunnel?.running ? (
                  <button
                    onClick={handleStopTunnel}
                    className="inline-flex items-center gap-1 px-3 py-1 rounded-lg bg-rose-500/15 text-rose-300 text-xs font-medium"
                  >
                    <Square className="w-3 h-3" /> 停止隧道
                  </button>
                ) : (
                  <button
                    onClick={handleStartTunnel}
                    disabled={tunnelBusy}
                    className="inline-flex items-center gap-1 px-3 py-1 rounded-lg bg-indigo-500 hover:bg-indigo-400 text-white text-xs font-medium disabled:opacity-50"
                  >
                    {tunnelBusy ? <Loader2 className="w-3 h-3 animate-spin" /> : <Globe className="w-3 h-3" />}
                    一键开启公网 HTTPS
                  </button>
                )}
              </div>

              <p className="text-xs text-secondary leading-relaxed">
                电脑开机时，可一键生成公网 HTTPS 地址，手机用 4G/5G 扫码即可直接连接本机 Perlica（与本机实时共用同一数据库）。
              </p>

              {tunnel?.url ? (
                <div className="space-y-3 pt-1">
                  <div className="px-3 py-2 rounded-xl surface-elevated font-mono text-xs text-emerald-400 select-all break-all">
                    {tunnel.url}
                  </div>
                  {tunnel.qrDataUrl && (
                    <div className="flex justify-center">
                      <img src={tunnel.qrDataUrl} alt="Public Tunnel QR" className="w-40 h-40 rounded-xl border border-subtle" />
                    </div>
                  )}
                </div>
              ) : (
                <div className="rounded-xl surface-elevated p-3 text-xs space-y-1.5">
                  {!tunnel?.installed ? (
                    <>
                      <div className="text-amber-400 font-medium">检测到本机尚未安装 cloudflared</div>
                      <p className="text-muted">在 PowerShell 中运行以下命令安装一次即可永久一键开启：</p>
                      <code className="block px-2.5 py-1.5 rounded-lg bg-black/30 text-indigo-300 select-all font-mono">
                        winget install Cloudflare.cloudflared
                      </code>
                    </>
                  ) : (
                    <p className="text-secondary">已检测到 cloudflared，点击右上角「一键开启公网 HTTPS」即可生成手机跨网访问二维码。</p>
                  )}
                  {tunnel?.error && <p className="text-rose-400">{tunnel.error}</p>}
                </div>
              )}
            </div>

            {/* Local LAN QR */}
            <div className="surface rounded-2xl p-5 flex flex-col justify-between gap-3">
              <div className="space-y-2">
                <div className="flex items-center gap-2 font-semibold text-sm">
                  <QrCode className="w-4 h-4 text-indigo-400" /> 同 Wi-Fi 局域网扫码直连
                </div>
                {network?.urls && network.urls.length > 0 && (
                  <div className="space-y-1">
                    {network.urls.slice(0, 2).map((u) => (
                      <div
                        key={u}
                        className="px-3 py-1.5 rounded-lg surface-elevated font-mono text-xs text-indigo-300 select-all"
                      >
                        {u}
                      </div>
                    ))}
                  </div>
                )}
              </div>
              {network?.qrDataUrl && (
                <div className="flex flex-col items-center gap-2 pt-1">
                  <img
                    src={network.qrDataUrl}
                    alt="LAN QR Code"
                    className="w-36 h-36 rounded-xl border border-subtle"
                  />
                  <span className="text-[11px] text-muted">
                    iOS Safari 分享 → 添加到主屏幕 · Android 菜单 → 安装应用
                  </span>
                </div>
              )}
            </div>
          </div>
            </>
          )}
        </div>
      )}

      {/* SECTION 1: AI MODELS */}
      {section === 'models' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-xs text-secondary">
              API Key 仅保存在你的本地 SQLite 数据库中，由本地服务端发起请求，不会被同步到 GitHub。
            </p>
            <button
              onClick={() => setAdding((v) => !v)}
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-indigo-500 hover:bg-indigo-400 text-white text-xs font-medium shrink-0"
            >
              <Plus className="w-3.5 h-3.5" /> 新增模型
            </button>
          </div>

          {adding && (
            <div className="surface rounded-2xl p-4 space-y-3 border-indigo-500/40">
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold">添加新模型接口</span>
                <div className="flex items-center gap-1.5 flex-wrap">
                  {PROTOCOL_PRESETS.slice(0, 5).map((preset) => (
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
                      className="text-[11px] px-2 py-0.5 rounded-md surface-elevated hover:border-indigo-400 text-secondary"
                    >
                      {preset.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid sm:grid-cols-2 gap-3 text-xs">
                <label className="space-y-1">
                  <span className="text-muted">配置名称 *</span>
                  <input
                    value={newProv.name}
                    onChange={(e) => setNewProv({ ...newProv, name: e.target.value })}
                    placeholder="如：我的 DeepSeek R1"
                    className="w-full px-3 py-2 rounded-xl surface-elevated focus:outline-none"
                  />
                </label>
                <label className="space-y-1">
                  <span className="text-muted">接口协议</span>
                  <select
                    value={newProv.protocol}
                    onChange={(e) => setNewProv({ ...newProv, protocol: e.target.value as AiProtocol })}
                    className="w-full px-3 py-2 rounded-xl surface-elevated focus:outline-none"
                  >
                    <option value="openai" className="bg-[#141720]">OpenAI 兼容（DeepSeek / OpenAI / Ollama / OpenRouter）</option>
                    <option value="gemini" className="bg-[#141720]">Google Gemini 原生协议</option>
                    <option value="anthropic" className="bg-[#141720]">Anthropic Claude 原生协议</option>
                  </select>
                </label>
                <label className="space-y-1">
                  <span className="text-muted">Base URL *</span>
                  <input
                    value={newProv.base_url}
                    onChange={(e) => setNewProv({ ...newProv, base_url: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl surface-elevated focus:outline-none font-mono"
                  />
                </label>
                <label className="space-y-1">
                  <span className="text-muted">模型名称 (Model ID) *</span>
                  <input
                    value={newProv.model}
                    onChange={(e) => setNewProv({ ...newProv, model: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl surface-elevated focus:outline-none font-mono"
                  />
                </label>
                <label className="space-y-1 sm:col-span-2">
                  <span className="text-muted">API Key</span>
                  <input
                    type="password"
                    value={newProv.api_key}
                    onChange={(e) => setNewProv({ ...newProv, api_key: e.target.value })}
                    placeholder="sk-..."
                    className="w-full px-3 py-2 rounded-xl surface-elevated focus:outline-none font-mono"
                  />
                </label>
              </div>
              <div className="flex justify-end gap-2">
                <button onClick={() => setAdding(false)} className="px-3 py-1.5 rounded-lg surface-elevated text-xs">
                  取消
                </button>
                <button onClick={handleCreateProvider} className="px-4 py-1.5 rounded-lg bg-indigo-500 text-white text-xs font-medium">
                  保存并启用
                </button>
              </div>
            </div>
          )}

          <div className="space-y-3">
            {providers.map((p) => {
              const draft = drafts[p.id] || p;
              const isOpen = editingId === p.id || !p.api_key;
              return (
                <div
                  key={p.id}
                  className={`surface rounded-2xl p-4 space-y-3 transition ${
                    p.is_active ? 'border-indigo-500/45 ring-1 ring-indigo-500/20' : ''
                  }`}
                >
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-sm">{p.name}</span>
                      <span className="text-[11px] px-2 py-0.5 rounded bg-white/[0.06] text-secondary font-mono">
                        {p.model}
                      </span>
                      <span className="text-[10px] uppercase text-muted">{p.protocol}</span>
                      {p.is_active === 1 && (
                        <span className="text-[11px] px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 font-medium inline-flex items-center gap-1">
                          <Check className="w-3 h-3" /> 默认启用
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-1.5">
                      {p.is_active !== 1 && (
                        <button
                          onClick={() => handleActivateProvider(p)}
                          className="px-2.5 py-1 rounded-lg surface-elevated hover:border-indigo-400 text-xs"
                        >
                          设为默认
                        </button>
                      )}
                      <button
                        onClick={() => handleTestProvider(p.id)}
                        disabled={testingId === p.id}
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-indigo-500/15 text-indigo-300 hover:bg-indigo-500/25 text-xs"
                      >
                        {testingId === p.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Zap className="w-3 h-3" />}
                        测试连接
                      </button>
                      <button
                        onClick={() => setEditingId(editingId === p.id ? null : p.id)}
                        className="px-2.5 py-1 rounded-lg surface-elevated text-xs text-secondary"
                      >
                        {isOpen ? '收起' : '配置'}
                      </button>
                      <button onClick={() => handleDeleteProvider(p.id)} className="p-1.5 rounded-lg text-muted hover:text-rose-400">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  {isOpen && (
                    <div className="grid sm:grid-cols-2 gap-3 pt-2 border-t border-subtle text-xs">
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
                            placeholder="填入 API Key（本地 Ollama 可保持 ollama）"
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
                            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-indigo-500 text-white font-medium"
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

      {/* SECTION 2: PROMPT TEMPLATES */}
      {section === 'prompts' && (
        <div className="space-y-3">
          {prompts.map((tpl) => (
            <div key={tpl.id} className="surface rounded-2xl p-4 space-y-2.5">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <h3 className="text-sm font-semibold">{tpl.name}</h3>
                  <p className="text-xs text-muted">{tpl.description}</p>
                </div>
                <button
                  onClick={() => handleSavePrompt(tpl)}
                  disabled={savingPromptId === tpl.id}
                  className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-indigo-500 hover:bg-indigo-400 text-white text-xs font-medium shrink-0"
                >
                  {savingPromptId === tpl.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                  保存提示词
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
                className="w-full p-3 rounded-xl surface-elevated text-xs font-mono leading-relaxed focus:outline-none focus:border-indigo-500"
              />
            </div>
          ))}
        </div>
      )}

      {/* SECTION 4: BACKUP, EXPORT & RESET */}
      {section === 'data' && (
        <div className="space-y-4">
          <div className="grid sm:grid-cols-3 gap-4">
            <button
              type="button"
              onClick={() => downloadExport('json')}
              className="surface rounded-2xl p-5 hover:border-indigo-400 transition space-y-2 block text-left"
            >
              <Download className="w-6 h-6 text-indigo-400" />
              <h3 className="text-sm font-semibold">导出完整 JSON 备份</h3>
              <p className="text-xs text-muted">包含所有板块、学习日志、游戏灵感、AI 复盘与自定义提示词。</p>
            </button>

            <button
              type="button"
              onClick={() => downloadExport('markdown')}
              className="surface rounded-2xl p-5 hover:border-sky-400 transition space-y-2 block text-left"
            >
              <FileDown className="w-6 h-6 text-sky-400" />
              <h3 className="text-sm font-semibold">导出 Markdown 归档</h3>
              <p className="text-xs text-muted">一键导出纯文本 .md，可直接导入 Obsidian / Notion 永久保存。</p>
            </button>

            <label className="surface rounded-2xl p-5 hover:border-emerald-400 transition space-y-2 cursor-pointer block">
              <Upload className="w-6 h-6 text-emerald-400" />
              <h3 className="text-sm font-semibold">导入 JSON 备份恢复</h3>
              <p className="text-xs text-muted">选择之前导出的 perlica-backup.json，自动合并无冲突数据。</p>
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

          <div className="rounded-2xl border border-rose-500/30 bg-rose-500/[0.05] p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-sm font-semibold text-rose-400">
                <AlertTriangle className="w-4 h-4" /> 重置与清空数据
              </div>
              <p className="text-xs text-secondary">
                一键清空所有学习板块、学习日程、游戏灵感、复盘报告与 AI 对话，恢复干净初始状态。
              </p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={() => handleResetAll(true)}
                disabled={resetBusy}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-rose-500/15 hover:bg-rose-500/25 text-rose-300 border border-rose-500/30 text-xs font-medium transition disabled:opacity-50"
              >
                {resetBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RotateCcw className="w-3.5 h-3.5" />}
                清空记录（保留 AI 配置）
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
