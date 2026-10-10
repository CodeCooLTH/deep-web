/**
 * ป๊อปอัป "ตั้งรหัสผ่านใหม่" ในหน้าบัญชี — หน้าตา/กติกาเหมือนหน้า "ตั้งรหัสผ่านใหม่" หลังลืมรหัส
 * (`seller/auth/new-pass` · user สั่ง 2026-10-10: "เงื่อนไข ปุ่มดูรหัส ทุกอย่างต้องเหมือนหน้า login")
 *
 * เดิมเป็น `<input type="password">` เปล่า ๆ ใน HTML ของ Swal ⇒ เปิดดูรหัสไม่ได้ ไม่มีแถบความแข็งแรง
 * ไม่มีช่องยืนยัน — พิมพ์ผิดหนึ่งตัวบนมือถือแล้วล็อกอินไม่ได้โดยไม่รู้ตัว
 *
 * ป๊อปอัปยังเป็น Swal (Hard Rule 8) จึงเป็น HTML string + ผูก event ใน `didOpen`
 * ชิ้นส่วนเลียนแบบ `PasswordInputWithStrength` / ช่องยืนยันของ NewPassForm (คลาสเดียวกัน)
 * กติกา/ข้อความมาจาก `src/lib/new-password-rules.ts` ที่เดียว
 */
import { NEW_PASSWORD_HINT, newPasswordError, passwordStrength } from '@/lib/new-password-rules'

/** ไอคอน tabler (ชุดเดียวกับ Icon wrapper) — ใน HTML ของ Swal ใช้ React component ไม่ได้ */
const svg = (paths: string, className = '') =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="${className}" aria-hidden="true">${paths}</svg>`

const LOCK = svg(
  '<path d="M5 13a2 2 0 0 1 2 -2h10a2 2 0 0 1 2 2v6a2 2 0 0 1 -2 2h-10a2 2 0 0 1 -2 -2v-6z"/><path d="M8 11v-4a4 4 0 1 1 8 0v4"/><path d="M15 16h.01"/><path d="M12.01 16h.01"/><path d="M9.02 16h.01"/>',
)
const EYE = svg('<path d="M10 12a2 2 0 1 0 4 0a2 2 0 0 0 -4 0"/><path d="M21 12c-2.4 4 -5.4 6 -9 6c-3.6 0 -6.6 -2 -9 -6c2.4 -4 5.4 -6 9 -6c3.6 0 6.6 2 9 6"/>', 'text-base')
const EYE_OFF = svg(
  '<path d="M10.585 10.587a2 2 0 0 0 2.829 2.828"/><path d="M16.681 16.673a8.717 8.717 0 0 1 -4.681 1.327c-3.6 0 -6.6 -2 -9 -6c1.272 -2.12 2.712 -3.678 4.32 -4.674m2.86 -1.146a9.055 9.055 0 0 1 1.82 -.18c3.6 0 6.6 2 9 6c-.666 1.11 -1.379 2.067 -2.138 2.87"/><path d="M3 3l18 18"/>',
  'text-base',
)

const escapeHtml = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string)

function passwordField(id: string, label: string) {
  return `
    <label for="${id}" class="form-label">${label} <span class="text-danger">*</span></label>
    <div class="input-icon-group relative">
      <span class="input-icon">${LOCK}</span>
      <input id="${id}" class="form-input pe-10" type="password" placeholder="••••••••" autocomplete="new-password" />
      <button type="button" data-pw-toggle="${id}" aria-label="แสดงรหัสผ่าน" class="absolute inset-y-0 end-0 flex min-w-11 items-center justify-center text-default-500 hover:text-default-700">${EYE}</button>
    </div>`
}

export function buildSetPasswordHtml(phoneMasked: string): string {
  return `
    <div class="text-start">
      <p class="text-sm mb-3">ส่งรหัส 6 หลักไปที่ <b>${escapeHtml(phoneMasked)}</b> แล้ว</p>
      <label for="pw-otp" class="form-label">รหัส OTP <span class="text-danger">*</span></label>
      <input id="pw-otp" class="form-input mb-4" inputmode="numeric" maxlength="6" placeholder="รหัส OTP 6 หลัก" autocomplete="one-time-code" />
      ${passwordField('pw-new', 'รหัสผ่านใหม่')}
      <div class="password-bar my-3" data-pw-bar>${'<div class="strong-bar"></div>'.repeat(4)}</div>
      <p class="text-default-400 text-xs mb-4">${NEW_PASSWORD_HINT}</p>
      ${passwordField('pw-confirm', 'ยืนยันรหัสผ่านใหม่')}
    </div>`
}

/** ผูกปุ่มดูรหัส + แถบความแข็งแรง — เรียกจาก `didOpen` ของ Swal */
export function wireSetPasswordDialog(root: HTMLElement): void {
  root.querySelectorAll<HTMLButtonElement>('[data-pw-toggle]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const input = root.querySelector<HTMLInputElement>(`#${btn.dataset.pwToggle}`)
      if (!input) return
      const show = input.type === 'password'
      input.type = show ? 'text' : 'password'
      btn.innerHTML = show ? EYE_OFF : EYE
      btn.setAttribute('aria-label', show ? 'ซ่อนรหัสผ่าน' : 'แสดงรหัสผ่าน')
    })
  })
  const pw = root.querySelector<HTMLInputElement>('#pw-new')
  const bars = root.querySelectorAll<HTMLElement>('[data-pw-bar] .strong-bar')
  pw?.addEventListener('input', () => {
    const strength = passwordStrength(pw.value)
    bars.forEach((bar, i) => {
      bar.className = 'strong-bar' + (i < strength ? ` bar-active-${strength}` : '')
    })
  })
}

/** อ่านค่าจากป๊อปอัป + ตรวจ — คืนข้อความผิดข้อแรก หรือค่าที่พร้อมส่ง */
export function readSetPasswordForm(root: ParentNode): { error: string } | { otp: string; password: string } {
  const value = (id: string) => root.querySelector<HTMLInputElement>(`#${id}`)?.value ?? ''
  const otp = value('pw-otp').trim()
  if (!/^[0-9]{6}$/.test(otp)) return { error: 'รหัส OTP ต้องเป็นตัวเลข 6 หลัก' }
  const password = value('pw-new')
  const error = newPasswordError(password, value('pw-confirm'))
  return error ? { error } : { otp, password }
}
