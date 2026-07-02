/**
 * pacesConfirm — confirm/alert modal กลางของ (paces) seller/admin
 *
 * Hard Rule (safepay-ux #8): ทุก blocking modal dialog (confirm "ยืนยัน?", alert/result popup)
 * ในหน้า seller/admin ต้องใช้ Sweet Alerts (sweetalert2) — ห้าม window.confirm()/alert()/prompt()
 * และห้ามประดิษฐ์ card-overlay modal เอง. นี่คือ helper รวมศูนย์ "จุด restyle จุดเดียว"
 * mirror สถาปัตยกรรมของ pacesToast.
 *
 * เส้นแบ่งกับ pacesToast: เด้งมุมจอแล้วหายเอง (passive) → pacesToast; ต้องคลิกตอบ (blocking) → pacesConfirm.
 *
 * Base: theme/paces/Admin/TS/src/app/(admin)/plugins/sweet-alerts/components/SweetAlerts.tsx
 *   (showAlert(): Swal.fire({ buttonsStyling:false, customClass: btn bg-{semantic} ... }))
 * CSS: sweetalert2 base + src/assets/css/plugins/_sweetalert2.css (wired ใน app.css แล้ว)
 *
 * client-only: เรียกจาก event handler ใน 'use client' component เท่านั้น (Swal แตะ window/DOM)
 */
import Swal, { type SweetAlertIcon } from 'sweetalert2'

type ConfirmSemantic = 'danger' | 'primary' | 'warning' | 'success'

// customClass ปุ่มยืนยัน — ยึด Paces btn primitive (ห้าม arbitrary; bg-{semantic}-hover มีใน token)
const CONFIRM_BTN: Record<ConfirmSemantic, string> = {
  danger: 'btn bg-danger text-white hover:bg-danger-hover mt-2 me-2',
  primary: 'btn bg-primary text-white hover:bg-primary-hover mt-2 me-2',
  warning: 'btn bg-warning text-white hover:bg-warning-hover mt-2 me-2',
  success: 'btn bg-success text-white hover:bg-success-hover mt-2 me-2',
}
// ปุ่มยกเลิก = neutral (กดแล้วไม่ทำอะไร = safe action ไม่ใช่ destructive)
const CANCEL_BTN = 'btn bg-light hover:text-default-800 mt-2'

export interface PacesConfirmOptions {
  title: string
  text?: string
  /** rich HTML (เช่น มี <a>) — ใช้แทน text */
  html?: string
  icon?: SweetAlertIcon // 'warning' | 'question' | 'error' | 'info' | 'success'
  confirmButtonText?: string
  cancelButtonText?: string
  confirmSemantic?: ConfirmSemantic
  /** default false — กัน misclick dismiss สำหรับ danger; ตั้ง true ได้สำหรับ question/info */
  allowOutsideClick?: boolean
}

interface PacesConfirmFn {
  (options: PacesConfirmOptions): Promise<boolean>
  /** confirm อันตราย (ยกเลิก/ลบ) — icon warning, ปุ่มแดง */
  danger(title: string, text?: string, opts?: Partial<PacesConfirmOptions>): Promise<boolean>
  /** confirm เตือน — icon warning, ปุ่มเหลือง */
  warning(title: string, text?: string, opts?: Partial<PacesConfirmOptions>): Promise<boolean>
  /** confirm ถาม/ยืนยันทั่วไป — icon question, ปุ่ม primary */
  question(title: string, text?: string, opts?: Partial<PacesConfirmOptions>): Promise<boolean>
}

/** เปิด confirm modal — คืน true ถ้ากดยืนยัน, false ถ้า cancel/Esc/close */
const base = async (options: PacesConfirmOptions): Promise<boolean> => {
  const result = await Swal.fire({
    buttonsStyling: false,
    showCancelButton: true,
    allowOutsideClick: options.allowOutsideClick ?? false,
    icon: options.icon ?? 'warning',
    title: options.title,
    text: options.text,
    html: options.html,
    confirmButtonText: options.confirmButtonText ?? 'ยืนยัน',
    cancelButtonText: options.cancelButtonText ?? 'ยกเลิก',
    customClass: {
      confirmButton: CONFIRM_BTN[options.confirmSemantic ?? 'primary'],
      cancelButton: CANCEL_BTN,
    },
  })
  return result.isConfirmed
}

export interface PacesAlertOptions {
  title: string
  text?: string
  html?: string
  icon?: SweetAlertIcon
  confirmButtonText?: string
  confirmSemantic?: ConfirmSemantic
  /** default false — ค้างจนกดปุ่ม (result/announcement เช่น winner) */
  allowOutsideClick?: boolean
}

/** alert/result modal — ปุ่มเดียว ไม่มี cancel (รับทราบอย่างเดียว เช่น winner announcement feat 00007) */
export const pacesAlert = async (options: PacesAlertOptions): Promise<void> => {
  await Swal.fire({
    buttonsStyling: false,
    showCancelButton: false,
    allowOutsideClick: options.allowOutsideClick ?? false,
    icon: options.icon,
    title: options.title,
    text: options.text,
    html: options.html,
    confirmButtonText: options.confirmButtonText ?? 'ปิด',
    customClass: { confirmButton: CONFIRM_BTN[options.confirmSemantic ?? 'primary'] },
  })
}

export const pacesConfirm: PacesConfirmFn = Object.assign(base, {
  danger: (title: string, text?: string, opts?: Partial<PacesConfirmOptions>) =>
    base({ confirmSemantic: 'danger', icon: 'warning', ...opts, title, text }),
  warning: (title: string, text?: string, opts?: Partial<PacesConfirmOptions>) =>
    base({ confirmSemantic: 'warning', icon: 'warning', ...opts, title, text }),
  question: (title: string, text?: string, opts?: Partial<PacesConfirmOptions>) =>
    base({ confirmSemantic: 'primary', icon: 'question', ...opts, title, text }),
})
