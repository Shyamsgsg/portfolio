#!/usr/bin/env python3
"""Fetch free headline RSS for each holding and write news.json for the home page.

Sources (no API keys):
  - Yahoo Finance RSS: https://feeds.finance.yahoo.com/rss/2.0/headline?s=SYMBOL
  - Google News RSS search as fallback/supplement

Usage:  python3 update_news.py
Stdlib only.
"""
from __future__ import annotations

import hashlib
import json
import re
import time
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime
from html import unescape
from pathlib import Path

ROOT = Path(__file__).resolve().parent
HOLDINGS = ROOT / "holdings.json"
OUT = ROOT / "news.json"
PER_COMPANY = 4
MAX_TOTAL = 40
UA = "Mozilla/5.0 (compatible; surabhi-portfolio-news/1.0)"


def fetch(url: str, retries: int = 3) -> bytes | None:
    last = None
    for i in range(retries):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "application/rss+xml, application/xml, text/xml, */*"})
            with urllib.request.urlopen(req, timeout=25) as r:
                return r.read()
        except Exception as e:  # noqa: BLE001
            last = e
            time.sleep(0.6 * (i + 1))
    print(f"  warn: fetch failed {url}: {last}", flush=True)
    return None


def text(el) -> str:
    if el is None or el.text is None:
        return ""
    return unescape(re.sub(r"\s+", " ", el.text).strip())


def parse_rss(data: bytes) -> list[dict]:
    items = []
    try:
        root = ET.fromstring(data)
    except ET.ParseError:
        return items
    # RSS 2.0
    for item in root.findall(".//item"):
        title = text(item.find("title"))
        link = text(item.find("link"))
        if not title or not link:
            continue
        pub = text(item.find("pubDate"))
        source = ""
        src_el = item.find("source")
        if src_el is not None:
            source = text(src_el) or (src_el.get("url") or "")
        if not source:
            # Google News often puts source at end of title: "Headline - Source"
            if " - " in title:
                maybe_src = title.rsplit(" - ", 1)[-1].strip()
                if 1 < len(maybe_src) < 60 and not maybe_src.endswith("..."):
                    source = maybe_src
                    title = title.rsplit(" - ", 1)[0].strip()
        published = None
        if pub:
            try:
                published = parsedate_to_datetime(pub).astimezone(timezone.utc).isoformat()
            except Exception:  # noqa: BLE001
                published = None
        items.append({"title": title, "link": link, "source": source or "News", "published": published})
    return items


def yahoo_url(symbol: str) -> str:
    q = urllib.parse.urlencode({"s": symbol, "region": "US", "lang": "en-US"})
    return f"https://feeds.finance.yahoo.com/rss/2.0/headline?{q}"


def google_url(query: str) -> str:
    q = urllib.parse.urlencode({"q": query, "hl": "en-US", "gl": "US", "ceid": "US:en"})
    return f"https://news.google.com/rss/search?{q}"


def item_id(link: str, title: str) -> str:
    return hashlib.sha1(f"{link}|{title}".encode()).hexdigest()[:16]


def main() -> int:
    h = json.loads(HOLDINGS.read_text())
    holdings = [x for x in h.get("holdings", []) if not x.get("isCash")]
    collected: list[dict] = []
    seen_links: set[str] = set()

    for row in holdings:
        ticker = row.get("ticker") or row.get("symbol", "").split(".")[0]
        symbol = row.get("symbol") or ticker
        name = row.get("full_name") or row.get("name") or ticker
        logo = row.get("logo") or f"logos/{ticker}.svg"
        print(f"Fetching news for {ticker} ({symbol})...", flush=True)
        bucket: list[dict] = []

        for url, default_source in (
            (yahoo_url(symbol), "Yahoo Finance"),
            (google_url(f'"{name}" OR {ticker} stock'), "Google News"),
        ):
            raw = fetch(url)
            if not raw:
                continue
            for it in parse_rss(raw):
                link = it["link"]
                # normalize google news redirect-ish duplicates by title+ticker
                key = link.split("?")[0]
                title_key = re.sub(r"\W+", "", it["title"].lower())[:80]
                dedupe = key if "news.google" not in key else f"{ticker}:{title_key}"
                if dedupe in seen_links:
                    continue
                seen_links.add(dedupe)
                bucket.append(
                    {
                        "id": item_id(link, it["title"]),
                        "ticker": ticker,
                        "symbol": symbol,
                        "company": row.get("name") or ticker,
                        "title": it["title"],
                        "link": link,
                        "source": it["source"] or default_source,
                        "published": it["published"],
                        "logo": logo,
                    }
                )
            if len(bucket) >= PER_COMPANY:
                break
            time.sleep(0.35)

        # newest first; keep PER_COMPANY
        def sort_key(x):
            return x.get("published") or ""

        bucket.sort(key=sort_key, reverse=True)
        collected.extend(bucket[:PER_COMPANY])
        time.sleep(0.25)

    collected.sort(key=lambda x: x.get("published") or "", reverse=True)
    collected = collected[:MAX_TOTAL]
    out = {
        "updated": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "items": collected,
    }
    OUT.write_text(json.dumps(out, indent=2, ensure_ascii=False) + "\n")
    print(f"Wrote {len(collected)} headlines -> {OUT.name}", flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
