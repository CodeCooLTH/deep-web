/**
 * ReportEmptyState — หน้าว่าง "ยังไม่มีกลุ่มรายงาน" (สอนวิธีใช้ + ตัวอย่างข้อความจริง) · RSC
 *
 * Base: theme/paces/Admin/TS/src/app/(admin)/ui/cards/page.tsx (CardWithHeader: .card-header + .card-body)
 * + src/app/(paces)/seller/(dashboard)/business/components/QuotaUsageCard.tsx (หัวการ์ด + ปุ่มขวา)
 *
 * 375 = CTA ก่อน ตัวอย่างท้าย · md = 3 ขั้นเรียงข้าง · lg = 2 คอลัมน์ (ซ้ายข้อความ+CTA+ขั้นแนวตั้ง ขวาตัวอย่าง)
 * คำเรียกใบใช้คำกลาง "รายการ" เพราะยังไม่มีร้านที่เลือก — ห้ามพิมพ์คำเรียกใบของ vertical ใด vertical หนึ่งตายตัว
 */
import AddGroupButton, { CREATE_BLOCKED_ID } from './AddGroupButton'
import SampleBubble from './SampleBubble'

const STEPS = ['เพิ่มบอทเข้ากลุ่ม LINE', 'เลือกร้านแล้วรับโค้ดผูก 8 ตัวจากหน้านี้', 'พิมพ์โค้ดในกลุ่ม แล้วตั้งเวลาส่ง'] as const

export default function ReportEmptyState({ blockedReason, now }: { blockedReason: string | null; now: Date }) {
  return (
    <div className="card mb-base">
      <div className="card-header">
        <h4 className="card-title">กลุ่มรายงานของฉัน</h4>
      </div>
      <div className="card-body grid gap-6 lg:grid-cols-2">
        <div className="min-w-0">
          <h5 className="text-default-800 mb-1.5 text-md font-semibold">ยังไม่มีกลุ่มรายงาน</h5>
          <p className="text-default-700 mb-4 text-sm">
            ให้บอท Deep รายงานสรุปยอดของร้านเข้ากลุ่ม LINE ของทีมคุณทุกวันหรือทุกเดือน ไม่ต้องเปิดแอปดูทีละร้าน
          </p>
          <div className="sm:inline-block">
            <AddGroupButton canCreate={blockedReason === null} label="เพิ่มกลุ่มแรก" />
          </div>
          {blockedReason && (
            <p id={CREATE_BLOCKED_ID} className="text-default-700 mt-2 mb-0 text-xs">
              {blockedReason}
            </p>
          )}
          <ol className="mt-6 grid gap-3 md:grid-cols-3 lg:grid-cols-1">
            {STEPS.map((text, i) => (
              <li key={text} className="flex items-start gap-2.5">
                <span className="bg-primary/15 text-primary flex size-7 shrink-0 items-center justify-center rounded-full text-sm font-semibold">
                  {i + 1}
                </span>
                <span className="text-default-800 pt-0.5 text-sm">{text}</span>
              </li>
            ))}
          </ol>
        </div>
        <SampleBubble now={now} />
      </div>
    </div>
  )
}
