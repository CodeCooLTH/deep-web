/**
 * DeskLegend — สัญลักษณ์สี 2 แถวย่อย 8 รายการ (ลูกค้า 4 · โต๊ะ 4) ตามตาราง Design Spec §Legend
 *
 * Base: theme/paces/Admin/TS/src/app/(admin)/ui/badges/page.tsx (วงกลม tint + ไอคอนสี -ink) + ui/cards/page.tsx (card)
 * สีไม่ใช่ตัวบอกอย่างเดียว: ทุกรายการมีไอคอน · ไม่มีเขียว/ม่วง · ตัด "ต่อคิวหน้าโต๊ะ" (ไม่มีคิวในระบบ)
 * ใช้คำ "ตอบจากนอกระบบ" ตามมติ Controller ข้อ 5
 */
import Icon from '@/components/wrappers/Icon'

type Item = { icon: string; tint: string; label: string }

const CUSTOMER: Item[] = [
  { icon: 'walk', tint: 'bg-default-200 text-default-700', label: 'เดินเข้า/ออก' },
  { icon: 'clock', tint: 'bg-warning/15 text-warning-ink', label: 'รอคำตอบ' },
  { icon: 'messages', tint: 'bg-info/15 text-info-ink', label: 'ร้านเพิ่งตอบ (ภายใน 3 นาที)' },
  { icon: 'alert-triangle', tint: 'bg-danger/15 text-danger-ink', label: 'เกินเวลาตอบ' },
]
const DESK: Item[] = [
  { icon: 'user', tint: 'bg-primary/15 text-primary-ink', label: 'แอดมิน' },
  { icon: 'device-mobile', tint: 'bg-default-200 text-default-700', label: 'ตอบจากนอกระบบ' },
  { icon: 'sparkles', tint: 'bg-default-300 text-default-800', label: 'Meta AI / กล่องของเพจ' },
  { icon: 'robot', tint: 'bg-dark text-white', label: 'บอท Deep' },
]

function Row({ title, items }: { title: string; items: Item[] }) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
      <span className="text-default-900 w-10 font-semibold">{title}</span>
      {items.map((i) => (
        <span key={i.label} className="inline-flex items-center gap-1.5 whitespace-nowrap">
          <span className={`grid size-5 place-items-center rounded-full ${i.tint}`}>
            <Icon icon={i.icon} width={12} height={12} aria-hidden="true" />
          </span>
          {i.label}
        </span>
      ))}
    </div>
  )
}

export default function DeskLegend() {
  return (
    <div className="card text-default-700 space-y-1.5 px-3 py-2 text-xs">
      <Row title="ลูกค้า" items={CUSTOMER} />
      <Row title="โต๊ะ" items={DESK} />
    </div>
  )
}
