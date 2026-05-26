// ─────────────────────────────────────────────────────────────────────────────
// lib/admin/gl-rollback.ts
//
// Faz 9-C: GL Rollback Package — pure reversion logic.
//
// Computes what a gl_mode reversion entails. The actual SQL execution
// happens in supabase/flowra_phase9c_rollback.sql (manual DBA step).
// This module provides the safety assessment and human-readable instructions.
// ─────────────────────────────────────────────────────────────────────────────

export type GlMode = 'shadow' | 'parallel' | 'gl_primary'

export type RollbackRisk = 'none' | 'low' | 'medium' | 'high' | 'critical'

export interface RollbackAssessment {
  from_mode:             GlMode
  to_mode:               GlMode
  risk:                  RollbackRisk
  is_reversible:         boolean
  journal_entries_at_risk: number   // entries that were written in current mode
  instructions:          string[]
  warnings:              string[]
  sql_commands:          string[]   // exact SQL to execute (DBA-reviewed)
}

// ── Mode progression numeric values ──────────────────────────────────────────

const MODE_LEVEL: Record<GlMode, number> = {
  shadow:     0,
  parallel:   1,
  gl_primary: 2,
}

// ── Assessment ────────────────────────────────────────────────────────────────

/**
 * Compute the rollback assessment for reverting from `fromMode` to `toMode`.
 *
 * @param fromMode              current gl_mode
 * @param toMode                target gl_mode (must be <= fromMode)
 * @param journalEntriesWritten journal entries written while in fromMode
 * @param companyId             UUID of the company
 */
export function computeRollbackAssessment(
  fromMode:              GlMode,
  toMode:                GlMode,
  journalEntriesWritten: number,
  companyId:             string,
): RollbackAssessment {
  const fromLevel = MODE_LEVEL[fromMode]
  const toLevel   = MODE_LEVEL[toMode]

  if (toLevel > fromLevel) {
    // This would be a forward progression, not a rollback
    return {
      from_mode:               fromMode,
      to_mode:                 toMode,
      risk:                    'none',
      is_reversible:           true,
      journal_entries_at_risk: 0,
      instructions:            ['Use PATCH /api/admin/gl-mode to advance the mode forward.'],
      warnings:                [],
      sql_commands:            [],
    }
  }

  // shadow → shadow: no-op
  if (fromMode === toMode) {
    return {
      from_mode:               fromMode,
      to_mode:                 toMode,
      risk:                    'none',
      is_reversible:           true,
      journal_entries_at_risk: 0,
      instructions:            ['Already in target mode. No action needed.'],
      warnings:                [],
      sql_commands:            [],
    }
  }

  const instructions: string[] = []
  const warnings:     string[] = []
  const sqlCommands:  string[] = []

  // ── parallel → shadow ───────────────────────────────────────────────────
  if (fromMode === 'parallel' && toMode === 'shadow') {
    const risk: RollbackRisk = journalEntriesWritten > 0 ? 'medium' : 'low'

    instructions.push(
      '1. Ensure all in-flight dual-write async jobs complete (wait ~30s).',
      '2. Run the rollback SQL to update gl_mode and optionally purge journal entries.',
      '3. Call PATCH /api/admin/gl-mode with { gl_mode: "shadow" } to clear the in-process cache.',
      '4. Verify the cfo-metrics API returns operational-table-sourced data.',
    )

    if (journalEntriesWritten > 0) {
      warnings.push(
        `${journalEntriesWritten} journal entries were written in parallel mode. ` +
        `Rolling back to shadow means these entries will be ignored by the application ` +
        `(gl_mode = shadow skips GL reads), but entries remain in journal_entries table.`,
        'OPTIONAL: Delete those journal entries only if re-backfill will be performed fresh.',
        'Do NOT delete journal entries if you plan to re-advance to parallel mode soon.',
      )
    }

    sqlCommands.push(
      `-- Step 1: Revert gl_mode to shadow`,
      `UPDATE companies SET gl_mode = 'shadow', updated_at = NOW() WHERE id = '${companyId}';`,
      ``,
      `-- Step 2 (OPTIONAL): Remove parallel-mode journal entries if re-backfilling fresh`,
      `-- WARNING: Only run this if you intend to regenerate all entries from scratch`,
      `-- DELETE FROM journal_entries WHERE company_id = '${companyId}' AND created_at >= '<parallel_start_timestamp>';`,
    )

    return {
      from_mode:               fromMode,
      to_mode:                 toMode,
      risk,
      is_reversible:           true,
      journal_entries_at_risk: journalEntriesWritten,
      instructions,
      warnings,
      sql_commands:            sqlCommands,
    }
  }

  // ── gl_primary → parallel ───────────────────────────────────────────────
  if (fromMode === 'gl_primary' && toMode === 'parallel') {
    instructions.push(
      '1. CRITICAL: Assess whether any period has been locked in gl_primary mode.',
      '2. If no periods locked: safe to revert. Proceed with SQL below.',
      '3. If periods ARE locked: locked period snapshots used GL data. Reversion may cause reporting inconsistency.',
      '4. Run the rollback SQL.',
      '5. Call PATCH /api/admin/gl-mode with { gl_mode: "parallel" } to update live state.',
      '6. Re-run shadow audit to confirm operational tables and GL still align.',
    )

    warnings.push(
      'Reverting from gl_primary to parallel means financial statement API routes will return operational-table data again.',
      'Any locked period PDFs generated in gl_primary mode will reference different numbers than current API.',
      `${journalEntriesWritten} journal entries written in gl_primary mode remain intact — they are not deleted.`,
    )

    sqlCommands.push(
      `-- Step 1: Revert gl_mode to parallel`,
      `UPDATE companies SET gl_mode = 'parallel', updated_at = NOW() WHERE id = '${companyId}';`,
      ``,
      `-- Step 2: Verify no locked periods were finalized under gl_primary`,
      `SELECT COUNT(*) FROM accounting_periods WHERE company_id = '${companyId}' AND status = 'locked';`,
      `-- If count > 0, contact engineering before proceeding further.`,
    )

    return {
      from_mode:               fromMode,
      to_mode:                 toMode,
      risk:                    journalEntriesWritten > 0 ? 'high' : 'medium',
      is_reversible:           true,
      journal_entries_at_risk: journalEntriesWritten,
      instructions,
      warnings,
      sql_commands:            sqlCommands,
    }
  }

  // ── gl_primary → shadow ─────────────────────────────────────────────────
  if (fromMode === 'gl_primary' && toMode === 'shadow') {
    warnings.push(
      'CRITICAL: Skipping parallel mode during rollback. This is a 2-step regression.',
      'Financial statement routes will immediately switch from GL-sourced to operational-table-sourced data.',
      'If any periods were locked under gl_primary, snapshots will be inconsistent with current operational data.',
      'All journal entries remain in the database — they are not deleted by this rollback.',
    )

    instructions.push(
      '1. STOP: Confirm with engineering lead before executing this rollback.',
      '2. Check for locked periods under gl_primary (see SQL verification query below).',
      '3. If locked periods exist, assess risk of reporting inconsistency.',
      '4. Execute rollback SQL only after sign-off.',
      '5. Call PATCH /api/admin/gl-mode with { gl_mode: "shadow" } to update live state.',
      '6. Notify all active users of the mode change.',
    )

    sqlCommands.push(
      `-- !! CRITICAL ROLLBACK: gl_primary → shadow !!`,
      `-- Execute ONLY after engineering review and sign-off.`,
      ``,
      `-- Verification: Check for locked periods`,
      `SELECT id, year, month, status FROM accounting_periods`,
      `  WHERE company_id = '${companyId}' AND status IN ('locked', 'closed')`,
      `  ORDER BY year DESC, month DESC;`,
      ``,
      `-- Step 1: Revert gl_mode`,
      `UPDATE companies SET gl_mode = 'shadow', updated_at = NOW() WHERE id = '${companyId}';`,
      ``,
      `-- Step 2: Optionally soft-archive GL-derived period snapshots that used gl_primary data`,
      `-- ALTER TABLE balance_sheet_snapshots ADD COLUMN IF NOT EXISTS gl_source_mode text;`,
      `-- UPDATE balance_sheet_snapshots SET gl_source_mode = 'gl_primary' WHERE company_id = '${companyId}';`,
    )

    return {
      from_mode:               fromMode,
      to_mode:                 toMode,
      risk:                    'critical',
      is_reversible:           true,
      journal_entries_at_risk: journalEntriesWritten,
      instructions,
      warnings,
      sql_commands:            sqlCommands,
    }
  }

  // Fallback (should not reach here with valid inputs)
  return {
    from_mode:               fromMode,
    to_mode:                 toMode,
    risk:                    'none',
    is_reversible:           true,
    journal_entries_at_risk: 0,
    instructions:            ['Unexpected mode combination. No action taken.'],
    warnings:                [],
    sql_commands:            [],
  }
}

// ── Mode-level helpers ────────────────────────────────────────────────────────

export function isForwardProgression(from: GlMode, to: GlMode): boolean {
  return MODE_LEVEL[to] > MODE_LEVEL[from]
}

export function isRollback(from: GlMode, to: GlMode): boolean {
  return MODE_LEVEL[to] < MODE_LEVEL[from]
}

export function modeLabel(mode: GlMode): string {
  switch (mode) {
    case 'shadow':     return 'Shadow (no GL writes, operational tables only)'
    case 'parallel':   return 'Parallel (GL writes async, operational tables serve reads)'
    case 'gl_primary': return 'GL Primary (GL writes sync, GL serves reads)'
  }
}
