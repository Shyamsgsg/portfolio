/* Surabhi Industries Portfolio: reads holdings.json (metadata) + prices.json + portfolio.json (weights/performance,
   computed by the workflow from private quantities) and renders the page.
   holdings.json display.show_values=false hides all dollar values / quantities / the currency toggle. */
(() => {
  const PALETTE = ["#d6006e", "#0069aa", "#5c2d6e", "#1bb2e6", "#cfc1d6", "#12a639", "#f39200", "#7a8b99", "#a3195b", "#00a19a", "#6d4c9f", "#9bbb59"];
  const ROWBG = { NYSE: "rgba(18,166,57,.1)", NASDAQ: "rgba(18,166,57,.1)", ASX: "rgba(214,0,110,.08)" };
  const REFRESH_MS = 5 * 60 * 1000;
  const CCYS = ["USD", "SGD"]; // only USD/SGD; anything else (e.g. ?ccy=aud) falls back to USD
  const qs = new URLSearchParams(location.search);
  const state = {
    ccy: (() => { const c = (qs.get("ccy") || localStorage.getItem("pt-ccy") || "USD").toUpperCase(); return CCYS.includes(c) ? c : "USD"; })(),
    priv: qs.has("private") ? qs.get("private") !== "0" : localStorage.getItem("pt-priv") === "1",
    group: "holding", sortK: "usd", sortDir: -1, open: new Set(), data: null,
  };
  const $ = (s) => document.querySelector(s);
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const SYM = { USD: "US$", SGD: "S$", AUD: "A$" };
  const fmt = (n, ccy, dp) => {
    if (n == null || isNaN(n)) return "—";
    const a = Math.abs(n), d = dp ?? (a >= 1000 ? 0 : a >= 1 ? 2 : a >= 0.1 ? 3 : 4);
    return (n < 0 ? "−" : "") + (SYM[ccy] ?? "") + a.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });
  };
  const fmtPct = (p, dp = 2) => (p == null || isNaN(p) ? "—" : (p > 0 ? "+" : p < 0 ? "−" : "") + Math.abs(p).toFixed(dp));
  const cls = (p) => (p == null || Math.abs(p) < 0.005 ? "flat" : p > 0 ? "up" : "down");
  const wtxt = (w) => (w > 0 && w < 0.1 ? "<0.1" : w.toFixed(1));

  async function load() {
    const bust = "?t=" + Date.now();
    const [h, p, pf] = await Promise.all(["holdings.json", "prices.json", "portfolio.json"].map((f) => fetch(f + bust).then((r) => r.json())));
    const showValues = !!(h.display?.show_values && pf.show_values && pf.values);
    // Optional pre-inception history (percent index only), shown only when holdings.json display.history_since_inception is true.
    pc.hist = null;
    if (h.display?.history_since_inception) {
      try {
        const txt = await fetch("history_monthly.csv" + bust).then((r) => (r.ok ? r.text() : ""));
        const rows = txt.trim().split(/\r?\n/).slice(1).map((l) => l.split(",")).filter((c) => /^\d{4}-\d\d-\d\d$/.test(c[0]) && +c[1] > 0);
        if (rows.length > 1) pc.hist = { since: h.display.history_label || rows[0][0], rows: rows.map((c) => [c[0], +c[1], c[2] ? +c[2] : null]) };
      } catch (e) { pc.hist = null; }
    }
    const qty = showValues ? pf.values.quantities || {} : {};
    const wts = pf.weights || {};
    const audusd = p.fx?.AUDUSD || 0.66, usdsgd = p.fx?.USDSGD || null;
    const toUSD = { USD: 1, AUD: audusd, ...(usdsgd ? { SGD: 1 / usdsgd } : {}) };
    const rows = h.holdings.filter((x) => wts[x.ticker] != null).map((x) => {
      x = { ...x, quantity: showValues ? qty[x.ticker] ?? null : null };
      const q = p.quotes?.[x.symbol] || {};
      const ccy = q.currency || (x.symbol.endsWith(".AX") ? "AUD" : "USD");
      const price = q.price ?? null, local = price != null && x.quantity != null ? price * x.quantity : null;
      const usd = local != null ? local * (toUSD[ccy] ?? 1) : null, pct = q.change_pct ?? null;
      const dayUSD = usd != null && pct != null ? usd - usd / (1 + pct / 100) : 0;
      return { ...x, ccy, price, local, usd, pct, dayUSD, stale: !!q.stale, missing: price == null };
    });
    [...rows].sort((a, b) => wts[b.ticker] - wts[a.ticker]).forEach((r, i) => (r.color = PALETTE[i % PALETTE.length]));
    // Cash balances (holdings.json "cash"): face value, converted at live FX; no price and no day change.
    (showValues ? h.cash || [] : []).forEach((c) => {
      const ccy = String(c.currency || "USD").toUpperCase(), amount = Number(c.amount) || 0;
      const rate = ccy === "USD" ? 1 : ccy === "AUD" ? audusd : ccy === "SGD" ? (usdsgd ? 1 / usdsgd : null) : p.fx?.[ccy + "USD"] ?? null;
      rows.push({
        ticker: "CASH-" + ccy, isCash: true, name: c.label || `Cash (${ccy})`, full_name: c.label || `Cash (${ccy})`,
        sector: "Cash", industry: "Cash & equivalents", hq: "Cash", exchange: "Cash", ccy, quantity: null, price: null,
        local: amount, usd: rate != null ? amount * rate : null, pct: null, dayUSD: 0, missing: rate == null,
        logo: c.logo || "logos/cash.svg", logo_scale: 0.85, color: c.color || "#15af9b", rate,
        description: c.description || `Cash held in ${ccy}, converted at the latest exchange rate.`,
      });
    });
    const total = rows.reduce((a, r) => a + (r.usd || 0), 0), dayUSD = rows.reduce((a, r) => a + r.dayUSD, 0);
    rows.forEach((r) => (r.weight = showValues ? (total ? ((r.usd || 0) / total) * 100 : 0) : wts[r.ticker] || 0));
    if (qs.has("details")) state.open = new Set(rows.map((r) => r.ticker));
    if (!showValues && state.sortK === "usd") state.sortK = "weight";
    state.data = { h, p, pf, showValues, rows, total, dayUSD, dayPct: total ? (dayUSD / (total - dayUSD)) * 100 : 0, audusd, usdsgd };
    render();
  }

  const effCcy = () => (state.ccy === "SGD" && !state.data.usdsgd ? "USD" : state.ccy);
  const conv = (usd, c = effCcy()) => (usd == null ? null : usd * (c === "SGD" ? state.data.usdsgd : 1));

  function render() {
    const { h, p, pf, showValues, rows, total, dayUSD, dayPct, audusd, usdsgd } = state.data;
    document.body.classList.toggle("no-values", !showValues);
    if (!showValues) state.priv = false;
    const C = effCcy(), other = C === "USD" ? "SGD" : "USD";
    const title = h.title || "Portfolio";
    document.title = "Surabhi Industries | " + title; $("#title").textContent = title; $("#crumbTitle").textContent = title;
    if (h.wordmark) {
      const setWm = (el) => {
        if (!el) return;
        const span = el.querySelector("span");
        if (span) span.textContent = h.wordmark;
        else el.textContent = h.wordmark;
      };
      setWm($("#wordmark")); setWm($("#wordmark2"));
      { const c = $("#copy"); if (c) c.textContent = "© 2026 " + (h.owner || h.wordmark); }
    }
    document.body.classList.toggle("private", state.priv);
    $("#privacy").classList.toggle("on", state.priv);
    document.querySelectorAll(".ccy-switch [data-ccy]").forEach((b) => b.classList.toggle("on", b.dataset.ccy === C));
    $("#ccyKnob").classList.toggle("sgd", C === "SGD");
    $("#noteCcy").textContent = C === "SGD" ? "Singapore dollars" : "US dollars";
    $("#noteOther").textContent = C === "SGD" ? "US dollars" : "Singapore dollars";

    const d = new Date(p.updated);
    const o = { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" };
    const pt = d.toLocaleString("en-US", { ...o, timeZone: "America/Vancouver" }) + " PT";
    const pom = d.toLocaleString("en-US", { ...o, timeZone: "Pacific/Port_Moresby" }) + " (Port Moresby)";
    $("#noteUpdated").textContent = $("#noteUpdated2").textContent = `${pt} / ${pom}`;
    $("#asAt").textContent = $("#asAt2").textContent = pt;
    $("#chartAsAt").textContent = `(as at ${d.toLocaleString("en-US", { day: "numeric", month: "short", year: "numeric", timeZone: "America/Vancouver" })})`;
    $("#tPT").textContent = d.toLocaleString("en-US", { ...o, timeZone: "America/Vancouver" }) + " PT";
    $("#tPOM").textContent = d.toLocaleString("en-US", { ...o, timeZone: "Pacific/Port_Moresby" }) + " PGT";

    $("#totalLink").textContent = fmt(conv(total, C), C, 0);
    $("#totalOther").textContent = usdsgd ? ` (${fmt(conv(total, other), other, 0)})` : "";
    $("#totUSD").textContent = fmt(total, "USD", 0);
    $("#totSGD").textContent = usdsgd ? fmt(conv(total, "SGD"), "SGD", 0) : "—";
    $("#dayChg").innerHTML = `<span class="${cls(dayPct)}">${fmtPct(dayPct)}%</span> <small class="money ${cls(dayPct)}">${dayUSD >= 0 ? "+" : ""}${esc(fmt(conv(dayUSD), C, 0))}</small>`;
    const nStocks = rows.filter((r) => !r.isCash).length, hasCash = rows.some((r) => r.isCash);
    $("#nPos").innerHTML = $("#nPos2").innerHTML = nStocks + (hasCash ? ` <small>+ cash</small>` : "");
    $("#nHeld").textContent = `${nStocks} listed companies`;
    renderPerf(pf.performance, showValues);
    $("#fxLine").textContent = `USD/SGD ${usdsgd ? usdsgd.toFixed(4) : "—"} · AUD/USD ${audusd.toFixed(4)}`;
    $("#thValue").innerHTML = `Value<br><span class="th-sub">(${C === "SGD" ? "S$" : "US$"})</span>`;

    renderChart();
    renderTable();

    const notes = [];
    rows.filter((r) => r.isCash && r.usd != null).forEach((r) => notes.push(`${r.name}: ${fmt(r.local, r.ccy, 0)} at ${r.ccy}/USD ${r.rate.toFixed(4)} = ${fmt(r.usd, "USD", 0)}${usdsgd ? ` / ${fmt(r.usd * usdsgd, "SGD", 0)}` : ""}. Cash is included in the total and weights and counts as 0% in the day change.`));
    const halted = rows.filter((r) => r.stale && !r.missing).map((r) => r.ticker);
    if (halted.length) notes.push(`${halted.join(", ")}: no recent trades (suspended/halted); valued at the last traded price.`);
    const missing = rows.filter((r) => r.missing).map((r) => (r.isCash ? r.name + " (FX rate)" : r.ticker));
    if (missing.length) notes.push(`${missing.join(", ")}: price currently unavailable.`);
    notes.push("Weights are based on market value in US dollars. Percentages are rounded to one decimal place and may not add up to 100.");
    $("#footnote").innerHTML = notes.map((n, i) => `<p><sup>${i + 1}</sup> ${esc(n)}</p>`).join("");
  }

  const fmtD = (iso, y = true) => new Date(iso + "T00:00:00Z").toLocaleDateString("en-GB", { day: "numeric", month: "short", ...(y ? { year: "numeric" } : {}), timeZone: "UTC" });
  function renderPerf(pp, showValues) {
    if (!pp) { $("#perf").hidden = true; return; }
    $("#perf").hidden = false;
    $("#perfFigs").classList.toggle("n3", showValues);
    const pv = (el, v) => ($(el).innerHTML = `<span class="${cls(v)}">${fmtPct(v)}%</span>`);
    const bm = (el, v) => ($(el).innerHTML = v == null ? "" : `S&amp;P 500 <b class="${cls(v)}">${fmtPct(v)}%</b>`);
    const { s: cs, H0 } = combinedSeries(pp);
    if (H0 && cs.length >= 2) {
      // history_since_inception: tiles use the same chain-linked series (and range anchors) as the chart's All and YTD
      const endOf = (pts) => pts[pts.length - 1] || { p: null, s: null };
      const all = endOf(rangePts(cs, "ALL")), ytd = endOf(rangePts(cs, "YTD"));
      const mY = new Date(H0[0][0] + "T00:00:00Z").toLocaleDateString("en-GB", { month: "short", year: "numeric", timeZone: "UTC" });
      $("#pfSinceL").textContent = "Since inception (" + mY + ")";
      $("#pfYtdL").textContent = "YTD " + cs[cs.length - 1][0].slice(0, 4);
      pv("#pfSince", all.p); bm("#pfSinceB", all.s);
      pv("#pfYtd", ytd.p); bm("#pfYtdB", ytd.s);
      const mL = new Date(H0[0][0] + "T00:00:00Z").toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" });
      $("#perfHeadSub").textContent = "since " + mL + " (time-weighted)";
      $("#noteMeasured").textContent = "performance is measured since " + mL + " (time-weighted)";
    } else {
      $("#pfSinceL").textContent = "Since " + fmtD(pp.inception_date);
      $("#pfYtdL").textContent = "YTD " + pp.ytd_year;
      pv("#pfSince", pp.since_inception_pct); bm("#pfSinceB", pp.spx_since_inception_pct);
      pv("#pfYtd", pp.ytd_pct); bm("#pfYtdB", pp.spx_ytd_pct);
    }
    pv("#pfDay", pp.day_pct); bm("#pfDayB", pp.spx_day_pct);
    pc.pp = pp;
    renderPC();
  }

  /* ---- Portfolio performance chart (inline SVG, no library) ----
     series rows: [date, portfolio index (base 100), S&P 500 index (base 100)]; rebased to 0% at the range start. */
  const pc = { hist: null, pp: null, range: "ALL", spx: localStorage.getItem("pt-spx") !== "0", pts: [], geo: null };
  const PC = { gold: "#B08A3A", rose: "#9C6B62", grey: "#A3A8AA", grid: "#ECE7DC", zero: "#C9BFA8", ink: "#5d6669" };
  const isoAdd = (iso, d = 0, m = 0, y = 0) => { const t = new Date(iso + "T00:00:00Z"); t.setUTCFullYear(t.getUTCFullYear() + y, t.getUTCMonth() + m, t.getUTCDate() + d); return t.toISOString().slice(0, 10); };
  function rangeStart(r, last) {
    return { "1W": isoAdd(last, -7), MTD: last.slice(0, 8) + "01", "1M": isoAdd(last, 0, -1), "3M": isoAdd(last, 0, -3), YTD: last.slice(0, 5) + "01-01", "1Y": isoAdd(last, 0, 0, -1), ALL: "0000-01-01" }[r];
  }
  // Points for a range: the last record on/before the start date is the 0% anchor (MTD/YTD anchor on the prior close).
  function rangePts(s, r) {
    if (!s.length) return [];
    const st = rangeStart(r, s[s.length - 1][0]);
    let i0 = 0;
    for (let i = 0; i < s.length; i++) if (s[i][0] < st || (s[i][0] === st && !["MTD", "YTD"].includes(r))) i0 = i;
    if (["MTD", "YTD"].includes(r) && s[0][0] >= st) i0 = 0;
    const w = s.slice(i0), b = w[0];
    return w.map((x) => ({ d: x[0], p: (x[1] / b[1] - 1) * 100, s: x[2] != null && b[2] != null ? (x[2] / b[2] - 1) * 100 : null }));
  }
  function niceStep(span) { const raw = span / 4, m = Math.pow(10, Math.floor(Math.log10(raw))); return [1, 2, 2.5, 5, 10].map((k) => k * m).find((k) => k >= raw) || 10 * m; }
  const pctTxt = (v, dp = 2) => (Math.abs(v) < 0.005 ? "0.00" : (v > 0 ? "+" : "−") + Math.abs(v).toFixed(dp)) + "%";
  // Series used by both the chart and the Performance tiles: daily series, chain-linked onto the monthly history when enabled.
  function combinedSeries(pp) {
    let s = (pp.series || []).filter((r) => r[1] != null);
    const H0 = pc.hist && s.length ? pc.hist.rows : null;
    if (H0) {
      // chain-link: daily index (base 100 at inception) continues from the last pre-inception monthly level
      const lastH = H0[H0.length - 1], kp = lastH[1] / s[0][1], ks = lastH[2] != null && s[0][2] != null ? lastH[2] / s[0][2] : null;
      const cut = isoAdd(s[0][0], -4);
      s = H0.filter((r) => r[0] < cut).concat(s.map((r) => [r[0], r[1] * kp, ks != null && r[2] != null ? r[2] * ks : null]));
    }
    return { s, H0 };
  }
  function renderPC() {
    const pp = pc.pp; if (!pp) return;
    const { s, H0 } = combinedSeries(pp);
    // pills: enabled only when the range has at least two points (otherwise there is no data yet)
    const avail = {};
    $("#pcPills").querySelectorAll("button").forEach((b) => {
      const r = b.dataset.r, ok = r === "ALL" || rangePts(s, r).length >= 2;
      avail[r] = ok; b.disabled = !ok; b.title = ok ? "" : "Not enough history yet";
    });
    if (!avail[pc.range]) pc.range = "ALL";
    $("#pcPills").querySelectorAll("button").forEach((b) => { const on = b.dataset.r === pc.range; b.classList.toggle("on", on); b.setAttribute("aria-pressed", on); });
    $("#pcSpx").setAttribute("aria-pressed", pc.spx);
    const pts = (pc.pts = rangePts(s, pc.range));
    const sparse = pts.length < 2;
    $("#pcNote").hidden = !sparse;
    const last = pts[pts.length - 1] || { d: pp.inception_date, p: 0, s: 0 };
    $("#pcLabel").textContent = pc.range === "ALL" ? (H0 ? `Total return since inception (${new Date(H0[0][0] + "T00:00:00Z").toLocaleDateString("en-GB", { month: "short", year: "numeric", timeZone: "UTC" })})` : `Total return since ${fmtD(pp.inception_date)}`) : `Return since ${fmtD(pts[0].d)} · ${pc.range === "ALL" ? "All" : pc.range}`;
    $("#pcBig").textContent = pctTxt(last.p);
    $("#pcBig").className = "pc-big " + (last.p < -0.005 ? "neg" : "pos");
    $("#pcBench").innerHTML = last.s == null ? "" : `S&amp;P 500 <b>${pctTxt(last.s)}</b> &nbsp;·&nbsp; as at ${esc(fmtD(last.d))}`;
    $("#pcCap").textContent = H0
      ? "Time-weighted. Monthly points before 10 Oct 2026 (S&P 500 total return in Singapore dollars), daily points from 10 Oct 2026 (US dollars, S&P 500 price index), chain-linked and rebased to 0% at the start of the selected range. Past performance is not a guide to the future."
      : "Time-weighted, in US dollars, rebased to 0% at the 10 Oct 2026 close. S&P 500 price index for comparison. Past performance is not a guide to the future.";
    drawPC();
  }
  function drawPC() {
    const pts = pc.pts, svg = $("#pcSvg"), box = $("#pcPlot");
    const W = Math.max(280, Math.round(box.clientWidth || 800)), H = W < 600 ? 190 : 240;
    const padL = 6, padR = W < 600 ? 50 : 58, padT = 10, padB = 26, iw = W - padL - padR, ih = H - padT - padB;
    svg.setAttribute("viewBox", `0 0 ${W} ${H}`); svg.setAttribute("width", W); svg.setAttribute("height", H);
    const sparse = pts.length < 2;
    const vals = [0].concat(pts.map((x) => x.p), pc.spx ? pts.map((x) => x.s).filter((v) => v != null) : []);
    let lo = Math.min(...vals), hi = Math.max(...vals);
    if (hi - lo < 1) { const c = (hi + lo) / 2; lo = c - 1; hi = c + 1; }
    const st = niceStep(hi - lo); lo = Math.floor(lo / st) * st; hi = Math.ceil(hi / st) * st;
    if (lo === hi) { lo -= st; hi += st; }
    const n = Math.max(pts.length - 1, 1);
    const X = (i) => padL + (sparse ? 0 : (i / n) * iw), Y = (v) => padT + (1 - (v - lo) / (hi - lo)) * ih;
    const dpA = st < 0.5 ? 2 : st < 1 ? 1 : 0;
    let g = "";
    for (let v = lo; v <= hi + st / 2; v += st) {
      const y = Y(v).toFixed(1), z = Math.abs(v) < st / 1e3;
      g += z ? `<line x1="${padL}" x2="${padL + iw}" y1="${y}" y2="${y}" stroke="${PC.zero}" stroke-width="1" stroke-dasharray="3 4"/>`
             : `<line x1="${padL}" x2="${padL + iw}" y1="${y}" y2="${y}" stroke="${PC.grid}" stroke-width="1"/>`;
      g += `<text x="${padL + iw + 10}" y="${(+y + 4).toFixed(1)}" class="pc-ax">${z ? "0%" : (v > 0 ? "+" : "−") + Math.abs(v).toFixed(dpA) + "%"}</text>`;
    }
    // x labels: first / middle / last date
    const xl = sparse ? [0] : [...new Set([0, Math.round(n / 2), n])].filter((i) => pts.length > 2 || i !== Math.round(n / 2));
    xl.forEach((i, k) => {
      const anchor = sparse || k === 0 ? "start" : i === n ? "end" : "middle";
      g += `<text x="${X(i).toFixed(1)}" y="${H - 6}" text-anchor="${anchor}" class="pc-ax">${esc(fmtD(pts[i]?.d || pc.pp.inception_date, W >= 600 || i === 0))}</text>`;
    });
    const y0 = Y(0);
    let body = "";
    if (sparse) {
      // tidy placeholder: a quiet 0% line with the starting point marked
      body += `<line x1="${padL}" x2="${padL + iw}" y1="${y0.toFixed(1)}" y2="${y0.toFixed(1)}" stroke="${PC.gold}" stroke-opacity=".35" stroke-width="1.5"/>`;
      body += `<circle cx="${padL + 1.5}" cy="${y0.toFixed(1)}" r="3.5" fill="#fff" stroke="${PC.gold}" stroke-width="1.5"/>`;
      body += `<text x="${padL + 12}" y="${(y0 - 9).toFixed(1)}" class="pc-ax pc-start">Start · ${esc(fmtD(pts[0]?.d || pc.pp.inception_date))}</text>`;
    } else {
      const path = (k) => pts.map((x, i) => (x[k] == null ? null : `${X(i).toFixed(1)},${Y(x[k]).toFixed(1)}`)).filter(Boolean);
      const pp = path("p");
      // split colour at 0%: deeper gold above, muted rose-brown below (hard stop in user space)
      const f = Math.min(1, Math.max(0, (y0 - padT) / ih));
      body += `<defs><linearGradient id="pcSplit" gradientUnits="userSpaceOnUse" x1="0" y1="${padT}" x2="0" y2="${padT + ih}">
        <stop offset="${f}" stop-color="${PC.gold}"/><stop offset="${f}" stop-color="${PC.rose}"/></linearGradient></defs>`;
      body += `<path d="M${pp[0].split(",")[0]},${y0.toFixed(1)} L${pp.join(" L")} L${pp[pp.length - 1].split(",")[0]},${y0.toFixed(1)} Z" fill="url(#pcSplit)" fill-opacity=".06"/>`;
      if (pc.spx) { const sp = path("s"); if (sp.length > 1) body += `<polyline points="${sp.join(" ")}" fill="none" stroke="${PC.grey}" stroke-width="1.25" stroke-linejoin="round" stroke-linecap="round"/>`; }
      body += `<polyline points="${pp.join(" ")}" fill="none" stroke="url(#pcSplit)" stroke-width="1.75" stroke-linejoin="round" stroke-linecap="round"/>`;
      const L = pts[pts.length - 1];
      body += `<circle cx="${X(n).toFixed(1)}" cy="${Y(L.p).toFixed(1)}" r="2.75" fill="${L.p < 0 ? PC.rose : PC.gold}"/>`;
    }
    body += `<g id="pcHover" visibility="hidden"><line id="pcHl" y1="${padT}" y2="${padT + ih}" stroke="${PC.zero}" stroke-width="1"/>
      <circle id="pcHs" r="3" fill="#fff" stroke="${PC.grey}" stroke-width="1.25"/><circle id="pcHp" r="3.5" fill="#fff" stroke="${PC.gold}" stroke-width="1.5"/></g>
      <rect id="pcHit" x="${padL}" y="0" width="${iw}" height="${H}" fill="transparent"/>`;
    svg.innerHTML = g + body;
    pc.geo = { X, Y, n, sparse, padL, iw, W };
  }
  function pcHover(ev) {
    const pts = pc.pts, geo = pc.geo; if (!geo || !pts.length) return;
    const r = $("#pcSvg").getBoundingClientRect(), sx = geo.W / r.width;
    const x = (ev.clientX - r.left) * sx;
    const i = geo.sparse ? 0 : Math.max(0, Math.min(geo.n, Math.round(((x - geo.padL) / geo.iw) * geo.n)));
    const pt = pts[i], cx = geo.X(i);
    const hv = $("#pcHover"); hv.setAttribute("visibility", "visible");
    $("#pcHl").setAttribute("x1", cx); $("#pcHl").setAttribute("x2", cx);
    $("#pcHp").setAttribute("cx", cx); $("#pcHp").setAttribute("cy", geo.Y(pt.p)); $("#pcHp").setAttribute("stroke", pt.p < 0 ? PC.rose : PC.gold);
    const showS = pc.spx && pt.s != null;
    $("#pcHs").setAttribute("visibility", showS ? "visible" : "hidden");
    if (showS) { $("#pcHs").setAttribute("cx", cx); $("#pcHs").setAttribute("cy", geo.Y(pt.s)); }
    const tip = $("#pcTip");
    tip.innerHTML = `<b>${esc(fmtD(pt.d))}</b><span><i class="sw sw-p"></i>Surabhi <em>${pctTxt(pt.p)}</em></span>${showS ? `<span><i class="sw sw-s"></i>S&amp;P 500 <em>${pctTxt(pt.s)}</em></span>` : ""}`;
    tip.hidden = false;
    const px = cx / sx, tw = tip.offsetWidth, bw = r.width;
    tip.style.left = Math.max(0, Math.min(bw - tw, px - tw / 2)) + "px";
  }
  function pcLeave() { const hv = $("#pcHover"); hv && hv.setAttribute("visibility", "hidden"); $("#pcTip").hidden = true; }
  $("#pcPlot").addEventListener("pointermove", pcHover);
  $("#pcPlot").addEventListener("pointerdown", pcHover);
  $("#pcPlot").addEventListener("pointerleave", (e) => { if (e.pointerType === "mouse") pcLeave(); });
  document.addEventListener("pointerdown", (e) => { if (!e.target.closest("#pcPlot")) pcLeave(); });
  $("#pcPills").addEventListener("click", (e) => { const b = e.target.closest("button"); if (!b || b.disabled) return; pc.range = b.dataset.r; pcLeave(); renderPC(); });
  $("#pcSpx").addEventListener("click", () => { pc.spx = !pc.spx; localStorage.setItem("pt-spx", pc.spx ? "1" : "0"); pcLeave(); renderPC(); });
  let pcRz; window.addEventListener("resize", () => { clearTimeout(pcRz); pcRz = setTimeout(() => pc.pp && drawPC(), 120); });

  function groups() {
    const { rows } = state.data, g = state.group;
    if (g === "holding") return [...rows].sort((a, b) => b.weight - a.weight).map((r) => ({ key: r.ticker, label: `${r.full_name || r.name}`, usd: r.usd || 0, weight: r.weight, color: r.color }));
    const keyOf = { sector: (r) => r.sector || "Other", hq: (r) => r.hq || "Other", exchange: (r) => r.exchange, currency: (r) => r.ccy }[g];
    const m = new Map();
    rows.forEach((r) => { const k = keyOf(r); const e = m.get(k) || { key: k, label: k, usd: 0, weight: 0 }; e.usd += r.usd || 0; e.weight += r.weight; m.set(k, e); });
    let i = 0;
    return [...m.values()].sort((a, b) => b.weight - a.weight).map((e) => ({ ...e, color: e.key === "Cash" ? "#15af9b" : PALETTE[i++ % PALETTE.length] }));
  }

  function arc(cx, cy, r, a0, a1) {
    const pt = (a) => [cx + r * Math.cos(a), cy + r * Math.sin(a)];
    const [x0, y0] = pt(a0), [x1, y1] = pt(a1);
    return `M${x0.toFixed(2)} ${y0.toFixed(2)} A${r} ${r} 0 ${a1 - a0 > Math.PI ? 1 : 0} 1 ${x1.toFixed(2)} ${y1.toFixed(2)}`;
  }

  function renderChart() {
    const C = effCcy(), gs = groups();
    const labels = { holding: "Holding", sector: "Sector", hq: "Headquarters", exchange: "Exchange", currency: "Currency" };
    $("#dcLabel").textContent = labels[state.group];
    document.querySelectorAll("#tabs button").forEach((b) => b.classList.toggle("selected", b.dataset.g === state.group));
    const R = 105, W = 26, gap = 0.012;
    let a = -Math.PI / 2, svg = `<circle cx="120" cy="120" r="${R - W / 2 - 6}" fill="none" stroke="#cfcfcf" stroke-width="3" stroke-dasharray="1.5 2.5"/>`;
    gs.filter((g) => g.weight > 0).forEach((g) => {
      const sw = (g.weight / 100) * Math.PI * 2, gg = sw > gap * 3 ? gap : 0;
      svg += `<path d="${arc(120, 120, R, a + gg / 2, a + sw - gg / 2)}" stroke="${g.color}" stroke-width="${W}" fill="none" data-k="${esc(g.key)}"><title>${esc(g.label)}: ${wtxt(g.weight)}%</title></path>`;
      a += sw;
    });
    $("#donut").innerHTML = svg;
    $("#legend").innerHTML = gs.map((g) => `<tr data-k="${esc(g.key)}"><td><span class="dot" style="background:${g.color}"></span>${esc(g.label)}</td><td class="num v money vals-only">${esc(fmt(conv(g.usd), C, 0))}</td><td class="num hl">${wtxt(g.weight)}</td></tr>`).join("");
    const hl = (k) => {
      $("#donut").classList.toggle("hovering", !!k);
      document.querySelectorAll("#donut path").forEach((p) => p.classList.toggle("hl", p.dataset.k === k));
    };
    document.querySelectorAll("#donut path, #legend tr").forEach((el) => {
      el.addEventListener("mouseenter", () => hl(el.dataset.k));
      el.addEventListener("mouseleave", () => hl(null));
    });
  }

  function logoHTML(r) {
    const mono = `<span class="mono" style="color:${r.color}">${esc(r.ticker)}</span>`;
    if (!r.logo) return mono;
    return `<img src="${esc(r.logo)}" alt="${esc(r.full_name || r.name)}" loading="lazy" style="max-height:${Math.round(32 * Math.min(1, r.logo_scale ?? 1))}px" onerror="this.outerHTML=this.dataset.mono" data-mono="${esc(mono)}">`;
  }

  function renderTable() {
    const C = effCcy(), { rows } = state.data, k = state.sortK, dir = state.sortDir;
    const val = (r) => (k === "name" ? (r.full_name || r.name).toLowerCase() : r[k] ?? -Infinity);
    const sorted = [...rows].sort((a, b) => (val(a) > val(b) ? 1 : val(a) < val(b) ? -1 : 0) * dir);
    document.querySelectorAll("#htable th.sort").forEach((th) => { th.classList.toggle("asc", th.dataset.k === k && dir > 0); th.classList.toggle("desc", th.dataset.k === k && dir < 0); });
    $("#rows").innerHTML = sorted.map((r) => {
      const open = state.open.has(r.ticker), bg = r.isCash ? "rgba(0,105,170,.08)" : ROWBG[r.exchange] || "rgba(0,105,170,.08)";
      const badge = r.missing ? `<span class="tag">NO PRICE</span>` : r.stale ? `<span class="tag">HALTED</span>` : "";
      const where = r.isCash ? "" : [r.hq_city, r.hq].filter(Boolean).join(", ");
      return `<tr class="r${open ? " open" : ""}" data-t="${esc(r.ticker)}" style="--rowbg:${bg}" tabindex="0" aria-expanded="${open}">
        <td class="c-logo sticky"><div class="logo">${logoHTML(r)}</div></td>
        <td class="c-name sticky2"><div class="nm">${esc(r.full_name || r.name)}&nbsp;<span class="caret">▼</span></div><div class="tk">${r.isCash ? esc(r.ccy) + " balance" : esc(r.ticker)} ${badge}</div></td>
        <td class="num vals-only">${r.isCash || r.quantity == null ? "—" : r.quantity.toLocaleString("en-US")}</td>
        <td class="num">${r.isCash ? "—" : `${esc(fmt(r.price, r.ccy))}<span class="sub">${r.ccy}</span>`}</td>
        <td class="num mval vals-only">${esc(fmt(conv(r.usd), C))}${r.ccy !== C ? `<span class="sub">${esc(fmt(r.local, r.ccy))}</span>` : ""}</td>
        <td class="num ${r.isCash ? "flat" : cls(r.pct)}">${r.isCash ? "—" : fmtPct(r.pct)}</td>
        <td class="num">${wtxt(r.weight)}</td>
        <td>${esc(r.sector || "")}</td>
        <td>${r.isCash ? "—" : esc(r.exchange)}</td>
      </tr>
      <tr class="d" style="--rowbg:${bg}" ${open ? "" : "hidden"}><td colspan="${state.data.showValues ? 9 : 7}"><div class="din">
        <p class="desc">${esc(r.description || "")}</p>
        <dl>${r.industry ? `<dt>Industry</dt><dd>${esc(r.industry)}</dd>` : ""}${where ? `<dt>HQ</dt><dd>${esc(where)}</dd>` : ""}${r.isCash ? `<dt>Balance</dt><dd class="money">${esc(fmt(r.local, r.ccy, 0))} ${esc(r.ccy)}</dd>${r.rate ? `<dt>FX rate</dt><dd>${esc(r.ccy)}/USD ${r.rate.toFixed(4)}</dd>` : ""}` : `<dt>Listing</dt><dd>${esc(r.exchange)}: ${esc(r.ticker)}</dd>`}${r.website ? `<dt>Website</dt><dd><a href="${esc(r.website)}" target="_blank" rel="noopener">${esc(r.website.replace(/^https?:\/\/(www\.)?/, ""))}</a></dd>` : ""}</dl>
      </div></td></tr>`;
    }).join("");
    document.querySelectorAll("#rows tr.r").forEach((tr) => {
      const t = () => { const k2 = tr.dataset.t; state.open.has(k2) ? state.open.delete(k2) : state.open.add(k2); renderTable(); };
      tr.addEventListener("click", t);
      tr.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); t(); } });
    });
  }

  document.querySelectorAll("#htable th.sort").forEach((th) => th.addEventListener("click", () => {
    const k = th.dataset.k;
    state.sortDir = state.sortK === k ? -state.sortDir : (k === "name" || k === "sector" || k === "exchange" ? 1 : -1);
    state.sortK = k; renderTable();
  }));
  document.querySelectorAll("#tabs button").forEach((b) => b.addEventListener("click", () => { state.group = b.dataset.g; renderChart(); }));
  const setCcy = (c) => { state.ccy = c; localStorage.setItem("pt-ccy", c); state.data && render(); };
  document.querySelectorAll(".ccy-switch [data-ccy]").forEach((b) => b.addEventListener("click", () => setCcy(b.dataset.ccy)));
  $("#ccyKnob").addEventListener("click", () => setCcy(state.ccy === "USD" ? "SGD" : "USD"));
  $("#privacy").addEventListener("click", () => { state.priv = !state.priv; localStorage.setItem("pt-priv", state.priv ? "1" : "0"); state.data && render(); });
  $("#share").addEventListener("click", async () => {
    const url = location.href.split("#")[0];
    try { if (navigator.share) await navigator.share({ title: document.title, url }); else { await navigator.clipboard.writeText(url); $("#share").title = "Link copied"; } } catch (_) {}
  });

  load().catch((e) => { console.error(e); $("#footnote").textContent = "Couldn't load holdings.json / prices.json. Serve this folder over http (python3 -m http.server) or host it."; });
  setInterval(() => load().catch(() => {}), REFRESH_MS);
})();
