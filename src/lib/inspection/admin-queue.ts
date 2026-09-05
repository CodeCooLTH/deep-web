// admin-queue.ts — ตัวชี้วัดงานค้างของทีมปฏิบัติการ (feature 00060 · T10 · API §4.14)
//
// 🛑 **ตัวเลขรวมตัวเดียวใช้ไม่ได้** — สองค่านี้บอกปัญหาคนละอย่างและมีทางแก้คนละทาง:
//    `overdueUnassigned` สูง = ไม่มีคนกดมอบหมาย (คิวตันที่โต๊ะแอดมิน) แก้ด้วยคนในทีม
//    `overdueAssigned` สูง = มอบหมายแล้วผู้ตรวจทำไม่ทัน แก้ด้วยการหาผู้ตรวจเพิ่ม/เปลี่ยนตัว
//    หรือลดโควตารับสมัคร ⇒ ยุบเป็น "งานค้าง 16 รอบ" เมื่อไร ทีมจะแก้ผิดทาง
//
// 🛑 แยกตามขั้น/วิธีตรวจสำคัญพอกัน — `ONSITE` ตันด้วยเหตุผลทางภูมิศาสตร์ที่ `DOCUMENT` ไม่มีวันเจอ

export const DUE_SOON_DAYS = 7
const MS_PER_DAY = 24 * 60 * 60 * 1000

export type OpenRoundRow = {
  step: number
  method: string
  dueAt: Date | null
  inspectorUserId: string | null
}

export type BacklogBucket = {
  step: number
  method: string
  overdueUnassigned: number
  overdueAssigned: number
  dueSoon: number
}

/**
 * นับงานค้างจากรอบที่ยัง `completedAt IS NULL` เท่านั้น (ผู้เรียกกรองมาแล้ว)
 * 🛑 รอบที่ไม่มี `dueAt` (สร้างด้วยมือแบบ ad-hoc โดยไม่กำหนดวัน) ไม่นับทั้งสามช่อง —
 *    ไม่มีกำหนดให้เลยจึงยังไม่เลยกำหนด และการนับมันเป็น "ใกล้ถึงกำหนด" ก็เป็นการเดาแทนคน
 */
export function buildBacklog(rounds: readonly OpenRoundRow[], now: Date): BacklogBucket[] {
  const byKey = new Map<string, BacklogBucket>()
  const soonEdge = now.getTime() + DUE_SOON_DAYS * MS_PER_DAY

  for (const r of rounds) {
    if (r.dueAt === null) continue
    const key = `${r.step}::${r.method}`
    const bucket = byKey.get(key) ?? {
      step: r.step,
      method: r.method,
      overdueUnassigned: 0,
      overdueAssigned: 0,
      dueSoon: 0,
    }
    const due = r.dueAt.getTime()
    if (due < now.getTime()) {
      if (r.inspectorUserId === null) bucket.overdueUnassigned += 1
      else bucket.overdueAssigned += 1
    } else if (due <= soonEdge) {
      bucket.dueSoon += 1
    }
    byKey.set(key, bucket)
  }

  return [...byKey.values()]
    .filter((b) => b.overdueUnassigned + b.overdueAssigned + b.dueSoon > 0)
    .sort((a, b) => a.step - b.step || a.method.localeCompare(b.method))
}
