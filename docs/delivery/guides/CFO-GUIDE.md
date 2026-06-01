# Flowra CFO Guide

How Flowra computes the numbers a CFO relies on, and where each lives.

## Profitability & tax
- **Formal P&L** (`/api/finance/income-statement`): Revenue − COGS − OpEx → EBITDA →
  EBT → **corporate tax at the system rate (25%)** → Net income. (Was hardcoded 20%.)
- **Corporate tax matrah** is unified across the CFO cockpit and the formal P&L:
  matrah = Revenue − COGS − **deductible** operating expenses only. Non-deductible
  (KKEG) categories — tax, principal, dividend, partner_loan — reduce net profit but
  NOT the tax base (TTK). Both views now agree.
- **COGS** is computed from `sale_item_allocations` (denormalized cost → joined lot
  cost → 0) through one shared, tested kernel. For very large tenants the YTD COGS
  pipeline caps at row limits and **logs a warning** ("COGS likely UNDERSTATED") on
  the CFO metrics and the formal P&L so the figure is never silently wrong.

## Cash, burn, runway
- True cash, distributable cash, monthly burn, runway months, and a 12-month runway
  forecast (`getRunwayForecast`) feed the CFO/Planning views.

## Working capital & analytics
- DIO/DSO/DPO (30-day basis), CCC trend, margin trend, EBITDA bridge, gross-margin
  bridge, revenue forecast (OLS + R²) — all tested pure kernels.

## Partner economics & distributions
- Shareholder economic positions (equity + receivables − liabilities + distribution
  right) now read the real reconciliation contract (were silently 0).
- Dividend declaration enforces TTK 509 (no dividend without distributable profit;
  declared ≤ net income) and TTK 519 (legal reserve) on the primary path.

## Caveats
- Tax figures are management estimates, not a filed return.
- Some commercial analytics (gross-margin bridge, financial ratios) share the same
  high-cap COGS pipeline; truncation there is tracked by `tests/cogs-truncation-inventory.test.ts`.
