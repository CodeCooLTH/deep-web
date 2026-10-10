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
  const hidden = bottomNavHiddenPages(roles)
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
  it('BILLING (ร้านบริการ): [หน้าหลัก][+][ออเดอร์] · grid-cols-3 · FAB ป้าย createLabel', () => {
    const html = render(['BILLING'], 'SERVICE_QUEUE')
    expect(html).toContain('grid grid-cols-3')
    expect(hrefs(html)).toEqual(['/dashboard', '/orders/new', '/orders'])
    expect(html).toContain(`aria-label="${resolveOrderVocab('SERVICE_QUEUE').createLabel}"`)
  })
  it('TECHNICIAN (ร้านบริการ): [หน้าหลัก][งาน→/queues] · grid-cols-2 · ไม่มี FAB/แชท/ร้านค้า', () => {
    const html = render(['TECHNICIAN'], 'SERVICE_QUEUE')
    expect(html).toContain('grid grid-cols-2')
    expect(hrefs(html)).toEqual(['/dashboard', '/queues'])
    expect(html).not.toContain('/orders/new')
    expect(html).not.toContain('/inbox')
    expect(html).not.toContain('/shop')
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
  it('/queues: ซ่อนเมื่อ can(O2s) · ช่างเห็นแถบล่าง', () => {
    expect(render(['OWNER'], 'SERVICE_QUEUE', '/queues')).toBe('')
    expect(render(['BILLING'], 'SERVICE_QUEUE', '/queues')).toBe('')
    expect(render(['TECHNICIAN'], 'SERVICE_QUEUE', '/queues')).not.toBe('')
  })
})
