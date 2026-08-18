/* ============================================================
   HCM Pay — client-side payment tracker
   NOTE: This is a static site with a client-side login gate only.
   It is NOT real authentication (credentials are visible in this
   file's source). Fine for a private/unlisted link between two
   people, not for anything that needs real security.
   ============================================================ */

const STORAGE_KEY = "hcmpay_km_v2";

// this page is the dashboard — bounce back to login if there's no active session
if (sessionStorage.getItem("hcmpay_authed") !== "1") {
  window.location.href = "index.html";
}
const MS_DAY = 86400000;

/* ---------------- data model ----------------
installment: { id, dueDate (ISO), amountDue, amountPaid, note, history:[{date, amount}] }
------------------------------------------------ */

function todayISO(d = new Date()) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x.toISOString().slice(0, 10);
}

function addDays(iso, days) {
  const d = new Date(iso + "T00:00:00");
  d.setDate(d.getDate() + days);
  return todayISO(d);
}

function nextWednesday(fromISO) {
  const d = new Date(fromISO + "T00:00:00");
  const day = d.getDay(); // 0 Sun ... 3 Wed
  let diff = (3 - day + 7) % 7;
  if (diff === 0) diff = 7;
  d.setDate(d.getDate() + diff);
  return todayISO(d);
}

function fmtMoney(n) {
  return "$" + Math.round(n).toLocaleString("en-AU");
}

function fmtDate(iso) {
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" });
}

function fmtDateShort(iso) {
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString("en-AU", { day: "numeric", month: "short" });
}

function seedData() {
  const today = todayISO();
  const installments = [];

  // This month is an exception to the normal schedule: $2000 total due,
  // split into four specific payments Harish gave explicitly.
  installments.push({
    id: "seed-exception-0",
    dueDate: "2026-08-05",
    amountDue: 300,
    amountPaid: 300,
    note: "This month's exception schedule (1 of 4) — paid earlier in the month",
    history: [{ date: "2026-08-05", amount: 300 }]
  });

  installments.push({
    id: "seed-exception-1",
    dueDate: today,
    amountDue: 1000,
    amountPaid: 1000, // paid today, so marked paid on load
    note: "This month's exception schedule (2 of 4)",
    history: [{ date: today, amount: 1000 }]
  });

  const fri = (() => {
    const d = new Date(today + "T00:00:00");
    const diff = (5 - d.getDay() + 7) % 7; // Friday = 5
    d.setDate(d.getDate() + (diff === 0 ? 7 : diff));
    return todayISO(d);
  })();
  installments.push({
    id: "seed-exception-2",
    dueDate: fri,
    amountDue: 200,
    amountPaid: 0,
    note: "This month's exception schedule (3 of 4)",
    history: []
  });

  const nextWed = nextWednesday(today);
  installments.push({
    id: "seed-exception-3",
    dueDate: nextWed,
    amountDue: 500,
    amountPaid: 0,
    note: "This month's exception schedule (4 of 4)",
    history: []
  });

  // Steady state resumes the Wednesday two weeks after the last exception
  // payment: $1000 every 2 weeks on a Wednesday, for a year.
  let cursor = addDays(nextWed, 14);
  for (let i = 0; i < 26; i++) {
    installments.push({
      id: "seed-recurring-" + i,
      dueDate: cursor,
      amountDue: 1000,
      amountPaid: 0,
      note: "",
      history: []
    });
    cursor = addDays(cursor, 14);
  }

  // Harish's paydays — every 2 weeks from today, for a year.
  const paydays = [];
  let p = today;
  for (let i = 0; i < 26; i++) {
    paydays.push(p);
    p = addDays(p, 14);
  }

  return { installments, paydays, createdAt: today };
}

function loadData() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (raw) {
    try { return JSON.parse(raw); } catch (e) { /* fall through to reseed */ }
  }
  const seeded = seedData();
  saveData(seeded);
  return seeded;
}

function saveData(data) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

/* ---------------- backup / restore (file-based) ----------------
   This is a static site with no server, so there's no shared database.
   Browser storage alone can be cleared or lost, so this gives a real
   way to save the data to an actual file and load it back in —
   on this device or a different one.
------------------------------------------------------------------- */

function downloadBackup() {
  const blob = new Blob([JSON.stringify(DATA, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `hcm-pay-backup-${todayISO()}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function restoreFromFile(file) {
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const parsed = JSON.parse(reader.result);
      if (!parsed.installments || !parsed.paydays) throw new Error("Not a valid HCM Pay backup file");
      DATA = parsed;
      saveData(DATA);
      renderAll();
      alert("Backup restored.");
    } catch (e) {
      alert("Couldn't read that file — make sure it's a HCM Pay backup .json file.");
    }
  };
  reader.readAsText(file);
}

let DATA = loadData();
let ROLE = "payer"; // 'payer' | 'payee'

/* ---------------- derived helpers ---------------- */

function installmentStatus(inst) {
  if (inst.amountPaid <= 0) return "due";
  if (inst.amountPaid < inst.amountDue) return "partial";
  return "paid";
}

function sortedInstallments() {
  return [...DATA.installments].sort((a, b) => a.dueDate.localeCompare(b.dueDate));
}

function currentMonthInstallments() {
  const today = todayISO();
  const ym = today.slice(0, 7);
  return sortedInstallments().filter(i => i.dueDate.slice(0, 7) === ym);
}

function nextUnpaid() {
  return sortedInstallments().find(i => installmentStatus(i) !== "paid");
}

/* ==================== SIGN OUT ==================== */

document.getElementById("backup-btn").addEventListener("click", downloadBackup);
document.getElementById("restore-btn").addEventListener("click", () => {
  document.getElementById("restore-file-input").click();
});
document.getElementById("restore-file-input").addEventListener("change", (e) => {
  const file = e.target.files[0];
  if (file) restoreFromFile(file);
  e.target.value = "";
});

document.getElementById("logout-btn").addEventListener("click", () => {
  sessionStorage.removeItem("hcmpay_authed");
  window.location.href = "index.html";
});

/* ==================== ROLE SWITCH ==================== */

document.getElementById("tab-payer").addEventListener("click", () => setRole("payer"));
document.getElementById("tab-payee").addEventListener("click", () => setRole("payee"));

function setRole(role) {
  ROLE = role;
  document.getElementById("tab-payer").classList.toggle("active", role === "payer");
  document.getElementById("tab-payee").classList.toggle("active", role === "payee");
  renderAll();
}

/* ==================== RENDER: OVERVIEW ==================== */

function renderOverview() {
  const monthInst = currentMonthInstallments();
  const due = monthInst.reduce((s, i) => s + i.amountDue, 0);
  const paid = monthInst.reduce((s, i) => s + i.amountPaid, 0);
  const remaining = Math.max(0, due - paid);

  document.getElementById("ov-due").textContent = fmtMoney(due);
  document.getElementById("ov-paid").textContent = fmtMoney(paid);
  document.getElementById("ov-remaining").textContent = fmtMoney(remaining);

  const next = nextUnpaid();
  if (next) {
    document.getElementById("ov-next").textContent = fmtDateShort(next.dueDate);
    const days = Math.round((new Date(next.dueDate) - new Date(todayISO())) / MS_DAY);
    let label;
    if (days < 0) label = "overdue";
    else if (days === 0) label = "due today";
    else if (days === 1) label = "due tomorrow";
    else label = `in ${days} days`;
    document.getElementById("ov-countdown").textContent = label;
  } else {
    document.getElementById("ov-next").textContent = "All paid";
    document.getElementById("ov-countdown").textContent = "—";
  }

  // tank
  const pct = due > 0 ? Math.min(100, Math.round((paid / due) * 100)) : 0;
  const fill = document.getElementById("tank-fill");
  fill.style.width = pct + "%";
  fill.classList.remove("mid", "full");
  if (pct >= 100) fill.classList.add("full");
  else if (pct >= 40) fill.classList.add("mid");
  document.getElementById("tank-max-label").textContent = fmtMoney(due);
  document.getElementById("tank-caption").textContent =
    due > 0 ? `${fmtMoney(paid)} of ${fmtMoney(due)} paid this month (${pct}%)` : "No amount due set for this month yet";
}

/* ==================== RENDER: SCHEDULE ==================== */

function renderSchedule() {
  const wrap = document.getElementById("schedule-list");
  wrap.innerHTML = "";
  const today = todayISO();
  const yearOut = addDays(today, 365);
  const upcoming = sortedInstallments().filter(i => i.dueDate <= yearOut);

  upcoming.forEach(inst => {
    const status = installmentStatus(inst);
    const row = document.createElement("div");
    row.className = "sched-row";

    const remaining = Math.max(0, inst.amountDue - inst.amountPaid);
    row.innerHTML = `
      <div class="sched-left">
        <span class="sched-status status-${status}"></span>
        <div>
          <div class="sched-date">${fmtDate(inst.dueDate)}</div>
          <div class="sched-amount">${fmtMoney(inst.amountDue)}${status === "partial" ? ` <span style="color:var(--text-faint);font-weight:400;font-size:12px">(${fmtMoney(remaining)} left)</span>` : ""}</div>
          ${inst.note ? `<div class="sched-note">${escapeHtml(inst.note)}</div>` : ""}
        </div>
      </div>
      <div class="sched-right">
        <span class="sched-tag tag-${status}">${status}</span>
      </div>
    `;

    if (ROLE === "payer" && status !== "paid") {
      const btn = document.createElement("button");
      btn.className = "btn btn-secondary btn-sm";
      btn.textContent = "Log payment";
      btn.addEventListener("click", () => openPaymentModal(inst.id));
      row.querySelector(".sched-right").appendChild(btn);
    }

    wrap.appendChild(row);
  });

  document.getElementById("btn-add-extra").parentElement.classList.toggle("payee-hide", false);
}

function escapeHtml(s) {
  const d = document.createElement("div");
  d.textContent = s;
  return d.innerHTML;
}

/* ==================== PAYMENT MODAL ==================== */

let activeInstallmentId = null;
const modalBackdrop = document.getElementById("modal-backdrop");

function openPaymentModal(id) {
  activeInstallmentId = id;
  const inst = DATA.installments.find(i => i.id === id);
  const remaining = Math.max(0, inst.amountDue - inst.amountPaid);
  document.getElementById("modal-title").textContent = "Log a payment";
  document.getElementById("modal-sub").textContent =
    `${fmtDate(inst.dueDate)} · ${fmtMoney(remaining)} remaining of ${fmtMoney(inst.amountDue)}`;
  document.getElementById("modal-amount").value = remaining;
  document.getElementById("modal-amount").max = remaining;
  document.getElementById("modal-reschedule-date").value = "";
  modalBackdrop.hidden = false;
}

document.getElementById("modal-cancel").addEventListener("click", () => modalBackdrop.hidden = true);
modalBackdrop.addEventListener("click", (e) => { if (e.target === modalBackdrop) modalBackdrop.hidden = true; });

document.getElementById("modal-confirm").addEventListener("click", () => {
  const inst = DATA.installments.find(i => i.id === activeInstallmentId);
  if (!inst) return;
  const amt = Number(document.getElementById("modal-amount").value) || 0;
  const remaining = Math.max(0, inst.amountDue - inst.amountPaid);
  const applied = Math.min(amt, remaining);
  if (applied <= 0) { modalBackdrop.hidden = true; return; }

  inst.amountPaid += applied;
  inst.history.push({ date: todayISO(), amount: applied });

  const leftover = remaining - applied;
  const rescheduleDate = document.getElementById("modal-reschedule-date").value;
  if (leftover > 0 && rescheduleDate) {
    DATA.installments.push({
      id: "resched-" + Date.now(),
      dueDate: rescheduleDate,
      amountDue: leftover,
      amountPaid: 0,
      note: `Balance carried over from ${fmtDate(inst.dueDate)}`,
      history: []
    });
    // cap the original installment's due at what was actually expected before reschedule
    inst.amountDue = applied + (inst.amountDue - remaining);
  }

  saveData(DATA);
  modalBackdrop.hidden = true;
  renderAll();
});

/* ==================== ADD EXTRA (payee capability) ==================== */

const extraBackdrop = document.getElementById("modal-backdrop-extra");
document.getElementById("btn-add-extra").addEventListener("click", () => {
  document.getElementById("extra-amount").value = "";
  document.getElementById("extra-date").value = "";
  document.getElementById("extra-note").value = "";
  extraBackdrop.hidden = false;
});
document.getElementById("extra-cancel").addEventListener("click", () => extraBackdrop.hidden = true);
extraBackdrop.addEventListener("click", (e) => { if (e.target === extraBackdrop) extraBackdrop.hidden = true; });

document.getElementById("extra-confirm").addEventListener("click", () => {
  const amount = Number(document.getElementById("extra-amount").value) || 0;
  const date = document.getElementById("extra-date").value;
  const note = document.getElementById("extra-note").value.trim();
  if (amount <= 0 || !date) { extraBackdrop.hidden = true; return; }

  DATA.installments.push({
    id: "extra-" + Date.now(),
    dueDate: date,
    amountDue: amount,
    amountPaid: 0,
    note: note || "Extra amount added",
    history: []
  });
  saveData(DATA);
  extraBackdrop.hidden = true;
  renderAll();
});

/* ==================== RENDER: PAYDAYS ==================== */

function renderPaydays() {
  const wrap = document.getElementById("payday-list");
  wrap.innerHTML = "";
  const today = todayISO();
  DATA.paydays.slice(0, 12).forEach((p, idx) => {
    const row = document.createElement("div");
    row.className = "payday-row" + (idx === 0 ? " soon" : "");
    row.innerHTML = `<span class="payday-date">${fmtDate(p)}</span><span class="payday-tag">${idx === 0 ? "next" : "+" + idx * 2 + "w"}</span>`;
    wrap.appendChild(row);
  });
}

/* ==================== RENDER: HISTORY CHART ==================== */

function renderHistoryChart() {
  const canvas = document.getElementById("history-chart");
  const ctx = canvas.getContext("2d");
  const W = canvas.width, H = canvas.height;
  ctx.clearRect(0, 0, W, H);

  // build last 6 months totals
  const today = new Date(todayISO() + "T00:00:00");
  const months = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(today.getFullYear(), today.getMonth() - i, 1);
    months.push({ ym: d.toISOString().slice(0, 7), label: d.toLocaleDateString("en-AU", { month: "short" }) });
  }
  const totals = months.map(m => {
    return DATA.installments
      .filter(i => i.dueDate.slice(0, 7) === m.ym)
      .reduce((s, i) => s + i.amountPaid, 0);
  });
  const max = Math.max(1000, ...totals);

  const padL = 40, padB = 26, padT = 14, padR = 14;
  const w = W - padL - padR, h = H - padT - padB;

  // grid lines
  ctx.strokeStyle = "#1D1E33";
  ctx.lineWidth = 1;
  for (let g = 0; g <= 3; g++) {
    const y = padT + (h / 3) * g;
    ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(W - padR, y); ctx.stroke();
  }

  // line path
  const pts = totals.map((t, i) => {
    const x = padL + (w / (totals.length - 1)) * i;
    const y = padT + h - (t / max) * h;
    return [x, y];
  });

  const grad = ctx.createLinearGradient(0, padT, 0, padT + h);
  grad.addColorStop(0, "rgba(124,121,255,.35)");
  grad.addColorStop(1, "rgba(124,121,255,0)");
  ctx.beginPath();
  ctx.moveTo(pts[0][0], padT + h);
  pts.forEach(p => ctx.lineTo(p[0], p[1]));
  ctx.lineTo(pts[pts.length - 1][0], padT + h);
  ctx.closePath();
  ctx.fillStyle = grad;
  ctx.fill();

  ctx.beginPath();
  ctx.strokeStyle = "#7C79FF";
  ctx.lineWidth = 2.5;
  pts.forEach((p, i) => i === 0 ? ctx.moveTo(p[0], p[1]) : ctx.lineTo(p[0], p[1]));
  ctx.stroke();

  pts.forEach(p => {
    ctx.beginPath(); ctx.arc(p[0], p[1], 3.5, 0, Math.PI * 2);
    ctx.fillStyle = "#0A0B14"; ctx.fill();
    ctx.lineWidth = 2; ctx.strokeStyle = "#7C79FF"; ctx.stroke();
  });

  // labels
  ctx.fillStyle = "#5C5F7E";
  ctx.font = "11px Inter, sans-serif";
  ctx.textAlign = "center";
  months.forEach((m, i) => ctx.fillText(m.label, pts[i][0], H - 8));
  ctx.textAlign = "right";
  ctx.fillText(fmtMoney(max), padL - 6, padT + 4);
  ctx.fillText("$0", padL - 6, padT + h + 4);
}

/* ==================== RENDER: CALENDAR HEATMAP ==================== */

function renderCalendar() {
  const grid = document.getElementById("cal-grid");
  grid.innerHTML = "";
  const today = new Date(todayISO() + "T00:00:00");
  const year = today.getFullYear(), month = today.getMonth();
  document.getElementById("cal-month-label").textContent =
    today.toLocaleDateString("en-AU", { month: "long", year: "numeric" });

  ["S", "M", "T", "W", "T", "F", "S"].forEach(d => {
    const el = document.createElement("div");
    el.className = "cal-dow";
    el.textContent = d;
    grid.appendChild(el);
  });

  const firstDow = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const byDate = {};
  DATA.installments.forEach(i => {
    if (i.dueDate.slice(0, 7) === todayISO().slice(0, 7)) {
      byDate[i.dueDate] = installmentStatus(i);
    }
  });

  for (let i = 0; i < firstDow; i++) {
    const el = document.createElement("div");
    el.className = "cal-cell empty";
    grid.appendChild(el);
  }
  for (let d = 1; d <= daysInMonth; d++) {
    const iso = todayISO(new Date(year, month, d));
    const el = document.createElement("div");
    const status = byDate[iso];
    el.className = "cal-cell" + (status ? " " + status : "");
    el.textContent = d;
    grid.appendChild(el);
  }
}

/* ==================== GAME: Coin Run ==================== */

let gameOn = false;
let coins = [];
let gameCoinQueue = [];

document.getElementById("game-toggle").addEventListener("click", () => {
  const area = document.getElementById("game-area");
  gameOn = !gameOn;
  area.hidden = !gameOn;
  document.getElementById("game-toggle").textContent = gameOn ? "Stop" : "Play";
  if (gameOn) startGame();
});

function buildQueue() {
  const monthInst = currentMonthInstallments().filter(i => installmentStatus(i) !== "paid");
  gameCoinQueue = monthInst.length
    ? monthInst.map(i => ({ amount: Math.max(0, i.amountDue - i.amountPaid), date: i.dueDate }))
    : [{ amount: 0, date: null }];
}

function startGame() {
  buildQueue();
  coins = [];
  spawnCoin();
  requestAnimationFrame(gameLoop);
}

const gcanvas = document.getElementById("game-canvas");
const gctx = gcanvas.getContext("2d");
const MASCOT = "🪙"; // neutral coin-collector mascot, no character sprite needed

function spawnCoin() {
  if (!gameCoinQueue.length) return;
  const next = gameCoinQueue.shift();
  coins.push({
    x: 60 + Math.random() * (gcanvas.width - 120),
    y: gcanvas.height + 30,
    vy: -1.1 - Math.random() * 0.6,
    r: 26,
    amount: next.amount,
    date: next.date,
    popped: false,
    popT: 0
  });
}

gcanvas.addEventListener("click", (e) => {
  const rect = gcanvas.getBoundingClientRect();
  const x = (e.clientX - rect.left) * (gcanvas.width / rect.width);
  const y = (e.clientY - rect.top) * (gcanvas.height / rect.height);
  coins.forEach(c => {
    if (!c.popped && Math.hypot(c.x - x, c.y - y) < c.r + 6) {
      c.popped = true;
      c.popT = 40;
      const label = c.date ? `${fmtMoney(c.amount)} due ${fmtDateShort(c.date)}` : "All caught up this month!";
      document.getElementById("game-reveal").textContent = label;
      setTimeout(() => { if (gameOn) spawnCoin(); }, 550);
    }
  });
});

function gameLoop() {
  if (!gameOn) return;
  gctx.clearRect(0, 0, gcanvas.width, gcanvas.height);

  coins.forEach(c => {
    if (!c.popped) {
      c.y += c.vy;
      if (c.y < -40) c.y = gcanvas.height + 30;
    } else {
      c.popT -= 1;
      c.r += 0.6;
    }
    gctx.save();
    gctx.globalAlpha = c.popped ? Math.max(0, c.popT / 40) : 1;
    gctx.beginPath();
    gctx.arc(c.x, c.y, c.r, 0, Math.PI * 2);
    const grad = gctx.createRadialGradient(c.x - 8, c.y - 8, 2, c.x, c.y, c.r);
    grad.addColorStop(0, "#FFE9A8");
    grad.addColorStop(1, "#E8AC2E");
    gctx.fillStyle = grad;
    gctx.fill();
    gctx.lineWidth = 2;
    gctx.strokeStyle = "#B8801A";
    gctx.stroke();
    gctx.fillStyle = "#5C3D0A";
    gctx.font = "bold 13px Inter, sans-serif";
    gctx.textAlign = "center";
    gctx.textBaseline = "middle";
    gctx.fillText("$", c.x, c.y);
    gctx.restore();
  });

  coins = coins.filter(c => !(c.popped && c.popT <= 0));
  requestAnimationFrame(gameLoop);
}

/* ==================== RENDER ALL ==================== */

function renderAll() {
  document.querySelectorAll(".payer-only").forEach(el => {
    el.style.display = ROLE === "payer" ? "" : "none";
  });
  // payee can still add extra amounts due — keep visible for both roles
  document.getElementById("btn-add-extra").parentElement.style.display = "";

  renderOverview();
  renderSchedule();
  renderPaydays();
  renderHistoryChart();
  renderCalendar();
}

renderAll();
