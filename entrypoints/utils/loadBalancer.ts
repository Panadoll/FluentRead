import { Config } from './model';

export type LoadBalanceKey = {
  token: string;
  weight: number;
};

type KeyRuntimeState = {
  usedInWindow: number;
  windowStartAt: number;
  lastUsedAt: number;
  cooldownUntil: number;
};

export class WeightedLoadBalancer {
  private state = new Map<string, KeyRuntimeState>(); // key: `${service}|${token}`
  private readonly windowMs: number;

  constructor(windowMs: number = 60000) {
    this.windowMs = windowMs;
  }

  parseTokenPool(raw: unknown): LoadBalanceKey[] {
    const s = typeof raw === 'string' ? raw : '';
    const parts = s
      .split(/[\n,]+/g)
      .map((p) => p.trim())
      .filter(Boolean);

    const keys: LoadBalanceKey[] = [];
    for (const part of parts) {
      // 支持：token|weight（weight 可省略，默认 1）
      const [tokenRaw, weightRaw] = part.split('|').map((x) => x.trim());
      const token = tokenRaw ?? '';
      if (!token) continue;

      let weight = 1;
      if (weightRaw) {
        const n = Number(weightRaw);
        if (Number.isFinite(n) && n > 0) weight = n;
      }

      keys.push({ token, weight });
    }

    // 去重（相同 token 取最大权重）
    const dedup = new Map<string, LoadBalanceKey>();
    for (const k of keys) {
      const prev = dedup.get(k.token);
      if (!prev || k.weight > prev.weight) dedup.set(k.token, k);
    }
    return Array.from(dedup.values());
  }

  chooseToken(params: {
    service: string;
    config: Config;
    pool: LoadBalanceKey[];
    tried?: Set<string>;
    now?: number;
  }): string | undefined {
    const { service, config, pool } = params;
    const tried = params.tried ?? new Set<string>();
    const now = params.now ?? Date.now();
    const cooldownMs = config.loadBalanceCooldownMs || 60000;

    let bestToken: string | undefined;
    let bestScore = Number.POSITIVE_INFINITY;
    let bestLastUsedAt = Number.POSITIVE_INFINITY;

    for (const item of pool) {
      const token = item.token;
      if (!token || tried.has(token)) continue;

      const st = this.getOrInitState(service, token, now);

      // 过窗口则重置计数（粗粒度频率统计）
      if (now - st.windowStartAt >= this.windowMs) {
        st.windowStartAt = now;
        st.usedInWindow = 0;
      }

      // 冷却中跳过
      if (st.cooldownUntil > now) continue;

      // 选择 used/weight 最小的，尽量按权重分配频率
      const score = st.usedInWindow / Math.max(1e-6, item.weight);
      if (score < bestScore || (score === bestScore && st.lastUsedAt < bestLastUsedAt)) {
        bestScore = score;
        bestLastUsedAt = st.lastUsedAt;
        bestToken = token;
      }
    }

    if (!bestToken) return undefined;

    const st = this.getOrInitState(service, bestToken, now);
    if (now - st.windowStartAt >= this.windowMs) {
      st.windowStartAt = now;
      st.usedInWindow = 0;
    }
    st.usedInWindow += 1;
    st.lastUsedAt = now;

    // 若配置冷却被改小/大，不在这里强制变化；冷却只在标记限流时生效
    void cooldownMs;
    return bestToken;
  }

  markRateLimited(params: { service: string; token: string; cooldownMs: number; now?: number }) {
    const now = params.now ?? Date.now();
    const st = this.getOrInitState(params.service, params.token, now);
    st.cooldownUntil = Math.max(st.cooldownUntil, now + Math.max(0, params.cooldownMs));
  }

  private getOrInitState(service: string, token: string, now: number): KeyRuntimeState {
    const k = `${service}|${token}`;
    const existing = this.state.get(k);
    if (existing) return existing;
    const init: KeyRuntimeState = {
      usedInWindow: 0,
      windowStartAt: now,
      lastUsedAt: 0,
      cooldownUntil: 0,
    };
    this.state.set(k, init);
    return init;
  }
}

export function isRateLimitError(error: unknown): boolean {
  const msg = error instanceof Error ? error.message : error == null ? '' : String(error);
  const s = msg.toLowerCase();
  return (
    s.includes('429') ||
    s.includes('too many requests') ||
    s.includes('rate limit') ||
    s.includes('ratelimit') ||
    s.includes('request limit') ||
    s.includes('frequency') ||
    s.includes('请求过于频繁') ||
    s.includes('请求频率') ||
    s.includes('触发限流')
  );
}

