/**
 * เทสของ seller-menu — เน้นสองเรื่องที่ "พังแบบเงียบ" ไม่มีอะไรฟ้อง
 *
 * 1. slug ของรายการ: `SellerShortcutPreference.slugs` เก็บ slug พวกนี้ไว้ในฐานข้อมูล (feature 00027) เปลี่ยนชื่อ
 *    slug เมื่อไร เมนูลัดที่ผู้ใช้ปักไว้จะกลายเป็น unavailable ทั้งหมดโดยไม่มี error ที่ไหนเลย
 *    เทสนี้ตรึงชุด slug ไว้ — ย้ายกลุ่ม/เปลี่ยนป้ายทำได้ตามใจ แต่ slug ต้องคงเดิม
 * 2. ตัวกรองตาม vertical: จัดกลุ่มเมนูใหม่ (2026-08-04) ย้าย 9 รายการข้ามกลุ่ม ถ้าตัวกรองอ่าน
 *    โครงกลุ่มผิดไป ร้านบ้านพักจะเห็นเมนูสต็อก/ประมูลของร้านขายออนไลน์โดยไม่มีใครสังเกต
 */
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

import {
  applyFinanceMenu,
  applyOrderLabel,
  FINANCE_MENU_LABEL,
  FINANCE_EXPENSE_TAB_URL,
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
    ownsShop: true,
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
        // เพิ่ม 2026-09-29 — เมนู "ติดตามลูกค้า" (feature 00066) slug ใหม่ล้วน
        'seller:follow-ups',
        'seller:housekeepers',
        'seller:inbox',
        // เพิ่ม 2026-10-05 — เมนู "รายงานเข้ากลุ่ม LINE" (feature 00070) slug ใหม่ล้วน = เพิ่มอย่างปลอดภัย
        'seller:line-reports',
        // เพิ่ม 2026-09-05 — เมนู "แผนการตรวจสอบ" (feature 00060) เห็นเฉพาะ LODGING
        'seller:inspection',
        'seller:inventory',
        'seller:orders',
        'seller:products',
        'seller:public-profile',
        // เพิ่ม 2026-08-26 — เมนู "ผลงานแอดมิน" (feature 00059)
        // slug ใหม่ล้วน ไม่มีแถว SellerShortcutPreference เดิมอ้างถึงได้ = การเพิ่มที่ปลอดภัย
        'seller:reports-agents',
        // เพิ่ม 2026-08-29 — เมนู "ยอดขายรายสินค้า" (feature 00063)
        // slug ใหม่ล้วน ไม่มีแถว SellerShortcutPreference เดิมอ้างถึงได้ = การเพิ่มที่ปลอดภัย
        'seller:reports-products',
        'seller:queues',
        'seller:reviews',
        'seller:rooms',
        'seller:sales',
        'seller:settings',
        'seller:settings-auto-reply',
        'seller:settings-channels',
        // เพิ่ม 2026-08-12 — เมนู "ประเภทงาน" (ย้ายออกจาก /queues)
        // slug ใหม่ล้วน ไม่มีแถว SellerShortcutPreference เดิมอ้างถึงได้ จึงเป็นการเพิ่มที่ปลอดภัย
        // 🛑 การ "แก้เทสให้ผ่าน" ที่ปลอดภัยคือการ *เพิ่ม* เท่านั้น — ถ้าวันไหนต้อง **ลบ/เปลี่ยนชื่อ**
        // slug ที่เคยมี ห้ามแก้บรรทัดในเทสนี้เฉย ๆ ต้องมี migration ล้าง slug นั้นออกจาก
        // SellerShortcutPreference.slugs ก่อน ไม่งั้นทางลัดของร้านจะชี้ไปเมนูที่ไม่มีอยู่จริง
        'seller:settings-job-types',
        'seller:settings-chatbot',
        'seller:settings-order-agent',
        // เมนู "ตอบกลับคอมเมนต์" (feature 00038) — เพิ่มใน seller-menu.ts แล้วแต่ลืมเติมที่นี่
        // เทสข้อนี้จึงแดงอยู่บน main (พบตอน merge 2026-08-09) ไม่ใช่ของใหม่ที่เพิ่งพัง
        'seller:settings-comment-reply',
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
    ['SERVICE_QUEUE', 'งานบริการ'],
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

describe('resolveOrderVocab — คลังคำ 11 ช่อง (00030 + dateLabel/00033 + fulfillLabel/00036 + itemsLabel,buyerConfirmLabel/00041 + viewLabel,stageOrderedLabel/2026-08-12 + costNoun/00067)', () => {
  it.each([
    // fulfillLabel = ขั้น "ร้านลงมือทำตามที่รับงานมาแล้ว" ในเช็กลิสต์สถานะของตารางรายการ
    // SERVICE_QUEUE ต้องไม่ใช่ 'ให้บริการแล้ว' เปล่า ๆ — ชนกับ APPOINTMENT_STATUS_LABEL.COMPLETED
    // ซึ่งผูกกับคอลัมน์คนละตัว (appointmentStatus) และติ๊กถูกคนละจังหวะกัน
    ['ONLINE_SALES', 'คำสั่งซื้อ', 'คำสั่งซื้อ', 'สร้างคำสั่งซื้อ', 'สร้างคำสั่งซื้อ', 'วันที่สั่งซื้อ', 'ยืนยันการจัดส่ง', 'รายการสินค้า', 'ยืนยันรับสินค้า', 'ดูคำสั่งซื้อ', 'สั่งซื้อแล้ว', 'ต้นทุนสินค้า'],
    // nounShort ย่อจาก 'เข้ารับบริการ' → 'บริการ' (user เคาะ 2026-08-05) — หัวหน้าต่างโมดัลในแชท
    // และแท็บล่างมือถือประกอบคำจากช่องนี้ ("บริการใหม่" แทน "การเข้ารับบริการใหม่")
    // dateLabel ไม่ใช่ "วันที่" + noun — LODGING/SERVICE_QUEUE มีคอลัมน์วันใช้บริการแยกอยู่แล้ว
    // 'วันที่สร้าง' ไม่ใช่ 'วันที่รับงาน' (user เคาะ 2026-08-07) — ร้านคิวงานเปิดบิลตอนลูกค้ามาถึง
    // createLabelShort 'เข้ารับบริการใหม่' → 'งานใหม่' (user สั่ง 2026-08-07) — ปุ่มท้ายแถบเครื่องมือ
    // แชทถูกตัดหายครึ่งคำบนจอ 390px จริง
    // noun 'การเข้ารับบริการ' → 'งานบริการ' (user เคาะ 2026-10-10)
    ['SERVICE_QUEUE', 'งานบริการ', 'บริการ', 'สร้างงานบริการ', 'งานใหม่', 'วันที่สร้าง', 'เริ่มให้บริการแล้ว', 'รายการบริการ', 'ยืนยันรับบริการ', 'ดูรายละเอียดบริการ', 'รับงานแล้ว', 'ต้นทุนอะไหล่'],
    ['LODGING', 'บิลเข้าพัก', 'บิลเข้าพัก', 'เปิดบิลเข้าพัก', 'เปิดบิลเข้าพัก', 'วันที่เปิดบิล', 'รับเข้าพักแล้ว', 'รายการห้องพัก', 'ยืนยันเข้าพักแล้ว', 'ดูบิลเข้าพัก', 'เปิดบิลแล้ว', 'ต้นทุนต่อห้อง'],
  ])('%s', (vertical, noun, nounShort, createLabel, createLabelShort, dateLabel, fulfillLabel, itemsLabel, buyerConfirmLabel, viewLabel, stageOrderedLabel, costNoun) => {
    expect(resolveOrderVocab(vertical)).toMatchObject({
      noun,
      nounShort,
      createLabel,
      createLabelShort,
      dateLabel,
      fulfillLabel,
      itemsLabel,
      buyerConfirmLabel,
      viewLabel,
      stageOrderedLabel,
      costNoun,
    })
  })

  // ช่องที่เพิ่ม 2026-10-10 (clarify ร้านบริการ) — ONLINE_SALES ต้องเป็นคำเดิมของหน้าจอทุกตัวอักษร
  it.each([
    ['ONLINE_SALES', 'ผู้ซื้อ', 'กำลังจัดส่ง', 'ผู้ซื้อยืนยันรับของ', 'ยอดสินค้า', 'ตะกร้า', 'เพิ่มลงตะกร้า'],
    ['SERVICE_QUEUE', 'ลูกค้า', 'เริ่มให้บริการแล้ว', 'ลูกค้ายืนยันรับบริการแล้ว', 'ยอดค่าบริการ', 'รายการที่เลือก', 'เพิ่มรายการ'],
  ])('ช่องใหม่ %s', (vertical, buyerNoun, shippedStatusLabel, buyerConfirmedStepLabel, subtotalLabel, cartTitle, addToCartLabel) => {
    expect(resolveOrderVocab(vertical)).toMatchObject({ buyerNoun, shippedStatusLabel, buyerConfirmedStepLabel, subtotalLabel, cartTitle, addToCartLabel })
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

  /**
   * feature 00067 TC-026 — ทุก vertical ต้องมีคำเรียกต้นทุนของตัวเอง
   *
   * 🛑 vertical ที่สี่ที่เพิ่มเข้ามาแล้วลืมเติมช่องนี้ จะได้ `undefined` ไหลเข้าสูตรกำไร
   * แล้วผู้ขายอ่านว่า "กำไรสุทธิ = ยอดขายที่ยืนยันแล้ว − undefined − ค่าใช้จ่าย" บนหน้าจอจริง
   * โดยที่ tsc ไม่ฟ้อง (Record<string, OrderVocab> ไม่บังคับคีย์) — เทสนี้คือด่านเดียว
   */
  it('[blocker] ทุก vertical ต้องมี costNoun ที่ไม่ว่าง', () => {
    const keys = Object.keys(ORDER_VOCAB)
    expect(keys.length).toBeGreaterThan(0)
    for (const v of keys) {
      const costNoun = ORDER_VOCAB[v].costNoun
      expect(typeof costNoun).toBe('string')
      expect(costNoun.trim().length).toBeGreaterThan(0)
    }
  })

  it('[blocker] costNoun ต้องต่างกันจริงต่อ vertical — ไม่ใช่ก็อปคำของร้านขายของไปทุกช่อง', () => {
    // ถ้าวันหนึ่งมีคนเติม vertical ใหม่ด้วยการก็อปบล็อกเดิม ค่านี้จะซ้ำโดยไม่มีใครสังเกต
    // แล้วเหตุผลทั้งหมดที่ช่องนี้ถูกสร้างขึ้นมาก็หายไปเงียบ ๆ
    const values = Object.keys(ORDER_VOCAB).map((v) => ORDER_VOCAB[v].costNoun)
    expect(new Set(values).size).toBe(values.length)
  })

  it('[blocker] costNoun ห้ามผันจาก noun ด้วยการต่อสตริง', () => {
    // "ต้นทุน" + noun ได้ "ต้นทุนการเข้ารับบริการ" ซึ่งอ่านว่าเป็นเงินที่ลูกค้าจ่าย ไม่ใช่ของร้าน
    for (const v of Object.keys(ORDER_VOCAB)) {
      const { noun, costNoun } = ORDER_VOCAB[v]
      expect(costNoun).not.toBe(`ต้นทุน${noun}`)
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
    // 🛑 00060 เปิดเฉพาะ LODGING ในรอบแรก — ร้านประเภทอื่นต้องไม่เห็นเมนูที่กดเข้าไปแล้วเจอ 403
    expect(visible).not.toContain('seller:inspection')
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
      expect.arrayContaining([
        'seller:rooms',
        'seller:calendar',
        'seller:bookings',
        'seller:housekeepers',
        'seller:inspection',
      ]),
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

/**
 * feature 00067 TC-005 — เมนูเรื่องเงินของร้านบริการเหลือรายการเดียว
 */
describe('applyFinanceMenu — ยุบเมนูเรื่องเงินสำหรับร้านบริการ (00067)', () => {
  const menu = () => [
    {
      key: 'analytics',
      label: 'รายงาน',
      isTitle: false,
      children: [
        { key: 'sales', slug: 'seller:sales', label: 'ภาพรวมกำไร/ขาดทุน', url: '/sales' },
        { key: 'agents', slug: 'seller:reports-agents', label: 'ผลงานทีม', url: '/reports/agents' },
      ],
    },
    {
      key: 'money',
      label: 'การเงิน',
      isTitle: false,
      children: [
        { key: 'wallet', slug: 'seller:wallet', label: 'กระเป๋าเงิน', url: '/wallet' },
        { key: 'expenses', slug: 'seller:expenses', label: 'ค่าใช้จ่าย', url: '/expenses' },
      ],
    },
  ] as unknown as Parameters<typeof applyFinanceMenu>[0]

  const slugs = (items: ReturnType<typeof applyFinanceMenu>) =>
    items.flatMap((g) => (g.children ?? []).map((c) => c.slug))

  const labelOf = (items: ReturnType<typeof applyFinanceMenu>, slug: string) =>
    items.flatMap((g) => g.children ?? []).find((c) => c.slug === slug)?.label

  const urlOf = (items: ReturnType<typeof applyFinanceMenu>, slug: string) =>
    items.flatMap((g) => g.children ?? []).find((c) => c.slug === slug)?.url

  it('[blocker] SERVICE_QUEUE — เปลี่ยนป้าย seller:sales และชี้ seller:expenses ไปที่แท็บ', () => {
    const out = applyFinanceMenu(menu(), 'SERVICE_QUEUE')
    expect(labelOf(out, 'seller:sales')).toBe(FINANCE_MENU_LABEL)
    expect(urlOf(out, 'seller:expenses')).toBe(FINANCE_EXPENSE_TAB_URL)
  })

  it('[blocker] ห้ามถอด seller:expenses ออกจากเมนู — เมนูลัดของผู้ใช้จะกลายเป็น "ไม่พร้อมใช้งาน"', () => {
    /**
     * `buildEligibleCatalog()` ของเมนูลัดสร้าง catalog จากเมนูชุดนี้ — slug ที่ถูกถอด
     * จะตกไปกอง `unavailable` ของ `buildState()` แล้วโผล่ในชีตแก้ไขว่า "ไม่พร้อมใช้งาน"
     * ทั้งที่ของยังใช้ได้ปกติ (ข้อมูลจริงบน prod 2026-09-30: 2 ใน 3 คนของร้านอ้างอิงปักไว้)
     * user เจอเองบนเครื่องจริง — ด่านนี้กันไม่ให้ถอดซ้ำ
     */
    const out = applyFinanceMenu(menu(), 'SERVICE_QUEUE')
    expect(slugs(out)).toContain('seller:expenses')
    expect(labelOf(out, 'seller:expenses')).toBe('ค่าใช้จ่าย')
  })

  it('[blocker] ONLINE_SALES / LODGING — ต้องไม่ถูกแตะเลยสักรายการ', () => {
    for (const vertical of ['ONLINE_SALES', 'LODGING']) {
      const out = applyFinanceMenu(menu(), vertical)
      expect(slugs(out)).toContain('seller:expenses')
      expect(urlOf(out, 'seller:expenses')).toBe('/expenses')
      expect(labelOf(out, 'seller:sales')).toBe('ภาพรวมกำไร/ขาดทุน')
    }
  })

  it('vertical ที่ไม่รู้จัก → ไม่แตะอะไร (เมนูครบดีกว่าเมนูเพี้ยนโดยไม่มีคนสั่ง)', () => {
    const out = applyFinanceMenu(menu(), 'SOMETHING_NEW')
    expect(slugs(out)).toContain('seller:expenses')
    expect(urlOf(out, 'seller:expenses')).toBe('/expenses')
  })

  it('ไม่แตะรายการอื่นในกลุ่มเดียวกัน', () => {
    const out = applyFinanceMenu(menu(), 'SERVICE_QUEUE')
    expect(slugs(out)).toContain('seller:wallet')
    expect(slugs(out)).toContain('seller:reports-agents')
  })
})

describe('applyLineReportMenu — เมนูรายงานเข้ากลุ่ม LINE (00070 TFR-LGS-03)', () => {
  const has = (items: ReturnType<typeof resolveVisibleSellerMenu>) => slugsOf(flattenSellerMenu(items)).includes('seller:line-reports')

  it('OWNER เห็นทุก vertical · url/กลุ่ม/ไอคอนตามสเปก', () => {
    for (const v of ['ONLINE_SALES', 'SERVICE_QUEUE', 'LODGING']) {
      expect(has(resolveVisibleSellerMenu(sellerMenuItems, ctx(v))), v).toBe(true)
    }
    const shops = sellerMenuItems.find((g) => g.slug === 'seller-shops')!
    expect(shops.children?.find((c) => c.slug === 'seller:line-reports')).toMatchObject({
      url: '/business/line-reports',
      icon: 'brand-line',
    })
  })

  it('เจ้าของร่วม (role OWNER แต่ไม่ใช่ Shop.userId ของร้านใดเลย) ไม่เห็น — EXT 00012 BR-MR-08', () => {
    expect(has(resolveVisibleSellerMenu(sellerMenuItems, { ...ctx('ONLINE_SALES'), ownsShop: false }))).toBe(false)
  })

  it('ADMIN ที่ไม่ได้เป็นเจ้าของหลักของร้านใด ไม่เห็น', () => {
    expect(has(resolveVisibleSellerMenu(sellerMenuItems, { ...ctx('ONLINE_SALES'), staff: { kind: 'BUSINESS', role: 'ADMIN' }, ownsShop: false }))).toBe(false)
  })

  it('ADMIN ของร้านนี้ แต่เป็นเจ้าของหลักของร้านอื่น เห็น (ฟีเจอร์ระดับบัญชี ไม่ผูกกับร้านที่เปิดอยู่)', () => {
    expect(has(resolveVisibleSellerMenu(sellerMenuItems, { ...ctx('ONLINE_SALES'), staff: { kind: 'BUSINESS', role: 'ADMIN' }, ownsShop: true }))).toBe(true)
  })

  it('ไม่ถูกซ่อนเพราะข้อจำกัดของแอป (hidePayments/hidePaidFeatures ทุกเปลือก)', () => {
    for (const offerIap of [true, false]) {
      expect(has(resolveVisibleSellerMenu(sellerMenuItems, { ...ctx('ONLINE_SALES'), hidePayments: true, hidePaidFeatures: true, offerIap }))).toBe(true)
    }
  })

  it('shortcut.service.buildEligibleCatalog ใช้ pipeline เดียวกัน (ส่ง ownsShop จาก ownsAnyShop + ข้อจำกัดเปลือกเข้า resolveVisibleSellerMenu) · ไม่กรองเมนูนี้เอง', () => {
    const src = readFileSync('src/services/shortcut.service.ts', 'utf8')
    expect(src).toMatch(/resolveVisibleSellerMenu\(sellerMenuItems/)
    expect(src).toMatch(/staff:\s*\{\s*kind: active\.kind, role: active\.role\s*\}/)
    expect(src).not.toContain('line-reports')
    expect(src).toMatch(/ownsShop = await ownsAnyShop\(userId\)/)
    expect(src).toMatch(/^\s+ownsShop,$/m)
  })

  it('seller-menu-server ใช้ ownsAnyShop เป็น predicate เดียวกัน + fail-closed (query ล้ม = ซ่อน)', () => {
    const src = readFileSync('src/lib/seller-menu-server.ts', 'utf8')
    expect(src).toMatch(/let ownsShop = false/)
    expect(src).toMatch(/ownsAnyShop\(userId\)/)
    expect(src).toMatch(/^\s+ownsShop,$/m)
  })
})
