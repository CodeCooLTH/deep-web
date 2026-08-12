'use client'

/**
 * ConnectedAccountsClient — UI สำหรับ "บัญชีที่เชื่อมต่อ" (FR-LO-16)
 *
 * Base: theme/paces/Admin/TS/src/app/(admin)/apps/users/account-settings/page.tsx
 *   — Social section rows (input-group + label pattern)
 * Base: theme/paces/Admin/TS/src/app/(admin)/plugins/sweet-alerts/components/SweetAlerts.tsx
 *   — confirmButton / cancelButton pattern + Swal.fire + buttonsStyling: false + customClass
 *
 * Toast: pacesToast (Hard Rule 9 — ห้าม react-toastify ใน (paces))
 * Modal: Sweet Alerts (Hard Rule 8 — confirm dialog ต้องผ่าน Swal)
 * สี brand (FB #1877F2, IG #E1306C, LINE #06C755):
 *   Hard Rule 6 exception — brand asset color ใช้ตาม ref ได้ พร้อม comment กำกับ
 * Paces primitive เท่านั้น — ห้าม arbitrary value (Hard Rule 7)
 */

import { useRouter, useSearchParams } from 'next/navigation'
import { useEffect, useState } from 'react'
import { signIn } from 'next-auth/react'
import { Icon } from '@iconify/react'
import Swal from 'sweetalert2'
import { pacesToast } from '@/lib/paces-toast'

// ─── Types ─────────────────────────────────────────────────────────────────────

/**
 * provider ที่ผูกกับบัญชีได้ — ต้องตรงกับ LINKABLE_PROVIDERS ใน /api/account/link/start
 * และ oauthMap ใน lib/auth.ts (สามที่ต้องขยับพร้อมกันเสมอ ไม่งั้นปุ่มโผล่แต่กดแล้ว 400)
 */
type ProviderKey = 'apple' | 'facebook' | 'line' | 'instagram'

/** ชื่อที่ผู้ใช้เห็น — รวมไว้ที่เดียว กันคำใน Swal ยืนยันกับป้ายบนแถวไม่ตรงกัน (Hard Rule 16) */
const PROVIDER_LABEL: Record<ProviderKey, string> = {
  apple: 'Apple',
  facebook: 'Facebook',
  line: 'LINE',
  instagram: 'Instagram',
}

interface ConnectedAccountsClientProps {
  appleLinked: boolean
  facebookLinked: boolean
  lineLinked: boolean
  instagramLinked: boolean
  hasPassword: boolean
  /** มีเบอร์แล้วไหม — ตั้งรหัสผ่านต้องยืนยันผ่าน OTP ทางเบอร์เท่านั้น (feature 00026) */
  hasPhone: boolean
}

// ─── Provider Config ──────────────────────────────────────────────────────────

interface ProviderConfig {
  id: 'facebook' | 'line' | 'instagram'
  label: string
  /** icon ใช้ @iconify/react — ยกเว้น LINE ที่ไม่มีใน icon set ใช้ inline SVG แทน */
  iconEl: React.ReactNode
}

/** LINE brand SVG inline — Hard Rule 6 exception: LINE ไม่มีใน @iconify/react tabler set
 *  สี #06C755 = LINE brand color (brand asset ใช้ตาม ref ได้) */
const LineIcon = () => (
  <svg
    width={18}
    height={18}
    viewBox="0 0 24 24"
    xmlns="http://www.w3.org/2000/svg"
    aria-label="LINE"
  >
    {/* Hard Rule 6 exception: LINE brand color #06C755 — brand asset ใช้ได้ตาม ref */}
    <path
      d="M19.952 12.255c0-3.78-3.79-6.855-8.452-6.855S3.048 8.475 3.048 12.255c0 3.39 3.006 6.23 7.068 6.768.275.059.65.182.745.418.085.213.056.549.028.764l-.12.726c-.037.213-.17.833.728.454.9-.38 4.86-2.862 6.63-4.9 1.222-1.341 1.825-2.703 1.825-4.23z"
      fill="#06C755"
    />
    <path
      d="M10.26 10.49H9.577a.197.197 0 0 0-.197.197v4.24c0 .109.088.197.197.197h.682a.197.197 0 0 0 .197-.197v-4.24a.197.197 0 0 0-.197-.197zm4.673 0h-.682a.197.197 0 0 0-.197.197v2.518l-1.942-2.624a.196.196 0 0 0-.016-.02l-.001-.002a.202.202 0 0 0-.014-.013l-.004-.004a.202.202 0 0 0-.013-.009l-.005-.003a.198.198 0 0 0-.014-.008l-.005-.002a.198.198 0 0 0-.015-.005l-.005-.002a.198.198 0 0 0-.015-.003H11.3a.197.197 0 0 0-.197.197v4.24c0 .109.088.197.197.197h.682a.197.197 0 0 0 .197-.197v-2.518l1.944 2.627a.196.196 0 0 0 .05.048l.002.001a.198.198 0 0 0 .051.02l.007.001a.2.2 0 0 0 .05.007h.65a.197.197 0 0 0 .197-.197v-4.24a.197.197 0 0 0-.197-.197zm-6.396 3.362H7.463v-3.165a.197.197 0 0 0-.197-.197h-.682a.197.197 0 0 0-.197.197v4.24c0 .053.021.1.055.136l.003.003.003.003a.196.196 0 0 0 .136.055h3.953a.197.197 0 0 0 .197-.197v-.682a.197.197 0 0 0-.197-.193zm10.017-3.362h-3.953a.197.197 0 0 0-.197.197v4.24a.197.197 0 0 0 .197.197h3.953a.197.197 0 0 0 .197-.197v-.682a.197.197 0 0 0-.197-.197h-3.074v-.73h3.074a.197.197 0 0 0 .197-.197v-.682a.197.197 0 0 0-.197-.197h-3.074v-.73h3.074a.197.197 0 0 0 .197-.197v-.682a.197.197 0 0 0-.197-.193z"
      fill="#fff"
    />
  </svg>
)

// ─── Main Component ─────────────────────────────────────────────────────────

export function ConnectedAccountsClient({
  appleLinked: initialApple,
  facebookLinked: initialFb,
  lineLinked: initialLine,
  instagramLinked: initialIg,
  hasPassword,
  hasPhone,
}: ConnectedAccountsClientProps) {
  const router = useRouter()
  const searchParams = useSearchParams()

  // state mirror ของ linked status — อัปเดตหลัง disconnect สำเร็จ (router.refresh ก็ทำ)
  const [appleLinked, setAppleLinked] = useState(initialApple)
  const [fbLinked, setFbLinked] = useState(initialFb)
  const [lineLinked, setLineLinked] = useState(initialLine)
  const [igLinked, setIgLinked] = useState(initialIg)
  const [loadingProvider, setLoadingProvider] = useState<string | null>(null)

  // IG flag — render เฉพาะเมื่อ env เปิด (FR-LO-15 prepared/flag-off)
  const enableIg = process.env.NEXT_PUBLIC_ENABLE_IG_LOGIN === 'true'

  // ─── อ่าน query params จาก OAuth callback ──────────────────────────────────
  // ทำไม useEffect: searchParams read หลัง mount เท่านั้น (client-only)
  useEffect(() => {
    const linked = searchParams.get('linked')
    const linkError = searchParams.get('link_error')

    if (linked) {
      // OAuth callback ส่ง ?linked=facebook / ?linked=line / ?linked=instagram กลับมา
      const providerLabel =
        linked === 'facebook' ? 'Facebook' : linked === 'line' ? 'LINE' : 'Instagram'
      pacesToast.success(`เชื่อมต่อ ${providerLabel} สำเร็จ`)
      // ลบ query string เพื่อกัน toast ซ้ำเมื่อ user reload
      router.replace('/settings')
    } else if (linkError === 'taken') {
      pacesToast.error('บัญชีนี้ถูกใช้กับบัญชีอื่นแล้ว')
      router.replace('/settings')
    }
  }, [searchParams, router])

  // ─── Connect Handler ────────────────────────────────────────────────────────
  async function handleConnect(provider: ProviderKey) {
    setLoadingProvider(provider)
    try {
      // ขั้น 1: บอก backend เตรียม link-intent cookie ก่อน
      const res = await fetch('/api/account/link/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        pacesToast.error(body?.error ?? 'เชื่อมต่อไม่สำเร็จ กรุณาลองใหม่')
        return
      }
      // ขั้น 2: ทำ OAuth redirect — callbackUrl ใช้ /settings (proxy เติม /seller prefix เอง)
      await signIn(provider, { callbackUrl: '/settings' })
    } catch {
      pacesToast.error('เชื่อมต่อไม่สำเร็จ กรุณาลองใหม่')
    } finally {
      setLoadingProvider(null)
    }
  }

  // ─── Disconnect Handler ─────────────────────────────────────────────────────
  async function handleDisconnect(provider: ProviderKey) {
    const providerLabel = PROVIDER_LABEL[provider]

    // ขั้น 1: Sweet Alert ยืนยัน — pattern จาก SweetAlerts.tsx cancelButton
    const confirmResult = await Swal.fire({
      title: `ยกเลิกการเชื่อมต่อ ${providerLabel}?`,
      text: 'ระบบจะส่ง OTP ไปยังเบอร์โทรที่ผูกไว้เพื่อยืนยัน',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'ดำเนินการต่อ',
      cancelButtonText: 'ยกเลิก',
      showCloseButton: true,
      buttonsStyling: false,
      customClass: {
        confirmButton: 'btn bg-primary text-white hover:bg-primary-hover mt-2 me-2',
        cancelButton: 'btn bg-danger text-white hover:bg-danger-hover mt-2',
      },
    })

    if (!confirmResult.isConfirmed) return

    setLoadingProvider(provider)

    // ขั้น 2: ส่ง OTP ไปยัง user phone
    try {
      const otpRes = await fetch('/api/account/link/send-otp', { method: 'POST' })
      if (!otpRes.ok) {
        const body = await otpRes.json().catch(() => ({}))
        Swal.fire({
          title: 'ส่ง OTP ไม่สำเร็จ',
          text: body?.error ?? 'กรุณาลองใหม่อีกครั้ง',
          icon: 'error',
          confirmButtonText: 'ตกลง',
          buttonsStyling: false,
          customClass: { confirmButton: 'btn bg-danger text-white hover:bg-danger-hover mt-2' },
        })
        return
      }
    } finally {
      setLoadingProvider(null)
    }

    // ขั้น 3: Sweet Alert input OTP — pattern จาก SweetAlerts.tsx ajaxAlert
    const otpResult = await Swal.fire({
      title: 'กรอก OTP',
      html: `<p class="text-default-400 text-sm mb-3">กรอกรหัส OTP 6 หลักที่ส่งไปยังเบอร์โทรของคุณ</p>`,
      input: 'text',
      inputAttributes: {
        maxlength: '6',
        autocomplete: 'one-time-code',
        inputmode: 'numeric',
        placeholder: 'xxxxxx',
      },
      showCancelButton: true,
      confirmButtonText: 'ยืนยัน',
      cancelButtonText: 'ยกเลิก',
      showCloseButton: true,
      buttonsStyling: false,
      customClass: {
        confirmButton: 'btn bg-primary text-white hover:bg-primary-hover mt-2 me-2',
        cancelButton: 'btn bg-danger text-white hover:bg-danger-hover mt-2',
      },
      preConfirm: (val: string) => {
        if (!val || val.length !== 6 || !/^\d{6}$/.test(val)) {
          Swal.showValidationMessage('กรุณากรอก OTP 6 หลัก (ตัวเลขเท่านั้น)')
          return false
        }
        return val
      },
    })

    if (!otpResult.isConfirmed || !otpResult.value) return

    // ขั้น 4: ส่ง OTP ไป remove endpoint
    setLoadingProvider(provider)
    try {
      const removeRes = await fetch('/api/account/link/remove', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider, otp: otpResult.value }),
      })
      const body = await removeRes.json().catch(() => ({}))

      if (!removeRes.ok) {
        // แสดง Swal error (กรณี OTP ผิด / last-method guard) ตาม Hard Rule 8
        Swal.fire({
          title: 'ยกเลิกการเชื่อมต่อไม่สำเร็จ',
          text: body?.error ?? 'กรุณาลองใหม่',
          icon: 'error',
          confirmButtonText: 'ตกลง',
          buttonsStyling: false,
          customClass: { confirmButton: 'btn bg-danger text-white hover:bg-danger-hover mt-2' },
        })
        return
      }

      // สำเร็จ — อัปเดต state + toast + refresh
      if (provider === 'facebook') setFbLinked(false)
      else if (provider === 'line') setLineLinked(false)
      else if (provider === 'instagram') setIgLinked(false)

      pacesToast.success(`ยกเลิกการเชื่อมต่อ ${providerLabel} สำเร็จ`)
      router.refresh()
    } finally {
      setLoadingProvider(null)
    }
  }

  // ─── Provider Row Renderer ────────────────────────────────────────────────

  /**
   * ตั้ง/เปลี่ยนรหัสผ่าน (feature 00026) — เดิมการ์ดนี้ใช้ hasPassword แค่ขึ้นข้อความเตือน
   * ไม่มีทางตั้งรหัสผ่านเลย ทางเดียวคือออกจากระบบแล้วใช้ "ลืมรหัสผ่าน" ที่หน้า login
   * ซึ่งบัญชีที่ login มาด้วย FB/LINE ล้วนไปไม่ถึงถ้ายังไม่มีเบอร์
   *
   * ยืนยันด้วย OTP ทางเบอร์เสมอ (มติ D3) — reuse /api/otp/send + /api/account/set-password เดิม
   * ทั้งคู่ ไม่ต้องมี endpoint ใหม่ และได้ recovery path (ลืมรหัส = OTP) มาฟรี
   */
  async function handleSetPassword() {
    if (!hasPhone) {
      pacesToast.error('ต้องเพิ่มเบอร์โทรก่อน จึงจะตั้งรหัสผ่านได้')
      return
    }

    const sent = await Swal.fire({
      title: hasPassword ? 'เปลี่ยนรหัสผ่าน' : 'ตั้งรหัสผ่าน',
      html: 'เราจะส่งรหัส OTP ไปที่เบอร์ของคุณเพื่อยืนยันตัวตนก่อน',
      icon: 'question',
      buttonsStyling: false,
      showCancelButton: true,
      confirmButtonText: 'ส่งรหัส OTP',
      cancelButtonText: 'ยกเลิก',
      customClass: {
        confirmButton: 'btn bg-primary text-white hover:bg-primary-hover mt-2 me-2',
        cancelButton: 'btn bg-light hover:text-default-800 mt-2',
      },
      preConfirm: async () => {
        const res = await fetch('/api/account/otp-for-password', { method: 'POST' })
        if (!res.ok) {
          Swal.showValidationMessage('ส่งรหัสไม่สำเร็จ กรุณาลองใหม่')
          return false
        }
        const d = (await res.json()) as { phoneMasked: string }
        return d.phoneMasked
      },
    })
    if (!sent.isConfirmed) return

    const done = await Swal.fire({
      title: 'ตั้งรหัสผ่านใหม่',
      buttonsStyling: false,
      showCancelButton: true,
      confirmButtonText: 'บันทึกรหัสผ่าน',
      cancelButtonText: 'ยกเลิก',
      customClass: {
        confirmButton: 'btn bg-primary text-white hover:bg-primary-hover mt-2 me-2',
        cancelButton: 'btn bg-light hover:text-default-800 mt-2',
      },
      html: `
        <p class="text-start text-sm mb-3">ส่งรหัส 6 หลักไปที่ <b>${sent.value}</b> แล้ว</p>
        <input id="pw-otp" class="form-input mb-2" inputmode="numeric" maxlength="6" placeholder="รหัส OTP 6 หลัก" autocomplete="one-time-code" />
        <input id="pw-new" class="form-input" type="password" placeholder="รหัสผ่านใหม่" autocomplete="new-password" />
        <p class="text-default-500 text-xs text-start mt-2">ยาว 8 ตัวขึ้นไป มีตัวอักษร ตัวเลข และอักขระพิเศษ</p>
      `,
      preConfirm: async () => {
        const otp = (document.getElementById('pw-otp') as HTMLInputElement | null)?.value.trim() ?? ''
        const password = (document.getElementById('pw-new') as HTMLInputElement | null)?.value ?? ''
        if (!/^[0-9]{6}$/.test(otp)) {
          Swal.showValidationMessage('รหัส OTP ต้องเป็นตัวเลข 6 หลัก')
          return false
        }
        // เช็คฝั่ง client ให้ตรงกับ isStrongPassword ของ server (lib/password.ts) — บอกเร็ว ไม่ใช่กัน
        if (password.length < 8 || !/[A-Za-z]/.test(password) || !/[0-9]/.test(password) || !/[^A-Za-z0-9]/.test(password)) {
          Swal.showValidationMessage('รหัสผ่านต้องยาว 8 ตัวขึ้นไป มีตัวอักษร ตัวเลข และอักขระพิเศษ')
          return false
        }
        const res = await fetch('/api/account/set-password-otp', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ otp, password }),
        })
        if (!res.ok) {
          const d = (await res.json().catch(() => null)) as { error?: string } | null
          Swal.showValidationMessage(d?.error ?? 'บันทึกไม่สำเร็จ กรุณาลองใหม่')
          return false
        }
        return true
      },
    })
    if (!done.isConfirmed) return

    pacesToast.success(hasPassword ? 'เปลี่ยนรหัสผ่านแล้ว' : 'ตั้งรหัสผ่านแล้ว')
    router.refresh()
  }

  function ProviderRow({
    provider,
    label,
    icon,
    linked,
  }: {
    provider: ProviderKey
    label: string
    icon: React.ReactNode
    linked: boolean
  }) {
    const isLoading = loadingProvider === provider

    return (
      <div className="flex items-center justify-between gap-3 py-3 border-b border-default-200 last:border-0">
        {/* ซ้าย: icon + ชื่อ provider + badge status */}
        <div className="flex items-center gap-3 min-w-0">
          <span className="shrink-0 flex items-center justify-center size-9 rounded-lg bg-default-100">
            {icon}
          </span>
          <div className="min-w-0">
            <p className="text-sm font-medium text-default-800 truncate">{label}</p>
            {/* badge สถานะ — Paces bg-{semantic}/15 token */}
            {linked ? (
              <span className="inline-flex items-center gap-1 text-xs font-medium text-success bg-success/15 px-2 py-0.5 rounded">
                <Icon icon="tabler:check" className="text-xs" aria-hidden="true" />
                เชื่อมแล้ว
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 text-xs font-medium text-default-500 bg-default-100 px-2 py-0.5 rounded">
                ยังไม่เชื่อม
              </span>
            )}
          </div>
        </div>

        {/* ขวา: ปุ่ม Connect / Disconnect — Paces soft button bg-{semantic}/15 */}
        {linked ? (
          <button
            type="button"
            disabled={isLoading}
            onClick={() => handleDisconnect(provider)}
            className="btn btn-sm bg-danger/15 text-danger hover:bg-danger/25 min-h-11 shrink-0 disabled:opacity-50"
          >
            {isLoading ? (
              <span className="size-4 border-2 border-danger border-t-transparent rounded-full animate-spin inline-block" />
            ) : (
              'ยกเลิก'
            )}
          </button>
        ) : (
          <button
            type="button"
            disabled={isLoading}
            onClick={() => handleConnect(provider)}
            className="btn btn-sm bg-primary/15 text-primary hover:bg-primary/25 min-h-11 shrink-0 disabled:opacity-50"
          >
            {isLoading ? (
              <span className="size-4 border-2 border-primary border-t-transparent rounded-full animate-spin inline-block" />
            ) : (
              'เชื่อมต่อ'
            )}
          </button>
        )}
      </div>
    )
  }

  return (
    <div className="card-body">
      {/* description */}
      <p className="text-default-500 text-sm mb-4">
        ตั้งรหัสผ่านหรือเชื่อมบัญชี Social เพื่อให้เข้าสู่ระบบได้หลายวิธี
        {!hasPassword && (
          <span className="text-warning-ink mt-1 block text-xs">
            บัญชีนี้ยังไม่มีรหัสผ่าน — ต้องเหลือวิธีเข้าสู่ระบบอย่างน้อย 1 ทางเสมอ
          </span>
        )}
      </p>

      {/* Provider rows */}
      <div>
        {/* แถวรหัสผ่าน — เดิมการ์ดนี้พูดถึงรหัสผ่านในข้อความเตือนแต่ไม่มีทางตั้งเลย (feature 00026)
            ใช้ layout เดียวกับ ProviderRow เป๊ะ แต่ไม่ reuse component เพราะ prop `provider`
            ของมันผูกกับ OAuth flow (link/unlink) ซึ่งรหัสผ่านไม่มี */}
        <div className="border-default-200 flex items-center justify-between gap-3 border-b py-3 last:border-0">
          <div className="flex min-w-0 items-center gap-3">
            <span className="bg-default-100 flex size-9 shrink-0 items-center justify-center rounded-lg">
              <Icon icon="tabler:key" width={20} height={20} aria-label="รหัสผ่าน" />
            </span>
            <div className="min-w-0">
              <p className="text-default-800 truncate text-sm font-medium">รหัสผ่าน</p>
              {hasPassword ? (
                <span className="text-success-ink bg-success/15 inline-flex items-center gap-1 rounded px-2 py-0.5 text-xs font-medium">
                  <Icon icon="tabler:check" className="text-xs" aria-hidden="true" />
                  ตั้งแล้ว
                </span>
              ) : (
                <span className="text-default-500 bg-default-100 inline-flex items-center gap-1 rounded px-2 py-0.5 text-xs font-medium">
                  {hasPhone ? 'ยังไม่ได้ตั้ง' : 'ต้องเพิ่มเบอร์โทรก่อน'}
                </span>
              )}
            </div>
          </div>

          <button
            type="button"
            onClick={handleSetPassword}
            disabled={!hasPhone}
            className="btn btn-sm bg-primary/15 text-primary hover:bg-primary/25 min-h-11 shrink-0 disabled:opacity-50"
          >
            {hasPassword ? 'เปลี่ยนรหัสผ่าน' : 'ตั้งรหัสผ่าน'}
          </button>
        </div>

        {/* Apple อยู่บนสุด — ลำดับเดียวกับหน้าล็อกอิน (App Store Guideline 4.8 บังคับให้
            Sign in with Apple อยู่ระดับเดียวกับล็อกอินเจ้าอื่น ห้ามลดชั้น)

            🛑 แถวนี้คือทางเดียวที่ผู้ใช้ "ที่มีบัญชีอยู่แล้ว" จะผูก Apple ได้ — ถ้าไม่มี เขาจะกด
            ปุ่ม Apple ในหน้าล็อกอินซึ่ง **สร้างบัญชีใหม่คนละใบ** แล้วไปตันที่ onboarding เพราะ
            เบอร์โทรของเขาผูกกับบัญชีเดิมไปแล้ว (เบอร์ตั้งได้ครั้งเดียว เปลี่ยนไม่ได้)
            เจอจริง 2026-08-12 ตอนทดสอบ — ต้องลบบัญชีที่ค้างทิ้งด้วยมือ */}
        <ProviderRow
          provider="apple"
          label="Apple"
          linked={appleLinked}
          icon={
            // Hard Rule 6 exception: โลโก้ Apple สีดำตาม Human Interface Guidelines
            <Icon icon="bxl:apple" width={22} height={22} style={{ color: '#000000' }} aria-label="Apple" />
          }
        />

        <ProviderRow
          provider="facebook"
          label="Facebook"
          linked={fbLinked}
          icon={
            // Hard Rule 6 exception: Facebook brand color #1877F2 — brand asset ใช้ได้ตาม ref
            <Icon
              icon="bxl:facebook-circle"
              width={22}
              height={22}
              style={{ color: '#1877F2' }}
              aria-label="Facebook"
            />
          }
        />

        <ProviderRow
          provider="line"
          label="LINE"
          linked={lineLinked}
          icon={<LineIcon />}
        />

        {/* IG เฉพาะเมื่อ NEXT_PUBLIC_ENABLE_IG_LOGIN=true (FR-LO-15 prepared/flag-off) */}
        {enableIg && (
          <ProviderRow
            provider="instagram"
            label="Instagram"
            linked={igLinked}
            icon={
              // Hard Rule 6 exception: Instagram brand color #E1306C — brand asset ใช้ได้ตาม ref
              <Icon
                icon="bxl:instagram"
                width={22}
                height={22}
                style={{ color: '#E1306C' }}
                aria-label="Instagram"
              />
            }
          />
        )}
      </div>
    </div>
  )
}
