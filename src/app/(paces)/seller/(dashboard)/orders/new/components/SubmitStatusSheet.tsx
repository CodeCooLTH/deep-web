'use client'

/**
 * SubmitStatusSheet — full-bleed status overlay ตอน submit ออเดอร์ (quick create)
 *
 * Base: theme/paces/Admin/TS/src/app/(admin)/plugins/sweet-alerts/components/SweetAlerts.tsx (loading/error content) +
 *       ProductPickerSheet.tsx (fixed-overlay pattern ในฟีเจอร์นี้ — bg-card, Icon wrapper, role dialog)
 *
 * HR8 override: user เลือก "full-bleed sheet" แทน Sweet Alerts อย่างชัดเจน (decision 2026-07-06) —
 *   blocking modal ปกติต้องใช้ Swal แต่เคสนี้ user ต้องการ overlay เต็มจอ centered.
 *
 * 2 state:
 *   - loading: spinner + "กำลังสร้างคำสั่งซื้อ" กลางจอ, block ทุกทาง (ระหว่างยิง POST — กันกดซ้ำ)
 *   - error:   error icon + ข้อความ (จาก server ถ้ามี ไม่งั้น fallback) + ปุ่ม "ปิดกลับไปแก้ไข"
 *              (กด → onDismiss ปิด sheet กลับฟอร์มเดิม ข้อมูลที่กรอกยังอยู่ครบ)
 * success คงพฤติกรรมเดิม (redirect) — sheet โชว์ loading ค้างจน router.push ทำงาน
 */

import Icon from '@/components/wrappers/Icon'

export type SubmitStatus = 'idle' | 'loading' | 'error'

interface Props {
  /**
   * ป้าย "การกระทำ" ตามประเภทกิจการ (feature 00030) — ไม่ส่ง = คำของ ONLINE_SALES
   *
   * ชื่อเดิมคือ `createLabel` ซึ่งชวนเข้าใจผิดว่าจอนี้ใช้เฉพาะตอนสร้าง — ความจริงฟอร์มเดียวกัน
   * ทำหน้าที่แก้ไขด้วย (PATCH) แล้วหัวข้อยังขึ้นว่า "สร้าง…ไม่สำเร็จ" ทำให้รายงานบั๊กจากจอนี้
   * ถูกอ่านผิดทาง (2026-08-11). ผู้เรียกเป็นคนตัดสินคำ — component นี้ไม่รู้จักโหมด
   */
  actionLabel?: string
  status: SubmitStatus
  /** ข้อความ error ภาษาคน — เลือกมาแล้วที่ผู้เรียกผ่าน pickApiErrorMessage (ห้ามเป็นรหัสดิบ) */
  errorMessage?: string
  /** รหัส error ไว้อ้างตอนแจ้งปัญหา — null/ไม่ส่ง = ไม่แสดงบรรทัดนี้ (ห้ามโชว์ "รหัสอ้างอิง: -") */
  errorCode?: string | null
  /** กด "ปิดกลับไปแก้ไข" → ปิด sheet (set status กลับ idle ที่ parent) */
  onDismiss: () => void
}

export default function SubmitStatusSheet({ status, errorMessage, errorCode, onDismiss, actionLabel = 'สร้างคำสั่งซื้อ' }: Props) {
  if (status === 'idle') return null

  const isError = status === 'error'

  return (
    // HR7 exception: fixed inset-0 full-bleed viewport-lock + z-100 (สูงสุด — บัง layout/footer/sheet/sidenav) — Paces ไม่มี token
    <div
      className="fixed inset-0 z-100 flex flex-col items-center justify-center bg-card px-6 pb-[env(safe-area-inset-bottom)] text-center"
      role="alertdialog"
      aria-live="assertive"
      aria-label={isError ? `${actionLabel}ไม่สำเร็จ` : `กำลัง${actionLabel}`}
    >
      {status === 'loading' && (
        <>
          <Icon icon="loader-2" className="size-12 animate-spin text-primary" aria-hidden="true" />
          <p className="mt-5 text-lg font-semibold text-dark">กำลัง{actionLabel}</p>
          <p className="mt-1 text-sm text-default-500">กรุณารอสักครู่...</p>
        </>
      )}

      {isError && (
        <>
          <span
            className="flex size-16 items-center justify-center rounded-full bg-danger/10"
            aria-hidden="true"
          >
            <Icon icon="alert-triangle" className="size-8 text-danger" />
          </span>
          <p className="mt-5 text-lg font-semibold text-dark">{actionLabel}ไม่สำเร็จ</p>
          <p className="mt-1 max-w-sm text-sm text-default-500">
            {errorMessage || 'กรุณาลองใหม่อีกครั้ง'}
          </p>
          {/* รหัสไว้อ้างตอนแจ้งปัญหา — เดิมรหัสนี้ถูกโยนขึ้นมาเป็น "ข้อความ" ให้ผู้ขายอ่านเอง
              ตรงนี้คือที่ของมัน: อ่านได้ถ้าต้องการ แต่ไม่แย่งความสนใจจากประโยคที่บอกทางออก
              ห้าม font-mono — บรรทัดนี้ผสมไทยกับอังกฤษ ต้องเป็น Anuphan ทั้งบรรทัด (HR5) */}
          {errorCode && (
            <p className="mt-2 text-2xs text-default-400">รหัสอ้างอิง: {errorCode}</p>
          )}
          <button
            type="button"
            onClick={onDismiss}
            className="btn mt-6 min-h-11 w-full max-w-xs bg-primary font-semibold text-white hover:bg-primary-hover"
          >
            ปิดกลับไปแก้ไข
          </button>
        </>
      )}
    </div>
  )
}
