/**
 * feature 00070 U15 — GroupDetailClient (render จริงแล้วดู HTML): canEdit=false ปิดฟอร์มแต่ยกเลิกผูกยังใช้ได้ · กำไรท้ายสุดคั่นเส้นประ ·
 * ไม่มีคำว่า "ออเดอร์" · คำเรียกตาม vertical · ตัวนับทดสอบจาก presenter · ประวัติว่าง/มีแถว
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

import GroupDetailClient, { type GroupDetailClientProps } from '@/app/(paces)/seller/(dashboard)/business/line-reports/[groupId]/GroupDetailClient'
import { orderWordFor } from '@/lib/line-report/order-word'

type Dto = GroupDetailClientProps['initialGroup']

const SHOP_SVC = { shopId: 's1', name: 'BT Premium Auto', vertical: 'SERVICE_QUEUE', kind: 'BUSINESS', state: 'OK' as const }
const SHOP_ONL = { shopId: 's2', name: 'ศรีสุข อะไหล่', vertical: 'ONLINE_SALES', kind: 'BUSINESS', state: 'OK' as const }
const SHOP_LOCKED = { shopId: 's3', name: 'ล้างรถ โปรแคร์', vertical: 'SERVICE_QUEUE', kind: 'BUSINESS', state: 'LOCKED' as const }

const dto = (o: Partial<Dto> = {}): Dto =>
  ({
    id: 'g1',
    status: 'ACTIVE',
    groupName: 'ทีมบัญชี',
    paused: false,
    boundAt: '2026-09-03T03:00:00.000Z',
    leftAt: null,
    settings: {
      dailyEnabled: true,
      dailyTimes: [540, 720],
      monthlyEnabled: true,
      cutoffDay: 6,
      showOrders: true,
      showSales: true,
      showCancelled: true,
      showTopProducts: true,
      showProfit: false,
      skipWhenNoOrders: false,
      attachCycleToDaily: false,
      profitEnabledAt: null,
    },
    shops: [SHOP_SVC],
    nextSendAt: null,
    cycle: { startIso: '2026-09-06', endIso: '2026-10-05', nextFireDate: '2026-10-06' },
    bind: { hasLiveCode: false, expiresAt: null },
    alert: null,
    test: { limit: 5, usedToday: 2, remaining: 3 },
    deliveries: [],
    ...o,
  }) as Dto

const render = (o: Partial<Dto> = {}, p: Partial<GroupDetailClientProps> = {}) =>
  renderToStaticMarkup(
    <GroupDetailClient
      initialGroup={dto(o)}
      reportableShops={[{ id: 's1', name: 'BT Premium Auto', vertical: 'SERVICE_QUEUE', kind: 'BUSINESS' }]}
      shell="web"
      lockReason="RENEWAL_FAILED"
      serverNowIso="2026-10-05T11:00:00.000Z"
      rebind={{ addFriendUrl: 'https://line.me/R/ti/p/@x', blockedReason: null }}
      {...p}
    />,
  )

const tag = (html: string, re: RegExp) => re.exec(html)?.[0] ?? ''
const testBtn = (html: string) => tag(html, /<button[^>]*>(?:<i[^>]*><\/i>)?ส่งทดสอบ<\/button>/)

describe('GroupDetailClient — ปกติ', () => {
  it('ไม่มีคำว่า "ออเดอร์" ทั้งหน้า (รวมพรีวิว) · คำเรียกตาม vertical', () => {
    const html = render()
    expect(html).not.toContain('ออเดอร์')
    const { word } = orderWordFor([SHOP_SVC])
    expect(html).toContain(`จำนวน${word}`)
    expect(html).toContain(`ถ้าช่วงนั้นไม่มี${word}เลย`)
  })
  it('หลาย vertical ปนกัน → "รายการ" · ร้านล็อกไม่นับ', () => {
    const mixed = render({ shops: [SHOP_SVC, SHOP_ONL] })
    expect(mixed).toContain('จำนวนรายการ')
    const withLocked = render({ shops: [SHOP_SVC, SHOP_LOCKED] })
    expect(withLocked).toContain(`จำนวน${orderWordFor([SHOP_SVC]).word}`)
  })
  it('ตัวนับทดสอบมาจาก presenter: ใช้ไป 2 → เหลือ 3 จาก 5 · ปุ่มกดได้', () => {
    const html = render()
    expect(html).toContain('เหลือ 3 จาก 5 ครั้งวันนี้')
    expect(testBtn(html)).not.toContain('disabled')
  })
  it('ใช้ครบ 5 → ปุ่ม disabled + ข้อความเหตุจาก testBlockedReason', () => {
    const html = render({ test: { limit: 5, usedToday: 5, remaining: 0 } })
    expect(testBtn(html)).toContain('disabled')
    expect(html).toContain('ครบ 5 ครั้งวันนี้แล้ว ส่งทดสอบได้อีกครั้งพรุ่งนี้')
    expect(html).not.toContain('เหลือ 0 จาก 5')
  })
  it('กำไรอยู่แถวท้ายสุดของการ์ดตัวเลข คั่นเส้นประจากตัวเลขหลัก', () => {
    const html = render()
    const a = html.indexOf('ขายดี 3 อันดับ (แยกรายร้าน)')
    const b = html.indexOf('>กำไร<')
    expect(a).toBeGreaterThan(0)
    expect(b).toBeGreaterThan(a)
    expect(html.slice(a, b)).toContain('border-dashed')
  })
  it('ตัวเลขสุดท้ายที่ติ๊กอยู่ disabled + helper', () => {
    const html = render({ settings: { ...dto().settings, showOrders: false, showCancelled: false, showTopProducts: false } })
    expect(html).toContain('ต้องแสดงตัวเลขอย่างน้อย 1 รายการ')
  })
  it('ร้านเดียวที่ติ๊กอยู่ disabled · ร้านล็อกแสดงเหตุผล', () => {
    const html = render({ shops: [SHOP_SVC, SHOP_LOCKED] })
    expect(html).toContain('ต้องเลือกอย่างน้อย 1 ร้าน')
    expect(html).toContain('ถูกล็อกเพราะแพ็กเกจ')
  })
  it('ตัวบอกบันทึกอัตโนมัติเป็น aria-live=polite', () => {
    expect(render()).toMatch(/<span aria-live="polite">บันทึกอัตโนมัติ<\/span>/)
  })
  it('ปิดทั้งรายวันรายเดือน → แถบ info อธิบาย', () => {
    const html = render({ settings: { ...dto().settings, dailyEnabled: false, monthlyEnabled: false } })
    expect(html).toContain('ตอนนี้ยังไม่ได้เปิดรายงานอัตโนมัติ')
  })
  it('พรีวิว: ติดป้ายตัวอย่าง · ใช้ Flex จริง (หัวรายงาน)', () => {
    const html = render()
    expect(html).toContain('ตัวอย่าง ตัวเลขจริงมาจากข้อมูลของร้านที่เลือก')
    expect(html).toContain('รายงานยอดรายวัน')
    expect(html).not.toContain('font-mono')
  })
  it('ตัวอย่างวันตัดรอบอ่านจาก cycle ของ server', () => {
    const html = render()
    expect(html).toContain('ตัดรอบวันที่ 6')
    expect(html).toContain('6 ก.ย.')
    expect(html).toContain('5 ต.ค.')
    expect(html).toContain('09:00')
  })
})

describe('GroupDetailClient — ประวัติ', () => {
  it('ว่าง → ข้อความว่าง ไม่มีตาราง', () => {
    const html = render()
    expect(html).toContain('ยังไม่เคยส่งรายงานให้กลุ่มนี้')
    expect(html).not.toContain('<table')
  })
  it('มีแถว → ชนิด/ผล/สาเหตุจาก API · ล้มเป็น danger, สำเร็จเป็น success', () => {
    const html = render({
      deliveries: [
        { id: 'd1', at: '2026-10-05T02:00:03.000Z', kind: 'DAILY', status: 'SENT', reason: null, reasonLabel: null, pushMessageCount: 1 },
        { id: 'd2', at: '2026-10-04T05:30:00.000Z', kind: 'TEST', status: 'FAILED', reason: 'BOT_NOT_IN_GROUP', reasonLabel: 'บอทไม่อยู่ในกลุ่มแล้ว', pushMessageCount: 0 },
        { id: 'd3', at: '2026-10-04T02:00:00.000Z', kind: 'FINAL_NOTICE', status: 'MISSED', reason: null, reasonLabel: 'พลาดรอบส่ง ไม่ส่งย้อนหลัง', pushMessageCount: 0 },
      ],
    })
    expect(html).toContain('<table')
    expect(html).toContain('ส่งสำเร็จ')
    expect(html).toContain('bg-success/15 text-success-ink')
    expect(html).toContain('ส่งไม่สำเร็จ')
    expect(html).toContain('bg-danger/15 text-danger-ink')
    expect(html).toContain('บอทไม่อยู่ในกลุ่มแล้ว')
    expect(html).toContain('แจ้งหยุดส่ง')
    expect(html).toContain('พลาดรอบ')
    expect(html).not.toContain('ออเดอร์')
  })
})

describe('GroupDetailClient — canEdit=false (แพ็กเกจหยุด)', () => {
  const html = render({ paused: true })
  it('ฟอร์มทุกตัวปิด: checkbox/switch/select ไม่มีตัวไหนกดได้', () => {
    const inputs = html.match(/<input[^>]*type="checkbox"[^>]*>/g) ?? []
    expect(inputs.length).toBeGreaterThan(5)
    for (const i of inputs) expect(i).toContain('disabled')
    for (const s of html.match(/<select[^>]*>/g) ?? []) expect(s).toContain('disabled')
  })
  it('แต่ปุ่มเมนู ⋯ (ยกเลิกการผูก) ยังใช้ได้', () => {
    const menu = tag(html, /<button[^>]*aria-label="เมนูเพิ่มเติม"[^>]*>/)
    expect(menu).not.toBe('')
    expect(menu).not.toContain('disabled')
  })
  it('ส่งทดสอบ disabled + เหตุแพ็กเกจหยุด · มีแบนเนอร์ + ลิงก์ต่ออายุ (เว็บ)', () => {
    expect(testBtn(html)).toContain('disabled')
    expect(html).toContain('ส่งทดสอบไม่ได้ขณะแพ็กเกจหยุดใช้งาน')
    expect(html).toContain('ต่ออายุแพ็กเกจ')
    expect(html).toContain('หยุดส่งเพราะแพ็กเกจ')
  })
  it('Android: ไม่มีปุ่ม/ลิงก์จ่ายเงิน', () => {
    const app = render({ paused: true }, { shell: 'android' })
    expect(app).not.toContain('ต่ออายุแพ็กเกจ')
    expect(app).not.toContain('href="/business"')
    expect(app).not.toContain('/business/subscribe')
  })
})

describe('GroupDetailClient — INACTIVE / ร้านล็อกหมด', () => {
  it('INACTIVE: แบนเนอร์ danger + ปุ่ม "ผูกใหม่" · ส่งทดสอบ disabled ด้วยเหตุ "จนกว่ากลุ่มจะผูกใหม่" · ฟอร์มยังแก้ได้', () => {
    const html = render({ status: 'INACTIVE' })
    expect(html).toMatch(/<button[^>]*>ผูกใหม่<\/button>/)
    expect(html).toContain('role="alert"')
    expect(testBtn(html)).toContain('disabled')
    expect(html).toContain('ส่งทดสอบไม่ได้จนกว่ากลุ่มจะผูกใหม่')
    expect((html.match(/<input[^>]*type="checkbox"[^>]*>/g) ?? []).some((i) => !i.includes('disabled'))).toBe(true)
  })
  it('initialView=rebind → แสดง BindWizard โหมดผูกใหม่ + ปุ่มกลับไปตั้งค่า', () => {
    const html = render({ status: 'INACTIVE' }, { initialView: 'rebind' })
    expect(html).toContain('ผูกกลุ่มนี้อีกครั้ง')
    expect(html).toContain('กลับไปตั้งค่า')
    expect(html).not.toContain('ร้านที่รวมในรายงาน')
  })
  it('ทุกร้านล็อก: แบนเนอร์ warning + ส่งทดสอบ disabled ด้วยข้อความ NO_SENDABLE_SHOPS', () => {
    const html = render({ shops: [SHOP_LOCKED] })
    expect(html).toContain('ทุกร้านในกลุ่มนี้ถูกล็อก รายงานจึงยังไม่ถูกส่ง')
    expect(testBtn(html)).toContain('disabled')
    expect(html).toContain('ทุกร้านในกลุ่มนี้ถูกล็อกหรือถูกลบ รายงานจึงยังไม่ถูกส่ง')
  })
})
