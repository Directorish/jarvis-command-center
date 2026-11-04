(() => {
  "use strict";

  const STALE_MS = 45 * 60 * 1000;
  const POLL_MS = 60 * 1000;
  const CREW_URL = "data/crew.json";
  const HISTORY_URL = "data/history.json";
  const JARVIS_DEEP_LINK =
    "grokbot://app/v1/agent?id=70d061f7-4244-4dd4-b915-852c30735a5a";
  const JARVIS_NOTE = "Opens J.A.R.V.I.S in the Grok Bot app";

  const SERVICES = [
    { key: "Gmail", icon: "GM" },
    { key: "Calendar", icon: "CA" },
    { key: "Drive", icon: "DR" },
    { key: "GitHub", icon: "GH" },
    { key: "X", icon: "X" },
  ];

  const state = {
    crew: null,
    history: null,
    filter: "all",
    query: "",
    selectedId: null,
    lastFetchOk: false,
  };

  const $ = (id) => document.getElementById(id);

  function escapeHtml(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function statusLabel(s) {
    if (s === "active") return "ACTIVE";
    if (s === "blocked") return "BLOCKED";
    if (s === "idle") return "IDLE";
    return "QUIET";
  }

  function shortName(name) {
    return String(name || "")
      .split("·")[0]
      .split("|")[0]
      .trim();
  }

  function parseSyncedAt(iso) {
    if (!iso) return null;
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? null : d;
  }

  function crewHealth(k) {
    if (!k || !k.totalBots) return 0;
    const blocked = k.blocked || 0;
    const needs = k.needsYou || 0;
    const total = k.totalBots || 1;
    // Health: penalize blocked heavily, needs-you moderately; floor at 0
    const score = 100 - (blocked / total) * 55 - (needs / total) * 25;
    return Math.max(0, Math.min(100, Math.round(score)));
  }

  async function fetchJson(url) {
    const res = await fetch(`${url}?t=${Date.now()}`, {
      cache: "no-store",
      headers: { "Cache-Control": "no-cache" },
    });
    if (!res.ok) throw new Error(`${url} ${res.status}`);
    return res.json();
  }

  /* ---------- Clock ---------- */
  function tickClock() {
    const el = $("liveClock");
    if (!el) return;
    const now = new Date();
    const opts = {
      timeZone: "America/New_York",
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      second: "2-digit",
      hour12: true,
    };
    const parts = new Intl.DateTimeFormat("en-US", opts).formatToParts(now);
    const get = (t) => (parts.find((p) => p.type === t) || {}).value || "";
    el.textContent = `${get("weekday").toUpperCase()}, ${get("month").toUpperCase()} ${get("day")}, ${get("year")} | ${get("hour")}:${get("minute")}:${get("second")} ${get("dayPeriod")}`;
  }

  /* ---------- Link / stale ---------- */
  function updateLinkStatus() {
    const pill = $("sysPill");
    const pillText = $("sysPillText");
    const banner = $("staleBanner");
    const fbLink = $("fbLink");
    const fbSync = $("fbSync");
    const syncMeta = $("syncMeta");
    const crew = state.crew;

    if (!crew) {
      pill.className = "sys-pill";
      pillText.textContent = "LINKING…";
      fbLink.textContent = "LINK…";
      banner.classList.add("hidden");
      return;
    }

    if (syncMeta) syncMeta.textContent = `SYNC ${crew.syncedAtEt || "—"}`;
    if (fbSync) fbSync.textContent = `Last sync ${crew.syncedAtEt || "—"}`;

    const synced = parseSyncedAt(crew.syncedAt);
    const age = synced ? Date.now() - synced.getTime() : Infinity;
    const stale = age > STALE_MS;
    const blocked = (crew.kpis && crew.kpis.blocked) || 0;

    if (!state.lastFetchOk) {
      pill.className = "sys-pill danger";
      pillText.textContent = "LINK DEGRADED";
      fbLink.textContent = "LINK DEGRADED";
      fbLink.style.color = "var(--danger)";
    } else if (stale) {
      pill.className = "sys-pill warn";
      pillText.textContent = "DATA STALE";
      fbLink.textContent = "DATA STALE";
      fbLink.style.color = "var(--warn)";
    } else if (blocked > 0) {
      pill.className = "sys-pill warn";
      pillText.textContent = `${blocked} BOT${blocked === 1 ? "" : "S"} BLOCKED`;
      fbLink.textContent = "LINK NOMINAL";
      fbLink.style.color = "var(--green)";
    } else {
      pill.className = "sys-pill";
      pillText.textContent = "ALL SYSTEMS OPERATIONAL";
      fbLink.textContent = "LINK NOMINAL";
      fbLink.style.color = "var(--green)";
    }
    banner.classList.toggle("hidden", !stale);
  }

  /* ---------- System overview ---------- */
  function renderOverview() {
    const k = (state.crew && state.crew.kpis) || {};
    const weekly = k.weeklyUsedPct != null ? k.weeklyUsedPct : 0;
    const health = crewHealth(k);
    const rows = [
      { label: "WEEKLY USAGE", val: `${weekly}%`, pct: weekly },
      { label: "ACTIVE BOTS", val: String(k.active ?? "—"), pct: k.totalBots ? ((k.active || 0) / k.totalBots) * 100 : 0 },
      { label: "BLOCKED", val: String(k.blocked ?? "—"), pct: k.totalBots ? ((k.blocked || 0) / k.totalBots) * 100 : 0 },
      { label: "QUIET / IDLE", val: String(k.quietIdle ?? "—"), pct: k.totalBots ? ((k.quietIdle || 0) / k.totalBots) * 100 : 0 },
      { label: "NEEDS YOU", val: String(k.needsYou ?? "—"), pct: k.totalBots ? ((k.needsYou || 0) / k.totalBots) * 100 : 0 },
      { label: "TOTAL CREW", val: String(k.totalBots ?? "—"), pct: 100 },
    ];
    $("overviewMetrics").innerHTML = rows
      .map(
        (r) => `
      <div class="metric-row">
        <span class="m-label">${r.label}</span>
        <span class="m-val">${escapeHtml(r.val)}</span>
        <div class="m-bar"><div class="m-fill" style="width:${Math.min(100, Math.max(0, r.pct))}%"></div></div>
      </div>`
      )
      .join("");

    $("gaugePct").textContent = `${health}%`;
    const circ = 2 * Math.PI * 56;
    const offset = circ * (1 - health / 100);
    const fill = $("gaugeFill");
    fill.style.strokeDasharray = String(circ);
    fill.style.strokeDashoffset = String(offset);

    if (k.resetEt) {
      // shown in right-now
    }
  }

  /* ---------- Connected services ---------- */
  function renderServices() {
    $("servicesOnline").textContent = `${SERVICES.length} ONLINE`;
    $("deviceList").innerHTML = SERVICES.map(
      (s) => `
      <li class="device-item">
        <span class="device-icon">${s.icon}</span>
        <span class="device-name">${escapeHtml(s.key)}</span>
        <span class="device-status"><span class="dot"></span>ONLINE</span>
      </li>`
    ).join("");
  }

  /* ---------- Schedule from routines ---------- */
  function extractTimeHint(text) {
    const t = String(text || "");
    const m =
      t.match(/\b(\d{1,2}(?::\d{2})?\s*(?:AM|PM|am|pm))\b/) ||
      t.match(/\b(\d{1,2}\s*(?:AM|PM|am|pm))\b/) ||
      t.match(/\b(Morning|Nightly|Weekday|EOD|Night-before)\b/i);
    return m ? m[1] : null;
  }

  function renderSchedule() {
    const bots = (state.crew && state.crew.bots) || [];
    const items = [];
    bots.forEach((b) => {
      (b.routines || []).forEach((r) => {
        items.push({
          bot: shortName(b.name),
          name: r,
          time: extractTimeHint(r) || "SCHEDULED",
          status: b.status,
        });
      });
    });
    // Prefer items with explicit times, then active bots' routines
    items.sort((a, b) => {
      const rank = (x) =>
        (x.time !== "SCHEDULED" ? 0 : 1) +
        (x.status === "active" ? 0 : x.status === "blocked" ? 1 : 2);
      return rank(a) - rank(b) || a.name.localeCompare(b.name);
    });
    const top = items.slice(0, 10);
    $("scheduleList").innerHTML = top.length
      ? top
          .map(
            (s) => `
        <li class="schedule-item">
          <span class="tick"></span>
          <div>
            <div class="s-time">${escapeHtml(s.time)}</div>
            <div class="s-name">${escapeHtml(s.name)}</div>
            <div class="s-bot">${escapeHtml(s.bot)}</div>
          </div>
        </li>`
          )
          .join("")
      : `<li class="schedule-item"><span class="tick"></span><div class="s-name">No routines listed</div></li>`;
  }

  /* ---------- Alerts ---------- */
  function renderAlerts() {
    const alerts = (state.crew && state.crew.alerts) || [];
    $("alertCount").textContent = String(alerts.length);
    $("alertList").innerHTML = alerts.length
      ? alerts
          .map((a) => {
            const bot = ((state.crew && state.crew.bots) || []).find(
              (b) =>
                shortName(b.name).toLowerCase().includes(String(a.bot || "").toLowerCase()) ||
                String(a.bot || "").toLowerCase().includes(shortName(b.name).toLowerCase())
            );
            const idAttr = bot ? ` data-id="${escapeHtml(bot.id)}"` : "";
            return `
        <li class="alert-item ${a.level === "danger" ? "danger" : "warn"}">
          <div class="alert-bot">${escapeHtml(a.bot)}</div>
          <button type="button" class="alert-btn"${idAttr}>VIEW</button>
          <div class="alert-msg">${escapeHtml(a.message)}</div>
        </li>`;
          })
          .join("")
      : `<li class="alert-item"><div class="alert-msg">No active alerts.</div></li>`;

    $("alertList").onclick = (e) => {
      const btn = e.target.closest("[data-id]");
      if (!btn) return;
      openDrawer(btn.getAttribute("data-id"));
    };
  }

  /* ---------- Mark 85 / core ---------- */
  function renderCore() {
    const k = (state.crew && state.crew.kpis) || {};
    const bots = (state.crew && state.crew.bots) || [];
    const active = bots.filter((b) => b.status === "active").length;
    const blocked = bots.filter((b) => b.status === "blocked").length;
    const withShare = bots.filter((b) => b.share != null).length;
    $("coreBotCount").textContent = String(k.totalBots ?? bots.length);
    $("mark85").innerHTML = [
      ["ACTIVE", String(k.active ?? active)],
      ["BLOCKED", String(k.blocked ?? blocked)],
      ["NEEDS YOU", String(k.needsYou ?? "—")],
      ["QUIET", String(k.quietIdle ?? "—")],
      ["USAGE", k.weeklyUsedPct != null ? `${k.weeklyUsedPct}%` : "—"],
      ["TOP BOTS", String(withShare)],
      ["RESET", k.resetEt ? String(k.resetEt).replace(/\s*·\s*/g, " ") : "—"],
    ]
      .map(
        ([kk, vv]) => `
      <div class="m85-row"><span class="m85-k">${kk}</span><span class="m85-v">${escapeHtml(vv)}</span></div>`
      )
      .join("");

    // Voice state decorative: EXECUTING if any active, else LISTENING
    document.querySelectorAll(".vstate").forEach((el) => el.classList.remove("active"));
    const mode = blocked > 0 ? "thinking" : active > 0 ? "executing" : "listening";
    const target = document.querySelector(`.vstate[data-s="${mode}"]`);
    if (target) target.classList.add("active");
    $("voiceState").textContent = mode.toUpperCase();
  }

  /* ---------- Waveform bars ---------- */
  function buildWaveform() {
    const wf = $("waveform");
    if (!wf || wf.dataset.built) return;
    const n = 36;
    let html = "";
    for (let i = 0; i < n; i++) {
      const delay = ((i % 12) * 0.08).toFixed(2);
      const dur = (0.9 + (i % 5) * 0.12).toFixed(2);
      html += `<span class="wave-bar" style="animation-delay:-${delay}s;animation-duration:${dur}s"></span>`;
    }
    wf.innerHTML = html;
    wf.dataset.built = "1";
  }

  /* ---------- Active tasks / ops ---------- */
  function renderTasks() {
    const bots = (state.crew && state.crew.bots) || [];
    const usage = (state.crew && state.crew.usageTop) || [];
    // Active tasks = top usage bots with progress = share
    const tasks = usage.slice(0, 5);
    $("activeTaskCount").textContent = String(tasks.length);
    $("activeTasks").innerHTML = tasks.length
      ? tasks
          .map(
            (u) => `
        <div class="task-row">
          <div class="task-top">
            <span class="task-name">${escapeHtml(u.name)}</span>
            <span class="task-pct">${u.share}%</span>
          </div>
          <div class="bar-track"><div class="bar-fill" style="width:${Math.min(100, u.share)}%"></div></div>
        </div>`
          )
          .join("")
      : `<div class="ops-sub">No usage share data.</div>`;

    // Current ops = active bots with their work
    const ops = bots
      .filter((b) => b.status === "active")
      .sort((a, b) => (b.share ?? -1) - (a.share ?? -1))
      .slice(0, 4);
    $("currentOps").innerHTML = ops.length
      ? ops
          .map((b) => {
            const pct = b.share != null ? b.share : 0;
            return `
        <div class="ops-row" data-id="${escapeHtml(b.id)}" style="cursor:pointer">
          <div class="ops-top">
            <span class="ops-name">${escapeHtml(shortName(b.name))}</span>
            <span class="ops-pct">${b.share != null ? b.share + "%" : "—"}</span>
          </div>
          <div class="ops-sub">${escapeHtml(b.work || "—")}</div>
          <div class="bar-track"><div class="bar-fill" style="width:${Math.min(100, pct)}%"></div></div>
        </div>`;
          })
          .join("")
      : `<div class="ops-sub">No active bots right now.</div>`;

    $("currentOps").onclick = (e) => {
      const row = e.target.closest("[data-id]");
      if (!row) return;
      openDrawer(row.getAttribute("data-id"));
    };
  }

  /* ---------- Needs you ---------- */
  function renderNeeds() {
    const items = (state.crew && state.crew.attention) || [];
    $("needsCount").textContent = String(items.length);
    $("attnBadge").textContent = String(items.length);
    $("needsList").innerHTML = items.length
      ? items
          .map((a) => {
            const bot = ((state.crew && state.crew.bots) || []).find(
              (b) =>
                shortName(b.name).toLowerCase().includes(String(a.bot || "").toLowerCase()) ||
                String(a.bot || "").toLowerCase().includes(shortName(b.name).toLowerCase())
            );
            const idAttr = bot ? ` data-id="${escapeHtml(bot.id)}"` : "";
            return `
        <div class="needs-item"${idAttr} style="cursor:${bot ? "pointer" : "default"}">
          <div class="needs-bot">${escapeHtml(a.bot)}</div>
          <div class="needs-text">${escapeHtml(a.item)}</div>
        </div>`;
          })
          .join("")
      : `<div class="ops-sub">Nothing waiting on you.</div>`;

    $("needsList").onclick = (e) => {
      const item = e.target.closest("[data-id]");
      if (!item) return;
      openDrawer(item.getAttribute("data-id"));
    };
  }

  /* ---------- Right now ---------- */
  function renderRightNow() {
    const k = (state.crew && state.crew.kpis) || {};
    const attention = (state.crew && state.crew.attention) || [];
    const alerts = (state.crew && state.crew.alerts) || [];
    const best = attention[0]
      ? `${attention[0].bot}: ${attention[0].item}`
      : alerts[0]
        ? `${alerts[0].bot}: ${alerts[0].message}`
        : "Crew is clear — no blockers.";
    const health = crewHealth(k);
    $("rightNow").innerHTML = `
      <div class="rn-row"><span class="rn-k">Weekly usage</span><span class="rn-v">${k.weeklyUsedPct != null ? k.weeklyUsedPct + "%" : "—"}</span></div>
      <div class="rn-row"><span class="rn-k">Crew health</span><span class="rn-v ${health >= 80 ? "ok" : health >= 60 ? "warn" : "danger"}">${health}%</span></div>
      <div class="rn-row"><span class="rn-k">Blocked</span><span class="rn-v ${k.blocked ? "danger" : "ok"}">${k.blocked ?? "—"}</span></div>
      <div class="rn-row"><span class="rn-k">Needs you</span><span class="rn-v ${k.needsYou ? "warn" : "ok"}">${k.needsYou ?? "—"}</span></div>
      <div class="rn-row"><span class="rn-k">Limit resets</span><span class="rn-v">${escapeHtml(k.resetEt || "—")}</span></div>
      <div class="rn-best">
        <div class="label">BEST NEXT STEP</div>
        <div class="val">${escapeHtml(best)}</div>
      </div>`;
  }

  /* ---------- Roster ---------- */
  function filteredBots() {
    let list = ((state.crew && state.crew.bots) || []).slice();
    const f = state.filter;
    if (f === "active") list = list.filter((b) => b.status === "active");
    if (f === "blocked") list = list.filter((b) => b.status === "blocked");
    if (f === "needs") list = list.filter((b) => b.needs && b.needs !== "—");
    if (f === "quiet") list = list.filter((b) => b.status === "quiet" || b.status === "idle");
    const q = state.query.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (b) =>
          b.name.toLowerCase().includes(q) ||
          (b.role || "").toLowerCase().includes(q) ||
          (b.work || "").toLowerCase().includes(q)
      );
    }
    const rank = (b) => {
      if (b.status === "blocked") return 0;
      if (b.needs && b.needs !== "—") return 1;
      if (b.status === "active") return 2;
      if (b.status === "idle") return 3;
      return 4;
    };
    list.sort((a, b) => rank(a) - rank(b) || (b.share ?? -1) - (a.share ?? -1));
    return list;
  }

  function renderRoster() {
    const bots = filteredBots();
    const all = (state.crew && state.crew.bots) || [];
    $("rosterMeta").textContent = `${bots.length}/${all.length}`;
    $("rosterList").innerHTML = bots
      .map(
        (b) => `
      <li class="roster-item" data-id="${escapeHtml(b.id)}" tabindex="0" role="button" aria-label="${escapeHtml(b.name)}">
        <span class="roster-dot ${escapeHtml(b.status || "quiet")}"></span>
        <span class="roster-name">${escapeHtml(shortName(b.name))}</span>
        <span class="roster-share">${b.share != null ? b.share + "%" : "—"}</span>
      </li>`
      )
      .join("");

    $("rosterList").onclick = (e) => {
      const item = e.target.closest("[data-id]");
      if (!item) return;
      openDrawer(item.getAttribute("data-id"));
    };
    $("rosterList").onkeydown = (e) => {
      if (e.key !== "Enter" && e.key !== " ") return;
      const item = e.target.closest("[data-id]");
      if (!item) return;
      e.preventDefault();
      openDrawer(item.getAttribute("data-id"));
    };
  }

  /* ---------- History chart ---------- */
  function renderHistory() {
    const canvas = $("historyChart");
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const points = (state.history && state.history.points) || [];
    const dpr = window.devicePixelRatio || 1;
    const cssW = canvas.clientWidth || 640;
    const cssH = 160;
    canvas.width = Math.floor(cssW * dpr);
    canvas.height = Math.floor(cssH * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cssW, cssH);

    const pad = { t: 14, r: 12, b: 28, l: 36 };
    const w = cssW - pad.l - pad.r;
    const h = cssH - pad.t - pad.b;

    ctx.strokeStyle = "rgba(0,174,239,0.12)";
    ctx.lineWidth = 1;
    for (let i = 0; i <= 4; i++) {
      const y = pad.t + (h * i) / 4;
      ctx.beginPath();
      ctx.moveTo(pad.l, y);
      ctx.lineTo(pad.l + w, y);
      ctx.stroke();
    }

    if (points.length === 0) {
      ctx.fillStyle = "#6a9bb8";
      ctx.font = "11px Share Tech Mono, monospace";
      ctx.fillText("No history yet.", pad.l, pad.t + h / 2);
      $("historyCaption").textContent = "Waiting for sync";
      return;
    }

    const vals = points.map((p) => Number(p.weeklyUsedPct) || 0);
    const max = Math.max(100, ...vals, 1);
    const n = points.length;
    const xAt = (i) => (n === 1 ? pad.l + w / 2 : pad.l + (w * i) / (n - 1));
    const yAt = (v) => pad.t + h - (h * v) / max;

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
    grad.addColorStop(0, "rgba(0,174,239,0.4)");
    grad.addColorStop(1, "rgba(0,174,239,0.02)");
    ctx.fillStyle = grad;
    ctx.fill();

    ctx.beginPath();
    points.forEach((p, i) => {
      const x = xAt(i);
      const y = yAt(vals[i]);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.strokeStyle = "#00aeef";
    ctx.lineWidth = 2;
    ctx.shadowColor = "rgba(0,174,239,0.6)";
    ctx.shadowBlur = 8;
    ctx.stroke();
    ctx.shadowBlur = 0;

    ctx.fillStyle = "#eaffff";
    ctx.font = "10px Share Tech Mono, monospace";
    points.forEach((p, i) => {
      const x = xAt(i);
      const y = yAt(vals[i]);
      ctx.beginPath();
      ctx.arc(x, y, 3, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#6a9bb8";
      const label = (p.et || "").replace(/^.*,\s*/, "").slice(0, 10);
      ctx.fillText(label, Math.min(x - 16, cssW - 70), pad.t + h + 16);
      ctx.fillStyle = "#00aeef";
      ctx.fillText(`${vals[i]}%`, x - 8, y - 8);
      ctx.fillStyle = "#eaffff";
    });

    const last = points[points.length - 1];
    $("historyCaption").textContent = `${points.length} pts · ${last.weeklyUsedPct}% · A${last.active} B${last.blocked}`;
  }

  /* ---------- Drawer ---------- */
  function openDrawer(id) {
    const bot = ((state.crew && state.crew.bots) || []).find((b) => b.id === id);
    if (!bot) return;
    state.selectedId = id;
    const drawer = $("drawer");
    $("drawerStatus").textContent = statusLabel(bot.status);
    $("drawerStatus").className = `eyebrow status-${bot.status || "quiet"}`;
    $("drawerTitle").textContent = bot.name;
    $("drawerRole").textContent = bot.role || "";
    $("drawerLast").textContent = bot.lastEt || "—";
    $("drawerShare").textContent = bot.share != null ? `${bot.share}%` : "—";
    $("drawerGroup").textContent = (bot.group || "—").toUpperCase();
    $("drawerWork").textContent = bot.work || "—";
    $("drawerNeeds").textContent = bot.needs || "—";
    $("drawerNeeds").style.color =
      bot.needs && bot.needs !== "—" ? "var(--warn)" : "var(--muted)";
    $("drawerRoutines").innerHTML = (bot.routines || [])
      .map((r) => `<li>${escapeHtml(r)}</li>`)
      .join("");
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

  /* ---------- Render all ---------- */
  function renderAll() {
    updateLinkStatus();
    renderOverview();
    renderServices();
    renderSchedule();
    renderAlerts();
    renderCore();
    renderTasks();
    renderNeeds();
    renderRightNow();
    renderRoster();
    renderHistory();
  }

  async function load() {
    try {
      const [crew, history] = await Promise.all([
        fetchJson(CREW_URL),
        fetchJson(HISTORY_URL),
      ]);
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

  function setFilter(f) {
    state.filter = f || "all";
    renderRoster();
    const roster = $("rosterList");
    if (roster) roster.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  function wireDeepLinks() {
    // Talk button
    const talk = $("talkBtn");
    if (talk) {
      talk.setAttribute("href", JARVIS_DEEP_LINK);
      if (talk.tagName !== "A") {
        // keep as button but navigate
        talk.addEventListener("click", (e) => {
          e.preventDefault();
          window.location.href = JARVIS_DEEP_LINK;
        });
      }
    }

    // Waveform as link
    const wf = $("waveform");
    if (wf) {
      wf.setAttribute("role", "link");
      wf.setAttribute("tabindex", "0");
      wf.setAttribute("title", JARVIS_NOTE);
      const go = () => {
        window.location.href = JARVIS_DEEP_LINK;
      };
      wf.addEventListener("click", go);
      wf.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          go();
        }
      });
    }

    // Voice command quick action is wired in HTML as <a>
  }

  function wire() {
    buildWaveform();
    wireDeepLinks();

    const search = $("searchInput");
    if (search) {
      search.addEventListener("input", (e) => {
        state.query = e.target.value;
        renderRoster();
      });
    }

    document.querySelectorAll(".qa-btn[data-filter]").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        // don't hijack real links without data-filter navigation intent
        if (btn.tagName === "A" && btn.getAttribute("href") && !btn.dataset.filter) return;
        if (btn.dataset.filter) {
          e.preventDefault();
          setFilter(btn.dataset.filter);
        }
      });
    });

    const btnBlocked = $("btnFocusBlocked");
    if (btnBlocked) btnBlocked.addEventListener("click", () => setFilter("blocked"));
    const btnNeeds = $("btnFocusNeeds");
    if (btnNeeds) btnNeeds.addEventListener("click", () => setFilter("needs"));

    document.querySelectorAll(".nav-tab").forEach((tab) => {
      tab.addEventListener("click", () => {
        document.querySelectorAll(".nav-tab").forEach((t) => t.classList.remove("active"));
        tab.classList.add("active");
        const view = tab.dataset.view;
        if (view === "alerts") {
          document.querySelector(".alerts-panel")?.scrollIntoView({ behavior: "smooth" });
        } else if (view === "core") {
          document.querySelector(".core-panel")?.scrollIntoView({ behavior: "smooth" });
        } else if (view === "roster") {
          document.querySelector("#rosterList")?.scrollIntoView({ behavior: "smooth" });
        } else {
          window.scrollTo({ top: 0, behavior: "smooth" });
        }
      });
    });

    $("drawerClose").addEventListener("click", closeDrawer);
    $("drawerBackdrop").addEventListener("click", closeDrawer);
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") closeDrawer();
    });
    window.addEventListener("resize", () => renderHistory());
  }

  tickClock();
  setInterval(tickClock, 1000);
  wire();
  load();
  setInterval(load, POLL_MS);

  // expose for debugging
  window.__JARVIS_CC = { state, load, JARVIS_DEEP_LINK, JARVIS_NOTE };
})();
