/**
 * service-job-facts — ค่าที่การ์ด "งานนี้" + การ์ดรูปก่อน-หลัง ใช้ (feature 00086 P3) คำนวณที่ RSC จากแถวออเดอร์
 *
 * ใช้ร่วม 2 หน้า: orders/[token]/page.tsx (เจ้าของ/ผู้เห็นเงิน · แถวดิบ) และ TechnicianOrderDetail (ช่าง · ผล toNoMoneyOrder)
 * ⇒ อ่านเฉพาะคีย์ที่อยู่ใน allow-list ของ toNoMoneyOrder (assignedUser.id/displayName · serviceJobRecords · items[].name ·
 *   buyerName · buyer.displayName) — สองหน้าจึงได้ค่าตรงกันเป๊ะ และหน้าช่างไม่ต้องการคีย์ที่ถูกตัด
 * pure (ไม่มี prisma) — เทสได้ตรง
 */
import type { OrderEventView } from '@/lib/order-event'

export type ServiceJobRecordView = {
  phase: 'BEFORE' | 'AFTER'
  note: string | null
  fileIds: string[]
  createdAtISO: string
  /** ชื่อคนกด (ฝั่งร้านเท่านั้น) — null = บัญชีถูกลบ/ไม่รู้ */
  createdByName: string | null
}

/**
 * แปลงแถว (prisma/toNoMoneyOrder) → รูปที่การ์ด/ประวัติใช้ · ค่าแปลก (phase อื่น · fileIds ไม่ใช่อาเรย์) ถูกตัด
 * pure — RSC เรียกก่อนส่งข้ามขอบเขต (Date → ISO)
 */
export function toServiceJobRecordViews(rows: unknown): ServiceJobRecordView[] {
  if (!Array.isArray(rows)) return []
  const out: ServiceJobRecordView[] = []
  for (const r of rows as Array<Record<string, unknown>>) {
    if (!r || (r.phase !== 'BEFORE' && r.phase !== 'AFTER')) continue
    const created = r.createdAt instanceof Date ? r.createdAt : new Date(String(r.createdAt))
    const by = r.createdBy as { displayName?: string | null } | null | undefined
    out.push({
      phase: r.phase,
      note: typeof r.note === 'string' && r.note.trim() ? r.note : null,
      fileIds: Array.isArray(r.fileIds) ? (r.fileIds as unknown[]).filter((x): x is string => typeof x === 'string') : [],
      createdAtISO: Number.isNaN(created.getTime()) ? new Date(0).toISOString() : created.toISOString(),
      createdByName: by?.displayName ?? null,
    })
  }
  return out
}

type Row = Record<string, any> // eslint-disable-line @typescript-eslint/no-explicit-any

export type ServiceJobFacts = {
  assignee: { userId: string; name: string } | null
  startedByName: string | null
  finishedByName: string | null
  records: ServiceJobRecordView[]
  jobSummary: string | null
}

export function serviceJobFacts(order: Row, events: readonly Pick<OrderEventView, 'type' | 'actorLabel'>[]): ServiceJobFacts {
  const au = order.assignedUser as { id?: string; displayName?: string | null } | null | undefined
  const assignedId = (au?.id ?? order.assignedUserId ?? null) as string | null
  // ชื่อว่าง (บัญชีไม่ได้ตั้งชื่อ) → คำกลางเดียวกับ resolveActorLabel ของประวัติ
  const assignee = assignedId ? { userId: assignedId, name: au?.displayName?.trim() || 'สมาชิกร้าน' } : null
  // events เรียงใหม่→เก่า (getOrderEvents) ⇒ find = ครั้งล่าสุด
  const startedByName = events.find((e) => e.type === 'SERVICE_STARTED')?.actorLabel ?? null
  const finishedByName = events.find((e) => e.type === 'SERVICE_FINISHED')?.actorLabel ?? null
  const names = Array.isArray(order.items)
    ? (order.items as Array<{ name?: unknown }>).map((i) => (typeof i?.name === 'string' ? i.name : '')).filter(Boolean)
    : []
  const customer = (order.buyerName as string | null | undefined)?.trim() || order.buyer?.displayName || null
  const jobSummary = [names.join(', '), customer].filter(Boolean).join(' · ') || null
  return {
    assignee,
    startedByName,
    finishedByName,
    records: toServiceJobRecordViews(order.serviceJobRecords),
    jobSummary,
  }
}
