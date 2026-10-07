/* Portfolio tracker — reads holdings.json + prices.json (static), renders everything. */
(() => {
  const PALETTE = ["#d9b46a", "#7c9cff", "#3fd39a", "#ff8a65", "#c58cff", "#4dd0e1", "#f06292", "#aed581", "#ffd54f", "#90a4ae", "#ba68c8", "#4db6ac"];
  const REFRESH_MS = 5 * 60 * 1000; // re-read prices.json every 5 min while page is open
  const CCYS = ["USD", "SGD", "AUD"];
  // URL params override saved prefs, e.g. index.html?ccy=SGD, ?ccy=AUD or ?private=1 (handy for sharing)
  const qs = new URLSearchParams(location.search);
  const state = {
    ccy: (() => { const c = (qs.get("ccy") || localStorage.getItem("pt-ccy") || "USD").toUpperCase(); return CCYS.includes(c) ? c : "USD"; })(),
    priv: qs.has("private") ? qs.get("private") !== "0" : localStorage.getItem("pt-priv") === "1",
    data: null,
  };
  const $ = (s) => document.querySelector(s);

  const fmt = (n, ccy, opts = {}) => {
    if (n == null || isNaN(n)) return "—";
    const sym = { USD: "$", AUD: "A$", SGD: "S$" }[ccy] ?? "";
    const abs = Math.abs(n);
    const d = opts.dp ?? (abs >= 1000 ? 0 : abs >= 1 ? 2 : abs >= 0.1 ? 3 : 4);
    return (n < 0 ? "−" : "") + sym + abs.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });
  };
  const fmtQty = (n) => n.toLocaleString("en-US", { maximumFractionDigits: 4 });
  const fmtPct = (p, dp = 2) => (p == null || isNaN(p) ? "—" : (p > 0 ? "+" : p < 0 ? "−" : "") + Math.abs(p).toFixed(dp) + "%");
  const wtxt = (w) => (w > 0 && w < 0.1 ? "<0.1%" : w.toFixed(1) + "%");
  const cls = (p) => (p == null || Math.abs(p) < 0.005 ? "flat" : p > 0 ? "up" : "down");
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  async function load() {
    const bust = "?t=" + Date.now();
    const [h, p] = await Promise.all([
      fetch("holdings.json" + bust).then((r) => r.json()),
      fetch("prices.json" + bust).then((r) => r.json()),
    ]);
    const audusd = p.fx?.AUDUSD || 0.66;
    const usdsgd = p.fx?.USDSGD || null; // SGD per USD
    const toUSD = { USD: 1, AUD: audusd, ...(usdsgd ? { SGD: 1 / usdsgd } : {}) };
    const rows = h.holdings.map((x) => {
      const q = p.quotes?.[x.symbol] || {};
      const ccy = q.currency || (x.symbol.endsWith(".AX") ? "AUD" : "USD");
      const price = q.price ?? null;
      const local = price != null ? price * x.quantity : null;
      const usd = local != null ? local * (toUSD[ccy] ?? 1) : null;
      const pct = q.change_pct ?? null;
      const dayUSD = usd != null && pct != null ? usd - usd / (1 + pct / 100) : 0;
      return { ...x, ccy, price, local, usd, pct, dayUSD, stale: !!q.stale, marketTime: q.market_time, missing: price == null };
    });
    const total = rows.reduce((a, r) => a + (r.usd || 0), 0);
    const dayUSD = rows.reduce((a, r) => a + r.dayUSD, 0);
    rows.forEach((r) => (r.weight = total ? ((r.usd || 0) / total) * 100 : 0));
    rows.sort((a, b) => (b.usd || 0) - (a.usd || 0));
    rows.forEach((r, i) => (r.color = PALETTE[i % PALETTE.length]));
    state.data = { h, p, rows, total, dayUSD, dayPct: total ? (dayUSD / (total - dayUSD)) * 100 : 0, audusd, usdsgd };
    render();
  }

  // Convert a USD amount into currency c (defaults to the toggle). Falls back to USD if a rate is missing.
  const rateOf = (c) => (c === "AUD" ? 1 / state.data.audusd : c === "SGD" ? state.data.usdsgd : 1);
  const effCcy = () => (state.ccy === "SGD" && !state.data.usdsgd ? "USD" : state.ccy);
  const conv = (usd, c = effCcy()) => (usd == null ? null : usd * (rateOf(c) || 1));

  function render() {
    const { h, p, rows, total, dayUSD, dayPct, audusd, usdsgd } = state.data;
    const C = effCcy();
    document.title = h.title || "Portfolio";
    $("#title").textContent = h.title || "Portfolio";
    document.body.classList.toggle("private", state.priv);
    $("#privacy").classList.toggle("on", state.priv);
    document.querySelectorAll(".seg button").forEach((b) => b.classList.toggle("on", b.dataset.ccy === C));

    // Headline: USD big, SGD right under it (always). AUD added as a small note when AUD is selected.
    $("#total").innerHTML = esc(fmt(total, "USD", { dp: 0 })) + `<span class="ccy">USD</span>`;
    $("#totalSGD").textContent = usdsgd ? fmt(conv(total, "SGD"), "SGD", { dp: 0 }) : "—";
    $("#totalAlt").textContent = C === "AUD" ? "≈ " + fmt(conv(total, "AUD"), "AUD", { dp: 0 }) + " AUD" : "";
    const dc = $("#dayChg");
    dc.className = "pill " + cls(dayPct);
    dc.innerHTML = `${fmtPct(dayPct)} <span class="money">· ${dayUSD >= 0 ? "+" : ""}${esc(fmt(conv(dayUSD), C, { dp: 0 }))}</span>`;
    $("#nPos").textContent = rows.length;
    const us = rows.filter((r) => r.ccy === "USD").reduce((a, r) => a + r.weight, 0);
    $("#split").textContent = `${us.toFixed(0)}% / ${(100 - us).toFixed(0)}%`;
    $("#fx").textContent = audusd.toFixed(4);
    $("#fxSGD").textContent = usdsgd ? usdsgd.toFixed(4) : "—";

    renderDonut(rows);

    $("#rows").innerHTML = rows.map((r) => {
      const badge = r.missing ? `<span class="tag">NO PRICE</span>` : r.stale ? `<span class="tag" title="No trades recently (halted/suspended). Using last price.">HALTED</span>` : "";
      const valMain = esc(fmt(conv(r.usd), C));
      const local = esc(fmt(r.local, r.ccy));
      const price = esc(fmt(r.price, r.ccy));
      return `
      <div class="row" data-t="${esc(r.ticker)}">
        <div class="stock">
          <div class="logo${r.ticker.length > 3 ? " long" : ""}" style="--c:${r.color}">${esc(r.ticker.slice(0, 4))}</div>
          <div style="min-width:0">
            <div class="tkr">${esc(r.ticker)} <span class="ex">${esc(r.exchange)}</span> ${badge}</div>
            <div class="nm">${esc(r.name)}</div>
          </div>
        </div>
        <div class="right">
          <div class="val">${valMain}</div>
          <div class="sub"><span class="${cls(r.pct)}">${fmtPct(r.pct)}</span> · ${wtxt(r.weight)}</div>
        </div>
        <div class="meta">
          <span><b>${fmtQty(r.quantity)}</b> sh</span>
          <span>@ <b>${price}</b> ${r.ccy}</span>
          ${r.ccy !== C ? `<span class="money">${local} ${r.ccy}</span>` : ""}
        </div>
        <div class="bar"><i style="width:${r.weight}%;background:${r.color}"></i></div>
        <div class="cell">${fmtQty(r.quantity)}</div>
        <div class="cell">${price}<span class="sub">${r.ccy}</span></div>
        <div class="cell money">${local}<span class="sub">${r.ccy}</span></div>
        <div class="cell val">${valMain}<span class="sub">${C}</span></div>
        <div class="cell ${cls(r.pct)}">${fmtPct(r.pct)}</div>
        <div class="cell wcell"><span>${wtxt(r.weight)}</span><div class="bar"><i style="width:${Math.min(100, r.weight * 2.5)}%;background:${r.color}"></i></div></div>
      </div>`;
    }).join("");

    // timestamps
    const d = new Date(p.updated);
    const opt = { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" };
    $("#tPT").textContent = d.toLocaleString("en-US", { ...opt, timeZone: "America/Vancouver" }) + " PT";
    $("#tPOM").textContent = d.toLocaleString("en-US", { ...opt, timeZone: "Pacific/Port_Moresby" }) + " PGT";
    const ageH = (Date.now() - d) / 36e5;
    $("#liveDot").classList.toggle("stale", ageH > 26);
    const notes = [];
    const halted = rows.filter((r) => r.stale && !r.missing).map((r) => r.ticker);
    if (halted.length) notes.push(`${halted.join(", ")}: no recent trades (suspended/halted), valued at last price.`);
    const missing = rows.filter((r) => r.missing).map((r) => r.ticker);
    if (missing.length) notes.push(`${missing.join(", ")}: price unavailable.`);
    $("#notes").textContent = notes.join(" ");
  }

  function arc(cx, cy, r, a0, a1) {
    const p = (a) => [cx + r * Math.cos(a), cy + r * Math.sin(a)];
    const [x0, y0] = p(a0), [x1, y1] = p(a1);
    return `M${x0.toFixed(2)} ${y0.toFixed(2)} A${r} ${r} 0 ${a1 - a0 > Math.PI ? 1 : 0} 1 ${x1.toFixed(2)} ${y1.toFixed(2)}`;
  }

  function renderDonut(rows) {
    const svg = $("#donut");
    const gap = 0.022, R = 92;
    let a = -Math.PI / 2;
    let paths = `<circle cx="110" cy="110" r="${R}" fill="none" stroke="rgba(255,255,255,.04)" stroke-width="22"/>`;
    rows.filter((r) => r.weight > 0).forEach((r) => {
      const sweep = (r.weight / 100) * Math.PI * 2;
      const g = sweep > gap * 2 ? gap : sweep / 3;
      paths += `<path d="${arc(110, 110, R, a + g / 2, a + sweep - g / 2)}" stroke="${r.color}" stroke-width="22" fill="none" stroke-linecap="butt" data-t="${esc(r.ticker)}"/>`;
      a += sweep;
    });
    svg.innerHTML = paths;
    $("#legend").innerHTML = rows.map((r) => `<li data-t="${esc(r.ticker)}"><span class="sw" style="background:${r.color}"></span><span class="tk">${esc(r.ticker)}</span><span class="pc">${wtxt(r.weight)}</span></li>`).join("");
    const hl = (t) => {
      svg.classList.toggle("hovering", !!t);
      svg.querySelectorAll("path").forEach((p) => p.classList.toggle("hl", p.dataset.t === t));
      document.querySelectorAll(".legend li").forEach((li) => li.classList.toggle("hl", li.dataset.t === t));
      const r = rows.find((x) => x.ticker === t);
      $("#dcLabel").textContent = r ? r.ticker : "Allocation";
      $("#dcVal").textContent = r ? r.weight.toFixed(1) + "%" : rows.length + " stocks";
    };
    hl(null);
    document.querySelectorAll("#donut path, .legend li").forEach((el) => {
      el.addEventListener("mouseenter", () => hl(el.dataset.t));
      el.addEventListener("mouseleave", () => hl(null));
      el.addEventListener("click", () => hl(el.dataset.t));
    });
  }

  document.querySelectorAll(".seg button").forEach((b) => b.addEventListener("click", () => {
    state.ccy = b.dataset.ccy; localStorage.setItem("pt-ccy", state.ccy); state.data && render();
  }));
  $("#privacy").addEventListener("click", () => {
    state.priv = !state.priv; localStorage.setItem("pt-priv", state.priv ? "1" : "0"); state.data && render();
  });

  load().catch((e) => {
    console.error(e);
    $("#notes").textContent = "Couldn't load holdings.json / prices.json. If opened as a local file, serve the folder (python3 -m http.server) or host it.";
  });
  setInterval(() => load().catch(() => {}), REFRESH_MS);
})();
