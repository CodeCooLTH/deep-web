'use client'

/**
 * InfoTip — ไอคอน info-circle ข้างหัวการ์ด เปิดคำอธิบาย/นิยามเมื่อ hover หรือ focus (00091 เฟส 3)
 * ทำไมต้องมี: user สั่งหน้ารายงานห้ามข้อความอธิบายยาว — นิยามย้ายมาไว้ตรงนี้แทน
 *
 * Base: theme/paces/Admin/TS/src/app/(admin)/ui/tooltips/page.tsx (Preline `hs-tooltip` + `hs-tooltip-toggle` + `hs-tooltip-content` bg-dark)
 * 🛑 ใช้ Preline hs-tooltip ตามธีม (มติ user "ปรับตามธีมทั้งหมด") — ความเสี่ยงที่ทราบ: Preline ผูกกับ DOM ตอน init ถ้า React แทนโหนดใหม่แล้ว tooltip อาจไม่ทำงาน
 *   (ดู docs/system/ui-guideline/paces-component-reference.md §3) · InfoTip อยู่ในหัวการ์ดที่ไม่ถูกสร้างใหม่ตอนสลับข้อมูล แต่ต้องดูในเบราว์เซอร์หลังสลับแท็บ
 * a11y: ปุ่มมี aria-label = ข้อความเต็ม (focus ด้วยคีย์บอร์ดอ่านได้แม้ tooltip ไม่เปิด)
 */
import Icon from '@/components/wrappers/Icon'
import { useT } from '@/i18n/LocaleProvider'

export default function InfoTip({ text }: { text: string }) {
  const t = useT().adRevenue
  return (
    <span className="hs-tooltip inline-block align-middle [--placement:top]"> {/* arbitrary: [--placement:top] = ตัวแปรของ Preline hs-tooltip (ธีมใช้เหมือนกัน ไม่มี token) */}
      <button type="button" aria-label={`${t.infoLabel}: ${text}`} className="hs-tooltip-toggle text-default-500 hover:text-default-800 flex size-11 lg:size-6 items-center justify-center rounded-full">
        <Icon icon="info-circle" className="text-base" aria-hidden="true" />
        <span className="hs-tooltip-content hs-tooltip-shown:opacity-100 hs-tooltip-shown:visible bg-dark invisible absolute z-10 inline-block w-64 rounded px-2 py-1 text-start text-sm font-medium whitespace-normal text-white opacity-0 shadow-2xs transition-opacity" role="tooltip">
          {text}
        </span>
      </button>
    </span>
  )
}
