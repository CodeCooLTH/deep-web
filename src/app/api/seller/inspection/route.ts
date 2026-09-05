import { NextResponse, type NextRequest } from 'next/server'
import { getInspectionForOwner } from '@/services/inspection-owner.service'
import { mapInspectionError, requireInspectionShop } from './_shared'

/**
 * GET /api/seller/inspection — สถานะแผน + ผลปัจจุบันรายข้อ + ไทม์ไลน์ + คิวรอบที่ยังไม่ปิด
 * (feature 00060 · API §4.1)
 *
 * เปิดให้ทั้ง OWNER และ `ShopMember(role='ADMIN')` — ADMIN ดูได้ กดไม่ได้ (`canManage=false`)
 *
 * 🛑 `pendingRounds` ("รอผู้ตรวจเข้าตรวจ") **ผู้ขายเห็น สาธารณะไม่เห็น** — เป็นสถานะกระบวนการ
 *    ทำงานของ Deep ไม่ใช่ข้อเท็จจริงเกี่ยวกับร้าน ถ้าโชว์สาธารณะจะกลายเป็นป้ายครึ่งใบที่ยืม
 *    ความน่าเชื่อถือล่วงหน้า
 */
export async function GET(request: NextRequest) {
  const auth = await requireInspectionShop()
  if ('response' in auth) return auth.response

  const roomId = request.nextUrl.searchParams.get('roomId')
  try {
    const view = await getInspectionForOwner({
      shopId: auth.shopId,
      userId: auth.userId,
      roomId,
      now: new Date(),
    })
    return NextResponse.json(view)
  } catch (e) {
    return mapInspectionError(e, { tag: 'seller/inspection', shopId: auth.shopId })
  }
}
