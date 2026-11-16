/**
 * 00095 preflight — นับผลกระทบก่อนเปิดบอทติดตามยอดขายให้ร้านหนึ่ง (TFR-FB-23 · BR-FB-82 · TC-500) · อ่านอย่างเดียว ไม่มี --apply
 *
 *   DATABASE_URL=… npx tsx scripts/sales-follow-bot-preflight.ts [--shop <id>]...      # รันกับฐานที่ชี้
 *   npx tsx scripts/sales-follow-bot-preflight.ts [--shop <id>]... --print-sql          # พิมพ์ SELECT ล้วน ไม่ต่อ DB
 *
 * prod: เครื่อง dev ไม่มี DATABASE_URL ของ prod → ใช้ --print-sql แล้วยิงผ่าน Supabase Management API แบบอ่านอย่างเดียวเอง
 * ไม่พิมพ์ชื่อ/เบอร์/ข้อความลูกค้า (มีแต่ตัวเลขต่อร้าน/ช่องทาง) · ทุก SQL ผ่าน assertReadOnlySql + ธุรกรรม READ ONLY ของ Postgres อีกชั้น
 */
import { PrismaClient } from '@prisma/client'
import { assertReadOnlySql, buildPreflightQueries, dbHost } from './sales-follow-bot-lib'

function parseShops(argv: string[]): string[] {
  const out: string[] = []
  argv.forEach((a, i) => {
    if (a === '--shop' && argv[i + 1]) out.push(argv[i + 1])
  })
  return out
}

function printTable(rows: Record<string, unknown>[]): void {
  if (rows.length === 0) return void console.log('  (ไม่มีแถว = 0)')
  const cols = Object.keys(rows[0])
  const w = cols.map((c) => Math.max(c.length, ...rows.map((r) => String(r[c]).length)))
  const line = (cells: string[]) => '  ' + cells.map((s, i) => s.padEnd(w[i])).join('  ')
  console.log(line(cols))
  console.log(line(w.map((n) => '-'.repeat(n))))
  rows.forEach((r) => console.log(line(cols.map((c) => String(r[c])))))
}

async function main() {
  const argv = process.argv.slice(2)
  const queries = buildPreflightQueries(parseShops(argv))
  queries.forEach((q) => assertReadOnlySql(q.sql))

  if (argv.includes('--print-sql')) {
    console.log('-- 00095 preflight · SELECT ล้วน · ยิงทีละก้อน (ถ้า timeout ให้ระบุ --shop ทีละร้าน)\n')
    for (const q of queries) console.log(`-- ${q.key}: ${q.title}\n-- ${q.note}\n${q.sql};\n`)
    return
  }

  const prisma = new PrismaClient()
  try {
    console.log(`PREFLIGHT (อ่านอย่างเดียว) · host=${dbHost(process.env.DATABASE_URL) || 'ไม่ทราบ'}`)
    for (const q of queries) {
      // READ ONLY ระดับ DB = กันชั้นสอง ต่อให้ guard ข้างบนหลุด
      const rows = await prisma.$transaction(async (tx) => {
        await tx.$executeRawUnsafe('SET TRANSACTION READ ONLY')
        await tx.$executeRawUnsafe(`SET LOCAL statement_timeout = '60s'`)
        return tx.$queryRawUnsafe<Record<string, unknown>[]>(q.sql)
      })
      console.log(`\n${q.title}\n  ${q.note}`)
      printTable(rows)
    }
  } finally {
    await prisma.$disconnect()
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e)
  process.exit(1)
})
