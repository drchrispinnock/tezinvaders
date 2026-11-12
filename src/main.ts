import "./polyfills";
import { DEFAULT_NETWORK, NETWORKS, config, hasContract, networkFromPath, pathFor } from "./chain/config";
import { buyTicket, claimAdvent, endRound, readPlayer, readStorage, setRoundLength, submitScore, type GameStorage, type ScoreEntry } from "./chain/contract";
import { mergeLeader, readLeaderboard, readTokenIds, resolveAliases } from "./chain/tzkt";
import { requestAttestation } from "./chain/verifier";
import { encodeLog } from "./game/sim";
import { adventDay } from "./chain/advent";
import { BADGES } from "./chain/badges";
import { Wallet } from "./chain/wallet";
import { Game } from "./game/Game";
import { Panel, type PanelState } from "./ui/panel";

const POLL_MS = 20_000;

// The URL names the network (/shadownet, /shadownet/tezosx, …). Anything else goes to the default.
if (!networkFromPath(location.pathname)) {
  location.replace(pathFor(DEFAULT_NETWORK) + location.search + location.hash);
} else if (location.pathname !== config.path) {
  history.replaceState(null, "", config.path + location.search + location.hash);
}

const canvas = document.getElementById("game") as HTMLCanvasElement;
const panelRoot = document.getElementById("panel") as HTMLElement;

const wallet = new Wallet();
const state: PanelState = { address: null, storage: null, scores: [], badges: null, busy: false, status: "", error: false, pendingScore: null, pendingGame: null, switching: null, tokens: new Set() };

const game = new Game(canvas, (e) => {
  if (e.type === "start") state.pendingScore = null;
  if (e.type === "gameover") {
    state.pendingScore = e.score;
    state.pendingGame = { seed: game.sim.seed, log: encodeLog(game.sim.log) };
  }
  if (e.type === "gameover" || e.type === "start") refreshPanel();
});

// Dev only: lets the headless probes drive the game.
if (import.meta.env.DEV) (window as unknown as { __game: Game }).__game = game;

// Tezos X (L2) look: an X beside every ꜩ, a gold trim and its own favicon.
const onL2 = config.layer === "l2";
game.layer2 = onL2;
document.body.classList.toggle("l2", onL2);
if (onL2) document.querySelector<HTMLLinkElement>("link[rel=icon]")?.setAttribute("href", `${import.meta.env.BASE_URL}tezos-x.svg`);

function refreshPanel(): void {
  const me = state.address;
  game.staked = Boolean(me && state.badges?.ticket !== null && state.badges?.ticket !== undefined);
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
    const m = /with: \{"string":"([A-Z_]+)"\}/.exec(msg) ?? /"(BAD_FEE|NO_TICKET|NOT_ADMIN|NO_TEZ_ACCEPTED|ROUND_OVER|ROUND_RUNNING|BAD_LENGTH|BAD_PROOF|PROOF_EXPIRED|ADVENT_\w+|UNPAYABLE_\w+|FA2_\w+)"/.exec(msg);
    return m?.[1] ?? msg;
  }
  return String(err);
}

async function loadStorage(): Promise<GameStorage | null> {
  if (!hasContract()) return null;
  try {
    state.storage = await readStorage(wallet.tezos);
    state.scores = await leaderboard(state.storage.leader);
    state.badges = state.address ? await readPlayer(wallet.tezos, state.address) : null;
    if (state.address) state.tokens = await readTokenIds(state.address).catch(() => state.tokens);
    if (state.error) state.error = false;
  } catch (err) {
    setStatus(`Could not read contract: ${describe(err)}`, true);
  }
  refreshPanel();
  void nameAddresses();
  return state.storage;
}

/** This round's table from the indexer, with the on-chain leader merged in case the indexer lags. */
async function leaderboard(leader: ScoreEntry | null): Promise<ScoreEntry[]> {
  return mergeLeader(await readLeaderboard().catch(() => state.scores), leader);
}

/** Look up TzKT aliases for everyone on the boards (and the player), re-rendering if any are new. */
async function nameAddresses(): Promise<void> {
  const s = state.storage;
  const addresses = [...state.scores.map((e) => e.address), ...(s?.champions ?? []).map((c) => c.player)];
  if (state.address) addresses.push(state.address);
  if (await resolveAliases(addresses)) refreshPanel();
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
    const score = state.pendingScore, game = state.pendingGame, player = state.address;
    if (score === null || !game) throw new Error("no score to submit");
    if (!player) throw new Error("not connected");
    setStatus("Verifying the game…");
    const a = await requestAttestation(player, score, game);
    setStatus(`Submitting score ${score}…`);
    const hash = await submitScore(wallet.tezos, a.score, a.expires, a.proof);
    state.pendingScore = null;
    state.pendingGame = null;
    const before = state.badges?.owned ?? new Set<number>();
    await loadStorage();
    const earned = BADGES.filter((b) => state.badges?.owned.has(b.id) && !before.has(b.id));
    if (earned.length) throw new Status(`Badge earned: ${earned.map((b) => b.name).join(", ")}`);
    return hash;
  }),
  claimAdvent: () => run("Claiming today's door", async () => {
    const score = state.pendingScore, game = state.pendingGame, player = state.address, st = state.storage;
    if (score === null || !game || !st) throw new Error("no game to claim with");
    if (!player) throw new Error("not connected");
    setStatus("Verifying the game…");
    const a = await requestAttestation(player, score, game);
    setStatus("Claiming today's door…");
    const hash = await claimAdvent(wallet.tezos, a.score, a.expires, a.proof);
    const day = adventDay(Date.now(), st.adventStart);
    if (day !== null) state.tokens = new Set([...state.tokens, st.adventToken + day]);
    await loadStorage();
    return hash;
  }),
  endRound: () => run("Ending round", async () => { const hash = await endRound(wallet.tezos); await loadStorage(); return hash; }),
  setRoundLength: (hours) => run(`Scheduling ${hours}h rounds`, async () => {
    const hash = await setRoundLength(wallet.tezos, Math.round(hours * 3600));
    await loadStorage();
    return hash;
  }),
  // Each network is its own page: the wallet and toolkit are bound to one network, so switching
  // navigates to that network's URL at once. The wallet session is not torn down here (that takes
  // seconds); the new page drops a session that belongs to another network (Wallet.restore).
  switchNetwork: (name) => {
    state.busy = true;
    state.switching = NETWORKS[name]?.label ?? name;
    setStatus(`Switching to ${state.switching}…`);
    location.assign(pathFor(name));
  },
});

wallet.onAccountChange = (address) => { state.address = address; state.badges = null; state.tokens = new Set(); refreshPanel(); void loadStorage(); };
refreshPanel();
wallet.restore().then((address) => { state.address = address; return loadStorage(); }).catch(() => undefined);
loadStorage();
setInterval(loadStorage, POLL_MS);
