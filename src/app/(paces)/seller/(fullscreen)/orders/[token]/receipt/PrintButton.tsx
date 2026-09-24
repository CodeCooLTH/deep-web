'use client'

/**
 * ปุ่มพิมพ์ใบเสร็จ — `window.print()` ในหน้าเดิม (บันทึก PDF ได้จากหน้าต่างพิมพ์ของระบบ)
 * Base: theme/paces/Admin/TS/src/app/(admin)/apps/invoice/details/page.tsx (ปุ่ม Print)
 */
import Icon from '@/components/wrappers/Icon'

export default function PrintButton() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="btn bg-primary text-white hover:bg-primary-hover min-h-11 gap-2 font-semibold"
    >
      <Icon icon="printer" className="size-4" aria-hidden="true" />
      พิมพ์ / บันทึก PDF
    </button>
  )
}
