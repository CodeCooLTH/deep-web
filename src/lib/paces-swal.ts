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
import { formatDateTime } from '@/lib/format-date'
import {
  PARCEL_CLOSE_META,
  PARCEL_CLOSE_REASONS,
  PARCEL_CLOSE_REASON_LABEL,
  type ParcelCloseOutcome,
  type ParcelCloseReason,
} from '@/lib/parcel-close'

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
  /**
   * โฟกัสเริ่มต้นไปที่ปุ่ม "ยกเลิก" แทนปุ่มยืนยัน (default false = โฟกัสปุ่มยืนยันตามเดิม)
   *
   * 🛑 ใช้กับการกระทำที่กระทบหลายแถวพร้อมกัน — กด Enter ค้างมาจากจอก่อนหน้าไม่ควรยืนยันงานที่
   * ย้อนกลับได้ทีละแถวเท่านั้น. ไม่ตั้งเป็น default ให้ทุก confirm เพราะ confirm ส่วนใหญ่ในระบบ
   * เป็นการกระทำใบเดียวที่ผู้ใช้ตั้งใจกดมาแล้ว การบังคับให้ต้อง Tab อีกทีคือแรงเสียดทานเปล่า ๆ
   */
  focusCancel?: boolean
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
    focusCancel: options.focusCancel ?? false,
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

/**
 * pacesConfirmAsync — confirm ที่ "ทำงานจริง" ต่อในตัวโมดัลเอง แล้วคืนผลของงานนั้น
 *
 * ทำไมต้องมีตัวนี้แทน `pacesConfirm` + fetch ข้างนอก: `pacesConfirm` คืน boolean แล้วปิดโมดัลทันที
 * ⇒ ช่วงที่งานจริงกำลังทำงาน (ยิง API 0.5–2 วิ) **ไม่มีที่ให้แสดงสถานะและไม่มีอะไรกันกดซ้ำ**
 * ผู้ใช้เห็นโมดัลปิดไปเฉย ๆ แล้วจอนิ่ง — ซึ่งอ่านได้ทั้ง "เสร็จแล้ว" และ "ค้าง"
 *
 * `showLoaderOnConfirm` + `preConfirm` ของ Swal ทำสามอย่างให้ฟรี: สปินเนอร์บนปุ่มยืนยัน ·
 * ปิดปุ่มยกเลิกระหว่างทำงาน · กันกดยืนยันซ้ำ
 *
 * 🛑 `run()` throw = **โมดัลไม่ปิด** ขึ้นข้อความแดงในตัวโมดัลแล้วกดใหม่ได้ทันที — สงวนไว้ให้
 * "ยิงไม่ถึงปลายทาง" (เน็ตหลุด/500) เท่านั้น. ผลลัพธ์เชิงธุรกิจที่ปลายทาง *ตอบมาแล้วว่าไม่ให้*
 * ต้อง `return` ค่าปกติออกไปให้ผู้เรียกจัดการ ไม่ใช่ throw — สองอย่างนี้มีขั้นตอนต่อไปคนละทาง
 * (อันหนึ่ง "กดอีกที" อีกอันหนึ่ง "ไปทำอย่างอื่น") ถ้ารวมกันผู้ใช้จะถูกเชิญให้กดวนสิ่งที่ไม่มีวันผ่าน
 *
 * คืน `null` = ผู้ใช้กดยกเลิก/Esc (ไม่ใช่ "งานล้มเหลว")
 */
export const pacesConfirmAsync = async <T>(options: {
  title: string
  text?: string
  confirmButtonText?: string
  cancelButtonText?: string
  confirmSemantic?: ConfirmSemantic
  icon?: SweetAlertIcon
  /** ข้อความที่ขึ้นในโมดัลเมื่อ `run()` throw — ต้องบอกขั้นตอนต่อไป ไม่ใช่แค่ชื่ออาการ */
  errorText: string
  run: () => Promise<T>
}): Promise<T | null> => {
  const Swal = await loadSwal()
  const result = await Swal.fire({
    buttonsStyling: false,
    showCancelButton: true,
    allowOutsideClick: false,
    focusCancel: false,
    icon: options.icon ?? 'question',
    title: options.title,
    text: options.text,
    confirmButtonText: options.confirmButtonText ?? 'ยืนยัน',
    cancelButtonText: options.cancelButtonText ?? 'ยกเลิก',
    customClass: {
      confirmButton: CONFIRM_BTN[options.confirmSemantic ?? 'primary'],
      cancelButton: CANCEL_BTN,
    },
    showLoaderOnConfirm: true,
    preConfirm: async () => {
      try {
        return await options.run()
      } catch {
        Swal.showValidationMessage(options.errorText)
        return undefined
      }
    },
  })
  // isConfirmed=false → ยกเลิก · value=undefined → run() throw แล้ว Swal เปิดค้างอยู่จนผู้ใช้ปิดเอง
  if (!result.isConfirmed || result.value === undefined) return null
  return result.value as T
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

/**
 * pacesConfirmWithPassword — confirm ที่ขอรหัสผ่านก่อน แล้ว "ทำงานจริง" ต่อในตัวโมดัลเอง
 * (feature 00062, U19 — เปลี่ยนบัญชีรับเงินของร้านที่มีอยู่แล้วต้อง reauth ตาม BR-BANK-02)
 *
 * โครงเดียวกับ `pacesConfirmAsync` เป๊ะ (showLoaderOnConfirm + preConfirm + throw=ไม่ปิดโมดัล)
 * ต่างแค่มี input รหัสผ่านให้กรอกก่อนกด "ยืนยัน" — ไม่ขยาย `pacesConfirmAsync` ให้รับ input
 * เพราะจะเปลี่ยน signature ที่ผู้เรียกเดิม (ไม่มี password) ทุกจุดไปด้วย
 *
 * 🛑 `run()` throw = โมดัลไม่ปิด ขึ้นข้อความในตัวโมดัลแล้วกดรหัสผ่านใหม่ได้ทันที — ตรงกับที่
 * UX spec §A6 ต้องการ ("REAUTH_FAILED → error ในโมดัลเอง ไม่ปิดโมดัล") `Swal.showValidationMessage`
 * ของ sweetalert2 เขียนด้วย innerHTML ภายใน (ไม่ใช่ textContent) — ข้อความจึงใส่ `<a href>`
 * เป็นทางออกได้จริงเมื่อจำเป็น (เช่น REAUTH_UNAVAILABLE ต้องชี้ทางไปตั้งรหัสผ่าน/เบอร์ที่ /account
 * ไม่ใช่แค่บอกว่าทำไม่ได้) — ผู้เรียกเป็นคนประกอบ HTML ใน message เอง ฟังก์ชันนี้ไม่ escape ให้
 *
 * คืน `null` = ผู้ใช้กดยกเลิก/Esc (ไม่ใช่ "ยืนยันตัวตนไม่ผ่าน")
 */
export const pacesConfirmWithPassword = async <T>(options: {
  title: string
  text?: string
  html?: string
  placeholder?: string
  confirmButtonText?: string
  cancelButtonText?: string
  /** ข้อความเมื่อกดยืนยันโดยยังไม่กรอกรหัสผ่าน */
  validationMessage: string
  run: (password: string) => Promise<T>
}): Promise<T | null> => {
  const Swal = await loadSwal()
  const result = await Swal.fire({
    buttonsStyling: false,
    showCancelButton: true,
    allowOutsideClick: false,
    focusCancel: false,
    icon: 'question',
    title: options.title,
    text: options.text,
    html: options.html,
    input: 'password',
    inputPlaceholder: options.placeholder ?? 'รหัสผ่าน',
    inputAttributes: { autocomplete: 'current-password' },
    inputValidator: (value) => (value ? undefined : options.validationMessage),
    confirmButtonText: options.confirmButtonText ?? 'ยืนยัน',
    cancelButtonText: options.cancelButtonText ?? 'ยกเลิก',
    customClass: {
      confirmButton: CONFIRM_BTN.primary,
      cancelButton: CANCEL_BTN,
    },
    showLoaderOnConfirm: true,
    preConfirm: async (password: string) => {
      try {
        return await options.run(password)
      } catch (err) {
        Swal.showValidationMessage(err instanceof Error && err.message ? err.message : 'เกิดข้อผิดพลาด กรุณาลองใหม่')
        return undefined
      }
    },
  })
  // isConfirmed=false → ยกเลิก · value=undefined → run() throw แล้ว Swal เปิดค้างอยู่จนผู้ใช้ปิดเอง
  if (!result.isConfirmed || result.value === undefined) return null
  return result.value as T
}

/**
 * pacesConfirmTerms — โมดัลรับทราบเงื่อนไขที่ต้องติ๊กก่อนกดยืนยันได้ (feature 00060 — TermsConsentModal)
 *
 * ทำไมต้องมีตัวใหม่แทน `pacesConfirm` ธรรมดา: AC-INS-10-2 บังคับว่า "กดยืนยันไม่ได้จนกว่าจะติ๊ก
 * รับทราบ" — ต้อง disable ปุ่มยืนยัน**จริง** (ผ่าน `Swal.getConfirmButton()!.disabled`) ไม่ใช่แค่
 * validate ตอนกด (validate-on-click ยังกดได้ แค่โดนเด้ง error กลับ ซึ่งไม่ตรงกับ "กดไม่ได้")
 *
 * `didOpen` ผูก listener ให้ toggle ตาม `change` ของ checkbox — ใช้ pattern เดียวกับ `pacesEditTextFields`
 * (อ่าน DOM ตรงผ่าน `document.getElementById` เพราะ Swal render เป็น HTML ดิบ ไม่ใช่ React tree)
 *
 * คืน `true` = ติ๊กรับทราบแล้วกดยืนยัน · `false` = ยกเลิก/Esc/ปิด
 */
export const pacesConfirmTerms = async (options: {
  title: string
  /** rich HTML ของเนื้อหาเงื่อนไข (เช่น "ค่าตรวจไม่คืนเงิน" + "เงื่อนไขกรณีพบหลักฐานฉ้อโกง") */
  termsHtml: string
  checkboxLabel: string
  confirmButtonText: string
  cancelButtonText?: string
}): Promise<boolean> => {
  const Swal = await loadSwal()
  const CHECKBOX_ID = 'paces-terms-ack'

  const result = await Swal.fire({
    buttonsStyling: false,
    allowOutsideClick: false,
    icon: 'info',
    title: options.title,
    html: `
      <div class="text-start">
        <div class="text-default-700 text-sm mb-4">${options.termsHtml}</div>
        <label for="${CHECKBOX_ID}" class="flex items-start gap-2 text-start text-sm text-default-800">
          <input id="${CHECKBOX_ID}" type="checkbox" class="form-checkbox mt-0.5 shrink-0" />
          <span>${options.checkboxLabel}</span>
        </label>
      </div>`,
    focusConfirm: false,
    showCancelButton: true,
    confirmButtonText: options.confirmButtonText,
    cancelButtonText: options.cancelButtonText ?? 'ยกเลิก',
    customClass: { confirmButton: CONFIRM_BTN.primary, cancelButton: CANCEL_BTN },
    didOpen: () => {
      const confirmBtn = Swal.getConfirmButton()
      const checkbox = document.getElementById(CHECKBOX_ID) as HTMLInputElement | null
      if (confirmBtn) confirmBtn.disabled = true // ปิดจริงตั้งแต่เปิดโมดัล ไม่ใช่แค่ validate ตอนกด
      checkbox?.addEventListener('change', () => {
        if (confirmBtn) confirmBtn.disabled = !checkbox.checked
      })
    },
    preConfirm: () => {
      // ด่านสุดท้ายกันกรณี disabled หลุด (เช่น browser extension) — ไม่ติ๊ก = ไม่ปิดโมดัล
      const checkbox = document.getElementById(CHECKBOX_ID) as HTMLInputElement | null
      if (checkbox?.checked !== true) {
        Swal.showValidationMessage('ต้องติ๊กรับทราบเงื่อนไขก่อน')
        return false
      }
      return true
    },
  })

  return result.isConfirmed && result.value === true
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

// ─── 00085 ปิดพัสดุที่มีปัญหา ────────────────────────────────────────────────

/** รูป GET problem-close (ตรงกับ ParcelClosePreview ของ service — type เท่านั้น ไม่ลาก prisma เข้า client) */
export type ParcelClosePreviewJson = import('@/services/parcel-close.service').ParcelClosePreview

export interface ParcelCloseSubmitBody {
  reason: ParcelCloseReason
  note?: string
  expectedOutcome: ParcelCloseOutcome
  refunded?: boolean
}

/**
 * ผลของ submit — ผู้เรียกแปลง HTTP เป็นสามแบบนี้ (throw = เน็ตหลุด/500 เท่านั้น ⇒ โมดัลไม่ปิด)
 *   ok              — 200 โมดัลปิด
 *   outcome-changed — 409 OUTCOME_CHANGED โมดัลไม่ปิด วาดผลใหม่ให้ร้านตรวจ
 *   conflict        — 409 อื่น ๆ โมดัลปิด ผู้เรียกแจ้ง + โหลดแผงใหม่
 *   forbidden       — 403 โมดัลปิด ผู้เรียกแจ้ง
 */
export type ParcelCloseSubmitResult<T> =
  | { kind: 'ok'; data: T }
  | { kind: 'outcome-changed'; preview: ParcelClosePreviewJson }
  | { kind: 'conflict' }
  | { kind: 'forbidden' }

/** ค่าที่ helper คืน — 'not-eligible' = GET บอกว่าปิดไม่ได้แล้ว (ผู้เรียกแจ้ง) · null = ร้านกดไม่ปิด */
export type ParcelCloseModalResult<T> =
  | Exclude<ParcelCloseSubmitResult<T>, { kind: 'outcome-changed' }>
  | { kind: 'not-eligible' }
  | null

const escHtml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

const PCP_BOX = 'rounded-lg bg-default-100 p-4'

function pcpResultHtml(p: ParcelClosePreviewJson, refunded: boolean | null): string {
  const meta = PARCEL_CLOSE_META[p.outcome]
  const cost = p.shippingCost
  const costText =
    cost.pendingReason === 'MISSING'
      ? 'นับเป็นต้นทุนของร้าน'
      : `฿${cost.amount.toLocaleString('th-TH')} นับเป็นต้นทุนของร้าน`
  const costFull = p.paymentIsCod ? `${costText} (ไม่รวมค่าธรรมเนียมเก็บเงินปลายทาง)` : costText
  const row = (label: string, value: string) =>
    `<div class="flex items-center justify-between gap-3 border-b border-dashed border-default-200 py-2 text-sm last:border-0"><span class="text-default-700">${escHtml(label)}</span><span class="text-end font-semibold text-default-900">${escHtml(value)}</span></div>`

  let desc: string
  let salesRow = ''
  if (p.outcome === 'DELIVERY_FAILED') {
    desc = 'ไม่พบประวัติว่าพัสดุถึงผู้รับ จึงบันทึกเป็น ส่งไม่สำเร็จ'
    salesRow = row('ยอดขาย', 'ไม่นับเป็นยอดขาย')
  } else {
    desc = p.deliveredAt
      ? `พบว่าพัสดุถึงผู้รับเมื่อ ${formatDateTime(p.deliveredAt)} แล้วหายระหว่างส่งคืน`
      : 'พบว่าพัสดุถึงผู้รับแล้ว แล้วหายระหว่างส่งคืน'
    desc += p.basis === 'ORDER_CONFIRMED' ? ' · ผู้ซื้อกดยืนยันรับของแล้ว' : ' · จากประวัติขนส่ง'
    if (p.paymentIsCod) salesRow = row('ยอดขาย', 'ไม่นับเป็นยอดขาย เพราะยังไม่ได้รับเงินปลายทาง')
  }

  const refundBlock = p.needsRefundAnswer
    ? `<fieldset class="mt-3 border-0 p-0" id="pcp-refund">
        <legend class="mb-1 text-sm font-semibold text-default-900">ลูกค้าได้รับเงินคืนหรือไม่</legend>
        <label class="flex min-h-11 items-start gap-2 py-2 text-sm text-default-800">
          <input type="radio" name="pcp-refunded" value="yes" class="form-radio mt-0.5 shrink-0 rounded-full!" ${refunded === true ? 'checked' : ''} />
          <span>คืนเงินลูกค้าแล้วหรือจะคืน<span class="block text-xs text-default-700">ยอดขายออเดอร์นี้จะถูกหักออก ค่าส่งขาไปนับเป็นต้นทุน</span></span>
        </label>
        <label class="flex min-h-11 items-start gap-2 py-2 text-sm text-default-800">
          <input type="radio" name="pcp-refunded" value="no" class="form-radio mt-0.5 shrink-0 rounded-full!" ${refunded === false ? 'checked' : ''} />
          <span>ไม่คืนเงิน<span class="block text-xs text-default-700">ยอดขายออเดอร์นี้นับตามเดิม</span></span>
        </label>
        <p class="mb-0 mt-1 text-xs text-default-700">ระบบไม่ได้โอนเงินคืนให้ แค่บันทึกว่าร้านตัดสินใจอย่างไร</p>
      </fieldset>`
    : ''

  const incomplete =
    p.basis === 'NONE' && p.eventCount === 0
      ? `<p class="mb-0 mt-3 rounded-lg px-3 py-2 text-xs ${NOTICE_INFO}">ประวัติขนส่งของพัสดุใบนี้ไม่ครบ ผลที่ระบบตัดสินอาจคลาดเคลื่อน ถ้าพัสดุถึงผู้รับแล้ว ให้ตรวจกับขนส่งก่อน หรือปิดไปก่อนแล้วเลิกปิดได้ภายหลัง</p>`
      : ''

  return `<div class="${PCP_BOX}">
      <p class="mb-1 text-base font-semibold text-default-900">${escHtml(meta.label)}</p>
      <p class="mb-2 text-sm text-default-700">${escHtml(desc)}</p>
      ${salesRow}${row('ค่าส่งขาไป', costFull)}
    </div>${refundBlock}${incomplete}`
}

// สีกล่อง info/danger ของ NOTICE_BOX — เขียนซ้ำเป็นสตริงเต็มเพราะไฟล์นี้ไม่ import components (Tailwind สแกนข้อความ)
const NOTICE_INFO = 'bg-info/15 text-info-ink'
const NOTICE_DANGER = 'bg-danger/15 text-danger-ink'

/**
 * pacesCloseParcelProblem — โมดัลปิดพัสดุที่มีปัญหา (feature 00085 Design-Spec §2)
 *
 * ประกอบจาก pacesConfirmTerms (didOpen + ปิดปุ่มยืนยันจนครบ) + pacesEditTextFields (html + อ่าน DOM)
 * + pacesConfirmAsync (showLoaderOnConfirm; throw = ไม่ปิดโมดัล)
 *
 * เหตุผล+หมายเหตุอยู่นอก #pcp-result เพื่อให้วาดผลใหม่ (OUTCOME_CHANGED / ลองใหม่) แล้วค่าที่ร้านพิมพ์ไม่หาย
 * ไม่ใส่ไอคอนในโมดัล: เนื้อเป็น HTML ดิบ (ไม่มี React tree ให้ Icon) และสเปกสั่งไม่ใส่ icon ของ Swal อยู่แล้ว
 */
export const pacesCloseParcelProblem = async <T>(options: {
  trackingNo: string | null
  courierLabel: string
  loadPreview: () => Promise<ParcelClosePreviewJson>
  submit: (body: ParcelCloseSubmitBody) => Promise<ParcelCloseSubmitResult<T>>
}): Promise<ParcelCloseModalResult<T>> => {
  const Swal = await loadSwal()
  const $ = <E extends HTMLElement>(id: string) => document.getElementById(id) as E | null

  let preview: ParcelClosePreviewJson | null = null
  let loadFailed = false
  let refunded: boolean | null = null
  let notEligible = false

  const noteOf = () => ($<HTMLTextAreaElement>('pcp-note')?.value ?? '').trim()
  const reasonOf = () => ($<HTMLSelectElement>('pcp-reason')?.value ?? '') as ParcelCloseReason | ''

  const isComplete = () => {
    if (!preview || !preview.eligible) return false
    const reason = reasonOf()
    if (!reason) return false
    if (reason === 'OTHER' && (noteOf().length < 5 || noteOf().length > 200)) return false
    if (preview.needsRefundAnswer && refunded === null) return false
    return true
  }
  const syncConfirm = () => {
    const btn = Swal.getConfirmButton()
    if (btn) btn.disabled = !isComplete()
  }

  const paintResult = () => {
    const box = $('pcp-result')
    if (!box) return
    if (loadFailed) {
      box.innerHTML = `<div class="rounded-lg px-3 py-2.5 text-sm ${NOTICE_DANGER}" role="alert">โหลดผลที่ระบบตัดสินไม่สำเร็จ
        <button type="button" data-pcp-retry class="btn min-h-11 px-2 font-semibold underline">ลองใหม่</button></div>`
    } else if (!preview) {
      box.innerHTML = `<div class="flex flex-col gap-2" aria-busy="true">
        <span class="h-4 w-2/3 animate-pulse rounded bg-default-100"></span>
        <span class="h-4 w-1/2 animate-pulse rounded bg-default-100"></span>
        <span class="h-4 w-3/4 animate-pulse rounded bg-default-100"></span></div>`
    } else {
      box.innerHTML = pcpResultHtml(preview, refunded)
    }
    syncConfirm()
  }

  const load = async () => {
    preview = null
    loadFailed = false
    paintResult()
    try {
      const p = await options.loadPreview()
      if (!p.eligible) {
        notEligible = true
        Swal.close()
        return
      }
      preview = p
    } catch {
      loadFailed = true
    }
    paintResult()
  }

  const result = await Swal.fire({
    buttonsStyling: false,
    allowOutsideClick: false,
    title: 'ปิดพัสดุที่มีปัญหา',
    width: '32em',
    html: `
      <div class="text-start">
        <p class="text-default-700 mb-3 truncate text-xs">${escHtml([options.trackingNo, options.courierLabel].filter(Boolean).join(' · '))}</p>
        <label for="pcp-reason" class="text-default-700 mb-1 block text-xs">เหตุผลที่ปิด</label>
        <select id="pcp-reason" class="form-select mb-3 h-11 w-full">
          <option value="">เลือกเหตุผล</option>
          ${PARCEL_CLOSE_REASONS.map((r) => `<option value="${r}">${escHtml(PARCEL_CLOSE_REASON_LABEL[r])}</option>`).join('')}
        </select>
        <div id="pcp-note-wrap" class="mb-3 hidden">
          <label for="pcp-note" class="text-default-700 mb-1 block text-xs">ระบุเหตุผล</label>
          <textarea id="pcp-note" maxlength="200" placeholder="เช่น ขนส่งแจ้งว่าพัสดุตกน้ำ"
                    class="border-default-300 text-default-900 min-h-24 w-full rounded-lg border px-3 py-2 text-sm"></textarea>
          <div class="flex justify-between text-xs"><span id="pcp-note-err" class="text-danger-ink"></span><span id="pcp-note-count" class="text-default-700">0/200</span></div>
        </div>
        <div id="pcp-result"></div>
      </div>`,
    focusConfirm: false,
    showCancelButton: true,
    confirmButtonText: 'ยืนยันปิดพัสดุ',
    cancelButtonText: 'ยังไม่ปิด',
    customClass: { confirmButton: CONFIRM_BTN.primary, cancelButton: CANCEL_BTN },
    showLoaderOnConfirm: true,
    didOpen: () => {
      const confirmBtn = Swal.getConfirmButton()
      if (confirmBtn) confirmBtn.disabled = true
      const popup = Swal.getPopup()
      $('pcp-reason')?.addEventListener('change', () => {
        $('pcp-note-wrap')?.classList.toggle('hidden', reasonOf() !== 'OTHER')
        syncConfirm()
      })
      $('pcp-note')?.addEventListener('input', () => {
        const n = noteOf().length
        const raw = $<HTMLTextAreaElement>('pcp-note')?.value.length ?? 0
        const cnt = $('pcp-note-count')
        if (cnt) cnt.textContent = `${raw}/200`
        const err = $('pcp-note-err')
        if (err) err.textContent = n > 0 && n < 5 ? 'พิมพ์อย่างน้อย 5 ตัวอักษร' : ''
        syncConfirm()
      })
      // ผลถูกวาดใหม่ได้ (ลองใหม่ / OUTCOME_CHANGED) จึงผูกที่ popup ครั้งเดียวแทนผูกกับ radio แต่ละตัว
      popup?.addEventListener('change', (e) => {
        const t = e.target as HTMLInputElement
        if (t.name === 'pcp-refunded') {
          refunded = t.value === 'yes'
          syncConfirm()
        }
      })
      popup?.addEventListener('click', (e) => {
        if ((e.target as HTMLElement).closest('[data-pcp-retry]')) void load()
      })
      void load()
    },
    preConfirm: async () => {
      const reason = reasonOf()
      if (!preview || !reason || !isComplete()) {
        Swal.showValidationMessage('กรอกข้อมูลให้ครบก่อนกดยืนยัน')
        return false
      }
      const body: ParcelCloseSubmitBody = {
        reason,
        expectedOutcome: preview.outcome,
        ...(reason === 'OTHER' ? { note: noteOf() } : {}),
        ...(preview.needsRefundAnswer ? { refunded: refunded === true } : {}),
      }
      try {
        const res = await options.submit(body)
        if (res.kind === 'outcome-changed') {
          // ผลเปลี่ยนระหว่างเปิดหน้าต่าง: วาดผลใหม่ + ล้างคำตอบคืนเงิน แต่ไม่ปิดโมดัล
          preview = res.preview
          refunded = null
          paintResult()
          Swal.showValidationMessage('ผลที่ระบบตัดสินเปลี่ยนไประหว่างที่เปิดหน้าต่าง ตรวจผลด้านบนแล้วกดยืนยันอีกครั้ง')
          return false
        }
        return res
      } catch {
        Swal.showValidationMessage('ปิดพัสดุไม่สำเร็จ ลองกดยืนยันอีกครั้ง ถ้ายังไม่ได้ให้รีเฟรชหน้านี้')
        return false
      }
    },
  })

  if (notEligible) return { kind: 'not-eligible' }
  if (!result.isConfirmed || !result.value) return null
  return result.value as Exclude<ParcelCloseSubmitResult<T>, { kind: 'outcome-changed' }>
}
