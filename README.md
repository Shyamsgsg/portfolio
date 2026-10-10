# Surabhi Industries — Portfolio site

Static site for **Surabhi Industries Pte Ltd** (GitHub Pages).

## Pages
- `index.html` — company home (Temasek-inspired full-bleed video hero, philosophy, focus, portfolio news)
- `portfolio.html` — holdings dashboard (Temasek-style tracker)
- `news.json` — auto-updated headlines (`update_news.py`, workflow every 3 hours)
- `prices.json` — auto-updated quotes (`update_prices.py`)

## Hero video (licence)
- **File:** `media/hero.mp4` + `media/hero.webm` (compressed), poster `media/hero-poster.jpg`
- **Source:** [Pexels — Aerial view of the city (Penang skyline)](https://www.pexels.com/video/aerial-view-of-the-city-19968469/)
- **Pexels ID:** 19968469 · Photographer/creator: **LayG Traveller**
- **Licence:** [Pexels Licence](https://www.pexels.com/license/) — free to use for commercial and non-commercial purposes; no attribution required (attribution appreciated). No paid licence.
- Compressed locally with ffmpeg (H.264 + VP9), muted, looped; each file under 8 MB.

## Edit holdings
Edit `holdings.json` (title, wordmark, positions, logos). Logos live in `logos/`.

## Local preview
```bash
python3 -m http.server 8765
# open http://127.0.0.1:8765/
```

Loader: ~2.5s count + 0.3s fade (≤3s total). `?noloader=1` skips; `?loaderPreview=57` freezes for screenshots. Loader timing is independent of hero video loading.
