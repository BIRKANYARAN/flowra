'use client'

import { useState } from 'react'

interface PublicActionsProps {
  proformaNo: string
  proformaId: string
  items: Array<{
    id: string; name: string; unit: string; price: number
    quantity: number; discount_percent: number; kdv: number; currency: string
  }>
  settings: {
    company_name: string | null; address: string | null; phone: string | null
    website: string | null; tax_number: string | null; tax_office: string | null
    logo_url: string | null; mersis_no: string | null
  } | null
  customer: {
    name: string | null; address: string | null; tax_number: string | null
    tax_office: string | null; email: string | null; phone: string | null
  } | null
  banks: Array<{ bank_name: string; branch_name: string | null; iban: string }>
  currency: string
}

export function PublicActions({ proformaNo, proformaId, items, settings, customer, banks, currency }: PublicActionsProps) {
  const [downloading, setDownloading] = useState(false)

  const handleDownload = async () => {
    setDownloading(true)
    try {
      const { generatePdf } = await import('@/components/pdf/generatePdf')
      await generatePdf({
        proformaNo,
        createdAt: new Date().toISOString(),
        validityDays: 30,
        currency,
        company: {
          name:      settings?.company_name ?? '',
          address:   settings?.address ?? '',
          phone:     settings?.phone ?? '',
          website:   settings?.website ?? '',
          taxNumber: settings?.tax_number ?? '',
          taxOffice: settings?.tax_office ?? '',
          logoUrl:   settings?.logo_url ?? '',
          mersisNo:  settings?.mersis_no ?? undefined,
        },
        customer: {
          name:      customer?.name ?? '',
          address:   customer?.address ?? '',
          taxNumber: customer?.tax_number ?? '',
          taxOffice: customer?.tax_office ?? '',
          email:     customer?.email ?? undefined,
          phone:     customer?.phone ?? undefined,
        },
        banks: banks.map(b => ({
          bankName:   b.bank_name,
          branchName: b.branch_name ?? '',
          iban:       b.iban,
        })),
        items: items.map(it => ({
          name:             it.name,
          unit:             it.unit,
          quantity:         it.quantity,
          price:            it.price,
          kdv:              it.kdv,
          currency:         it.currency,
          discount_percent: it.discount_percent,
        })),
      })
    } catch (err) {
      console.error('PDF download error:', err)
    } finally {
      setDownloading(false)
    }
  }

  return (
    <div className="flex items-center justify-center gap-3 mb-6 print:hidden">
      <button
        onClick={handleDownload}
        disabled={downloading}
        className="flex items-center gap-2 px-5 py-2.5 bg-white border border-[#e2e8f0] rounded text-sm font-medium text-gray-700 hover:bg-[#f8fafc] transition-colors shadow-sm disabled:opacity-50"
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
        </svg>
        {downloading ? 'Hazırlanıyor...' : 'Yazdır / PDF'}
      </button>
      <button
        onClick={handleDownload}
        disabled={downloading}
        className="flex items-center gap-2 px-5 py-2.5 bg-indigo-600 rounded text-sm font-medium text-white hover:bg-indigo-700 transition-colors shadow-sm disabled:opacity-50"
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
        {downloading ? 'Hazırlanıyor...' : 'PDF İndir'}
      </button>
    </div>
  )
}
