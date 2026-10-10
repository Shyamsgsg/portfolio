/* Full-screen 0–100% loader; timed locally — never waits on media/network. */
(() => {
  const root = document.getElementById("site-loader");
  const bar = document.getElementById("loader-bar");
  const pctEl = document.getElementById("loader-pct");
  if (!root || !bar || !pctEl) return;

  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const params = new URLSearchParams(location.search);
  const freezeRaw = params.get("loaderPreview");
  const freezeAt = freezeRaw == null || freezeRaw === "" ? NaN : Number(freezeRaw);
  const skip = params.has("noloader");
  // 2.5s count + 0.3s fade = 2.8s max from __loaderStart (≤3.0s total).
  const duration = reduce ? 450 : 2500;
  const fadeMs = reduce ? 150 : 300;
  let done = false;
  let timer = 0;

  const setPct = (p) => {
    bar.style.width = p + "%";
    pctEl.textContent = p + "%";
    root.setAttribute("aria-valuenow", String(p));
  };

  const finish = () => {
    if (done) return;
    done = true;
    if (timer) window.clearInterval(timer);
    setPct(100);
    root.classList.add("is-done");
    document.documentElement.classList.remove("loading");
    window.setTimeout(() => {
      root.setAttribute("hidden", "");
      root.setAttribute("aria-hidden", "true");
    }, fadeMs);
  };

  if (skip) {
    root.classList.add("is-done");
    root.setAttribute("hidden", "");
    root.setAttribute("aria-hidden", "true");
    document.documentElement.classList.remove("loading");
    return;
  }

  if (Number.isFinite(freezeAt) && freezeAt >= 0) {
    setPct(Math.max(0, Math.min(100, Math.round(freezeAt))));
    document.documentElement.classList.add("loading");
    return;
  }

  const ease = (t) => 1 - Math.pow(1 - t, 3);
  const start = typeof window.__loaderStart === "number" ? window.__loaderStart : Date.now();
  document.documentElement.classList.add("loading");
  setPct(0);

  const tick = () => {
    const t = Math.min(1, (Date.now() - start) / duration);
    setPct(Math.round(ease(t) * 100));
    if (t >= 1) finish();
  };
  timer = window.setInterval(tick, 32);
  tick();
  window.setTimeout(finish, Math.max(0, duration - (Date.now() - start)));
})();
