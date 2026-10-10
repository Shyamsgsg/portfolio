# Surabhi Industries — Portfolio site

Static site for **Surabhi Industries Pte Ltd** (GitHub Pages).

## Pages
- `index.html` — company home (Temasek-inspired full-bleed video hero, philosophy, focus, portfolio news)
- `portfolio.html` — holdings dashboard with founder note and principles

## Hero videos (licence)
Randomly selected on each visit (avoids repeating the last via `localStorage`). Only the chosen video is loaded.

| ID | Files | Source | Creator |
|----|-------|--------|---------|
| marina | `media/hero-marina.*` | [Pexels #1824697](https://www.pexels.com/video/view-of-city-in-timelapse-mode-1824697/) — Singapore Marina Bay | Thet Tun Aung |
| hongkong | `media/hero-hongkong.*` | [Pexels #5538825](https://www.pexels.com/video/drone-footage-of-a-city-night-lights-5538825/) — Hong Kong night skyline | Henry |
| dubai | `media/hero-dubai.*` | [Pexels #10395146](https://www.pexels.com/video/time-lapse-of-night-traffic-in-dubai-10395146/) — Dubai Marina night | Spiffy |

- **Licence:** [Pexels Licence](https://www.pexels.com/license/) — free commercial/non-commercial; attribution optional.
- Each MP4/WebM under 8 MB; posters included. Overlay: subtle black gradient only (no purple tint).
- Portfolio top band photo: still from Marina Bay hero (`media/band-marina.jpg`).

## Brand
- Emblem: gold monogram `S` (`media/emblem-s.svg`)
- Purple `#21004f` + soft gold `#C9A24B` (hover `#B08A3A`)

## Holdings, privacy and the values switch
- `holdings.json` is **public company metadata only** (no quantities). Logos in `logos/`.
- Exact quantities are private: GitHub Actions secret **`HOLDINGS_PRIVATE`** (JSON `{"quantities": {...}, "trades": [...]}`),
  mirrored on the box at `/workspace/portfolio-tracker-private/holdings.json` (outside the repo, never committed).
- The *Update prices* workflow runs `update_prices.py` (quotes + FX + S&P 500 `^GSPC`) then `compute_portfolio.py`, which publishes:
  - `portfolio.json`: weights (%), day %, performance % and the base-100 index series.
  - `performance.json`: one record per session (index, S&P 500 close, closing-price snapshot; deduped by date).
  - `history.csv`: date, index, daily %, S&P 500 close, S&P 500 index. **No dollar values are published.**
- **Values switch:** `holdings.json` → `"display": {"show_values": false}`. Set to `true` (push to main, which re-runs the
  workflow) to publish and show dollar values, quantities, the USD/SGD toggle and the private-view button again.
  Note: older git history (before 10 Oct 2026) still contains the quantities in `holdings.json`.

## Performance (from 10 Oct 2026, base 100)
- Base: close prices captured 10 Oct 2026 (US and ASX 9 Oct closes), equities only, in US dollars. Index = 100.
- Time-weighted and chain-linked: each session's return uses the holdings in effect for that session, so buys/sells
  (cash in/out) never count as gains or losses. Session date = UTC date of (now + 2h), so an ASX day and the
  following US day share one date.
- YTD: for 2026 it equals since-inception; from 1 Jan 2027 YTD is measured from the last 2026 record (31 Dec close).
- The thin line chart appears once there are two or more records. S&P 500 is shown for comparison (price index).

### Recording a trade
1. Edit `/workspace/portfolio-tracker-private/holdings.json`:
   - set the ticker's new `quantity` (0 for a full sale; add a full metadata entry for a new company), and
   - append to `"trades"`: `{"date": "YYYY-MM-DD", "ticker": "GOOG", "qty_change": 100, "price": 345.10}`
     (`qty_change` negative for a sell; `date` = the session date of the trade).
2. New company only: add its public metadata entry (no quantity) to `holdings.json` in the repo.
   Keep sold companies' metadata in `holdings.json`; positions with zero quantity are hidden automatically.
3. Update the secret from the private file:
   ```bash
   python3 -c "import json;d=json.load(open('/workspace/portfolio-tracker-private/holdings.json'));print(json.dumps({'quantities':{h['ticker']:h['quantity'] for h in d['holdings']},'trades':d['trades']}))" | gh secret set HOLDINGS_PRIVATE --repo Shyamsgsg/portfolio
   gh workflow run update.yml --repo Shyamsgsg/portfolio
   ```
   Trades dated D take effect after session D (holdings for D = current quantities minus trades dated ≥ D), so the
   trade day is measured on the pre-trade holdings and the new holdings apply from the next session.

## Local preview
```bash
python3 -m http.server 8765
```

Loader: 0–100% on **portfolio.html only**. `?noloader=1` / `?loaderPreview=57` for QA.
