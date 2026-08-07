/**
 * เทสของ seller-menu — เน้นสองเรื่องที่ "พังแบบเงียบ" ไม่มีอะไรฟ้อง
 *
 * 1. slug ของรายการ: `SellerShortcutPreference.slugs` เก็บ slug พวกนี้ไว้ในฐานข้อมูล (feature 00027) เปลี่ยนชื่อ
 *    slug เมื่อไร เมนูลัดที่ผู้ใช้ปักไว้จะกลายเป็น unavailable ทั้งหมดโดยไม่มี error ที่ไหนเลย
 *    เทสนี้ตรึงชุด slug ไว้ — ย้ายกลุ่ม/เปลี่ยนป้ายทำได้ตามใจ แต่ slug ต้องคงเดิม
 * 2. ตัวกรองตาม vertical: จัดกลุ่มเมนูใหม่ (2026-08-04) ย้าย 9 รายการข้ามกลุ่ม ถ้าตัวกรองอ่าน
 *    โครงกลุ่มผิดไป ร้านบ้านพักจะเห็นเมนูสต็อก/ประมูลของร้านขายออนไลน์โดยไม่มีใครสังเกต
 */
import { describe, expect, it } from 'vitest'

import {
  applyOrderLabel,
  flattenSellerMenu,
  resolveOrderMenuLabel,
  resolveOrderVocab,
  ORDER_VOCAB,
  resolveProductVocab,
  PRODUCT_VOCAB,
  resolveVisibleSellerMenu,
  sellerMenuItems,
} from './seller-menu'

/** ctx กลาง ๆ ที่เปิดทุกอย่างเท่าที่เปิดได้ — เทสแต่ละอันค่อย override เฉพาะที่สนใจ */
function ctx(vertical: string) {
  return {
    entitlement: { status: 'ACTIVE' as const, package: 'PRO' as const },
    staff: { kind: 'BUSINESS' as const, role: 'OWNER' as const },
    expense: { kind: 'GRANTED' } as never,
    shop: { kind: 'BUSINESS', vertical },
  }
}

function slugsOf(items: ReturnType<typeof flattenSellerMenu>) {
  return items.map((i) => i.slug).filter(Boolean) as string[]
}

describe('sellerMenuItems — slug contract', () => {
  it('มี slug ครบตามที่ SellerShortcutPreference.slugs อ้างถึง (ห้ามเปลี่ยนชื่อ)', () => {
    expect(slugsOf(flattenSellerMenu(sellerMenuItems)).sort()).toEqual(
      [
        'seller:admins',
        'seller:auctions',
        'seller:badges',
        'seller:bookings',
        'seller:calendar',
        'seller:customers',
        'seller:dashboard',
        'seller:expenses',
        'seller:housekeepers',
        'seller:inbox',
        'seller:inventory',
        'seller:orders',
        'seller:products',
        'seller:public-profile',
        'seller:queues',
        'seller:reviews',
        'seller:rooms',
        'seller:sales',
        'seller:settings',
        'seller:settings-auto-reply',
        'seller:settings-channels',
        'seller:settings-chatbot',
        'seller:shop',
        'seller:subscriptions',
        'seller:verification',
        'seller:wallet',
      ].sort(),
    )
  })

  it('ทุกรายการที่กดได้มี url และ slug ขึ้นต้นด้วย seller: (รูปแบบที่ API shortcuts ตรวจ)', () => {
    for (const item of flattenSellerMenu(sellerMenuItems)) {
      expect(item.url, `${item.slug} ไม่มี url`).toBeTruthy()
      expect(item.slug).toMatch(/^seller:[a-z][a-z-]*$/)
    }
  })
})

describe('applyOrderLabel', () => {
  it.each([
    ['ONLINE_SALES', 'คำสั่งซื้อ'],
    ['SERVICE_QUEUE', 'การเข้ารับบริการ'],
    ['LODGING', 'บิลเข้าพัก'],
  ])('%s → %s', (vertical, expected) => {
    expect(resolveOrderMenuLabel(vertical)).toBe(expected)

    const orders = flattenSellerMenu(applyOrderLabel(sellerMenuItems, vertical)).find(
      (i) => i.slug === 'seller:orders',
    )
    expect(orders?.label).toBe(expected)
  })

  it('vertical ที่ไม่รู้จัก → คงป้ายของ ONLINE_SALES (fail-safe เดียวกับ applyVerticalMenu)', () => {
    expect(resolveOrderMenuLabel('SOMETHING_NEW')).toBe('คำสั่งซื้อ')
  })

  it('ไม่แตะป้ายของรายการอื่น', () => {
    const before = flattenSellerMenu(sellerMenuItems).map((i) => `${i.slug}=${i.label}`)
    const after = flattenSellerMenu(applyOrderLabel(sellerMenuItems, 'LODGING')).map(
      (i) => `${i.slug}=${i.label}`,
    )
    const changed = after.filter((row, idx) => row !== before[idx])
    expect(changed).toEqual(['seller:orders=บิลเข้าพัก'])
  })

  it('ไม่แก้อาเรย์ต้นฉบับ (ต้องเป็น pure transform — getSellerPageTitle import ตัวเดียวกันนี้)', () => {
    applyOrderLabel(sellerMenuItems, 'LODGING')
    const orders = flattenSellerMenu(sellerMenuItems).find((i) => i.slug === 'seller:orders')
    expect(orders?.label).toBe('คำสั่งซื้อ')
  })
})

describe('resolveOrderVocab — คลังคำ 5 ช่อง (feature 00030 + dateLabel จาก 00033)', () => {
  it.each([
    ['ONLINE_SALES', 'คำสั่งซื้อ', 'คำสั่งซื้อ', 'สร้างคำสั่งซื้อ', 'สร้างคำสั่งซื้อ', 'วันที่สั่งซื้อ'],
    // nounShort ย่อจาก 'เข้ารับบริการ' → 'บริการ' (user เคาะ 2026-08-05) — หัวหน้าต่างโมดัลในแชท
    // และแท็บล่างมือถือประกอบคำจากช่องนี้ ("บริการใหม่" แทน "การเข้ารับบริการใหม่")
    // dateLabel ไม่ใช่ "วันที่" + noun — LODGING/SERVICE_QUEUE มีคอลัมน์วันใช้บริการแยกอยู่แล้ว
    // 'วันที่สร้าง' ไม่ใช่ 'วันที่รับงาน' (user เคาะ 2026-08-07) — ร้านคิวงานเปิดบิลตอนลูกค้ามาถึง
    ['SERVICE_QUEUE', 'การเข้ารับบริการ', 'บริการ', 'สร้างการเข้ารับบริการ', 'เข้ารับบริการใหม่', 'วันที่สร้าง'],
    ['LODGING', 'บิลเข้าพัก', 'บิลเข้าพัก', 'เปิดบิลเข้าพัก', 'เปิดบิลเข้าพัก', 'วันที่เปิดบิล'],
  ])('%s', (vertical, noun, nounShort, createLabel, createLabelShort, dateLabel) => {
    expect(resolveOrderVocab(vertical)).toEqual({ noun, nounShort, createLabel, createLabelShort, dateLabel })
  })

  it('vertical ที่ไม่รู้จัก → ชุดของ ONLINE_SALES (fail-safe)', () => {
    expect(resolveOrderVocab('SOMETHING_NEW')).toEqual(ORDER_VOCAB.ONLINE_SALES)
  })

  it('resolveOrderMenuLabel = noun ของชุดเดียวกัน (ห้ามแยกคลังคำ)', () => {
    for (const v of ['ONLINE_SALES', 'SERVICE_QUEUE', 'LODGING', 'ค่าเพี้ยน']) {
      expect(resolveOrderMenuLabel(v)).toBe(resolveOrderVocab(v).noun)
    }
  })

  it('nounShort ต้องไม่ยาวกว่า noun — ช่องแคบ (แท็บล่าง 320px) พึ่งค่านี้', () => {
    for (const v of Object.keys(ORDER_VOCAB)) {
      const { noun, nounShort } = ORDER_VOCAB[v]
      expect(nounShort.length).toBeLessThanOrEqual(noun.length)
    }
  })
})

describe('resolveProductVocab — คลังคำฝั่งสินค้า (2026-08-07)', () => {
  it.each([
    ['ONLINE_SALES', 'สินค้าขายดี', 'ดูสินค้าทั้งหมด', 'สั่งซื้อแล้ว 12 ชิ้น'],
    // ร้านคิวงานขายบริการ นับเป็น "ครั้ง" ไม่ใช่ "ชิ้น" — และ "ขายดี" ฟังเป็นของที่ขายเป็นชิ้น
    ['SERVICE_QUEUE', 'บริการยอดนิยม', 'ดูบริการทั้งหมด', 'ใช้บริการแล้ว 12 ครั้ง'],
    ['LODGING', 'ห้องพักยอดนิยม', 'ดูห้องพักทั้งหมด', 'เข้าพักแล้ว 12 ครั้ง'],
  ])('%s', (vertical, bestSellerTitle, viewAllLabel, soldLine) => {
    const v = resolveProductVocab(vertical)
    expect(v.bestSellerTitle).toBe(bestSellerTitle)
    expect(v.viewAllLabel).toBe(viewAllLabel)
    expect(v.soldLine('12')).toBe(soldLine)
  })

  it('vertical ที่ไม่รู้จัก → ชุดของ ONLINE_SALES (fail-safe เดียวกับ resolveOrderVocab)', () => {
    expect(resolveProductVocab('SOMETHING_NEW')).toBe(PRODUCT_VOCAB.ONLINE_SALES)
  })

  it('ทุก vertical ที่ ORDER_VOCAB รู้จัก ต้องมีใน PRODUCT_VOCAB ด้วย — ไม่งั้นร้านนั้นตกไปใช้คำของร้านขายของเงียบ ๆ', () => {
    expect(Object.keys(PRODUCT_VOCAB).sort()).toEqual(Object.keys(ORDER_VOCAB).sort())
  })

  it('soldLine ต้องเอาตัวเลขที่ส่งเข้าไปมาใช้จริง — ประโยคที่ลืมแทรกตัวเลขจะดูปกติจนกว่าจะเปิดร้านนั้นดู', () => {
    for (const v of Object.keys(PRODUCT_VOCAB)) {
      expect(PRODUCT_VOCAB[v].soldLine('999')).toContain('999')
    }
  })
})

describe('resolveVisibleSellerMenu — ตัวกรองยังทำงานหลังจัดกลุ่มใหม่', () => {
  it('ONLINE_SALES เห็นสินค้า/สต็อก/ประมูล ไม่เห็นคิวงาน/ห้องพัก', () => {
    const visible = slugsOf(flattenSellerMenu(resolveVisibleSellerMenu(sellerMenuItems, ctx('ONLINE_SALES'))))
    expect(visible).toEqual(expect.arrayContaining(['seller:products', 'seller:inventory', 'seller:auctions']))
    expect(visible).not.toContain('seller:queues')
    expect(visible).not.toContain('seller:rooms')
  })

  it('SERVICE_QUEUE เห็นสินค้า/คิวงาน ไม่เห็นสต็อก/ประมูล/ห้องพัก', () => {
    const visible = slugsOf(flattenSellerMenu(resolveVisibleSellerMenu(sellerMenuItems, ctx('SERVICE_QUEUE'))))
    expect(visible).toEqual(expect.arrayContaining(['seller:products', 'seller:queues']))
    expect(visible).not.toContain('seller:inventory')
    expect(visible).not.toContain('seller:auctions')
    expect(visible).not.toContain('seller:rooms')
  })

  it('LODGING เห็นห้องพัก/ปฏิทิน/การจอง/แม่บ้าน ไม่เห็นสินค้า/สต็อก/ประมูล/คิวงาน', () => {
    const visible = slugsOf(flattenSellerMenu(resolveVisibleSellerMenu(sellerMenuItems, ctx('LODGING'))))
    expect(visible).toEqual(
      expect.arrayContaining(['seller:rooms', 'seller:calendar', 'seller:bookings', 'seller:housekeepers']),
    )
    for (const hidden of ['seller:products', 'seller:inventory', 'seller:auctions', 'seller:queues']) {
      expect(visible).not.toContain(hidden)
    }
  })

  it('ป้าย /orders ผันตาม vertical ผ่าน resolveVisibleSellerMenu ด้วย (ไม่ใช่แค่ตอนเรียก applyOrderLabel ตรง)', () => {
    const orders = flattenSellerMenu(resolveVisibleSellerMenu(sellerMenuItems, ctx('LODGING'))).find(
      (i) => i.slug === 'seller:orders',
    )
    expect(orders?.label).toBe('บิลเข้าพัก')
  })

  it('ร้านส่วนตัว/ผู้ถูกเชิญไม่เห็นเมนูพนักงาน', () => {
    const personal = slugsOf(
      flattenSellerMenu(
        resolveVisibleSellerMenu(sellerMenuItems, {
          ...ctx('ONLINE_SALES'),
          staff: { kind: 'PERSONAL', role: 'OWNER' },
        }),
      ),
    )
    expect(personal).not.toContain('seller:admins')
  })
})
