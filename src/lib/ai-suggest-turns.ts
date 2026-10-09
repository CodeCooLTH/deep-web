import type { SuggestTurn } from '@/lib/gemini'

type Row = { senderRole: string; type: string; body: string | null; productRefId: string | null }

/**
 * ประกอบ transcript ส่งเข้า AI — คัดมาจาก ai-suggest/route.ts (ตัวประกอบเดิม) เพื่อให้ทั้งสองผู้ให้บริการใช้ร่วมกัน
 * externalSafe=true: สื่อไม่ออกไปเลย เหลือแค่ป้ายชนิด (FR-AIT-18) · caption ยังตามเข้ามาแต่ต้องผ่าน sanitize ทีหลัง
 * externalSafe=false: พฤติกรรมเดิมทุกประการ (VIDEO/FILE ใช้ body ตามเดิม)
 */
export function buildSuggestTurns(
  rows: Row[],
  opts: {
    productCards: Map<string, { name: string; price: string; isActive: boolean }>
    includeProductContext: boolean
    externalSafe: boolean
  },
): SuggestTurn[] {
  return rows
    .map((m) => {
      const role: 'BUYER' | 'SHOP' = m.senderRole === 'SHOP' ? 'SHOP' : 'BUYER'
      let text = m.body ?? ''
      if (opts.externalSafe && m.type !== 'TEXT' && m.type !== 'PRODUCT') {
        // allow-list: เฉพาะสื่อที่รู้จักส่ง caption ต่อ · ชนิดอื่น (LOCATION/CONTACT/STICKER ฯลฯ) body อาจเป็นพิกัด/เบอร์ → ไม่ส่ง body
        const label =
          m.type === 'IMAGE' ? '[รูป]' : m.type === 'AUDIO' ? '[ข้อความเสียง]' : m.type === 'VIDEO' || m.type === 'FILE' ? '[ไฟล์]' : null
        text = label ? (m.body ? `${label} ${m.body}` : label) : '[ไฟล์]'
      } else if (m.type === 'IMAGE') text = m.body ? `[รูปภาพ] ${m.body}` : '[ส่งรูปภาพ]'
      else if (m.type === 'AUDIO') text = m.body ? `[ข้อความเสียง] ${m.body}` : '[ส่งข้อความเสียง]'
      else if (m.type === 'PRODUCT') {
        const card = m.productRefId ? opts.productCards.get(m.productRefId) : undefined
        if (card) {
          const state = card.isActive ? 'เปิดขาย' : 'ปิดขายแล้ว'
          text = `[ส่งการ์ดสินค้า: ${card.name} — ${card.price} บาท (${state})]`
        } else if (opts.includeProductContext && m.productRefId) {
          // หาไม่เจอ = สินค้าถูกลบ — บอก AI ตรง ๆ ว่าอ้างอิงราคาไม่ได้ (AC-004-02)
          text = '[ส่งการ์ดสินค้า: สินค้าถูกลบแล้ว]'
        } else {
          text = '[ส่งการ์ดสินค้า]'
        }
      }
      return { role, text: text.trim() }
    })
    .filter((t) => t.text.length > 0)
}
