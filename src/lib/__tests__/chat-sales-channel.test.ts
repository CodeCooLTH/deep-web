import { describe, expect, it } from 'vitest'
import { chatChannelToSalesChannel } from '../chat-sales-channel'
import { CHAT_CHANNELS } from '../chat-channel'

describe('[blocker] chatChannelToSalesChannel — ออเดอร์ที่สร้างจากแชทต้องบันทึกช่องทางขายให้ถูก', () => {
  // บั๊กจริง 2026-08-10: LINE ตกหล่นจาก if/else เดิม → ออเดอร์จากแชท LINE ถูกบันทึกเป็น STOREFRONT
  it('LINE → LINE (ไม่ใช่ undefined ที่จะกลายเป็น STOREFRONT)', () => {
    expect(chatChannelToSalesChannel('LINE')).toBe('LINE')
  })

  it('Messenger/Instagram → FACEBOOK (ฟอร์มไม่มีค่า INSTAGRAM แยก)', () => {
    expect(chatChannelToSalesChannel('MESSENGER')).toBe('FACEBOOK')
    expect(chatChannelToSalesChannel('INSTAGRAM')).toBe('FACEBOOK')
  })

  it('DEEP → undefined (แชทในแอปเราเองไม่บอกว่าลูกค้ามาจากช่องทางขายไหน)', () => {
    expect(chatChannelToSalesChannel('DEEP')).toBeUndefined()
  })

  it('ค่าที่ไม่รู้จัก → undefined ไม่ throw', () => {
    expect(chatChannelToSalesChannel('TIKTOK')).toBeUndefined()
    expect(chatChannelToSalesChannel('')).toBeUndefined()
    expect(chatChannelToSalesChannel('line')).toBeUndefined() // case-sensitive โดยตั้งใจ
  })

  // ด่านกันบั๊กเดิมเกิดซ้ำ: ช่องทางแชททุกตัวที่ระบบรู้จักต้องถูกตัดสินแล้ว ไม่ใช่ตกหล่นเงียบ ๆ
  // (LINE เคยอยู่ใน CHAT_CHANNELS มาแล้วแต่ไม่มีใครแมป — เทสนี้จับได้ตั้งแต่วันนั้น)
  it('ทุกค่าใน CHAT_CHANNELS ถูกตัดสินแล้ว — ค่าที่ไม่ใช่ DEEP ห้ามเป็น undefined', () => {
    for (const ch of CHAT_CHANNELS) {
      if (ch === 'DEEP') continue
      expect(chatChannelToSalesChannel(ch), `ช่องทาง ${ch} ยังไม่ถูกแมปเป็นช่องทางขาย`).toBeDefined()
    }
  })
})
