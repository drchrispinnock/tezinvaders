# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

TezInvaders is a browser Space Invaders where the invaders are fiat currency symbols and the
player's ship is a ꜩ. It is a Tezos dApp: players connect a wallet over Octez Connect, pay an entry fee into
a prize pool held by a Michelson contract, submit their score on-chain, and the admin pays the
pool out to the round's top scorer. Frontend is Vite + vanilla TypeScript + Canvas 2D (no
framework). This directory is its own git repo nested inside the `~/tezos` workspace.

## Commands

```sh
npm run dev                 # Vite dev server on http://localhost:5173 (free play works with no contract)
npm run build               # tsc --noEmit, then vite build into dist/
npm run typecheck
npm test                    # vitest, all tests (src/**/*.test.ts)
npx vitest run src/game/sim.test.ts -t "reverses"   # single test by file and name pattern
npm run contract:test       # contract/scripts/test-mockup.sh: originate + exercise the contract on an octez-client mockup chain
npm run contract:deploy     # ADMIN=<alias> VERIFIER=edpk… [ENDPOINT=…] [WAIT=none on Tezos X] [FEE_MUTEZ=…] [ROUND_LENGTH=<s>, default 86400]
node contract/scripts/storage.ts --admin tz1… --verifier edpk…   # print the initial storage literal (used by both scripts)
npm run verifier:keygen     # a verifier key pair; the edpk goes to the contract, the edsk to the verifier's environment
VERIFIER_SECRET_KEY=edsk… npm run verifier   # the score verifier on http://localhost:8787 (VITE_VERIFIER_URL in .env)
npm run verifier:bundle     # rolldown bundle of the Lambda handler into verifier/dist/lambda.mjs
node contract/scripts/storage.ts --token-info 2 # one badge's token_info literal, for set_token_metadata
node contract/scripts/export-badges.ts          # write the badge SVGs to public/badges/
CONTRACT=KT1… SIGNER=<alias> contract/scripts/end-round.sh   # cron-able: calls end_round once the deadline has passed
SIGNER=<alias> deploy/end-rounds.sh                        # the same for every contract in .env.production (hourly launchd job)
```

The contract scripts need `octez-client` on PATH and `node` (22.18+, it runs the TypeScript
storage generator directly; `tsconfig.json` has `allowImportingTsExtensions` so the generator
can import `src/chain/badges.ts`, which imports `sprites.ts` with explicit `.ts` extensions).
The test creates a throwaway mockup chain under `contract/.mockup/`; pass `--keep` to inspect
it afterwards, or `PROTOCOL=<hash>` to pin a protocol instead of the client's default. The
mockup chain's `NOW` is stuck at the epoch, so deadline tests originate with explicit
`--round-ends` values.

Networks live in `src/chain/networks.json`: one entry per chain × layer with its URL path,
chain id, RPC, contract address, TzKT API and explorer (Tezos X entries are the Etherlink
rollup's Michelson interface: same contracts, same tz keys, RPCs at
michelson.etherlink.<chain>.octez.io). The URL picks the network: `/shadownet`,
`/shadownet/tezosx`, `/mainnet`, `/mainnet/tezosx`; `/` and unknown paths redirect to the
`default` entry (Shadownet until Mainnet is live). Adding a testnet is one JSON entry (its
`name` must be an Octez Connect `NetworkType` value) plus an origination. `.env` may override
a contract address (`VITE_CONTRACT_ADDRESS_<NAME>`) for local work and holds the verifier URL. Deploying there: fund the
admin by bridging from L1 (see README), originate with `ENDPOINT=<L2 rpc>`; octez-client hangs
waiting for the confirmation, so stop it and read the KT1 from api.<chain>.etherlink.tzkt.io.
Storage burn on L2 is negligible. `.env.production` is committed and holds only `VITE_VERIFIER_URL`. The panel has a network
dropdown and an L1 / L2 toggle (a `Chain` and a `Layer`, combined by `networkFor()` into a
`NetworkName`); choosing one disconnects the wallet and navigates to that network's path,
because the Octez Connect client and toolkit are bound to one network per page. (Ghostnet no
longer exists.) With no valid KT1 address for the active network the panel says so and the game
is free play only.

## Hosting

One static target:

- **AWS**: `deploy/aws-site.yml` (CloudFormation: private S3 bucket + CloudFront with an
  Origin Access Control and a security-headers policy; no CSP yet, because Octez Connect
  pairing talks to relay hosts that would need listing). `deploy/aws-deploy.sh`
  (`npm run deploy:aws`) builds, syncs `dist/` with long cache headers on `assets/` and
  revalidation on the rest, uploads a copy of `index.html` under every network path from
  `networks.json` (with and without a trailing slash, since CloudFront's default root object only
  covers `/` and the distribution has no rewrite rule), and invalidates the distribution (the
  user's `homes3` profile is S3-only, so that last step is refused and they invalidate by hand).
  The site is served from `/`, so no base path.
- Vite's `base` still follows `BASE_PATH`, and anything that builds a URL in code goes through
  `import.meta.env.BASE_URL` (see the panel's logo), so the site can be served under a path
  prefix if it ever needs to be. The GitHub Pages workflow was removed: tezinvaders.xyz is the
  one deployment.

Badge images ship with the site from `public/badges/`; `BADGE_IMAGE_BASE` in
`src/chain/badges.ts` and the token metadata on chain must name whichever host is live
(repoint with `set_token_metadata`, literal from `storage.ts --token-info <id> --image-base …`).

## Architecture

### Game: `src/game/`

The game is split so the rules can be unit tested without a DOM:

- `sim.ts` — all state and the update rule. `Sim.step(input)` advances exactly one 60 Hz tick.
  It never touches the DOM, canvas or clock, and takes an injectable `rng` so tests can
  suppress bombs and the bonus saucer (`() => 0.999`). Anything the outside world must react
  to (start, shoot, step, kill, bank, hit, wave, gameover) is pushed onto `sim.events`; the
  caller drains it.
- `sprites.ts` — pixel bitmaps as string arrays (`#` lit in the sprite colour, `o` lit in an
  optional second colour, used for the ꜩ badge stamped into the bunkers). `PX` is logical canvas
  pixels per sprite pixel (2). Invader glyphs are 16×16 with no legs row; both animation frames
  are the same glyph. `ROW_KINDS` is the formation top to bottom.
- `logo.ts` — the official Tezos ꜩ mark as an SVG path drawn through `Path2D`, so it is vector
  and crisp at any size: on the cannon's slab, the lives in the HUD, the title and the STAKED
  badge. `public/tezos.svg` is the same path for the favicon and panel header.
- `render.ts` — draws a `Sim` onto the canvas each animation frame; purely a function of state.
  The backing store is sized to `devicePixelRatio` (re-fitted on `resize`) while all drawing
  stays in the 560×640 logical space.
- `intro.ts` — the copy for the introduction splash (`phase === "intro"`, the initial phase;
  Enter moves to the title screen). The renderer word-wraps each paragraph and shows it as a
  looping opening crawl driven by `sim.tick` (14px body at the bottom edge, prompt pinned at
  the top above the vanishing point), so just edit the strings.
- `input.ts` — keyboard state; `start` and pause are edge-triggered.
- `audio.ts` — Web Audio synth for the effects (no sample files). `Game.ts` maps sim events
  (`shoot`, `step`, `kill`, `bank`, `hit`, `wave`, `gameover`) onto it, runs the saucer warble
  while `sim.bank` is set, and unlocks the `AudioContext` on the first keydown. M mutes;
  the choice is kept in `localStorage`.
- `Game.ts` — fixed-timestep loop gluing the three together and forwarding events.

Coordinates are a fixed 560×640 logical canvas scaled by CSS. Collision is AABB except bunkers,
which are per-cell bitmaps eroded by `eraseBlob`.

### Chain: `src/chain/`

- `config.ts` — the `NETWORKS` table, the persisted choice (`currentNetwork` / `setNetwork`),
  and `config` whose getters resolve the active network's RPC and contract, plus
  `hasContract()` / formatting helpers.
- `wallet.ts` — one `TezosToolkit` from `@tezos-x/octez.js` (the Taquito successor) with a
  `BeaconWallet` provider from `@tezos-x/octez.js-dapp-wallet`, which speaks Octez Connect
  (the protocol formerly called Beacon; `@tezos-x/octez.connect-sdk` re-exports its types and
  events). The toolkit works for reads before any wallet is connected. `NetworkType` has
  `shadownet`, `mainnet`, and `tezosx-*` entries for the Etherlink Michelson interface. The
  `PAIR_INIT` event handler is wrapped so closing the pairing dialog rejects `connect()`; by
  default that close is silent and the UI would sit on "Connecting…" forever. Don't import
  `@taquito/*` or `@airgap/*`; the app no longer depends on them.
- `contract.ts` — `readStorage()` decodes the storage (champions sorted, `leader`, `verifier`,
  `roundEnds` in ms and `roundLength` in s; `roundOver()` compares to the clock);
  `readPlayer()` does the big-map lookups for one player (ticket this round, all-time best,
  badge balances). `buyTicket`, `submitScore(score, expires, proof)`, `endRound`,
  `setRoundLength` wrap the entrypoints via `methodsObject` and wait for 1 confirmation. The
  round's table itself comes from TzKT (`readLeaderboard()` in `tzkt.ts`, which fetches the
  scores big map's keys and sorts them here, TzKT cannot sort by value); `main.ts` merges the
  on-chain leader in case the indexer lags. Unit entrypoints must be called with
  `UnitValue` (from `@tezos-x/octez.js`).
- `tzkt.ts` — `resolveAliases()` fetches TzKT account aliases in batches from the active
  network's TzKT API (`tzktApi` in `config.ts`: api.shadownet.tzkt.io / api.tzkt.io) into a
  page-lifetime cache; `aliasOf()` reads it. `main.ts` calls it after every storage load for
  everyone on the boards plus the player, and re-renders when a new alias arrives.
- `verifier.ts` — `requestAttestation()` asks the score verifier for a signed attestation of
  a recorded game (see Score verification below).
- `badges.ts` — the five badges (id, slug, name, threshold, sprite) and `badgeSvg()` /
  `badgeDataUri()`, which render the game's own bitmaps to SVG. The panel draws those data
  URIs locally, so it needs no token-metadata reads. The on-chain token metadata instead
  points at hosted copies, `BADGE_IMAGE_BASE` + `<slug>.svg`: the files
  `contract/scripts/export-badges.ts` writes to `public/badges/`, published with the site at
  tezinvaders.xyz (CloudFront). TzKT and Signet only load `ipfs://` or public https images and show a
  placeholder for `data:` URIs. Thresholds must match the list `PUSH`ed in
  the contract's `submit_score`. If the images move, the admin calls `set_token_metadata`
  with the literal from `storage.ts --token-info <id>`; no redeploy needed.

### UI: `src/ui/panel.ts` and `src/main.ts`

`Panel.render(state)` rebuilds the side panel's innerHTML from a `PanelState`; buttons carry
`data-action` names that map 1:1 onto `PanelActions`. Addresses on the boards and in the
wallet row go through `explorerLink()`: the TzKT alias when there is one, else the short
address, as a link to the account on the network's TzKT explorer (`explorer` in
`config.ts`) opening in a new tab, with the full address in the tooltip. The leaderboard merges the round's on-chain scores with the
stand-in entries in `src/data/leaderboard.json` (`[{ "address"?, "name", "score" }]`,
converted from `InitialLeaderboard.md` beside it) into one table ranked by score; stand-in rows are dimmed (`tr.stand-in`) and a stand-in is dropped once its address holds a real
ticket. Edit that file to change the list (`resolveJsonModule` is on for the import). Inputs carry `data-field` and their
typed values survive re-renders in `Panel.drafts` (the admin's round-length box). The round
deadline is shown as "ends in …" and refreshes with the 20 s storage poll; once passed, Buy
ticket and Submit score are disabled and everyone sees the End round button. `main.ts` owns the single `PanelState`,
wires game events to it (a `gameover` event sets `pendingScore`, shown as a "Submit score"
button only if the player holds a ticket and beat their on-chain best), polls storage every
20 s, and routes every wallet call through `run()` so busy/status/error handling is uniform.
`game.staked` only reflects whether the connected address holds a ticket this round; without one
the HUD says FREE PLAY and the prize-pool section tells the player to connect and buy a ticket.

### Contract: `contract/tezinvaders.tz`

Hand-written Michelson (no LIGO/SmartPy toolchain assumed). Storage is a right comb accessed
with `GET n`/`UPDATE n`: 1 admin, 3 entry_fee, 5 round, 7 pool, 9 round_ends (timestamp),
11 round_length (int seconds), 13 verifier (`key`, signs score attestations), 15 leader
(`option (pair address nat)`, this round's top scorer), 17 scores (`big_map address nat`,
this round's best per ticket holder), 19 champions (`map nat (pair address nat)`, round →
winner), 21 best (`big_map address nat`, all-time best per player), 23 ledger / 25 operators /
27 token_metadata (FA2), 28 metadata (TZIP-16). Scores are a big map so a round can have any
number of players; the frontend reads the table from TzKT (`readLeaderboard()`) and the
contract never iterates it: the leader is tracked on every submit. `champions` is a plain map
(one entry per round) read from storage.

Entrypoints: `play` (pay exactly `entry_fee`; inserts the sender with score 0, who leads the
round if nobody does yet; rejects senders that cannot receive tez; once `round_ends` has passed
it first runs the settlement below, so the ticket opens the next round), `submit_score`
(`((score, expires), proof)`; ticket holders only, before `round_ends`; `proof` must be the
verifier's signature over `PACK (pair (pair chain_id self_address) (pair (pair sender score)
expires))` and `NOW <= expires`; keeps the max; takes the lead when strictly higher than the
leader's score, so ties keep the earlier leader; when the player's all-time `best` rises it
mints every badge whose threshold lies in (old best, new score]), `end_round` (admin at any
time, anyone once `NOW >= round_ends`; runs the settlement: pays the full pool to the leader,
archives them to `champions`, resets leader and scores (a fresh `EMPTY_BIG_MAP`), increments
`round`, sets `round_ends = NOW + round_length`; works on an empty round). The settlement is
one `LAMBDA` pushed at the top of `code` and kept at the bottom of the stack (its storage type
is spelt out, so it must follow any storage change); `play` and `end_round` `EXEC` it.
`set_entry_fee` (admin), `set_round_length` (admin; positive seconds; also reschedules the
current round to `NOW + length`), `set_verifier` (admin; rotates the attestation key),
`set_token_metadata` (admin; replaces one token's `token_info` map), and the TZIP-12 trio
`transfer` / `balance_of` / `update_operators` over the badge tokens. Badges are
semi-fungible: token ids 0–4 (dollar 1000, euro 3000, pound 5000, yen 8000, mothership
12000), minted at most once per player per id, freely transferable. Failures use string
`FAILWITH`s (`BAD_FEE`, `NO_TICKET`, `NOT_ADMIN`, `NO_TEZ_ACCEPTED`, `ROUND_OVER`,
`ROUND_RUNNING`, `BAD_LENGTH`, `BAD_PROOF`, `PROOF_EXPIRED`, `UNPAYABLE_*`, `FA2_*`);
`main.ts` extracts these from octez.js errors.

Michelson layout gotcha: the octez parser rejects a multi-line sequence whose elements start at
a column left of the opening `{` ("misaligned expression"). Keep the body of `code {` indented
past the brace, and keep both branches of an `IF*` at the same column. When the typechecker
complains about layout, flattening the file to one line is a quick way to confirm the logic
itself is fine.

If the storage shape changes, update all of: the contract (including the settlement lambda's
spelt-out storage type), the literal printed by `contract/scripts/storage.ts` (the only place
the `--init` comes from), `RawStorage`/`readStorage` in `src/chain/contract.ts`, and
`test-mockup.sh`, which reads big maps by position (the scores id follows the leader; the
other five are the last five numbers of the storage print).

### Score verification: `verifier/`

`src/game/sim.ts` is deterministic given its seed (`Sim.seed`, a mulberry32 generator
restarted in `startGame`) and the input on each tick, which it records in `Sim.log` from
`startGame` to game over (`encodeInput` packs left/right/fire/start into one code;
`encodeLog`/`decodeLog` are the run-length text form; `replay(seed, log)` rebuilds the game).
`main.ts` keeps the finished game as `pendingGame` beside `pendingScore`; on "Submit score"
it POSTs `{chainId, contract, player, score, seed, log}` to `VITE_VERIFIER_URL/attest`
(`src/chain/verifier.ts`), and the verifier (`verifier/attest.ts`) replays the log, checks it
ended with that score, and signs `PACK (pair (pair chain_id contract) (pair (pair player
score) expires))` with its edsk, `expires` being 15 minutes out so an attestation cannot be
banked for a later round. The contract checks the signature against its `verifier` key.
`verifier/server.ts` is a plain Node server, `verifier/lambda.ts` the same behind a Lambda
Function URL (`npm run verifier:bundle` bundles it with rolldown; `deploy/verifier-lambda.yml`
and `deploy/verifier-deploy.sh` create and update it), `verifier/keygen.ts` makes a key pair
and `verifier/sign.ts` signs arbitrary claims for the mockup tests, which run the real signing
code so the packing is checked against the chain. Node runs the verifier directly; the
octez.js packages are CommonJS to it, hence the default-import-and-destructure style there.
The verifier's secret lives only in its environment (and the admin's ignored `.env`).

## Known prototype limitations

- Scores are attested by the verifier, which only proves the recorded inputs produce that
  score in the simulation. A bot that plays the deterministic game perfectly gets a genuine
  attestation; rate limits and anti-bot heuristics are not in place. The verifier is a trusted
  service: whoever holds its key can sign any score (rotate with `set_verifier`).
- Rounds settle lazily: the first ticket after the deadline pays out the old round. A round
  nobody follows waits for `end_round`; the panel shows everyone the button and
  `deploy/end-rounds.sh` (hourly launchd job on the admin's Mac, plist in `deploy/`) calls it
  for every contract in `.env.production`.
- Badge pictures are hosted with the site at tezinvaders.xyz, not on chain; if the site moves
  the admin repoints the tokens with `set_token_metadata` (literal from
  `storage.ts --token-info <id> --image-base <new base>`).
- Winner takes the whole pool; no split, no rake.
