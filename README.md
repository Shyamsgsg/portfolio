# Boss's Portfolio — static tracker

Static HTML/CSS/JS (no build step). The page reads two files:

- `holdings.json` — **edit this** to change quantities, add/remove positions, or change the page title (`"title"`).
  `symbol` is the Yahoo Finance symbol (ASX tickers use `.AX`, e.g. `EML.AX`).
- `prices.json` — written by `update_prices.py` (Yahoo Finance chart API + AUDUSD and USDSGD FX). Don't edit by hand.

## Update prices
    python3 update_prices.py        # standard library only

## View locally
    python3 -m http.server 8000     # then open http://localhost:8000
(Opening index.html directly as a file won't work: browsers block fetch() of local JSON.)

## Share links
- `?ccy=SGD` or `?ccy=AUD` opens with that currency selected (headline always shows USD big + SGD under it), `?private=1` blurs dollar amounts (weights and % still show).

## Self-updating hosting (GitHub Pages + Actions, free)
1. Create a GitHub repo and push this folder (including `.github/workflows/update.yml`).
2. Repo Settings → Pages → Source: "Deploy from a branch" → `main` / root.
3. Repo Settings → Actions → General → Workflow permissions: "Read and write".
4. Actions tab → "Update prices" → Run workflow (first run). After that it runs every 30 min
   during US and ASX market hours and commits `prices.json`, and Pages republishes.
Note: a public Pages site is visible to anyone who has the URL (repo must be public on a free plan).
