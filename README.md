# Surabhi Industries — Portfolio site

Static site for **Surabhi Industries Pte Ltd** (GitHub Pages).

## Pages
- `index.html` — company home (Temasek-inspired full-bleed video hero, philosophy, focus, portfolio news)
- `portfolio.html` — holdings dashboard (Temasek-style tracker)
- `news.json` — auto-updated headlines (`update_news.py`, workflow every 3 hours)
- `prices.json` — auto-updated quotes (`update_prices.py`)

## Hero video (licence)
- **File:** `media/hero.mp4` + `media/hero.webm` (compressed), poster `media/hero-poster.jpg`
- **Source:** [Pexels — View of city in timelapse mode (Singapore Marina Bay)](https://www.pexels.com/video/view-of-city-in-timelapse-mode-1824697/)
- **Pexels ID:** 1824697 · Creator: **Thet Tun Aung**
- **Licence:** [Pexels Licence](https://www.pexels.com/license/) — free for commercial and non-commercial use; no attribution required (attribution appreciated).
- Compressed locally with ffmpeg (H.264 + VP9), muted, looped; each file under 8 MB.
- Overlay: subtle black gradient only (no purple/blue colour tint).

## Edit holdings
Edit `holdings.json` (title, wordmark, positions, logos). Logos live in `logos/`.

## Local preview
```bash
python3 -m http.server 8765
# open http://127.0.0.1:8765/
```

Loader: 0–100% (~2.5s + 0.3s fade) on **portfolio.html only** (not on the home page). `?noloader=1` / `?loaderPreview=57` for QA.
