import { ADVENT_DAYS, ADVENT_THRESHOLD, adventDay, adventImageUrl } from "../chain/advent";
import { BADGES, badgeDataUri, badgeFor } from "../chain/badges";
import { CHAINS, DEFAULT_NETWORK, LAYERS, LAYER_SWITCH, config, formatTez, hasContract, isLayer, networkFor, pathFor, shortAddress, type NetworkName } from "../chain/config";
import { roundOver, type GameStorage, type PlayerState, type ScoreEntry } from "../chain/contract";
import type { GameRecord } from "../chain/verifier";
import { aliasOf } from "../chain/tzkt";
import FAKE_LEADERBOARD from "../data/leaderboard.json";

/** A row of the stand-in leaderboard shown while the round has no on-chain scores (src/data/leaderboard.json). */
interface FakeEntry { address?: string; name: string; score: number }

export interface PanelState {
  address: string | null;
  storage: GameStorage | null;
  /** This round's table, highest first (from TzKT, with the on-chain leader merged in). */
  scores: ScoreEntry[];
  /** Every player's all-time best, highest first (the `best` big map via TzKT). */
  allTime: ScoreEntry[];
  /** The connected player's ticket, all-time best and badges; null until loaded or when not connected. */
  badges: PlayerState | null;
  busy: boolean;
  status: string;
  error: boolean;
  /** Score waiting to be submitted after a game over, if the player is eligible. */
  pendingScore: number | null;
  /** The recorded game behind pendingScore, for the verifier. */
  pendingGame: GameRecord | null;
  /** Token ids the connected player holds (from TzKT): Advent doors are adventToken + day. */
  tokens: ReadonlySet<number>;
  /** Label of the network being navigated to, shown as a banner while the page changes. */
  switching: string | null;
}

export interface PanelActions {
  connect(): void;
  disconnect(): void;
  buyTicket(): void;
  submitScore(): void;
  endRound(): void;
  /** Admin: set the round length and reschedule the current round to end that long from now. */
  setRoundLength(hours: number): void;
  /** Claim today's Advent door with the pending game. */
  claimAdvent(): void;
  switchNetwork(name: NetworkName): void;
}

/** The TzKT alias when the account has one, otherwise the shortened address. */
export const displayName = (address: string): string => esc(aliasOf(address) ?? shortAddress(address));

/** The name as a link to the account on the network's TzKT explorer, opening in a new tab. */
const explorerLink = (address: string, text = displayName(address)): string =>
  !config.explorer ? `<span title="${address}">${text}</span>` : `<a href="${config.explorer}/${address}" target="_blank" rel="noopener" title="${address} on TzKT">${text}</a>`;

/** TzKT's picture for an account (its logo when it has one, else a generated identicon), the same service for every network. */
const avatar = (address: string): string =>
  `<img class="avatar" src="https://services.tzkt.io/v1/avatars/${address}" alt="" width="18" height="18" loading="lazy">`;

/** HTML-escapes text from outside the app (TzKT aliases, status lines) before it goes into innerHTML. */
export const esc = (s: string): string => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

/** "3d 4h", "2h 15m", "40m", "<1m" */
export function formatDuration(ms: number): string {
  const minutes = Math.floor(ms / 60_000);
  if (minutes < 1) return "<1m";
  const d = Math.floor(minutes / 1440), h = Math.floor((minutes % 1440) / 60), m = minutes % 60;
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

/** The right-hand dApp panel: wallet, prize pool, badges, this round's leaderboard and the hall of fame. */
export class Panel {
  private readonly root: HTMLElement;
  /** Typed-but-not-submitted input values, kept across re-renders. */
  private readonly drafts: Record<string, string> = {};

  constructor(root: HTMLElement, private readonly actions: PanelActions) {
    this.root = root;
    root.addEventListener("input", (e) => {
      const field = (e.target as HTMLInputElement).dataset.field;
      if (field) this.drafts[field] = (e.target as HTMLInputElement).value;
    });
    root.addEventListener("change", (e) => {
      const select = (e.target as HTMLElement).closest<HTMLSelectElement>("select[data-chain]");
      if (!select) return;
      // Keep the layer when the new chain has it, else fall back to L1.
      const target = networkFor(select.value, config.layer) ?? networkFor(select.value, "l1");
      if (target && target !== config.network) this.actions.switchNetwork(target);
    });
    root.addEventListener("click", (e) => {
      const btn = (e.target as HTMLElement).closest<HTMLButtonElement>("button[data-action], button[data-layer]");
      if (!btn || btn.disabled) return;
      const { layer } = btn.dataset;
      if (layer !== undefined) {
        const target = isLayer(layer) ? networkFor(config.chain, layer) : undefined;
        if (target && target !== config.network) this.actions.switchNetwork(target);
        return;
      }
      const action = btn.dataset.action as Exclude<keyof PanelActions, "switchNetwork">;
      if (action === "setRoundLength") {
        const hours = Number(this.drafts.roundLength ?? this.root.querySelector<HTMLInputElement>("[data-field=roundLength]")?.value);
        if (hours > 0) this.actions.setRoundLength(hours);
        return;
      }
      this.actions[action]();
    });
  }

  render(s: PanelState): void {
    const me = s.address;
    const ticket = me ? s.badges?.ticket ?? null : null;
    const hasTicket = ticket !== null;
    const isAdmin = Boolean(me && s.storage && s.storage.admin === me);
    const over = s.storage ? roundOver(s.storage) : false;
    const dis = s.busy ? "disabled" : "";

    const hasL2 = CHAINS.find((c) => c.name === config.chain)?.hasL2 ?? false;
    const layerHtml = !LAYER_SWITCH || !hasL2 ? "" : `<div class="seg" role="group" aria-label="Layer">${LAYERS.map((l) =>
        `<button data-layer="${l.name}" class="${l.name === config.layer ? "on" : ""}" ${dis} aria-pressed="${l.name === config.layer}" title="${l.title}">${l.label}</button>`).join("")}</div>`;
    const networkHtml = `<div class="segs">
      <select data-chain aria-label="Network" ${dis}>${CHAINS.map((c) =>
        `<option value="${c.name}" ${c.name === config.chain ? "selected" : ""}>${c.label}</option>`).join("")}</select>
      ${layerHtml}</div>`;

    const walletHtml = me
      ? `<div class="row"><span class="addr">${explorerLink(me)}</span>
           <button class="secondary" data-action="disconnect" ${dis}>Disconnect</button></div>`
      : `<div class="row"><span class="muted">Not connected${config.faucet ? ` · <a href="${config.faucet}" target="_blank" rel="noopener">faucet</a>` : ""}</span>
           <button data-action="connect" ${dis}>Connect wallet</button></div>`;

    let poolHtml: string;
    if (!hasContract()) {
      poolHtml = config.network !== DEFAULT_NETWORK
        ? `<p class="muted">${config.label} is coming soon. Free play here; <a href="${pathFor(DEFAULT_NETWORK)}">play for the prize pool on Shadownet</a>.</p>`
        : `<p class="muted">No contract configured on ${config.label}. Free play only.<br>
        Deploy <code>contract/tezinvaders.tz</code> and put the KT1 into <code>src/chain/networks.json</code>.</p>`;
    } else if (!s.storage) {
      poolHtml = `<p class="muted">Loading ${shortAddress(config.contractAddress)}…</p>`;
    } else {
      const st = s.storage;
      const endsAt = new Date(st.roundEnds).toLocaleString();
      const deadline = over
        ? `<span class="danger" title="${endsAt}">over · awaiting payout</span>`
        : `<span title="${endsAt}">ends in ${formatDuration(st.roundEnds - Date.now())}</span>`;
      const roundLengthHours = String(Math.max(1, Math.round(st.roundLength / 3600)));
      const canPayOut = isAdmin || (me && over);
      poolHtml = `
        <div class="row"><span>Round ${st.round}</span>${deadline}</div>
        <div class="row"><span>Prize pool</span><span class="big">${formatTez(st.pool)}</span></div>
        <div class="row"><span>Entry fee</span><span>${formatTez(st.entryFee)}</span></div>
        <div class="row">
          <span>${over ? `Next ticket pays out and starts round ${st.round + 1}` : hasTicket ? `Ticket held · best ${ticket ?? 0}` : `<span class="free">Free play</span>`}</span>
          <button data-action="buyTicket" ${dis} ${!me ? "disabled" : ""}>${hasTicket && !over ? "Top up pool" : "Buy ticket"}</button>
        </div>
        ${hasTicket ? "" : `<p class="muted">${me ? "Buy a ticket to submit your score." : "Connect your wallet and buy a ticket to submit your score."}</p>`}
        ${s.pendingScore !== null && hasTicket && s.pendingScore > (ticket ?? 0)
          ? over
            ? `<div class="row"><span class="muted">New best ${s.pendingScore}, but the round is over</span></div>`
            : !config.verifierUrl
              ? `<div class="row"><span class="muted">New best ${s.pendingScore}, but no score verifier is configured</span></div>`
              : `<div class="row"><span>New best: ${s.pendingScore}</span>
                 <button class="submit" data-action="submitScore" ${dis} title="The verifier replays your game and signs the score">Submit score on-chain</button></div>`
          : ""}
        ${canPayOut ? `<div class="row"><span class="muted">${isAdmin ? "You are the admin" : "Deadline passed"}</span>
               <button class="secondary" data-action="endRound" ${dis}>End round &amp; pay out</button></div>` : ""}
        ${isAdmin ? `<div class="row"><label class="muted">Round length
               <input data-field="roundLength" type="number" min="1" step="1" value="${this.drafts.roundLength ?? roundLengthHours}" ${dis}> h</label>
               <button class="secondary" data-action="setRoundLength" ${dis}>Schedule</button></div>` : ""}`;
    }

    const badgesHtml = hasContract() ? this.badges(s, me) : "";
    const adventHtml = hasContract() && s.storage ? this.advent(s, me, hasTicket) : "";

    // One table: the round's on-chain scores and the stand-in entries ranked together (src/data/leaderboard.json),
    // the latter dimmed and dropped once the same address holds a real ticket.
    const real = s.scores.map((e) => ({ address: e.address, name: displayName(e.address), score: e.score, standIn: false }));
    const taken = new Set(real.map((e) => e.address));
    const standIns = (FAKE_LEADERBOARD as FakeEntry[]).filter((e) => !e.address || !taken.has(e.address)).map((e) => ({ ...e, standIn: true }));
    const byScore = (a: { score: number }, b: { score: number }) => b.score - a.score;
    const rows = [...real, ...standIns].sort(byScore).slice(0, 10).map((e, i) =>
      `<tr class="${e.address === me ? "me" : ""} ${e.standIn ? "stand-in" : ""}"><td>${i + 1}.</td><td>${e.address ? avatar(e.address) + explorerLink(e.address, esc(e.name)) : esc(e.name)}</td><td>${e.score}</td></tr>`).join("");
    const allTime = s.allTime.slice(0, 10).map((e, i) =>
      `<tr class="${e.address === me ? "me" : ""}"><td>${i + 1}.</td><td>${avatar(e.address)}${explorerLink(e.address)}</td><td>${e.score}</td></tr>`).join("");
    const champs = (s.storage?.champions ?? []).slice(0, 10).map((c) =>
      `<tr class="${c.player === me ? "me" : ""}"><td>R${c.round}</td><td>${avatar(c.player)}${explorerLink(c.player)}</td><td>${c.score}</td></tr>`).join("");

    this.root.innerHTML = `
      ${s.switching ? `<div class="banner">Switching to ${esc(s.switching)}…</div>` : ""}
      <h1><img class="logo" src="${import.meta.env.BASE_URL}tezos.svg" alt="" width="18" height="24" />${config.layer === "l2" ? `<sup class="x" title="Tezos X">X</sup>` : ""} TEZINVADERS</h1>
      <section><div class="row"><h2>Wallet</h2>${networkHtml}</div>${walletHtml}</section>
      <section><h2>Prize pool</h2>${poolHtml}</section>
      ${adventHtml}
      ${badgesHtml}
      <section><h2>Leaderboard · this round</h2>
        ${rows ? `<table>${rows}</table>` : `<p class="muted">No scores yet.</p>`}</section>
      <section><h2>All-time best</h2>
        ${allTime ? `<table>${allTime}</table>` : `<p class="muted">No scores yet.</p>`}</section>
      <section><h2>Hall of fame</h2>
        ${champs ? `<table>${champs}</table>` : `<p class="muted">No rounds finished yet.</p>`}</section>
      <section><div class="status ${s.error ? "error" : ""}">${esc(s.status)}</div></section>`;
  }

  /** The Advent calendar: shown from 1 December until the end of the month. */
  private advent(s: PanelState, me: string | null, hasTicket: boolean): string {
    const st = s.storage!;
    // ?preview=advent shows the calendar as if today were 1 December (claims still follow the chain clock).
    const preview = new URLSearchParams(location.search).get("preview") === "advent";
    const now = preview ? st.adventStart : Date.now();
    if (now < st.adventStart || now >= st.adventStart + 31 * 86_400_000) return "";
    const today = adventDay(now, st.adventStart);
    const owned = (day: number) => s.tokens.has(st.adventToken + day);
    const doors = Array.from({ length: ADVENT_DAYS }, (_, day) => {
      const state = owned(day) ? "owned" : day === today ? "today" : today !== null && day < today ? "missed" : "locked";
      return `<figure class="door ${state}" title="${day + 1} December${owned(day) ? " · yours" : state === "today" ? " · today" : ""}">
        <img src="${adventImageUrl(day, import.meta.env.BASE_URL + "badges/")}" alt="Door ${day + 1}" loading="lazy"><figcaption>${day + 1}</figcaption></figure>`;
    }).join("");
    const canClaim = !preview && me && hasTicket && today !== null && !owned(today) && s.pendingScore !== null && s.pendingScore > ADVENT_THRESHOLD;
    const caption = preview
      ? "Preview: this is how the calendar will look from 1 December."
      : today === null
      ? "The calendar has closed for this year."
      : !me ? `Ticket holders who score over ${ADVENT_THRESHOLD} on a December day open that day's door.`
      : owned(today) ? `Door ${today + 1} is yours. Come back tomorrow.`
      : !hasTicket ? `Buy a ticket and score over ${ADVENT_THRESHOLD} today to open door ${today + 1}.`
      : canClaim ? `<span>Scored ${s.pendingScore}: door ${today + 1} is open</span>`
      : `Score over ${ADVENT_THRESHOLD} today to open door ${today + 1}.`;
    return `<section><h2>Advent calendar</h2><div class="advent">${doors}</div>
      <div class="row"><span class="muted">${caption}</span>${canClaim ? `<button data-action="claimAdvent" ${s.busy ? "disabled" : ""}>Claim door ${today! + 1}</button>` : ""}</div></section>`;
  }

  private badges(s: PanelState, me: string | null): string {
    const owned = s.badges?.owned ?? new Set<number>();
    const best = s.badges?.best ?? 0;
    const next = BADGES.find((b) => b.threshold > best);
    const tiles = BADGES.map((b) => `
      <figure class="badge ${owned.has(b.id) ? "owned" : ""}" title="${b.name}: ${b.threshold.toLocaleString()} points">
        <img src="${badgeDataUri(b)}" alt="${b.name}" width="48" height="48">
        <figcaption>${b.threshold.toLocaleString()}</figcaption>
      </figure>`).join("");
    const caption = !me
      ? "Connect a wallet to see yours. Badges are FA2 tokens minted to ticket holders when their all-time best score crosses each line."
      : s.badges === null
        ? "Loading…"
        : `All-time best ${best.toLocaleString()}${badgeFor(best) ? ` · ${badgeFor(best)!.name}` : ""}` +
          (next ? ` · next badge at ${next.threshold.toLocaleString()}` : " · the full set!");
    return `<section><h2>Badges</h2><div class="badges">${tiles}</div><p class="muted">${caption}</p></section>`;
  }
}
