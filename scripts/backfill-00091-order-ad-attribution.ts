/**
 * backfill-00091-order-ad-attribution — เติมแอดที่มาให้คำสั่งซื้อเก่า (00091 FR-005)
 *
 *   npx dotenv -e .env -- npx tsx scripts/backfill-00091-order-ad-attribution.ts            # dry-run (ค่าตั้งต้น) นับอย่างเดียว
 *   npx dotenv -e .env -- npx tsx scripts/backfill-00091-order-ad-attribution.ts --apply    # เขียนจริง
 *
 * 🛑 เขียนเฉพาะแถวที่ adId ยังว่าง (ไม่ทับ) · รันซ้ำได้ · ไม่ลบอะไรเลย
 * 🛑 ปฏิเสธถ้า DATABASE_URL ไม่ใช่ localhost — ยกเว้นใส่ `--i-know-this-is-prod` ชัด ๆ (Controller เป็นคนรันบน prod)
 */
import { backfillOrderAdAttribution } from '../src/services/order-ad-attribution.service'

const APPLY = process.argv.includes('--apply')
const PROD_OK = process.argv.includes('--i-know-this-is-prod')

function dbHost(): string {
  try {
    return new URL(process.env.DATABASE_URL ?? '').hostname
  } catch {
    return ''
  }
}

async function main() {
  const host = dbHost()
  const local = host === 'localhost' || host === '127.0.0.1'
  if (!local && !PROD_OK) {
    console.error(`ปฏิเสธ: DATABASE_URL host = "${host || 'ไม่ทราบ'}" ไม่ใช่ localhost — ถ้าตั้งใจรันบน prod ให้ใส่ --i-know-this-is-prod`)
    process.exit(1)
  }
  console.log(`${APPLY ? 'APPLY' : 'DRY-RUN'} · host=${host}`)
  const r = await backfillOrderAdAttribution({ apply: APPLY })
  console.log(`scanned=${r.scanned} matched=${r.matched} written=${r.written}`)
  if (!APPLY) console.log('(dry-run — ยังไม่เขียนอะไร · ใส่ --apply เพื่อเขียนจริง)')
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1) })
