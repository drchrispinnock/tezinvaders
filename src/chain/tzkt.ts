// TzKT account aliases ("Ms BLS", "Kraken Legacy Baker", …) for the leaderboards, looked up
// in batches from the active network's TzKT API and cached for the page's lifetime. A lookup
// failure just leaves the addresses unnamed; the panel falls back to the short address.

import { config } from "./config";

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

/** For tests. */
export const clearAliasCache = (): void => cache.clear();
