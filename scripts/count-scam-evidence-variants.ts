/**
 * นับรูปย่อ (variant) ของหลักฐานแจ้งมิจฉาชีพที่หลุดด่านสิทธิ์ไปแล้ว — **อ่านอย่างเดียว ไม่ลบอะไรเลย**
 *
 *   npx tsx scripts/count-scam-evidence-variants.ts
 *
 * ที่มา (2026-10-01 · spec docs/superpowers/specs/2026-10-01-image-compress-upload-design.md):
 * `ReportForm` เคยอัปหลักฐานด้วย purpose IMAGE → `/api/uploads/commit` สร้าง `.thumb.webp`/`.lg.webp`
 * ข้างต้นฉบับ แต่ด่าน scam-evidence (PDPA) ใน `/api/files` ตรวจจาก **คีย์ต้นฉบับ** เท่านั้น
 * คีย์ของ variant จึงถูกเสิร์ฟเป็นไฟล์สาธารณะ · โค้ดแก้แล้ว (อัปเป็น DOCUMENT) แต่ไฟล์ที่สร้างไปแล้วยังอยู่
 *
 * 🛑 สคริปต์นี้ไม่มีคำสั่งลบโดยเจตนา (กฎถาวร: ห้ามลบอะไรโดยไม่บอกก่อน) — ให้ user ดูตัวเลขแล้วตัดสินเอง
 */

import { PrismaClient } from '@prisma/client'

import { getFileMeta } from '../src/lib/storage'
import { canHaveVariants, variantKey, type ImageVariant } from '../src/lib/image-variants'

const prisma = new PrismaClient()
const VARIANTS: ImageVariant[] = ['thumb', 'lg']

async function main() {
  const reports = await prisma.scamReport.findMany({ select: { id: true, evidence: true } })

  let evidenceFiles = 0
  const leaked: Array<{ reportId: string; key: string }> = []

  for (const report of reports) {
    const keys = Array.isArray(report.evidence) ? (report.evidence as unknown[]) : []
    for (const key of keys) {
      if (typeof key !== 'string' || key.startsWith('http') || key.startsWith('/')) continue
      evidenceFiles++
      if (!canHaveVariants(key.split('.').pop() ?? '')) continue
      for (const v of VARIANTS) {
        const vk = variantKey(key, v)
        if (await getFileMeta(vk)) leaked.push({ reportId: report.id, key: vk })
      }
    }
  }

  console.log(`รายงานทั้งหมด ${reports.length} · ไฟล์หลักฐาน ${evidenceFiles} · variant ที่หลุด ${leaked.length}`)
  const affected = new Set(leaked.map((l) => l.reportId))
  console.log(`รายงานที่มี variant หลุด ${affected.size} รายการ`)
  for (const l of leaked) console.log(`  ${l.reportId}  ${l.key}`)
}

main()
  .catch((err) => {
    console.error(err)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
