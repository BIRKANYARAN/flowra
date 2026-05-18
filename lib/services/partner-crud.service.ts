// ─────────────────────────────────────────────────────────────────────────────
// lib/services/partner-crud.service.ts
//
// Partner CRUD / management methods.
// ─────────────────────────────────────────────────────────────────────────────

import { requireAuthContext } from '@/lib/auth-context'
import { logger, contextFromHeader } from '@/lib/logger'
import { AppError } from '@/types/errors'
import type { Partner } from '@/types/index'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnySupabase = any
type Ctx = ReturnType<typeof contextFromHeader>

export class PartnerCrudService {
  // ── listPartners ────────────────────────────────────────────────────────────
  static async listPartners(
    userId:    string,
    companyId: string,
    ctx?:      Ctx,
    supabase?: AnySupabase,
  ): Promise<Partner[]> {
    const db = requireAuthContext(supabase, 'PartnerCrudService.listPartners')
    const { data, error } = await db
      .from('partners')
      .select('*')
      .eq('company_id', companyId)
      .is('deleted_at', null)
      .order('created_at', { ascending: true })

    if (error) {
      if (ctx) void logger.error(ctx, 'partners_list_failed', { error })
      throw new AppError('DB_READ_FAILED', 'Ortaklar listelenemedi', error)
    }

    return (data ?? []) as Partner[]
  }

  // ── createPartner ───────────────────────────────────────────────────────────
  static async createPartner(
    userId:    string,
    input: { name: string; share_ratio: number; is_active?: boolean; notes?: string },
    companyId: string,
    ctx?:      Ctx,
    supabase?: AnySupabase,
  ): Promise<Partner> {
    if (input.share_ratio <= 0 || input.share_ratio > 1) {
      throw new AppError(
        'PARTNER_SHARE_RATIO_INVALID',
        'share_ratio 0 ile 1 arasında olmalı (örn. 0.5 = %50)',
        { received: input.share_ratio },
      )
    }

    const db = requireAuthContext(supabase, 'PartnerCrudService.createPartner')
    const { data, error } = await db
      .from('partners')
      .insert({
        user_id:     userId,
        name:        input.name.trim(),
        share_ratio: input.share_ratio,
        is_active:   input.is_active ?? true,
        notes:       input.notes ?? null,
        company_id:  companyId,
      })
      .select()
      .single()

    if (error || !data) {
      if (ctx) void logger.error(ctx, 'partner_create_failed', { error })
      throw new AppError('DB_INSERT_FAILED', 'Ortak oluşturulamadı', error)
    }

    return data as Partner
  }
}
