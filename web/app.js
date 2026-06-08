const REMIND_DAYS = [30, 14, 7, 1, 0];
const STORAGE_KEY = "sticker-reminder-v1";

const $ = (id) => document.getElementById(id);

const fields = {
  plate: { month: $("plate-month"), day: $("plate-day"), year: $("plate-year"), cycle: $("plate-cycle"), status: $("plate-status"), regid: $("plate-regid"), pin: $("plate-pin"), name: "Plate sticker" },
  city: { month: $("city-month"), day: $("city-day"), year: $("city-year"), cycle: $("city-cycle"), status: $("city-status"), regid: $("city-regid"), pin: $("city-pin"), name: "City sticker" },
};

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function buildDateSelectors() {
  const thisYear = new Date().getFullYear();
  for (const key of ["plate", "city"]) {
    const f = fields[key];
    f.month.innerHTML = MONTHS.map((m, i) => `<option value="${i + 1}">${m}</option>`).join("");
    f.day.innerHTML = Array.from({ length: 31 }, (_, i) => `<option value="${i + 1}">${i + 1}</option>`).join("");
    f.year.innerHTML = Array.from({ length: 13 }, (_, i) => {
      const y = thisYear + i;
      return `<option value="${y}">${y}</option>`;
    }).join("");
  }
}

function getDate(key) {
  const f = fields[key];
  const y = Number(f.year.value);
  const m = String(Number(f.month.value)).padStart(2, "0");
  const maxDay = new Date(y, Number(f.month.value), 0).getDate();
  const d = String(Math.min(Number(f.day.value), maxDay)).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function setDate(key, dateStr) {
  const f = fields[key];
  const [y, m, d] = dateStr.split("-").map(Number);
  f.year.value = String(y);
  f.month.value = String(m);
  f.day.value = String(d);
}

let installPrompt = null;

function defaultData() {
  return {
    plate: { date: "2026-06-30", cycleYears: 2, regid: "", pin: "" },
    city: { date: "2026-07-15", cycleYears: 2, regid: "", pin: "" },
    notified: {},
  };
}

function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? { ...defaultData(), ...JSON.parse(raw) } : defaultData();
  } catch {
    return defaultData();
  }
}

function save(data) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

function parseDate(str) {
  const [y, m, d] = str.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function formatDateInput(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function daysUntil(dateStr) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = parseDate(dateStr);
  target.setHours(0, 0, 0, 0);
  return Math.round((target - today) / 86400000);
}

function statusText(days) {
  if (days < 0) return { text: "Expired", cls: "danger" };
  if (days === 0) return { text: "Due today", cls: "danger" };
  if (days <= 7) return { text: `${days}d left`, cls: "warn" };
  return { text: `${days}d left`, cls: "" };
}

function updateStatus(key, dateStr) {
  const { status } = fields[key];
  const { text, cls } = statusText(daysUntil(dateStr));
  status.textContent = text;
  status.className = "badge" + (cls ? ` ${cls}` : "");
}

function readForm() {
  return {
    plate: {
      date: getDate("plate"),
      cycleYears: Number(fields.plate.cycle.value),
      regid: fields.plate.regid.value.trim(),
      pin: fields.plate.pin.value.trim(),
    },
    city: {
      date: getDate("city"),
      cycleYears: Number(fields.city.cycle.value),
      regid: fields.city.regid.value.trim(),
      pin: fields.city.pin.value.trim(),
    },
    notified: load().notified || {},
  };
}

function writeForm(data) {
  setDate("plate", data.plate.date);
  fields.plate.cycle.value = String(data.plate.cycleYears);
  fields.plate.regid.value = data.plate.regid || "";
  fields.plate.pin.value = data.plate.pin || "";
  setDate("city", data.city.date);
  fields.city.cycle.value = String(data.city.cycleYears);
  fields.city.regid.value = data.city.regid || "";
  fields.city.pin.value = data.city.pin || "";
  updateStatus("plate", data.plate.date);
  updateStatus("city", data.city.date);
}

function messageFor(name, days, dateStr) {
  if (days === 0) return `${name} expires today.`;
  if (days === 1) return `${name} expires tomorrow.`;
  return `${name} expires in ${days} days (${dateStr}).`;
}

async function ensurePermission() {
  if (!("Notification" in window)) return false;
  if (Notification.permission === "granted") return true;
  if (Notification.permission === "denied") return false;
  return (await Notification.requestPermission()) === "granted";
}

async function showNotification(title, body, tag) {
  if (Notification.permission !== "granted") return;
  const reg = await navigator.serviceWorker.ready;
  if (reg?.active) {
    reg.active.postMessage({ type: "notify", title, body, tag });
    return;
  }
  new Notification(title, { body, tag, icon: "./icon.svg" });
}

function todayKey() {
  return formatDateInput(new Date());
}

async function checkReminders(data, forceNotify = false) {
  const ok = await ensurePermission();
  if (!ok) return;

  const notified = { ...data.notified };
  const today = todayKey();

  for (const key of ["plate", "city"]) {
    const item = data[key];
    const days = daysUntil(item.date);
    if (!REMIND_DAYS.includes(days)) continue;

    const notifyId = `${key}-${days}-${item.date}`;
    if (!forceNotify && notified[notifyId] === today) continue;

    const body = messageFor(fields[key].name, days, item.date);
    await showNotification("Sticker Reminder", body, notifyId);
    notified[notifyId] = today;
  }

  data.notified = notified;
  save(data);
}

function reminderDates(dateStr) {
  const renewal = parseDate(dateStr);
  return REMIND_DAYS.map((days) => {
    const d = new Date(renewal);
    d.setDate(d.getDate() - days);
    d.setHours(9, 0, 0, 0);
    return { days, date: d };
  }).filter((r) => r.date > new Date());
}

function toIcsDate(date) {
  const p = (n) => String(n).padStart(2, "0");
  return `${date.getFullYear()}${p(date.getMonth() + 1)}${p(date.getDate())}T${p(date.getHours())}${p(date.getMinutes())}00`;
}

function downloadCalendar() {
  const data = readForm();
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Sticker Reminder//EN",
    "CALSCALE:GREGORIAN",
  ];

  for (const key of ["plate", "city"]) {
    const item = data[key];
    for (const r of reminderDates(item.date)) {
      const uid = `${key}-${r.days}-${item.date}@sticker-reminder`;
      const summary = messageFor(fields[key].name, r.days, item.date);
      const start = toIcsDate(r.date);
      const end = toIcsDate(new Date(r.date.getTime() + 3600000));
      lines.push("BEGIN:VEVENT", `UID:${uid}`, `DTSTART:${start}`, `DTEND:${end}`, `SUMMARY:${summary}`, "END:VEVENT");
    }
  }

  lines.push("END:VCALENDAR");
  const blob = new Blob([lines.join("\r\n")], { type: "text/calendar" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "sticker-reminders.ics";
  a.click();
  URL.revokeObjectURL(a.href);
}

function advanceDate(dateStr, years) {
  const d = parseDate(dateStr);
  d.setFullYear(d.getFullYear() + years);
  return formatDateInput(d);
}

let lastRenew = null;

function markRenewed(key) {
  const data = readForm();
  const years = data[key].cycleYears;
  const newDate = advanceDate(formatDateInput(new Date()), years);
  if (!confirm(`Renewed today? Next ${fields[key].name} reminder will be ${newDate}.`)) return;
  lastRenew = { key, prevDate: data[key].date };
  data[key].date = newDate;
  data.notified = {};
  writeForm(data);
  save(data);
  checkReminders(data, true);
  $(`${key}-undo`).classList.remove("hidden");
}

function undoRenew(key) {
  if (!lastRenew || lastRenew.key !== key) return;
  const data = readForm();
  data[key].date = lastRenew.prevDate;
  data.notified = {};
  writeForm(data);
  save(data);
  lastRenew = null;
  $(`${key}-undo`).classList.add("hidden");
}

async function registerSW() {
  if (!("serviceWorker" in navigator)) return;
  try {
    await navigator.serviceWorker.register("./sw.js");
  } catch {}
}

$("calendar-btn").addEventListener("click", downloadCalendar);

$("save-btn").addEventListener("click", async () => {
  const ok = await ensurePermission();
  if (!ok) {
    alert("Allow notifications to get reminders.");
    return;
  }
  const data = readForm();
  save(data);
  updateStatus("plate", data.plate.date);
  updateStatus("city", data.city.date);
  await checkReminders(data, true);
  alert("Saved. Open this app on your phone to get reminders.");
});

document.querySelectorAll("[data-renew]").forEach((btn) => {
  btn.addEventListener("click", () => markRenewed(btn.dataset.renew));
});

document.querySelectorAll("[data-undo]").forEach((btn) => {
  btn.addEventListener("click", () => undoRenew(btn.dataset.undo));
});

document.querySelectorAll("[data-reveal]").forEach((btn) => {
  btn.addEventListener("click", () => {
    const input = $(btn.dataset.reveal);
    const show = input.type === "password";
    input.type = show ? "text" : "password";
    btn.textContent = show ? "Hide" : "Show";
  });
});

["plate", "city"].forEach((key) => {
  ["month", "day", "year"].forEach((part) => {
    fields[key][part].addEventListener("change", () => {
      updateStatus(key, getDate(key));
    });
  });
});

window.addEventListener("beforeinstallprompt", (e) => {
  e.preventDefault();
  installPrompt = e;
  $("install-btn").classList.remove("hidden");
});

$("install-btn").addEventListener("click", async () => {
  if (!installPrompt) return;
  installPrompt.prompt();
  await installPrompt.userChoice;
  installPrompt = null;
  $("install-btn").classList.add("hidden");
});

if (/iPhone|iPad|iPod/i.test(navigator.userAgent) && !window.navigator.standalone) {
  $("ios-hint").classList.remove("hidden");
}

document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") checkReminders(load());
});

(async () => {
  await registerSW();
  buildDateSelectors();
  const data = load();
  writeForm(data);
  await checkReminders(data);
  setInterval(() => checkReminders(load()), 60 * 60 * 1000);
})();
