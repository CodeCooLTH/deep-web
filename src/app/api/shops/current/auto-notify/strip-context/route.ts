/**
 * GET /api/shops/current/auto-notify/strip-context — ข้อมูลให้แถบแจ้งลูกค้า (00078 · API §4.6)
 * O1 (ช่างเห็นแถบเริ่มงาน/ปิดงาน) · ส่ง conversationId ต้องมี H1 เพิ่ม · ?shopId= สำหรับกล่องแชทข้ามร้าน (BR-UNI-07)
 * ห้อง/ออเดอร์ไม่ใช่ของร้าน = 404 เหมือนไม่มี (ไม่บอกว่ามีอยู่ร้านอื่น)
 */
import { getServerSession } from 'next-auth'
import { NextRequest } from 'next/server'
import * as v from 'valibot'
import { authOptions } from '@/lib/auth'
import { forbiddenRoleResponse } from '@/lib/forbidden-role'
import { jsonNoStore } from '@/lib/shop-api-guard'
import { can } from '@/lib/shop-permissions'
import { requireShopCapability } from '@/lib/shop-capability'
import { getStripContext } from '@/services/auto-notify-config.service'

// รูปแบบ+ความยาวของ id จาก query (uuid ทั้งหมดในโปรเจกต์ · publicToken = uuid) — กันสตริงยาว/แปลกถึง DB
const StripQuerySchema = v.object({
  shopId: v.nullable(v.pipe(v.string(), v.uuid())),
  conversationId: v.nullable(v.pipe(v.string(), v.uuid())),
  orderToken: v.nullable(v.pipe(v.string(), v.uuid())),
})

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams
  const q = v.safeParse(StripQuerySchema, {
    shopId: sp.get('shopId'),
    conversationId: sp.get('conversationId'),
    orderToken: sp.get('orderToken'),
  })
  const gate = await requireShopCapability(await getServerSession(authOptions), 'O1', { shopId: q.success ? q.output.shopId : null })
  if (!gate.ok) return gate.response
  if (!q.success) return jsonNoStore({ error: 'VALIDATION_ERROR' }, { status: 400 })
  const { conversationId, orderToken } = q.output
  if (!conversationId && !orderToken) return jsonNoStore({ error: 'VALIDATION_ERROR' }, { status: 400 })
  if (conversationId && !can(gate.roles, 'H1')) return forbiddenRoleResponse()
  const r = await getStripContext(gate.shopId, gate.roles, { conversationId, orderToken })
  if (!r.found.conversation || !r.found.order) return jsonNoStore({ error: 'NOT_FOUND' }, { status: 404 })
  return jsonNoStore(r.context)
}
