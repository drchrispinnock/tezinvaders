import { BADGES, badgeDataUri, badgeFor } from "../chain/badges";
import { CHAINS, LAYERS, config, formatTez, hasContract, isChain, isLayer, networkFor, shortAddress, type NetworkName } from "../chain/config";
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
  /** The connected player's ticket, all-time best and badges; null until loaded or when not connected. */
  badges: PlayerState | null;
  busy: boolean;
  status: string;
  error: boolean;
  /** Score waiting to be submitted after a game over, if the player is eligible. */
  pendingScore: number | null;
  /** The recorded game behind pendingScore, for the verifier. */
  pendingGame: GameRecord | null;
}

export interface PanelActions {
  connect(): void;
  disconnect(): void;
  buyTicket(): void;
  submitScore(): void;
  endRound(): void;
  /** Admin: set the round length and reschedule the current round to end that long from now. */
  setRoundLength(hours: number): void;
  switchNetwork(name: NetworkName): void;
}

/** The TzKT alias when the account has one, otherwise the shortened address. */
export const displayName = (address: string): string => aliasOf(address) ?? shortAddress(address);

/** The name as a link to the account on the network's TzKT explorer, opening in a new tab. */
const explorerLink = (address: string, text = displayName(address)): string =>
  !config.explorer ? `<span title="${address}">${text}</span>` : `<a href="${config.explorer}/${address}" target="_blank" rel="noopener" title="${address} on TzKT">${text}</a>`;

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
    root.addEventListener("click", (e) => {
      const btn = (e.target as HTMLElement).closest<HTMLButtonElement>("button[data-action], button[data-chain], button[data-layer]");
      if (!btn || btn.disabled) return;
      const { chain, layer } = btn.dataset;
      if (chain !== undefined || layer !== undefined) {
        const target = networkFor(isChain(chain) ? chain : config.chain, isLayer(layer) ? layer : config.layer);
        if (target !== config.network) this.actions.switchNetwork(target);
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

    const networkHtml = `<div class="segs">
      <div class="seg" role="group" aria-label="Network">${CHAINS.map((c) =>
        `<button data-chain="${c.name}" class="${c.name === config.chain ? "on" : ""}" ${dis} aria-pressed="${c.name === config.chain}">${c.label}</button>`).join("")}</div>
      <div class="seg" role="group" aria-label="Layer">${LAYERS.map((l) =>
        `<button data-layer="${l.name}" class="${l.name === config.layer ? "on" : ""}" ${dis} aria-pressed="${l.name === config.layer}" title="${l.title}">${l.label}</button>`).join("")}</div></div>`;

    const walletHtml = me
      ? `<div class="row"><span class="addr">${explorerLink(me)}</span>
           <button class="secondary" data-action="disconnect" ${dis}>Disconnect</button></div>`
      : `<div class="row"><span class="muted">Not connected</span>
           <button data-action="connect" ${dis}>Connect wallet</button></div>`;

    let poolHtml: string;
    if (!hasContract()) {
      poolHtml = `<p class="muted">No contract configured on ${config.label}. Free play only.<br>
        Deploy <code>contract/tezinvaders.tz</code> and set <code>VITE_CONTRACT_ADDRESS_${config.envSuffix}</code>.</p>`;
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
          <span>${over ? `Next ticket pays out and starts round ${st.round + 1}` : hasTicket ? `Ticket held · best ${ticket ?? 0}` : "No ticket this round"}</span>
          <button data-action="buyTicket" ${dis} ${!me ? "disabled" : ""}>${hasTicket && !over ? "Top up pool" : "Buy ticket"}</button>
        </div>
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

    // One table: the round's on-chain scores and the stand-in entries ranked together (src/data/leaderboard.json),
    // the latter dimmed and dropped once the same address holds a real ticket.
    const real = s.scores.map((e) => ({ address: e.address, name: displayName(e.address), score: e.score, standIn: false }));
    const taken = new Set(real.map((e) => e.address));
    const standIns = (FAKE_LEADERBOARD as FakeEntry[]).filter((e) => !e.address || !taken.has(e.address)).map((e) => ({ ...e, standIn: true }));
    const byScore = (a: { score: number }, b: { score: number }) => b.score - a.score;
    const rows = [...real, ...standIns].sort(byScore).slice(0, 10).map((e, i) =>
      `<tr class="${e.address === me ? "me" : ""} ${e.standIn ? "stand-in" : ""}"><td>${i + 1}.</td><td>${e.address ? explorerLink(e.address, e.name) : e.name}</td><td>${e.score}</td></tr>`).join("");
    const champs = (s.storage?.champions ?? []).slice(0, 10).map((c) =>
      `<tr class="${c.player === me ? "me" : ""}"><td>R${c.round}</td><td>${explorerLink(c.player)}</td><td>${c.score}</td></tr>`).join("");

    this.root.innerHTML = `
      <h1><img class="logo" src="${import.meta.env.BASE_URL}tezos.svg" alt="" width="18" height="24" />${config.layer === "l2" ? `<sup class="x" title="Tezos X">X</sup>` : ""} TEZINVADERS</h1>
      <section><div class="row"><h2>Wallet</h2>${networkHtml}</div>${walletHtml}</section>
      <section><h2>Prize pool</h2>${poolHtml}</section>
      ${badgesHtml}
      <section><h2>Leaderboard · this round</h2>
        ${rows ? `<table>${rows}</table>` : `<p class="muted">No scores yet.</p>`}</section>
      <section><h2>Hall of fame</h2>
        ${champs ? `<table>${champs}</table>` : `<p class="muted">No rounds finished yet.</p>`}</section>
      <section><div class="status ${s.error ? "error" : ""}">${s.status}</div></section>`;
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
