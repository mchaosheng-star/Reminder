const REMIND_DAYS = [30, 14, 7, 1, 0];
const STORAGE_KEY = "sticker-reminder-v1";
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const KINDS = [
  { key: "plate", label: "Plate sticker", idph: "Plate / registration ID" },
  { key: "city", label: "City sticker", idph: "Account / registration ID" },
];

const $ = (id) => document.getElementById(id);
let installPrompt = null;

function uid() {
  return crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random().toString(16).slice(2);
}

function newSticker(date) {
  return { date, cycleYears: 2, regid: "", pin: "" };
}

function newVehicle(name) {
  return { id: uid(), name: name || "My Vehicle", plate: newSticker("2026-06-30"), city: newSticker("2026-07-15") };
}

function defaultData() {
  return { vehicles: [newVehicle("My Vehicle")], notified: {} };
}

function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultData();
    const d = JSON.parse(raw);
    if (Array.isArray(d.vehicles)) return d;
    if (d.plate || d.city) {
      return {
        vehicles: [{
          id: uid(),
          name: "My Vehicle",
          plate: { ...newSticker("2026-06-30"), ...(d.plate || {}) },
          city: { ...newSticker("2026-07-15"), ...(d.city || {}) },
        }],
        notified: d.notified || {},
      };
    }
    return defaultData();
  } catch {
    return defaultData();
  }
}

let state = load();

function save() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
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

function messageFor(name, days, dateStr) {
  if (days === 0) return `${name} expires today.`;
  if (days === 1) return `${name} expires tomorrow.`;
  return `${name} expires in ${days} days (${dateStr}).`;
}

function advanceDate(dateStr, years) {
  const d = parseDate(dateStr);
  d.setFullYear(d.getFullYear() + years);
  return formatDateInput(d);
}

function el(tag, props = {}, children = []) {
  const node = document.createElement(tag);
  Object.assign(node, props);
  for (const c of [].concat(children)) if (c != null) node.append(c);
  return node;
}

function ensureOption(select, value) {
  if (![...select.options].some((o) => o.value === String(value))) {
    select.append(el("option", { value: String(value), textContent: String(value) }));
  }
}

function buildDateSelect(sticker, onChange) {
  const wrap = el("div", { className: "datesel" });
  const thisYear = new Date().getFullYear();
  const monthSel = el("select", { className: "ds-month" });
  MONTHS.forEach((name, i) => monthSel.append(el("option", { value: String(i + 1), textContent: name })));
  const daySel = el("select", { className: "ds-day" });
  for (let i = 1; i <= 31; i++) daySel.append(el("option", { value: String(i), textContent: String(i) }));
  const yearSel = el("select", { className: "ds-year" });
  for (let i = 0; i < 13; i++) {
    const yy = thisYear + i;
    yearSel.append(el("option", { value: String(yy), textContent: String(yy) }));
  }

  const apply = () => {
    const [y, m, d] = sticker.date.split("-").map(Number);
    ensureOption(yearSel, y);
    yearSel.value = String(y);
    monthSel.value = String(m);
    daySel.value = String(d);
  };

  const update = () => {
    const yr = Number(yearSel.value);
    const mo = Number(monthSel.value);
    const maxDay = new Date(yr, mo, 0).getDate();
    const day = Math.min(Number(daySel.value), maxDay);
    sticker.date = `${yr}-${String(mo).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    onChange();
  };

  [monthSel, daySel, yearSel].forEach((s) => s.addEventListener("change", update));
  wrap.append(monthSel, daySel, yearSel);
  apply();
  return { wrap, refresh: apply };
}

function buildSticker(vehicle, kindDef) {
  const sticker = vehicle[kindDef.key];

  const badge = el("span", { className: "badge" });
  const refreshBadge = () => {
    const { text, cls } = statusText(daysUntil(sticker.date));
    badge.textContent = text;
    badge.className = "badge" + (cls ? ` ${cls}` : "");
  };

  const onChange = () => { save(); refreshBadge(); };

  const dateSel = buildDateSelect(sticker, onChange);

  const cycle = el("select", {}, [
    el("option", { value: "1", textContent: "1 year" }),
    el("option", { value: "2", textContent: "2 years" }),
  ]);
  cycle.value = String(sticker.cycleYears);
  cycle.addEventListener("change", () => { sticker.cycleYears = Number(cycle.value); save(); });

  const regid = el("input", { type: "text", autocomplete: "off", placeholder: kindDef.idph, value: sticker.regid || "" });
  regid.addEventListener("input", () => { sticker.regid = regid.value.trim(); save(); });

  const pin = el("input", { type: "password", autocomplete: "off", inputMode: "numeric", placeholder: "Renewal PIN", value: sticker.pin || "" });
  pin.addEventListener("input", () => { sticker.pin = pin.value.trim(); save(); });
  const reveal = el("button", { type: "button", className: "reveal", textContent: "Show" });
  reveal.addEventListener("click", () => {
    const show = pin.type === "password";
    pin.type = show ? "text" : "password";
    reveal.textContent = show ? "Hide" : "Show";
  });

  const undo = el("button", { type: "button", className: "ghost undo hidden", textContent: "Undo" });
  let prevDate = null;
  const renew = el("button", { type: "button", className: "ghost", textContent: "Renewed today" });
  renew.addEventListener("click", () => {
    const next = advanceDate(formatDateInput(new Date()), sticker.cycleYears);
    if (!confirm(`Renewed today? Next ${kindDef.label} reminder will be ${next}.`)) return;
    prevDate = sticker.date;
    sticker.date = next;
    state.notified = {};
    dateSel.refresh();
    onChange();
    checkReminders(true);
    undo.classList.remove("hidden");
  });
  undo.addEventListener("click", () => {
    if (prevDate == null) return;
    sticker.date = prevDate;
    prevDate = null;
    dateSel.refresh();
    onChange();
    undo.classList.add("hidden");
  });

  refreshBadge();

  return el("div", { className: "sticker" }, [
    el("div", { className: "sticker-head" }, [el("h3", { textContent: kindDef.label }), badge]),
    el("div", { className: "field" }, [el("span", { textContent: "Renewal date" }), dateSel.wrap]),
    el("label", { className: "field" }, [el("span", { textContent: "Renews every" }), cycle]),
    el("label", { className: "field" }, [el("span", { textContent: "Register ID" }), regid]),
    el("label", { className: "field" }, [
      el("span", { textContent: "PIN" }),
      el("div", { className: "secret" }, [pin, reveal]),
    ]),
    el("div", { className: "row" }, [renew, undo]),
  ]);
}

function buildVehicleCard(vehicle) {
  const card = el("section", { className: "card vehicle" });

  const nameInput = el("input", { className: "vname", type: "text", value: vehicle.name, placeholder: "Vehicle name" });
  nameInput.addEventListener("input", () => { vehicle.name = nameInput.value; save(); });

  const del = el("button", { type: "button", className: "del", textContent: "Remove" });
  del.addEventListener("click", () => {
    if (!confirm(`Remove "${vehicle.name}"?`)) return;
    state.vehicles = state.vehicles.filter((v) => v.id !== vehicle.id);
    save();
    card.remove();
  });

  card.append(el("div", { className: "card-head" }, [nameInput, del]));
  for (const kd of KINDS) card.append(buildSticker(vehicle, kd));
  return card;
}

function render() {
  const container = $("vehicles");
  container.innerHTML = "";
  for (const v of state.vehicles) container.append(buildVehicleCard(v));
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

async function checkReminders(force = false) {
  const ok = await ensurePermission();
  if (!ok) return;
  const today = formatDateInput(new Date());
  state.notified = state.notified || {};
  for (const v of state.vehicles) {
    for (const kd of KINDS) {
      const s = v[kd.key];
      const days = daysUntil(s.date);
      if (!REMIND_DAYS.includes(days)) continue;
      const id = `${v.id}-${kd.key}-${days}-${s.date}`;
      if (!force && state.notified[id] === today) continue;
      const body = `${v.name} — ${messageFor(kd.label, days, s.date)}`;
      await showNotification("Sticker Reminder", body, id);
      state.notified[id] = today;
    }
  }
  save();
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
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Sticker Reminder//EN", "CALSCALE:GREGORIAN"];
  for (const v of state.vehicles) {
    for (const kd of KINDS) {
      const s = v[kd.key];
      for (const r of reminderDates(s.date)) {
        const id = `${v.id}-${kd.key}-${r.days}-${s.date}@sticker-reminder`;
        const summary = `${v.name} — ${messageFor(kd.label, r.days, s.date)}`;
        lines.push("BEGIN:VEVENT", `UID:${id}`, `DTSTART:${toIcsDate(r.date)}`, `DTEND:${toIcsDate(new Date(r.date.getTime() + 3600000))}`, `SUMMARY:${summary}`, "END:VEVENT");
      }
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

async function registerSW() {
  if (!("serviceWorker" in navigator)) return;
  try {
    await navigator.serviceWorker.register("./sw.js");
  } catch {}
}

$("add-vehicle").addEventListener("click", () => {
  const v = newVehicle(`Vehicle ${state.vehicles.length + 1}`);
  state.vehicles.push(v);
  save();
  $("vehicles").append(buildVehicleCard(v));
});

$("calendar-btn").addEventListener("click", downloadCalendar);

$("save-btn").addEventListener("click", async () => {
  const ok = await ensurePermission();
  if (!ok) {
    alert("Allow notifications to get reminders.");
    return;
  }
  save();
  await checkReminders(true);
  alert("Saved. Open this app on your phone to get reminders.");
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
  if (document.visibilityState === "visible") checkReminders();
});

(async () => {
  await registerSW();
  render();
  await checkReminders();
  setInterval(() => checkReminders(), 60 * 60 * 1000);
})();
