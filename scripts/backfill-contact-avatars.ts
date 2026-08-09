/**
 * backfill รูปโปรไฟล์ผู้ติดต่อในกล่องแชท (feature 00018 ส่วนขยาย 2026-08-09)
 *
 * ที่มา 2 อย่างที่เกิดพร้อมกัน:
 *   1. `getContactProfile` ฝั่ง Messenger ไม่เคยลอง User Profile API เลย — คอมเมนต์เก่าสรุปว่า
 *      "ยิงตรงไม่ได้" จากการทดสอบกับลูกค้าอย่างเดียว แต่คนที่ **มี role บนแอป** ยิงได้จริง
 *      (วัดแล้ว: ลูกค้าสุ่ม 30 คน → 400 ครบ 30 · เจ้าของแอป → 200 พร้อม profile_pic ทั้ง 3 เพจ)
 *   2. รูปที่ดึงได้ถูกเก็บเป็น URL ดิบของ Meta ซึ่งฝังเวลาหมดอายุมาใน `oe=` — รูป IG ที่เก็บไว้
 *      5 ส.ค. กลายเป็น HTTP 403 ตอน 9 ส.ค. แล้วตกไปตัวอักษรย่อโดยไม่มีอะไรฟ้อง
 *
 * สคริปต์นี้เดินซ้ำเส้นทางเดียวกับ ingest (เรียก `getContactProfile` + `mirrorRemoteImage` ตัวจริง
 * จาก repo ไม่ใช่โค้ดเลียนแบบ) กับ contact ที่ยัง "ไม่มีรูปที่เรียบร้อย"
 *
 * สำคัญ: dry-run เป็นค่าตั้งต้น — ต้องใส่ `--apply` ถึงจะเขียนจริง
 * สำคัญ: อ่าน/เขียนเฉพาะ `avatarUrl` + `avatarSyncedAt` ของ ExternalContact เท่านั้น ไม่แตะชื่อ
 *    (ชื่อที่มีอยู่มาจาก /me/conversations ซึ่งถูกอยู่แล้ว — ทับด้วยผลที่อาจว่างคือถอยหลัง)
 * สำคัญ: ประทับ `avatarSyncedAt` แม้ดึงไม่ได้ เพื่อไม่ให้ ingest ไปยิงซ้ำทันทีในรอบเดียวกัน
 *
 * รันซ้ำได้เรื่อย ๆ — และ **ควรรันอีกครั้งในวันที่ Business Asset User Profile Access
 * ผ่าน Advanced Access** เพราะตอนนั้นลูกค้าทุกคนจะเริ่มมีรูปให้ดึง
 *
 * ใช้:
 *   npx dotenv -e <env> -- npx tsx scripts/backfill-contact-avatars.ts
 *   npx dotenv -e <env> -- npx tsx scripts/backfill-contact-avatars.ts --apply
 *   npx dotenv -e <env> -- npx tsx scripts/backfill-contact-avatars.ts --apply --limit 50
 */
import { PrismaClient } from '@prisma/client'
import { getContactProfile } from '../src/lib/facebook/graph'
import { decryptToken } from '../src/lib/token-crypto'
import { mirrorRemoteImage } from '../src/services/channel-chat.service'

const prisma = new PrismaClient()

const APPLY = process.argv.includes('--apply')
const limitArg = process.argv.indexOf('--limit')
const LIMIT = limitArg > -1 ? Number(process.argv[limitArg + 1]) : Infinity
/** ยิงทีละน้อยกัน rate limit ของ Graph — ingest ปกติยิงทีละคนอยู่แล้ว สคริปต์ไม่ควรแรงกว่า */
const BATCH = 4

type Row = {
  id: string
  name: string | null
  avatarUrl: string | null
  externalUserId: string
  channel: { provider: string; name: string; accessTokenEnc: string; status: string }
}

async function handle(row: Row) {
  const token = decryptToken(row.channel.accessTokenEnc)
  const profile = await getContactProfile(row.externalUserId, token, row.channel.provider)
  if (!profile.avatarUrl) return { id: row.id, ok: false as const }

  // dry-run ต้องไม่เขียน storage — mirrorRemoteImage เรียก saveFile จริง จะทิ้งไฟล์กำพร้าไว้
  // ทุกครั้งที่ซ้อมรัน (ค่าที่อยากรู้ตอน dry-run คือ "มีรูปให้ดึงกี่คน" ซึ่งรู้ได้ก่อนถึงขั้น mirror)
  const fileId = APPLY ? await mirrorRemoteImage(profile.avatarUrl) : null
  // mirror ไม่ผ่านก็เก็บ URL ดิบไว้ก่อน (เห็นรูปวันนี้ดีกว่าไม่เห็น) — ค่าที่ขึ้นต้น http จะถูก
  // ingest มองว่ายังไม่เรียบร้อยแล้วลองอัปเกรดใหม่เองตามรอบ
  return { id: row.id, ok: true as const, value: fileId ?? profile.avatarUrl, mirrored: !!fileId }
}

async function main() {
  const rows = (await prisma.externalContact.findMany({
    where: {
      channel: { status: 'ACTIVE' },
      // "ยังไม่มีรูปที่เรียบร้อย" = ไม่มีเลย หรือมีแต่เป็น URL ของ Meta ที่หมดอายุได้
      OR: [{ avatarUrl: null }, { avatarUrl: { startsWith: 'http' } }],
    },
    select: {
      id: true,
      name: true,
      avatarUrl: true,
      externalUserId: true,
      channel: { select: { provider: true, name: true, accessTokenEnc: true, status: true } },
    },
    orderBy: { createdAt: 'desc' },
  })) as Row[]

  const targets = rows.slice(0, LIMIT === Infinity ? rows.length : LIMIT)
  console.log(`contact ที่ยังไม่มีรูปเรียบร้อย: ${rows.length} · จะประมวลผลรอบนี้ ${targets.length}`)
  console.log(APPLY ? '>>> โหมดเขียนจริง\n' : '>>> dry-run (ใส่ --apply เพื่อเขียนจริง)\n')

  let got = 0
  let mirrored = 0
  const now = new Date()

  for (let i = 0; i < targets.length; i += BATCH) {
    const chunk = targets.slice(i, i + BATCH)
    const results = await Promise.all(
      chunk.map((r) => handle(r).catch(() => ({ id: r.id, ok: false as const }))),
    )

    for (const res of results) {
      const row = chunk.find((c) => c.id === res.id)!
      if (res.ok) {
        got++
        if (res.mirrored) mirrored++
        console.log(`  ได้รูป  ${row.channel.provider} ${row.name ?? row.externalUserId}${res.mirrored ? '' : ' (mirror ไม่ผ่าน เก็บ URL ดิบ)'}`)
        if (APPLY) {
          await prisma.externalContact.update({
            where: { id: row.id },
            data: { avatarUrl: res.value, avatarSyncedAt: now },
          })
        }
      } else if (APPLY) {
        await prisma.externalContact.update({
          where: { id: row.id },
          data: { avatarSyncedAt: now },
        })
      }
    }
    console.log(`  … ${Math.min(i + BATCH, targets.length)}/${targets.length}`)
  }

  console.log(`\nสรุป: ได้รูป ${got}/${targets.length} (mirror สำเร็จ ${mirrored}) · ไม่ได้ ${targets.length - got}`)
  if (got === 0) {
    console.log(
      'ไม่ได้สักคนเป็นเรื่องปกติตอนนี้ — Meta ให้รูปเฉพาะคนที่มี role บนแอป\n' +
        'จนกว่า Business Asset User Profile Access จะผ่าน Advanced Access',
    )
  }
  await prisma.$disconnect()
}

main().catch(async (e) => {
  console.error('backfill ล้มเหลว:', e)
  await prisma.$disconnect()
  process.exit(1)
})
