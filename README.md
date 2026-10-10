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

## Edit holdings
Edit `holdings.json`. Logos in `logos/`.

## Local preview
```bash
python3 -m http.server 8765
```

Loader: 0–100% on **portfolio.html only**. `?noloader=1` / `?loaderPreview=57` for QA.
