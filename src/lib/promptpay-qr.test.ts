import { describe, expect, it } from 'vitest'

import { buildPromptPayPayload, crc16ccitt } from './promptpay-qr'

// ─── parser อิสระ (เขียนแยกจาก tlv() ของไฟล์จริง โดยตั้งใจ) ────────────────────
// ทำไม: ถ้าใช้ตัว encode ของไฟล์จริงมา "ถอด" เอง เทสจะพิสูจน์ได้แค่ว่าไฟล์สอดคล้องกับ
// ตัวเอง (tautology) ไม่ได้พิสูจน์ว่า tag/length ถูกวางถูกตำแหน่งจริงตามสเปก EMVCo
function parseTLV(payload: string): Record<string, string> {
  const out: Record<string, string> = {}
  let i = 0
  while (i < payload.length) {
    const id = payload.slice(i, i + 2)
    const len = Number.parseInt(payload.slice(i + 2, i + 4), 10)
    if (!Number.isFinite(len)) throw new Error(`[test-parser] length ไม่ใช่ตัวเลขที่ ${i}`)
    const value = payload.slice(i + 4, i + 4 + len)
    out[id] = value
    i += 4 + len
  }
  return out
}

/** CRC16-CCITT-FALSE เขียนซ้ำอิสระ (ไม่เรียก crc16ccitt ของไฟล์จริง) เพื่อไม่ให้เทส CRC เป็น tautology */
function independentCrc16(data: string): string {
  let crc = 0xffff
  for (const ch of data) {
    crc ^= ch.charCodeAt(0) << 8
    for (let b = 0; b < 8; b++) {
      crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, '0')
}

describe('crc16ccitt', () => {
  it('ตรงกับ known-answer test vector มาตรฐาน: "123456789" → 29B1', () => {
    // ค่าอ้างอิงจาก reveng CRC catalogue: CRC-16/CCITT-FALSE
    // (width=16 poly=0x1021 init=0xFFFF refin=false refout=false xorout=0x0000 check=0x29B1)
    expect(crc16ccitt('123456789')).toBe('29B1')
  })

  it('ตรงกับ implementation อิสระที่เขียนซ้ำในไฟล์เทสนี้ (cross-check)', () => {
    const samples = ['', 'A', '00020101021229370016A00000067701011101', 'สวัสดี']
    for (const s of samples) {
      expect(crc16ccitt(s)).toBe(independentCrc16(s))
    }
  })
})

describe('buildPromptPayPayload — mobile ID', () => {
  const promptPayId = '0812345678'
  const amount = 1250

  it('คืน payload ที่ decode กลับได้ยอด 1250.00 ตรงเป๊ะ ผ่าน parser อิสระ', () => {
    const payload = buildPromptPayPayload({ promptPayId, amount })
    expect(payload).not.toBeNull()

    const fields = parseTLV(payload!)
    expect(fields['00']).toBe('01') // Payload Format Indicator
    expect(fields['01']).toBe('12') // dynamic (มียอดเงิน)
    expect(fields['53']).toBe('764') // THB
    expect(fields['54']).toBe('1250.00')
    expect(Number.parseFloat(fields['54'])).toBe(1250)
    expect(fields['58']).toBe('TH')

    // Merchant Account Info (tag 29) ต้อง parse ซ้อนได้ และมี AID + เบอร์ที่แปลงรูปถูก
    const merchant = parseTLV(fields['29'])
    expect(merchant['00']).toBe('A000000677010111')
    expect(merchant['01']).toBe('0066812345678') // '0'+'812345678' → '66'+'812345678' → pad13
  })

  it('CRC ท้าย payload ถูกต้องตามข้อมูลก่อนหน้า (คำนวณซ้ำด้วย implementation อิสระ)', () => {
    const payload = buildPromptPayPayload({ promptPayId, amount })!
    const body = payload.slice(0, -4)
    const crcInPayload = payload.slice(-4)
    expect(crcInPayload).toBe(independentCrc16(body))
    // tag 63 ต้องเป็นตัวสุดท้ายและมีความยาว 4
    expect(body.endsWith('6304')).toBe(true)
  })

  it('ทศนิยม 2 ตำแหน่งเสมอแม้ยอดเป็นจำนวนเต็ม', () => {
    const payload = buildPromptPayPayload({ promptPayId, amount: 50 })!
    const fields = parseTLV(payload)
    expect(fields['54']).toBe('50.00')
  })
})

describe('buildPromptPayPayload — national ID', () => {
  it('เลขบัตร ปชช./ผู้เสียภาษี 13 หลัก → tag 02 ค่าตรงตัว', () => {
    const payload = buildPromptPayPayload({ promptPayId: '1234567890123', amount: 100 })
    expect(payload).not.toBeNull()
    const merchant = parseTLV(parseTLV(payload!)['29'])
    expect(merchant['02']).toBe('1234567890123')
    expect(merchant['01']).toBeUndefined()
  })
})

describe('buildPromptPayPayload — fail-closed', () => {
  it('amount = 0 → null', () => {
    expect(buildPromptPayPayload({ promptPayId: '0812345678', amount: 0 })).toBeNull()
  })

  it('amount ติดลบ → null', () => {
    expect(buildPromptPayPayload({ promptPayId: '0812345678', amount: -1 })).toBeNull()
  })

  it('amount ไม่ใช่ตัวเลขจำกัด (NaN/Infinity) → null', () => {
    expect(buildPromptPayPayload({ promptPayId: '0812345678', amount: Number.NaN })).toBeNull()
    expect(buildPromptPayPayload({ promptPayId: '0812345678', amount: Number.POSITIVE_INFINITY })).toBeNull()
  })

  it('promptPayId ผิดรูปแบบ (สั้น/ยาวเกิน/ไม่ใช่มือถือหรือบัตร) → null', () => {
    expect(buildPromptPayPayload({ promptPayId: '081234', amount: 100 })).toBeNull()
    expect(buildPromptPayPayload({ promptPayId: '12345678901234', amount: 100 })).toBeNull()
    expect(buildPromptPayPayload({ promptPayId: '0712345678', amount: 100 })).toBeNull() // ขึ้นต้น 07 ไม่ใช่มือถือ
  })

  it('promptPayId ว่างเปล่า → null', () => {
    expect(buildPromptPayPayload({ promptPayId: '', amount: 100 })).toBeNull()
  })
})
