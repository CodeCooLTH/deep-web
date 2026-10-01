/**
 * [blocker] แอป Android ต้องไม่มีการจ่ายเงินให้ Deep เลยสักทาง (user สั่ง 2026-10-01)
 *
 * ต่างจาก iOS ตรงที่ iOS ห้ามจ่ายนอกสโตร์ **แต่ซื้อผ่าน Apple ได้** (ทางเข้าพอดี 1 ทาง)
 * ส่วน Android ไม่ทำ Play Billing ⇒ ห้ามมีทั้งช่องทางจ่ายและทางเข้าหน้าซื้อ
 *
 * กฎของ Google: "apps may not lead users to a payment method other than Google Play's billing
 * system … via in-app webviews, buttons, links, messaging" — ใช้ของที่ซื้อจากเว็บแล้วยังได้
 *
 * 🛑 แดง = มีทางให้ผู้ขาย Android ไปจ่ายเงินหรือไปหน้าซื้อที่ตาย ⇒ Google ตีกลับ / ผู้ใช้ค้าง
 * อ่าน skill `app-store-surfaces` ก่อนแก้ — เมนูมีสองชุด และมือถือคือแอป
 */

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { hasInAppPurchase, isPaidFeatureRestricted, isPaymentRestricted, resolveAppShell } from '@/lib/app-shell'
import { resolveAppPurchaseView } from '@/lib/iap-purchase-view'
import { applyPaymentRestriction } from '@/lib/seller-menu'

const read = (rel: string) =>
  readFileSync(join(process.cwd(), rel), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1')

const ANDROID_UA =
  'Mozilla/5.0 (Linux; Android 14; Pixel 8 Build/AP1A; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/128.0 Mobile Safari/537.36 DeepSellerApp/1.0'

describe('[blocker] เปลือก Android ถูกตรวจออกและถูกจำกัด', () => {
  it('UA ของแอปผู้ขายบน Android → shell android', () => {
    expect(resolveAppShell(undefined, ANDROID_UA)).toBe('android')
  })
  it('ห้ามจ่ายเงิน · ไม่มี IAP · ของที่ซื้อจากเว็บยังใช้ได้', () => {
    expect(isPaymentRestricted('android')).toBe(true)
    expect(hasInAppPurchase('android')).toBe(false)
    expect(isPaidFeatureRestricted('android')).toBe(false)
  })
})

describe('[blocker] ไม่มีทางเข้าหน้าซื้อบน Android', () => {
  it('หน้าแพ็กเกจ (purchase view) บน Android = ของเว็บ ไม่ใช่ทาง StoreKit', () => {
    expect(resolveAppPurchaseView({ shell: 'android', subscription: null, products: null })).toEqual({ kind: 'web' })
  })

  it('เมนู sidebar: "แพ็กเกจของฉัน" หายเมื่อไม่มี IAP', () => {
    const menu = [
      { label: 'g', children: [{ url: '/subscriptions', slug: 'seller:subscriptions', label: 'แพ็กเกจของฉัน' }] },
    ] as unknown as Parameters<typeof applyPaymentRestriction>[0]
    const got = applyPaymentRestriction(menu, {
      hidePayments: true,
      entitlementStatus: 'NOT_SUBSCRIBED',
      hidePaidFeatures: false,
      offerIap: false,
    })
    expect(got.flatMap((g) => (g.children ?? []).map((c) => c.slug))).not.toContain('seller:subscriptions')
  })

  it('เมนูมือถือ (การ์ด "จัดการร้าน") กรอง /subscriptions เมื่อไม่มี IAP', () => {
    const code = read('src/app/(paces)/seller/(dashboard)/shop/components/ShopQuickLinks.tsx')
    expect(code).toMatch(/IAP_LINK_URLS\s*=\s*new Set<string>\(\[\s*'\/subscriptions'\s*\]\)/)
    expect(code).toMatch(/offerIap \|\| !IAP_LINK_URLS\.has\(l\.url\)/)
    expect(read('src/app/(paces)/seller/(dashboard)/shop/page.tsx')).toMatch(/offerIap=\{await shouldOfferIap\(\)\}/)
  })

  it('หน้าซื้อผ่าน IAP เด้ง Android ออก · /business และ /subscriptions ไม่พากลับไปหน้าซื้อ', () => {
    const D = 'src/app/(paces)/seller/(dashboard)'
    expect(read(`${D}/business/subscribe/page.tsx`)).toMatch(/if \(!\(await shouldOfferIap\(\)\)\) redirect\('\/dashboard'\)/)
    for (const f of ['business/page.tsx', 'subscriptions/page.tsx']) {
      expect(read(`${D}/${f}`), f).toMatch(
        /shouldHidePayments\(\)\) redirect\(\(await shouldOfferIap\(\)\) \? '\/business\/subscribe' : '\/dashboard'\)/,
      )
    }
  })

  it('ทุกผู้สร้างเมนู/ทางลัดต้องส่ง offerIap จริง (ลืม = ทางลัด "แพ็กเกจ" กลับมา)', () => {
    const callers = [
      'src/app/(paces)/seller/(dashboard)/layout.tsx',
      'src/app/(paces)/seller/(chat)/layout.tsx',
      'src/app/(paces)/seller/(dashboard)/dashboard/page.tsx',
      'src/app/api/shops/current/shortcuts/route.ts',
      'src/app/api/shops/current/shortcuts/reset/route.ts',
      'src/app/api/shops/current/shortcuts/[slug]/pin/route.ts',
      'src/app/api/shops/current/shortcuts/[slug]/unpin/route.ts',
    ]
    for (const f of callers) expect(read(f), f).toMatch(/offerIap: await shouldOfferIap\(\)/)
  })

  it('ตัวกู้คืนการซื้อของ Apple แขวนเฉพาะเปลือกที่มี IAP', () => {
    expect(read('src/app/(paces)/seller/(dashboard)/layout.tsx')).toMatch(
      /\(await shouldOfferIap\(\)\) && <IapRecoveryListener \/>/,
    )
  })
})

describe('[blocker] API ที่ตัดเงินปฏิเสธคำขอจากในแอป (ซ่อนปุ่ม ≠ ควบคุมสิทธิ์)', () => {
  const CHARGING_ROUTES = [
    'src/app/api/wallet/topup/route.ts',
    'src/app/api/business/subscribe/route.ts',
    'src/app/api/business/upgrade/route.ts',
    'src/app/api/business/reactivate/route.ts',
    'src/app/api/inventory/subscribe/route.ts',
    'src/app/api/inventory/upgrade/route.ts',
    'src/app/api/inventory/reactivate/route.ts',
    'src/app/api/seller/inspection/subscribe/route.ts',
    'src/app/api/seller/inspection/upgrade/route.ts',
    'src/app/api/seller/pin-slots/buy/route.ts',
  ]
  for (const f of CHARGING_ROUTES) {
    it(f, () => {
      const code = read(f)
      const post = code.indexOf('export async function POST')
      const guard = code.indexOf('await rejectInAppPurchase()')
      expect(guard, 'ต้องมีด่าน').toBeGreaterThan(post)
      /* ด่านต้องมาก่อนงานอื่นทั้งหมดในฟังก์ชัน — อยู่หลังการตัดเงิน = ไม่มีผล */
      const firstAwaitAfterPost = code.indexOf('await ', post)
      expect(guard, 'ด่านต้องเป็น await แรกของ POST').toBe(firstAwaitAfterPost)
      /* เรียกแล้วต้องคืนผลออกไปจริง — เรียกเฉย ๆ แล้วทิ้งค่า = ด่านที่ไม่กันอะไร */
      expect(code.slice(post), 'ต้อง return ผลของด่าน').toMatch(
        /const (\w+) = await rejectInAppPurchase\(\)\s*\n\s*if \(\1\) return \1\b/,
      )
    })
  }

  it('🛑 ห้ามกันทางซื้อที่ถูกกฎของ iOS (`/api/iap/apple/verify`)', () => {
    expect(read('src/app/api/iap/apple/verify/route.ts')).not.toMatch(/rejectInAppPurchase/)
  })
})

describe('[blocker] ไม่มีคำชวนไปจ่ายที่เว็บ (anti-steering)', () => {
  it('หน้าแผนตรวจไม่มี "จัดการ/สมัคร ... จากเว็บไซต์ Deep" ในโค้ดที่แสดงผล', () => {
    for (const f of ['StepLadder.tsx', 'PlanStatusCard.tsx']) {
      expect(read(`src/app/(paces)/seller/(dashboard)/inspection/components/${f}`), f).not.toMatch(/จากเว็บไซต์ Deep/)
    }
  })

  it('ปุ่มปักหมุด: ในแอปไม่เปิดหน้าต่าง "ซื้อสล็อต ฿99"', () => {
    const code = read('src/app/(paces)/seller/(dashboard)/products/components/PinToggleButton.tsx')
    const open = code.indexOf('const openBuySlotDialog')
    const gate = code.indexOf('if (hidePayments)', open)
    expect(gate).toBeGreaterThan(open)
    expect(gate, 'ด่านต้องมาก่อน Swal').toBeLessThan(code.indexOf('Swal.fire(', open))
  })
})
