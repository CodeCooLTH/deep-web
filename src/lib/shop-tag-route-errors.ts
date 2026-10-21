/** 00083 — map ShopTagError → HTTP (API §5) · Record บังคับ tsc ให้ครบทุก code · ศัพท์ "แท็ก" แก้ที่ตารางนี้ที่เดียว */
import { jsonNoStore } from '@/lib/shop-api-guard'
import { ShopTagError, type ShopTagErrorCode } from '@/services/shop-tag.service'

export const SHOP_TAG_ERRORS: Record<ShopTagErrorCode, { status: number; message: string }> = {
  VALIDATION_ERROR: { status: 400, message: 'ข้อมูลแท็กไม่ถูกต้อง' },
  SHOP_LOCKED: { status: 403, message: 'ร้านนี้ถูกระงับการแก้ไขชั่วคราวตามสถานะแพ็กเกจ' },
  TAG_NOT_FOUND: { status: 404, message: 'ไม่พบแท็กนี้ในร้าน' },
  TAG_NAME_TAKEN: { status: 409, message: 'มีแท็กชื่อนี้ในร้านแล้ว — ใช้ชื่ออื่น หรือแก้ตัวเดิมแทน' },
  TAG_LIMIT_REACHED: { status: 409, message: 'ร้านมีแท็กครบ 50 แล้ว — ลบแท็กที่ไม่ใช้ก่อนเพิ่มใหม่' },
  KEYWORD_TAG_LIMIT_REACHED: { status: 409, message: 'ตั้งคำให้แท็กติดอัตโนมัติได้สูงสุด 20 แท็ก — เอาคำออกจากแท็กอื่นก่อน' },
}

export function shopTagErrorResponse(e: unknown, tag: string) {
  if (e instanceof ShopTagError) {
    const m = SHOP_TAG_ERRORS[e.code]
    return jsonNoStore({ error: e.code, message: m.message }, { status: m.status })
  }
  console.error(`[shop-tags] ${tag}`, e)
  return jsonNoStore({ error: 'INTERNAL_ERROR' }, { status: 500 })
}

export const shopLockedResponse = () =>
  jsonNoStore({ error: 'SHOP_LOCKED', message: SHOP_TAG_ERRORS.SHOP_LOCKED.message }, { status: 403 })

// ตัดคอลัมน์ภายใน (shopId · nameKey · createdByUserId) ออกก่อนส่งให้ client — rooms ไม่ส่งเพราะหน้าโหลดรายการใหม่หลังแก้ทุกครั้ง
export const toPublicTag = (t: { id: string; name: string; keywords: string[]; removeOnOrderCreate: boolean; createdAt: Date }) => ({
  id: t.id,
  name: t.name,
  registered: true as const,
  keywords: t.keywords,
  removeOnOrderCreate: t.removeOnOrderCreate,
  createdAt: t.createdAt,
})
