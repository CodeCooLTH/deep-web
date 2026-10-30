/**
 * หน้าแรกช่างล้วนร้านบริการ + การ์ดแพ็กเกจร้านค้า (00086 · user 2026-10-30)
 *  - "มีไว้ด้วยและทำให้ช่างใช้งานง่าย": ตัวนับ/ทางลัดเดิมอยู่ครบ แต่งานของฉันขึ้นก่อน · ไม่มีทางลัด/ลิงก์ที่พาไปหน้าทำอะไรไม่ได้
 *  - "ซ่อนเลย": การ์ด/ชิปแพ็กเกจร้านค้า ไม่แสดงให้ช่างล้วนร้านบริการ — เจ้าของ/บทบาทอื่น/ร้านอื่น เหมือนเดิม
 * ตารางคาดหวังเขียนมือ · ส่วนสแกนซอร์สยืนยันว่าผู้เรียก (layout / CompactHero / page) ใช้ตัวตัดสินจริง
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { activityWithOpenableLinks, homeBlocks } from '../dashboard-money'
import { isServiceTechnicianOnly, showsShopPackage, technicianUnusableShortcutSlugs } from '../role-nav'
import type { ShopRole } from '../shop-permissions'
import { en } from '@/i18n/dictionaries/en'
import { th } from '@/i18n/dictionaries/th'

const SERVICE = { kind: 'BUSINESS', vertical: 'SERVICE_QUEUE' }
const ONLINE = { kind: 'BUSINESS', vertical: 'ONLINE_SALES' }
const OTHERS: ShopRole[][] = [['OWNER'], ['MANAGER'], ['CHAT'], ['BILLING'], ['TECHNICIAN', 'CHAT'], ['TECHNICIAN', 'MANAGER']]

describe('showsShopPackage — การ์ด/ชิปแพ็กเกจร้านค้า', () => {
  it('ช่างล้วนร้านบริการ = ไม่เห็น', () => {
    expect(showsShopPackage(['TECHNICIAN'], SERVICE)).toBe(false)
  })
  it.each(OTHERS)('%s ร้านบริการ = เห็นเหมือนเดิม (มติ 2026-07-29 ทุกบทบาทเห็นแพ็กเกจ)', (...roles) => {
    expect(showsShopPackage(roles, SERVICE)).toBe(true)
  })
  it('ร้านประเภทอื่นไม่เปลี่ยน — ช่างล้วนร้านขายออนไลน์ยังเห็น (service-vertical-only)', () => {
    expect(showsShopPackage(['TECHNICIAN'], ONLINE)).toBe(true)
    expect(showsShopPackage(['OWNER'], ONLINE)).toBe(true)
  })
  it('ไม่มีบทบาท (ไม่ใช่ช่างล้วน) = ค่าเดิม', () => {
    expect(isServiceTechnicianOnly([], SERVICE)).toBe(false)
    expect(showsShopPackage([], SERVICE)).toBe(true)
  })
})

describe('technicianUnusableShortcutSlugs — ทางลัดที่ช่างใช้ไม่ได้จริง', () => {
  it('ช่างล้วนร้านบริการ: ร้านค้า (ฟอร์มตั้งค่าร้าน · บันทึก = T1) ถูกถอด', () => {
    expect([...technicianUnusableShortcutSlugs(['TECHNICIAN'], SERVICE)]).toEqual(['seller:shop'])
  })
  it.each(OTHERS)('%s = ไม่ถอดอะไร', (...roles) => {
    expect(technicianUnusableShortcutSlugs(roles, SERVICE).size).toBe(0)
  })
  it('ช่างล้วนร้านอื่น = ไม่ถอด', () => {
    expect(technicianUnusableShortcutSlugs(['TECHNICIAN'], ONLINE).size).toBe(0)
  })
})

describe('homeBlocks — ธงหน้าแรกช่างล้วนร้านบริการ', () => {
  it('ช่างล้วนร้านบริการ: งานขึ้นก่อน · หัว "งานทั้งร้าน" · ลิงก์ฟีดตามสิทธิ์ · ไม่มีชิปแพ็กเกจ', () => {
    const b = homeBlocks(['TECHNICIAN'], SERVICE)
    expect(b.shopWideJobLabels).toBe(true)
    expect(b.activityLinksByPage).toBe(true)
    expect(b.shopPackage).toBe(false)
  })
  it.each(OTHERS)('%s ร้านบริการ = ผังเดิมทุกธง', (...roles) => {
    const b = homeBlocks(roles, SERVICE)
    expect([b.shopWideJobLabels, b.activityLinksByPage, b.shopPackage]).toEqual([false, false, true])
  })
  it('ช่างล้วนร้านขายออนไลน์ = ผังเดิมทุกธง', () => {
    const b = homeBlocks(['TECHNICIAN'], ONLINE)
    expect([b.shopWideJobLabels, b.activityLinksByPage, b.shopPackage]).toEqual([false, false, true])
  })
})

describe('activityWithOpenableLinks — ฟีดกิจกรรมไม่พาไปหน้าที่ไม่มีสิทธิ์', () => {
  const items = [
    { type: 'ORDER_CREATED', href: '/orders/tok1' },
    { type: 'LOW_STOCK_ALERT', href: '/products/p1/edit' },
    { type: 'REVIEW_RECEIVED' },
  ]
  it('ช่าง: ลิงก์งานยังอยู่ · ลิงก์แก้สินค้า (P2) ถูกถอด · รายการไม่หาย', () => {
    const out = activityWithOpenableLinks(items, ['TECHNICIAN'])
    expect(out).toHaveLength(3)
    expect(out[0].href).toBe('/orders/tok1')
    expect('href' in out[1]).toBe(false)
    expect(out[1].type).toBe('LOW_STOCK_ALERT')
  })
  it('เจ้าของ: ลิงก์ครบเท่าเดิม', () => {
    expect(activityWithOpenableLinks(items, ['OWNER'])).toEqual(items)
  })
})

describe('i18n: คีย์ใหม่มีครบสองภาษา (en ไม่มีไทย)', () => {
  it.each(['technicianShopJobs', 'activityEmptyTitleNoCreate'] as const)('%s', (k) => {
    expect(th.dashboard[k]).toBeTruthy()
    expect(en.dashboard[k]).toBeTruthy()
    expect(/[฀-๿]/.test(en.dashboard[k])).toBe(false)
  })
})

// ─── ด่านซอร์ส: ผู้เรียกใช้ตัวตัดสินจริง (ถอดด่าน = แดง) ─────────────────────────────
describe('ผู้เรียกใช้ตัวตัดสิน', () => {
  const read = (rel: string) => readFileSync(join(process.cwd(), 'src/app/(paces)/seller/(dashboard)', rel), 'utf8')
  const layout = read('layout.tsx')
  const page = read('dashboard/page.tsx')
  const cc = read('dashboard/components/CommandCenter.tsx')
  const hero = read('dashboard/components/CompactHero.tsx')
  const feed = read('dashboard/components/RecentActivityFeed.tsx')

  it('layout: การ์ดแพ็กเกจ sidebar ผ่าน showsShopPackage ทั้ง query และ render (App Store ยังกั้นอยู่)', () => {
    expect(layout).toMatch(/const showPackageCard = active\.kind === 'BUSINESS' && showsShopPackage\(roles, /)
    expect(layout).toMatch(/if \(showPackageCard\) \{\s*try \{[\s\S]*?getSubscriptionStatus/)
    expect(layout).toMatch(/sidenavHeaderSlot=\{\s*showPackageCard && !hidePayments \? \(\s*<ShopPackageSidenavCard/)
  })
  it('มือถือ: ชิปแพ็กเกจใน CompactHero ผ่าน blocks.shopPackage · page ไม่ query แพ็กเกจให้ช่าง', () => {
    expect(cc).toMatch(/showPackageChip=\{blocks\.shopPackage\}/)
    expect(hero).toMatch(/\{showMoneyStatus && \(\s*showPackageChip && \(/)
    expect(page).toMatch(/if \(blocks\.shopPackage\) try \{\s*const subscription = await getSubscriptionStatus/)
  })
  it('เดสก์ท็อป: การ์ดงานของฉัน (TodayJobs) อยู่ก่อนการ์ดร้าน (UserCard) ในแถวแรก', () => {
    const jobs = page.indexOf('<TodayJobs className="h-full"')
    const userCard = page.indexOf('<UserCard ')
    expect(jobs).toBeGreaterThan(0)
    expect(jobs).toBeLessThan(userCard)
  })
  it('หัวการ์ดตัวนับ: ช่างใช้ "งานทั้งร้าน" ทั้งมือถือและเดสก์ท็อป + การ์ดสถิติ', () => {
    expect(page).toMatch(/const orderStatusTitle = blocks\.shopWideJobLabels \? t\.dashboard\.technicianShopJobs :/)
    expect(page).toContain('orderNounTitle: orderStatusTitle,')
    expect(page).toContain('orderNounTitle={orderStatusTitle}')
    expect(page).toMatch(/title: blocks\.shopWideJobLabels \? t\.dashboard\.technicianShopJobs :/)
  })
  it('ฟีดกิจกรรม: ลิงก์ตามสิทธิ์ + ไม่มีปุ่มชวนสร้างสำหรับช่าง', () => {
    expect(page).toMatch(/blocks\.activityLinksByPage \? activityWithOpenableLinks\(activityRes\.value, viewerRoles\)/)
    expect(page).toContain('canCreate={!blocks.activityLinksByPage}')
    expect(feed).toMatch(/\{canCreate && \(\s*<Link\s+href="\/orders\/new"/)
  })
})
