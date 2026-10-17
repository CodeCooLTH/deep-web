import { describe, expect, it } from 'vitest'
import { renderTemplate } from '../render'

const ok = (t: string) => ({ ok: true, text: t })

describe('[blocker] renderTemplate (TC-110)', () => {
  it('แทนตัวแปร และตัวแปรว่างหายไปเฉย ๆ ในบรรทัดที่ยังมีตัวแปรอื่น', () => {
    expect(renderTemplate('{ก}-{ข}-จบ', { ก: 'A', ข: '' })).toEqual(ok('A--จบ'))
    expect(renderTemplate('{ก}', { ก: 'A' })).toEqual(ok('A'))
  })

  it('บรรทัดที่มีตัวแปรและทุกตัวว่าง ถูกตัดทั้งบรรทัด (รวมข้อความรอบตัวแปร)', () => {
    expect(renderTemplate('หัว\nขนส่ง: {ข}\nท้าย', { ข: '' })).toEqual(ok('หัว\nท้าย'))
    expect(renderTemplate('หัว\nขนส่ง: {ข}\nท้าย', { ข: null })).toEqual(ok('หัว\nท้าย'))
    expect(renderTemplate('หัว\nขนส่ง: {ข}\nท้าย', {})).toEqual(ok('หัว\nท้าย'))
    expect(renderTemplate('หัว\nขนส่ง: {ข}\nท้าย', { ข: '   ' })).toEqual(ok('หัว\nท้าย'))
  })

  it('บรรทัดที่มีตัวแปรอย่างน้อยหนึ่งตัวมีค่า คงอยู่', () => {
    expect(renderTemplate('{ก} {ข}', { ก: '', ข: 'B' })).toEqual(ok(' B'.trim()))
    expect(renderTemplate('x\n{ก}{ข}\ny', { ก: '', ข: 'B' })).toEqual(ok('x\nB\ny'))
  })

  it('บรรทัดข้อความล้วน (ไม่มีตัวแปร) คงอยู่เสมอ', () => {
    expect(renderTemplate('ขอบคุณค่ะ\n{ข}', { ข: '' })).toEqual(ok('ขอบคุณค่ะ'))
  })

  it('บรรทัดว่างติดกันยุบเหลือหนึ่ง · trim หัวท้าย · CRLF เท่ากับ LF', () => {
    expect(renderTemplate('\n\nก\n\n\n\nข\n\n', {})).toEqual(ok('ก\n\nข'))
    expect(renderTemplate('ก\r\n{ข}\r\nค', { ข: '' })).toEqual(ok('ก\nค'))
    // ตัดบรรทัดแล้วเหลือบรรทัดว่างสองก้อนติดกัน ต้องยุบ
    expect(renderTemplate('ก\n\n{ข}\n\nค', { ข: '' })).toEqual(ok('ก\n\nค'))
  })

  it('ผลว่างทั้งข้อความ = EMPTY_MESSAGE', () => {
    expect(renderTemplate('{ก}\n{ข}', {})).toEqual({ ok: false, reason: 'EMPTY_MESSAGE' })
    expect(renderTemplate('  \n ', {})).toEqual({ ok: false, reason: 'EMPTY_MESSAGE' })
  })

  it('ค่าที่มี {..} อยู่ในตัวไม่ถูกแทนซ้ำ', () => {
    expect(renderTemplate('{ก}', { ก: '{ข}', ข: 'X' })).toEqual(ok('{ข}'))
  })
})
