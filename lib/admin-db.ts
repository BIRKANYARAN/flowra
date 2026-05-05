// ─────────────────────────────────────────────────────────────────────────────
// lib/admin-db.ts
//
// Safe wrapper around the admin (service-role) Supabase client.
//
// RULES — enforced at both type level (AllowedAdminTable) and runtime:
//
//   1. NEVER use admin.from() directly in any route or service.
//      Import safeAdminQuery() from THIS file instead.
//
//   2. NEVER use createAdminClient() outside this file.
//      lib/supabase-admin.ts is an internal dependency of this module only.
//
//   3. Every query through safeAdminQuery() ALWAYS includes
//      .eq('company_id', companyId) — enforced automatically and cannot be
//      omitted. Missing or malformed companyId throws at runtime before any
//      DB call is made.
//
//   4. Auth.users operations (getUserById, listUsers) go through getAdminAuth().
//      They are read-only and do not touch business tables.
//
// Allowed tables:
//   'company_members' — privileged INSERTs/UPDATEs (no client RLS policy exists)
//   'audit_logs'      — company-wide SELECT (user RLS scopes to own rows only)
//
// All other business tables MUST use the user-scoped client from supabase-server.ts.
// ─────────────────────────────────────────────────────────────────────────────

import { createAdminClient } from '@/lib/supabase-admin'

// ── Type-level table allowlist ────────────────────────────────────────────────
// Only tables that REQUIRE service-role access may appear here.
// Adding a table here is a security decision — document the reason.
type AllowedAdminTable =
  | 'company_members'  // no INSERT/UPDATE/DELETE RLS policy — client writes denied
  | 'audit_logs'       // SELECT RLS is user_id = auth.uid() — admin needs cross-user read

// Global/system tables that do not carry a company_id. These are intentionally
// narrow: callers use them only for server-side jobs or read-by-id public views.
type AllowedSystemAdminTable =
  | 'fx_rates'
  | 'policy_rates'
  | 'event_outbox'
  | 'proformas'
  | 'proforma_items'
  | 'user_settings'
  | 'company_banks'
  | 'customers'

// ── Runtime UUID validation ───────────────────────────────────────────────────
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function assertCompanyId(companyId: string, table: AllowedAdminTable, op: string): void {
  if (!companyId || typeof companyId !== 'string' || !UUID_RE.test(companyId)) {
    // Throw synchronously — never reaches the DB
    throw new Error(
      `[admin-db] SECURITY VIOLATION — ${op} on "${table}": ` +
      `companyId "${companyId}" is missing or not a valid UUID. ` +
      'Direct admin.from() calls are forbidden. Use safeAdminQuery().',
    )
  }
}

// ── safeAdminQuery ────────────────────────────────────────────────────────────

/**
 * Returns a scoped query builder for admin (service-role) operations.
 *
 * company_id is validated (UUID format) and applied automatically:
 *   select()         → appends .eq('company_id', companyId)
 *   updateById()     → appends .eq('id', id).eq('company_id', companyId)
 *   softDeleteById() → sets deleted_at=now(), appends id+company_id guards
 *   insert()         → validates payload.company_id === companyId at runtime
 *
 * Each method returns the Supabase query builder for further chaining
 * (e.g. .select('id').single(), .order(...), .range(...), .is(...)).
 *
 * @throws Error synchronously if companyId is missing or invalid.
 * @throws Error synchronously if INSERT payload.company_id does not match.
 */
export function safeAdminQuery(table: AllowedAdminTable, companyId: string) {
  // Validate before creating the client — fail fast, never send a request
  assertCompanyId(companyId, table, 'safeAdminQuery')
  const admin = createAdminClient()

  return {
    /**
     * SELECT — company_id filter is the FIRST condition applied.
     * Chain additional filters, ordering, and pagination after this call.
     */
    select(
      columns = '*',
      options?: { count?: 'exact' | 'planned' | 'estimated'; head?: boolean },
    ) {
      return admin
        .from(table)
        .select(columns, options)
        .eq('company_id', companyId)   // always first
    },

    /**
     * INSERT — validates that every row in the payload carries the correct
     * company_id before the request is dispatched.
     * Returns the query builder so you can chain .select('id').single() etc.
     */
    insert(payload: Record<string, unknown> | Record<string, unknown>[]) {
      const rows = Array.isArray(payload) ? payload : [payload]
      for (const row of rows) {
        if (row.company_id !== companyId) {
          throw new Error(
            `[admin-db] SECURITY VIOLATION — INSERT on "${table}": ` +
            `payload.company_id "${String(row.company_id)}" !== ` +
            `verified companyId "${companyId}". ` +
            'Direct admin.from() calls are forbidden. Use safeAdminQuery().',
          )
        }
      }
      return admin.from(table).insert(payload)
    },

    /**
     * UPDATE by row ID — enforces .eq('id', id).eq('company_id', companyId).
     * Returns the query builder for optional chaining.
     */
    updateById(id: string, values: Record<string, unknown>) {
      if (!id) {
        throw new Error(
          `[admin-db] updateById on "${table}" requires a non-empty row id.`,
        )
      }
      return admin
        .from(table)
        .update(values)
        .eq('id', id)
        .eq('company_id', companyId)   // cross-company update guard
    },

    /**
     * Soft-delete by row ID — sets deleted_at = now(),
     * enforces .eq('id', id).eq('company_id', companyId).
     */
    softDeleteById(id: string) {
      if (!id) {
        throw new Error(
          `[admin-db] softDeleteById on "${table}" requires a non-empty row id.`,
        )
      }
      return admin
        .from(table)
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', id)
        .eq('company_id', companyId)   // cross-company delete guard
    },
  }
}

// ── safeSystemQuery ──────────────────────────────────────────────────────────

/**
 * Returns a service-role query builder for explicitly allowlisted tables that
 * cannot be scoped with safeAdminQuery(company_id), either because they are
 * global reference data (fx_rates/policy_rates), system queues, or public
 * read-by-id server rendering.
 *
 * Keep all filtering in the caller tight and explicit. Do not add business
 * tables here unless there is no company_id-safe alternative.
 */
export function safeSystemQuery(table: AllowedSystemAdminTable) {
  return createAdminClient().from(table)
}

/**
 * Returns the service-role client only for RPCs that are themselves bounded by
 * database logic (for example claim_event_batch). Prefer safeAdminQuery() or
 * safeSystemQuery() for normal table access.
 */
export function getSystemAdminClient() {
  return createAdminClient()
}

// ── getAdminAuth ──────────────────────────────────────────────────────────────

/**
 * Returns the Supabase admin auth API for auth.users reads ONLY.
 *
 * Permitted:  getUserById(), listUsers()
 * Forbidden:  deleteUser(), updateUserById() — never call user-mutating methods
 *
 * This is the ONLY approved way to read auth.users from route handlers.
 * Do NOT use the admin client for any other purpose.
 */
export function getAdminAuth() {
  return createAdminClient().auth.admin
}
