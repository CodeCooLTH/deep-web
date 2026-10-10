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
import { readFileSync, readdirSync, statSync } from 'node:fs'
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

/**
 * [blocker] ข้อความ "ให้ไปสมัคร / อัปเกรด / ต่ออายุแพ็กเกจ" — Android ไม่มีหน้าซื้อ ⇒ ข้อความล้วนก็นับเป็น
 * การพาไปจ่ายนอก Play (พบ 2026-10-05: error จัดการทีม · แบนเนอร์ร้านถูกล็อกใน 6 หน้าเต็มจอ)
 */
import { canAskToBuy } from '@/lib/purchase-prompt'
import { memberErrorText } from '@/app/(paces)/seller/(dashboard)/business/[shopId]/invites/components/member-error-text'

const BUY_PROMPT =
  /(สมัคร|อัปเกรด|อัพเกรด|ต่ออายุ|ซื้อ)\s?(แพ็กเกจ|แพคเกจ|แพ็คเกจ)|(อัปเกรด|อัพเกรด|ต่ออายุ)[^'"`\n]{0,20}(แพ็กเกจ|Business|Pro)|อั[ปพ]เกรดเป็น|สมัคร (Business|Pro|Deep Stock)/

describe('[blocker] ชวนซื้อได้เฉพาะเปลือกที่ซื้อได้', () => {
  it('canAskToBuy: เว็บ ได้ · iOS (มี IAP) ได้ · Android ไม่ได้', () => {
    expect(canAskToBuy(false, false)).toBe(true)
    expect(canAskToBuy(true, true)).toBe(true)
    expect(canAskToBuy(true, false)).toBe(false)
  })

  it('error จัดการทีม: Android ไม่มีคำชวนซื้อ แต่ยังบอกทางออก · เว็บ/iOS คงข้อความเดิม', () => {
    for (const code of ['SHOP_LOCKED', 'RECIPIENT_NO_PACKAGE', 'RECIPIENT_BUSINESS_QUOTA', 'RECIPIENT_ADMIN_QUOTA']) {
      const android = memberErrorText(code, 'บี', 'เอ', false)
      expect(android, code).not.toMatch(BUY_PROMPT)
      expect(android, `${code} ต้องบอกทางออก`).toMatch(/ติดต่อ|เลือกโอนให้สมาชิกคนอื่น|ลดจำนวนพนักงาน/)
      expect(memberErrorText(code, 'บี', 'เอ', true), code).toMatch(BUY_PROMPT)
    }
  })

  it('แบนเนอร์ร้านถูกล็อกอ่าน context เอง (prop เป็นแค่ตัวเสริม) · layout ส่ง offerIap', () => {
    expect(read('src/app/(paces)/seller/(dashboard)/business/components/LockedStateBanner.tsx')).toMatch(
      /const hidePayments = useHidePayments\(\) \|\| hidePaymentsProp === true/,
    )
    expect(read('src/app/(paces)/seller/layout.tsx')).toMatch(
      /<PaymentRestrictionProvider hidePayments=\{hidePayments\} offerIap=\{offerIap\}>/,
    )
  })

  it('error ของ API ที่แอปเห็น: ต่ออายุ/อัพเกรดแพ็กเกจ ผ่าน canAskToBuy', () => {
    expect(read('src/lib/auto-reply-route-context.ts')).toMatch(/ctx\.askToBuy \? ' — ต่ออายุแพ็กเกจ/)
    expect(read('src/app/api/shops/ai-settings/route.ts')).toMatch(/canAskToBuy\(await shouldHidePayments\(\), await shouldOfferIap\(\)\)/)
  })
})

describe('[blocker] สแกนทั้งโซนผู้ขาย: ข้อความชวนซื้อต้องอยู่ในไฟล์ที่ผ่านด่านเปลือกแอป', () => {
  /**
   * ด่านระดับไฟล์ — จับ "ไฟล์ใหม่ที่ไม่รู้เรื่องนี้เลย" (เคสที่เกิดจริงทั้งสองครั้ง) ส่วนความถูกของแต่ละกิ่ง
   * คุมด้วยเทสพฤติกรรมด้านบน · สแกนจากซอร์สจริง ไม่ใช่รายชื่อไฟล์
   */
  const GATE = /hidePayments|useHidePayments|shouldHidePayments|canAskToBuy|useCanAskToBuy|askToBuy|offerIap|isPaymentRestricted/
  const ROOTS = ['src/app/(paces)/seller', 'src/components', 'src/app/api/shops', 'src/app/api/business', 'src/lib/auto-reply-route-context.ts']

  function walkAll(rel: string, out: string[] = []): string[] {
    const abs = join(process.cwd(), rel)
    if (!statSync(abs).isDirectory()) {
      if (/\.tsx?$/.test(rel)) out.push(rel)
      return out
    }
    for (const name of readdirSync(abs)) {
      if (name === '__tests__' || /\.test\.tsx?$/.test(name)) continue
      walkAll(`${rel}/${name}`, out)
    }
    return out
  }

  it('ไม่มีไฟล์ที่ชวนสมัคร/อัปเกรด/ต่ออายุโดยไม่ดูเปลือกแอป', () => {
    const offenders: string[] = []
    let scanned = 0
    for (const root of ROOTS) {
      for (const f of walkAll(root)) {
        scanned += 1
        const code = read(f)
        /* ตัดบรรทัด import ก่อนหาด่าน — ลบตัวด่านทิ้งแต่ลืมลบ import ต้องแดง ไม่ใช่เขียวหลอก */
        const body = code.replace(/^import[^\n]*$/gm, '')
        if (BUY_PROMPT.test(code) && !GATE.test(body)) offenders.push(f)
      }
    }
    expect(scanned, 'สแกนไม่เจอไฟล์ = path พัง ไม่ใช่ระบบสะอาด').toBeGreaterThan(300)
    expect(offenders, `ชวนซื้อโดยไม่ผ่านด่าน:\n${offenders.join('\n')}`).toEqual([])
  })
})

/**
 * [blocker] Android ไม่แสดงสถานะเงิน — ยอดเครดิต · ประวัติเติมเงิน · ป้ายแพ็กเกจ/ต่ออายุไม่สำเร็จ
 * (user สั่ง 2026-10-06 · iOS คงแสดงตามมติ 2026-08-10 — ต่ออายุผ่าน Apple ได้)
 */
import { canShowMoneyStatus } from '@/lib/purchase-prompt'

describe('[blocker] Android ไม่แสดงสถานะเงิน', () => {
  it('canShowMoneyStatus: เว็บ ได้ · iOS ได้ · Android ไม่ได้', () => {
    expect(canShowMoneyStatus(false, false)).toBe(true)
    expect(canShowMoneyStatus(true, true)).toBe(true)
    expect(canShowMoneyStatus(true, false)).toBe(false)
  })

  it('เมนู "กระเป๋าเงิน" หายบน Android · iOS ยังอยู่', () => {
    const menu = [
      { label: 'g', children: [{ url: '/wallet', slug: 'seller:wallet', label: 'กระเป๋าเงิน' }] },
    ] as unknown as Parameters<typeof applyPaymentRestriction>[0]
    const slugs = (offerIap: boolean) =>
      applyPaymentRestriction(menu, { hidePayments: true, entitlementStatus: 'ACTIVE', hidePaidFeatures: false, offerIap })
        .flatMap((g) => (g.children ?? []).map((c) => c.slug))
    expect(slugs(false)).not.toContain('seller:wallet')
    expect(slugs(true)).toContain('seller:wallet')
  })

  it('หน้า /wallet เด้ง Android ออก (พิมพ์ URL ตรงได้)', () => {
    expect(read('src/app/(paces)/seller/(dashboard)/wallet/page.tsx')).toMatch(
      /if \(!\(await shouldShowMoneyStatus\(\)\)\) redirect\('\/dashboard'\)/,
    )
  })

  it('หัวหน้าแรก: ยอดเครดิตและชิปแพ็กเกจอยู่หลัง showMoneyStatus', () => {
    const hero = read('src/app/(paces)/seller/(dashboard)/dashboard/components/CompactHero.tsx')
    expect(hero).toMatch(/const showMoneyStatus = await shouldShowMoneyStatus\(\)/)
    const chip = hero.indexOf('{packageChipLabel}')
    expect(hero.lastIndexOf('{showMoneyStatus && (', chip), 'ชิปแพ็กเกจต้องอยู่ในกิ่ง showMoneyStatus').toBeGreaterThan(
      hero.lastIndexOf(')}', chip),
    )
    // 00071: ยอดอยู่ในกิ่ง showWallet ซึ่งต้องมี showMoneyStatus เป็นตัวตั้ง (และ walletBalance != null)
    expect(hero).toMatch(/const walletText = showMoneyStatus && walletBalance != null \?/)
    const bal = hero.indexOf('฿{walletText}')
    expect(hero.lastIndexOf('{showWallet ? (', bal), 'ยอดเครดิตต้องอยู่ในกิ่ง showWallet (⊂ showMoneyStatus)').toBeGreaterThan(-1)
  })

  it('ฟีดกิจกรรม: ผู้เรียกทุกตัว (สแกนทั้ง src) ส่ง includeTopups', () => {
    const offenders: string[] = []
    const scan = (rel: string) => {
      const abs = join(process.cwd(), rel)
      for (const name of readdirSync(abs)) {
        const r = `${rel}/${name}`
        if (statSync(join(abs, name)).isDirectory()) {
          if (name !== '__tests__' && name !== 'node_modules') scan(r)
        } else if (/\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) && !r.endsWith('activity.service.ts')) {
          const code = read(r)
          for (const m of code.matchAll(/getRecentActivity\(/g)) {
            if (!code.slice(m.index!, m.index! + 160).includes('includeTopups')) offenders.push(r)
          }
        }
      }
    }
    scan('src')
    expect(offenders).toEqual([])
    expect(read('src/services/activity.service.ts')).toMatch(/opts\.includeTopups \? await getTransactions/)
  })

  it('ป้ายต่ออายุ/ยอดเงินในแถบร้านถูกล็อก · แผนตรวจ · แชทบอท อยู่หลัง useShowMoneyStatus', () => {
    const D = 'src/app/(paces)/seller/(dashboard)'
    expect(read(`${D}/business/components/LockedStateBanner.tsx`)).toMatch(/const label = showMoneyStatus \?/)
    expect(read(`${D}/inspection/components/PlanStatusCard.tsx`)).toMatch(/\{inGrace && showMoneyStatus && \(/)
    expect(read(`${D}/settings/chatbot/ChatbotClient.tsx`)).toMatch(/\{showMoneyStatus && (?:walletBalance != null && )?\(\s*<p[^>]*>ยอดเงินคงเหลือ/)
  })
})
