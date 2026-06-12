# oztax-model — Australian CGT: Old vs New

A small, dependency-free web tool that compares the **capital gains tax (CGT)** you would pay
on a portfolio of shares under **two regimes**, and shows the impact on your **real
(after-tax, inflation-adjusted) return**:

- **Existing regime** — Australia's current **50% CGT discount** on the net *nominal* gain.
- **New regime** — a proposed **indexed-cost-base** model that taxes only the *real* gain,
  with a **30% minimum rate**.

You enter a few assumptions (years held, inflation, marginal rate) and up to five shares, and the
tool reports tax paid (in dollars and as an effective rate on the nominal gain), after-tax real
wealth, and real return side by side, with the difference (Δ = new − old) highlighted.

> **Not advice.** This is an illustrative model, not financial or tax advice, and not a statement
> of enacted law. The "new" regime is the proposed/hypothetical scheme described below — the
> numbers it produces are only as good as the assumptions you feed it.

---

## How the two regimes are modelled

All rates below are decimal fractions internally (e.g. `0.32` = 32%); the UI converts to/from
percentages. The full implementation lives in [calc.js](calc.js).

### Shared building blocks

- **Inflation factor** over the holding period: `F = (1 + inflation) ^ years`.
- **Final (nominal) value** of a share depends on its *return basis*:
  - `annual` — the return compounds each year: `amount × (1 + ret) ^ years`.
  - `overall` — the return is the total over the whole period: `amount × (1 + ret)`.

### Existing regime — 50% discount on the nominal gain

1. Sum every share's **nominal** gain/loss across the whole portfolio (the "tally"),
   floored at zero: `oldGain = max(0, Σ (final − amount))`.
2. Apply the **50% discount**, then the **marginal rate**:
   `oldTax = marginal × 0.5 × oldGain`.

Losses and gains net against each other directly, in nominal dollars.

### New regime — indexed cost base, 30% floor

Taxes only the *real* gain, computed **per share** and then netted:

1. For each share that **gained** nominally, index its cost base by inflation so only the real
   gain is taxable: `final − amount × F`.
2. For each share that **lost**, keep the loss **nominal** (losses are *not* indexed) so it
   offsets gains: `final − amount`.
3. Net across the portfolio, floored at zero: `newGain = max(0, Σ …)`.
4. Apply the rate with a **30% floor**: `newTax = max(marginal, 0.30) × newGain`.

This makes the regime **asymmetric**: winners get inflation relief on their cost base, but losers
do not get their loss inflated — a loss offsets by its smaller nominal amount.

### Real outcomes (both regimes)

After computing tax, the tool deflates everything back to today's dollars:

- After-tax wealth: `totalFinal − tax`
- **Real wealth**: `afterTaxWealth / F`
- **Real return (total)**: `realWealth / totalInvested − 1`
- **Effective tax on nominal gain**: `tax / (totalFinal − totalInvested)` — the tax as a share of
  the portfolio's net *nominal* gain. The denominator is the same for both regimes, so the rates
  are directly comparable (reported as `n/a` when there is no positive nominal gain).

---

## Inputs

**Global assumptions**

| Input | Notes |
|-------|-------|
| Years held | Whole number ≥ 1. The model assumes a single disposal at the end of this period and a holding > 12 months. |
| Avg. annual inflation (%) | Used both to index the new-regime cost base and to deflate results to real dollars. |
| Marginal tax rate | 2025–26 resident brackets including the 2% Medicare levy (0 / 18 / 32 / 39 / 47%). |

**Per share** (1–5 rows)

| Field | Notes |
|-------|-------|
| Name | Optional label (e.g. `CBA`). |
| Amount invested ($) | Must be > 0 for the row to count. |
| Return basis | `Annual` (compounds yearly) or `Overall` (total over the period). |
| Return (%) | May be negative for a loss. |

Rows missing a valid amount or return are silently ignored; you need at least one valid row.

## Outputs

A comparison table with one column per regime plus a **Δ (new − old)** column:

| Row | Meaning |
|-----|---------|
| **Tax paid** | CGT under each regime. The Δ shows the dollar change and the relative change together (e.g. `+$5/+51%`). (More tax under the new regime shows red.) |
| **Effective tax on nominal gain** | Tax as a percentage of the net nominal gain — the same denominator for both regimes. (A higher rate under the new regime shows red.) |
| **After-tax real wealth** | Portfolio value after tax, in today's dollars. |
| **Real return (total)** | Total inflation-adjusted return over the period. |

---

## Worked example

Two $100 shares held **10 years** at **3% inflation**, **32% marginal** rate — share A returns
**+8%/yr**, share B returns **−2%/yr** (this is the `SANITY` portfolio used in the tests):

| Metric | Existing | New | Δ (new − old) |
|--------|---------:|----:|--------------:|
| Tax paid | $15.62 | $20.23 | **+$4.61/+29.5%** |
| Effective tax on nominal gain | 16.00% | 20.72% | **+4.72%** |
| After-tax real wealth | $209.82 | $206.39 | −$3.43 |
| Real return (total) | 4.91% | 3.20% | −1.71% |

*(Total invested $200; nominal value after 10 years $297.60; inflation factor F ≈ 1.34. The table
shows full-precision figures; the app rounds for display, so on screen this reads $16 / $20 /
**+$4/+25%** for tax (the relative change is computed from the rounded dollars, 4/16, so the pair
reconciles), +4.7% for the effective-tax Δ, −$4 for wealth, and −1.7% for the return Δ.)*

Here the new regime is **harsher** — but *not* because of the 30% floor, which isn't even binding at
a 32% marginal rate (`max(32%, 30%) = 32%`). The real driver is the loss of the **50% discount**: the
statutory take doubles from an effective 16% (`32% × 50%`) to 32%, and that outweighs the *smaller*
taxable base that indexation produces (real gain ≈ $63.21 vs nominal gain ≈ $97.60) — which is why
the effective tax on the nominal gain lands at ~20.7% rather than the full 32%. The asymmetric loss treatment
is a secondary effect — share B offsets by only its nominal −$18.29 loss, not a larger indexed one,
which keeps the taxable base higher. The 30% floor only bites for investors **below** the 30% bracket
(see the 0%-bracket case in the tests).

---

## Running it

No build step and no dependencies — it's plain HTML/CSS/JS.

### The web app

Just open [index.html](index.html) in a browser — double-click it, or drag it onto a browser
window. Everything (`calc.js`, `app.js`, `style.css`) loads via relative `<script>`/`<link>` tags,
so it works straight off the filesystem over `file://` with no server.

If you'd rather serve it over HTTP (config in [.claude/launch.json](.claude/launch.json)):

```bash
python3 -m http.server 4178
```

Then open <http://localhost:4178/>.

### The tests

The calculation core has a zero-framework test suite. Run it with Node (exits non-zero on
failure, so it's CI/pre-commit friendly):

```bash
node tests.js
```

---

## Project structure

| File | Role |
|------|------|
| [calc.js](calc.js) | Pure calculation core — no DOM, no formatting. Exports for the browser (`window.TaxCalc`) **and** Node (`module.exports`). This is where the regimes are defined. |
| [app.js](app.js) | UI layer — reads the form, manages share rows, formats currency/percentages, renders the results table. |
| [index.html](index.html) | Markup: assumptions, the shares editor, and the results table. |
| [style.css](style.css) | Styling. |
| [tests.js](tests.js) | Node unit tests for `calc.js`. |

The clean split means the tax logic in `calc.js` can be tested and reused without a browser.

---

## Assumptions & limitations

- Holdings are assumed to be > 12 months with a **single disposal** at the end of the period.
- Marginal rates are 2025–26 resident brackets including the 2% Medicare levy; the model applies a
  **flat** marginal rate to the whole gain rather than walking the brackets.
- The new regime indexes **gains** for inflation but not **losses** (intentional asymmetry).
- Both taxable bases are **floored at zero** (a net portfolio loss produces $0 tax, not a credit).
- This is a comparison model only — it does not account for franking, super, foreign assets, prior
  carried-forward losses, or any other real-world CGT complexity.
