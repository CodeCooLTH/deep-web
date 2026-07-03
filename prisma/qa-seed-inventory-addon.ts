/**
 * QA seed — Feature 00003 Inventory Add-on (end-of-phase QA) — TEST DATA ONLY
 *
 * สร้าง 3 seller (regression / happy-path / locked) + 1 admin สำหรับทดสอบผ่าน
 * browser จริง (username+password login). Idempotent by fixed username/slug —
 * ลบชุดนี้แล้วสร้างใหม่ทุกครั้ง.
 *
 * วิธีรัน (Supabase = dev DB ที่ dev server ใช้):
 *   node_modules/.bin/dotenv -e /Users/craftman/Projects/safepay/.env.local -- \
 *     npx tsx prisma/qa-seed-inventory-addon.ts
 *
 * cleanup:
 *   node_modules/.bin/dotenv -e /Users/craftman/Projects/safepay/.env.local -- \
 *     npx tsx prisma/qa-seed-inventory-addon.ts --cleanup
 */
import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'

const connectionUrl = process.env.DIRECT_URL ?? process.env.DATABASE_URL
const prisma = new PrismaClient({ datasources: { db: { url: connectionUrl } } })

const PASSWORD = 'QaInv@1234!'

const USERNAMES = ['qa_inv_regression', 'qa_inv_happy', 'qa_inv_locked', 'qa_inv_admin']

async function cleanup() {
  const users = await prisma.user.findMany({
    where: { username: { in: USERNAMES } },
    select: { id: true },
  })
  const ids = users.map((u) => u.id)
  if (ids.length === 0) {
    console.log('cleanup: ไม่พบ QA user ใด ๆ (already clean)')
    return
  }
  // Shop cascade ลบ Product/Order/SellerWallet/InventoryEntitlement/TopUpRequest ให้เอง (onDelete: Cascade)
  // User cascade ลบ AuthAccount/Shop ให้เอง
  await prisma.user.deleteMany({ where: { id: { in: ids } } })
  console.log(`cleanup: ลบ ${ids.length} QA user (+ cascade shop/product/order/wallet/entitlement) แล้ว`)
}

async function upsertSeller(opts: {
  username: string
  shopName: string
  slug: string
  phone: string
  balance: number
}) {
  const passwordHash = await bcrypt.hash(PASSWORD, 10)
  const user = await prisma.user.upsert({
    where: { username: opts.username },
    update: { passwordHash, phone: opts.phone, isShop: true },
    create: {
      displayName: opts.shopName,
      username: opts.username,
      phone: opts.phone,
      passwordHash,
      isShop: true,
    },
  })
  // userId ไม่ใช่ unique field แล้ว (feature 00008 Phase 2) — upsert ตรง ๆ ใช้ไม่ได้
  // ต้อง findFirst (scope kind:PERSONAL) แล้ว update/create เอง
  const existingShop = await prisma.shop.findFirst({ where: { userId: user.id, kind: 'PERSONAL' } })
  const shop = existingShop
    ? await prisma.shop.update({
        where: { id: existingShop.id },
        data: { shopName: opts.shopName, slug: opts.slug },
      })
    : await prisma.shop.create({
        data: {
          userId: user.id,
          shopName: opts.shopName,
          slug: opts.slug,
          businessType: 'INDIVIDUAL',
        },
      })
  await prisma.sellerWallet.upsert({
    where: { shopId: shop.id },
    update: { balance: opts.balance },
    create: { shopId: shop.id, balance: opts.balance },
  })
  return { user, shop }
}

async function upsertProduct(shopId: string, name: string, stockQty: number | null) {
  const existing = await prisma.product.findFirst({ where: { shopId, name } })
  if (existing) {
    return prisma.product.update({ where: { id: existing.id }, data: { stockQty } })
  }
  return prisma.product.create({
    data: {
      shopId,
      name,
      price: 100,
      type: 'PHYSICAL',
      fulfillmentMode: 'SHIPPED',
      images: [],
      isActive: true,
      stockQty,
    },
  })
}

async function seed() {
  console.log('=== QA seed: Inventory Add-on (feature 00003) ===')

  // 1) Regression shop — ไม่มี InventoryEntitlement เลย (NOT_SUBSCRIBED)
  const regression = await upsertSeller({
    username: 'qa_inv_regression',
    shopName: 'QA-INV-REGRESSION-SHOP',
    slug: 'qa-inv-regression-shop',
    phone: '0900000091',
    balance: 1000,
  })
  await upsertProduct(regression.shop.id, 'QA-INV-Regression-Product', null)
  console.log(`regression shop: ${regression.shop.id} (login: qa_inv_regression / ${PASSWORD})`)

  // 2) Happy-path shop — เริ่ม NOT_SUBSCRIBED ด้วย (จะ subscribe ผ่าน UI ระหว่างเทส)
  const happy = await upsertSeller({
    username: 'qa_inv_happy',
    shopName: 'QA-INV-HAPPY-SHOP',
    slug: 'qa-inv-happy-shop',
    phone: '0900000092',
    balance: 1000,
  })
  // ลบ entitlement เดิมถ้ามี (idempotent — reset สถานะกลับ NOT_SUBSCRIBED ทุกครั้งที่ seed ใหม่)
  await prisma.inventoryEntitlement.deleteMany({ where: { shopId: happy.shop.id } })
  await upsertProduct(happy.shop.id, 'QA-INV-Happy-Product', null)
  console.log(`happy shop: ${happy.shop.id} (login: qa_inv_happy / ${PASSWORD})`)

  // 3) Locked shop — seed InventoryEntitlement status=LOCKED ตรง ๆ
  const locked = await upsertSeller({
    username: 'qa_inv_locked',
    shopName: 'QA-INV-LOCKED-SHOP',
    slug: 'qa-inv-locked-shop',
    phone: '0900000093',
    balance: 50, // ไม่พอ ฿199 — ทดสอบ reactivate INSUFFICIENT_CREDIT ได้ด้วยถ้าต้องการ
  })
  const now = new Date()
  const past = new Date(now.getTime() - 40 * 86_400_000)
  await prisma.inventoryEntitlement.upsert({
    where: { shopId: locked.shop.id },
    update: {
      status: 'LOCKED',
      lockedAt: now,
      nextRenewalAt: past, // ค้างจากรอบก่อน (แสดงว่าหมดอายุแล้ว)
    },
    create: {
      shopId: locked.shop.id,
      status: 'LOCKED',
      activatedAt: past,
      currentPeriodStart: past,
      nextRenewalAt: past,
      lockedAt: now,
    },
  })
  await upsertProduct(locked.shop.id, 'QA-INV-Locked-Product', 7) // มี stock เดิมอยู่ก่อนถูกล็อก
  console.log(`locked shop: ${locked.shop.id} (login: qa_inv_locked / ${PASSWORD})`)

  // 4) Admin user — สำหรับเข้า admin.deepth.local ตรวจ topup detail sidebar
  const adminPasswordHash = await bcrypt.hash(PASSWORD, 10)
  const admin = await prisma.user.upsert({
    where: { username: 'qa_inv_admin' },
    update: { passwordHash: adminPasswordHash, isAdmin: true },
    create: {
      displayName: 'QA Inventory Admin',
      username: 'qa_inv_admin',
      passwordHash: adminPasswordHash,
      isAdmin: true,
    },
  })
  console.log(`admin user: ${admin.id} (login: qa_inv_admin / ${PASSWORD})`)

  console.log('\n=== seed เสร็จ ===')
  console.log(JSON.stringify({
    regressionShopId: regression.shop.id,
    happyShopId: happy.shop.id,
    lockedShopId: locked.shop.id,
    adminId: admin.id,
  }, null, 2))
}

const isCleanup = process.argv.includes('--cleanup')

;(isCleanup ? cleanup() : seed())
  .catch((e) => {
    console.error(e)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
