// Guard: Vercel Cron invokes scheduled jobs via GET. These routes used to export
// only POST → every scheduled run returned 405 and never executed (receivables
// never aged, interest never accrued, workflows never expired, snapshots never
// taken). Assert each scheduled cron exports GET aliased to its POST handler.
import { describe, it, expect } from 'vitest'
import * as overdue from '@/app/api/cron/overdue-update/route'
import * as interest from '@/app/api/cron/interest-accrual/route'
import * as workflow from '@/app/api/cron/workflow-expire/route'
import * as governance from '@/app/api/cron/governance-snapshot/route'

describe('scheduled cron routes expose a GET handler (Vercel Cron uses GET)', () => {
  for (const [name, mod] of [
    ['overdue-update', overdue],
    ['interest-accrual', interest],
    ['workflow-expire', workflow],
    ['governance-snapshot', governance],
  ] as const) {
    it(`${name}: GET is exported and aliases POST`, () => {
      expect(typeof (mod as { GET?: unknown }).GET).toBe('function')
      expect((mod as { GET?: unknown }).GET).toBe((mod as { POST?: unknown }).POST)
    })
  }
})
