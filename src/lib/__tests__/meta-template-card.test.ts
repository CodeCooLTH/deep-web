import { describe, it, expect } from 'vitest'
import { composeStructuredText, CARD_PREFIX } from '@/services/channel-chat.service'
import { parseMetaSystemNotice } from '@/lib/meta-system-notice'

/**
 * bug จริง prod 2026-08-07 (user report + screenshot): การ์ดของ Meta ที่มาทาง webhook ขึ้นเป็น
 * บับเบิลสีร้าน ดูเหมือนแอดมินพิมพ์ว่า "฿360.00 order" เอง — 63 แถวและยังเพิ่มทุกวัน
 * payload ทุกก้อนในไฟล์นี้คัดลอกจาก `ChatMessage.rawMessage` บน prod ไม่ได้แต่งขึ้น
 */
describe('composeStructuredText — การ์ดจาก Meta', () => {
  it('การ์ดคำขอชำระเงิน → มีคำนำหน้า + subtitle (เดิมได้แค่ title ดิบ)', () => {
    const out = composeStructuredText('template', {
      template_type: 'generic',
      elements: [
        { title: '฿360.00 order', subtitle: 'Waiting for payment', buttons: [{ title: 'Attach bank slip' }] },
      ],
    })
    expect(out).toBe(`${CARD_PREFIX} ฿360.00 order — Waiting for payment`)
    // ต้องไปโผล่เป็น "บรรทัดระบบ" ไม่ใช่บับเบิลสีร้าน
    expect(parseMetaSystemNotice(out)).not.toBeNull()
  })

  it('ไม่เอาชื่อปุ่มมาแสดง — กดแทนลูกค้าไม่ได้', () => {
    const out = composeStructuredText('template', {
      template_type: 'generic',
      elements: [{ title: '฿590.00 order', subtitle: 'Waiting for payment', buttons: [{ title: 'Attach bank slip' }] }],
    })
    expect(out).not.toContain('Attach bank slip')
  })

  it('การ์ดชวนโทร (icon-template) → การ์ด ไม่ใช่ข้อความดิบ', () => {
    const out = composeStructuredText('template', {
      template_type: 'icon-template',
      elements: [{ title: 'ส่งคำขอโทรแล้ว', subtitle: 'โทรเลยเพื่อให้ได้รับบริการเร็วขึ้น', image_url: 'https://x/y.webp' }],
    })
    expect(out).toBe(`${CARD_PREFIX} ส่งคำขอโทรแล้ว — โทรเลยเพื่อให้ได้รับบริการเร็วขึ้น`)
  })

  it('template ที่มีแต่ title (ไม่มี subtitle/ปุ่ม/รูป) → ข้อความธรรมดา ไม่ใส่คำนำหน้า', () => {
    // เนื้อหาแบบนี้เข้ามาได้ทั้งทาง message.text และทาง template — ถ้าใส่คำนำหน้าเฉพาะทางหลัง
    // ข้อความเดียวกันจะแสดงคนละแบบสลับไปมาขึ้นกับว่า Meta ส่งมาทางไหนวันนั้น
    const out = composeStructuredText('template', {
      template_type: 'generic',
      elements: [{ title: 'สวัสดีค่า ยินดีให้บริการค่ะ' }],
    })
    expect(out).toBe('สวัสดีค่า ยินดีให้บริการค่ะ')
    expect(parseMetaSystemNotice(out)).toBeNull()
  })

  it('หลายรายการ → บอกจำนวนที่เหลือเหมือนเดิม', () => {
    const out = composeStructuredText('template', {
      template_type: 'generic',
      elements: [
        { title: 'สินค้า ก', subtitle: 'ฟรีปลายทาง' },
        { title: 'สินค้า ข' },
      ],
    })
    expect(out).toBe(`${CARD_PREFIX} สินค้า ก — ฟรีปลายทาง และอีก 1 รายการ`)
  })

  it('receipt / button template ที่มี text — พฤติกรรมเดิม ไม่ถูกแตะ', () => {
    expect(
      composeStructuredText('template', { template_type: 'receipt', order_number: 'A1', summary: { total_cost: 590 } }),
    ).toBe('สรุปคำสั่งซื้อ #A1 — ยอดรวม ฿590')
    expect(
      composeStructuredText('template', { text: 'You requested ฿590.00. Somchai can review and confirm this order.' }),
    ).toBe('You requested ฿590.00. Somchai can review and confirm this order.')
  })

  it('ตำแหน่งที่ตั้ง — พฤติกรรมเดิม', () => {
    expect(composeStructuredText('location', { coordinates: { lat: 13.7, long: 100.5 } })).toContain(
      'https://maps.google.com/?q=13.7,100.5',
    )
  })

  it('template ที่ Meta ส่งมาเปล่า ๆ (ไม่มี payload) → null ให้ผู้เรียกตกไป placeholder', () => {
    expect(composeStructuredText('template', undefined)).toBeNull()
    expect(composeStructuredText('template', { template_type: 'generic' })).toBeNull()
  })
})
