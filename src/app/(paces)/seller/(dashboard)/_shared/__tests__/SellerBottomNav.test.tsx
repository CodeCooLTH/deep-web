/**
 * SellerBottomNav (00071 P3 · S-16) — DOM ของเจ้าของต้องเหมือนก่อนแยกตามบทบาททุกตัวอักษร
 *
 * golden = HTML ที่ได้จาก SellerBottomNav "ฉบับเขียนทีละช่องด้วยมือ" (ก่อน T7) ที่ pendingCount=3 unread=120 shopAlert
 * ถ้าจงใจเปลี่ยนหน้าตาแถบล่างของเจ้าของ ให้สร้าง golden ใหม่ — ถ้าไม่ได้ตั้งใจ เทสนี้คือสิ่งที่จับ
 * icon ถูก mock เป็น <i data-icon> เพราะ iconify ไม่ render ฝั่ง server
 */
import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { th } from '@/i18n/dictionaries/th'

let pathname = '/dashboard'
vi.mock('next/navigation', () => ({ usePathname: () => pathname }))
vi.mock('@/i18n/LocaleProvider', () => ({ useT: () => th }))
vi.mock('@/components/wrappers/Icon', () => ({
  default: ({ icon, className }: { icon: string; className?: string }) => <i data-icon={icon} className={className} />,
}))

import SellerBottomNav from '../SellerBottomNav'
import { resolveOrderVocab } from '@/lib/seller-menu'
import { bottomNavHiddenPages, resolveMobileNav } from '@/lib/role-nav'
import type { ShopRole } from '@/lib/shop-permissions'

const golden = JSON.parse(
  readFileSync(join(__dirname, 'bottom-nav-owner.golden.json'), 'utf8'),
) as Record<'online' | 'service', string>

function render(roles: ShopRole[], vertical: 'ONLINE_SALES' | 'SERVICE_QUEUE', path = '/dashboard') {
  pathname = path
  const nav = resolveMobileNav(roles, { kind: 'BUSINESS', vertical }, resolveOrderVocab(vertical), th)
  const hidden = bottomNavHiddenPages(roles, { kind: 'BUSINESS', vertical })
  return renderToStaticMarkup(
    <SellerBottomNav
      nav={nav}
      pendingCount={3}
      unreadChatCount={120}
      shopAlert
      hideOnOrderDetail={hidden.orderDetail}
      hideOnQueues={hidden.queues}
    />,
  )
}

describe('SellerBottomNav — เจ้าของ/ผู้ดูแล DOM เดิมทุกคลาส', () => {
  it('OWNER ร้านขายออนไลน์ = golden', () => {
    expect(render(['OWNER'], 'ONLINE_SALES')).toBe(golden.online)
  })
  it('OWNER ร้านบริการ = golden', () => {
    expect(render(['OWNER'], 'SERVICE_QUEUE')).toBe(golden.service)
  })
  it('MANAGER = OWNER (5 ช่อง ไม่ต่างแม้แต่คลาส)', () => {
    expect(render(['MANAGER'], 'ONLINE_SALES')).toBe(golden.online)
  })
})

describe('SellerBottomNav — เปลือกตามบทบาท', () => {
  const hrefs = (html: string) => [...html.matchAll(/href="([^"]+)"/g)].map((m) => m[1])

  it('CHAT: [หน้าหลัก][ออเดอร์][+][แชท] · grid-cols-4 · FAB ตรง ไม่มี speed-dial', () => {
    const html = render(['CHAT'], 'ONLINE_SALES')
    expect(html).toContain('grid grid-cols-4')
    expect(hrefs(html)).toEqual(['/dashboard', '/orders', '/orders/new', '/inbox'])
    expect(html).not.toContain('aria-expanded')
    expect(html).toContain(`aria-label="${resolveOrderVocab('ONLINE_SALES').createLabel}"`)
  })
  it('BILLING (ร้านบริการ · 00086 FR-016): [หน้าหลัก][บริการ][+][ตารางงาน][ลูกค้า] · grid-cols-5 · FAB ป้าย createLabel', () => {
    const html = render(['BILLING'], 'SERVICE_QUEUE')
    expect(html).toContain('grid grid-cols-5')
    expect(hrefs(html)).toEqual(['/dashboard', '/orders', '/orders/new', '/queues', '/customers'])
    expect(html).toContain('>ตารางงาน</span>')
    expect(html).toContain('>ลูกค้า</span>')
    expect(html).toContain(`aria-label="${resolveOrderVocab('SERVICE_QUEUE').createLabel}"`)
  })
  it('CHAT (ร้านบริการ · 00086 FR-016): [หน้าหลัก][บริการ][+][แชท][ตารางงาน] · grid-cols-5', () => {
    const html = render(['CHAT'], 'SERVICE_QUEUE')
    expect(html).toContain('grid grid-cols-5')
    expect(hrefs(html)).toEqual(['/dashboard', '/orders', '/orders/new', '/inbox', '/queues'])
  })
  it('แท็บตารางงาน/ลูกค้า active ตาม path (startsWith) · ไม่มี badge', () => {
    const q = render(['CHAT'], 'SERVICE_QUEUE', '/queues/new')
    expect(q).toMatch(/<a class="flex [^"]*text-primary" aria-label="ตารางงาน" aria-current="page" href="\/queues">/)
    const c = render(['BILLING'], 'SERVICE_QUEUE', '/customers/abc')
    expect(c).toMatch(/<a class="flex [^"]*text-primary" aria-label="ลูกค้า" aria-current="page" href="\/customers">/)
  })
  it('BILLING (ร้านขายออนไลน์ ไม่ผ่าน effectiveRoles): แถบเดิม [หน้าหลัก][+][ออเดอร์] · grid-cols-3', () => {
    const html = render(['BILLING'], 'ONLINE_SALES')
    expect(html).toContain('grid grid-cols-3')
    expect(hrefs(html)).toEqual(['/dashboard', '/orders/new', '/orders'])
  })
  it('TECHNICIAN (ร้านบริการ · 00086 P3): [หน้าหลัก][งานของฉัน][ตารางงาน] · grid-cols-3 · ไม่มี FAB/แชท/ร้านค้า', () => {
    const html = render(['TECHNICIAN'], 'SERVICE_QUEUE')
    expect(html).toContain('grid grid-cols-3')
    expect(hrefs(html)).toEqual(['/dashboard', '/my-jobs', '/queues'])
    expect(html).toContain('>งานของฉัน</span>')
    expect(html).toContain('>ตารางงาน</span>')
    expect(html).not.toContain('aria-expanded')
    expect(html).not.toContain('/orders/new')
    expect(html).not.toContain('/inbox')
    expect(html).not.toContain('/shop')
  })
})

describe('SellerBottomNav — ช่างล้วน (00086 P3)', () => {
  it('/my-jobs: แท็บ "งานของฉัน" active · แถบไม่ซ่อน', () => {
    const html = render(['TECHNICIAN'], 'SERVICE_QUEUE', '/my-jobs')
    expect(html).toContain('aria-current="page" href="/my-jobs"')
  })
  it('ช่างล้วนร้านขายออนไลน์: แถบเดิม [หน้าหลัก][งาน→/orders] · grid-cols-2 · ไม่มี /my-jobs', () => {
    const html = render(['TECHNICIAN'], 'ONLINE_SALES')
    expect(html).toContain('grid grid-cols-2')
    expect([...html.matchAll(/href="([^"]+)"/g)].map((m) => m[1])).toEqual(['/dashboard', '/orders'])
  })
})

describe('SellerBottomNav — ซ่อนเมื่อหน้านั้นวาดแถบล่างเอง', () => {
  it('/orders ซ่อนทุกบทบาท', () => {
    expect(render(['OWNER'], 'ONLINE_SALES', '/orders')).toBe('')
  })
  it('/orders/<token>: ซ่อนเมื่อมี OrderActionBar (เจ้าของ) · ช่างเห็นแถบล่าง', () => {
    expect(render(['OWNER'], 'SERVICE_QUEUE', '/orders/abc123')).toBe('')
    expect(render(['CHAT'], 'SERVICE_QUEUE', '/orders/abc123')).toBe('')
    expect(render(['TECHNICIAN'], 'SERVICE_QUEUE', '/orders/abc123')).not.toBe('')
  })
  it('/orders/new ยังเห็นแถบล่างเสมอ', () => {
    expect(render(['OWNER'], 'ONLINE_SALES', '/orders/new')).not.toBe('')
  })
  it('/queues ร้านบริการ (00086 · 2026-10-27): เห็นแถบล่างทุกบทบาท · แท็บตารางงาน active', () => {
    for (const r of ['OWNER', 'MANAGER', 'CHAT', 'BILLING', 'TECHNICIAN'] as ShopRole[]) {
      expect(render([r], 'SERVICE_QUEUE', '/queues'), r).not.toBe('')
    }
    expect(render(['CHAT'], 'SERVICE_QUEUE', '/queues')).toMatch(/aria-label="ตารางงาน" aria-current="page" href="\/queues"/)
  })
  it('/queues ร้านอื่น: คงเดิม — ซ่อนเมื่อ can(O2s)', () => {
    expect(render(['OWNER'], 'ONLINE_SALES', '/queues')).toBe('')
    expect(render(['CHAT'], 'ONLINE_SALES', '/queues')).toBe('')
  })
})
