"use strict";

const MIN_ROWS = 1;
const MAX_ROWS = 5;
const START_ROWS = 3;

const sharesEl = document.getElementById("shares");
const rowTemplate = document.getElementById("share-row-template");
const addBtn = document.getElementById("add-share");
const form = document.getElementById("calc-form");
const errorEl = document.getElementById("form-error");
const resultsEl = document.getElementById("results");

/* ---------- Formatting ---------- */
const aud = new Intl.NumberFormat("en-AU", {
  style: "currency",
  currency: "AUD",
  maximumFractionDigits: 0,
});

function fmtMoney(n) {
  return aud.format(Math.round(n));
}

function fmtPct(frac) {
  if (frac === null || !Number.isFinite(frac)) return "n/a";
  return (frac * 100).toFixed(1) + "%";
}

/* ---------- Row management ---------- */
function rowCount() {
  return sharesEl.querySelectorAll(".share-row").length;
}

function syncRowControls() {
  const count = rowCount();
  addBtn.disabled = count >= MAX_ROWS;
  sharesEl.querySelectorAll(".btn-remove").forEach((btn) => {
    btn.disabled = count <= MIN_ROWS;
  });
}

function addRow() {
  if (rowCount() >= MAX_ROWS) return;
  const node = rowTemplate.content.firstElementChild.cloneNode(true);
  sharesEl.appendChild(node);
  syncRowControls();
}

sharesEl.addEventListener("click", (e) => {
  // Remove row
  const remove = e.target.closest(".btn-remove");
  if (remove) {
    if (rowCount() > MIN_ROWS) {
      remove.closest(".share-row").remove();
      syncRowControls();
    }
    return;
  }
  // Segmented Annual/Overall toggle
  const seg = e.target.closest(".seg-btn");
  if (seg) {
    const group = seg.closest(".seg");
    group.querySelectorAll(".seg-btn").forEach((b) => b.classList.remove("is-active"));
    seg.classList.add("is-active");
  }
});

addBtn.addEventListener("click", addRow);

/* ---------- Reading inputs ---------- */
function parseNum(value) {
  if (value === null || String(value).trim() === "") return NaN;
  return Number(value);
}

function readShares() {
  const shares = [];
  sharesEl.querySelectorAll(".share-row").forEach((row) => {
    const amount = parseNum(row.querySelector(".s-amount").value);
    const ret = parseNum(row.querySelector(".s-return").value);
    const mode = row.querySelector(".seg-btn.is-active").dataset.mode; // 'annual' | 'overall'
    const name = row.querySelector(".s-name").value.trim();
    // Only valid rows participate.
    if (Number.isFinite(amount) && amount > 0 && Number.isFinite(ret)) {
      shares.push({ name, amount, ret: ret / 100, mode });
    }
  });
  return shares;
}

/* ---------- Rendering ---------- */
function setDelta(el, oldVal, newVal, kind) {
  // Shows new minus old. For tax ("money_tax" dollars, "pct_tax" effective
  // rate), more tax (positive delta) is "bad" -> red.
  const isMoney = kind === "money" || kind === "money_tax";
  const isTax = kind === "money_tax" || kind === "pct_tax";
  el.classList.remove("pos", "neg");

  // If either side isn't a real number (e.g. the effective tax rate is n/a
  // when there's no nominal gain), there's no meaningful delta to show.
  if (!Number.isFinite(oldVal) || !Number.isFinite(newVal)) {
    el.textContent = "—";
    return;
  }

  // Derive the delta from the SAME rounded values the columns display, so the
  // three numbers in a row always reconcile. Computing it from the raw values
  // (and rounding separately) let "$16" and "$20" show a "+$5" delta.
  const roundForDisplay = isMoney
    ? (v) => Math.round(v) // whole dollars, matching fmtMoney
    : (v) => parseFloat((v * 100).toFixed(1)) / 100; // 0.1%, matching fmtPct
  const diff = roundForDisplay(newVal) - roundForDisplay(oldVal);

  if (diff === 0) {
    el.textContent = "—";
    return;
  }
  const sign = diff > 0 ? "+" : "−";
  const mag = Math.abs(diff);
  let text = sign + (isMoney ? fmtMoney(mag) : fmtPct(mag));
  // The tax-paid delta also shows the relative change ("+$5/+51%"), derived
  // from the same rounded dollars so it reconciles with the columns. Skipped
  // when the old tax rounds to $0 (no base to measure growth from).
  if (kind === "money_tax") {
    const base = roundForDisplay(oldVal);
    if (base > 0) {
      text += "/" + sign + Math.round((mag / base) * 100) + "%";
    }
  }
  el.textContent = text;
  // Higher tax / lower wealth & return under new = unfavourable (red).
  const favourable = isTax ? diff < 0 : diff > 0;
  el.classList.add(favourable ? "pos" : "neg");
}

function render(r) {
  document.getElementById("context-line").textContent =
    `Total invested: ${fmtMoney(r.totalInvested)}  ·  Nominal value after ${
      document.getElementById("years").value
    } years: ${fmtMoney(r.totalFinal)}`;

  document.getElementById("old-tax").textContent = fmtMoney(r.old.tax);
  document.getElementById("new-tax").textContent = fmtMoney(r.new.tax);
  setDelta(document.getElementById("delta-tax"), r.old.tax, r.new.tax, "money_tax");

  document.getElementById("old-eff-tax").textContent = fmtPct(r.old.effectiveTaxRate);
  document.getElementById("new-eff-tax").textContent = fmtPct(r.new.effectiveTaxRate);
  setDelta(
    document.getElementById("delta-eff-tax"),
    r.old.effectiveTaxRate,
    r.new.effectiveTaxRate,
    "pct_tax"
  );

  document.getElementById("old-wealth").textContent = fmtMoney(r.old.realWealth);
  document.getElementById("new-wealth").textContent = fmtMoney(r.new.realWealth);
  setDelta(document.getElementById("delta-wealth"), r.old.realWealth, r.new.realWealth, "money");

  document.getElementById("old-ret-total").textContent = fmtPct(r.old.realReturnTotal);
  document.getElementById("new-ret-total").textContent = fmtPct(r.new.realReturnTotal);
  setDelta(
    document.getElementById("delta-ret-total"),
    r.old.realReturnTotal,
    r.new.realReturnTotal,
    "pct"
  );

  resultsEl.hidden = false;
}

/* ---------- Submit ---------- */
form.addEventListener("submit", (e) => {
  e.preventDefault();
  errorEl.hidden = true;

  const years = Math.floor(parseNum(document.getElementById("years").value));
  const inflation = parseNum(document.getElementById("inflation").value) / 100;
  const marginal = parseNum(document.getElementById("marginal").value) / 100;

  if (!Number.isFinite(years) || years < 1) {
    return showError("Enter a whole number of years (1 or more).");
  }
  if (!Number.isFinite(inflation)) {
    return showError("Enter a valid inflation rate.");
  }

  const shares = readShares();
  if (shares.length === 0) {
    return showError("Add at least one share with an amount invested and a return.");
  }

  const result = TaxCalc.computeComparison({ years, inflation, marginal, shares });
  render(result);
  resultsEl.scrollIntoView({ behavior: "smooth", block: "nearest" });
});

function showError(msg) {
  errorEl.textContent = msg;
  errorEl.hidden = false;
  resultsEl.hidden = true;
}

/* ---------- Init ---------- */
for (let i = 0; i < START_ROWS; i++) addRow();
syncRowControls();
