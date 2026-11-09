# TezInvaders

Space Invaders, except the invaders are fiat currencies and you fly a ꜩ. A Tezos dApp prototype:
connect a wallet, pay an entry fee into the prize pool, post your score to the chain, and the
round's top scorer gets paid out by the contract.

## Run the game

```sh
npm install
npm run dev        # http://localhost:5173
```

Keys: ← → (or A/D) move, Space fire, Enter start, P pause. Without a contract configured the game
is free play and the side panel just says so.

## Deploy the contract and connect the app

```sh
npm run contract:test                          # exercise contract/tezinvaders.tz on a local mockup chain
ADMIN=my-alias npm run contract:deploy         # originate on Shadownet with octez-client; prints the KT1
cp .env.example .env                           # then set VITE_CONTRACT_ADDRESS_SHADOWNET to that KT1
npm run dev
```

Rounds have a deadline on chain (one week by default, `ROUND_LENGTH` at deploy time or the
admin's "Round length" box in the panel). The admin can end a round at any time; once the
deadline has passed anyone can press "End round & pay out", and `contract/scripts/end-round.sh`
does the same from cron. The pool goes in full to the round's top scorer.

Scores also earn badges: FA2 tokens the contract mints the first time a player's all-time best
reaches 1,000 ($), 3,000 (€), 5,000 (£), 8,000 (¥) and 12,000 (the mothership). They show in
the panel and in any wallet or explorer that lists FA2 tokens; the images are served with the
site from `public/badges/` (regenerate them with `node contract/scripts/export-badges.ts`).

## Hosting

Build-time config lives in the committed `.env.production`. Two ready-made targets:

- **AWS (S3 + CloudFront).** `deploy/aws-site.yml` is a CloudFormation stack with a private
  bucket, an Origin Access Control, security headers and HTTPS. Create it once, then
  `BUCKET=… DISTRIBUTION_ID=… npm run deploy:aws` builds and publishes. Costs a few cents a month.
- **GitHub Pages.** Pushing to `main` builds and deploys via `.github/workflows/pages.yml`
  (enable Pages once with "GitHub Actions" as the source).

The badge token metadata on chain names the image URL, so after choosing a host repoint the
five tokens with `set_token_metadata` (see `CLAUDE.md`).

The panel has a Shadownet / Mainnet toggle; Shadownet is the default. Each network has its own
contract address in `.env` (`VITE_CONTRACT_ADDRESS_MAINNET` for Mainnet, deployed with
`ENDPOINT=https://rpc.tzkt.io/mainnet`).

## Layout

- `src/game/` — the game: `sim.ts` (rules, testable), `render.ts`, `sprites.ts`, `input.ts`, `Game.ts`
- `src/chain/` — Octez Connect wallet session, contract calls via octez.js, badge definitions
- `src/ui/panel.ts` — wallet / pool / leaderboard / hall of fame panel
- `contract/` — the Michelson contract (prize pool + FA2 badges) plus storage generator, mockup test, deploy and end-round scripts

See `CLAUDE.md` for the architecture and the contract's storage layout.
