/**
 * feature 00070 U14 — ทางเข้า "รายงานเข้ากลุ่ม LINE" บน ShopQuickLinks + จุดแดง SellerBottomNav
 * render จริงแล้วดู HTML (ไม่ใช่สแกนไฟล์) — กฎ app-store-surfaces: ยืนยันจากผลลัพธ์ของ component
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

import ShopQuickLinks from '@/app/(paces)/seller/(dashboard)/shop/components/ShopQuickLinks'

const URL = 'href="/business/line-reports"'
// เจ้าของหลักร้านธุรกิจเห็นเมนูครบ (visibleUrls = เมนูที่ผ่านตัวกรองบทบาทแล้ว · 00071 S-16)
const ALL_URLS = new Set(['/verification', '/public-profile', '/subscriptions', '/business/line-reports', '/settings', '/admins'])
const render = (p: Partial<React.ComponentProps<typeof ShopQuickLinks>>) =>
  renderToStaticMarkup(
    <ShopQuickLinks visibleUrls={ALL_URLS} hidePayments={false} offerIap={true} lineReports={null} {...p} />,
  )

describe('ShopQuickLinks — แถวรายงานกลุ่ม LINE', () => {
  it('owner ไม่มี alert: เห็นแถว ไม่มีจุดแดง', () => {
    const html = render({ lineReports: { hasAlert: false } })
    expect(html).toContain(URL)
    expect(html).toContain('รายงานเข้ากลุ่ม LINE')
    expect(html).toContain('data-icon="brand-line"')
    expect(html).not.toContain('มีกลุ่มที่ต้องดูแล')
  })
  it('owner มี alert: จุดแดง + sr-only', () => {
    const html = render({ lineReports: { hasAlert: true } })
    expect(html).toContain('bg-danger')
    expect(html).toContain('มีกลุ่มที่ต้องดูแล')
  })
  it('null: ไม่เห็นแถว', () => {
    expect(render({ lineReports: null })).not.toContain(URL)
  })
  it.each([
    [false, true],
    [true, true],
    [true, false],
  ])('แถวไม่หายเมื่อ hidePayments=%s offerIap=%s', (hidePayments, offerIap) => {
    expect(render({ hidePayments, offerIap, lineReports: { hasAlert: false } })).toContain(URL)
  })
  it('อยู่ก่อน "การจัดส่ง"', () => {
    const html = render({ lineReports: { hasAlert: false } })
    expect(html.indexOf(URL)).toBeLessThan(html.indexOf('การจัดส่ง'))
  })
})

describe('SellerBottomNav — จุดแดงที่ "ร้านค้า" (ต่อสาย)', () => {
  const read = (rel: string) => require('node:fs').readFileSync(require('node:path').join(process.cwd(), rel), 'utf8')
  const nav = read('src/app/(paces)/seller/(dashboard)/_shared/SellerBottomNav.tsx')
  it('prop บังคับ + ใช้ aria จาก dictionary', () => {
    expect(nav).toMatch(/\n\s*shopAlert: boolean/)
    // 00071 T7: ช่องแท็บเป็น NavTabLink (ตามบทบาท) — จุดแดงยังเกาะ tab.badge === 'shopAlert' && shopAlert
    expect(nav).toMatch(/tab\.badge === 'shopAlert' && shopAlert/)
    expect(nav).toContain('t.dashboard.navShopAlertAria')
  })
  it('dictionary ครบสองภาษา + layout ส่ง prop', () => {
    expect(read('src/i18n/dictionaries/th.ts')).toContain('navShopAlertAria')
    expect(read('src/i18n/dictionaries/en.ts')).toContain('navShopAlertAria')
    expect(read('src/app/(paces)/seller/(dashboard)/layout.tsx')).toMatch(/shopAlert=\{shopAlert\}/)
  })
})
