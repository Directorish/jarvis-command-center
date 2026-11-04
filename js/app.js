(() => {
  "use strict";

  const STALE_MS = 45 * 60 * 1000;
  const POLL_MS = 60 * 1000;
  const CREW_URL = "data/crew.json";
  const HISTORY_URL = "data/history.json";

  const state = {
    crew: null,
    history: null,
    filter: "all",
    sort: "attention",
    query: "",
    selectedId: null,
    lastFetchOk: false,
  };

  const $ = (id) => document.getElementById(id);

  function statusClass(s) {
    return `status-${s || "quiet"}`;
  }

  function statusLabel(s) {
    if (s === "active") return "ACTIVE TODAY";
    if (s === "blocked") return "BLOCKED";
    if (s === "idle") return "IDLE";
    return "QUIET";
  }

  async function fetchJson(url) {
    const res = await fetch(`${url}?t=${Date.now()}`, {
      cache: "no-store",
      headers: { "Cache-Control": "no-cache" },
    });
    if (!res.ok) throw new Error(`${url} ${res.status}`);
    return res.json();
  }

  function parseSyncedAt(iso) {
    if (!iso) return null;
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? null : d;
  }

  function updateLinkStatus() {
    const el = $("linkStatus");
    const banner = $("staleBanner");
    const syncEl = $("syncTime");
    const crew = state.crew;
    if (!crew) {
      el.textContent = "◉ LINKING…";
      el.className = "link-status";
      banner.classList.add("hidden");
      return;
    }
    syncEl.textContent = crew.syncedAtEt || "—";
    const synced = parseSyncedAt(crew.syncedAt);
    const age = synced ? Date.now() - synced.getTime() : Infinity;
    const stale = age > STALE_MS;
    if (!state.lastFetchOk) {
      el.textContent = "◉ LINK DEGRADED";
      el.className = "link-status danger";
    } else if (stale) {
      el.textContent = "◉ DATA STALE";
      el.className = "link-status warn";
    } else {
      el.textContent = "◉ LINK NOMINAL";
      el.className = "link-status ok";
    }
    banner.classList.toggle("hidden", !stale);
  }

  function renderAttention() {
    const list = $("attentionList");
    const items = (state.crew && state.crew.attention) || [];
    $("attentionCount").textContent = String(items.length);
    list.innerHTML = items
      .map(
        (a) => `
      <div class="attention-item">
        <div class="attention-bot">${escapeHtml(a.bot)}</div>
        <div class="attention-text">${escapeHtml(a.item)}</div>
      </div>`
      )
      .join("");
  }

  function renderKpis() {
    const k = (state.crew && state.crew.kpis) || {};
    const cards = [
      {
        label: "WEEKLY LIMIT",
        value: k.weeklyUsedPct != null ? `${k.weeklyUsedPct}%` : "—",
        detail: k.resetEt ? `Resets ${k.resetEt}` : "—",
      },
      {
        label: "ACTIVE TODAY",
        value: String(k.active ?? "—"),
        detail: "Readable chat today",
      },
      {
        label: "BLOCKED",
        value: String(k.blocked ?? "—"),
        detail: "Needs unblock",
      },
      {
        label: "NEEDS YOU",
        value: String(k.needsYou ?? "—"),
        detail: "Awaiting a decision",
      },
    ];
    $("kpiGrid").innerHTML = cards
      .map(
        (c) => `
      <div class="hud-frame kpi">
        <div class="label">${c.label}</div>
        <div class="value">${escapeHtml(c.value)}</div>
        <div class="detail">${escapeHtml(c.detail)}</div>
      </div>`
      )
      .join("");
  }

  function renderUsage() {
    const rows = (state.crew && state.crew.usageTop) || [];
    $("usageChart").innerHTML = rows
      .map(
        (u, i) => `
      <div class="usage-row">
        <div class="usage-name ${i === 0 ? "hot" : ""}">${escapeHtml(u.name)}</div>
        <div class="bar-track"><div class="bar-fill ${i === 0 ? "hot" : ""}" style="width:${Math.min(100, u.share)}%"></div></div>
        <div class="usage-pct">${u.share}%</div>
      </div>`
      )
      .join("");
  }

  function renderAlerts() {
    const alerts = (state.crew && state.crew.alerts) || [];
    $("alertsList").innerHTML = alerts.length
      ? alerts
          .map(
            (a) => `
        <div class="alert-chip ${a.level === "danger" ? "danger" : "warn"}">
          ${escapeHtml(a.bot)} · ${escapeHtml(a.message)}
        </div>`
          )
          .join("")
      : `<div class="muted tiny">No active alerts.</div>`;
  }

  function counts() {
    const bots = (state.crew && state.crew.bots) || [];
    return {
      all: bots.length,
      active: bots.filter((b) => b.status === "active").length,
      blocked: bots.filter((b) => b.status === "blocked").length,
      needs: bots.filter((b) => b.needs && b.needs !== "—").length,
      quiet: bots.filter((b) => b.status === "quiet" || b.status === "idle").length,
      horror: bots.filter((b) => b.group === "horror").length,
    };
  }

  function filteredBots() {
    let list = ((state.crew && state.crew.bots) || []).slice();
    const f = state.filter;
    if (f === "active") list = list.filter((b) => b.status === "active");
    if (f === "blocked") list = list.filter((b) => b.status === "blocked");
    if (f === "needs") list = list.filter((b) => b.needs && b.needs !== "—");
    if (f === "quiet") list = list.filter((b) => b.status === "quiet" || b.status === "idle");
    if (f === "horror") list = list.filter((b) => b.group === "horror");
    const q = state.query.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (b) =>
          b.name.toLowerCase().includes(q) ||
          (b.role || "").toLowerCase().includes(q) ||
          (b.work || "").toLowerCase().includes(q) ||
          (b.needs || "").toLowerCase().includes(q)
      );
    }
    if (state.sort === "share") list.sort((a, b) => (b.share ?? -1) - (a.share ?? -1));
    else if (state.sort === "recent") list.sort((a, b) => (b.lastSort || 0) - (a.lastSort || 0));
    else if (state.sort === "name") list.sort((a, b) => a.name.localeCompare(b.name));
    else {
      const rank = (b) => {
        if (b.status === "blocked") return 0;
        if (b.needs && b.needs !== "—") return 1;
        if (b.status === "active") return 2;
        if (b.status === "idle") return 3;
        return 4;
      };
      list.sort((a, b) => rank(a) - rank(b) || (b.share ?? -1) - (a.share ?? -1));
    }
    return list;
  }

  function renderControls() {
    const c = counts();
    const filters = [
      ["all", "All", c.all],
      ["active", "Active", c.active],
      ["blocked", "Blocked", c.blocked],
      ["needs", "Needs you", c.needs],
      ["quiet", "Quiet/Idle", c.quiet],
      ["horror", "Horror crew", c.horror],
    ];
    $("filterRow").innerHTML = filters
      .map(
        ([v, label, n]) =>
          `<button type="button" class="chip ${state.filter === v ? "active" : ""}" data-filter="${v}">${label} · ${n}</button>`
      )
      .join("");

    const sorts = [
      ["attention", "Attention"],
      ["share", "Usage share"],
      ["recent", "Last active"],
      ["name", "Name"],
    ];
    $("sortRow").innerHTML =
      `<span class="sort-label">SORT</span>` +
      sorts
        .map(
          ([v, label]) =>
            `<button type="button" class="chip ${state.sort === v ? "active" : ""}" data-sort="${v}">${label}</button>`
        )
        .join("");

    $("filterRow").onclick = (e) => {
      const btn = e.target.closest("[data-filter]");
      if (!btn) return;
      state.filter = btn.getAttribute("data-filter");
      renderControls();
      renderBots();
    };
    $("sortRow").onclick = (e) => {
      const btn = e.target.closest("[data-sort]");
      if (!btn) return;
      state.sort = btn.getAttribute("data-sort");
      renderControls();
      renderBots();
    };
  }

  function renderBots() {
    const rows = filteredBots();
    $("botGrid").innerHTML = rows
      .map((b) => {
        const routines =
          b.routines && b.routines.length
            ? `<div class="routines-preview">${escapeHtml(b.routines.join(" · "))}</div>`
            : "";
        const needsHot = b.needs && b.needs !== "—";
        return `
      <article class="hud-frame bot-card" tabindex="0" data-id="${escapeHtml(b.id)}" role="button" aria-label="Open ${escapeHtml(b.name)}">
        <div class="bot-card-grid">
          <div>
            <div class="bot-name">${escapeHtml(b.name)}</div>
            <div class="bot-role">${escapeHtml(b.role || "")}</div>
          </div>
          <div class="status-pill ${statusClass(b.status)}">
            <span class="dot" style="background:currentColor;color:currentColor"></span>
            <span>${statusLabel(b.status)}</span>
          </div>
          <div>
            <div class="field-label">LAST ACTIVE</div>
            <div class="field-value">${escapeHtml(b.lastEt || "—")}</div>
          </div>
          <div>
            <div class="field-label">CURRENT WORK</div>
            <div class="work-text">${escapeHtml(b.work || "—")}</div>
            ${routines}
          </div>
          <div>
            <div class="field-label">NEEDS ISMAEL</div>
            <div class="needs-text ${needsHot ? "hot" : "cold"}">${escapeHtml(b.needs || "—")}</div>
          </div>
          <div class="share-cell">
            <div class="field-label">SHARE</div>
            <div class="share-value ${b.share == null ? "none" : ""}">${b.share != null ? `${b.share}%` : "—"}</div>
          </div>
        </div>
      </article>`;
      })
      .join("");

    $("botGrid").onclick = (e) => {
      const card = e.target.closest("[data-id]");
      if (!card) return;
      openDrawer(card.getAttribute("data-id"));
    };
    $("botGrid").onkeydown = (e) => {
      if (e.key !== "Enter" && e.key !== " ") return;
      const card = e.target.closest("[data-id]");
      if (!card) return;
      e.preventDefault();
      openDrawer(card.getAttribute("data-id"));
    };
  }

  function openDrawer(id) {
    const bot = ((state.crew && state.crew.bots) || []).find((b) => b.id === id);
    if (!bot) return;
    state.selectedId = id;
    const drawer = $("drawer");
    $("drawerStatus").textContent = statusLabel(bot.status);
    $("drawerStatus").className = `eyebrow ${statusClass(bot.status)}`;
    $("drawerTitle").textContent = bot.name;
    $("drawerRole").textContent = bot.role || "";
    $("drawerLast").textContent = bot.lastEt || "—";
    $("drawerShare").textContent = bot.share != null ? `${bot.share}%` : "—";
    $("drawerGroup").textContent = (bot.group || "—").toUpperCase();
    $("drawerWork").textContent = bot.work || "—";
    $("drawerNeeds").textContent = bot.needs || "—";
    $("drawerNeeds").style.color = bot.needs && bot.needs !== "—" ? "var(--warn)" : "var(--muted)";
    const ul = $("drawerRoutines");
    ul.innerHTML = (bot.routines || []).map((r) => `<li>${escapeHtml(r)}</li>`).join("");
    drawer.classList.remove("hidden");
    drawer.setAttribute("aria-hidden", "false");
    document.body.style.overflow = "hidden";
  }

  function closeDrawer() {
    state.selectedId = null;
    const drawer = $("drawer");
    drawer.classList.add("hidden");
    drawer.setAttribute("aria-hidden", "true");
    document.body.style.overflow = "";
  }

  function renderHistory() {
    const canvas = $("historyChart");
    const ctx = canvas.getContext("2d");
    const points = (state.history && state.history.points) || [];
    const dpr = window.devicePixelRatio || 1;
    const cssW = canvas.clientWidth || 640;
    const cssH = 220;
    canvas.width = Math.floor(cssW * dpr);
    canvas.height = Math.floor(cssH * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cssW, cssH);

    const pad = { t: 16, r: 16, b: 36, l: 40 };
    const w = cssW - pad.l - pad.r;
    const h = cssH - pad.t - pad.b;

    ctx.strokeStyle = "rgba(0,209,255,0.12)";
    ctx.lineWidth = 1;
    for (let i = 0; i <= 4; i++) {
      const y = pad.t + (h * i) / 4;
      ctx.beginPath();
      ctx.moveTo(pad.l, y);
      ctx.lineTo(pad.l + w, y);
      ctx.stroke();
    }

    if (points.length === 0) {
      ctx.fillStyle = "#7aa0b8";
      ctx.font = "12px IBM Plex Mono, monospace";
      ctx.fillText("No history yet — first sync point will appear here.", pad.l, pad.t + h / 2);
      $("historyCaption").textContent = "Waiting for sync history.";
      return;
    }

    const vals = points.map((p) => Number(p.weeklyUsedPct) || 0);
    const max = Math.max(100, ...vals, 1);
    const n = points.length;

    function xAt(i) {
      if (n === 1) return pad.l + w / 2;
      return pad.l + (w * i) / (n - 1);
    }
    function yAt(v) {
      return pad.t + h - (h * v) / max;
    }

    // Area
    ctx.beginPath();
    points.forEach((p, i) => {
      const x = xAt(i);
      const y = yAt(vals[i]);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.lineTo(xAt(n - 1), pad.t + h);
    ctx.lineTo(xAt(0), pad.t + h);
    ctx.closePath();
    const grad = ctx.createLinearGradient(0, pad.t, 0, pad.t + h);
    grad.addColorStop(0, "rgba(0,209,255,0.35)");
    grad.addColorStop(1, "rgba(0,209,255,0.02)");
    ctx.fillStyle = grad;
    ctx.fill();

    // Line
    ctx.beginPath();
    points.forEach((p, i) => {
      const x = xAt(i);
      const y = yAt(vals[i]);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.strokeStyle = "#00d1ff";
    ctx.lineWidth = 2;
    ctx.shadowColor = "rgba(0,209,255,0.6)";
    ctx.shadowBlur = 8;
    ctx.stroke();
    ctx.shadowBlur = 0;

    // Dots + labels
    ctx.fillStyle = "#eaffff";
    ctx.font = "10px IBM Plex Mono, monospace";
    points.forEach((p, i) => {
      const x = xAt(i);
      const y = yAt(vals[i]);
      ctx.beginPath();
      ctx.arc(x, y, 3.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#7aa0b8";
      const label = (p.et || "").replace(/^.*,\s*/, "").slice(0, 12) || `${vals[i]}%`;
      ctx.fillText(label, Math.min(x - 20, cssW - 80), pad.t + h + 18);
      ctx.fillStyle = "#00d1ff";
      ctx.fillText(`${vals[i]}%`, x - 10, y - 8);
      ctx.fillStyle = "#eaffff";
    });

    // Axis label
    ctx.fillStyle = "#7aa0b8";
    ctx.fillText("0%", pad.l - 28, pad.t + h + 4);
    ctx.fillText(`${Math.round(max)}%`, pad.l - 32, pad.t + 4);

    const last = points[points.length - 1];
    $("historyCaption").textContent = `${points.length} sync point${points.length === 1 ? "" : "s"} · last weekly ${last.weeklyUsedPct}% · active ${last.active} · blocked ${last.blocked}`;
  }

  function escapeHtml(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function renderAll() {
    updateLinkStatus();
    renderAttention();
    renderKpis();
    renderUsage();
    renderAlerts();
    renderControls();
    renderBots();
    renderHistory();
  }

  async function load() {
    try {
      const [crew, history] = await Promise.all([fetchJson(CREW_URL), fetchJson(HISTORY_URL)]);
      state.crew = crew;
      state.history = history;
      state.lastFetchOk = true;
      renderAll();
      if (state.selectedId) openDrawer(state.selectedId);
    } catch (err) {
      console.error(err);
      state.lastFetchOk = false;
      updateLinkStatus();
    }
  }

  function wire() {
    $("searchInput").addEventListener("input", (e) => {
      state.query = e.target.value;
      renderBots();
    });
    $("drawerClose").addEventListener("click", closeDrawer);
    $("drawerBackdrop").addEventListener("click", closeDrawer);
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") closeDrawer();
    });
    window.addEventListener("resize", () => renderHistory());
  }

  wire();
  load();
  setInterval(load, POLL_MS);
})();
