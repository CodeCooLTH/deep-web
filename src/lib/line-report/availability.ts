/**
 * availability — บล็อกไหนใช้ได้/ไม่ได้กับกลุ่มนี้ + เหตุผลภาษาไทย (EXT FR-11-3/11-4 · E-5/E-8/E-9) · pure
 *
 * เหตุผลเดียวกันใช้สองที่: คลัง (disabled+เหตุผล) และผืนงาน (warning "ไม่ถูกส่งตอนนี้")
 * ข้อสังเกต: "ใส่ซ้ำไม่ได้/ครบเพดาน" (โครงสร้าง) แยกจาก "ข้อมูลกลุ่มไม่พร้อม" (บริบท) — อย่างแรกกันไม่ให้เพิ่ม ไม่ใช่เหตุให้ warn บล็อกที่มีอยู่
 */
import { canSumProfit } from '@/lib/line-report/aggregate'
import { resolveShopVertical } from '@/lib/lodging'
import { BLOCK_LIMITS, MAX_BLOCKS, type BlockType, type TemplateV1 } from '@/lib/line-report/template'

export type AvailabilityContext = {
  monthlyEnabled: boolean
  /** ร้านในกลุ่มที่ "นับได้" ตอนนี้ (ไม่รวมล็อก/ลบ) — ใช้ vertical ดิบ ตัดสินด้วย resolveShopVertical */
  shops: readonly { vertical: string | null }[]
}

export const REASON = {
  CYCLE_NEEDS_MONTHLY: 'ใช้ได้เมื่อเปิดรายงานรายเดือน',
  COMPARE_NEEDS_MULTI: 'ใช้ได้เมื่อกลุ่มรวมมากกว่า 1 ร้าน',
  TOP3_NO_LODGING: 'ไม่มีให้ร้านบ้านพัก (ไม่มีรายการสินค้า)',
  USED_UP: 'ใช้ครบแล้ว',
  BLOCKS_FULL: 'ครบ 20 บล็อกแล้ว',
  EXPENSE_MIXED_RULES: 'กลุ่มนี้มีร้านต่างประเภทธุรกิจ จึงไม่รวมค่าใช้จ่ายเป็นยอดเดียว',
} as const

export type Availability = { ok: true } | { ok: false; reason: string }
const OK: Availability = { ok: true }
const no = (reason: string): Availability => ({ ok: false, reason })

/** เงื่อนไขขึ้นกับข้อมูลกลุ่มเท่านั้น (ไม่ดูว่าใส่ไปกี่บล็อกแล้ว) */
export function contextAvailability(type: BlockType, ctx: AvailabilityContext): Availability {
  if (type === 'cycle') return ctx.monthlyEnabled ? OK : no(REASON.CYCLE_NEEDS_MONTHLY)
  if (type === 'chart_compare') return ctx.shops.length > 1 ? OK : no(REASON.COMPARE_NEEDS_MULTI)
  return OK
}

/** Top3 เป็นตัวเลือกย่อยของ shops: ไม่มีให้เมื่อทุกร้านเป็น LODGING ล้วน (ผสมได้ — ร้านบ้านพักถูกข้ามเอง) */
export function top3Availability(ctx: AvailabilityContext): Availability {
  const all = ctx.shops.length > 0 && ctx.shops.every((s) => resolveShopVertical(s.vertical) === 'LODGING')
  return all ? no(REASON.TOP3_NO_LODGING) : OK
}

/** คลัง: เพิ่มบล็อกชนิดนี้ได้ไหมตอนนี้ — ครบเพดานก่อน แล้วค่อยเงื่อนไขกลุ่ม */
export function libraryAvailability(type: BlockType, t: TemplateV1, ctx: AvailabilityContext): Availability {
  const used = t.blocks.filter((b) => b.type === type).length
  if (used >= BLOCK_LIMITS[type]) return no(BLOCK_LIMITS[type] === 1 ? REASON.USED_UP : `ใช้ครบ ${BLOCK_LIMITS[type]} บล็อกแล้ว`)
  if (t.blocks.length >= MAX_BLOCKS) return no(REASON.BLOCKS_FULL)
  return contextAvailability(type, ctx)
}

/** ผืนงาน: เหตุผลที่บล็อกที่มีอยู่ "ไม่ถูกส่งตอนนี้" — null = ส่งได้ปกติ (ไม่ลบเงียบ, FR-11-4) */
export function blockWarning(b: TemplateV1['blocks'][number], ctx: AvailabilityContext): string | null {
  const a = contextAvailability(b.type, ctx)
  if (!a.ok) return `ไม่ถูกส่งตอนนี้ (${a.reason})`
  if ((b.type === 'expense' || b.type === 'net_sales') && !canSumProfit(ctx.shops)) return `ไม่ถูกส่งตอนนี้ (${REASON.EXPENSE_MIXED_RULES})`
  if (b.type === 'shops' && b.top3) {
    const t = top3Availability(ctx)
    if (!t.ok) return `ขายดี 3 อันดับไม่ถูกส่งตอนนี้ (${t.reason})`
  }
  return null
}
