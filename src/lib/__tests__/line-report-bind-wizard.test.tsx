/**
 * feature 00070 U13 — BindWizard (render จริงแล้วดู HTML): ปุ่มสร้างโค้ด disabled จนกว่าเลือกร้าน+ติ๊ก, ร้านเดียว preselect, resume ไม่มีโค้ดเดิม
 */
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

vi.mock('@/components/wrappers/Icon', () => ({
  default: ({ icon }: { icon: string }) => React.createElement('i', { 'data-icon': icon }),
}))
vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: any) => React.createElement('a', { href, ...rest }, children),
}))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }) }))
vi.mock('qrcode.react', () => ({ QRCodeSVG: () => React.createElement('svg', { 'data-qr': '1' }) }))

import BindWizard, { type BindWizardProps } from '@/app/(paces)/seller/(dashboard)/business/line-reports/_components/BindWizard'

const SHOP_A = { id: 'a', name: 'BT Premium Auto', vertical: 'SERVICE_QUEUE', kind: 'BUSINESS' }
const SHOP_B = { id: 'b', name: 'ศรีสุข อะไหล่', vertical: 'ONLINE_SALES', kind: 'BUSINESS' }
const render = (p: Partial<BindWizardProps>) => renderToStaticMarkup(<BindWizard mode="create" addFriendUrl="https://line.me/R/ti/p/@x" {...p} />)

// ปุ่มสร้างโค้ดคือ <button …>สร้างโค้ด</button> — ดึงแท็กเปิดมาดู disabled
const createBtn = (html: string) => /<button[^>]*>(?:<i[^>]*><\/i>)?สร้างโค้ด<\/button>/.exec(html)?.[0] ?? ''

describe('BindWizard create', () => {
  it('หลายร้าน ยังไม่เลือก: ปุ่มสร้างโค้ด disabled + บอกเหตุ', () => {
    const html = render({ shops: [SHOP_A, SHOP_B] })
    expect(createBtn(html)).toContain('disabled')
    expect(html).toContain('ต้องเลือกอย่างน้อย 1 ร้าน')
    expect(html).toContain('เลือกแล้ว 0 จาก 2 ร้าน')
  })
  it('ร้านเดียว: ติ๊กไว้ให้ แต่ยังไม่ติ๊กรับทราบ → ปุ่มยัง disabled', () => {
    const html = render({ shops: [SHOP_A] })
    expect(html).toContain('เลือกแล้ว 1 จาก 1 ร้าน')
    expect(html).toMatch(/<input[^>]*checked=""[^>]*>/)
    expect(createBtn(html)).toContain('disabled')
    expect(html).toContain('ติ๊กรับทราบก่อนสร้างโค้ด')
  })
  it('ไม่มีร้านให้เลือก: ข้อความอธิบาย + ปุ่ม disabled', () => {
    const html = render({ shops: [] })
    expect(html).toContain('ตอนนี้ไม่มีร้านที่เลือกได้')
    expect(createBtn(html)).toContain('disabled')
  })
  it('ป้ายชนิดร้านตาม SSOT · ไม่มีโค้ดตั้งแต่แรก', () => {
    const html = render({ shops: [SHOP_A, SHOP_B] })
    expect(html).toContain('สินค้าและบริการ')
    expect(html).toContain('ขายออนไลน์')
    expect(html).not.toContain('ผูก K')
  })
  it('addFriendUrl null: ซ่อนปุ่ม/QR + ข้อความ fallback', () => {
    const html = render({ shops: [SHOP_A], addFriendUrl: null })
    expect(html).not.toContain('เปิดใน LINE')
    expect(html).not.toContain('แสดง QR')
    expect(html).toContain('ยังไม่มีลิงก์เพิ่มเพื่อนของบอท')
  })
  it('มี addFriendUrl: เห็นปุ่มเปิดใน LINE + แสดง QR', () => {
    const html = render({ shops: [SHOP_A] })
    expect(html).toContain('เปิดใน LINE')
    expect(html).toContain('แสดง QR')
  })
})

describe('BindWizard resume / rebind', () => {
  it('resume: ไม่มีโค้ดเดิม · มีปุ่มสร้างโค้ดใหม่ · ไม่มีรายการร้าน/ติ๊กรับทราบ', () => {
    const html = render({ mode: 'resume', groupId: 'g1', shopNames: ['A', 'B', 'C'], liveCodeExpiresAt: '2099-01-01T00:00:00Z' })
    expect(html).toContain('โค้ดที่สร้างไว้แสดงซ้ำไม่ได้')
    expect(html).toContain('โค้ดเดิมยังใช้ได้อีก')
    expect(html).toContain('สร้างโค้ดใหม่')
    expect(html).toContain('ร้านที่รวม: A และอีก 2 ร้าน')
    expect(html).not.toContain('form-checkbox')
    expect(html).not.toMatch(/ผูก\s*<\/span>\s*<span[^>]*>[A-Z0-9]{4}-/)
  })
  it('resume โค้ดหมดอายุแล้ว: ตัดบรรทัดนับถอยหลัง', () => {
    const html = render({ mode: 'resume', groupId: 'g1', shopNames: ['A'], liveCodeExpiresAt: null })
    expect(html).toContain('โค้ดเดิมหมดอายุแล้ว')
    expect(html).not.toContain('role="timer"')
  })
  it('rebind: ข้อความผูกอีกครั้ง + ปุ่มสร้างโค้ด', () => {
    const html = render({ mode: 'rebind', groupId: 'g1', shopNames: ['A'] })
    expect(html).toContain('ผูกกลุ่มนี้อีกครั้ง — ค่าที่ตั้งไว้เดิมยังอยู่ครบ')
    expect(createBtn(html)).not.toContain('disabled')
  })
  it('แพ็กเกจหยุด: ปุ่ม disabled + แสดงเหตุ', () => {
    const html = render({ mode: 'rebind', groupId: 'g1', blockedReason: 'แพ็กเกจหยุดใช้งาน' })
    expect(createBtn(html)).toContain('disabled')
    expect(html).toContain('แพ็กเกจหยุดใช้งาน')
  })
})
