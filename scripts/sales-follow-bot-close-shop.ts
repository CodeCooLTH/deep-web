/**
 * 00095 kill switch เร็ว — ตั้งบอททุกตัวของร้านเป็น CLOSED (TFR-FB-08 · BR-FB-83/84 · TC-506)
 * tick ถัดไปหยุดทุก run ของบอทเหล่านั้นด้วย BOT_DISABLED (ทางเร็วกว่ารอ redeploy ถอนร้านออกจาก SALES_FOLLOW_BOT_SHOP_IDS)
 *
 *   SALES_FOLLOW_CLOSE_DATABASE_URL=… npx tsx scripts/sales-follow-bot-close-shop.ts --shop <id>                         # dry-run (ค่าตั้งต้น)
 *   SALES_FOLLOW_CLOSE_DATABASE_URL=… npx tsx scripts/sales-follow-bot-close-shop.ts --shop <id> --apply [--confirm-shop <id>]
 *
 * 🛑 ใช้กับ prod ได้ (ตั้งใจ) แต่อ่าน URL จาก SALES_FOLLOW_CLOSE_DATABASE_URL เท่านั้น — ห้ามอ่าน DATABASE_URL (กันชี้ผิดฐานโดยไม่ตั้งใจ)
 * 🛑 --apply ต้องยืนยันด้วยการพิมพ์รหัสร้านซ้ำ (prompt) หรือ --confirm-shop <id> (ไม่มี TTY) · scope ด้วย shopId ตัวเดียว
 * 🛑 ปิดอย่างเดียว ไม่ลบ ไม่แตะ run/ประวัติ · เปิดคืนต้องทำที่หน้าตั้งค่าบอท
 */
import { createInterface } from 'node:readline/promises'
import { PrismaClient } from '@prisma/client'
import { CLOSE_URL_ENV, UUID_RE, dbHost } from './sales-follow-bot-lib'

const argv = process.argv.slice(2)
const arg = (name: string): string | undefined => {
  const i = argv.indexOf(name)
  return i >= 0 ? argv[i + 1] : undefined
}

async function confirmShop(shopId: string): Promise<boolean> {
  const given = arg('--confirm-shop')
  if (given !== undefined) return given.trim().toLowerCase() === shopId
  if (!process.stdin.isTTY) return false
  const rl = createInterface({ input: process.stdin, output: process.stdout })
  const typed = await rl.question(`พิมพ์รหัสร้านซ้ำเพื่อยืนยัน (${shopId}): `)
  rl.close()
  return typed.trim().toLowerCase() === shopId
}

async function main() {
  const shopId = arg('--shop')?.trim().toLowerCase()
  if (!shopId || !UUID_RE.test(shopId)) throw new Error('ต้องระบุ --shop <uuid> ของร้าน (ร้านเดียว)')
  const url = process.env[CLOSE_URL_ENV]
  if (!url) throw new Error(`ต้องตั้ง ${CLOSE_URL_ENV} (สคริปต์นี้ไม่อ่าน DATABASE_URL โดยตั้งใจ)`)
  const apply = argv.includes('--apply')

  const prisma = new PrismaClient({ datasources: { db: { url } } })
  try {
    const shop = await prisma.shop.findUnique({ where: { id: shopId }, select: { id: true, shopName: true } })
    if (!shop) throw new Error(`ไม่พบร้าน ${shopId} บนฐาน host=${dbHost(url)}`)
    const where = { shopId, deletedAt: null, status: { not: 'CLOSED' } }
    const bots = await prisma.salesFollowBot.findMany({ where, select: { id: true, status: true } })
    const activeRuns = await prisma.salesFollowRun.count({ where: { shopId, status: 'ACTIVE', botId: { in: bots.map((b) => b.id) } } })
    console.log(`${apply ? 'APPLY' : 'DRY-RUN'} · host=${dbHost(url)} · ร้าน "${shop.shopName}" (${shop.id})`)
    console.log(`บอทที่จะถูกปิด: ${bots.length} (ACTIVE ${bots.filter((b) => b.status === 'ACTIVE').length} · TESTING ${bots.filter((b) => b.status === 'TESTING').length})`)
    console.log(`run ที่จะหยุดด้วย BOT_DISABLED ใน tick ถัดไป: ${activeRuns}`)
    if (!apply) return void console.log('(dry-run — ยังไม่เขียนอะไร · ใส่ --apply เพื่อปิดจริง)')
    if (bots.length === 0) return void console.log('ไม่มีบอทให้ปิด')
    if (!(await confirmShop(shopId))) throw new Error('ยืนยันไม่ตรงรหัสร้าน (หรือไม่มี TTY และไม่ได้ใส่ --confirm-shop) — ไม่ได้เขียนอะไร')
    // where ซ้ำชุดเดียวกับตอนนับ + shopId — บอทที่เพิ่งถูกปิด/ลบระหว่างรอยืนยันไม่ถูกแตะ
    const r = await prisma.salesFollowBot.updateMany({ where, data: { status: 'CLOSED' } })
    console.log(`ปิดแล้ว ${r.count} บอท`)
  } finally {
    await prisma.$disconnect()
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e)
  process.exit(1)
})
