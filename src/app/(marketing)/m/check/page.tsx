// เช็กมิจฉาชีพ (mobile app shell) — ใช้ CheckResult เดิม แต่ไม่ห่อ FrontLayout (/m/layout เป็น shell แทน)
// proxy rewrite: authed mobile /check → /m/check (query ?type=&q= คงไว้); guest → /check ปกติ (public)
import CheckResult from '@views/front-pages/scam-check/CheckResult'

import { searchScamByIdentifier } from '@/services/scam-report.service'
import { IDENTIFIER_TYPES } from '@/lib/scam-constants'
import type { IdentifierType } from '@/lib/scam-constants'
import type { ScamSearchResult } from '@/services/scam-report.service'

export const metadata = { title: 'เช็กมิจฉาชีพ' }

export default async function MobileCheckPage({
  searchParams
}: {
  searchParams: Promise<{ type?: string; q?: string }>
}) {
  const sp = await searchParams
  const type = (IDENTIFIER_TYPES as string[]).includes(sp.type ?? '') ? (sp.type as IdentifierType) : null
  const q = (sp.q ?? '').trim()

  let result: ScamSearchResult | null = null
  if (type && q.length >= 2) {
    result = await searchScamByIdentifier(type, q)
  }

  return <CheckResult type={type} q={q} result={result} />
}
