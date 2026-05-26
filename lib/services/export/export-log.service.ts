// ─────────────────────────────────────────────────────────────────────────────
// lib/services/export/export-log.service.ts
//
// Simple audit log for certified export generation.
// ─────────────────────────────────────────────────────────────────────────────

import type { SupabaseClient } from '@supabase/supabase-js'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyClient = SupabaseClient<any>

export interface ExportLogEntry {
  id: string
  company_id: string
  export_id: string
  generated_by: string
  period_from: string
  period_to: string
  checksum: string
  sections: string[]
  record_counts: Record<string, number>
  created_at: string
}

export class ExportLogService {
  static async log(
    companyId: string,
    userId: string,
    exportId: string,
    period: { from: string; to: string },
    checksum: string,
    sections: string[],
    recordCounts: Record<string, number>,
    supabase: AnyClient,
  ): Promise<void> {
    const { error } = await supabase
      .from('export_logs')
      .insert({
        company_id: companyId,
        export_id: exportId,
        generated_by: userId,
        period_from: period.from,
        period_to: period.to,
        checksum,
        sections,
        record_counts: recordCounts,
      })

    if (error) {
      // Log but don't throw — export itself succeeded
      console.error('[ExportLogService.log] Failed to write export log:', error.message)
    }
  }

  static async list(
    companyId: string,
    supabase: AnyClient,
  ): Promise<ExportLogEntry[]> {
    const { data, error } = await supabase
      .from('export_logs')
      .select('*')
      .eq('company_id', companyId)
      .order('created_at', { ascending: false })
      .limit(100)

    if (error) {
      console.error('[ExportLogService.list] Failed to list export logs:', error.message)
      return []
    }

    return (data ?? []) as ExportLogEntry[]
  }
}
