import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  resolveOrderBuyerName,
  isPlaceholderAccountName,
  usesTypedBuyerName,
  resolveOrderBuyerNameForShop,
  resolveBuyerCardNames,
} from '@/lib/buyer-name'
import { searchOrders, type SearchableOrder } from '@/lib/order-search'

/**
 * [blocker] ชื่อลูกค้าบนออเดอร์ฝั่งร้าน — ชื่อที่ร้านกรอกเป็นชื่อหลักเสมอ (มติ user 2026-10-04)
 *
 * ที่มา: ร้านบริการกรอกชื่อลูกค้าเป็น "4กฐ9100 คุณบุญคอง" (ใส่ทะเบียนไว้ค้นหา) พอลูกค้าล็อกอินยืนยัน
 * หน้ารายการ/หน้ารายละเอียดเอาชื่อบัญชี (ชื่อ Facebook) ทับ ⇒ ทะเบียนหายจากจอ และค้นหาไม่เจอ
 */
const strip = (s: string) =>
  s.replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '')
const read = (p: string) => strip(readFileSync(join(process.cwd(), p), 'utf8'))
const D = 'src/app/(paces)/seller/(dashboard)/orders/'

describe('[blocker] resolveOrderBuyerName — กติกาเดียวของชื่อลูกค้า', () => {
  it('ร้านกรอกชื่อ + ลูกค้ามีบัญชี ⇒ ชื่อหลัก = ชื่อที่ร้านกรอก · บรรทัดรอง = ชื่อบัญชี', () => {
    expect(resolveOrderBuyerName({ typedName: '4กฐ9100 คุณบุญคอง', accountName: 'Boonkong Saelee' })).toEqual({
      name: '4กฐ9100 คุณบุญคอง',
      accountName: 'Boonkong Saelee',
    })
  })

  it('ลูกค้ายังไม่สมัคร ⇒ ชื่อที่ร้านกรอก ไม่มีบรรทัดรอง', () => {
    expect(resolveOrderBuyerName({ typedName: 'คุณสมใจ', accountName: null })).toEqual({
      name: 'คุณสมใจ',
      accountName: null,
    })
  })

  it('ชื่อบัญชีซ้ำกับชื่อที่ร้านกรอก (ไม่สนช่องว่าง/ตัวพิมพ์) ⇒ ไม่โชว์บรรทัดรอง', () => {
    expect(resolveOrderBuyerName({ typedName: 'Boonkong  Saelee', accountName: 'boonkong saelee' }).accountName).toBeNull()
  })

  it('ชื่อที่ระบบตั้งให้ ("User" / "User_1234") ⇒ ไม่โชว์ และไม่ใช้เป็นชื่อหลัก', () => {
    for (const placeholder of ['User', 'User_1234']) {
      expect(isPlaceholderAccountName(placeholder), placeholder).toBe(true)
      expect(resolveOrderBuyerName({ typedName: 'คุณบุญคอง', accountName: placeholder }).accountName).toBeNull()
      expect(resolveOrderBuyerName({ typedName: null, accountName: placeholder }).name).toBeNull()
    }
    // ชื่อจริงที่ขึ้นต้นด้วย User ไม่ใช่ชื่อที่ระบบตั้งให้
    expect(isPlaceholderAccountName('Usera')).toBe(false)
    expect(isPlaceholderAccountName('User_12')).toBe(false)
  })

  it('ใบเก่าที่ร้านไม่ได้กรอกชื่อ ⇒ ใช้ชื่อบัญชีเป็นชื่อหลัก ไม่ซ้ำเป็นบรรทัดรอง', () => {
    expect(resolveOrderBuyerName({ typedName: '  ', accountName: 'Boonkong Saelee' })).toEqual({
      name: 'Boonkong Saelee',
      accountName: null,
    })
  })
})

describe('[blocker] ค้นหาเจอทั้งชื่อที่ร้านกรอกและชื่อบัญชี', () => {
  const order: SearchableOrder = {
    id: 'abcd1234',
    publicToken: 'abcd1234efgh',
    shortCode: null,
    createdAtISO: '2026-10-04T05:00:00.000Z',
    buyerName: '4กฐ9100 คุณบุญคอง',
    buyerUsername: 'fb1234567890',
    buyerAccountName: 'Boonkong Saelee',
    buyerPhone: '0843287493',
    shipment: null,
    items: [{ name: 'ติดตั้งไฟหน้า' }],
  }
  it('ทะเบียนที่ร้านกรอก · ชื่อลูกค้าที่ร้านกรอก · ชื่อบัญชี · username · เบอร์', () => {
    for (const q of ['4กฐ9100', 'บุญคอง', 'Boonkong', 'saelee', 'fb1234567890', '0843287493']) {
      expect(searchOrders([order], q), q).toHaveLength(1)
    }
  })

  it('ค้นหลายคำข้ามแหล่งได้ — ทะเบียน (ร้านกรอก) + ชื่อบัญชี', () => {
    // 🛑 input นี้มีไว้จับ mutation "ถอดชื่อบัญชีออกจากชุดฟิลด์ค้นหา" ร่วมกับเคสบน — ห้ามลบเพราะดูซ้ำ
    expect(searchOrders([order], '4กฐ9100 Boonkong')).toHaveLength(1)
  })

  it('ค้นชื่อลูกค้าอีกคน ไม่ดึงใบนี้มาปน', () => {
    const other: SearchableOrder = { ...order, id: 'zzzz9999', buyerName: 'คุณสมใจ', buyerUsername: null, buyerAccountName: null, buyerPhone: '0812345678' }
    expect(searchOrders([order, other], 'สมใจ').map((h) => h.order.id)).toEqual(['zzzz9999'])
  })
})

describe('[blocker] ร้านบริการเท่านั้น — ร้านขายของ/บ้านพักได้ของเดิมก่อน #103 ทุกตัวอักษร', () => {
  const input = { typedName: '4กฐ9100 คุณบุญคอง', accountName: 'Boonkong Saelee' }

  it('ตัวตัดสิน: SERVICE_QUEUE เท่านั้น · ค่าแปลก/ว่าง = ของเดิม', () => {
    expect(usesTypedBuyerName('SERVICE_QUEUE')).toBe(true)
    for (const v of ['ONLINE_SALES', 'LODGING', 'GENERAL', '', null, undefined]) {
      expect(usesTypedBuyerName(v), String(v)).toBe(false)
    }
  })

  it('หน้ารายการ: ร้านบริการ = ชื่อที่ร้านกรอก + บรรทัดบัญชี · ร้านอื่น = displayName ?? buyerName ไม่มีบรรทัดรอง', () => {
    expect(resolveOrderBuyerNameForShop('SERVICE_QUEUE', input)).toEqual({
      name: '4กฐ9100 คุณบุญคอง',
      accountName: 'Boonkong Saelee',
    })
    for (const v of ['ONLINE_SALES', 'LODGING']) {
      expect(resolveOrderBuyerNameForShop(v, input), v).toEqual({ name: 'Boonkong Saelee', accountName: null })
      // ของเดิมใช้ ?? — ชื่อที่ระบบตั้งให้ก็ยังชนะเหมือนเดิม (ไม่เปลี่ยนพฤติกรรมร้านอื่นแม้แต่เคสนี้)
      expect(resolveOrderBuyerNameForShop(v, { typedName: 'คุณสมใจ', accountName: 'User' }).name).toBe('User')
      expect(resolveOrderBuyerNameForShop(v, { typedName: 'คุณสมใจ', accountName: null }).name).toBe('คุณสมใจ')
    }
  })

  it('การ์ดผู้ซื้อ: ร้านบริการ = "บัญชี: …" · ร้านอื่น = ชื่อบัญชี + @username แบบเดิม', () => {
    const base = { ...input, username: 'fb1234567890', hasContact: true }
    expect(resolveBuyerCardNames({ ...base, typedNameFirst: true })).toEqual({
      displayName: '4กฐ9100 คุณบุญคอง',
      subLabel: 'บัญชี: Boonkong Saelee',
      hasBuyerInfo: true,
    })
    expect(resolveBuyerCardNames({ ...base, typedNameFirst: false })).toEqual({
      displayName: 'Boonkong Saelee',
      subLabel: '@fb1234567890',
      hasBuyerInfo: true,
    })
    // ลูกค้ายังไม่สมัคร — สองร้านเหมือนกัน
    const guest = { typedName: 'คุณสมใจ', accountName: null, username: null, hasContact: true }
    expect(resolveBuyerCardNames({ ...guest, typedNameFirst: true }).subLabel).toBe('ชื่อที่ร้านบันทึก')
    expect(resolveBuyerCardNames({ ...guest, typedNameFirst: false }).subLabel).toBe('ชื่อที่ร้านบันทึก')
    // ร้านบริการ: ชื่อบัญชีที่ระบบตั้งให้ ⇒ ไม่โชว์ "บัญชี: User"
    expect(resolveBuyerCardNames({ ...base, accountName: 'User', typedNameFirst: true }).subLabel).toBe('ผู้ซื้อที่ลงทะเบียนแล้ว')
  })
})

describe('[blocker] ทุกจอส่งประเภทร้านเข้าตัวตัดสิน — ห้ามเขียนกติกาเองที่จุดใช้งาน', () => {
  it('หน้ารายการ: ผ่าน resolveOrderBuyerNameForShop(shop.vertical) · ชื่อบัญชีสำหรับค้นหาเฉพาะร้านบริการ', () => {
    const page = read(D + 'page.tsx')
    expect(page).toMatch(/resolveOrderBuyerNameForShop\(shop\.vertical, \{ typedName: o\.buyerName, accountName: o\.buyer\?\.displayName \}\)/)
    expect(page).toMatch(/buyerName: names\.name, buyerAccountLabel: names\.accountName/)
    expect(page).toMatch(/buyerAccountName: usesTypedBuyerName\(shop\.vertical\) \? \(o\.buyer\?\.displayName \?\? null\) : null/)
    expect(page).not.toMatch(/buyerName: o\.buyer\?\.displayName/)
  })

  it('การ์ดมือถือ + ตารางเดสก์ท็อป โชว์บรรทัดชื่อบัญชีเฉพาะเมื่อมีค่า (ร้านอื่นเป็น null เสมอ)', () => {
    expect(read(D + 'components/OrderCard.tsx')).toMatch(/order\.buyerAccountLabel && \(/)
    expect(read(D + 'components/OrdersTable.tsx')).toMatch(/row\.original\.buyerAccountLabel && \(/)
  })

  it('หน้ารายละเอียด: การ์ดผู้ซื้อ + กล่องยืนยันนัด ได้ประเภทร้านจาก shop.vertical', () => {
    expect(read(D + '[token]/components/order-detail-shared.tsx')).toMatch(/return resolveBuyerCardNames\(\{\s*typedNameFirst: buyer\.typedNameFirst,/)
    expect(read(D + '[token]/components/CustomerDetails.tsx')).toMatch(/\{subLabel\}/)
    const page = read(D + '[token]/page.tsx')
    expect(page).toMatch(/typedNameFirst: usesTypedBuyerName\(shop\.vertical\),/)
    expect(page).toMatch(/buyerLabel=\{resolveOrderBuyerNameForShop\(shop\.vertical,/)
  })
})
