// เลือกร้านของโต๊ะแชท (pure) — ชุดร้านต้องมาจาก listAccessibleShopIds(userId,'X7') ที่ route/หน้าเรียกเอง · client-safe
/**
 * ownerShopIds: ร้านที่ผู้ดูถือ X7 (เรียงตามชื่อแล้ว) · คืน null = ปฏิเสธ (route → 403, preview → 404)
 * ขอ shopId ที่ไม่อยู่ในชุด = null ห้าม fallback ไปร้านอื่น (กันข้ามร้านเงียบ ๆ)
 */
export function pickDeskShop(
  ownerShopIds: readonly string[],
  requested?: string | null,
  activeShopId?: string | null,
): string | null {
  if (ownerShopIds.length === 0) return null
  if (requested) return ownerShopIds.includes(requested) ? requested : null
  if (activeShopId && ownerShopIds.includes(activeShopId)) return activeShopId
  return ownerShopIds[0]
}
