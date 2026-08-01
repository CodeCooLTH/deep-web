/**
 * สร้างบัญชีผู้ขายทดสอบสำหรับ Meta App Review (feat 00018)
 *
 * เขียนลงฐาน prod — idempotent: รันซ้ำได้ ถ้ามีบัญชีอยู่แล้วจะแค่ตั้งรหัสผ่านใหม่ + ซ่อมค่า
 * ที่ทำให้ proxy เด้งเข้า /register หรือ /onboarding ไม่สร้างซ้ำ ไม่ลบอะไรทั้งสิ้น
 *
 * เงื่อนไขที่ต้องครบถึงจะ login แล้วใช้งานได้ทันที (อ่านจากโค้ดจริง):
 *   lib/auth.ts seller-credentials : username + passwordHash + isShop && !isAdmin
 *   lib/auth.ts jwt                : needsRegistration = มี Personal shop แต่ไม่มี phone
 *                                    needsOnboarding   = มี Personal shop แต่ shop ไม่มี slug
 *   proxy.ts                       : ทั้งสอง flag = force-redirect ออกจากทุกหน้า
 */
import { prisma } from '@/lib/prisma'
import { hashPassword } from '@/lib/password'

const USERNAME = 'metareview'
const SLUG = 'meta-review-test'
const SHOP_NAME = 'Deep Review Test Shop'
// เบอร์ที่เป็นไปไม่ได้ในชีวิตจริง — กันชนกับลูกค้าจริง และกัน linkBuyerHistory จับคู่ผิดคน
const PHONE = '0000000019'

function makePassword(): string {
  // ไม่ใช้ Math.random — ต้องเดาไม่ได้ เพราะนี่คือบัญชีที่เปิดให้คนนอกล็อกอินบน prod
  const { randomBytes } = require('node:crypto') as typeof import('node:crypto')
  const alphabet = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  const raw = randomBytes(18)
  const body = Array.from(raw, (b: number) => alphabet[b % alphabet.length]).join('')
  return `Dp${body}9!` // ให้ผ่าน isStrongPassword แน่นอน (พิมพ์ใหญ่/เล็ก/เลข/ยาว)
}

async function main() {
  const password = makePassword()
  const passwordHash = await hashPassword(password)

  const existing = await prisma.user.findUnique({
    where: { username: USERNAME },
    select: { id: true, phone: true, isShop: true, isAdmin: true },
  })

  const user = existing
    ? await prisma.user.update({
        where: { id: existing.id },
        data: { passwordHash, isShop: true, phone: existing.phone ?? PHONE },
        select: { id: true, username: true, phone: true, isShop: true, isAdmin: true },
      })
    : await prisma.user.create({
        data: {
          username: USERNAME,
          displayName: 'Deep Review Test',
          phone: PHONE,
          passwordHash,
          isShop: true,
        },
        select: { id: true, username: true, phone: true, isShop: true, isAdmin: true },
      })

  const personal = await prisma.shop.findFirst({
    where: { userId: user.id, kind: 'PERSONAL' },
    select: { id: true, slug: true, shopName: true },
  })

  const shop = personal
    ? personal.slug
      ? personal
      : await prisma.shop.update({
          where: { id: personal.id },
          data: { slug: SLUG },
          select: { id: true, slug: true, shopName: true },
        })
    : await prisma.shop.create({
        data: {
          userId: user.id,
          shopName: SHOP_NAME,
          slug: SLUG,
          kind: 'PERSONAL',
          categories: ['other'],
        },
        select: { id: true, slug: true, shopName: true },
      })

  // จำลองสิ่งที่ jwt callback คำนวณ — ยืนยันว่า proxy จะไม่เด้ง
  const needsRegistration = !!shop && !user.phone
  const needsOnboarding = !!shop && !shop.slug

  console.log(JSON.stringify({
    action: existing ? 'อัปเดตบัญชีเดิม' : 'สร้างบัญชีใหม่',
    username: user.username,
    password,
    userId: user.id,
    shopId: shop.id,
    shopName: shop.shopName,
    slug: shop.slug,
    login_ok: user.isShop && !user.isAdmin,
    needsRegistration,
    needsOnboarding,
  }, null, 2))

  await prisma.$disconnect()
}

main()
