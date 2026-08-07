'use client'

/**
 * DraftDirtyBar — แถบ "มีการเปลี่ยนแปลงที่ยังไม่บันทึก" (feature 00035, Task 7)
 *
 * Base: docs/superpowers/specs/2026-08-07-00034-builder-mockup-paces.html
 *   หัวข้อ "1 · จอหลัก (Desktop 1440)" บรรทัด dirty bar (`bg-warning/15 text-warning-ink
 *   border-warning/40 ... role="alert"`) — คัดลอก markup มาเป๊ะ ปรับแค่ผูก state/handler จริง
 *
 * ปุ่ม "บันทึก" ที่นี่กับปุ่ม Save บน FullscreenPageHeader ยิง submit เดียวกัน (form={formId}
 * เดียวกันทั้งคู่ — SDS TD-008) mockup ตั้งใจให้มีสองจุดพร้อมกันตอน dirty (คนละที่ ไม่ใช่ปุ่มซ้ำที่ guard
 * ไม่เท่ากันแบบที่เคยพลาดใน orders/new — ทั้งคู่ submit ฟอร์มเดียวกันเป๊ะ ไม่มี guard ต่างกัน)
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
      <button type="button" className="btn btn-sm text-warning-ink" onClick={onDiscard} disabled={saving}>
        ยกเลิก
      </button>
      <button
        type="submit"
        form={formId}
        disabled={saving}
        className="btn btn-sm bg-primary text-white hover:bg-primary-hover disabled:opacity-60"
      >
        {saving ? 'กำลังบันทึก...' : 'บันทึก'}
      </button>
    </div>
  )
}
