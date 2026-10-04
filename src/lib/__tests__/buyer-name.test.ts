import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { resolveOrderBuyerName, isPlaceholderAccountName } from '@/lib/buyer-name'
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

describe('[blocker] ทุกจอฝั่งร้านใช้กติกาเดียว — ห้ามกลับไปเอาชื่อบัญชีทับ', () => {
  it('หน้ารายการ: ชื่อหลักมาจาก resolveOrderBuyerName ไม่ใช่ displayName ก่อน', () => {
    const page = read(D + 'page.tsx')
    expect(page).toMatch(/resolveOrderBuyerName\(\{ typedName: o\.buyerName, accountName: o\.buyer\?\.displayName \}\)/)
    expect(page).toMatch(/buyerName: names\.name, buyerAccountLabel: names\.accountName/)
    expect(page).not.toMatch(/buyerName: o\.buyer\?\.displayName/)
  })

  it('การ์ดมือถือ + ตารางเดสก์ท็อป โชว์บรรทัดชื่อบัญชี', () => {
    expect(read(D + 'components/OrderCard.tsx')).toMatch(/order\.buyerAccountLabel && \(/)
    expect(read(D + 'components/OrdersTable.tsx')).toMatch(/row\.original\.buyerAccountLabel && \(/)
  })

  it('หน้ารายละเอียด: การ์ดผู้ซื้อ + กล่องยืนยันนัด ใช้ชื่อที่ร้านกรอกก่อน · เลิกโชว์ @username', () => {
    expect(read(D + '[token]/components/order-detail-shared.tsx')).toMatch(/resolveOrderBuyerName\(\{\s*typedName: buyer\.buyerName,/)
    const card = read(D + '[token]/components/CustomerDetails.tsx')
    expect(card).toMatch(/`บัญชี: \$\{accountName\}`/)
    expect(card).not.toMatch(/`@\$\{buyer\.buyerUsername\}`/)
    const page = read(D + '[token]/page.tsx')
    expect(page).toMatch(/buyerLabel=\{resolveOrderBuyerName\(/)
    expect(page).not.toMatch(/buyerLabel=\{order\.buyer\?\.displayName/)
  })
})
