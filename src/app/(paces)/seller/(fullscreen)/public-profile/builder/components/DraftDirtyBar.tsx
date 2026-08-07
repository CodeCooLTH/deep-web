'use client'

/**
 * DraftDirtyBar — แถบ "มีการเปลี่ยนแปลงที่ยังไม่บันทึก" (feature 00035)
 *
 * Base: docs/superpowers/specs/2026-08-07-00035-builder-mockup-paces.html
 *   หัวข้อ "1 · จอหลัก (Desktop 1440)" บรรทัด dirty bar (`bg-warning/15 text-warning-ink
 *   border-warning/40 ... role="alert"`) — คัดลอก markup มาเป๊ะ ปรับแค่ผูก state/handler จริง
 *
 * ปุ่ม "บันทึก" ที่นี่กับปุ่ม Save บน FullscreenPageHeader ยิง submit เดียวกัน (form={formId}
 * เดียวกันทั้งคู่ — SDS TD-008) mockup ตั้งใจให้มีสองจุดพร้อมกันตอน dirty (คนละที่ ไม่ใช่ปุ่มซ้ำที่ guard
 * ไม่เท่ากันแบบที่เคยพลาดใน orders/new — ทั้งคู่ submit ฟอร์มเดียวกันเป๊ะ ไม่มี guard ต่างกัน)
 *
 * รื้อ canvas (2026-08-07 รอบสอง) — ย้ายมา render เป็น `belowContent` ของ FullscreenPageHeader
 * (BuilderToolbar.tsx เป็นคนเรียก) แทนที่จะเป็น sibling แยกใน BuilderClient.tsx: เดิม header
 * (sticky + negative-margin trick) กับแถบนี้เป็นคนละกล่องที่คำนวณตำแหน่งแยกกัน วัดจริงบน prod
 * แล้วทับกัน 32px (เหลือเห็นแค่ 17px) — ย้ายเข้ามาอยู่ใน sticky wrapper เดียวกับ header ตัดปัญหานี้
 * ที่ต้นเหตุ (คนละกล่องที่ "ควรจะ" เรียงต่อกันพอดี → กลายเป็นกล่องเดียวกันจริง ๆ)
 *
 * tap target: ปุ่มเดิมใช้ `btn-sm` (~32px) — critique วัดจริงบน prod แล้วต่ำกว่า 44px ตัด `btn-sm`
 * ออก ใช้ขนาด `.btn` ปกติของ Paces แทน (เดียวกับปุ่ม Save บน FullscreenPageHeader ที่ถูกอยู่แล้ว)
 */
import Icon from '@/components/wrappers/Icon'

export type DraftDirtyBarProps = {
  formId: string
  saving: boolean
  onDiscard: () => void
}

export default function DraftDirtyBar({ formId, saving, onDiscard }: DraftDirtyBarProps) {
  return (
    <div
      className="bg-warning/15 text-warning-ink border-warning/40 -mx-4 px-4 md:-mx-8 md:px-8 flex shrink-0 items-center gap-2 border-b py-2 text-sm"
      role="alert"
    >
      <Icon icon="alert-triangle" className="text-base" aria-hidden="true" />
      <span className="flex-1">มีการเปลี่ยนแปลงที่ยังไม่บันทึก</span>
      <button type="button" className="btn text-warning-ink min-h-11" onClick={onDiscard} disabled={saving}>
        ยกเลิก
      </button>
      <button
        type="submit"
        form={formId}
        disabled={saving}
        className="btn bg-primary min-h-11 text-white hover:bg-primary-hover disabled:opacity-60"
      >
        {saving ? 'กำลังบันทึก...' : 'บันทึก'}
      </button>
    </div>
  )
}
