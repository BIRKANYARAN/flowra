import { createClient } from '@/lib/supabase-server'
import { isAppError } from '@/types/errors'

export type LogLevel = 'debug' | 'info' | 'warn' | 'error'

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

/** Write to system_logs via security-definer RPC. Never throws. */
export async function log(
  ctx:      RequestContext,
  level:    LogLevel,
  message:  string,
  context?: Record<string, unknown>
): Promise<void> {
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
