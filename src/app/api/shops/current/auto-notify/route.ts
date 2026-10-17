/** GET /api/shops/current/auto-notify — snapshot หน้าตั้งค่าแจ้งลูกค้าอัตโนมัติ (00078 · API §4.1 · H1: CHAT อ่านได้) */
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { jsonNoStore } from '@/lib/shop-api-guard'
import { requireShopCapability } from '@/lib/shop-capability'
import { getAutoNotifySettings } from '@/services/auto-notify-config.service'

export const dynamic = 'force-dynamic'

export async function GET() {
  const gate = await requireShopCapability(await getServerSession(authOptions), 'H1')
  if (!gate.ok) return gate.response
  return jsonNoStore(await getAutoNotifySettings(gate.shopId, gate.roles))
}
