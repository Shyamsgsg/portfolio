#!/usr/bin/env python3
"""Fetch latest quotes for every holding in holdings.json (plus AUDUSD/USDSGD FX and any cash-currency FX)
from Yahoo Finance's public chart API and write prices.json for the web page.

Usage:  python3 update_prices.py
No dependencies beyond the Python 3 standard library.
"""
import json
import sys
import time
import urllib.request
import urllib.parse
from datetime import datetime, timezone, timedelta
from pathlib import Path

ROOT = Path(__file__).resolve().parent
HOLDINGS = ROOT / "holdings.json"
OUT = ROOT / "prices.json"
FX_SYMBOLS = {"AUDUSD": "AUDUSD=X", "USDSGD": "SGD=X"}  # AUDUSD = USD per AUD; USDSGD = SGD per USD
STALE_DAYS = 4  # last trade older than this => flagged as halted/stale
# Yahoo rate-limits (429) many full browser/curl UAs; the bare "Mozilla/5.0" works reliably.
UAS = ["Mozilla/5.0", "Mozilla/5.0 (compatible; portfolio-tracker/1.0)"]


def fetch_chart(symbol, retries=4):
    hosts = ["query1.finance.yahoo.com", "query2.finance.yahoo.com"]
    last_err = None
    for attempt in range(retries):
        host = hosts[attempt % len(hosts)]
        url = f"https://{host}/v8/finance/chart/{urllib.parse.quote(symbol)}?range=5d&interval=1d"
        try:
            req = urllib.request.Request(url, headers={"User-Agent": UAS[(attempt // 2) % len(UAS)], "Accept": "application/json"})
            with urllib.request.urlopen(req, timeout=20) as r:
                data = json.load(r)
            res = data["chart"]["result"]
            if not res:
                raise ValueError(data["chart"].get("error") or "empty result")
            return res[0]
        except Exception as e:  # noqa: BLE001
            last_err = e
            time.sleep(1.5 * (attempt + 1))
    raise RuntimeError(f"{symbol}: {last_err}")


def parse_quote(result):
    meta = result["meta"]
    price = meta.get("regularMarketPrice")
    mkt_time = meta.get("regularMarketTime")
    offset = meta.get("gmtoffset") or 0
    ts = result.get("timestamp") or []
    closes = (result.get("indicators", {}).get("quote") or [{}])[0].get("close") or []

    # Previous close = last daily close dated strictly before the day of the latest trade.
    prev_close = None
    if mkt_time:
        trade_day = datetime.fromtimestamp(mkt_time + offset, timezone.utc).date()
        for t, c in zip(ts, closes):
            if c is None:
                continue
            if datetime.fromtimestamp(t + offset, timezone.utc).date() < trade_day:
                prev_close = c
    if prev_close is None:
        prev_close = meta.get("previousClose") or meta.get("chartPreviousClose")
    if price is None:  # fall back to last non-null close
        valid = [c for c in closes if c is not None]
        price = valid[-1] if valid else None

    stale = False
    if mkt_time:
        stale = (time.time() - mkt_time) > STALE_DAYS * 86400
    change_pct = None
    if price is not None and prev_close:
        change_pct = 0.0 if stale else (price / prev_close - 1) * 100

    return {
        "price": round(price, 6) if price is not None else None,
        "previous_close": round(prev_close, 6) if prev_close else None,
        "change_pct": round(change_pct, 4) if change_pct is not None else None,
        "currency": meta.get("currency"),
        "exchange": meta.get("fullExchangeName") or meta.get("exchangeName"),
        "long_name": meta.get("longName") or meta.get("shortName"),
        "market_time": datetime.fromtimestamp(mkt_time, timezone.utc).isoformat() if mkt_time else None,
        "stale": stale,
    }


def main():
    cfg = json.loads(HOLDINGS.read_text())
    old = {}
    if OUT.exists():
        try:
            old = json.loads(OUT.read_text()).get("quotes", {})
        except Exception:  # noqa: BLE001
            old = {}

    quotes, errors = {}, []
    # Cash in other currencies needs its own <CCY>USD rate (AUD/USD and USD/SGD are always fetched).
    for c in cfg.get("cash", []):
        ccy = str(c.get("currency", "")).upper()
        if ccy and ccy not in ("USD", "AUD", "SGD"):
            FX_SYMBOLS[f"{ccy}USD"] = f"{ccy}USD=X"
    symbols = [h["symbol"] for h in cfg.get("holdings", [])] + list(FX_SYMBOLS.values())
    for sym in symbols:
        try:
            quotes[sym] = parse_quote(fetch_chart(sym))
            q = quotes[sym]
            flag = "  (STALE/HALTED - using last price)" if q["stale"] else ""
            print(f"{sym:10s} {q['price']!s:>12} {q['currency']}  {q['change_pct'] if q['change_pct'] is not None else 'n/a':>8}%{flag}")
        except Exception as e:  # noqa: BLE001
            errors.append(str(e))
            if sym in old:  # keep the last good quote rather than dropping the position
                quotes[sym] = {**old[sym], "stale": True, "carried_over": True}
            print(f"{sym:10s} ERROR {e}", file=sys.stderr)

    fx = {}
    for name, sym in FX_SYMBOLS.items():
        if quotes.get(sym, {}).get("price"):
            fx[name] = quotes[sym]["price"]
            fx[name + "_change_pct"] = quotes[sym].get("change_pct")

    # If Yahoo returned nothing at all (e.g. rate-limited), keep the existing prices.json untouched.
    if not any(q.get("price") for q in quotes.values()):
        print("No quotes fetched; leaving existing prices.json unchanged.", file=sys.stderr)
        sys.exit(1)

    out = {
        "updated": datetime.now(timezone.utc).replace(microsecond=0).isoformat(),
        "source": "Yahoo Finance (query1.finance.yahoo.com/v8/finance/chart)",
        "fx": fx,
        "quotes": quotes,
        "errors": errors,
    }
    OUT.write_text(json.dumps(out, indent=2) + "\n")
    print(f"\nWrote {OUT.name}: {len(quotes)} quotes, AUDUSD={fx.get('AUDUSD')}, USDSGD={fx.get('USDSGD')}, errors={len(errors)}")


if __name__ == "__main__":
    main()
