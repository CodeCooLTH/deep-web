/**
 * Base: theme/paces/Admin/TS/src/app/(admin)/ui/notifications/page.tsx (Paces toast markup)
 *
 * pacesToast — helper รวมศูนย์ของ toast/notification ฝั่งหลังบ้าน (paces) seller/admin.
 * แทน `react-toastify` ทั้งหมดใน src/app/(paces)/** (ดู Hard Rule "Toast-Paces").
 *
 * ทำไม event bus (CustomEvent บน window) ไม่ใช่ React Context:
 *   caller (CopyLinkButton, ShipForm, ...) อยู่ใน subtree ที่ deep-nested — event bus
 *   เรียกได้แบบ flat `pacesToast.success(msg)` ไม่ต้อง prop-drill/Context และเข้ากับ
 *   mental model ของ Preline (ใช้ window event เช่นกัน). PacesToastContainer (mount จุดเดียว
 *   ใน AppProvidersWrapper) subscribe event นี้แล้ว render เป็น Paces markup.
 */

export type PacesToastType = 'success' | 'error' | 'warning' | 'info'

/**
 * placement ตาม "แหล่งที่มา" ของ toast (กำหนดโดย user):
 *   - 'top-right'    = alert จากการกดปุ่ม/action ใด ๆ (default)
 *   - 'bottom-right' = alert จากระบบ chat
 */
export type PacesToastPlacement = 'top-right' | 'bottom-right'

export interface PacesToastOptions {
  /** อายุ toast ก่อน auto-dismiss (ms). default 3000; 0 = ไม่ปิดอัตโนมัติ */
  duration?: number
  /** มุมที่จะแสดง — default 'top-right' (action) */
  placement?: PacesToastPlacement
}

export interface PacesToastDetail {
  type: PacesToastType
  message: string
  duration: number
  placement: PacesToastPlacement
}

/** ชื่อ CustomEvent ที่ PacesToastContainer subscribe */
export const PACES_TOAST_EVENT = 'paces:toast'

const DEFAULT_DURATION = 3000

function emit(type: PacesToastType, message: string, options?: PacesToastOptions) {
  // SSR guard — helper ถูก import ใน client component แต่กันไว้กรณีเรียกตอน prerender
  if (typeof window === 'undefined') return

  const detail: PacesToastDetail = {
    type,
    message,
    duration: options?.duration ?? DEFAULT_DURATION,
    placement: options?.placement ?? 'top-right',
  }
  window.dispatchEvent(new CustomEvent<PacesToastDetail>(PACES_TOAST_EVENT, { detail }))
}

/** บังคับ placement = bottom-right ให้ namespace chat (ทับค่าที่ caller ส่งมา) */
const chatEmit = (type: PacesToastType, message: string, options?: PacesToastOptions) =>
  emit(type, message, { ...options, placement: 'bottom-right' })

/**
 * pacesToast — toast/alert รวมศูนย์ของหลังบ้าน (paces).
 *   - `pacesToast.success(...)` ฯลฯ  → top-right (alert จาก action/ปุ่ม)
 *   - `pacesToast.chat.success(...)` → bottom-right (alert จากระบบ chat)
 */
export const pacesToast = {
  success: (message: string, options?: PacesToastOptions) => emit('success', message, options),
  error: (message: string, options?: PacesToastOptions) => emit('error', message, options),
  warning: (message: string, options?: PacesToastOptions) => emit('warning', message, options),
  info: (message: string, options?: PacesToastOptions) => emit('info', message, options),
  /** toast จากระบบ chat → bottom-right เสมอ */
  chat: {
    success: (message: string, options?: PacesToastOptions) => chatEmit('success', message, options),
    error: (message: string, options?: PacesToastOptions) => chatEmit('error', message, options),
    warning: (message: string, options?: PacesToastOptions) => chatEmit('warning', message, options),
    info: (message: string, options?: PacesToastOptions) => chatEmit('info', message, options),
  },
}
