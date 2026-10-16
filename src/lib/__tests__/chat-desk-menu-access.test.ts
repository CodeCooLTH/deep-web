/**
 * 00077 โต๊ะแชท — เมนูและหน้า /chat-desk เห็นเฉพาะ OWNER (capability X7)
 * แยกจาก role-nav.test.ts (ไฟล์ที่คุ้มครองด้วยด่าน 0) — เทสเพิ่มอย่างเดียว ไม่แตะตารางเดิม
 */
import { describe, expect, it } from 'vitest'
import { canSeePage, isRegisteredPage } from '@/lib/role-nav'
import { flattenSellerMenu, resolveVisibleSellerMenu, sellerMenuItems } from '@/lib/seller-menu'
import type { ShopRole } from '@/lib/shop-permissions'

const ALL: ShopRole[] = ['OWNER', 'MANAGER', 'CHAT', 'BILLING', 'TECHNICIAN']
const SERVICE = { kind: 'BUSINESS', vertical: 'SERVICE_QUEUE' }
const ONLINE = { kind: 'BUSINESS', vertical: 'ONLINE_SALES' }

const slugs = (staff: { role: 'OWNER' | 'ADMIN'; roles: string[] }, shop = ONLINE) =>
  flattenSellerMenu(
    resolveVisibleSellerMenu(sellerMenuItems, {
      entitlement: { status: 'ACTIVE', package: 'PRO' },
      staff: { kind: 'BUSINESS', ...staff },
      ownsShop: true,
      shop: { ...shop, isPrimaryOwner: staff.role === 'OWNER' },
    }),
  ).map((i) => i.slug)

describe('00077 โต๊ะแชท — สิทธิ์เมนู/หน้า', () => {
  it('/chat-desk อยู่ในทะเบียน และเปิดได้เฉพาะ OWNER', () => {
    expect(isRegisteredPage('/chat-desk')).toBe(true)
    for (const r of ALL) expect(canSeePage('/chat-desk', [r], { isPrimaryOwner: true }), r).toBe(r === 'OWNER')
  })

  it.each([['ONLINE_SALES', ONLINE], ['SERVICE_QUEUE', SERVICE]])('%s: เมนูเห็นเฉพาะ OWNER — บทบาทอื่นไม่เห็นแม้เห็น seller:inbox', (_n, shop) => {
    expect(slugs({ role: 'OWNER', roles: ['OWNER'] }, shop)).toContain('seller:chat-desk')
    for (const r of ['MANAGER', 'CHAT', 'BILLING', 'TECHNICIAN'])
      expect(slugs({ role: 'ADMIN', roles: [r] }, shop), r).not.toContain('seller:chat-desk')
    expect(slugs({ role: 'ADMIN', roles: ['MANAGER'] }, shop)).toContain('seller:inbox')
  })

  it('เมนูอยู่ลำดับที่ 2 ของกลุ่มแชท ต่อจาก "ข้อความ"', () => {
    const s = slugs({ role: 'OWNER', roles: ['OWNER'] })
    expect(s.indexOf('seller:chat-desk')).toBe(s.indexOf('seller:inbox') + 1)
  })
})
