import { describe, expect, it } from 'vitest'
import { AUTO_NOTIFY_KINDS } from '../ledger-constants'
import {
  TEMPLATE_VARIABLES,
  countCodePoints,
  parseTemplate,
  templateHasLinkVariable,
  validateTemplate,
  variableNamesOf,
} from '../variables'
import { DEFAULT_TEMPLATES, TEMPLATE_EXAMPLES } from '../defaults'
import { kindsForVertical } from '../kinds'

describe('ชุดตัวแปรต่อ kind (TC-111)', () => {
  // ตารางจาก PRD §3.4 พิมพ์ซ้ำตรงนี้โดยเจตนา: เทสนี้คือตัวล็อกให้ SSOT เปลี่ยนต้องแก้เอกสารก่อน
  const PRD: Record<string, string[]> = {
    ORDER_SUMMARY: ['ชื่อร้าน', 'ชื่อลูกค้า', 'เลขคำสั่งซื้อ', 'วันที่สั่งซื้อ', 'รายการสินค้า', 'ยอดสุทธิ', 'ลิงก์คำสั่งซื้อ', 'คำเรียกรายการ'],
    TRACKING: ['ชื่อร้าน', 'ชื่อลูกค้า', 'เลขคำสั่งซื้อ', 'ขนส่ง', 'เลขพัสดุ', 'ลิงก์ติดตามพัสดุ', 'ลิงก์คำสั่งซื้อ'],
    SERVICE_BOOKED: ['ชื่อร้าน', 'ชื่อลูกค้า', 'เลขคำสั่งซื้อ', 'วันเวลานัด', 'บริการ', 'ยอดรวม', 'ยอดมัดจำที่ตกลงไว้', 'ลิงก์งาน'],
    SERVICE_STARTED: ['ชื่อร้าน', 'ชื่อลูกค้า', 'บริการ', 'วันเวลานัด', 'เวลาเริ่มงาน', 'ลิงก์งาน'],
    SERVICE_CLOSED: ['ชื่อร้าน', 'ชื่อลูกค้า', 'บริการ', 'วันเวลานัด', 'เวลาเริ่มงาน', 'เวลาปิดงาน', 'ลิงก์งาน'],
  }
  it.each(AUTO_NOTIFY_KINDS)('%s เท่าตาราง PRD เป๊ะ', (k) => {
    expect(variableNamesOf(k)).toEqual(PRD[k])
    expect(TEMPLATE_VARIABLES[k].every((x) => x.sample.length > 0)).toBe(true)
  })

  it('ตัวแปรชนิดอื่นใช้ข้ามชนิดไม่ได้', () => {
    expect(validateTemplate('TRACKING', '{ยอดสุทธิ}')).toEqual([{ code: 'WRONG_KIND_VARIABLE', name: 'ยอดสุทธิ' }])
    expect(validateTemplate('SERVICE_CLOSED', '{ยอดรวม}')).toEqual([{ code: 'WRONG_KIND_VARIABLE', name: 'ยอดรวม' }])
    expect(validateTemplate('SERVICE_STARTED', '{เวลาปิดงาน}')).toHaveLength(1)
  })

  it('ค่าตั้งต้นและตัวอย่างทุกตัวผ่าน validator ของ kind ตัวเอง และมีลิงก์', () => {
    for (const k of AUTO_NOTIFY_KINDS) {
      expect(validateTemplate(k, DEFAULT_TEMPLATES[k])).toEqual([])
      expect(templateHasLinkVariable(DEFAULT_TEMPLATES[k])).toBe(true)
      expect(TEMPLATE_EXAMPLES[k]).toHaveLength(3)
      for (const ex of TEMPLATE_EXAMPLES[k]) expect(validateTemplate(k, ex.body)).toEqual([])
    }
  })

  it('kindsForVertical', () => {
    expect(kindsForVertical('ONLINE_SALES')).toEqual(['ORDER_SUMMARY', 'TRACKING'])
    expect(kindsForVertical('SERVICE_QUEUE')).toEqual(['SERVICE_BOOKED', 'SERVICE_STARTED', 'SERVICE_CLOSED'])
    expect(kindsForVertical('LODGING')).toEqual([])
    expect(kindsForVertical('???')).toEqual([])
  })
})

describe('validateTemplate (TC-182)', () => {
  it('ตัวแปรไม่รู้จัก', () => {
    expect(validateTemplate('ORDER_SUMMARY', 'สวัสดี {ไม่มีจริง} {ไม่มีจริง}')).toEqual([{ code: 'UNKNOWN_VARIABLE', name: 'ไม่มีจริง' }])
    expect(validateTemplate('ORDER_SUMMARY', '{}')).toEqual([{ code: 'UNKNOWN_VARIABLE', name: '' }])
  })
  it('ว่าง/เว้นวรรคล้วน', () => {
    expect(validateTemplate('ORDER_SUMMARY', '')).toEqual([{ code: 'BLANK' }])
    expect(validateTemplate('ORDER_SUMMARY', ' \n ')).toEqual([{ code: 'BLANK' }])
  })
  it('NUL และ lone surrogate', () => {
    expect(validateTemplate('ORDER_SUMMARY', 'a\u0000b').map((x) => x.code)).toContain('NUL')
    expect(validateTemplate('ORDER_SUMMARY', 'a\uD800b').map((x) => x.code)).toContain('SURROGATE')
    expect(validateTemplate('ORDER_SUMMARY', 'a\uDC00b').map((x) => x.code)).toContain('SURROGATE')
    expect(validateTemplate('ORDER_SUMMARY', 'ok 😀')).toEqual([])
  })
  it('ไม่มีลิงก์ = เตือนไม่บล็อก', () => {
    expect(validateTemplate('ORDER_SUMMARY', 'ขอบคุณ {ยอดสุทธิ}')).toEqual([])
    expect(templateHasLinkVariable('ขอบคุณ {ยอดสุทธิ}')).toBe(false)
  })
  it('`{` ไม่มีคู่ / ซ้อน / ข้ามบรรทัด = ข้อความธรรมดา', () => {
    expect(parseTemplate('a { b')).toEqual([{ type: 'text', text: 'a { b' }])
    expect(parseTemplate('{a\nb}')).toEqual([{ type: 'text', text: '{a\nb}' }])
  })
})

describe('[blocker] นับ code point 499/500/501 (TC-181)', () => {
  const emoji = (n: number) => '😀'.repeat(n)
  it('อีโมจิ 1 ตัว = 1 หน่วย (ไม่ใช่ .length ที่ได้ 2)', () => {
    expect(countCodePoints('😀')).toBe(1)
    expect(countCodePoints('กำ😀')).toBe(3)
  })
  it('499/500 ผ่าน 501 ตก', () => {
    expect(validateTemplate('ORDER_SUMMARY', emoji(499))).toEqual([])
    expect(validateTemplate('ORDER_SUMMARY', emoji(500))).toEqual([])
    expect(validateTemplate('ORDER_SUMMARY', emoji(501))).toEqual([{ code: 'TOO_LONG' }])
  })
  it('อีโมจิ 251 ตัว (.length=502) ยังผ่าน', () => {
    expect(validateTemplate('ORDER_SUMMARY', emoji(251))).toEqual([])
  })
  it('ไทยวรรณยุกต์ซ้อน 500/501', () => {
    expect(validateTemplate('ORDER_SUMMARY', 'ก้'.repeat(250))).toEqual([]) // 500 code points
    expect(validateTemplate('ORDER_SUMMARY', 'ก้'.repeat(250) + 'ก')).toEqual([{ code: 'TOO_LONG' }])
  })
})
