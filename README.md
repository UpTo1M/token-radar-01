# Token Radar

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/UpTo1M/token-radar-01/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/UpTo1M/token-radar-01/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

A token launch radar: it reads a sealed DefiLlama snapshot of 758 protocols, finds the ones with no token on record, and ranks them by implied value — what a launch would be worth if the protocol's record stayed as it is. The watchlist is the floor (40 protocols with at least $50M of TVL and no token on record); the early radar adds 186 pre-token protocols below that floor. Every row carries a farm plan with costs and times, and the dashboard lets you sort, filter, inspect one protocol's model, and re-rank the board with a model sandbox.

Built for the [make.fun Token Radar bounty](https://make.fun/bounty/token-radar-01).

## The model (radar-2)

Implied value is one function of the snapshot figures. No protocol name is special-cased, and no row is hand-picked.

```
implied = round( tvl_usd
  × 0.22
  × (1 + clamp(change_7d, -60, 150) / 100 × 0.6)
  × (0.55 + min(age_days, 1460) / 1460 × 0.45)
  × chain × category )
```

- **Base multiple 0.22** — a pre-token protocol's implied value is a fraction of its TVL.
- **Growth** — the seven-day TVL change, clamped to −60%…+150%, weighted 0.6. A protocol that is growing is worth more than one that is shrinking at the same size.
- **Maturity** — age since the protocol was first listed, the best record of how long it has run with no token. It rises from 0.55 at launch to 1.00 at four years; an unlisted age uses 365 days.
- **Chain breadth** — 1 + 0.06 per chain beyond the first, capped at 5 extra chains. More chains mean more places to farm.
- **Category** — read from the snapshot's category field only: Lending/CDP 1.12, Perpetual/Derivative 1.10, Leveraged Farming 1.08, Dexs 1.08, Yield/Prediction/Curator 1.05, Liquid Staking/Restaking 0.92, Restaked BTC 0.90, Bridge 0.85, everything else 1.00. Categories where a user can take more distinct actions carry a larger farmable surface.

Live-token protocols are set aside from the ranking (24 in this snapshot): their market cap is a fact, not a model.

## Farm plans

Every row carries a 7-step plan derived from the protocol's own record — its category, its chains, its TVL and its age. Each step states what to do, what it costs and how long it takes. Capital is sized from TVL ($50–$250), the hold is sized from age (30–60 days), and the plan starts by verifying the protocol's own site and contract address before any deposit.

## Run it

Node 22 or later, standard library only — no dependencies to install.

```sh
# In the grader's container, the sealed snapshot is at /input and the
# output goes to /output:
node main.ts

# Locally, point at the kit's snapshot and an output directory:
mkdir -p out
MAKEFUN_OUTPUT_DIR=out node main.ts --input <kit>/input/snapshot.json
```

`main.ts` writes `board.json` (the ranked board), `data.js` (the dashboard's data), `dashboard/` and `screenshots/` (copied), and `dossier.json` (written last, with the vendored `vendor/makefun-board.ts` library). It refuses a board the gate would refuse and refuses a screenshot over the 512 KiB cap or not a PNG/JPEG.

## The dashboard

Open `dashboard/index.html` (it reads `data.js` beside it). It shows the top 5 to farm next, a sortable and filterable board (search, category, chain, pre-token / live-token tabs), a detail view for each protocol with the model's own inputs and its farm plan, and a model sandbox — move the base multiple, growth weight or maturity floor and the board re-ranks live with the same function `board.json` was built from.

## Layout

```
main.ts                  runner: snapshot in, board + dashboard + dossier out
lib/model.ts             radar-2 model: scoring, ranking, board, data script
lib/plan.ts              farm plans, derived from each protocol's record
vendor/makefun-board.ts  make.fun dossier library, copied byte-for-byte from the kit
dashboard/index.html     dashboard shell
dashboard/app.css        dark theme
dashboard/app.js         renders the board, filters, detail view, sandbox
screenshots/             three real renders of this dashboard (board, detail, filtered)
```

## Attribution

Snapshot: DefiLlama protocol index, fetched 2026-11-14. The `vendor/makefun-board.ts` library is the make.fun kit's own file, copied byte-for-byte; everything else in this repository was authored fresh for this entry. Implied value is this entry's own claim, never make.fun's. A protocol is called pre-token because its DefiLlama record carries no token — no market cap, no CoinGecko id, no symbol. That is the record, not proof: a protocol on this board may still have a token its record does not carry.

## License

MIT — see [LICENSE](LICENSE).
