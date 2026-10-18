import { describe, expect, it } from 'vitest'
import { domToText, type NodeLike } from '../editor-dom'

const txt = (s: string): NodeLike => ({ nodeType: 3, nodeName: '#text', textContent: s, childNodes: [] })
const br = (): NodeLike => ({ nodeType: 1, nodeName: 'BR', textContent: '', childNodes: [], getAttribute: () => null })
const chip = (name: string): NodeLike => ({
  nodeType: 1,
  nodeName: 'SPAN',
  textContent: name,
  childNodes: [txt(name)],
  getAttribute: (a) => (a === 'data-var' ? name : null),
})
const el = (tag: string, ...kids: NodeLike[]): NodeLike => ({ nodeType: 1, nodeName: tag, textContent: null, childNodes: kids, getAttribute: () => null })
const root = (...kids: NodeLike[]) => el('DIV', ...kids)

describe('domToText', () => {
  it('ชิปเป็น {ชื่อ} · <br> เป็นขึ้นบรรทัด', () => {
    expect(domToText(root(txt('สวัสดี '), chip('ชื่อลูกค้า'), br(), txt('ยอด '), chip('ยอดสุทธิ')))).toBe('สวัสดี {ชื่อลูกค้า}\nยอด {ยอดสุทธิ}')
  })
  it('<br> ท้ายสุดคือที่วางเคอร์เซอร์ — บรรทัดว่างท้ายข้อความต้องเหลือ 1 ไม่ใช่ 2', () => {
    expect(domToText(root(txt('a'), br(), br()))).toBe('a\n')
    expect(domToText(root(txt('a'), br()))).toBe('a')
    expect(domToText(root(br()))).toBe('')
  })
  it('ชิปท้ายสุดไม่ถูกตัดเป็น placeholder', () => {
    expect(domToText(root(txt('ดูที่ '), chip('ลิงก์งาน')))).toBe('ดูที่ {ลิงก์งาน}')
  })
  it('div/p ที่เบราว์เซอร์สร้างเอง = ขึ้นบรรทัดใหม่', () => {
    expect(domToText(root(txt('a'), el('DIV', txt('b')), el('DIV', txt('c'))))).toBe('a\nb\nc')
    expect(domToText(root(el('DIV', txt('a')), el('DIV', br())))).toBe('a\n')
  })
  it('ทิ้ง zero-width space', () => {
    expect(domToText(root(chip('ชื่อร้าน'), txt('​')))).toBe('{ชื่อร้าน}')
  })
  it('สระ/วรรณยุกต์ไทยผ่านตรง ๆ', () => {
    expect(domToText(root(txt('ขอบคุณที่สั่งซื้อนะคะ')))).toBe('ขอบคุณที่สั่งซื้อนะคะ')
  })
})
