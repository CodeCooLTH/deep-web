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
import { type SweetAlertIcon } from 'sweetalert2'

/**
 * โหลด sweetalert2 ตอนจะใช้จริง ไม่ใช่ตอนโหลดหน้า (Impeccable optimize 2026-08-04)
 *
 * วัดจาก build จริง: sweetalert2 = 76.3 KB raw / 20.3 KB gzip และมันเคยอยู่ใน first-load
 * ของทุกหน้าที่ import helper นี้ ทั้งที่ผู้ใช้ส่วนใหญ่ไม่ได้กดปุ่มที่เปิด confirm เลยสักครั้ง
 * ในหนึ่งครั้งที่เข้าหน้า
 *
 * ทำได้แบบไม่เปลี่ยนสัญญาเพราะทางเข้าสาธารณะทุกตัว (pacesConfirm/.danger/.warning/.question,
 * pacesAlert) คืน Promise อยู่แล้ว — ผู้เรียกทุกที่ await อยู่แล้ว ไม่มีใครต้องแก้
 * type import ถูกลบตอน compile จึงไม่ลากอะไรลงมา
 *
 * CSS ของ sweetalert2 ยัง wire ผ่าน app.css เหมือนเดิม (ไม่ได้อยู่ใน chunk นี้) หน้าตาจึงไม่เปลี่ยน
 */
const loadSwal = async () => (await import('sweetalert2')).default

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
  const Swal = await loadSwal()
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
  const Swal = await loadSwal()
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

/**
 * pacesConfirmWithReason — confirm ที่บังคับให้เลือกเหตุผลก่อนยืนยัน (feature 00039)
 *
 * ทำไมไม่ใช้ pacesConfirm ธรรมดา: helper นั้นคืนแค่ boolean รับ input ไม่ได้
 * และการขยาย signature ของมันให้รองรับ generic input จะทำให้ API ซับซ้อนขึ้นเพื่อ use-case เดียว
 * จึงแยกเป็นฟังก์ชันของตัวเอง แต่ **ใช้ class ปุ่มชุดเดียวกัน** (CONFIRM_BTN/CANCEL_BTN)
 * เพื่อไม่ให้โมดัลนี้หน้าตาต่างจากโมดัลอื่นในระบบ
 *
 * Base: theme/paces/Admin/TS/src/app/(admin)/plugins/sweet-alerts/components/SweetAlerts.tsx
 *   + pattern ที่ใช้จริงอยู่แล้วใน bookings/[token]/components/BookingDetail.tsx (input:'select')
 *
 * คืน string = เหตุผลที่เลือก · null = ผู้ใช้กดยกเลิก
 */
export const pacesConfirmWithReason = async (options: {
  title: string
  html?: string
  options: readonly { value: string; label: string }[]
  placeholder?: string
  validationMessage: string
  confirmButtonText?: string
  cancelButtonText?: string
}): Promise<string | null> => {
  const Swal = await loadSwal()
  const inputOptions = options.options.reduce<Record<string, string>>((acc, o) => {
    acc[o.value] = o.label
    return acc
  }, {})

  const result = await Swal.fire({
    buttonsStyling: false,
    allowOutsideClick: false,
    icon: 'warning',
    title: options.title,
    html: options.html,
    input: 'select',
    inputOptions,
    inputPlaceholder: options.placeholder ?? 'เลือกเหตุผล',
    // บังคับเลือกก่อน — ไม่ปิดโมดัล ไม่ยิง request ถ้ายังไม่เลือก
    inputValidator: (value) => (value ? undefined : options.validationMessage),
    showCancelButton: true,
    confirmButtonText: options.confirmButtonText ?? 'ยืนยัน',
    cancelButtonText: options.cancelButtonText ?? 'ไม่ใช่ตอนนี้',
    customClass: { confirmButton: CONFIRM_BTN.danger, cancelButton: CANCEL_BTN },
  })

  return result.isConfirmed && typeof result.value === 'string' ? result.value : null
}

/**
 * เหมือน `pacesConfirmWithReason` ทุกอย่าง ต่างที่รับ **ข้อความอิสระ** แทนการเลือกจากลิสต์
 *
 * ใช้เมื่อเหตุผลไม่ใช่ชุดค่าคงที่ — เช่นตีกลับใบงานของ Command Center (00049 FR-CC-05)
 * ที่ต้องบอก *สิ่งที่ต้องแก้* ให้ agent ขั้นถัดไปอ่าน ซึ่งเขียนเป็น dropdown ไม่ได้
 * วางติดกับตัวเดิมในไฟล์เดียวกันโดยตั้งใจ (UX spec §9 ข้อ 2) เพื่อให้คนที่มาหาอันหนึ่งเห็นอีกอัน
 *
 * คืน string = ข้อความที่กรอก (trim แล้ว) · null = ผู้ใช้กดยกเลิก
 */
export const pacesConfirmWithText = async (options: {
  title: string
  html?: string
  placeholder?: string
  validationMessage: string
  confirmButtonText?: string
  cancelButtonText?: string
  maxLength?: number
}): Promise<string | null> => {
  const Swal = await loadSwal()

  const result = await Swal.fire({
    buttonsStyling: false,
    allowOutsideClick: false,
    icon: 'warning',
    title: options.title,
    html: options.html,
    input: 'textarea',
    inputPlaceholder: options.placeholder ?? 'พิมพ์เหตุผล',
    inputAttributes: { maxlength: String(options.maxLength ?? 2000) },
    // บังคับกรอกก่อน — ไม่ปิดโมดัล ไม่ยิง request ถ้ายังว่าง
    // (ตีกลับโดยไม่มีเหตุผล = ใบที่ขั้นถัดไปรับต่อแล้วไม่รู้ว่าต้องแก้อะไร)
    inputValidator: (value) =>
      value && value.trim() ? undefined : options.validationMessage,
    showCancelButton: true,
    confirmButtonText: options.confirmButtonText ?? 'ยืนยัน',
    cancelButtonText: options.cancelButtonText ?? 'ไม่ใช่ตอนนี้',
    customClass: { confirmButton: CONFIRM_BTN.danger, cancelButton: CANCEL_BTN },
  })

  return result.isConfirmed && typeof result.value === 'string' ? result.value.trim() : null
}

export const pacesConfirm: PacesConfirmFn = Object.assign(base, {
  danger: (title: string, text?: string, opts?: Partial<PacesConfirmOptions>) =>
    base({ confirmSemantic: 'danger', icon: 'warning', ...opts, title, text }),
  warning: (title: string, text?: string, opts?: Partial<PacesConfirmOptions>) =>
    base({ confirmSemantic: 'warning', icon: 'warning', ...opts, title, text }),
  question: (title: string, text?: string, opts?: Partial<PacesConfirmOptions>) =>
    base({ confirmSemantic: 'primary', icon: 'question', ...opts, title, text }),
})

/**
 * pacesEditTextFields — โมดัลแก้ค่าข้อความ 2 ช่อง (ชื่อ + โน้ต) สำหรับคลังไฟล์ (feature 00048)
 *
 * ทำไมต้องมีตัวใหม่แทนใช้ `input:'text'` ของ Swal: Swal รองรับ input ได้ช่องเดียวต่อโมดัล
 * ส่วนงานนี้ต้องแก้ 2 ค่าพร้อมกัน — ประกอบ html เองแล้วอ่านค่ากลับใน preConfirm
 *
 * 🛑 ช่องกรอกใช้ `h-11` (44px) ตรง ๆ ไม่พึ่ง `.form-input` เพราะคลาสนั้นเป็น `h-11 lg:h-9.25`
 * และ `lg:` เป็น **viewport query ไม่ใช่ container query** — โมดัลนี้ถูกเปิดจากคอลัมน์กว้าง 384px
 * บนจอกว้าง จึงจะได้ช่องสูง 37px ทั้งที่นิ้วมีที่แตะเท่ามือถือ
 * (docs/conventions/unlayered-css-beats-utilities.md)
 *
 * คืน null = ผู้ใช้กดยกเลิก
 */
export const pacesEditTextFields = async (options: {
  title: string
  nameLabel: string
  noteLabel: string
  notePlaceholder?: string
  nameValue: string
  noteValue: string
  nameMaxLength: number
  noteMaxLength: number
  confirmButtonText: string
  cancelButtonText: string
}): Promise<{ name: string; note: string } | null> => {
  const Swal = await loadSwal()
  const esc = (s: string) =>
    s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

  const result = await Swal.fire({
    buttonsStyling: false,
    title: options.title,
    html: `
      <div class="text-start">
        <label for="paces-edit-name" class="text-default-700 mb-1 block text-xs">${esc(options.nameLabel)}</label>
        <input id="paces-edit-name" type="text" maxlength="${options.nameMaxLength}"
               class="border-default-300 text-default-900 mb-3 h-11 w-full rounded-lg border px-3 text-sm"
               value="${esc(options.nameValue)}" />
        <label for="paces-edit-note" class="text-default-700 mb-1 block text-xs">${esc(options.noteLabel)}</label>
        <textarea id="paces-edit-note" maxlength="${options.noteMaxLength}"
                  placeholder="${esc(options.notePlaceholder ?? '')}"
                  class="border-default-300 text-default-900 min-h-24 w-full rounded-lg border px-3 py-2 text-sm">${esc(options.noteValue)}</textarea>
      </div>`,
    focusConfirm: false,
    showCancelButton: true,
    confirmButtonText: options.confirmButtonText,
    cancelButtonText: options.cancelButtonText,
    customClass: { confirmButton: CONFIRM_BTN.primary, cancelButton: CANCEL_BTN },
    preConfirm: () => ({
      name: (document.getElementById('paces-edit-name') as HTMLInputElement | null)?.value ?? '',
      note: (document.getElementById('paces-edit-note') as HTMLTextAreaElement | null)?.value ?? '',
    }),
  })

  return result.isConfirmed && result.value ? (result.value as { name: string; note: string }) : null
}
