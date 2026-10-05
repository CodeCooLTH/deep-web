/**
 * CommandsCard — คำสั่งที่พิมพ์ในกลุ่ม LINE ได้เอง (สรุปวันนี้ / สรุปเดือนนี้) · คัดลอกได้
 *
 * Base: theme/paces/Admin/TS/src/app/(admin)/ui/cards/page.tsx (.card)
 *   + src/app/(paces)/seller/(dashboard)/orders/[token]/components/CopyLinkButton.tsx (ปุ่มคัดลอกกลาง — ไม่เปิดโหมดพรีวิวของปุ่ม: ฟอนต์ monospace ในนั้นฆ่า Anuphan)
 *
 * ไม่มีตัวควบคุมตั้งค่าในการ์ดนี้ — เป็นข้อมูลอ่านอย่างเดียว + ปุ่มคัดลอก
 */
import CopyLinkButton from '@/app/(paces)/seller/(dashboard)/orders/[token]/components/CopyLinkButton'

const COMMANDS = [
  { text: 'สรุปวันนี้', hint: 'ส่งสรุปยอดของวันนี้เข้ากลุ่มทันที' },
  { text: 'สรุปเดือนนี้', hint: 'ส่งสรุปยอดของรอบเดือนนี้ (นับตามวันตัดรอบ) เข้ากลุ่มทันที' },
] as const

export default function CommandsCard() {
  return (
    <section className="card rounded-xl border border-default-300 shadow-sm order-5">
      <div className="card-header">
        <h5 className="card-title">พิมพ์ในกลุ่มได้เลย</h5>
      </div>
      <div className="card-body">
        <ul role="list" className="m-0 flex list-none flex-col gap-3 p-0">
          {COMMANDS.map((c) => (
            <li key={c.text} className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <span className="bg-primary/10 text-primary rounded-full px-3 py-1 text-sm font-medium">{c.text}</span>
              <CopyLinkButton value={c.text} label="คัดลอก" successMessage="คัดลอกคำสั่งแล้ว" />
              <span className="text-default-700 w-full text-xs">{c.hint}</span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}
