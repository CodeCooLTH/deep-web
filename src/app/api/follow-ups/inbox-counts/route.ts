import { NextRequest } from 'next/server'
import { intersectScopedShopIds } from '@/lib/chat-scope'
import { followUpStateCounts } from '@/services/customer-follow-up.service'
import { json, mapFollowUpError, requireScope, requireUser } from '../_shared'

export const dynamic = 'force-dynamic'

// ตัวเลขต่อค่าของตัวกรอง "ติดตามลูกค้า" ในกล่องแชท (Q-6) — นับทั้งขอบเขตร้านที่เห็น ไม่ขึ้นกับตัวกรองอื่น
export async function GET(request: NextRequest) {
  const u = await requireUser()
  if ('res' in u) return u.res
  const s = await requireScope(u, 'X2')
  if ('res' in s) return s.res
  const shopIds = intersectScopedShopIds(s.scope.shopIds, request.nextUrl.searchParams.get('shopId'))
  try {
    return json(await followUpStateCounts(shopIds))
  } catch (e) {
    return mapFollowUpError(e, 'GET follow-ups/inbox-counts')
  }
}
