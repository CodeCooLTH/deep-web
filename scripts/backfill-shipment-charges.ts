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
import { getOrder, checkPrice } from '../src/lib/iship/client'
import { readCarrierChargesFromGetOrder } from '../src/lib/iship/status'
import { buildCheckPricePayload } from '../src/lib/iship/mapping'
import type { DeepAddress } from '../src/lib/iship/mapping'

const APPLY = process.argv.includes('--apply')
const SHOP_ARG = process.argv.find((a) => a.startsWith('--shop='))?.slice('--shop='.length) ?? null

/** ยิงพร้อมกันทีละกี่ใบ — ช้าไว้ก่อน ตัวนี้ยิงระบบของคนอื่นและไม่มีอะไรเร่ง */
const CONCURRENCY = 4

const prisma = new PrismaClient()

const baht = (n: number) =>
  n.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

type Plan = { id: string; label: string; data: Record<string, number> }

/**
 * ราคาประมาณจากน้ำหนัก/ขนาดที่ร้านแจ้งไว้ตอนสร้างพัสดุ — ใช้ snapshot ที่เก็บไว้ในแถว
 * ไม่ใช่ค่าปัจจุบันของร้าน (ต้องเป็นเงื่อนไขเดียวกับตอนที่พัสดุใบนั้นถูกเปิด)
 *
 * คืน null เมื่อขอราคาไม่ได้ — ปล่อยว่างดีกว่าเดาเลขมั่ว
 */
async function quoteEstimate(
  token: string,
  s: {
    courierCode: string | null
    weight: unknown
    width: unknown
    length: unknown
    height: unknown
    senderSnapshot: unknown
    receiverSnapshot: unknown
  },
): Promise<number | null> {
  if (!s.courierCode || s.weight == null || s.width == null || s.length == null || s.height == null) return null
  const sender = s.senderSnapshot as DeepAddress & { postcode?: string | null }
  const receiver = s.receiverSnapshot as DeepAddress
  if (!sender || !receiver) return null
  try {
    const quote = await checkPrice(token, {
      courier_code: s.courierCode,
      ...buildCheckPricePayload(sender as never, receiver, {
        weight: Number(s.weight),
        width: Number(s.width),
        length: Number(s.length),
        height: Number(s.height),
      }),
    })
    const n = Number(quote?.total_price)
    // ≤ 0 = ขนส่งไม่รองรับเส้นทางนี้ ไม่ใช่ส่งฟรี
    return Number.isFinite(n) && n > 0 ? n : null
  } catch {
    return null
  }
}

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
        estimatedPrice: true,
        actualWeight: true,
        codFee: true,
        courierCode: true,
        weight: true,
        width: true,
        length: true,
        height: true,
        senderSnapshot: true,
        receiverSnapshot: true,
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
        const data: Record<string, number> = {}
        // null = "iShip ไม่ได้บอก" ไม่ใช่ "ค่านั้นถูกลบ" — ห้ามเขียนทับของเดิมด้วยความว่าง
        if (next.carrierPrice !== null && Number(s.carrierPrice ?? NaN) !== next.carrierPrice)
          data.carrierPrice = next.carrierPrice
        if (next.actualWeight !== null && Number(s.actualWeight ?? NaN) !== next.actualWeight)
          data.actualWeight = next.actualWeight
        /**
         * ค่าธรรมเนียม COD เก็บได้เสมอแม้ยังไม่มีราคาส่ง — iShip คิดจาก % ของยอด COD จึงรู้
         * ตั้งแต่วินาทีที่สร้างพัสดุ (ยืนยัน 2026-08-10: ใบ status=1 มี cod_fee แล้วทั้งที่
         * discount_price ยังเป็น 0) รอบก่อนสคริปต์นี้ `continue` ทิ้งทั้งแถวเมื่อไม่มีราคาส่ง
         * จึงทิ้งค่าธรรมเนียมที่รู้แล้วไปด้วยโดยไม่จำเป็น
         */
        if (next.codFee !== null && Number(s.codFee ?? NaN) !== next.codFee) data.codFee = next.codFee

        // ยังไม่มีราคาจริง → ขอราคาประมาณจากน้ำหนักที่ร้านแจ้ง เพื่อให้หน้ายอดขายมีตัวเลขใช้
        // ระหว่างรอ (เขียนลง estimatedPrice เท่านั้น ห้ามลง carrierPrice — คนละความน่าเชื่อถือ)
        if (next.carrierPrice === null && s.carrierPrice === null && s.estimatedPrice === null) {
          noPrice += 1
          const est = await quoteEstimate(token, s)
          if (est !== null) data.estimatedPrice = est
        }
        if (Object.keys(data).length === 0) continue

        planned.push({ id: s.id, label: `${s.order.orderNo ?? '-'} ${s.trackingNo}`, data })
        if (data.carrierPrice) totalPrice += data.carrierPrice
        if (data.codFee) totalCodFee += data.codFee
      }
      process.stdout.write(`\r  ตรวจแล้ว ${Math.min(i + CONCURRENCY, shipments.length)}/${shipments.length}`)
    }
    process.stdout.write('\n')

    console.log(
      `  ต้องอัปเดต ${planned.length} ใบ · ยังไม่มีราคาจริง (ใช้ราคาประมาณแทน) ${noPrice} ใบ · ` +
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
