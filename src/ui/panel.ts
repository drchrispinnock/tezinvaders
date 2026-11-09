import { BADGES, badgeDataUri, badgeFor } from "../chain/badges";
import { NETWORKS, config, formatTez, hasContract, isNetworkName, shortAddress, type NetworkName } from "../chain/config";
import { roundOver, type GameStorage, type PlayerBadges } from "../chain/contract";

export interface PanelState {
  address: string | null;
  storage: GameStorage | null;
  /** The connected player's all-time best and badges; null until loaded or when not connected. */
  badges: PlayerBadges | null;
  busy: boolean;
  status: string;
  error: boolean;
  /** Score waiting to be submitted after a game over, if the player is eligible. */
  pendingScore: number | null;
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
      const btn = (e.target as HTMLElement).closest<HTMLButtonElement>("button[data-action], button[data-network]");
      if (!btn || btn.disabled) return;
      const network = btn.dataset.network;
      if (network !== undefined) {
        if (isNetworkName(network) && network !== config.network) this.actions.switchNetwork(network);
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
    const myEntry = me && s.storage ? s.storage.scores.find((x) => x.address === me) : undefined;
    const hasTicket = Boolean(myEntry);
    const isAdmin = Boolean(me && s.storage && s.storage.admin === me);
    const over = s.storage ? roundOver(s.storage) : false;
    const dis = s.busy ? "disabled" : "";

    const networkHtml = `<div class="seg" role="group" aria-label="Network">${Object.values(NETWORKS).map((n) =>
      `<button data-network="${n.name}" class="${n.name === config.network ? "on" : ""}" ${dis} aria-pressed="${n.name === config.network}">${n.label}</button>`).join("")}</div>`;

    const walletHtml = me
      ? `<div class="row"><span class="addr" title="${me}">${shortAddress(me)}</span>
           <button class="secondary" data-action="disconnect" ${dis}>Disconnect</button></div>`
      : `<div class="row"><span class="muted">Not connected</span>
           <button data-action="connect" ${dis}>Connect wallet</button></div>`;

    let poolHtml: string;
    if (!hasContract()) {
      poolHtml = `<p class="muted">No contract configured on ${config.label}. Free play only.<br>
        Deploy <code>contract/tezinvaders.tz</code> and set <code>VITE_CONTRACT_ADDRESS_${config.network.toUpperCase()}</code>.</p>`;
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
          <span>${hasTicket ? `Ticket held · best ${myEntry?.score ?? 0}` : "No ticket this round"}</span>
          <button data-action="buyTicket" ${dis} ${!me || over ? "disabled" : ""}>${hasTicket ? "Top up pool" : "Buy ticket"}</button>
        </div>
        ${s.pendingScore !== null && hasTicket && s.pendingScore > (myEntry?.score ?? 0)
          ? over
            ? `<div class="row"><span class="muted">New best ${s.pendingScore}, but the round is over</span></div>`
            : `<div class="row"><span>New best: ${s.pendingScore}</span>
                 <button class="submit" data-action="submitScore" ${dis}>Submit score on-chain</button></div>`
          : ""}
        ${canPayOut ? `<div class="row"><span class="muted">${isAdmin ? "You are the admin" : "Deadline passed"}</span>
               <button class="secondary" data-action="endRound" ${dis}>End round &amp; pay out</button></div>` : ""}
        ${isAdmin ? `<div class="row"><label class="muted">Round length
               <input data-field="roundLength" type="number" min="1" step="1" value="${this.drafts.roundLength ?? roundLengthHours}" ${dis}> h</label>
               <button class="secondary" data-action="setRoundLength" ${dis}>Schedule</button></div>` : ""}`;
    }

    const badgesHtml = hasContract() ? this.badges(s, me) : "";

    const rows = (s.storage?.scores ?? []).slice(0, 10).map((e, i) =>
      `<tr class="${e.address === me ? "me" : ""}"><td>${i + 1}.</td><td title="${e.address}">${shortAddress(e.address)}</td><td>${e.score}</td></tr>`).join("");
    const champs = (s.storage?.champions ?? []).slice(0, 10).map((c) =>
      `<tr class="${c.player === me ? "me" : ""}"><td>R${c.round}</td><td title="${c.player}">${shortAddress(c.player)}</td><td>${c.score}</td></tr>`).join("");

    this.root.innerHTML = `
      <h1><img class="logo" src="/tezos.svg" alt="" width="18" height="24" /> TEZINVADERS</h1>
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
