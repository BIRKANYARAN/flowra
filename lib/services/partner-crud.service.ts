// ─────────────────────────────────────────────────────────────────────────────
// lib/services/partner-crud.service.ts
//
// Partner CRUD / management methods.
// ─────────────────────────────────────────────────────────────────────────────

import { createClient } from '@/lib/supabase-server'
import { logger, contextFromHeader } from '@/lib/logger'
import { AppError } from '@/types/errors'
import type { Partner } from '@/types/index'

type Ctx = ReturnType<typeof contextFromHeader>

export class PartnerCrudService {
  // ── listPartners ────────────────────────────────────────────────────────────
  static async listPartners(
    userId:    string,
    companyId: string,
    ctx?:      Ctx,
  ): Promise<Partner[]> {
    const supabase = createClient()
    const { data, error } = await supabase
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
  ): Promise<Partner> {
    if (input.share_ratio <= 0 || input.share_ratio > 1) {
      throw new AppError(
        'PARTNER_SHARE_RATIO_INVALID',
        'share_ratio 0 ile 1 arasında olmalı (örn. 0.5 = %50)',
        { received: input.share_ratio },
      )
    }

    const supabase = createClient()
    const { data, error } = await supabase
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
