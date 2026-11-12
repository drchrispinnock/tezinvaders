// TzKT account aliases ("Ms BLS", "Kraken Legacy Baker", …) for the leaderboards, looked up
// in batches from the active network's TzKT API and cached for the page's lifetime. A lookup
// failure just leaves the addresses unnamed; the panel falls back to the short address.

import { config, hasContract } from "./config";

interface TzktAccount { address: string; alias: string | null }

/** address → alias, for every address asked about so far (null when TzKT has no alias). */
const cache = new Map<string, string | null>();

export const aliasOf = (address: string): string | undefined => cache.get(address) ?? undefined;

/** Fetch aliases for any of `addresses` not already cached; resolves to true when something new was learned. */
export async function resolveAliases(addresses: Iterable<string>, fetchFn: typeof fetch = fetch): Promise<boolean> {
  const wanted = [...new Set(addresses)].filter((a) => !cache.has(a));
  if (wanted.length === 0 || !config.tzktApi) return false;
  let learned = false;
  for (let i = 0; i < wanted.length; i += 100) {
    const chunk = wanted.slice(i, i + 100);
    try {
      const res = await fetchFn(`${config.tzktApi}/v1/accounts?address.in=${chunk.join(",")}&select=address,alias&limit=${chunk.length}`);
      if (!res.ok) continue;
      const accounts = (await res.json()) as TzktAccount[];
      for (const a of accounts) {
        cache.set(a.address, a.alias);
        if (a.alias) learned = true;
      }
      // Addresses TzKT has never seen are missing from the answer; remember that too.
      for (const a of chunk) if (!cache.has(a)) cache.set(a, null);
    } catch { /* offline or TzKT down: try again next poll */ }
  }
  return learned;
}

export interface ScoreRow { address: string; score: number }

/**
 * This round's scores, highest first, from the indexer: the contract keeps them in a big map,
 * which TzKT lists but cannot sort by value, so every key is fetched (up to 10,000) and sorted here.
 */
export async function readLeaderboard(limit = 10, fetchFn: typeof fetch = fetch): Promise<ScoreRow[]> {
  return readScoreMap("scores", limit, fetchFn);
}

/** Every player's all-time best (the `best` big map), highest first. */
export async function readAllTime(limit = 10, fetchFn: typeof fetch = fetch): Promise<ScoreRow[]> {
  return readScoreMap("best", limit, fetchFn);
}

async function readScoreMap(name: "scores" | "best", limit: number, fetchFn: typeof fetch): Promise<ScoreRow[]> {
  if (!config.tzktApi || !hasContract()) return [];
  const res = await fetchFn(`${config.tzktApi}/v1/contracts/${config.contractAddress}/bigmaps/${name}/keys?active=true&limit=10000&select=key,value`);
  if (!res.ok) throw new Error(`TzKT ${res.status}`);
  const rows = (await res.json()) as { key: string; value: string }[];
  return rows.map((r) => ({ address: r.key, score: Number(r.value) }))
    .sort((a, b) => b.score - a.score || a.address.localeCompare(b.address)).slice(0, limit);
}

/** Token ids of this contract that `address` holds (badges and Advent doors), from the indexer. */
export async function readTokenIds(address: string, fetchFn: typeof fetch = fetch): Promise<Set<number>> {
  if (!config.tzktApi || !hasContract()) return new Set();
  const res = await fetchFn(`${config.tzktApi}/v1/tokens/balances?account=${address}&token.contract=${config.contractAddress}&balance.gt=0&select=token.tokenId&limit=1000`);
  if (!res.ok) throw new Error(`TzKT ${res.status}`);
  const ids = (await res.json()) as (string | number)[];
  return new Set(ids.map(Number));
}

/**
 * The indexer's rows with the on-chain leader merged in: the indexer lags a few seconds after a
 * submission, so the leader's row is replaced (never duplicated) when the chain knows a higher score.
 */
export function mergeLeader(rows: readonly ScoreRow[], leader: ScoreRow | null, limit = 10): ScoreRow[] {
  const byAddress = new Map(rows.map((r) => [r.address, { ...r }]));
  if (leader) {
    const row = byAddress.get(leader.address);
    if (!row || row.score < leader.score) byAddress.set(leader.address, { ...leader });
  }
  return [...byAddress.values()].sort((a, b) => b.score - a.score || a.address.localeCompare(b.address)).slice(0, limit);
}

/** For tests. */
export const clearAliasCache = (): void => cache.clear();
