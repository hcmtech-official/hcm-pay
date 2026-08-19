/* ============================================================
   HCM Pay — client-side payment tracker
   NOTE: This is a static site with a client-side login gate only.
   It is NOT real authentication (credentials are visible in this
   file's source). Fine for a private/unlisted link between two
   people, not for anything that needs real security.
   ============================================================ */

const STORAGE_KEY = "hcmpay_km_v4";

// this page is the dashboard — bounce back to login if there's no active session
if (sessionStorage.getItem("hcmpay_authed") !== "1") {
  window.location.href = "index.html";
}
const MS_DAY = 86400000;

/* ---------------- data model ----------------
installment: { id, dueDate (ISO), amountDue, amountPaid, note, history:[{date, amount}] }
------------------------------------------------ */

function todayISO(d = new Date()) {
  // Reads the LOCAL calendar date (what the user actually perceives as "today")
  // and formats it directly — no UTC conversion, so no timezone-driven drift.
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function addDays(iso, days) {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, "0")}-${String(dt.getUTCDate()).padStart(2, "0")}`;
}

function nextWednesday(fromISO) {
  const [y, m, d] = fromISO.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  const day = dt.getUTCDay(); // 0 Sun ... 3 Wed
  let diff = (3 - day + 7) % 7;
  if (diff === 0) diff = 7;
  dt.setUTCDate(dt.getUTCDate() + diff);
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, "0")}-${String(dt.getUTCDate()).padStart(2, "0")}`;
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

document.getElementById("ov-next-card").addEventListener("click", () => {
  const card = document.getElementById("ov-next-card");
  const targetId = card.dataset.targetId;
  if (!targetId) return;
  const row = document.querySelector(`.sched-row[data-inst-id="${targetId}"]`);
  if (!row) return;
  row.scrollIntoView({ behavior: "smooth", block: "center" });
  row.classList.remove("flash");
  // restart the animation even if it was already played
  void row.offsetWidth;
  row.classList.add("flash");
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
  const nextCard = document.getElementById("ov-next-card");
  if (next) {
    document.getElementById("ov-next").textContent = fmtDateShort(next.dueDate);
    const days = Math.round((new Date(next.dueDate) - new Date(todayISO())) / MS_DAY);
    let label;
    if (days < 0) label = "overdue";
    else if (days === 0) label = "due today";
    else if (days === 1) label = "due tomorrow";
    else label = `in ${days} days`;
    document.getElementById("ov-countdown").textContent = label;
    nextCard.dataset.targetId = next.id;
    nextCard.title = `Tap to see this in the schedule below`;
  } else {
    document.getElementById("ov-next").textContent = "All paid";
    document.getElementById("ov-countdown").textContent = "—";
    delete nextCard.dataset.targetId;
    nextCard.title = "";
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
    row.dataset.instId = inst.id;

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

  // Start from the month this tracker actually began, run forward.
  // Stacked bar chart: each bar is a month's TOTAL amount due, with the
  // paid portion filled green from the bottom and whatever's left in red
  // stacked on top — so you can see at a glance how full each month is.
  const [startY, startM] = (DATA.createdAt || todayISO()).split("-").map(Number);
  const MONTH_SPAN = 8;
  const months = [];
  for (let i = 0; i < MONTH_SPAN; i++) {
    const totalMonthIndex = (startM - 1) + i;
    const y = startY + Math.floor(totalMonthIndex / 12);
    const m = (totalMonthIndex % 12) + 1;
    const ym = `${y}-${String(m).padStart(2, "0")}`;
    const label = new Date(y, m - 1, 1).toLocaleDateString("en-AU", { month: "short" });
    months.push({ ym, label });
  }
  const monthTotals = months.map(m => {
    const insts = DATA.installments.filter(i => i.dueDate.slice(0, 7) === m.ym);
    const due = insts.reduce((s, i) => s + i.amountDue, 0);
    const paid = insts.reduce((s, i) => s + i.amountPaid, 0);
    return { due, paid, remaining: Math.max(0, due - paid) };
  });
  const max = Math.max(1000, ...monthTotals.map(t => t.due));

  const padL = 44, padB = 26, padT = 34, padR = 14;
  const w = W - padL - padR, h = H - padT - padB;

  ctx.fillStyle = "#F1F1F8";
  ctx.font = "600 12px Inter, sans-serif";
  ctx.textAlign = "left";
  ctx.fillText("Amount due, by month — green = paid, red = remaining", padL - 2, 18);

  ctx.strokeStyle = "#1D1E33";
  ctx.lineWidth = 1;
  for (let g = 0; g <= 3; g++) {
    const y = padT + (h / 3) * g;
    ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(W - padR, y); ctx.stroke();
  }

  const barGap = 10;
  const barW = Math.min(46, (w / months.length) - barGap);
  const slot = w / months.length;

  monthTotals.forEach((t, i) => {
    const cx = padL + slot * i + slot / 2;
    const barX = cx - barW / 2;
    const dueH = (t.due / max) * h;
    const paidH = (t.paid / max) * h;
    const remH = (t.remaining / max) * h;
    const barTopY = padT + h - dueH;

    // background track for the full bar (subtle, shows the bar exists even at $0)
    ctx.fillStyle = "#1A1B2E";
    ctx.beginPath();
    roundRectPath(ctx, barX, padT + h - Math.max(dueH, 2), barW, Math.max(dueH, 2), 6);
    ctx.fill();

    // red (remaining/unpaid) portion — stacked on top
    if (t.remaining > 0) {
      ctx.fillStyle = "#FF5C5C";
      ctx.beginPath();
      roundRectPath(ctx, barX, barTopY, barW, remH, 6, t.paid === 0);
      ctx.fill();
    }

    // green (paid) portion — stacked at the bottom
    if (t.paid > 0) {
      ctx.fillStyle = "#33D69F";
      ctx.beginPath();
      roundRectPath(ctx, barX, padT + h - paidH, barW, paidH, 6, t.remaining === 0);
      ctx.fill();
    }

    // dollar label above the bar
    if (t.due > 0) {
      ctx.fillStyle = "#C7C9E0";
      ctx.font = "600 10px Inter, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(fmtMoney(t.due), cx, Math.max(barTopY - 8, padT + 10));
    }

    // month label below
    ctx.fillStyle = "#5C5F7E";
    ctx.font = "11px Inter, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(months[i].label, cx, H - 8);
  });

  ctx.fillStyle = "#5C5F7E";
  ctx.font = "11px Inter, sans-serif";
  ctx.textAlign = "right";
  ctx.fillText(fmtMoney(max), padL - 6, padT + 4);
  ctx.fillText("$0", padL - 6, padT + h + 4);
}

// Rounds only the top corners by default (bar grows from the bottom);
// pass roundBottomToo=true for a bar that isn't stacked under anything else.
function roundRectPath(ctx, x, y, width, height, radius, roundBottomToo) {
  const r = Math.min(radius, width / 2, height / 2 <= 0 ? 0 : height / 2);
  if (height <= 0) return;
  const rTop = r;
  const rBot = roundBottomToo ? r : 0;
  ctx.moveTo(x, y + rTop);
  ctx.arcTo(x, y, x + rTop, y, rTop);
  ctx.lineTo(x + width - rTop, y);
  ctx.arcTo(x + width, y, x + width, y + rTop, rTop);
  ctx.lineTo(x + width, y + height - rBot);
  ctx.arcTo(x + width, y + height, x + width - rBot, y + height, rBot);
  ctx.lineTo(x + rBot, y + height);
  ctx.arcTo(x, y + height, x, y + height - rBot, rBot);
  ctx.closePath();
}

/* ==================== RENDER: CALENDAR HEATMAP ==================== */

let calMonthOffset = 0; // 0 = current real month; +1 = next month, -1 = previous, etc.

function calDisplayedYearMonth() {
  const today = new Date(todayISO() + "T00:00:00");
  const d = new Date(today.getFullYear(), today.getMonth() + calMonthOffset, 1);
  return { year: d.getFullYear(), month: d.getMonth() };
}

function renderCalendar() {
  const grid = document.getElementById("cal-grid");
  grid.innerHTML = "";
  const { year, month } = calDisplayedYearMonth();
  document.getElementById("cal-month-label").textContent =
    new Date(year, month, 1).toLocaleDateString("en-AU", { month: "long", year: "numeric" });

  ["S", "M", "T", "W", "T", "F", "S"].forEach(d => {
    const el = document.createElement("div");
    el.className = "cal-dow";
    el.textContent = d;
    grid.appendChild(el);
  });

  const firstDow = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const ym = `${year}-${String(month + 1).padStart(2, "0")}`;

  const byDate = {};
  DATA.installments.forEach(i => {
    if (i.dueDate.slice(0, 7) === ym) {
      byDate[i.dueDate] = i;
    }
  });

  for (let i = 0; i < firstDow; i++) {
    const el = document.createElement("div");
    el.className = "cal-cell empty";
    grid.appendChild(el);
  }
  for (let d = 1; d <= daysInMonth; d++) {
    const iso = `${year}-${String(month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    const el = document.createElement("div");
    const inst = byDate[iso];
    const status = inst ? installmentStatus(inst) : null;
    el.className = "cal-cell" + (status ? " " + status : "");
    el.textContent = d;

    if (inst) {
      const remaining = Math.max(0, inst.amountDue - inst.amountPaid);
      el.title = status === "paid"
        ? `${fmtMoney(inst.amountPaid)} paid on ${fmtDate(iso)}`
        : `${fmtMoney(remaining)} due ${fmtDate(iso)}${status === "partial" ? ` (${fmtMoney(inst.amountPaid)} already paid)` : ""}`;

      if (status !== "paid" && ROLE === "payer") {
        el.addEventListener("click", () => openPaymentModal(inst.id));
      } else {
        el.addEventListener("click", () => alert(el.title));
      }
    }
    grid.appendChild(el);
  }
}

document.getElementById("cal-prev").addEventListener("click", () => {
  calMonthOffset -= 1;
  renderCalendar();
});
document.getElementById("cal-next").addEventListener("click", () => {
  calMonthOffset += 1;
  renderCalendar();
});

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
