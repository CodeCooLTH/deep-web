// 00095 — ด่านรูปของชิ้น IMAGES (security HIGH: IDOR) · ใช้ทั้งตอนบันทึกบอท (bot.service) และตอนส่ง (S-4 sender ต้องเรียกซ้ำก่อนยิง)
//
// ปัญหา: ระบบไม่มีทะเบียนไฟล์กลาง — fileId เป็นแค่ storage key ถ้าไม่ตรวจ ร้าน A ใส่ fileId ของร้านอื่น
// (รวม KYC/สลิปที่ /api/files กั้นอยู่) แล้วบอทส่งออกช่องทางลูกค้าได้
// กติกา: (1) รูปแบบต้องเป็นคีย์ที่ newFileId สร้าง (หรือแบบแบนเก่า uuid.ext) (2) ต้องอยู่ในแหล่งที่ผูกร้านนี้อย่างน้อยหนึ่งแหล่ง
// ไม่เข้าเลย = PART_IMAGE_NOT_FOUND (ไม่บอกว่าเป็นของร้านอื่น)
import 'server-only'
import type { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { SALES_FOLLOW_LIMITS } from '@/lib/sales-follow-bot/constants'
import { SalesFollowBotValidationError } from '@/lib/sales-follow-bot/errors'
import type { BotIssue, BotStep } from '@/lib/sales-follow-bot/schemas'

type Db = Prisma.TransactionClient | typeof prisma

const UUID = '[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}'
/** `YYYY/MM/DD/<uuid>.<ext>` (newFileId ใน storage/types.ts) หรือแบบแบนเก่า `<uuid>.<ext>` (ก่อนชาร์ดโฟลเดอร์ — file-url.ts) */
const FILE_ID_RE = new RegExp(`^(?:\\d{4}/\\d{2}/\\d{2}/)?${UUID}\\.[A-Za-z0-9]{1,10}$`)

/** รูปแบบเท่านั้น — ปฏิเสธ `..` · URL · `/api/files/` · query · ยาวเกินก่อนแตะฐาน */
export function isValidImageFileId(id: unknown): id is string {
  return (
    typeof id === 'string' &&
    id.length <= SALES_FOLLOW_LIMITS.maxIdLength &&
    !id.includes('..') &&
    !id.includes('?') &&
    !/^https?:/i.test(id) &&
    !id.startsWith('/') &&
    FILE_ID_RE.test(id)
  )
}

/**
 * fileId (ที่รูปแบบถูก) ที่เป็นของร้านนี้ — 4 query เป็นชุด ไม่ N+1
 * แหล่ง: ข้อความสำเร็จรูป · คลังไฟล์ลูกค้า · MediaAsset (ไฟล์ที่ร้านอัปโหลดผ่าน /api/uploads/commit) ·
 * รูปที่ **ร้านเอง** ส่งในแชทของร้านนี้ (senderRole='SHOP' — 🛑 ห้ามนับรูปที่ลูกค้าส่ง: ลูกค้าอาจส่งเอกสารส่วนตัว)
 */
export async function findOwnedImageIds(db: Db, shopId: string, fileIds: string[]): Promise<Set<string>> {
  const ids = [...new Set(fileIds.filter(isValidImageFileId))]
  const owned = new Set<string>()
  if (ids.length === 0) return owned
  const [qms, files, assets, msgs] = await Promise.all([
    db.quickMessage.findMany({
      where: { shopId, OR: [{ imageFileIds: { hasSome: ids } }, { imageFileId: { in: ids } }] },
      select: { imageFileIds: true, imageFileId: true },
    }),
    db.customerFile.findMany({ where: { shopId, fileId: { in: ids } }, select: { fileId: true } }),
    db.mediaAsset.findMany({ where: { shopId, fileId: { in: ids } }, select: { fileId: true } }),
    db.chatMessage.findMany({
      where: { imageUrl: { in: ids }, senderRole: 'SHOP', conversation: { shopId } },
      select: { imageUrl: true },
    }),
  ])
  for (const q of qms) for (const f of [...q.imageFileIds, q.imageFileId]) if (f) owned.add(f)
  for (const f of files) owned.add(f.fileId)
  for (const a of assets) owned.add(a.fileId)
  for (const m of msgs) if (m.imageUrl) owned.add(m.imageUrl)
  return new Set(ids.filter((i) => owned.has(i)))
}

/**
 * ทุกรูปของชิ้น IMAGES ที่ **เพิ่มใหม่** (ไม่อยู่ใน allowIds = fileId ที่บอทเดิมถืออยู่แล้ว) ต้องผ่านด่าน — ไม่ผ่าน = ValidationError
 * ที่ stepIndex/partIndex ของชิ้นนั้น · allowIds ข้ามทั้งรูปแบบและเจ้าของ (บันทึกเดิมที่ผ่านมาแล้ว ไม่ทำให้แก้ชื่อบอทไม่ได้)
 */
export async function assertOwnedImages(db: Db, shopId: string, steps: BotStep[], allowIds: ReadonlySet<string> = new Set()): Promise<void> {
  const wanted = steps.flatMap((s) => s.parts.flatMap((p) => (p.kind === 'IMAGES' ? p.fileIds.filter((f) => !allowIds.has(f)) : [])))
  if (wanted.length === 0) return
  const owned = await findOwnedImageIds(db, shopId, wanted)
  const issues: BotIssue[] = []
  steps.forEach((s, i) =>
    s.parts.forEach((p, j) => {
      if (p.kind === 'IMAGES' && p.fileIds.some((f) => !allowIds.has(f) && !owned.has(f)))
        issues.push({ code: 'PART_IMAGE_NOT_FOUND', path: `steps.${i}.parts.${j}.fileIds`, stepIndex: i, partIndex: j })
    }),
  )
  if (issues.length > 0) throw new SalesFollowBotValidationError(issues)
}
