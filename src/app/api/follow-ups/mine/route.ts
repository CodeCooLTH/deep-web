import { NextRequest } from 'next/server'
import { intersectScopedShopIds } from '@/lib/chat-scope'
import { listMine } from '@/services/customer-follow-up.service'
import { json, mapFollowUpError, requireScope, requireUser } from '../_shared'

export const dynamic = 'force-dynamic'

// bubble "ของฉัน" — ขอบเขต = ทุกร้านที่กำลังดู; ?shopId= ตัดให้อยู่ในขอบเขต (นอกขอบเขต = ผลว่าง ไม่ใช่ 403)
export async function GET(request: NextRequest) {
  const u = await requireUser()
  if ('res' in u) return u.res
  const s = await requireScope(u, 'X2')
  if ('res' in s) return s.res
  const shopIds = intersectScopedShopIds(s.scope.shopIds, request.nextUrl.searchParams.get('shopId'))
  try {
    return json(await listMine(shopIds, u.userId))
  } catch (e) {
    return mapFollowUpError(e, 'GET follow-ups/mine')
  }
}
