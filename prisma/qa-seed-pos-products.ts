/**
 * QA seed — POS Order Create products — TEST DATA ONLY (ไม่ใช่ production)
 *
 * เติมสินค้าหลากหลาย (PHYSICAL/SERVICE/DIGITAL × SHIPPED/NO_SHIPPING) เข้า base seller shop
 * เพื่อ QA หน้า POS `/orders/new` (grid + combobox + cart).
 *
 * วิธีรัน (Supabase = dev DB ที่ dev server ใช้):
 *   npx dotenv -e .env.local -- npx tsx prisma/qa-seed-pos-products.ts
 *
 * idempotent: ลบสินค้า sku 'QAPOS-*' ของ shop นี้ก่อน แล้วสร้างใหม่.
 * รูปสินค้า = images:[] → หน้าเว็บ fallback icon package (thumbnail จริงต้องอัปโหลดผ่านแอป —
 *   Product.images map เป็น /api/files/{id} ไม่ใช่ external URL). ครบพอสำหรับ QA logic/layout.
 */
import { PrismaClient } from '@prisma/client'

const connectionUrl = process.env.DIRECT_URL ?? process.env.DATABASE_URL
const prisma = new PrismaClient({ datasources: { db: { url: connectionUrl } } })

const SHOP_ID = '9226d13a-8b25-4ab6-8c50-d77bce4086af'

const PRODUCTS = [
  { sku: 'QAPOS-1', name: 'พร้อมชุดตัดหมอกตรงรุ่น', price: 3500, type: 'PHYSICAL', fulfillmentMode: 'SHIPPED', description: 'รับประกันหลอด 1 ปี' },
  { sku: 'QAPOS-2', name: 'หลอดไฟ LED H4 6000K', price: 890, type: 'PHYSICAL', fulfillmentMode: 'SHIPPED', description: 'ความสว่างสูง ติดตั้งง่าย' },
  { sku: 'QAPOS-3', name: 'ฟิล์มกรองแสง 60%', price: 2200, type: 'PHYSICAL', fulfillmentMode: 'SHIPPED', description: null },
  { sku: 'QAPOS-4', name: 'แบตเตอรี่รถยนต์ 60Ah', price: 2800, type: 'PHYSICAL', fulfillmentMode: 'SHIPPED', description: 'รับประกัน 18 เดือน' },
  { sku: 'QAPOS-5', name: 'น้ำมันเครื่องสังเคราะห์ 4L', price: 1290, type: 'PHYSICAL', fulfillmentMode: 'SHIPPED', description: null },
  { sku: 'QAPOS-6', name: 'ค่าติดตั้ง (บริการหน้าร้าน)', price: 500, type: 'SERVICE', fulfillmentMode: 'NO_SHIPPING', description: 'ช่างผู้ชำนาญ' },
  { sku: 'QAPOS-7', name: 'ตรวจเช็คระบบไฟ', price: 300, type: 'SERVICE', fulfillmentMode: 'NO_SHIPPING', description: null },
  { sku: 'QAPOS-8', name: 'คอร์สออนไลน์ดูแลรถ', price: 990, type: 'DIGITAL', fulfillmentMode: 'NO_SHIPPING', description: 'เข้าถึงได้ทันทีหลังชำระ' },
]

async function seed() {
  const shop = await prisma.shop.findUnique({ where: { id: SHOP_ID } })
  if (!shop) {
    throw new Error(`ไม่พบ SHOP_ID ${SHOP_ID} — รัน "npm run seed:supabase" ก่อนเพื่อสร้าง base seller/shop`)
  }

  // idempotent: ลบชุด QAPOS เดิมก่อน
  const del = await prisma.product.deleteMany({
    where: { shopId: SHOP_ID, sku: { startsWith: 'QAPOS-' } },
  })

  for (const p of PRODUCTS) {
    await prisma.product.create({
      data: {
        shopId: SHOP_ID,
        name: p.name,
        sku: p.sku,
        description: p.description,
        price: p.price,
        type: p.type,
        fulfillmentMode: p.fulfillmentMode,
        images: [],
        isActive: true,
      },
    })
  }

  const total = await prisma.product.count({ where: { shopId: SHOP_ID, isActive: true } })
  console.log(`[qa-seed-pos] ลบเก่า ${del.count} • สร้างใหม่ ${PRODUCTS.length} • active ทั้งหมดใน shop = ${total}`)
}

seed()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e)
    await prisma.$disconnect()
    process.exit(1)
  })
