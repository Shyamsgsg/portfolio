/* Shyam's Portfolio: reads holdings.json + prices.json (static) and renders the page. */
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
    const [h, p] = await Promise.all([fetch("holdings.json" + bust).then((r) => r.json()), fetch("prices.json" + bust).then((r) => r.json())]);
    const audusd = p.fx?.AUDUSD || 0.66, usdsgd = p.fx?.USDSGD || null;
    const toUSD = { USD: 1, AUD: audusd, ...(usdsgd ? { SGD: 1 / usdsgd } : {}) };
    const rows = h.holdings.map((x) => {
      const q = p.quotes?.[x.symbol] || {};
      const ccy = q.currency || (x.symbol.endsWith(".AX") ? "AUD" : "USD");
      const price = q.price ?? null, local = price != null ? price * x.quantity : null;
      const usd = local != null ? local * (toUSD[ccy] ?? 1) : null, pct = q.change_pct ?? null;
      const dayUSD = usd != null && pct != null ? usd - usd / (1 + pct / 100) : 0;
      return { ...x, ccy, price, local, usd, pct, dayUSD, stale: !!q.stale, missing: price == null };
    });
    [...rows].sort((a, b) => (b.usd || 0) - (a.usd || 0)).forEach((r, i) => (r.color = PALETTE[i % PALETTE.length]));
    // Cash balances (holdings.json "cash"): face value, converted at live FX; no price and no day change.
    (h.cash || []).forEach((c) => {
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
    rows.forEach((r) => (r.weight = total ? ((r.usd || 0) / total) * 100 : 0));
    if (qs.has("details")) state.open = new Set(rows.map((r) => r.ticker));
    state.data = { h, p, rows, total, dayUSD, dayPct: total ? (dayUSD / (total - dayUSD)) * 100 : 0, audusd, usdsgd };
    render();
  }

  const effCcy = () => (state.ccy === "SGD" && !state.data.usdsgd ? "USD" : state.ccy);
  const conv = (usd, c = effCcy()) => (usd == null ? null : usd * (c === "SGD" ? state.data.usdsgd : 1));

  function render() {
    const { h, p, rows, total, dayUSD, dayPct, audusd, usdsgd } = state.data;
    const C = effCcy(), other = C === "USD" ? "SGD" : "USD";
    const title = h.title || "Portfolio";
    document.title = title; $("#title").textContent = title; $("#crumbTitle").textContent = title;
    if (h.wordmark) { $("#wordmark").textContent = h.wordmark; $("#wordmark2").textContent = h.wordmark; $("#copy").textContent = "© " + (h.owner || h.wordmark); }
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
    $("#noteUpdated").textContent = `${pt} / ${pom}`;
    $("#asAt").textContent = pt;
    $("#chartAsAt").textContent = `(as at ${d.toLocaleString("en-US", { day: "numeric", month: "short", year: "numeric", timeZone: "America/Vancouver" })})`;
    $("#tPT").textContent = d.toLocaleString("en-US", { ...o, timeZone: "America/Vancouver" }) + " PT";
    $("#tPOM").textContent = d.toLocaleString("en-US", { ...o, timeZone: "Pacific/Port_Moresby" }) + " PGT";

    $("#totalLink").textContent = fmt(conv(total, C), C, 0);
    $("#totalOther").textContent = usdsgd ? ` (${fmt(conv(total, other), other, 0)})` : "";
    $("#totUSD").textContent = fmt(total, "USD", 0);
    $("#totSGD").textContent = usdsgd ? fmt(conv(total, "SGD"), "SGD", 0) : "—";
    $("#dayChg").innerHTML = `<span class="${cls(dayPct)}">${fmtPct(dayPct)}%</span> <small class="money ${cls(dayPct)}">${dayUSD >= 0 ? "+" : ""}${esc(fmt(conv(dayUSD), C, 0))}</small>`;
    const nStocks = rows.filter((r) => !r.isCash).length, hasCash = rows.some((r) => r.isCash);
    $("#nPos").innerHTML = nStocks + (hasCash ? ` <small>+ cash</small>` : "");
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
    $("#legend").innerHTML = gs.map((g) => `<tr data-k="${esc(g.key)}"><td><span class="dot" style="background:${g.color}"></span>${esc(g.label)}</td><td class="num v money">${esc(fmt(conv(g.usd), C, 0))}</td><td class="num hl">${wtxt(g.weight)}</td></tr>`).join("");
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
        <td class="num">${r.isCash ? "—" : r.quantity.toLocaleString("en-US")}</td>
        <td class="num">${r.isCash ? "—" : `${esc(fmt(r.price, r.ccy))}<span class="sub">${r.ccy}</span>`}</td>
        <td class="num mval">${esc(fmt(conv(r.usd), C))}${r.ccy !== C ? `<span class="sub">${esc(fmt(r.local, r.ccy))}</span>` : ""}</td>
        <td class="num ${r.isCash ? "flat" : cls(r.pct)}">${r.isCash ? "—" : fmtPct(r.pct)}</td>
        <td class="num">${wtxt(r.weight)}</td>
        <td>${esc(r.sector || "")}</td>
        <td>${r.isCash ? "—" : esc(r.exchange)}</td>
      </tr>
      <tr class="d" style="--rowbg:${bg}" ${open ? "" : "hidden"}><td colspan="9"><div class="din">
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
