// Component Imports
import FrontLayout from '@components/layout/front-pages'
import CheckResult from '@views/front-pages/scam-check/CheckResult'

// Service / constants
import { searchScamByIdentifier } from '@/services/scam-report.service'
import { IDENTIFIER_TYPES } from '@/lib/scam-constants'
import type { IdentifierType } from '@/lib/scam-constants'
import type { ScamSearchResult } from '@/services/scam-report.service'

export const metadata = {
  title: 'ผลการตรวจสอบความเสี่ยง | Deep'
}

const CheckPage = async ({ searchParams }: { searchParams: Promise<{ type?: string; q?: string }> }) => {
  const sp = await searchParams
  const type = (IDENTIFIER_TYPES as string[]).includes(sp.type ?? '') ? (sp.type as IdentifierType) : null
  const q = (sp.q ?? '').trim()

  let result: ScamSearchResult | null = null

  if (type && q.length >= 2) {
    result = await searchScamByIdentifier(type, q)
  }

  return (
    <FrontLayout>
      <CheckResult type={type} q={q} result={result} />
    </FrontLayout>
  )
}

export default CheckPage
