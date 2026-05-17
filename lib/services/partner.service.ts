// ─────────────────────────────────────────────────────────────────────────────
// lib/services/partner.service.ts
//
// Re-export barrel — all sub-services are re-exported here for backwards
// compatibility. Callers that import from this file continue to work unchanged.
// ─────────────────────────────────────────────────────────────────────────────

export { computeEqualization } from './partner-equity.service'
export type { EqualizationKernelInput } from './partner-equity.service'
export { PartnerEquityService } from './partner-equity.service'
export { PartnerCrudService } from './partner-crud.service'
export { PartnerTransactionService } from './partner-transaction.service'

import { PartnerEquityService } from './partner-equity.service'
import { PartnerCrudService } from './partner-crud.service'
import { PartnerTransactionService } from './partner-transaction.service'

// PartnerService facade — aggregates all methods so existing callers that use
// PartnerService.<method> continue working without any changes.
export class PartnerService {
  static getPartnerBalances    = PartnerEquityService.getPartnerBalances.bind(PartnerEquityService)
  static getLoanStatus         = PartnerEquityService.getLoanStatus.bind(PartnerEquityService)
  static calculateEqualization = PartnerEquityService.calculateEqualization.bind(PartnerEquityService)
  static listPartners          = PartnerCrudService.listPartners.bind(PartnerCrudService)
  static createPartner         = PartnerCrudService.createPartner.bind(PartnerCrudService)
  static addTransaction        = PartnerTransactionService.addTransaction.bind(PartnerTransactionService)
  static listTransactions      = PartnerTransactionService.listTransactions.bind(PartnerTransactionService)
}
