/**
 * backfill-image-variants — สร้างรูปย่อให้รูปที่อัปโหลดไว้ก่อนมี feature 00054
 *
 *   npx tsx scripts/backfill-image-variants.ts            # dry-run (ค่าตั้งต้น)
 *   npx tsx scripts/backfill-image-variants.ts --apply    # เขียนจริง
 *   npx tsx scripts/backfill-image-variants.ts --apply --limit 50
 *
 * 🛑 **สคริปต์นี้ไม่ลบและไม่เขียนทับอะไรทั้งสิ้น** — เขียนเฉพาะคีย์ `<ต้นฉบับ>.<variant>.webp`
 * ซึ่งเป็นคีย์ที่ยังไม่มีใครใช้ ไฟล์ต้นฉบับไม่ถูกแตะแม้แต่ไบต์เดียว
 * (กฎถาวรของ user: ห้ามลบอะไรโดยไม่บอกก่อน รวมสคริปต์ที่มีการลบซ่อนอยู่)
 * มีเทสสแกนซอร์สไฟล์นี้ยืนยันว่าไม่มีคำสั่งลบ — `src/lib/image-variants.guards.test.ts`
 *
 * 🛑 **ดึงรายชื่อจากคอลัมน์รูปสาธารณะเท่านั้น** ห้ามแตะ `VerificationRecord.documents`,
 * `TopUpRequest.slipFileId`, `Order.slipFileId`, `ScamReport.evidence`, `ChatMessage.imageUrl`
 * เหตุผล: ด่านสิทธิ์ทั้ง 5 ชั้นใน `/api/files/[...fileId]` ตรวจจาก **คีย์ต้นฉบับ** เท่านั้น ⇒
 * คีย์ของ variant เดินผ่านทุกด่านและถูกเสิร์ฟเป็นไฟล์สาธารณะ · สร้าง variant ให้เอกสาร KYC
 * หนึ่งครั้ง = เปิดเอกสารนั้นให้ใครก็ได้ที่เดาคีย์ถูก ถาวร
 *
 * รันซ้ำได้ — ไฟล์ที่มี variant ครบแล้วถูกข้าม (HEAD ก่อนดาวน์โหลดต้นฉบับ)
 */
import { PrismaClient } from '@prisma/client'

import { generateImageVariants } from '../src/services/image-variant.service'
import { canHaveVariants } from '../src/lib/image-variants'

const prisma = new PrismaClient()

const APPLY = process.argv.includes('--apply')
const limitArg = process.argv.indexOf('--limit')
const LIMIT = limitArg >= 0 ? Number(process.argv[limitArg + 1]) : Infinity

/**
 * ค่าที่ใช้ได้ = storage key ของบัคเก็ตเราเท่านั้น
 * ข้าม URL ภายนอก (อวาตาร์ Facebook) และ path ในเว็บ (`/images/badges/…` จาก seed)
 * — เราไม่ได้เป็นเจ้าของไฟล์เหล่านั้น จึงไม่มีอะไรให้ย่อ
 */
function usableKey(value: unknown): value is string {
  if (typeof value !== 'string' || value.length === 0) return false
  if (value.startsWith('http') || value.startsWith('/')) return false
  return canHaveVariants(value.split('.').pop() ?? '')
}

function pushAll(into: Set<string>, values: unknown) {
  if (Array.isArray(values)) {
    for (const v of values) if (usableKey(v)) into.add(v)
  } else if (usableKey(values)) {
    into.add(values)
  }
}

async function collectKeys(): Promise<string[]> {
  const keys = new Set<string>()

  const [products, rooms, shops, users] = await Promise.all([
    prisma.product.findMany({ select: { images: true } }),
    prisma.room.findMany({ select: { images: true } }),
    prisma.shop.findMany({ select: { logo: true, coverImage: true } }),
    prisma.user.findMany({ select: { avatar: true } }),
  ])

  for (const p of products) pushAll(keys, p.images)
  for (const r of rooms) pushAll(keys, r.images)
  for (const s of shops) {
    pushAll(keys, s.logo)
    pushAll(keys, s.coverImage)
  }
  for (const u of users) pushAll(keys, u.avatar)

  return [...keys]
}

async function main() {
  const keys = await collectKeys()
  const targets = keys.slice(0, LIMIT === Infinity ? undefined : LIMIT)

  console.log(`พบรูปที่เข้าเกณฑ์ ${keys.length} ไฟล์` + (targets.length < keys.length ? ` (จำกัดรอบนี้ ${targets.length})` : ''))

  if (!APPLY) {
    console.log('\n[dry-run] ยังไม่เขียนอะไรลง storage — ใส่ --apply เพื่อทำจริง')
    console.log('ตัวอย่างคีย์ที่จะถูกสร้าง:')
    for (const k of targets.slice(0, 5)) {
      console.log(`  ${k}`)
      console.log(`    → ${k.replace(/\.[^./]+$/, '')}.thumb.webp`)
      console.log(`    → ${k.replace(/\.[^./]+$/, '')}.lg.webp`)
    }
    console.log('\nไฟล์ต้นฉบับจะไม่ถูกแตะแม้แต่ไบต์เดียว — สคริปต์นี้เขียนเฉพาะคีย์ใหม่')
    return
  }

  let created = 0
  let skipped = 0
  let failed = 0
  let done = 0

  for (const key of targets) {
    const result = await generateImageVariants(key, { skipExisting: true })
    created += result.created.length
    skipped += result.skipped.length
    failed += result.failed.length
    done++
    if (done % 25 === 0) {
      console.log(`  … ${done}/${targets.length} (สร้าง ${created} · ข้าม ${skipped} · ไม่สำเร็จ ${failed})`)
    }
  }

  console.log(
    `\nเสร็จ: ไฟล์ต้นฉบับ ${done} ใบ → สร้าง variant ${created} · ข้ามที่มีอยู่แล้ว ${skipped} · สร้างไม่ได้ ${failed}`,
  )
  console.log('“สร้างไม่ได้” เป็นสถานะปกติ (รูปเล็กจนย่อแล้วใหญ่กว่าเดิม / ไฟล์เสีย) — หน้าจอจะใช้ต้นฉบับแทนเอง')
}

main()
  .catch((e) => {
    console.error(e)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
