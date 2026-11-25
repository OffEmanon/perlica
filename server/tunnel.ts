import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import QRCode from 'qrcode';

export interface TunnelStatus {
  installed: boolean;
  running: boolean;
  mode: 'quick' | 'token' | null;
  url: string | null;
  qrDataUrl: string | null;
  error: string | null;
}

let tunnelProc: ChildProcess | null = null;
let currentUrl: string | null = null;
let currentQr: string | null = null;
let currentMode: 'quick' | 'token' | null = null;
let lastError: string | null = null;

function findCloudflared(): string | null {
  const cmd = process.platform === 'win32' ? 'where' : 'which';
  const res = spawnSync(cmd, ['cloudflared'], { encoding: 'utf8' });
  if (res.status === 0 && res.stdout.trim()) {
    return res.stdout.trim().split(/\r?\n/)[0];
  }
  return null;
}

export async function getTunnelStatus(): Promise<TunnelStatus> {
  return {
    installed: Boolean(findCloudflared()),
    running: Boolean(tunnelProc && !tunnelProc.killed),
    mode: currentMode,
    url: currentUrl,
    qrDataUrl: currentQr,
    error: lastError,
  };
}

export async function startTunnel(
  port: number,
  options?: { token?: string; customUrl?: string }
): Promise<TunnelStatus> {
  const bin = findCloudflared();
  if (!bin) {
    lastError = '本机尚未安装 cloudflared，请先按下方命令一键安装后再开启公网隧道。';
    return getTunnelStatus();
  }

  stopTunnel();
  lastError = null;
  currentUrl = null;
  currentQr = null;

  const token = options?.token?.trim();
  const args = token
    ? ['tunnel', '--no-autoupdate', 'run', '--token', token]
    : ['tunnel', '--no-autoupdate', '--url', `http://127.0.0.1:${port}`];

  currentMode = token ? 'token' : 'quick';

  const proc = spawn(bin, args, { stdio: ['ignore', 'pipe', 'pipe'] });
  tunnelProc = proc;

  if (token && options?.customUrl?.trim()) {
    currentUrl = options.customUrl.trim();
    try {
      currentQr = await QRCode.toDataURL(currentUrl, {
        width: 220,
        margin: 1,
        color: { dark: '#e6e7ec', light: '#141720' },
      });
    } catch {
      currentQr = null;
    }
  }

  const handleOutput = async (chunk: Buffer) => {
    const text = chunk.toString('utf8');
    const match = text.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/i);
    if (match && !currentUrl) {
      currentUrl = match[0];
      try {
        currentQr = await QRCode.toDataURL(currentUrl, {
          width: 220,
          margin: 1,
          color: { dark: '#e6e7ec', light: '#141720' },
        });
      } catch {
        currentQr = null;
      }
    }
    if (/ERR|failed|error/i.test(text) && !currentUrl) {
      const line = text.trim().split('\n').pop() || '';
      if (line.length > 4) lastError = line.slice(0, 220);
    }
  };

  proc.stdout?.on('data', handleOutput);
  proc.stderr?.on('data', handleOutput);
  proc.on('exit', (code) => {
    if (tunnelProc === proc) {
      tunnelProc = null;
      currentMode = null;
      if (code && code !== 0 && !lastError) {
        lastError = `隧道进程已退出 (code ${code})`;
      }
    }
  });

  // Wait up to 8 seconds for quick tunnel URL to appear
  if (!token) {
    const deadline = Date.now() + 8000;
    while (!currentUrl && tunnelProc === proc && Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 250));
    }
  }

  return getTunnelStatus();
}

export function stopTunnel(): TunnelStatus {
  if (tunnelProc && !tunnelProc.killed) {
    try {
      tunnelProc.kill();
    } catch {
      // ignore
    }
  }
  tunnelProc = null;
  currentUrl = null;
  currentQr = null;
  currentMode = null;
  lastError = null;
  return {
    installed: Boolean(findCloudflared()),
    running: false,
    mode: null,
    url: null,
    qrDataUrl: null,
    error: null,
  };
}
