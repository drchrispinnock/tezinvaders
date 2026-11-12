# TezInvaders

Space Invaders, except the invaders are fiat currencies and you fly a ꜩ. A Tezos dApp prototype:
connect a wallet, pay an entry fee into the prize pool, post your score to the chain, and the
round's top scorer gets paid out by the contract.

## Run the game

```sh
npm install
npm run dev        # http://localhost:5173
```

Keys: ← → (or A/D) move, Space fire, Enter start, P pause. On a phone: tap to start, hold a
finger to fire and steer, or use the on-screen buttons; two fingers pause. Without a contract
configured the game is free play and the side panel just says so.

## Deploy the contract and connect the app

```sh
npm run contract:test                          # exercise contract/tezinvaders.tz on a local mockup chain
npm run verifier:keygen                         # the verifier key pair (see Score verification)
ADMIN=my-alias VERIFIER=edpk… npm run contract:deploy   # originate on Shadownet with octez-client; prints the KT1
cp .env.example .env                           # verifier URL; put the KT1 into src/chain/networks.json
npm run dev
```

Rounds have a deadline on chain (one day by default, `ROUND_LENGTH` at deploy time or the
admin's "Round length" box in the panel). The pool goes in full to the round's top scorer: the
first ticket bought after the deadline settles the round itself, the admin can end a round at
any time, and once the deadline has passed anyone can press "End round & pay out" (see "Round
payouts" below for the hourly backstop).

Scores also earn badges: FA2 tokens the contract mints the first time a player's all-time best
reaches 1,000 (Dollar TezInvader), 3,000 (Euro), 5,000 (Pound), 8,000 (Yen) and 12,000 (the
TezInvaders Mothership). They show in the panel and in any wallet or explorer that lists FA2
tokens; the images are served with the site from `public/badges/` (regenerate them with
`node contract/scripts/export-badges.ts`).

The leaderboard and hall of fame show TzKT account aliases where they exist, each name linking
to the account on the network's explorer, and mix in the stand-in entries from
`src/data/leaderboard.json` (dimmed; converted from `InitialLeaderboard.md` beside it) so the
board never looks empty.

## Advent calendar

From 1 to 25 December, ticket holders who score over 500 on a given day can claim that day's
door: an FA2 token with its own picture (`public/badges/advent/`, contact sheet at
`/badges/advent/index.html`). One door per player per day, claimed from the panel's Advent
section with the same verified-score flow as the leaderboard. Add `?preview=advent` to the URL
to see the calendar before December. The admin can run it again another year with
`set_advent`.

The game also awards an extra life every 5,000 points.

A game that starts without a ticket shows FREE PLAY for its first seconds, so nobody plays a
whole game expecting it to count. Only implicit accounts (tz addresses) can hold tickets.
Ticket holders' games are seeded by the chain (one seed per round, or per day in December), so a
recording cannot be re-attested under another seed or kept for a later round.
## Score verification

The browser never reports a bare score. The game simulation is deterministic given its seed
and the input on every tick, which it records; when you submit, the site sends that recording
to the verifier, which replays it, checks it ends with the score you claim, and signs an
attestation (chain, contract, player, score, a 15-minute expiry). The contract accepts a score
only with a valid attestation from its verifier key. So the only way to a high score is a game
that actually produces it; the remaining hole is a bot that plays the game perfectly.

Run it locally for development:

```sh
npm run verifier:keygen                    # prints edsk (secret) and edpk (the contract's verifier key)
VERIFIER_SECRET_KEY=edsk… npm run verifier # http://localhost:8787; set VITE_VERIFIER_URL in .env
```

The live site uses a Lambda (stack `tezinvaders-verifier`, us-east-1; `GET /key` on its URL
lists the public keys). To create it afresh, with an AWS profile that can manage Secrets
Manager, CloudFormation, IAM and Lambda:

```sh
export AWS_PROFILE=<admin profile> AWS_REGION=us-east-1
deploy/verifier-secret.sh                       # keys from .env into Secrets Manager; prints the ARN
aws cloudformation deploy --stack-name tezinvaders-verifier --template-file deploy/verifier-lambda.yml \
  --capabilities CAPABILITY_IAM --parameter-overrides VerifierSecretArn=<that ARN>
deploy/verifier-deploy.sh                       # bundles and uploads the handler
aws cloudformation describe-stacks --stack-name tezinvaders-verifier \
  --query "Stacks[0].Outputs[?OutputKey==`FunctionUrl`].OutputValue" --output text
```

Put that URL, without its trailing slash, into `.env.production` as `VITE_VERIFIER_URL` and run
`npm run deploy:aws`. After any change to the game simulation or the verifier, run
`deploy/verifier-deploy.sh` again alongside the site deploy: the verifier replays games with
the code it was bundled with, so a mismatch makes every submission fail. The secret holds the shared edsk and any per-chain key (Quantumnet's ML-DSA
key is too large for a Lambda environment variable, hence Secrets Manager); re-run
`deploy/verifier-secret.sh` after a key change. The contract's
verifier key is set at origination (`VERIFIER=edpk…` for the deploy script) and can be rotated
by the admin with `set_verifier`.

## Hosting

Build-time config lives in the committed `.env.production`.

- **AWS (S3 + CloudFront).** `deploy/aws-site.yml` is a CloudFormation stack with a private
  bucket, an Origin Access Control, security headers and HTTPS. Create it once, then
  `BUCKET=… DISTRIBUTION_ID=… npm run deploy:aws` builds and publishes. Costs a few cents a month.
  The live site, https://tezinvaders.xyz, is this: bucket `tezinvaders-site`, distribution
  `EXG3G4877J7V`, deployed with the S3-only `homes3` profile and invalidated with the `home` one:
  `BUCKET=tezinvaders-site DISTRIBUTION_ID=EXG3G4877J7V AWS_PROFILE=homes3 INVALIDATE_PROFILE=home npm run deploy:aws`.

The badge token metadata on chain names the image URL, so after choosing a host repoint the
five tokens with `set_token_metadata` (see `CLAUDE.md`).

Each network has its own URL: `/shadownet`, `/shadownet/tezosx` (Tezos X, the Etherlink
rollup's Michelson interface, which runs the same contract), `/mainnet`, `/mainnet/tezosx`;
`/` redirects to Shadownet until Mainnet is live. The panel's network dropdown and L1 / L2
toggle just navigate between them. Networks, RPCs and contract addresses are listed in
`src/chain/networks.json`. To add a testnet, add an entry (its `name` must be an Octez Connect
network type, or set `connectType: "custom"` for a testnet Octez Connect has no name for and the
wallet goes by the RPC URL; `faucet` is optional), fund the admin alias there, and run
`npm run contract:deploy-network -- <name>`: it originates, waits for that network's TzKT to
index the contract, writes the KT1 into the JSON and tells you to redeploy the site. The L1 / L2
toggle only appears for chains that have a Tezos X entry, and `layerSwitch: false` in the JSON
hides it everywhere.

Quantumnet is special twice: its protocol only accepts post-quantum keys in contracts, so its
verifier key is ML-DSA-44 (the verifier gets it as `VERIFIER_SECRET_KEY_NetXhb8apwTcVhJ`), and
Octez Connect has no name for it, so the wallet identifies it by RPC URL.
To fund the admin on Tezos X, bridge tez from L1: a transfer to the network's bridge helper
(Shadownet `KT19aBsSWvWtvEkbiqReJnD8UzQMWcD8SHUD`, rollup `sr19fMYrr5C4qqvQqQrDSjtP31GcrWjodzvg`)
calling `deposit` with the rollup address and the RLP routing data for the tz1 receiver; Signet's
Bridge menu does the same. Originating on the L2 node works, but octez-client never sees the
confirmation: pass `WAIT=none` to the deploy script and read the KT1 from the Etherlink TzKT.

## Round payouts

The contract settles itself: the first ticket bought after a round's deadline pays the pool to
that round's top scorer and opens the next round in the same transaction. As a backstop for
rounds nobody follows, `deploy/end-rounds.sh` calls `end_round` on every contract listed in
`.env.production` once its deadline has passed; `deploy/com.tezinvaders.end-rounds.plist`
runs it hourly under launchd (install steps are in the plist's comment).

## Layout

- `src/game/` — the game: `sim.ts` (rules, testable), `render.ts`, `sprites.ts`, `input.ts`, `Game.ts`
- `src/chain/` — Octez Connect wallet session, contract calls via octez.js, badge definitions
- `src/ui/panel.ts` — wallet / pool / leaderboard / hall of fame panel
- `contract/` — the Michelson contract (prize pool + FA2 badges) plus storage generator, mockup test, deploy and end-round scripts

See `CLAUDE.md` for the architecture and the contract's storage layout.
