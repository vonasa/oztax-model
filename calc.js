"use strict";

/*
 * Pure capital-gains-tax calculations — no DOM, no formatting.
 *
 * Works in two environments with no build step and no dependencies:
 *   - Browser: attaches the API to `window.TaxCalc` (loaded via a plain <script>).
 *   - Node:    `module.exports` so tests can `require("./calc.js")`.
 *
 * All rates/returns are DECIMAL fractions here (e.g. 0.08 = 8%, 0.32 = 32%).
 * Percent <-> decimal conversion and any rounding belong to the UI layer.
 */
(function (global) {
  const OLD_DISCOUNT = 0.5; // existing regime: 50% CGT discount on net nominal gain
  const NEW_RATE_FLOOR = 0.3; // new regime: minimum 30% rate on the real gain

  /** Cumulative inflation multiplier over `years`. */
  function inflationFactor(inflation, years) {
    return Math.pow(1 + inflation, years);
  }

  /**
   * Nominal end value of one share.
   * share = { amount, ret, mode } where mode is "annual" | "overall".
   *  - annual:  ret compounds each year      -> amount * (1+ret)^years
   *  - overall: ret is the total over period -> amount * (1+ret)
   */
  function finalValue(share, years) {
    if (share.mode === "annual") {
      return share.amount * Math.pow(1 + share.ret, years);
    }
    return share.amount * (1 + share.ret);
  }

  /**
   * EXISTING regime taxable base: net all nominal gains/losses across the
   * portfolio ("the tally"), floored at zero. The 50% discount is applied to
   * this net before the marginal rate.
   */
  function oldTaxableGain(shares, years) {
    let net = 0;
    for (const s of shares) net += finalValue(s, years) - s.amount;
    return Math.max(0, net);
  }

  /**
   * NEW regime taxable base: per-share, then netted.
   *  - A share that GAINED nominally gets an inflation-indexed cost base
   *    (only the real gain is taxable): final - amount * inflationFactor.
   *  - A share that LOST stays NOMINAL (losses are not indexed) and offsets.
   * The net is floored at zero.
   */
  function newTaxableGain(shares, years, inflation) {
    const F = inflationFactor(inflation, years);
    let net = 0;
    for (const s of shares) {
      const final = finalValue(s, years);
      const nominalGain = final - s.amount;
      net += nominalGain > 0 ? final - s.amount * F : nominalGain;
    }
    return Math.max(0, net);
  }

  function oldTax(shares, years, marginal) {
    return marginal * OLD_DISCOUNT * oldTaxableGain(shares, years);
  }

  function newTax(shares, years, inflation, marginal) {
    const rate = Math.max(marginal, NEW_RATE_FLOOR);
    return rate * newTaxableGain(shares, years, inflation);
  }

  /**
   * After-tax, inflation-adjusted ("real") outcomes for one regime.
   * effectiveTaxRate is the tax as a share of the portfolio's net NOMINAL
   * gain (same denominator for both regimes); null when there is no
   * positive nominal gain to measure against.
   */
  function realOutcomes(totalFinal, totalInvested, tax, F) {
    const afterTaxWealth = totalFinal - tax;
    const realWealth = afterTaxWealth / F;
    const growth = realWealth / totalInvested; // real multiple of capital
    const realReturnTotal = growth - 1;
    const nominalGain = totalFinal - totalInvested;
    const effectiveTaxRate = nominalGain > 0 ? tax / nominalGain : null;
    return { tax, afterTaxWealth, realWealth, realReturnTotal, effectiveTaxRate };
  }

  /**
   * Full comparison for a portfolio.
   * input = { years, inflation, marginal, shares }  (inflation/marginal decimal)
   * returns { F, totalInvested, totalFinal, old:{...}, new:{...} }
   */
  function computeComparison(input) {
    const { years, inflation, marginal, shares } = input;
    const F = inflationFactor(inflation, years);

    let totalInvested = 0;
    let totalFinal = 0;
    for (const s of shares) {
      totalInvested += s.amount;
      totalFinal += finalValue(s, years);
    }

    return {
      F,
      totalInvested,
      totalFinal,
      old: realOutcomes(totalFinal, totalInvested, oldTax(shares, years, marginal), F),
      new: realOutcomes(totalFinal, totalInvested, newTax(shares, years, inflation, marginal), F),
    };
  }

  const api = {
    OLD_DISCOUNT,
    NEW_RATE_FLOOR,
    inflationFactor,
    finalValue,
    oldTaxableGain,
    newTaxableGain,
    oldTax,
    newTax,
    realOutcomes,
    computeComparison,
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api; // Node (tests)
  } else {
    global.TaxCalc = api; // browser
  }
})(typeof globalThis !== "undefined" ? globalThis : this);
