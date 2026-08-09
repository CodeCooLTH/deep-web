/**
 * backfill ต้นทุนจริงของการจัดส่งย้อนหลัง (`OrderShipment.carrierPrice/actualWeight/codFee`) — 2026-08-09
 *
 * ที่มา: `carrierPrice` มีคอลัมน์มาตั้งแต่ 20260726000000 แต่จุดเขียนจุดเดียวคือ webhook ที่ตอบ 404
 * ทุกคำขอเพราะ `ISHIP_WEBHOOK_SECRET` ไม่ถูกตั้งบน production — prod จึงมีพัสดุ active 140 ใบที่
 * `carrierStatus` เต็มทั้ง 140 (polling ทำงาน) แต่ `carrierPrice` ว่างทั้ง 140 ใบ
 *
 * 🛑 ทำไมรอ sync เก็บให้เองไม่ได้: ชุดที่ `syncShipmentStatuses()` ดึงมา **ตัดใบที่จบแล้วออก**
 * (delivered/return_success/is_expired/close ที่เคลียร์เงินแล้ว) ใบที่ส่งถึงไปก่อนฟีเจอร์นี้ขึ้น
 * จึงไม่มีวันเข้าลูปนั้นอีกเลย ต้องกวาดครั้งเดียวด้วยสคริปต์นี้
 *
 * ─── ทำไมยิง get_order รายใบ ไม่กวาดตามวันด้วย query_orders ──────────────────
 *
 * เพราะ **เรารู้เลขพัสดุอยู่แล้วทุกใบ** การไล่ตามช่วงวันที่เป็นการเดาว่าใบไหนอยู่หน้าต่างไหน แล้ว
 * เดาผิดได้จริง: `OrderShipment.createdAt` ของใบ `source='LINKED'` คือวันที่ร้าน **กดผูก** ไม่ใช่
 * วันที่เปิดพัสดุบน iShip — กวาดตาม createdAt แล้วหายไป 55 จาก 140 ใบเงียบ ๆ (วัดจริง 2026-08-09)
 *
 * ข้อห้าม "ห้ามยิง get_order รายใบ" ใน `00022 API.md` บังคับกับ **รอบ sync ที่วนทุก 15 นาที**
 * ซึ่งจะกลายเป็นหลักร้อยคำขอต่อรอบตลอดไป — สคริปต์นี้รันครั้งเดียวจึงไม่เข้าข่าย
 *
 * 🛑 `get_order` ใช้ `readCarrierChargesFromGetOrder()` **ไม่ใช่ตัวเดียวกับ sync** เพราะ `weight`
 * ของ endpoint นี้คือน้ำหนักที่ชั่งจริง ส่วน `weight` ของ `query_orders` คือที่ร้านแจ้ง (ดูคอมเมนต์
 * ที่ฟังก์ชันนั้น) — เกณฑ์การตัดสินค่ายังเป็นตัวเดียวกัน ห้ามลอกไปเขียนซ้ำ
 *
 * ขอบเขตแคบเสมอ — แตะเฉพาะแถวที่:
 *   1. `status='CREATED' AND isDryRun=false` (นิยาม "มีพัสดุจริง" เดียวกับทั้งระบบ)
 *   2. มี `trackingNo`
 *   3. iShip ตอบกลับมาว่ามีราคาจริง — **ใบที่หาไม่เจอหรือยังไม่มีราคา ข้ามไปเฉย ๆ ไม่แตะ**
 *      (ราคา 0 = ขนส่งยังไม่เข้ารับ ยังไม่ถูกคิดเงิน ไม่ใช่ "ส่งฟรี")
 *   4. ค่าที่จะเขียน **ต่างจากของเดิมจริง** — ไม่เขียนทับด้วย null และไม่ UPDATE ซ้ำเปล่า ๆ
 *
 * dry-run เป็นค่าตั้งต้น ต้องใส่ `--apply` ถึงจะเขียนจริง
 *
 * ใช้:
 *   npx dotenv -e .env.vercel-prod -- npx tsx scripts/backfill-shipment-charges.ts --shop=<shopId|slug>
 *   npx dotenv -e .env.vercel-prod -- npx tsx scripts/backfill-shipment-charges.ts --shop=<...> --apply
 *   (ไม่ใส่ --shop = ทุกร้านที่เชื่อม iShip อยู่)
 */
import { PrismaClient } from '@prisma/client'
import { decryptToken } from '../src/lib/token-crypto'
import { getOrder } from '../src/lib/iship/client'
import { readCarrierChargesFromGetOrder } from '../src/lib/iship/status'

const APPLY = process.argv.includes('--apply')
const SHOP_ARG = process.argv.find((a) => a.startsWith('--shop='))?.slice('--shop='.length) ?? null

/** ยิงพร้อมกันทีละกี่ใบ — ช้าไว้ก่อน ตัวนี้ยิงระบบของคนอื่นและไม่มีอะไรเร่ง */
const CONCURRENCY = 4

const prisma = new PrismaClient()

const baht = (n: number) =>
  n.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

type Plan = { id: string; label: string; data: Record<string, number> }

async function main() {
  const accounts = await prisma.shopShippingAccount.findMany({
    where: { status: 'ACTIVE' },
    select: { shopId: true, accessTokenEnc: true, shop: { select: { shopName: true, slug: true } } },
  })

  const targets = SHOP_ARG
    ? accounts.filter((a) => a.shopId === SHOP_ARG || a.shop.slug === SHOP_ARG)
    : accounts

  if (targets.length === 0) {
    console.log(SHOP_ARG ? `ไม่พบร้าน "${SHOP_ARG}" ที่เชื่อม iShip อยู่` : 'ไม่มีร้านที่เชื่อม iShip')
    return
  }

  console.log(APPLY ? '=== โหมดเขียนจริง (--apply) ===' : '=== dry-run (ยังไม่เขียนอะไร) ===')

  let totalUpdated = 0
  let totalPrice = 0
  let totalCodFee = 0

  for (const acc of targets) {
    console.log(`\n── ${acc.shop.shopName} (${acc.shop.slug ?? acc.shopId}) ──`)

    const shipments = await prisma.orderShipment.findMany({
      where: { shopId: acc.shopId, status: 'CREATED', isDryRun: false, trackingNo: { not: null } },
      select: {
        id: true,
        trackingNo: true,
        carrierPrice: true,
        actualWeight: true,
        codFee: true,
        order: { select: { orderNo: true } },
      },
      orderBy: { createdAt: 'asc' },
    })
    if (shipments.length === 0) {
      console.log('  ไม่มีพัสดุที่เข้าเกณฑ์')
      continue
    }
    console.log(
      `  พัสดุที่เข้าเกณฑ์ ${shipments.length} ใบ · ยังไม่มีค่าส่งจริง ` +
        `${shipments.filter((s) => s.carrierPrice === null).length} ใบ — ไล่จากเลขพัสดุทีละใบ`,
    )

    const token = decryptToken(acc.accessTokenEnc)
    const planned: Plan[] = []
    let noPrice = 0
    let notFound = 0

    for (let i = 0; i < shipments.length; i += CONCURRENCY) {
      const batch = shipments.slice(i, i + CONCURRENCY)
      const results = await Promise.all(
        batch.map(async (s) => {
          try {
            return { s, raw: (await getOrder(token, s.trackingNo!)) as Record<string, unknown> }
          } catch {
            return { s, raw: null }
          }
        }),
      )
      for (const { s, raw } of results) {
        if (!raw || !raw.track_no) {
          notFound += 1
          continue
        }
        const next = readCarrierChargesFromGetOrder(raw)
        if (next.carrierPrice === null) {
          // ยังไม่ถูกคิดเงิน (ขนส่งยังไม่เข้ารับ) — ข้ามไปเฉย ๆ sync จะเก็บให้เองเมื่อถึงเวลา
          noPrice += 1
          continue
        }
        const data: Record<string, number> = {}
        // null = "iShip ไม่ได้บอก" ไม่ใช่ "ค่านั้นถูกลบ" — ห้ามเขียนทับของเดิมด้วยความว่าง
        if (Number(s.carrierPrice ?? NaN) !== next.carrierPrice) data.carrierPrice = next.carrierPrice
        if (next.actualWeight !== null && Number(s.actualWeight ?? NaN) !== next.actualWeight)
          data.actualWeight = next.actualWeight
        if (next.codFee !== null && Number(s.codFee ?? NaN) !== next.codFee) data.codFee = next.codFee
        if (Object.keys(data).length === 0) continue

        planned.push({ id: s.id, label: `${s.order.orderNo ?? '-'} ${s.trackingNo}`, data })
        if (data.carrierPrice) totalPrice += data.carrierPrice
        if (data.codFee) totalCodFee += data.codFee
      }
      process.stdout.write(`\r  ตรวจแล้ว ${Math.min(i + CONCURRENCY, shipments.length)}/${shipments.length}`)
    }
    process.stdout.write('\n')

    console.log(
      `  ต้องอัปเดต ${planned.length} ใบ · ยังไม่มีราคา (ขนส่งยังไม่เข้ารับ) ${noPrice} ใบ · ` +
        `ไม่พบบน iShip ${notFound} ใบ`,
    )
    // ตัวอย่างแถวจริงก่อนเขียนเสมอ — จำนวนรวมอย่างเดียวหลอกได้ (บทเรียน 2026-08-09)
    for (const p of planned.slice(0, 15)) {
      console.log(`    ${p.label} → ${Object.entries(p.data).map(([k, v]) => `${k}=${v}`).join(' ')}`)
    }
    if (planned.length > 15) console.log(`    … อีก ${planned.length - 15} ใบ`)

    if (APPLY) {
      for (const p of planned) {
        await prisma.orderShipment.update({ where: { id: p.id }, data: p.data })
      }
      console.log(`  ✔ เขียนแล้ว ${planned.length} ใบ`)
    }
    totalUpdated += planned.length
  }

  console.log(
    `\nรวม ${totalUpdated} ใบ · ค่าส่ง ฿${baht(totalPrice)} · ค่าธรรมเนียม COD ฿${baht(totalCodFee)} ` +
      `= ต้นทุนที่เพิ่มเข้าระบบ ฿${baht(totalPrice + totalCodFee)}`,
  )
  if (!APPLY) console.log('(dry-run — ยังไม่มีอะไรถูกเขียน ใส่ --apply เพื่อเขียนจริง)')
}

main()
  .catch((e) => {
    console.error(e)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
