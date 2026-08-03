'use client'

/**
 * CustomerPanelSheet — Customer Panel บนจอเล็ก (<1024px) feat 00018 T5
 *
 * Base: src/app/(paces)/seller/(dashboard)/orders/components/OrderQrSheet.tsx (Base ของมันเอง:
 * theme/paces/Admin/TS/src/app/(admin)/ui/offcanvas/page.tsx (offcanvasBottom) +
 * theme/paces/Admin/TS/src/app/(admin)/ui/modals/page.tsx (#standard-modal centered — desktop))
 * reuse โครง responsive bottom-sheet(<lg)/modal(≥lg) ทั้งชุด (scrim, grip, close, React-state
 * ไม่ใช้ Preline hs-overlay เพราะ trigger อยู่ใน composer ที่ re-render บ่อย) แทนที่เนื้อหา QR
 * ด้วย CustomerPanelBody (แชร์กับ CustomerPanel.tsx desktop กันโค้ดซ้ำ)
 *
 * เปิดจากปุ่ม "ข้อมูลลูกค้า" ที่ composer ของ ChatThread.tsx (<1024px เท่านั้น — desktop ใช้
 * CustomerPanel.tsx แบบ persistent column แทน ไม่ผ่าน sheet นี้)
 *
 * max-height ผูก dvh (viewport height หน่วย dvh): ไม่มี token ความสูงอิง viewport ใน Tailwind
 * scale ของ Paces (เหตุผลเดียวกับ safe-area-inset ที่ Base OrderQrSheet.tsx ใช้อยู่แล้ว) —
 * จำเป็นเพราะเนื้อหา (รายการออเดอร์/การจอง) ยาวไม่คงที่ต่างจาก QR ที่ความสูงคงที่ ต้องกันล้นจอ
 * มือถือด้วย scroll ภายใน ไม่ใช่ค่าที่เดาเอง (Hard Rule 7 carve-out พร้อม comment กำกับที่บรรทัดใช้จริง)
 */
import { useEffect } from 'react'
import Icon from '@/components/wrappers/Icon'
import { CustomerPanelBody, type CustomerPanelData } from './CustomerPanel'

type Props = {
  data: CustomerPanelData
  onClose: () => void
}

export default function CustomerPanelSheet({ data, onClose }: Props) {
  // ESC ปิด (เหมือนทุก sheet ในแอป — precedent OrderQrSheet.tsx)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    // HR7: z-80 = viewport overlay lock (Paces ไม่มี token; precedent OrderQrSheet.tsx/AccountSwitcherSheet.tsx)
    <div
      className="fixed inset-0 z-80 flex items-end justify-center lg:items-center"
      role="dialog"
      aria-modal="true"
      aria-label="ข้อมูลลูกค้า"
    >
      {/* scrim — คลิกเพื่อปิด (precedent AccountSwitcherSheet/OrderQrSheet) */}
      <button
        type="button"
        aria-label="ปิด"
        onClick={onClose}
        className="absolute inset-0 bg-default-900/40 backdrop-blur-xs"
      />

      {/* panel — มือถือ: bottom-sheet เต็มกว้าง scroll ภายใน · desktop: modal กลาง max-w-sm */}
      {/* lg:h-[80dvh] (ไม่ใช่ max-h): user report 2026-08-01 ว่าสลับแท็บแล้วกล่องขยับความสูง —
          แท็บ "ข้อมูลลูกค้า" ยาวกว่า "โน้ต" หลายเท่า พอเป็น max-h กล่องจึงหดตามเนื้อหาทุกครั้งที่กด
          ตำแหน่งแท็บเลื่อนหนีนิ้ว. ตรึงความสูงในโหมด modal (≥1024px) แล้วให้เนื้อหาเลื่อนข้างในแทน
          มือถือยังเป็น max-h เหมือนเดิม เพราะ bottom-sheet สูงคงที่ทั้งที่เนื้อหาสั้นจะบังจอเปล่า ๆ */}
      <div className="relative max-h-[85dvh] w-full overflow-y-auto rounded-t-2xl bg-card pb-[calc(env(safe-area-inset-bottom)+1.25rem)] pt-2 shadow-lg lg:h-[80dvh] lg:w-full lg:max-w-sm lg:rounded-2xl lg:pb-6 lg:pt-5"> {/* HR7 carve-out: ไม่มี token viewport-height/safe-area ใน Paces scale — precedent OrderQrSheet.tsx บรรทัดเดียวกัน */}
        {/* grip (มือถือเท่านั้น) */}
        <div className="mx-auto mb-3 h-1 w-9 rounded-full bg-default-300 lg:hidden" />

        <div className="mb-2 flex items-center justify-between px-4">
          <h3 className="text-base font-bold text-default-900">ข้อมูลลูกค้า</h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="ปิด"
            className="btn btn-icon text-default-700 hover:bg-default-100"
          >
            <Icon icon="x" className="text-lg" />
          </button>
        </div>

        <CustomerPanelBody data={data} />
      </div>
    </div>
  )
}
