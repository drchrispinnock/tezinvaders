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
  /** Current round, best score per ticket holder, highest first. */
  scores: ScoreEntry[];
  /** Past round winners, most recent first. */
  champions: Champion[];
}

/** A player's badge state: all-time best score and the badge ids they currently hold. */
export interface PlayerBadges {
  best: number;
  owned: ReadonlySet<number>;
}

interface RawStorage {
  admin: string;
  entry_fee: BigNumber;
  round: BigNumber;
  pool: BigNumber;
  round_ends: string;
  round_length: BigNumber;
  scores: MichelsonMap<string, BigNumber>;
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
  const scores: ScoreEntry[] = [];
  raw.scores.forEach((score, address) => scores.push({ address, score: score.toNumber() }));
  scores.sort((a, b) => b.score - a.score || a.address.localeCompare(b.address));
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
    scores,
    champions,
  };
}

/** Big map lookups for one player: their all-time best and which badges they hold. */
export async function readBadges(tezos: TezosToolkit, address: string): Promise<PlayerBadges> {
  const raw = await rawStorage(tezos);
  const [best, ...balances] = await Promise.all([
    raw.best.get<BigNumber>(address),
    ...BADGES.map((b) => raw.ledger.get<BigNumber>({ owner: address, token_id: b.id })),
  ]);
  const owned = new Set<number>();
  balances.forEach((bal, i) => { if (bal && bal.gt(0)) owned.add(BADGES[i]!.id); });
  return { best: best?.toNumber() ?? 0, owned };
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

export async function submitScore(tezos: TezosToolkit, score: number): Promise<string> {
  const op = await (await method(tezos, "submit_score"))(score).send();
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
