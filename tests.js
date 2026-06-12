"use strict";

/*
 * Unit tests for calc.js — no test framework.
 * Run with:  node tests.js
 * Exits non-zero if any test fails (handy for CI / pre-commit).
 */

const assert = require("node:assert");
const calc = require("./calc.js");

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    passed++;
    console.log("  ✓ " + name);
  } catch (err) {
    failed++;
    console.error("  ✗ " + name);
    console.error("      " + err.message);
  }
}

// Floating-point friendly equality.
function approx(actual, expected, eps, msg) {
  eps = eps == null ? 1e-6 : eps;
  assert.ok(
    Number.isFinite(actual) && Math.abs(actual - expected) <= eps,
    (msg || "value") + ": expected ~" + expected + ", got " + actual
  );
}

// Shared sample portfolio (decimals): $100 each, +8%/yr and -2%/yr, 10y, 3% infl.
const SANITY = {
  years: 10,
  inflation: 0.03,
  marginal: 0.32,
  shares: [
    { name: "A", amount: 100, ret: 0.08, mode: "annual" },
    { name: "B", amount: 100, ret: -0.02, mode: "annual" },
  ],
};

console.log("\ninflationFactor / finalValue");

test("inflationFactor compounds inflation", () => {
  approx(calc.inflationFactor(0.03, 10), 1.343916379, 1e-7);
});

test("inflationFactor is 1 with zero inflation", () => {
  assert.strictEqual(calc.inflationFactor(0, 5), 1);
});

test("finalValue annual compounds the rate", () => {
  approx(calc.finalValue({ amount: 100, ret: 0.08, mode: "annual" }, 10), 215.8924997, 1e-4);
});

test("finalValue overall applies total return once", () => {
  assert.strictEqual(calc.finalValue({ amount: 1000, ret: 0.5, mode: "overall" }, 10), 1500);
});

test("finalValue handles a negative annual return", () => {
  approx(calc.finalValue({ amount: 100, ret: -0.02, mode: "annual" }, 10), 81.70728069, 1e-4);
});

console.log("\nTax formulas — sanity portfolio");

test("old tax = marginal x 50% x net nominal gain", () => {
  approx(calc.oldTax(SANITY.shares, 10, 0.32), 15.61596486, 1e-5);
});

test("new tax = max(marginal,30%) x indexed real gain (losses nominal)", () => {
  approx(calc.newTax(SANITY.shares, 10, 0.03, 0.32), 20.22660559, 1e-5);
});

test("new tax exceeds old tax for this portfolio", () => {
  const r = calc.computeComparison(SANITY);
  assert.ok(r.new.tax > r.old.tax, "expected new > old");
});

console.log("\nReal returns / computeComparison wiring");

test("computeComparison reports real return & effective tax on nominal gain", () => {
  const r = calc.computeComparison(SANITY);
  approx(r.totalInvested, 200, 1e-9, "totalInvested");
  approx(r.old.realReturnTotal, 0.049112, 1e-4, "old total real return");
  // Old regime taxes half the nominal gain at 32% -> exactly 16% of the gain.
  approx(r.old.effectiveTaxRate, 0.16, 1e-9, "old effective tax on nominal gain");
  // New regime: 32% of the indexed base ~= 20.72% of the (larger) nominal gain.
  approx(r.new.effectiveTaxRate, 0.20724, 1e-4, "new effective tax on nominal gain");
  assert.ok(r.new.realWealth < r.old.realWealth, "new real wealth should be lower");
});

console.log("\nNew-regime rules");

test("30% floor: rate is max(marginal, 30%)", () => {
  // Single $100 share doubling (overall +100%), gain = $100.
  const shares = [{ amount: 100, ret: 1.0, mode: "overall" }];
  const base = calc.newTaxableGain(shares, 10, 0.03); // indexed real gain
  // Low bracket clamps UP to 30%.
  approx(calc.newTax(shares, 10, 0.03, 0.18), 0.3 * base, 1e-9, "18% -> 30% floor");
  // High bracket uses the marginal rate.
  approx(calc.newTax(shares, 10, 0.03, 0.45), 0.45 * base, 1e-9, "45% -> marginal");
});

test("losses offset gains but are NOT indexed (asymmetric)", () => {
  const A = { amount: 100, ret: 0.08, mode: "annual" };
  const B = { amount: 100, ret: -0.02, mode: "annual" };
  const baseWinnerOnly = calc.newTaxableGain([A], 10, 0.03);
  const baseWithLoser = calc.newTaxableGain([A, B], 10, 0.03);
  // The loser reduces the taxable base (offset) ...
  assert.ok(baseWithLoser < baseWinnerOnly, "loser should reduce taxable base");
  // ... by its NOMINAL loss (~$18.29), NOT an indexed loss (~$52.68).
  approx(baseWinnerOnly - baseWithLoser, 18.29271931, 1e-6, "offset uses nominal loss");
});

test("0% bracket: old tax is $0 but the 30% floor still applies under new", () => {
  const shares = [{ amount: 100, ret: 1.0, mode: "overall" }];
  assert.strictEqual(calc.oldTax(shares, 10, 0), 0);
  approx(calc.newTax(shares, 10, 0.03, 0), 19.68250862, 1e-5);
});

console.log("\nEdge cases");

test("all-loss portfolio: both taxes floored at $0", () => {
  const shares = [{ amount: 1000, ret: -0.05, mode: "annual" }];
  assert.strictEqual(calc.oldTax(shares, 10, 0.32), 0);
  assert.strictEqual(calc.newTax(shares, 10, 0.03, 0.32), 0);
});

test("effective tax rate is null when there is no positive nominal gain", () => {
  const shares = [{ amount: 1000, ret: -1, mode: "annual" }]; // wiped out -> final 0
  const r = calc.computeComparison({ years: 10, inflation: 0.03, marginal: 0.32, shares });
  assert.strictEqual(r.old.effectiveTaxRate, null);
  assert.strictEqual(r.new.effectiveTaxRate, null);
  approx(r.old.realReturnTotal, -1, 1e-9);
});

console.log("\n" + passed + " passed, " + failed + " failed\n");
process.exit(failed ? 1 : 0);
