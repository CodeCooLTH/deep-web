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

/** role ที่แก้ไขการตั้งค่าได้ (AC-004-01) — STAFF อ่านได้อย่างเดียว */
const EDITABLE_ROLES = ['OWNER', 'ADMIN'] as const

export const AUTO_REPLY_NO_STORE = {
  'Cache-Control': 'private, no-store, max-age=0, must-revalidate',
} as const

export type ShopRouteContext = { userId: string; shopId: string; canEdit: boolean }

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
  }
}

/** ใช้กับทุก endpoint ที่เขียนข้อมูล — STAFF ต้องถูกปฏิเสธเสมอ (AC-004-03) */
export function forbidIfReadOnly(ctx: ShopRouteContext): NextResponse | null {
  if (ctx.canEdit) return null
  return NextResponse.json({ error: 'ไม่มีสิทธิ์แก้ไขการตั้งค่านี้' }, { status: 403 })
}

/** แปลง error จาก service เป็น HTTP status — service โยน Error ที่มี message เป็นรหัส */
export function mapServiceError(e: unknown, fallbackMessage: string): NextResponse {
  const msg = e instanceof Error ? e.message : String(e)

  if (msg.includes('NOT_FOUND')) {
    return NextResponse.json({ error: 'ไม่พบรายการที่ต้องการ' }, { status: 404 })
  }
  if (msg.includes('DUPLICATE_NAME')) {
    return NextResponse.json({ error: 'ชื่อกลุ่มคำนี้มีอยู่แล้วในร้าน' }, { status: 409 })
  }
  if (msg.includes('DUPLICATE')) {
    return NextResponse.json({ error: 'รายการนี้ซ้ำกับที่มีอยู่แล้ว' }, { status: 409 })
  }
  if (msg.includes('REQUIRES_PHRASE')) {
    return NextResponse.json(
      { error: 'กลุ่มคำที่เปิดใช้งานต้องมีคำตรวจจับอย่างน้อย 1 คำ' },
      { status: 400 },
    )
  }
  if (msg.includes('REQUIRES_REPLY')) {
    return NextResponse.json(
      { error: 'กลุ่มคำที่เปิดใช้งานต้องมีคำตอบอย่างน้อย 1 ระดับ' },
      { status: 400 },
    )
  }
  if (msg.includes('EMPTY_REPLY')) {
    return NextResponse.json({ error: 'คำตอบต้องไม่เป็นค่าว่าง' }, { status: 400 })
  }

  console.error('[auto-reply-api]', msg)
  return NextResponse.json({ error: fallbackMessage }, { status: 500 })
}
