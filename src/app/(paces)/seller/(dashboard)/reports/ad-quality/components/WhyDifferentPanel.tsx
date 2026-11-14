'use client'

/**
 * WhyDifferentPanel — 4 สาเหตุที่ แชท (Meta) กับ แชท (Deep) ไม่เท่ากัน (BR-AIQ-04 · ข้อความคงที่ ไม่ชี้ว่าแอดไหนเป็นเพราะอะไร)
 *
 * Base: theme/paces/Admin/TS/src/app/(admin)/ui/accordions/page.tsx (แผงยุบ/ขยายในการ์ด — inline ไม่ใช่ modal · ไม่ใช่กล่อง blocking จึงไม่ใช้ Sweet Alerts)
 *   ปุ่ม: `btn btn-sm border-default-300` + aria-expanded/aria-controls · กล่องแผง: ท่า `bg-default-100 rounded px-4 py-3` ของ ui/alerts/page.tsx
 * ใช้ state ของ React (ไม่ใช้ hs-accordion ของ Preline) — แผงนี้ถูกเปิดจากสองที่ (ปุ่มหัวการ์ด + บรรทัด "มี {n} แอดที่ส่วนต่างสูง") จึงต้องคุมจากข้างนอก
 */
import { useT } from '@/i18n/LocaleProvider'

export default function WhyDifferentPanel({ id }: { id: string }) {
  const t = useT().adQuality
  return (
    <div id={id} className="bg-default-100 text-default-800 mx-5 mb-3 rounded px-4 py-3">
      <ol className="mb-0 list-decimal space-y-1.5 ps-5 text-sm">
        <li>{t.why1}</li>
        <li>{t.why2}</li>
        <li>{t.why3}</li>
        <li>{t.why4}</li>
      </ol>
    </div>
  )
}
