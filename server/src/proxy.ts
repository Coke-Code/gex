// Node 的 fetch 不读系统代理。浏览器能打开的交易所，进程直连可能超时。

import { execFileSync } from "child_process";
import { fetch as undiciFetch, ProxyAgent } from "undici";

function readWindowsProxy(): string | null {
  if (process.platform !== "win32") return null;
  try {
    const text = execFileSync(
      "reg",
      ["query", "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings"],
      { encoding: "utf8", timeout: 3_000, windowsHide: true },
    );
    if (!/ProxyEnable\s+REG_DWORD\s+0x1\b/i.test(text)) return null;
    return text.match(/ProxyServer\s+REG_SZ\s+(\S+)/i)?.[1] ?? null;
  } catch {
    return null;
  }
}

function proxyUrl(): string | null {
  const raw = (process.env.HTTPS_PROXY || process.env.HTTP_PROXY || process.env.ALL_PROXY || readWindowsProxy() || "").trim();
  if (!raw) return null;
  if (/^https?:\/\//i.test(raw)) return raw;
  const https = raw.match(/(?:^|;)https=([^;]+)/i)?.[1];
  const httpProxy = raw.match(/(?:^|;)http=([^;]+)/i)?.[1];
  return `http://${https || httpProxy || raw}`;
}

type FetchInput = Parameters<typeof fetch>[0];

function requestUrl(input: FetchInput): string {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.href;
  return input.url;
}

function isLocal(url: string): boolean {
  try {
    const host = new URL(url).hostname;
    return host === "localhost" || host === "127.0.0.1" || host === "::1";
  } catch {
    return false;
  }
}

export function useSystemProxy(): void {
  const proxy = proxyUrl();
  if (!proxy) return;
  const agent = new ProxyAgent(proxy);
  const direct = globalThis.fetch.bind(globalThis);
  globalThis.fetch = (async (input: FetchInput, init?: RequestInit) => {
    const url = requestUrl(input);
    if (isLocal(url)) return direct(input, init);
    return undiciFetch(input as never, {
      method: init?.method,
      headers: init?.headers as never,
      body: init?.body as never,
      signal: init?.signal,
      dispatcher: agent,
    }) as unknown as Promise<Response>;
  }) as typeof fetch;
  const host = new URL(proxy).host;
  console.log(`Exchange requests use proxy ${host}`);
}
