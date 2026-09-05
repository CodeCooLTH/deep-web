import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'

import { authOptions } from '@/lib/auth'
import { requireActiveShop } from '@/lib/shop-context'
import { sessionUserId } from '@/lib/session-user'
import { resolveShopVertical } from '@/lib/lodging'
import {
  VerticalNotSupportedError,
  MessageEchoesNotGrantedError,
  PhraseDuplicateError,
  PhraseMinOneError,
  TestThreadRequiredError,
} from '@/services/auto-order-config.service'

/**
 * ด่านร่วมของทุก endpoint ใน `/api/seller/auto-order/*` (00061)
 *
 * 🛑 `shopId` มาจาก active shop ของ session เท่านั้น ห้ามรับจาก body/query —
 * membership guard ได้มาฟรีจาก `requireActiveShop`
 *
 * 🛑 ด่าน vertical อยู่ **ที่นี่ด้วย** ไม่ใช่แค่ใน `setAutoOrderStatus()` — เพราะ endpoint
 * อ่าน/ตั้งค่าวลี/เพจ ก็ต้องปิดสำหรับร้านที่ไม่ใช่ ONLINE_SALES เหมือนกัน (AC-ACO-09
 * พูดถึง "route" ไม่ใช่ "ปุ่มเปิดใช้งาน") — ถ้ากันแค่จุดเปิด ร้านคิวงานจะตั้งวลีเก็บไว้ได้
 * แล้วเจอ 403 ตอนกดเปิดเท่านั้น ซึ่งเป็นประสบการณ์ที่เสียเวลาเปล่า
 */
export async function requireAutoOrderShop(): Promise<
  { ok: true; shopId: string; userId: string } | { ok: false; response: NextResponse }
> {
  const session = await getServerSession(authOptions)
  // 🛑 "มี session" ≠ "รู้ว่าเป็นใคร" — ตรวจสิ่งที่จะเอาไปใช้จริง (id) ไม่ใช่กล่องที่ห่อมันอยู่
  const userId = sessionUserId(session)
  if (!userId) {
    return {
      ok: false,
      response: NextResponse.json({ error: 'กรุณาเข้าสู่ระบบก่อนใช้งาน' }, { status: 401 }),
    }
  }
  const active = await requireActiveShop(
    session as unknown as { user: { id: string; activeShopId?: string | null } },
  )
  if (!active) {
    return {
      ok: false,
      response: NextResponse.json({ error: 'ไม่พบร้านค้า กรุณาเปิดร้านก่อนใช้งาน' }, { status: 404 }),
    }
  }
  if (resolveShopVertical(active.shop.vertical) !== 'ONLINE_SALES') {
    return {
      ok: false,
      response: NextResponse.json(
        { error: 'ระบบสร้างออเดอร์อัตโนมัติใช้ได้กับร้านขายออนไลน์เท่านั้น' },
        { status: 403 },
      ),
    }
  }
  return { ok: true, shopId: active.shop.id, userId }
}

/**
 * แปลง error ของ service เป็น HTTP status + ข้อความไทย
 *
 * 🛑 error ใหม่ทุกตัวต้องมีที่ยืนที่นี่ — error ที่ไม่มี mapping จะตกเป็น 500 ดิบ แล้วผู้ใช้
 * เห็น "เกิดข้อผิดพลาด" ทั้งที่ระบบรู้เหตุผลชัดเจน (`feedback_service_error_route_mapping`)
 */
export function mapAutoOrderError(e: unknown): NextResponse | null {
  if (e instanceof VerticalNotSupportedError) {
    return NextResponse.json(
      { error: 'ระบบสร้างออเดอร์อัตโนมัติใช้ได้กับร้านขายออนไลน์เท่านั้น' },
      { status: 403 },
    )
  }
  if (e instanceof MessageEchoesNotGrantedError) {
    return NextResponse.json(
      {
        error: 'ยังเปิดใช้งานไม่ได้ — เพจต่อไปนี้ยังไม่ได้ให้สิทธิ์รับข้อความที่ร้านพิมพ์เอง',
        // ต้องบอกว่า "เพจไหน" ไม่ใช่แค่ "ทำไม่ได้" — ร้านที่มีหลายเพจต้องรู้ว่าต้องไปซ่อมอันไหน
        channels: e.channelNames,
        code: 'MESSAGE_ECHOES_NOT_GRANTED',
      },
      { status: 409 },
    )
  }
  if (e instanceof TestThreadRequiredError) {
    return NextResponse.json(
      { error: 'โหมดทดสอบต้องเลือกห้องแชทอย่างน้อย 1 ห้อง', code: 'TEST_THREAD_REQUIRED' },
      { status: 409 },
    )
  }
  if (e instanceof PhraseDuplicateError) {
    return NextResponse.json(
      { error: `วลี "${e.phrase}" ซ้ำกับวลีอื่นในชุดนี้`, code: 'PHRASE_DUPLICATE' },
      { status: 400 },
    )
  }
  if (e instanceof PhraseMinOneError) {
    return NextResponse.json(
      { error: 'ต้องมีวลีจุดชนวนอย่างน้อย 1 วลี', code: 'PHRASE_MIN_ONE' },
      { status: 400 },
    )
  }
  return null
}
