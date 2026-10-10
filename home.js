/* Home page: load news.json and render filterable insight cards. */
(() => {
  const grid = document.getElementById("news-grid");
  const filters = document.getElementById("news-filters");
  const updatedEl = document.getElementById("news-updated");
  if (!grid || !filters) return;

  let items = [];
  let active = "ALL";

  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  function fmtDate(iso) {
    if (!iso) return "";
    try {
      const d = new Date(iso);
      return d.toLocaleDateString("en-US", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
    } catch {
      return "";
    }
  }

  function renderFilters(tickers) {
    const all = ["ALL", ...tickers];
    filters.innerHTML = all
      .map((t) => `<button type="button" data-t="${esc(t)}" class="${t === active ? "on" : ""}">${t === "ALL" ? "All" : esc(t)}</button>`)
      .join("");
    filters.querySelectorAll("button").forEach((b) => {
      b.addEventListener("click", () => {
        active = b.dataset.t;
        filters.querySelectorAll("button").forEach((x) => x.classList.toggle("on", x.dataset.t === active));
        renderCards();
      });
    });
  }

  function renderCards() {
    const list = active === "ALL" ? items : items.filter((x) => x.ticker === active);
    if (!list.length) {
      grid.innerHTML = `<p class="news-empty">No recent headlines for this filter.</p>`;
      return;
    }
    grid.innerHTML = list
      .map((it) => {
        const logo = it.logo
          ? `<span class="logo-box"><img src="${esc(it.logo)}" alt="" width="28" height="22" loading="lazy"></span>`
          : `<span class="logo-box"><span class="tag">${esc(it.ticker)}</span></span>`;
        return `<a class="news-card" href="${esc(it.link)}" target="_blank" rel="noopener noreferrer">
          <div class="top">${logo}<span class="tag">${esc(it.ticker)}</span><span class="date">${esc(fmtDate(it.published))}</span></div>
          <h3>${esc(it.title)}</h3>
          <div class="foot"><span class="source">${esc(it.source || "News")}</span><span class="read">Read ↗</span></div>
        </a>`;
      })
      .join("");
  }

  async function load() {
    try {
      const r = await fetch("news.json?t=" + Date.now());
      if (!r.ok) throw new Error("news.json " + r.status);
      const data = await r.json();
      items = Array.isArray(data.items) ? data.items : [];
      const tickers = [...new Set(items.map((x) => x.ticker).filter(Boolean))];
      if (updatedEl && data.updated) {
        const d = new Date(data.updated);
        updatedEl.textContent =
          "Updated " +
          d.toLocaleString("en-US", {
            day: "numeric",
            month: "short",
            year: "numeric",
            hour: "numeric",
            minute: "2-digit",
            timeZone: "Pacific/Port_Moresby",
          }) +
          " PGT";
      }
      renderFilters(tickers);
      renderCards();
    } catch (e) {
      grid.innerHTML = `<p class="news-empty">Headlines will appear here once the news feed has been updated.</p>`;
      console.warn(e);
    }
  }

  load();
})();
