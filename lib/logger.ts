import { createClient } from '@/lib/supabase-server'
import { isAppError, AppError } from '@/types/errors'

export type LogLevel = 'debug' | 'info' | 'warn' | 'error'

// ── Log level filtering ────────────────────────────────────────────────────────

const LEVEL_RANK: Record<LogLevel, number> = {
  debug: 0,
  info:  1,
  warn:  2,
  error: 3,
}

function getConfiguredLevel(): LogLevel {
  const env = process.env.LOG_LEVEL as LogLevel | undefined
  if (env && env in LEVEL_RANK) return env
  return process.env.NODE_ENV === 'production' ? 'info' : 'debug'
}

/** Returns true if the given level should be emitted given the configured minimum. */
export function shouldLog(level: LogLevel): boolean {
  return LEVEL_RANK[level] >= LEVEL_RANK[getConfiguredLevel()]
}

export interface RequestContext {
  requestId: string
  userId:    string | null
}

/** Create a fresh request context at the top of every API handler */
export function makeRequestContext(userId: string | null = null): RequestContext {
  const hex = () => Math.floor(Math.random() * 0xFFFFFFFF).toString(16).padStart(8, '0')
  const requestId = `${hex()}-${hex().slice(0,4)}-4${hex().slice(0,3)}-${(8+Math.floor(Math.random()*4)).toString(16)}${hex().slice(0,3)}-${hex()}${hex().slice(0,4)}`
  return { requestId, userId }
}

/**
 * Build a request context from an incoming header if present,
 * otherwise generate a fresh one.  Used in middleware → route tracing.
 */
export function contextFromHeader(
  headerValue: string | null,
  userId: string | null = null
): RequestContext {
  if (headerValue && /^[0-9a-f-]{36}$/i.test(headerValue)) {
    return { requestId: headerValue, userId }
  }
  return makeRequestContext(userId)
}

// ── Performance timing helper ─────────────────────────────────────────────────

/**
 * Create a high-resolution timer. Call .end() when the work completes.
 * Logs: { level: 'info', message: '<label> completed', duration_ms: N, ...meta }
 * Always logs at 'info' regardless of LOG_LEVEL filtering.
 */
export function createTimer(label: string): { end: (meta?: Record<string, unknown>) => void } {
  const startMs = Date.now()
  return {
    end(meta?: Record<string, unknown>) {
      const duration_ms = Date.now() - startMs
      const entry: Record<string, unknown> = {
        level:       'info',
        message:     `${label} completed`,
        duration_ms,
        ...(meta ?? {}),
      }
      // Write to stdout — always emitted (financial timing is always relevant)
      console.info(JSON.stringify(entry))
    },
  }
}

// ── Error serializer ──────────────────────────────────────────────────────────

/**
 * Serialize any caught value into a plain object suitable for structured logging.
 * Handles: AppError (with .code), native Error, plain objects/strings.
 */
export function serializeError(err: unknown): { message: string; code?: string; stack?: string } {
  if (err instanceof AppError) {
    return {
      message: err.message,
      code:    err.code,
      stack:   err.stack?.slice(0, 500),
    }
  }
  if (err instanceof Error) {
    return {
      message: err.message,
      stack:   err.stack?.slice(0, 500),
    }
  }
  if (typeof err === 'string') {
    return { message: err }
  }
  if (err !== null && typeof err === 'object') {
    const obj = err as Record<string, unknown>
    return {
      message: String(obj.message ?? JSON.stringify(err)),
      code:    obj.code !== undefined ? String(obj.code) : undefined,
    }
  }
  return { message: String(err) }
}

// ── Financial audit trail logger ──────────────────────────────────────────────

export interface FinancialActionParams {
  requestId:    string
  userId:       string
  companyId:    string
  action:       string       // e.g. 'sale.create', 'period.close', 'dividend.declare'
  resourceType: string
  resourceId:   string
  amount_try?:  number
  metadata?:    Record<string, unknown>
}

/**
 * Emit a structured log entry for a financial action.
 * Always writes at 'info' level regardless of LOG_LEVEL — financial actions are
 * always audited. This is a structured console log, NOT a DB write (see lib/audit.ts
 * for that). Designed for log aggregation pipelines (Vercel logs, DataDog, etc.).
 */
export function logFinancialAction(params: FinancialActionParams): void {
  const entry: Record<string, unknown> = {
    level:         'info',
    audit:         true,
    request_id:    params.requestId,
    user_id:       params.userId,
    company_id:    params.companyId,
    action:        params.action,
    resource_type: params.resourceType,
    resource_id:   params.resourceId,
    timestamp:     new Date().toISOString(),
  }
  if (params.amount_try !== undefined) entry.amount_try = params.amount_try
  if (params.metadata)                 Object.assign(entry, params.metadata)

  // Always emit — bypasses shouldLog() filtering
  console.info(JSON.stringify(entry))
}

/** Write to system_logs via security-definer RPC. Never throws. */
export async function log(
  ctx:      RequestContext,
  level:    LogLevel,
  message:  string,
  context?: Record<string, unknown>
): Promise<void> {
  // Respect LOG_LEVEL filtering before hitting the DB
  if (!shouldLog(level)) return
  try {
    const supabase = createClient()
    await supabase.rpc('write_system_log', {
      p_request_id: ctx.requestId,
      p_user_id:    ctx.userId,
      p_level:      level,
      p_message:    message,
      p_context:    context ?? null,
    })
  } catch {
    // Logging must NEVER crash the caller
    console.error('[log_fail]', level, message)
  }
}

/**
 * Log any caught error value with full type classification if it is an AppError.
 * This is the single place that knows how to turn an unknown catch into a log entry.
 */
export async function logError(
  ctx:     RequestContext,
  message: string,
  err:     unknown,
  extra?:  Record<string, unknown>
): Promise<void> {
  const context: Record<string, unknown> = { ...extra }

  if (isAppError(err)) {
    // Include structured classification — exactly what Phase 2 requires
    context.error_type = err.type
    context.error_code = err.code
    context.error_msg  = err.message
    context.details    = err.details
  } else if (err instanceof Error) {
    context.error_msg  = err.message
    context.stack      = err.stack?.slice(0, 500)
  } else {
    context.raw_error  = String(err)
  }

  await log(ctx, 'error', message, context)
}

export const logger = {
  debug: (ctx: RequestContext, msg: string, c?: Record<string, unknown>) => log(ctx, 'debug', msg, c),
  info:  (ctx: RequestContext, msg: string, c?: Record<string, unknown>) => log(ctx, 'info',  msg, c),
  warn:  (ctx: RequestContext, msg: string, c?: Record<string, unknown>) => log(ctx, 'warn',  msg, c),
  error: (ctx: RequestContext, msg: string, c?: Record<string, unknown>) => log(ctx, 'error', msg, c),
  err:   logError,   // shorthand for caught errors
}
