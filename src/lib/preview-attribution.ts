// ตัดสินคำนำหน้าพรีวิว "ข้อความล่าสุด" ในแถวรายการแชท — client-safe · ทดสอบใน preview-attribution.test.ts
//
// ข้อความระบบแจ้ง (AUTO_NOTICE, 00078) ตั้งใจไม่เปลี่ยน lastSenderRole (ให้ร้านยังขึ้น "รอตอบ")
// แต่พรีวิวเป็นข้อความของระบบ → ถ้าดู lastSenderRole อย่างเดียว ฝั่งผู้ซื้อจะเห็นข้อความร้านภายใต้ "คุณ:"
// และฝั่งร้านจะเห็นเหมือนลูกค้าพิมพ์เอง จึงต้องแยกแหล่งที่มาออกมาเป็นของตัวเอง
export type PreviewViewer = 'SELLER' | 'BUYER'
export type PreviewPrefix = 'YOU' | 'SYSTEM' | null

export function previewPrefix(
  viewer: PreviewViewer,
  c: { lastSenderRole: 'BUYER' | 'SHOP' | null; lastMessageIsSystem?: boolean; hasPreview: boolean },
): PreviewPrefix {
  if (!c.hasPreview) return null
  // ฝั่งผู้ซื้อ ข้อความระบบคือเสียงของร้าน — ไม่มีคำนำหน้า (ห้ามขึ้น "คุณ:")
  if (c.lastMessageIsSystem) return viewer === 'SELLER' ? 'SYSTEM' : null
  const mine = viewer === 'SELLER' ? 'SHOP' : 'BUYER'
  return c.lastSenderRole === mine ? 'YOU' : null
}
