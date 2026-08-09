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
 * 🛑 ห้ามคำนวณราคาย้อนหลังด้วย `check-price` — จะได้ "ราคาวันที่ยิง" ไม่ใช่ "เงินที่ถูกหักจริง"
 * (พิสูจน์ 2026-08-09: 55/56 ใบตรงกัน แต่ใบที่ 56 `TH066536981258` ต่างกัน 38 vs 41 เพราะ iShip
 * คิดตามน้ำหนักที่บันทึกไว้ ณ ตอนนั้น) สคริปต์นี้จึงอ่านจาก `query_orders` อย่างเดียว
 *
 * ขอบเขตแคบเสมอ — แตะเฉพาะแถวที่:
 *   1. `status='CREATED' AND isDryRun=false` (นิยาม "มีพัสดุจริง" เดียวกับทั้งระบบ)
 *   2. มี `trackingNo`
 *   3. ค่าที่จะเขียน **ต่างจากของเดิมจริง** — ไม่เขียนทับด้วย null และไม่ UPDATE ซ้ำเปล่า ๆ
 * ใช้ `readCarrierCharges()` **ตัวเดียวกับที่ sync ใช้** ห้ามลอกเกณฑ์มาเขียนซ้ำ ไม่งั้นแถวเก่ากับ
 * แถวใหม่จะถูกตัดสินคนละแบบในฐานเดียวกันโดยไม่มีใครรู้
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
import { queryOrders, getOrder, type IShipOrderRow } from '../src/lib/iship/client'
import { readCarrierCharges } from '../src/lib/iship/status'

const APPLY = process.argv.includes('--apply')
const SHOP_ARG = process.argv.find((a) => a.startsWith('--shop='))?.slice('--shop='.length) ?? null

/** iShip ตอบ code 1009 ถ้าช่วงเกิน 7 วัน — ขอทีละ 6 วันกันเรื่องเขตเวลา (เกณฑ์เดียวกับ SYNC_WINDOW_DAYS) */
const WINDOW_DAYS = 6

/**
 * ย้อนหลังเพิ่มจากวันที่พัสดุใบแรกถูกบันทึกในฐานเรา
 *
 * 🛑 จำเป็นเพราะ `OrderShipment.createdAt` ของใบ `source='LINKED'` คือ **วันที่ร้านกดผูก** ไม่ใช่
 * วันที่พัสดุถูกเปิดบน iShip ซึ่งเกิดก่อนหน้านั้นได้หลายวัน — ใช้ createdAt เป็นขอบหน้าต่างตรง ๆ
 * แล้วใบ LINKED จะหลุดออกนอกช่วงเงียบ ๆ (วัดจริง 2026-08-09: หาย 55 จาก 140 ใบ)
 */
const LOOKBACK_DAYS = 45

const prisma = new PrismaClient()

const isoDate = (d: Date) => d.toISOString().slice(0, 10)
const baht = (n: number) => n.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

/** ดึงพัสดุทั้งช่วงเวลาโดยซอยเป็นหน้าต่างละ 6 วัน แล้ว dedupe ด้วย track_no */
async function fetchAllRows(token: string, from: Date, to: Date): Promise<Map<string, IShipOrderRow>> {
  const byTrack = new Map<string, IShipOrderRow>()
  // เผื่อท้ายช่วง 1 วัน: พัสดุที่สร้างวันสุดท้ายต้องอยู่ในหน้าต่างสุดท้ายด้วย
  const end = new Date(to.getTime() + 24 * 60 * 60 * 1000)
  for (let cur = new Date(from); cur < end; cur = new Date(cur.getTime() + WINDOW_DAYS * 24 * 60 * 60 * 1000)) {
    const stop = new Date(Math.min(cur.getTime() + (WINDOW_DAYS - 1) * 24 * 60 * 60 * 1000, end.getTime()))
    let rows: IShipOrderRow[] = []
    try {
      rows = await queryOrders(token, isoDate(cur), isoDate(stop))
    } catch (e) {
      // หน้าต่างที่ล้มไม่ทำให้ทั้งงานล้ม — รายงานแล้วไปต่อ ดีกว่าได้ข้อมูลครึ่งเดียวแบบเงียบ ๆ
      console.log(`  ⚠ ${isoDate(cur)}..${isoDate(stop)} ล้มเหลว: ${e instanceof Error ? e.message : e}`)
      continue
    }
    for (const r of rows) if (r.track_no) byTrack.set(r.track_no, r)
    console.log(`  ${isoDate(cur)}..${isoDate(stop)} → ${rows.length} ใบ (สะสม ${byTrack.size})`)
  }
  return byTrack
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
        createdAt: true,
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

    const missing = shipments.filter((s) => s.carrierPrice === null)
    console.log(
      `  พัสดุที่เข้าเกณฑ์ ${shipments.length} ใบ · ยังไม่มีค่าส่งจริง ${missing.length} ใบ · ` +
        `ช่วง ${isoDate(shipments[0].createdAt)}..${isoDate(shipments[shipments.length - 1].createdAt)}`,
    )

    const token = decryptToken(acc.accessTokenEnc)
    const byTrack = await fetchAllRows(
      token,
      new Date(shipments[0].createdAt.getTime() - LOOKBACK_DAYS * 24 * 60 * 60 * 1000),
      shipments[shipments.length - 1].createdAt,
    )

    const planned: { id: string; label: string; data: Record<string, number> }[] = []
    let notFound = 0
    let viaGetOrder = 0

    for (const s of shipments) {
      let row = byTrack.get(s.trackingNo!)
      if (!row) {
        // ทางสำรองรายใบ — ใบที่ยังหลุดหน้าต่างแม้ย้อนไป 45 วัน (พัสดุที่เปิดบน iShip นานมาก
        // แล้วเพิ่งเอามาผูก)
        //
        // 🛑 ข้อห้าม "ห้ามยิง get_order รายใบ" ใน 00022 API.md บังคับกับ **รอบ sync ที่วนทุก 15 นาที**
        // ซึ่งจะกลายเป็นหลักร้อยคำขอต่อรอบ — สคริปต์นี้รันครั้งเดียวและยิงเฉพาะใบที่หาไม่เจอจริง
        // จึงไม่เข้าข่าย แต่ถ้าตัวเลขนี้บวมต้องกลับมาทบทวน (รายงานไว้ท้ายร้านเสมอ)
        try {
          const raw = (await getOrder(token, s.trackingNo!)) as IShipOrderRow
          if (raw && raw.track_no) {
            row = raw
            viaGetOrder += 1
          }
        } catch {
          /* ปล่อยให้ตกไปนับเป็น notFound */
        }
      }
      if (!row) {
        notFound += 1
        continue
      }
      const next = readCarrierCharges(row)
      const data: Record<string, number> = {}
      // null = "iShip ไม่ได้บอกรอบนี้" ไม่ใช่ "ค่านั้นถูกลบ" — ห้ามเขียนทับของเดิม
      if (next.carrierPrice !== null && Number(s.carrierPrice ?? NaN) !== next.carrierPrice)
        data.carrierPrice = next.carrierPrice
      if (next.actualWeight !== null && Number(s.actualWeight ?? NaN) !== next.actualWeight)
        data.actualWeight = next.actualWeight
      if (next.codFee !== null && Number(s.codFee ?? NaN) !== next.codFee) data.codFee = next.codFee
      if (Object.keys(data).length === 0) continue

      planned.push({
        id: s.id,
        label: `${s.order.orderNo ?? '-'} ${s.trackingNo}`,
        data,
      })
      if (data.carrierPrice) totalPrice += data.carrierPrice
      if (data.codFee) totalCodFee += data.codFee
    }

    console.log(
      `  ต้องอัปเดต ${planned.length} ใบ · ต้องยิง get_order รายใบ ${viaGetOrder} ใบ · ไม่พบใน iShip ${notFound} ใบ`,
    )
    // ตัวอย่างแถวจริงก่อนเขียนเสมอ — จำนวนรวมอย่างเดียวหลอกได้ (บทเรียน 2026-08-09)
    for (const p of planned.slice(0, 15)) {
      const parts = Object.entries(p.data).map(([k, v]) => `${k}=${v}`)
      console.log(`    ${p.label} → ${parts.join(' ')}`)
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
