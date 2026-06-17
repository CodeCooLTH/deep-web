/**
 * auth-bypass helper สำหรับ E2E — seed user + ฉีด NextAuth session cookie
 * (bypass FB OAuth / OTP login ที่เทส local ไม่ได้) ตามที่ safepay-qa พิสูจน์แล้ว.
 *
 * วิธี: encode JWT ด้วย NEXTAUTH_SECRET (v4, ไม่ส่ง salt) → cookie `next-auth.session-token`
 *   (dev http, host-scoped seller.deepth.local). proxy/getToken decode อ่าน flag ได้.
 *
 * states ที่ seed ได้:
 *   fresh-fb   → FB user, ไม่มี phone/shop → needsRegistration (เด้ง /register)
 *   no-slug    → มี phone + shop ไม่มี slug → needsOnboarding (เด้ง /onboarding)
 *   complete   → มี phone + shop + slug → ใช้งานปกติ
 */
import { encode } from 'next-auth/jwt'
import { PrismaClient } from '@prisma/client'
import type { BrowserContext } from '@playwright/test'

export const prisma = new PrismaClient()
const SECRET = process.env.NEXTAUTH_SECRET ?? ''

export type SellerState = 'fresh-fb' | 'no-slug' | 'complete'

export type Seeded = { userId: string; needsRegistration: boolean; needsOnboarding: boolean }

/** สร้าง user ตาม state → คืน userId + flag สำหรับ cookie */
export async function createSeller(state: SellerState): Promise<Seeded> {
  const s = Math.random().toString(36).slice(2, 8)
  const hasPhone = state !== 'fresh-fb'
  const hasShop = state !== 'fresh-fb'
  const hasSlug = state === 'complete'

  const user = await prisma.user.create({
    data: {
      displayName: 'QA E2E',
      username: `qae2e_${s}`,
      ...(hasPhone ? { phone: `09${String(Date.now()).slice(-8)}` } : {}),
      ...(state === 'fresh-fb'
        ? { authAccounts: { create: { provider: 'FACEBOOK', providerAccountId: `qae2e-${s}` } } }
        : {}),
    },
  })
  if (hasShop) {
    await prisma.shop.create({
      data: { userId: user.id, shopName: 'QA Shop', businessType: 'INDIVIDUAL', ...(hasSlug ? { slug: `qae2e-${s}` } : {}) },
    })
    await prisma.user.update({ where: { id: user.id }, data: { isShop: true } })
  }
  return { userId: user.id, needsRegistration: !hasPhone, needsOnboarding: !hasSlug }
}

/** ฉีด session cookie ให้ browser context (ล็อกอินเป็น user นี้) */
export async function loginAs(context: BrowserContext, seeded: Seeded) {
  const token = await encode({
    token: { userId: seeded.userId, needsRegistration: seeded.needsRegistration, needsOnboarding: seeded.needsOnboarding },
    secret: SECRET,
  })
  await context.addCookies([
    { name: 'next-auth.session-token', value: token, domain: 'seller.deepth.local', path: '/', httpOnly: true, sameSite: 'Lax' },
  ])
}

/** ลบ user + shop ที่ seed (เรียกใน afterEach/afterAll) */
export async function cleanup(userId: string) {
  await prisma.shop.deleteMany({ where: { userId } }).catch(() => {})
  await prisma.authAccount.deleteMany({ where: { userId } }).catch(() => {})
  await prisma.user.delete({ where: { id: userId } }).catch(() => {})
}
