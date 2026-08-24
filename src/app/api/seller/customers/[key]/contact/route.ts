/**
 * GET /api/seller/customers/[key]/contact — เปิดเผยข้อมูลติดต่อเต็มของลูกค้า 1 คน (feature 00057)
 *
 * ทำไมต้องเป็น endpoint แยกแทนที่จะส่งมากับหน้า: ตาราง `/customers` แสดงเบอร์แบบ mask
 * (4 ตัวท้าย) โดยตั้งใจ — ถ้าฝังเบอร์เต็มไว้ในหน้าตั้งต้นเพื่อให้ปุ่ม "แสดงเบอร์" ทำงานได้เร็ว
 * เบอร์ของลูกค้า **ทุกคนในหน้า** จะติดไปกับ flight payload ทันที และภาพหน้าจอที่ผู้ขายส่งต่อกัน
 * จะมีเบอร์ลูกค้าติดไปทั้งแผงโดยไม่มีใครตั้งใจ (`feedback_rsc_pii_neutralize_at_source`)
 *
 * 🛑 authorization อยู่ที่ `resolveCustomerByKey(shop.id, key)` ซึ่ง query ด้วย `where: { shopId }`
 * **ตั้งแต่ SELECT ไม่ใช่กรองทีหลัง** — key เปล่า ๆ ไม่มีความหมายอะไรเลยถ้าไม่ผูกกับร้านที่ล็อกอินอยู่
 * ("uuid เดายาก" ไม่ใช่ authorization)
 *
 * 🛑 `INVALID_KEY` กับ `NOT_FOUND` ตอบ 404 **เหมือนกันทุกประการ** โดยตั้งใจ — ถ้าแยกข้อความ/สถานะ
 * ผู้โจมตีจะแยกได้ว่า "key นี้มีอยู่จริงแต่เป็นของร้านอื่น" ต่างจาก "ไม่มีอยู่เลย" ซึ่งเป็นการยืนยัน
 * การมีตัวตนของลูกค้าร้านอื่นทีละ key (SRS §8)
 */
import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { requireActiveShop } from '@/lib/shop-context'
import { sessionUserId } from '@/lib/session-user'
import { resolveCustomerByKey } from '@/services/customer-directory.service'

// auth per-user + คืน PII — ห้าม cache ที่ CDN/browser (feedback_auth_api_cache_control)
export const dynamic = 'force-dynamic'

export async function GET(_request: Request, { params }: { params: Promise<{ key: string }> }) {
  const session = await getServerSession(authOptions)
  // "มี session" ≠ "รู้ว่าเป็นใคร" — session callback เติม user.id ให้เฉพาะบางกรณี
  // (`feedback_session_exists_is_not_identity`)
  const userId = sessionUserId(session)
  if (!userId) {
    return NextResponse.json({ error: 'กรุณาเข้าสู่ระบบก่อนใช้งาน' }, { status: 401 })
  }

  /**
   * 🛑 ประกอบ argument จากค่าที่ **ตรวจแล้ว** แทนการ `as unknown as { user: { id: string } }`
   * แบบที่ route อื่นทำ — cast ก้อนนั้นยืนยันรูปร่างที่อาจไม่จริง (ชนิด `Session` ของ NextAuth
   * ไม่มี `id`/`activeShopId` เลย) และเป็นแพตเทิร์นเดียวกับที่เคยทำให้ `undefined` ไหลเข้า
   * `prisma.…({ where: { id: undefined } })` จนทั้งหน้าเป็น 500 บน prod
   * (`docs/conventions/session-exists-is-not-identity.md`)
   */
  const rawActiveShopId = (session as { user?: { activeShopId?: unknown } } | null)?.user
    ?.activeShopId
  const active = await requireActiveShop({
    user: {
      id: userId,
      activeShopId: typeof rawActiveShopId === 'string' ? rawActiveShopId : null,
    },
  })
  if (!active) {
    return NextResponse.json({ error: 'ไม่พบร้านค้า กรุณาเปิดร้านก่อนใช้งาน' }, { status: 404 })
  }

  const { key } = await params

  try {
    const result = await resolveCustomerByKey(active.shop.id, key)
    // ไม่แยก INVALID_KEY ออกจาก NOT_FOUND (ดูหัวไฟล์)
    if (!result.ok) {
      return NextResponse.json({ error: 'ไม่พบข้อมูลลูกค้า' }, { status: 404 })
    }
    if (!result.entry.contactFull) {
      // client ไม่ควรยิงมาถึงตรงนี้ (ไม่ render ปุ่มเมื่อไม่มีข้อมูลติดต่อ) แต่ server ต้องกันเอง
      return NextResponse.json({ error: 'ลูกค้ารายนี้ไม่มีข้อมูลติดต่อ' }, { status: 404 })
    }
    return NextResponse.json(
      { contact: result.entry.contactFull },
      { headers: { 'cache-control': 'private, no-store' } },
    )
  } catch (e) {
    // ฐานล่มต้องไม่กลายเป็น "ไม่พบข้อมูลลูกค้า" — คนละเหตุการณ์ คนละสิ่งที่ผู้ใช้ต้องทำต่อ
    console.error('[GET /api/seller/customers/[key]/contact]', e)
    return NextResponse.json({ error: 'เกิดข้อผิดพลาด กรุณาลองใหม่' }, { status: 500 })
  }
}
