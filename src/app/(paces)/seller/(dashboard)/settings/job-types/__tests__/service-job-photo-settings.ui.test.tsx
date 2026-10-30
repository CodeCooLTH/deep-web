/**
 * การ์ด "รูปก่อน-หลังงาน" ในหน้าประเภทงาน (00086 P3-T10 · S-11 · prototype v13 `screenSettings`)
 *
 * render จริงเป็น HTML (ค่าเริ่มจากแถว Shop) — การบันทึก/ย้อนค่าตัดสินที่ lib/service-job-photo-settings (เทสแยก)
 *
 * mutation ที่ต้องแดง (ทำแล้วตอนเขียน): การ์ดใช้ `buyerVisible` ตรง ๆ แทน photoVisibilitySwitch → [blocker] NONE แดง
 */
import { describe, it, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { createElement as h } from 'react'
import ServiceJobPhotoSettings from '../components/ServiceJobPhotoSettings'

const render = (mode: string, buyerVisible: boolean) => renderToStaticMarkup(h(ServiceJobPhotoSettings, { mode, buyerVisible }))
const switchTag = (html: string) => html.match(/<input id="job-photo-buyer-visible"[^>]*>/)?.[0] ?? ''
const radioOf = (html: string, mode: string) => html.match(new RegExp(`<input type="radio"[^>]*name="job-photo-mode"[^>]*value="${mode}"[^>]*>`))?.[0] ?? ''

describe('ค่าเริ่ม OPTIONAL + ลูกค้าไม่เห็น', () => {
  const html = render('OPTIONAL', false)

  it('หัวการ์ด + คำอธิบาย + 3 ตัวเลือกตามลำดับ + คำอธิบายรายตัว', () => {
    expect(html).toContain('<h4 class="card-title">รูปก่อน-หลังงาน</h4>')
    expect(html).toContain('ใช้ตอน &quot;เริ่มงาน&quot; และ &quot;ทำเสร็จแล้ว&quot; ของทุกงานในร้าน')
    const pos = ['>บังคับ<', '>ไม่บังคับ<', '>ไม่ใช้รูป<'].map((l) => html.indexOf(l))
    expect(pos.every((p) => p >= 0)).toBe(true)
    expect(pos[0]).toBeLessThan(pos[1])
    expect(pos[1]).toBeLessThan(pos[2])
    expect(html).toContain('ต้องถ่ายอย่างน้อย 1 รูปทั้งตอนเริ่มและตอนเสร็จ')
    expect(html).toContain('มีช่องถ่ายรูป แต่ข้ามได้')
    expect(html).toContain('เหมาะกับงานส่วนตัว เช่น นวด · ยังบันทึกข้อความได้')
    expect(html).toContain('<legend class="sr-only">การใช้รูป</legend>')
  })

  // critique P1-9 / P1-11 — radio เป็นวงกลม (ไม่ใช่สี่เหลี่ยมแบบ checkbox) · หัวข้อหนักกว่าคำอธิบาย
  it('radio ทุกตัวเป็นวงกลม (rounded-full!) · หัวข้อ font-semibold text-dark · คำอธิบาย font-normal', () => {
    for (const m of ['REQUIRED', 'OPTIONAL', 'NONE']) expect(radioOf(html, m)).toContain('rounded-full!')
    expect(html.match(/class="block text-sm font-semibold text-dark"/g)).toHaveLength(3)
    expect(html.match(/class="mt-0.5 block text-xs font-normal text-default-700"/g)).toHaveLength(3)
  })

  it('เลือก "ไม่บังคับ" อยู่ (checked + ขอบ primary) · ตัวอื่นไม่เลือก', () => {
    expect(radioOf(html, 'OPTIONAL')).toContain('checked=""')
    expect(radioOf(html, 'REQUIRED')).not.toContain('checked')
    expect(radioOf(html, 'NONE')).not.toContain('checked')
    expect(html.match(/border-primary bg-primary\/10/g)).toHaveLength(1)
  })

  it('สวิตช์ปิด กดได้ + hint บอกว่าจะส่งข้อความถึงลูกค้า (ก่อนเปิด)', () => {
    const sw = switchTag(html)
    expect(sw).toContain('class="form-switch mt-0.5 shrink-0"')
    expect(sw).not.toContain('checked')
    expect(sw).not.toContain('disabled')
    expect(html).toContain('<label for="job-photo-buyer-visible"')
    expect(html).toContain('แสดงในหน้างานบริการที่ลูกค้าเปิดจากลิงก์')
    // critique P1-7 — บอกเงื่อนไขจริง (ใบต้องผูกแชท) ไม่สัญญาว่าส่งทุกงาน
    expect(html).toContain('เมื่อช่างกด &quot;ทำเสร็จแล้ว&quot; ระบบส่งลิงก์ดูรูปให้ลูกค้าในแชท (เฉพาะงานที่มีแชทกับลูกค้า)')
  })
})

describe('สวิตช์ตามค่า', () => {
  it('REQUIRED + เห็น → สวิตช์เปิด', () => {
    const sw = switchTag(render('REQUIRED', true))
    expect(sw).toContain('checked=""')
    expect(sw).not.toContain('disabled')
  })

  it('[blocker] NONE → สวิตช์ปิด + disabled + บอกเหตุผล (แม้แถว Shop ค้าง true)', () => {
    const html = render('NONE', true)
    const sw = switchTag(html)
    expect(sw).not.toContain('checked')
    expect(sw).toContain('disabled=""')
    expect(html).toContain('ปิดอยู่เพราะเลือก &quot;ไม่ใช้รูป&quot;')
    expect(html).not.toContain('ระบบส่งลิงก์ดูรูป')
    expect(radioOf(html, 'NONE')).toContain('checked=""')
  })
})

describe('ไม่มี emoji / สีม่วงผู้ซื้อ', () => {
  it('HR12 + HR7', () => {
    const html = render('OPTIONAL', true)
    expect(html).not.toMatch(/\p{Extended_Pictographic}/u)
    // ม่วง Vuexy ต้องไม่หลุดเข้า Paces — เขียน [f] ในคลาสอักขระ: ด่าน [THEME] ของ theme-guard ใช้ grep ไม่มี carve-out คอมเมนต์ (ตัวอักษรตรงตัวจะโดนจับทั้งที่เป็นเทส "ห้ามมี")
    expect(html).not.toMatch(/#7367[f]0/i)
  })
})
