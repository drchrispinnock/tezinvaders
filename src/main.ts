import "./polyfills";
import { hasContract, setNetwork } from "./chain/config";
import { buyTicket, endRound, readBadges, readStorage, setRoundLength, submitScore, type GameStorage } from "./chain/contract";
import { BADGES } from "./chain/badges";
import { Wallet } from "./chain/wallet";
import { Game } from "./game/Game";
import { Panel, type PanelState } from "./ui/panel";

const POLL_MS = 20_000;

const canvas = document.getElementById("game") as HTMLCanvasElement;
const panelRoot = document.getElementById("panel") as HTMLElement;

const wallet = new Wallet();
const state: PanelState = { address: null, storage: null, badges: null, busy: false, status: "", error: false, pendingScore: null };

const game = new Game(canvas, (e) => {
  if (e.type === "start") state.pendingScore = null;
  if (e.type === "gameover") state.pendingScore = e.score;
  if (e.type === "gameover" || e.type === "start") refreshPanel();
});

function refreshPanel(): void {
  const me = state.address;
  game.staked = Boolean(me && state.storage?.scores.some((s) => s.address === me));
  panel.render(state);
}

function setStatus(status: string, error = false): void {
  state.status = status;
  state.error = error;
  refreshPanel();
}

/** Thrown by an action to end with a custom (non-error) status line. */
class Status extends Error {}

async function run<T>(label: string, fn: () => Promise<T>): Promise<T | undefined> {
  state.busy = true;
  setStatus(`${label}…`);
  try {
    const result = await fn();
    state.busy = false;
    setStatus(`${label}: done`);
    return result;
  } catch (err) {
    state.busy = false;
    if (err instanceof Status) setStatus(`${label}: done · ${err.message}`);
    else setStatus(`${label} failed: ${describe(err)}`, true);
    return undefined;
  } finally {
    canvas.focus();
  }
}

function describe(err: unknown): string {
  if (err && typeof err === "object" && "message" in err) {
    const msg = String((err as { message: unknown }).message);
    // Surface the contract's FAILWITH string when octez.js wraps it.
    const m = /with: \{"string":"([A-Z_]+)"\}/.exec(msg) ?? /"(BAD_FEE|NO_TICKET|NOT_ADMIN|NO_TEZ_ACCEPTED|ROUND_OVER|ROUND_RUNNING|BAD_LENGTH|UNPAYABLE_\w+|FA2_\w+)"/.exec(msg);
    return m?.[1] ?? msg;
  }
  return String(err);
}

async function loadStorage(): Promise<GameStorage | null> {
  if (!hasContract()) return null;
  try {
    state.storage = await readStorage(wallet.tezos);
    state.badges = state.address ? await readBadges(wallet.tezos, state.address) : null;
    if (state.error) state.error = false;
  } catch (err) {
    setStatus(`Could not read contract: ${describe(err)}`, true);
  }
  refreshPanel();
  return state.storage;
}

const panel = new Panel(panelRoot, {
  connect: () => run("Connecting", async () => { state.address = await wallet.connect(); await loadStorage(); }),
  disconnect: () => run("Disconnecting", async () => { await wallet.disconnect(); state.address = null; }),
  buyTicket: () => run("Buying ticket", async () => {
    const fee = state.storage?.entryFee;
    if (fee === undefined) throw new Error("storage not loaded");
    const hash = await buyTicket(wallet.tezos, fee);
    await loadStorage();
    return hash;
  }),
  submitScore: () => run(`Submitting score ${state.pendingScore}`, async () => {
    const score = state.pendingScore;
    if (score === null) throw new Error("no score to submit");
    const hash = await submitScore(wallet.tezos, score);
    state.pendingScore = null;
    const before = state.badges?.owned ?? new Set<number>();
    await loadStorage();
    const earned = BADGES.filter((b) => state.badges?.owned.has(b.id) && !before.has(b.id));
    if (earned.length) throw new Status(`Badge earned: ${earned.map((b) => b.name).join(", ")}`);
    return hash;
  }),
  endRound: () => run("Ending round", async () => { const hash = await endRound(wallet.tezos); await loadStorage(); return hash; }),
  setRoundLength: (hours) => run(`Scheduling ${hours}h rounds`, async () => {
    const hash = await setRoundLength(wallet.tezos, Math.round(hours * 3600));
    await loadStorage();
    return hash;
  }),
  // The wallet and toolkit are bound to one network, so switching drops the session and reloads.
  switchNetwork: (name) => run(`Switching to ${name}`, async () => {
    await wallet.disconnect().catch(() => undefined);
    setNetwork(name);
    location.reload();
  }),
});

wallet.onAccountChange = (address) => { state.address = address; state.badges = null; refreshPanel(); void loadStorage(); };
refreshPanel();
wallet.restore().then((address) => { state.address = address; return loadStorage(); }).catch(() => undefined);
loadStorage();
setInterval(loadStorage, POLL_MS);
