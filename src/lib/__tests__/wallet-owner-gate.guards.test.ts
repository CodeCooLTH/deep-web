import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { insufficientCreditHtml, NON_OWNER_INSUFFICIENT_CREDIT_TEXT } from '../payment-copy'

/**
 * 00071 T3 — source-scan: ทุกจุดที่อ่านยอดกระเป๋าในหน้า/layout ต้องอยู่หลังเงื่อนไขเจ้าของ
 * (ซ่อนใน JSX ไม่พอ — ต้องไม่ query เลย) และ ADMIN ยังส่ง SMS / ขอ AI ได้ (ไม่มีด่าน forbidden ในเส้นหักเครดิต)
 */
const root = process.cwd()
const D = 'src/app/(paces)/seller/(dashboard)'
const read = (p: string) => readFileSync(join(root, p), 'utf8')

describe('getBalance ต้องถูกครอบเงื่อนไขเจ้าของ', () => {
  it('inventory/page.tsx', () => {
    const s = read(`${D}/inventory/page.tsx`)
    expect(s).toMatch(/isOwner\s*\?\s*getBalance\(/)
    expect(s.match(/getBalance\(/g)).toHaveLength(1)
  })
  it('subscriptions/page.tsx: ไม่เรียก getBalance ตรง และส่ง canSeeBalance ตาม role', () => {
    const s = read(`${D}/subscriptions/page.tsx`)
    expect(s).not.toMatch(/await getBalance\(/)
    expect(s).toMatch(/canSeeBalance:\s*isShopOwnerRole\(activeCtx\.role, activeCtx\.roles\)/)
  })
  it('subscription-overview.service: getBalance ถูกครอบด้วย canSeeBalance', () => {
    expect(read('src/services/subscription-overview.service.ts')).toMatch(/canSeeBalance\s*\?\s*await getBalance\(/)
  })
  it('chatbot/page.tsx: ไม่ส่งตัวเลขยอดให้ผู้ไม่ใช่เจ้าของ', () => {
    expect(read(`${D}/settings/chatbot/page.tsx`)).toMatch(/walletBalance=\{isOwner\s*\?/)
  })
  it('layout: TopUpCelebrationPoller mount เฉพาะเจ้าของ', () => {
    expect(read(`${D}/layout.tsx`)).toMatch(/isShopOwnerRole\(active\.role, active\.roles\)\s*&&\s*<TopUpCelebrationPoller/)
  })
  it('wallet page: gate อยู่ก่อน getBalance', () => {
    const s = read(`${D}/wallet/page.tsx`)
    expect(s.indexOf("gatePage(sessionLike, 'F3')")).toBeGreaterThan(0)
    expect(s.indexOf("gatePage(sessionLike, 'F3')")).toBeLessThan(s.indexOf('await getBalance('))
    expect(s.indexOf('if (forbidden)')).toBeLessThan(s.indexOf('await getBalance('))
  })
})

describe('เส้นหักเครดิตของ ADMIN ต้องไม่โดนด่าน forbidden', () => {
  it('send-sms route ไม่มี forbiddenRoleResponse/isShopOwner', () => {
    const s = read('src/app/api/orders/[token]/send-sms/route.ts')
    expect(s).not.toMatch(/forbiddenRoleResponse|isShopOwner/)
  })
  it('ai-suggest route: เช็คเจ้าของเฉพาะหลัง INSUFFICIENT_CREDIT (หลัง deductCredit) เพื่อซ่อน balance', () => {
    const s = read('src/app/api/chat/conversations/[id]/ai-suggest/route.ts')
    expect(s).not.toMatch(/forbiddenRoleResponse/)
    expect(s.indexOf('isShopOwnerOfShop(shopId')).toBeGreaterThan(s.indexOf('await deductCredit('))
  })
})

describe('insufficientCreditHtml canTopUp', () => {
  it('ผู้ไม่ใช่เจ้าของ → ข้อความไม่มีลิงก์ ทั้งเว็บและแอป', () => {
    for (const hide of [false, true]) {
      const t = insufficientCreditHtml(hide, 'เติมเงิน', false)
      expect(t).toBe(NON_OWNER_INSUFFICIENT_CREDIT_TEXT)
      expect(t).not.toContain('/wallet')
    }
  })
  it('เจ้าของ → เหมือนเดิม', () => {
    expect(insufficientCreditHtml(false, 'เติมเงิน', true)).toContain('href="/wallet"')
    expect(insufficientCreditHtml(true, 'เติมเงิน', true)).toBe('เครดิตไม่พอ')
  })
})
