#!/usr/bin/env python3
"""Compute the public portfolio summary (weights + % performance) from private quantities.

Inputs
  holdings.json   public company metadata + "display": {"show_values": bool}  (NO quantities)
  prices.json     latest quotes written by update_prices.py (includes ^GSPC for the S&P 500)
  private data    quantities (+ optional trade log), from, in order:
                    1. env HOLDINGS_PRIVATE        (JSON string; GitHub Actions secret)
                    2. env HOLDINGS_PRIVATE_FILE   (path to a JSON file)
                    3. ../portfolio-tracker-private/holdings.json (local box copy)
                  Accepted shapes: {"quantities": {"NU": 2600, ...}, "trades": [...]}
                  or a full holdings.json-style file whose holdings carry "quantity".

Outputs (public)
  portfolio.json    weights, day %, performance %, base-100 index series.
                    Dollar values / quantities are included ONLY when display.show_values is true.
  performance.json  daily records: date, index, S&P 500 close, price snapshot (public market data).
  history.csv       date, index, daily %, S&P 500 close, S&P 500 index (no dollar values).

Performance method: time-weighted, chain-linked. Each session's return is measured with the
holdings in effect for that session (quantities held at the prior close), so buys/sells never
look like gains or losses. Trades dated D only take effect after session D:
holdings_for(D) = current quantities - sum(qty_change of trades dated >= D).
Session date = UTC date of (now + 2h): one ASX session + the following US session share a date.
"""
from __future__ import annotations

import csv
import json
import os
import sys
from datetime import datetime, timezone, timedelta
from pathlib import Path

ROOT = Path(__file__).resolve().parent
HOLDINGS = ROOT / "holdings.json"
PRICES = ROOT / "prices.json"
OUT = ROOT / "portfolio.json"
PERF = ROOT / "performance.json"
HIST = ROOT / "history.csv"
PRIVATE_DEFAULT = ROOT.parent / "portfolio-tracker-private" / "holdings.json"
SPX = "^GSPC"
INCEPTION = "2026-10-10"


def load_private() -> dict:
    raw = os.environ.get("HOLDINGS_PRIVATE")
    if not raw:
        path = Path(os.environ.get("HOLDINGS_PRIVATE_FILE") or PRIVATE_DEFAULT)
        if not path.exists():
            raise SystemExit("No private quantities (HOLDINGS_PRIVATE / HOLDINGS_PRIVATE_FILE); leaving outputs unchanged.")
        raw = path.read_text()
    d = json.loads(raw)
    if "quantities" in d:
        qty = {k: float(v) for k, v in d["quantities"].items()}
    else:
        qty = {h["ticker"]: float(h["quantity"]) for h in d.get("holdings", []) if h.get("quantity") is not None}
    return {"quantities": qty, "trades": d.get("trades", []), "cash": d.get("cash", [])}


def session_date(now: datetime) -> str:
    return (now + timedelta(hours=2)).date().isoformat()


def holdings_for(date: str, priv: dict) -> dict:
    q = dict(priv["quantities"])
    for t in priv["trades"]:
        if str(t.get("date", "")) >= date:
            q[t["ticker"]] = q.get(t["ticker"], 0.0) - float(t.get("qty_change", 0))
    return {k: v for k, v in q.items() if abs(v) > 1e-9}


def usd_value(qty: dict, sym_of: dict, prices: dict, audusd: float, ccy_of: dict, fallback: dict | None = None) -> float:
    total = 0.0
    for tk, n in qty.items():
        sym = sym_of.get(tk)
        p = prices.get(sym)
        if p is None and fallback:
            p = fallback.get(sym)
        if p is None:
            continue
        total += n * p * (audusd if ccy_of.get(sym) == "AUD" else 1.0)
    return total


def main() -> int:
    cfg = json.loads(HOLDINGS.read_text())
    px = json.loads(PRICES.read_text())
    priv = load_private()
    show_values = bool(cfg.get("display", {}).get("show_values", False))
    quotes = px.get("quotes", {})
    fx = px.get("fx", {})
    audusd, usdsgd = fx.get("AUDUSD") or 0.66, fx.get("USDSGD")
    meta = {h["ticker"]: h for h in cfg.get("holdings", [])}
    sym_of = {tk: h["symbol"] for tk, h in meta.items()}
    ccy_of = {s: (q.get("currency") or ("AUD" if s.endswith(".AX") else "USD")) for s, q in quotes.items()}
    snap = {s: q["price"] for s, q in quotes.items() if q.get("price") is not None and s != SPX and not s.endswith("=X")}
    spx = (quotes.get(SPX) or {}).get("price")

    # ---- current weights / day change (current holdings) ----
    cur = {k: v for k, v in priv["quantities"].items() if abs(v) > 1e-9 and k in meta}
    rows, total, prev_total = {}, 0.0, 0.0
    for tk, n in cur.items():
        q = quotes.get(sym_of[tk]) or {}
        if q.get("price") is None:
            continue
        rate = audusd if ccy_of.get(sym_of[tk]) == "AUD" else 1.0
        v = n * q["price"] * rate
        pct = q.get("change_pct") or 0.0
        rows[tk] = {"usd": v, "pct": pct, "qty": n}
        total += v
        prev_total += v / (1 + pct / 100)
    day_pct = (total / prev_total - 1) * 100 if prev_total else 0.0

    # ---- chain-linked index ----
    now = datetime.now(timezone.utc)
    today = session_date(now)
    perf = json.loads(PERF.read_text()) if PERF.exists() else {"inception": INCEPTION, "currency": "USD", "records": []}
    recs = perf["records"]
    if not recs:
        recs.append({"date": INCEPTION, "index": 100.0, "spx": spx, "audusd": audusd, "usdsgd": usdsgd, "prices": snap, "base": True})
    elif today > recs[-1]["date"] or (recs[-1]["date"] == today and not recs[-1].get("base")):
        anchor = recs[-1] if recs[-1]["date"] < today else recs[-2]
        unchanged = all(abs(snap.get(s, 0) - anchor["prices"].get(s, 0)) < 1e-12 for s in set(snap) | set(anchor["prices"]))
        if not (unchanged and recs[-1]["date"] < today):  # nothing traded since last record => no new day
            h = holdings_for(today, priv)
            v0 = usd_value(h, sym_of, anchor["prices"], anchor["audusd"], ccy_of, fallback=snap)
            v1 = usd_value(h, sym_of, snap, audusd, ccy_of, fallback=anchor["prices"])
            r = (v1 / v0 - 1) if v0 else 0.0
            rec = {"date": today, "index": round(anchor["index"] * (1 + r), 6), "spx": spx, "audusd": audusd,
                   "usdsgd": usdsgd, "prices": snap}
            if recs[-1]["date"] == today:
                recs[-1] = rec
            else:
                recs.append(rec)
    perf["updated"] = now.replace(microsecond=0).isoformat()
    perf["method"] = "Time-weighted, chain-linked daily index (base 100 at inception close). USD, equities only."
    PERF.write_text(json.dumps(perf, indent=1) + "\n")

    base = recs[0]
    last = recs[-1]
    year = last["date"][:4]
    prior = [r for r in recs if r["date"] < f"{year}-01-01"]
    ytd_base = prior[-1] if prior else base
    pc = lambda a, b: round((a / b - 1) * 100, 4) if a and b else None  # noqa: E731
    series = [[r["date"], round(r["index"], 4), round(100 * r["spx"] / base["spx"], 4) if r.get("spx") and base.get("spx") else None] for r in recs]
    performance = {
        "inception_date": base["date"],
        "since_inception_pct": pc(last["index"], base["index"]),
        "ytd_year": int(year),
        "ytd_base_date": ytd_base["date"],
        "ytd_pct": pc(last["index"], ytd_base["index"]),
        "day_pct": round(day_pct, 4),
        "index": round(last["index"], 4),
        "as_of": last["date"],
        "spx_since_inception_pct": pc(spx, base.get("spx")),
        "spx_ytd_pct": pc(spx, ytd_base.get("spx")),
        "spx_day_pct": (quotes.get(SPX) or {}).get("change_pct"),
        "series": series,
    }

    out = {
        "updated": px.get("updated"),
        "show_values": show_values,
        "positions": len(rows),
        "weights": {tk: round(r["usd"] / total * 100, 4) for tk, r in rows.items()} if total else {},
        "performance": performance,
    }
    if show_values:
        out["values"] = {"total_usd": round(total, 2), "day_usd": round(total - prev_total, 2),
                         "quantities": {tk: r["qty"] for tk, r in rows.items()}}
    OUT.write_text(json.dumps(out, indent=2) + "\n")

    with HIST.open("w", newline="") as f:
        w = csv.writer(f)
        w.writerow(["date", "index", "daily_pct", "sp500_close", "sp500_index"])
        prev = None
        for r, s in zip(recs, series):
            w.writerow([r["date"], f"{r['index']:.4f}", "" if prev is None else f"{(r['index'] / prev - 1) * 100:.4f}",
                        r.get("spx") or "", "" if s[2] is None else f"{s[2]:.4f}"])
            prev = r["index"]

    # Local-only private record with dollar values (never written inside the repo).
    pdir = os.environ.get("PRIVATE_DIR")
    if pdir:
        ph = Path(pdir) / "value-history.csv"
        lines = ph.read_text().splitlines() if ph.exists() else ["date,total_usd,total_sgd,index"]
        lines = [ln for ln in lines if not ln.startswith(last["date"] + ",")]
        lines.append(f"{last['date']},{total:.2f},{total * (usdsgd or 0):.2f},{last['index']:.4f}")
        ph.write_text("\n".join(lines) + "\n")

    # Never print dollar values: Actions logs of a public repo are public.
    print(f"positions={len(rows)} day={day_pct:+.2f}% index={last['index']:.4f} "
          f"since={performance['since_inception_pct']}% ytd={performance['ytd_pct']}% spx={spx}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
