/**
 * AssigneeWhoLine — บรรทัด "ผู้รับผิดชอบ" ใต้แถวงานบริการ (00086 P3 · T9 · BRD FR-008)
 *
 * Base: theme/paces/Admin/TS/src/app/(admin)/ui/list-group/page.tsx (บรรทัดรองในรายการ: ไอคอน + ข้อความเล็ก)
 *   in-repo sibling: orders/components/OrdersTable.tsx บรรทัด "บัญชีลูกค้า" (icon size-3.5 + truncate)
 *
 * ชิ้นเดียวใช้ 3 ที่ (AppointmentDayRows `showAssignee` · AppointmentDayCard · แถวรายการ /orders ของร้านบริการ)
 * ⇒ คำ/สี/ไอคอนตรงกันทุกจอ · ชื่อคนเปล่า ๆ ไม่เติม "ช่าง" (OOS-3)
 * "ยังไม่มีคนรับ" = warning-ink (ต้องมีคนทำ) ไม่ใช่แดง (Impeccable: Verified-Means-Green / ไม่ใช่ข้อผิดพลาด)
 *
 * 🛑 ผู้เรียกที่ประกอบ aria-label ของแถวเอง ต้องต่อ `assigneeAriaSuffix()` ด้วย — ชื่อจากผู้เขียนบนปุ่ม/ลิงก์
 *    แทนที่เนื้อในทั้งก้อน บรรทัดนี้จะไม่ถูกอ่านเลยถ้าลืม
 */
import Icon from '@/components/wrappers/Icon'
import { UNASSIGNED_LABEL } from '@/lib/technician-jobs'

export default function AssigneeWhoLine({
  name,
  className = 'mt-1',
}: {
  /** ชื่อผู้รับผิดชอบ · null = ยังไม่มีคนรับ */
  name: string | null
  /** ระยะ/ตำแหน่งจากผู้เรียก (ค่าตั้งต้น mt-1) */
  className?: string
}) {
  return (
    <span className={`flex min-w-0 items-center gap-1 text-xs text-default-700 ${className}`}>
      <Icon icon="user-cog" className="size-3.5 shrink-0 text-default-500" aria-hidden="true" />
      {name ? (
        <span className="truncate">{name}</span>
      ) : (
        <span className="text-warning-ink truncate font-semibold">{UNASSIGNED_LABEL}</span>
      )}
    </span>
  )
}
