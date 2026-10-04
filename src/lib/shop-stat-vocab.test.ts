import { describe, it, expect } from 'vitest'

import { profileSoldLine, shopStatVocab, shopCompletedLabel, SERVICE_COMPLETED_LABEL } from './shop-stat-vocab'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * [blocker] feature 00053 — ประโยคยอดสะสมบนการ์ดหน้าร้าน (TC-C1)
 *
 * บรรทัดนี้คือสิ่งเดียวที่ยังพูดแทนร้านได้บนการ์ดเมื่อร้านซ่อนราคา — ผู้ใช้ระบุตรง ๆ 2026-08-23
 * ว่า "ยังต้องมีคำว่า ใช้บริการแล้ว 3 ครั้ง"
 */
describe('[blocker] profileSoldLine', () => {
  it('ร้านขายออนไลน์ → "ขายแล้ว N ชิ้น"', () => {
    expect(profileSoldLine({ itemKind: 'PRODUCT' }, '12')).toBe('ขายแล้ว 12 ชิ้น')
  })

  it('ร้านคิวงาน → "ใช้บริการแล้ว N ครั้ง" (ลักษณนามเปลี่ยนตามกริยา ไม่ใช่แค่เปลี่ยนคำนาม)', () => {
    expect(profileSoldLine({ itemKind: 'PRODUCT', isServiceQueue: true }, '3')).toBe(
      'ใช้บริการแล้ว 3 ครั้ง',
    )
  })

  it('การ์ดห้องพัก → "เข้าพักแล้ว N ครั้ง"', () => {
    expect(profileSoldLine({ itemKind: 'ROOM' }, '8')).toBe('เข้าพักแล้ว 8 ครั้ง')
  })

  it('🛑 ตัวตัดสินคือ "การ์ดใบนี้เป็นอะไร" มาก่อน "ร้านนี้ประเภทอะไร" — ห้องพักในร้านคิวงานยังอ่านว่าเข้าพัก', () => {
    expect(profileSoldLine({ itemKind: 'ROOM', isServiceQueue: true }, '8')).toBe('เข้าพักแล้ว 8 ครั้ง')
  })

  it('ตัวเลขถูกใส่ตามที่ผู้เรียกจัดรูปมา (คั่นหลักแล้ว) ไม่ถูกแปลงซ้ำ', () => {
    expect(profileSoldLine({ itemKind: 'PRODUCT' }, '1,204')).toBe('ขายแล้ว 1,204 ชิ้น')
  })
})

describe('[blocker] ป้าย "งานสำเร็จ" ของร้านบริการ (2026-10-04) — ร้านอื่นคำเดิม', () => {
  // ที่มา: หน้าโปรไฟล์ร้านบริการเขียน "นัดหมาย" ทั้งที่ตัวเลขคือ completedOrders (งานที่สำเร็จแล้ว)
  it('หน้าโปรไฟล์: ร้านบริการ = งานสำเร็จ · บ้านพัก/ขายของ ไม่เปลี่ยน', () => {
    expect(shopStatVocab(false, true).orders).toBe('งานสำเร็จ')
    expect(SERVICE_COMPLETED_LABEL).toBe('งานสำเร็จ')
    expect(shopStatVocab(true, false).orders).toBe('การเข้าพัก')
    expect(shopStatVocab(false, false).orders).toBe('ออเดอร์')
  })

  it('หน้าออเดอร์ /o/ + หน้าเข้าสู่ระบบ: ร้านบริการ = งานสำเร็จ · ร้านอื่น = ออเดอร์สำเร็จ', () => {
    expect(shopCompletedLabel(true)).toBe('งานสำเร็จ')
    expect(shopCompletedLabel(false)).toBe('ออเดอร์สำเร็จ')
  })

  it('ทุกจอส่งเงื่อนไข "ร้านบริการ" เข้าตัวตัดสิน — ไม่มีจอไหนพิมพ์ป้ายตายตัว', () => {
    const read = (p: string) =>
      readFileSync(join(process.cwd(), p), 'utf8').replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '')
    const O = 'src/app/(marketing)/o/[token]/'
    expect(read(O + 'GuestOrderView.tsx')).toMatch(/completedLabel=\{shopCompletedLabel\(order\.shop\.vertical === 'SERVICE_QUEUE'\)\}/)
    expect(read(O + 'OrderDetailMobile.tsx')).toMatch(/completedLabel=\{shopCompletedLabel\(order\.isServiceShop\)\}/)
    expect(read('src/services/order.service.ts')).toMatch(/completedLabel: shopCompletedLabel\(order\.shop\.vertical === "SERVICE_QUEUE"\)/)
    expect(read(O + 'ShopEvidence.tsx')).not.toMatch(/>\s*ออเดอร์สำเร็จ\s*</)
    expect(read('src/app/(marketing)/auth/sign-in/OrderLinkShell.tsx')).not.toMatch(/\n\s*ออเดอร์สำเร็จ\s*\n/)
    // ตัวจัดหน้าร้าน (ฝั่งผู้ขาย) คัดลอกป้ายแยกไว้ — ต้องตรงกับหน้าจริง
    expect(read('src/app/(paces)/seller/(fullscreen)/public-profile/builder/components/CanvasFrame.tsx')).toMatch(
      /serviceQueue: \{\s*orders: 'งานสำเร็จ',/,
    )
  })
})
