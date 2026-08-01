import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { resolveActiveShopContext } from '@/lib/shop-context'

/**
 * auto-reply-route-context — ตัวช่วยยืนยันตัวตน + ขอบเขตร้าน สำหรับ route ของ feature 00023
 *
 * WARNING: `shopId` derive จาก session เท่านั้น (`resolveActiveShopContext` re-verify membership
 * ทุกครั้ง) **ห้ามรับ shopId จาก client** ในทุก endpoint ของฟีเจอร์นี้
 * pattern เดียวกับ `api/shops/ai-settings` และ `api/chat/quick-messages`
 *
 * WARNING: การตัดสินสิทธิ์อยู่ที่ชั้น route เท่านั้น (SDS §3.2) — service ห้ามรับ role
 * เข้าไปตัดสินเอง ถ้าย้ายไปตัดสินใน service เมื่อไหร่จะตรวจไม่ได้ว่าครบทุกเส้นทางหรือไม่
 */

/**
 * role ที่แก้ไขการตั้งค่าได้ (AC-004-01)
 *
 * NOTE (2026-08-01): ระบบมีแค่ `OWNER` (คนสร้างร้าน) กับ `ADMIN` (ทุกคนที่ถูกเชิญเข้ามา
 * ทั้ง `shop-member.service` และ `invite-link.service` ใส่ `ADMIN` เสมอ) — **ไม่มี role
 * `STAFF` อยู่จริงในสคีมา** คอมเมนต์เดิมที่เขียนว่า "STAFF อ่านได้อย่างเดียว" จึงชวนเข้าใจผิด
 * ว่ามีทางเกิด 403 จาก role ซึ่งไม่มี — `canEdit` จาก role เป็น true เสมอสำหรับสมาชิกทุกคน
 * (user ยืนยัน 2026-08-01 ว่าไม่เปลี่ยนสิทธิ์ใคร แค่แก้เอกสาร/เทสให้ตรงความจริง)
 */
const EDITABLE_ROLES = ['OWNER', 'ADMIN'] as const

export const AUTO_REPLY_NO_STORE = {
  'Cache-Control': 'private, no-store, max-age=0, must-revalidate',
} as const

export type ShopRouteContext = {
  userId: string
  shopId: string
  canEdit: boolean
  /** ร้าน Business ที่โดน package lock — อ่านได้แต่เขียนไม่ได้ (`Shop.packageLockedAt`) */
  locked: boolean
  lockReason: string | null
}

export async function requireShopContext(): Promise<ShopRouteContext | { error: NextResponse }> {
  const session = await getServerSession(authOptions)
  if (!session?.user) {
    return { error: NextResponse.json({ error: 'unauthorized' }, { status: 401 }) }
  }
  const userId = (session.user as { id: string }).id
  const activeCtx = await resolveActiveShopContext({
    user: {
      id: userId,
      activeShopId:
        ((session.user as { activeShopId?: string | null }).activeShopId as string | null | undefined) ?? null,
    },
  })
  if (!activeCtx) {
    return { error: NextResponse.json({ error: 'ไม่พบร้านที่กำลังใช้งาน' }, { status: 404 }) }
  }
  return {
    userId,
    shopId: activeCtx.shopId,
    canEdit: (EDITABLE_ROLES as readonly string[]).includes(activeCtx.role),
    locked: activeCtx.locked,
    lockReason: activeCtx.lockReason,
  }
}

/**
 * ใช้กับทุก endpoint ที่เขียนข้อมูล (AC-004-03)
 *
 * WARNING: ตรวจ **สองอย่าง** ไม่ใช่อย่างเดียว:
 *   1. role แก้ไขได้ไหม — วันนี้เป็นจริงเสมอ (ไม่มี role STAFF ในระบบ ดูหมายเหตุที่ EDITABLE_ROLES)
 *      คงไว้เพื่อให้ยังทำงานถูกถ้าวันหนึ่งมี role อ่านอย่างเดียวเพิ่มเข้ามา
 *   2. **ร้านโดน package lock อยู่ไหม** — เดิมไม่เคยตรวจเลยทั้งที่ `resolveActiveShopContext`
 *      คืน `locked` ให้อยู่แล้ว ทำให้ร้าน Business ที่ถูกล็อกยังเขียนได้ทุก endpoint ของฟีเจอร์นี้
 *      (พบ 2026-08-01 ตอนเขียน TestCase — `API.md` อ้าง SHOP_LOCKED มาตลอดแต่ไม่เคย implement)
 */
export function forbidIfReadOnly(ctx: ShopRouteContext): NextResponse | null {
  if (ctx.locked) {
    return NextResponse.json(
      {
        error: ctx.lockReason
          ? `ร้านนี้ถูกระงับการแก้ไขชั่วคราว (${ctx.lockReason}) — ต่ออายุแพ็กเกจแล้วจะกลับมาแก้ไขได้ทันที`
          : 'ร้านนี้ถูกระงับการแก้ไขชั่วคราว — ต่ออายุแพ็กเกจแล้วจะกลับมาแก้ไขได้ทันที',
      },
      { status: 403 }
    )
  }
  if (ctx.canEdit) return null
  return NextResponse.json({ error: 'ไม่มีสิทธิ์แก้ไขการตั้งค่านี้' }, { status: 403 })
}

/**
 * ตาราง error → HTTP + ข้อความไทย เทียบด้วย **รหัสเต็มแบบ exact** (ไม่ใช่ `includes`)
 *
 * WARNING: ห้ามกลับไปใช้บันได `msg.includes(...)` เด็ดขาด — รหัสในฟีเจอร์นี้มี substring
 * ซ้อนกันหลายชั้น (`NAME_DUPLICATE` / `DUPLICATE_NAME_EXHAUSTED` / `CONDITION_DUPLICATE`)
 * ทำให้ลำดับ guard ตัดสินผลลัพธ์ และเคยเป็นบั๊กจริง: `includes('DUPLICATE_NAME')` อยู่ก่อน
 * `includes('DUPLICATE')` แต่ service โยน `..._NAME_DUPLICATE` (ลำดับคำกลับกัน) → ตกสาขา
 * generic ได้ข้อความรวม ๆ ส่วน `DUPLICATE_NAME_EXHAUSTED` เข้าสาขาแรกแล้วได้ข้อความผิดเรื่อง
 * exact-match ไม่มีปัญหาลำดับ เพิ่มรหัสใหม่ได้โดยไม่ต้องคิดว่าต้องแทรกไว้ก่อน/หลังใคร
 *
 * ข้อความทุกบรรทัดผ่าน review copy มาแล้ว (Design Spec v3) — บอก "ทางออก" ให้ผู้ใช้ทุกข้อ
 * ห้ามเรียบเรียงใหม่โดยไม่ผ่าน review
 *
 * NOTE: สองสาขาชื่อ `REQUIRES_*` (แบบ "ต้องมีคำ" / "ต้องมีคำตอบ") ถูกลบทิ้งแล้ว เพราะไม่มี
 * service ตัวไหนโยนรหัสสองตัวนั้นเลย — ของจริงชื่อ `..._NO_PHRASE` / `..._NO_ANSWER` ตามตาราง
 * ข้างล่าง สาขาตายพวกนั้นทำให้เข้าใจผิดว่าเคสนี้ถูกครอบแล้วทั้งที่ผู้ใช้ยังเจอ 500
 * (รหัสที่ถูกลบ grep หาไม่เจอแล้วตามเจตนาของเกต — ที่มาเต็มดูที่ S-02 ใน
 *  docs/scope/2026-07-30-00023-v3-scope-baseline.md)
 *
 * ใช้ `Map` ไม่ใช่ object literal เพราะ lookup ด้วยค่าที่มาจากภายนอก: `ERROR_MAP['toString']`
 * บน object literal จะคืน method ของ prototype ซึ่ง truthy แต่ `.status` เป็น undefined →
 * `NextResponse.json(..., { status: undefined })` ให้ **HTTP 200 body ว่าง** = error กลายเป็น
 * success เงียบ ๆ และไม่มี log (วัดกับ node แล้ว). `Map` ไม่มี prototype key ให้ชนตั้งแต่ต้น
 */
const ERROR_MAP = new Map<string, { status: number; error: string }>(
  Object.entries({
  AUTO_REPLY_KEYWORD_NO_PHRASE: {
    status: 400,
    error: 'เปิดใช้ไม่ได้ — กลุ่มนี้ยังไม่มีคำตรวจจับ เพิ่มอย่างน้อย 1 คำก่อน',
  },
  AUTO_REPLY_KEYWORD_NO_ANSWER: {
    status: 400,
    error: 'เปิดใช้ไม่ได้ — ยังไม่มีข้อความตอบกลับ ใส่ "คำตอบปกติ" ก่อน',
  },
  AUTO_REPLY_KEYWORD_NO_TEST_THREAD: {
    status: 400,
    error: 'ยังตั้งเป็นโหมดทดสอบไม่ได้ — เลือกแชทสำหรับทดสอบอย่างน้อย 1 แชทก่อน',
  },
  AUTO_REPLY_KEYWORD_LAST_PHRASE: {
    status: 400,
    error:
      'ลบคำสุดท้ายไม่ได้ตอนกลุ่มนี้ยังทำงานอยู่ — เปลี่ยนเป็น "ไม่ใช้งาน" ก่อน หรือเพิ่มคำอื่นแทน',
  },
  AUTO_REPLY_KEYWORD_LAST_ANSWER: {
    status: 400,
    error: 'ลบคำตอบสุดท้ายไม่ได้ตอนกลุ่มนี้ยังทำงานอยู่ — ต้องเหลือคำตอบไว้อย่างน้อย 1 ข้อ',
  },
  AUTO_REPLY_KEYWORD_NAME_EMPTY: { status: 400, error: 'ตั้งชื่อกลุ่มคำก่อนบันทึก' },
  AUTO_REPLY_KEYWORD_NAME_TOO_LONG: {
    status: 400,
    error: 'ชื่อกลุ่มคำยาวเกินกำหนด ย่อให้สั้นลง',
  },
  AUTO_REPLY_KEYWORD_NAME_DUPLICATE: {
    status: 409,
    error: 'ชื่อนี้ใช้กับกลุ่มคำอื่นในร้านแล้ว ตั้งชื่ออื่นที่ไม่ซ้ำ',
  },
  AUTO_REPLY_KEYWORD_DUPLICATE_NAME_EXHAUSTED: {
    status: 409,
    error: 'ทำสำเนาไม่ได้ — มีกลุ่มคำชื่อคล้ายกันมากเกินไป เปลี่ยนชื่อต้นทางก่อน',
  },
  AUTO_REPLY_RULE_AD_REQUIRES_CHANNEL: {
    status: 400,
    error: 'เงื่อนไขที่ระบุโฆษณาต้องระบุเพจด้วย — เลือกเพจที่โฆษณานั้นวิ่งอยู่',
  },
  AUTO_REPLY_RULE_CENTRAL_CANNOT_HAVE_AD_OR_PRODUCT: {
    status: 400,
    error: 'เงื่อนไขระดับร้านระบุโฆษณาหรือสินค้าไม่ได้',
  },
  AUTO_REPLY_RULE_CONDITION_DUPLICATE: {
    status: 409,
    error: 'มีเงื่อนไขเฉพาะที่ใช้เงื่อนไขชุดนี้อยู่แล้ว — แก้ข้อเดิมแทนการเพิ่มข้อใหม่',
  },
  // รหัสเดียวจริง ๆ (`AUTO_REPLY_RULE_EMPTY_REPLY`) จึงอยู่ในตารางไม่ใช่ suffix rule
  AUTO_REPLY_RULE_EMPTY_REPLY: { status: 400, error: 'คำตอบต้องไม่เป็นค่าว่าง' },
  }),
)

/** แปลง error จาก service เป็น HTTP status — service โยน Error ที่มี message เป็นรหัส */
export function mapServiceError(e: unknown, fallbackMessage: string): NextResponse {
  const msg = e instanceof Error ? e.message : String(e)

  const mapped = ERROR_MAP.get(msg)
  if (mapped) {
    return NextResponse.json({ error: mapped.error }, { status: mapped.status })
  }

  // NOT_FOUND เทียบ suffix ต่อ เพราะมี 5 รหัสที่ prefix ต่างกันแต่ความหมายเดียวกัน
  // (`AUTO_REPLY_KEYWORD_NOT_FOUND`, `AUTO_REPLY_PHRASE_NOT_FOUND`, `AUTO_REPLY_RULE_NOT_FOUND`,
  // `AUTO_REPLY_RULE_CHANNEL_NOT_FOUND`, `AUTO_REPLY_RULE_PRODUCT_NOT_FOUND`) การใส่ทุกตัวลงตาราง
  // จะพลาดง่ายเมื่อ service เพิ่ม entity ใหม่ — ใช้ `endsWith` ไม่ใช่ `includes` เพื่อไม่ให้ชน
  // รหัสที่มีคำนี้อยู่กลางสตริง
  //
  // บังคับ prefix `AUTO_REPLY_` ร่วมด้วย เพราะโค้ดเบสมี `SHOP_NOT_FOUND` / `CONVERSATION_NOT_FOUND`
  // / `PRODUCT_NOT_FOUND` อยู่จริง — วันที่ใครขยาย try ให้ครอบ service อื่น รหัสพวกนั้นจะได้ 404
  // เงียบ ๆ โดยไม่มีร่องรอยใน log ซึ่งเป็นอาการที่ debug ยากที่สุด
  if (msg.startsWith('AUTO_REPLY_') && msg.endsWith('NOT_FOUND')) {
    return NextResponse.json({ error: 'ไม่พบรายการที่ต้องการ' }, { status: 404 })
  }

  console.error('[auto-reply-api]', msg)
  return NextResponse.json({ error: fallbackMessage }, { status: 500 })
}
