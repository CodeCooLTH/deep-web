/**
 * ตัวช่วยร่วมของ /api/shops/current/shortcuts/** (feature 00027)
 *
 * รวม auth + การแปลง error -> HTTP ไว้ที่เดียว เพราะทั้ง 4 endpoint ใช้กติกาเดียวกันเป๊ะ
 * ถ้าปล่อยให้แต่ละ route เขียน catch เอง วันที่เพิ่ม error type ใหม่จะมี route ที่ลืมครอบ
 * แล้วผู้ใช้ได้ 500 แทน 4xx (บทเรียน feature 00003 — memory feedback_service_error_route_mapping)
 */
import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import {
  ShortcutSlugNotInCatalogError,
  ShortcutCapExceededError,
  ShortcutMinRequiredError,
  MAX_SHORTCUTS,
  type ShortcutAccessResult,
} from '@/services/shortcut.service'

/** slug ของเมนูทุกตัวใน sellerMenuItems อยู่ในรูป `seller:xxx-yyy` */
const SLUG_PATTERN = /^seller:[a-z][a-z-]*$/

/**
 * NextAuth Session ไม่ประกาศ `id`/`activeShopId` (โปรเจกต์นี้ไม่มี d.ts augmentation)
 * จึงต้อง cast ที่จุดรับ — ทำที่นี่ครั้งเดียวแทนที่จะ cast ซ้ำในทุก route
 * (pattern เดียวกับ api/seller/products/[id]/pin/route.ts)
 */
type SellerSession = { user: { id: string; activeShopId?: string | null } }

export async function getSessionOr401() {
  const session = await getServerSession(authOptions)
  if (!session?.user) {
    return {
      session: null,
      response: NextResponse.json({ error: 'กรุณาเข้าสู่ระบบ', code: 'UNAUTHORIZED' }, { status: 401 }),
    }
  }
  return { session: session as unknown as SellerSession, response: null }
}

export function validateSlug(raw: string) {
  return SLUG_PATTERN.test(raw)
}

/** NO_SHOP -> 404, OK -> 200 พร้อม payload หน้าตาเดียวกันทุก endpoint (client sync จาก response ตรง ๆ ได้) */
export function respond(result: ShortcutAccessResult) {
  if (result.kind === 'NO_SHOP') {
    return NextResponse.json({ error: 'ไม่พบร้านค้า', code: 'SHOP_NOT_FOUND' }, { status: 404 })
  }
  return NextResponse.json({
    catalog: result.catalog,
    pinnedSlugs: result.pinnedSlugs,
    unavailable: result.unavailable,
    tiles: result.tiles,
    isDefault: result.isDefault,
    max: MAX_SHORTCUTS,
  })
}

export function handleShortcutError(e: unknown, where: string) {
  if (e instanceof ShortcutSlugNotInCatalogError) {
    return NextResponse.json(
      { error: 'เมนูนี้ใช้ไม่ได้กับร้านนี้', code: 'SLUG_NOT_IN_CATALOG' },
      { status: 403 },
    )
  }
  if (e instanceof ShortcutCapExceededError) {
    return NextResponse.json(
      { error: `เมนูลัดเก็บได้สูงสุด ${MAX_SHORTCUTS} ช่อง เอาช่องเดิมออกก่อนถึงจะเพิ่มได้`, code: 'CAP_EXCEEDED' },
      { status: 409 },
    )
  }
  if (e instanceof ShortcutMinRequiredError) {
    return NextResponse.json(
      { error: 'ต้องเหลือเมนูลัดอย่างน้อย 1 ช่อง', code: 'MIN_REQUIRED' },
      { status: 409 },
    )
  }
  console.error(`[${where}]`, e instanceof Error ? e.message : e)
  return NextResponse.json({ error: 'เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง', code: 'INTERNAL_ERROR' }, { status: 500 })
}
