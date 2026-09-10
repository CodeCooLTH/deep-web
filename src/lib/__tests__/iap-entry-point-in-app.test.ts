/**
 * [blocker] ในแอป iOS ต้องมี **ทางเข้าหน้าซื้อผ่าน Apple พอดี 1 ทาง** (feature 00064)
 *
 * ## ทำไมกฎเปลี่ยน
 *
 * `no-payment-entry-in-app.test.ts` ตั้งกฎไว้ว่า "ห้ามมีทางไปจ่ายเงินในแอปเลย" ซึ่งถูกต้อง
 * **ในตอนที่ยังไม่มีทางจ่ายที่ถูกกฎ** — ทุกทางพาไปหน้าที่หักกระเป๋าเงิน ซึ่งผิด 3.1.1
 *
 * ตอนนี้มี `/business/subscribe` ที่ซื้อผ่าน Apple แล้ว ⇒ กฎต้องมีข้อยกเว้น **แคบ ๆ**
 * เพราะ 3.1.1 ห้าม *ช่องทางจ่ายเงินที่ไม่ผ่าน Apple* ไม่ได้ห้ามพูดถึงแพ็กเกจ
 *
 * ## 🛑 ไม่มีทางเข้า = ทดสอบไม่ได้ และผู้ใช้ซื้อไม่ได้
 *
 * แอปเป็น WebView พิมพ์ URL เองไม่ได้ ⇒ ถ้าเมนูถูกซ่อน หน้าซื้อจะไม่มีใครไปถึงได้เลย
 * แม้แต่ทีมรีวิวของ Apple — ซึ่งแปลว่าเขาจะสรุปว่าเรายังไม่ได้ทำ IAP แล้วตีกลับข้อเดิม
 *
 * ## 🛑 ข้อยกเว้นนี้ครอบแค่เมนูเดียว
 *
 * ทางที่ **ไม่** ผ่าน Apple ยังต้องปิดหมด — Deep Stock (เราเลือกไม่ขายเป็น IAP),
 * ปุ่มเติมเงินกระเป๋า, ราคาที่หักกระเป๋าเงิน
 */
import { describe, expect, it } from 'vitest'

import { applyPaymentRestriction } from '@/lib/seller-menu'

/** โครงเมนูย่อ ๆ ที่มีทั้งของที่ต้องเหลือและของที่ต้องหาย */
const menu = [
  {
    isTitle: true,
    label: 'กลุ่ม',
    children: [
      { url: '/subscriptions', slug: 'seller:subscriptions', label: 'แพ็กเกจของฉัน' },
      { url: '/inventory', slug: 'seller:inventory', label: 'จัดการสต็อก' },
      { url: '/orders', slug: 'seller:orders', label: 'คำสั่งซื้อ' },
    ],
  },
] as unknown as Parameters<typeof applyPaymentRestriction>[0]

const slugsOf = (items: ReturnType<typeof applyPaymentRestriction>) =>
  items.flatMap((g) => (g.children ?? []).map((c) => c.slug))

describe('[blocker] ทางเข้าหน้าซื้อในแอป', () => {
  it('🛑 ในแอปต้อง **ยังมี** เมนูแพ็กเกจ — ไม่มี = ไม่มีใครไปถึงหน้าซื้อได้เลย', () => {
    const got = slugsOf(
      applyPaymentRestriction(menu, {
        hidePayments: true,
        entitlementStatus: 'NOT_SUBSCRIBED',
        hidePaidFeatures: true,
      }),
    )
    expect(got, 'ซ่อนเมนูนี้ = ทีมรีวิวของ Apple จะสรุปว่าเรายังไม่ได้ทำ IAP').toContain(
      'seller:subscriptions',
    )
  })

  it('🛑 แต่ Deep Stock ยังต้องหาย — เราเลือกไม่ขายเป็น IAP (3.1.3(b))', () => {
    const got = slugsOf(
      applyPaymentRestriction(menu, {
        hidePayments: true,
        entitlementStatus: 'ACTIVE',
        hidePaidFeatures: true,
      }),
    )
    expect(got).not.toContain('seller:inventory')
  })

  it('บนเว็บไม่ถูกแตะเลย', () => {
    const got = slugsOf(
      applyPaymentRestriction(menu, {
        hidePayments: false,
        entitlementStatus: 'ACTIVE',
        hidePaidFeatures: false,
      }),
    )
    expect(got).toEqual(['seller:subscriptions', 'seller:inventory', 'seller:orders'])
  })
})

describe('[blocker] ปลายทางของเมนูนั้นต้องเป็นหน้า IAP', () => {
  const read = (rel: string) =>
    require('node:fs')
      .readFileSync(require('node:path').join(process.cwd(), rel), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/(^|[^:])\/\/.*$/gm, '$1')

  it('🛑 `/subscriptions` ในแอปต้องเด้งไปหน้าซื้อผ่าน Apple ไม่ใช่ `/dashboard`', () => {
    const code = read('src/app/(paces)/seller/(dashboard)/subscriptions/page.tsx')
    expect(code, 'ยังต้องมีด่าน app-shell').toMatch(/shouldHidePayments\(\)\)\s*redirect\(/)
    expect(
      code,
      'เด้งไป /dashboard = ผู้ใช้กดเมนูแล้วเด้งกลับหน้าแรกโดยไม่มีคำอธิบาย (บั๊กที่หัวหน้าเจอบน TestFlight 2026-08-19)',
    ).toMatch(/redirect\('\/business\/subscribe'\)/)
  })
})

/**
 * ── มือถือใช้คนละเมนูกับเดสก์ท็อป ────────────────────────────────────────
 *
 * 🛑 **แอป iOS คือมือถือ** ⇒ ไม่มี sidebar · เมนูฝั่งร้านบนมือถือมาจากการ์ด "จัดการร้าน"
 * ใน `/shop` (`ShopQuickLinks.tsx`) ซึ่งเป็น **สำเนาของรายการเมนู** ที่กรองด้วยกฎของตัวเอง
 *
 * ⇒ แก้ `applyPaymentRestriction()` (sidebar) อย่างเดียว **ไม่มีผลกับแอปเลยแม้แต่น้อย**
 * — นี่คือ Hard Rule 16 ตรงตัว (ของสิ่งเดียวกัน สองนิยาม) และเป็นบั๊กคลาสเดียวกับที่
 * ไฟล์นั้นเขียนเตือนไว้เองตอนโดนตีกลับ 2026-08-19 แค่กลับทิศ
 */
describe('[blocker] ทางเข้าบนมือถือ — ที่แอปใช้จริง', () => {
  const read = (rel: string) =>
    require('node:fs')
      .readFileSync(require('node:path').join(process.cwd(), rel), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/(^|[^:])\/\/.*$/gm, '$1')

  const QUICK_LINKS = 'src/app/(paces)/seller/(dashboard)/shop/components/ShopQuickLinks.tsx'

  it('🛑 การ์ด "จัดการร้าน" ต้องมี "แพ็กเกจของฉัน" อยู่', () => {
    expect(read(QUICK_LINKS)).toMatch(/'\/subscriptions'[\s\S]{0,40}แพ็กเกจของฉัน/)
  })

  it('🛑 ห้ามกรอง `/subscriptions` ทิ้งในแอป — ไม่งั้นมือถือไม่มีทางเข้าเลย', () => {
    const code = read(QUICK_LINKS)
    /* ยังต้องมีกลไกกรองไว้สำหรับลิงก์จ่ายเงินที่ **ไม่ผ่าน Apple** ในอนาคต */
    expect(code, 'กลไกกรองต้องยังอยู่').toMatch(/PAYMENT_LINK_URLS/)
    expect(code, 'ต้องยังเอาไปกรองจริง').toMatch(/\.filter\([\s\S]{0,80}?PAYMENT_LINK_URLS/)
    /* แต่ `/subscriptions` ต้องไม่อยู่ในชุดนั้นแล้ว — มันพาไปหน้าซื้อผ่าน Apple */
    expect(
      code,
      'อยู่ในชุดกรอง = เมนูหายบนมือถือ = ทีมรีวิวของ Apple หาหน้าซื้อไม่เจอ',
    ).not.toMatch(/PAYMENT_LINK_URLS\s*=\s*new Set<string>\(\[[^\]]*\/subscriptions/)
  })
})
