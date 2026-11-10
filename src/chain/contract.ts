import { UnitValue, type BigMapAbstraction, type MichelsonMap, type TezosToolkit } from "@tezos-x/octez.js";
import type BigNumber from "bignumber.js";
import { BADGES } from "./badges";
import { config } from "./config";

export interface ScoreEntry { address: string; score: number }
export interface Champion { round: number; player: string; score: number }

export interface GameStorage {
  admin: string;
  entryFee: number;
  round: number;
  pool: number;
  /** When the current round ends (ms since epoch). From then on anyone can pay it out. */
  roundEnds: number;
  /** Seconds each new round runs for. */
  roundLength: number;
  /** The key whose attestations submit_score accepts. */
  verifier: string;
  /** This round's top scorer so far (the first ticket holder, at 0, until someone scores). */
  leader: ScoreEntry | null;
  /** Past round winners, most recent first. */
  champions: Champion[];
}

/** One player's state: all-time best, badges held, and their score this round (null without a ticket). */
export interface PlayerState {
  best: number;
  owned: ReadonlySet<number>;
  ticket: number | null;
}

interface RawLeaderRecord { player: string; score: BigNumber }
type RawLeader = RawLeaderRecord | { Some: RawLeaderRecord };

/** Normalises the decoder's shape for `option (pair address nat)`. */
export function decodeLeader(raw: RawLeader | null | undefined): ScoreEntry | null {
  if (!raw) return null;
  const rec = "Some" in raw ? raw.Some : raw;
  return rec ? { address: rec.player, score: Number(rec.score) } : null;
}

interface RawStorage {
  admin: string;
  entry_fee: BigNumber;
  round: BigNumber;
  pool: BigNumber;
  round_ends: string;
  round_length: BigNumber;
  verifier: string;
  /** octez.js gives an option of a record as `{ Some: record }` (or the bare record), and null for None. */
  leader: RawLeader | null;
  scores: BigMapAbstraction;
  champions: MichelsonMap<BigNumber, { player: string; score: BigNumber }>;
  best: BigMapAbstraction;
  ledger: BigMapAbstraction;
}

async function rawStorage(tezos: TezosToolkit): Promise<RawStorage> {
  const contract = await tezos.contract.at(config.contractAddress);
  return contract.storage<RawStorage>();
}

export const roundOver = (s: GameStorage, now = Date.now()): boolean => now >= s.roundEnds;

export async function readStorage(tezos: TezosToolkit): Promise<GameStorage> {
  const raw = await rawStorage(tezos);
  const champions: Champion[] = [];
  raw.champions.forEach((c, round) => champions.push({ round: Number(round), player: c.player, score: c.score.toNumber() }));
  champions.sort((a, b) => b.round - a.round);
  return {
    admin: raw.admin,
    entryFee: raw.entry_fee.toNumber(),
    round: raw.round.toNumber(),
    pool: raw.pool.toNumber(),
    roundEnds: Date.parse(raw.round_ends),
    roundLength: raw.round_length.toNumber(),
    verifier: raw.verifier,
    leader: decodeLeader(raw.leader),
    champions,
  };
}

/** Big map lookups for one player: their ticket this round, all-time best and which badges they hold. */
export async function readPlayer(tezos: TezosToolkit, address: string): Promise<PlayerState> {
  const raw = await rawStorage(tezos);
  const [ticket, best, ...balances] = await Promise.all([
    raw.scores.get<BigNumber>(address),
    raw.best.get<BigNumber>(address),
    ...BADGES.map((b) => raw.ledger.get<BigNumber>({ owner: address, token_id: b.id })),
  ]);
  const owned = new Set<number>();
  balances.forEach((bal, i) => { if (bal && bal.gt(0)) owned.add(BADGES[i]!.id); });
  return { best: best?.toNumber() ?? 0, owned, ticket: ticket ? ticket.toNumber() : null };
}

async function method(tezos: TezosToolkit, name: string) {
  const c = await tezos.wallet.at(config.contractAddress);
  const m = c.methodsObject[name];
  if (!m) throw new Error(`contract has no entrypoint ${name}`);
  return m;
}

/** Pay the entry fee for the current round. Resolves with the operation hash once included. */
export async function buyTicket(tezos: TezosToolkit, entryFeeMutez: number): Promise<string> {
  const op = await (await method(tezos, "play"))(UnitValue).send({ amount: entryFeeMutez, mutez: true });
  await op.confirmation(1);
  return op.opHash;
}

/** Record an attested score: `expires` (unix seconds) and `proof` come from the verifier. */
export async function submitScore(tezos: TezosToolkit, score: number, expires: number, proof: string): Promise<string> {
  const op = await (await method(tezos, "submit_score"))({ score, expires: new Date(expires * 1000).toISOString(), proof }).send();
  await op.confirmation(1);
  return op.opHash;
}

/** Pay out the pool to the round's top scorer and open the next round. Admin any time; anyone after the deadline. */
export async function endRound(tezos: TezosToolkit): Promise<string> {
  const op = await (await method(tezos, "end_round"))(UnitValue).send();
  await op.confirmation(1);
  return op.opHash;
}

/** Admin only: set the round length in seconds. The current round is rescheduled to end that long from now. */
export async function setRoundLength(tezos: TezosToolkit, seconds: number): Promise<string> {
  const op = await (await method(tezos, "set_round_length"))(seconds).send();
  await op.confirmation(1);
  return op.opHash;
}
