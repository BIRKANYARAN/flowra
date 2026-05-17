// ── /api/simulation/unit-profit ──────────────────────────────────────────────
// Canonical namespace for the unit-profit simulation endpoint.
// Re-exports the implementation from /api/simulate for backwards compatibility.
// All new callers should use /api/simulation/unit-profit.

export { dynamic, POST } from '../../simulate/route'
