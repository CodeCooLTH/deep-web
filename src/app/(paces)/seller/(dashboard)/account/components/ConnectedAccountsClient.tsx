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
import { useCallback, useEffect, useRef, useState, useTransition } from 'react'
import { signIn } from 'next-auth/react'
/**
 * 🛑 ต้องเป็น wrapper ไม่ใช่ `{ Icon } from '@iconify/react'` ตรง ๆ
 *
 * ชื่อไอคอนแบบไม่มี namespace (`loader-2`, `check`) เป็นค่า default ของโปรเจกต์ที่แปลว่า tabler
 * และตัวที่เติม `tabler:` ให้คือ wrapper ตัวนี้ตัวเดียว — ส่งชื่อเปล่าเข้า `@iconify/react` ดิบ
 * จะได้ชื่อ invalid แล้ว **ไอคอนไม่ขึ้นเลยโดยไม่มี error สักตัว** (กล่องว่างขนาดเท่าไอคอน)
 * ซึ่งกับสปินเนอร์แปลว่า "จอโหลดที่ไม่มีอะไรหมุน" = อาการเดียวกับที่ฟีเจอร์นี้เกิดมาแก้พอดี
 */
import Icon from '@/components/wrappers/Icon'
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

/**
 * (ลบ `interface ProviderConfig` ออก 2026-08-12 — ไม่มีใครใช้มาตั้งแต่ต้น และ `id` ของมัน
 * ยังเป็น `'facebook' | 'line' | 'instagram'` ที่ไม่มี Apple ⇒ คนอ่านไฟล์จะเข้าใจผิดว่า
 * Apple ผูกบัญชีไม่ได้ ทั้งที่ `ProviderKey` ด้านบนคือตัวจริง — type ที่ตายแล้วยังโกหกได้)
 */

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

// ─── Row primitives ───────────────────────────────────────────────────────────

/**
 * 🛑 ทั้ง `AccountRow` และ `ProviderRow` ต้องนิยาม **นอก** ตัว component แม่
 *
 * เดิม `ProviderRow` ถูกประกาศไว้ข้างใน `ConnectedAccountsClient` — React เทียบชนิดของ
 * component ด้วย identity ของฟังก์ชัน ฟังก์ชันที่ประกาศในตัว render จึงเป็น **ชนิดใหม่ทุกครั้ง
 * ที่แม่ re-render** ⇒ React ถอด DOM เดิมทิ้งแล้วสร้างใหม่ทั้งแถว (ไม่ใช่แค่ patch)
 *
 * ผลที่ผู้ใช้เห็นคืออาการ "แวบ ๆ" ทุกครั้งที่กดปุ่ม: ไอคอนถูกโหลดใหม่ · transition เริ่มนับหนึ่ง
 * · โฟกัสหลุดจากปุ่มที่เพิ่งกด (คนใช้คีย์บอร์ด/screen reader หลุดตำแหน่งทันที) · จอกระตุก
 * ทุก setState ไม่ว่าจะเป็น `setLoadingProvider` หรือ `setLinkedMap`
 *
 * ไม่มี gate ไหนของโปรเจกต์จับได้ — tsc/build/เทส/theme-guard ผ่านหมดเพราะโค้ดถูกทุกตัวอักษร
 * สิ่งที่ผิดคือ *ตำแหน่งที่ประกาศ* ไม่ใช่เนื้อโค้ด
 */
function AccountRow({
  icon,
  title,
  badge,
  action,
}: {
  icon: React.ReactNode
  title: string
  badge: React.ReactNode
  action: React.ReactNode
}) {
  return (
    <div className="border-default-200 flex items-center justify-between gap-3 border-b py-3 last:border-0">
      <div className="flex min-w-0 items-center gap-3">
        <span className="bg-default-100 flex size-9 shrink-0 items-center justify-center rounded-lg">
          {icon}
        </span>
        <div className="min-w-0">
          <p className="text-default-800 truncate text-sm font-medium">{title}</p>
          {badge}
        </div>
      </div>
      {action}
    </div>
  )
}

/**
 * ชิปสถานะ — `transition-colors` เพื่อให้ตอนเชื่อม/ยกเลิกสำเร็จ สีไล่เปลี่ยนแทนการสลับทันที
 *
 * ใช้ `-ink` ทั้งคู่ตาม `docs/conventions/contrast-fix-keeps-hue.md`: `text-success` บนพื้น
 * `bg-success/15` คอนทราสต์ไม่ผ่านเกณฑ์ข้อความ (แถวรหัสผ่านในไฟล์เดียวกันใช้ `-ink` ถูกอยู่แล้ว
 * ตั้งแต่แรก — แถว provider เป็นตัวที่หลุด)
 */
function StatusBadge({ on, onLabel, offLabel }: { on: boolean; onLabel: string; offLabel: string }) {
  return on ? (
    <span className="text-success-ink bg-success/15 inline-flex items-center gap-1 rounded px-2 py-0.5 text-xs font-medium transition-colors">
      <Icon icon="check" className="text-xs" aria-hidden="true" />
      {onLabel}
    </span>
  ) : (
    <span className="text-default-500 bg-default-100 inline-flex items-center gap-1 rounded px-2 py-0.5 text-xs font-medium transition-colors">
      {offLabel}
    </span>
  )
}

/**
 * ปุ่มที่ "ไม่ขยับ" ตอนกำลังทำงาน — สปินเนอร์ทับข้อความ ไม่ใช่แทนที่ข้อความ
 *
 * 🛑 เดิมสลับเนื้อในระหว่าง `'เชื่อมต่อ'` (4 ตัวอักษร) กับสปินเนอร์ 16px ⇒ ความกว้างปุ่มหดทันที
 * ที่กด แล้วขยายกลับตอนเสร็จ = layout shift สองครั้งต่อการกดหนึ่งครั้ง ซึ่งตาอ่านเป็นการกระพริบ
 * ตรึงความกว้างด้วยการคงข้อความไว้ในที่เดิมแล้วซ่อนด้วย `invisible` (ยังกินพื้นที่) แทน
 */
function ActionButton({
  busy,
  disabled,
  tone,
  onClick,
  children,
}: {
  busy: boolean
  disabled?: boolean
  tone: 'primary' | 'danger'
  onClick: () => void
  children: React.ReactNode
}) {
  const toneClass =
    tone === 'danger'
      ? 'bg-danger/15 text-danger hover:bg-danger/25'
      : 'bg-primary/15 text-primary hover:bg-primary/25'

  return (
    <button
      type="button"
      disabled={busy || disabled}
      aria-busy={busy}
      onClick={onClick}
      className={`btn btn-sm ${toneClass} min-h-11 relative shrink-0 transition-colors disabled:opacity-50`}
    >
      <span className={busy ? 'invisible' : undefined}>{children}</span>
      {busy && (
        <span className="absolute inset-0 flex items-center justify-center" aria-hidden="true">
          <Icon icon="loader-2" className="size-4 animate-spin" />
        </span>
      )}
    </button>
  )
}

function ProviderRow({
  provider,
  label,
  icon,
  linked,
  busy,
  disabled,
  onConnect,
  onDisconnect,
}: {
  provider: ProviderKey
  label: string
  icon: React.ReactNode
  linked: boolean
  busy: boolean
  /** มีงานอื่นค้างอยู่ (เช่น กำลังพาไป OAuth) → กดแถวอื่นไม่ได้ กัน flow ซ้อนกัน */
  disabled: boolean
  onConnect: (p: ProviderKey) => void
  onDisconnect: (p: ProviderKey) => void
}) {
  return (
    <AccountRow
      icon={icon}
      title={label}
      badge={<StatusBadge on={linked} onLabel="เชื่อมแล้ว" offLabel="ยังไม่เชื่อม" />}
      action={
        <ActionButton
          busy={busy}
          disabled={disabled}
          tone={linked ? 'danger' : 'primary'}
          onClick={() => (linked ? onDisconnect(provider) : onConnect(provider))}
        >
          {linked ? 'ยกเลิก' : 'เชื่อมต่อ'}
        </ActionButton>
      }
    />
  )
}

/**
 * จอทับเต็มหน้าตอนกำลังพาไปหน้าผู้ให้บริการ
 *
 * 🛑 อยู่นอกรายการโดยเจตนา — `fixed` ยึดกับ viewport ก็ต่อเมื่อ **ไม่มีบรรพบุรุษตัวไหน**
 * มี `transform`/`filter`/`backdrop-filter`/`contain` (คุณสมบัติพวกนี้สร้าง containing block ใหม่
 * แล้ว `inset-0` จะกลายเป็นขอบของการ์ดแทนขอบจอ) วางไว้ระดับบนสุดของ tree = ไม่ต้องไปไล่ตรวจ
 * ว่าวันหนึ่งใครใส่ `transform` ให้การ์ดแม่
 *
 * fade-in สั้น ๆ 150ms: การโผล่ทันทีแบบทึบอ่านเป็น "จอกระพริบ" ส่วนการค่อย ๆ จางเข้าอ่านเป็น
 * "ระบบกำลังทำงาน" — ไม่หน่วงเวลาจริงเพราะเป็น opacity ล้วน (compositor ทำงาน ไม่ layout ใหม่)
 *
 * Base: src/app/(paces)/seller/NavigationLoader.tsx:90-100 (overlay + spinner ชุดเดียวกัน)
 */
function RedirectOverlay({ label }: { label: string }) {
  const [shown, setShown] = useState(false)
  useEffect(() => {
    // rAF ให้เบราว์เซอร์ paint เฟรม opacity-0 ก่อน 1 เฟรม ไม่งั้น transition ไม่มีจุดเริ่ม
    const id = requestAnimationFrame(() => setShown(true))
    return () => cancelAnimationFrame(id)
  }, [])

  return (
    <div
      className={`bg-card/85 fixed inset-0 z-100 flex flex-col items-center justify-center backdrop-blur-sm transition-opacity duration-150 ${
        shown ? 'opacity-100' : 'opacity-0'
      }`}
      role="status"
      aria-live="polite"
      aria-label={`กำลังไปที่ ${label}`}
    >
      <Icon icon="loader-2" className="text-primary size-10 animate-spin" aria-hidden="true" />
      <p className="text-default-700 mt-4 text-sm font-medium">กำลังไปที่ {label}...</p>
      <p className="text-default-400 mt-1 text-xs">อีกสักครู่จะกลับมาหน้านี้เอง</p>
    </div>
  )
}

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

  /**
   * state mirror ของสถานะการเชื่อม — เก็บเป็น record เดียว ไม่แยกตัวแปรต่อ provider
   *
   * 🛑 เดิมแยกเป็น 4 ตัวแปรและอัปเดตด้วย if/else ไล่ทีละ provider — พอเพิ่ม Apple เข้ามา
   * สาขาของมันถูกลืม ผลคือกด "ยกเลิก" แล้ว toast ขึ้นว่าสำเร็จ **แต่แถวยังโชว์ "เชื่อมแล้ว"**
   * ต้องออกแล้วเข้าใหม่ถึงจะเห็นค่าจริง (user report 2026-08-12)
   *
   * `router.refresh()` อย่างเดียวช่วยไม่ได้ เพราะ `useState(initial)` ไม่ sync กับ prop ที่
   * เปลี่ยนหลัง mount — ตัวที่อัปเดตจอจริงคือ setState ตรงนี้เท่านั้น
   */
  const [linkedMap, setLinkedMap] = useState<Record<ProviderKey, boolean>>({
    apple: initialApple,
    facebook: initialFb,
    line: initialLine,
    instagram: initialIg,
  })
  /**
   * 🛑 แยกสองสถานะที่ "หน้าตาเหมือนกันแต่คนละความหมาย" ออกจากกัน — เดิมใช้ตัวแปรเดียว
   *
   *   redirecting — กำลังพาเบราว์เซอร์ **ออกจากหน้านี้** ไปหน้าผู้ให้บริการ (ปุ่ม "เชื่อมต่อ")
   *   busyProvider — กำลังทำงาน **อยู่ในหน้านี้** (ส่ง OTP / ถอดการเชื่อม)
   *
   * ที่ต้องแยกเพราะจอทับเต็มหน้าพูดว่า "กำลังไปที่ Apple... อีกสักครู่จะกลับมาหน้านี้เอง"
   * ซึ่งเป็นคำโกหกตอนกด "ยกเลิกการเชื่อมต่อ" (ไม่ได้ไปไหนสักหน่อย) และการยกเลิกมี **2 ช่วง
   * ที่คั่นด้วย Swal** (ส่ง OTP → กรอก OTP → ถอด) ⇒ จอทับเด้งขึ้น-ลง **2 รอบต่อการกดหนึ่งครั้ง**
   * นั่นคืออาการ "แวบ ๆ" ที่ user รายงาน 2026-08-12 ตรงตัว
   */
  const [redirecting, setRedirecting] = useState<ProviderKey | null>(null)
  const [busyProvider, setBusyProvider] = useState<ProviderKey | null>(null)
  const [, startTransition] = useTransition()

  // IG flag — render เฉพาะเมื่อ env เปิด (FR-LO-15 prepared/flag-off)
  const enableIg = process.env.NEXT_PUBLIC_ENABLE_IG_LOGIN === 'true'

  // ─── อ่าน query params จาก OAuth callback ──────────────────────────────────
  // ทำไม useEffect: searchParams read หลัง mount เท่านั้น (client-only)
  //
  // 🛑 กันยิงซ้ำด้วย ref ไม่ใช่ด้วยการเปลี่ยน URL — ตัวล้าง query ด้านล่างเปลี่ยนไปใช้
  // history.replaceState ซึ่ง (ตั้งใจ) ไม่ทำให้ useSearchParams เปลี่ยนค่า effect นี้จึงไม่มี
  // ตัวห้ามในตัวเองอีกต่อไป ถ้า effect ถูกเรียกซ้ำ (StrictMode ตอน dev / remount) จะได้ toast ซ้ำ
  const callbackHandled = useRef(false)
  useEffect(() => {
    if (callbackHandled.current) return
    const linked = searchParams.get('linked')
    const linkError = searchParams.get('link_error')
    if (!linked && !linkError) return
    callbackHandled.current = true

    if (linked) {
      /**
       * OAuth callback ส่ง ?linked={provider} กลับมา
       *
       * 🛑 ป้ายชื่อต้องมาจาก PROVIDER_LABEL — เดิมเป็น ternary ซ้อนที่ตกท้ายเป็น 'Instagram'
       * ทำให้เชื่อม Apple สำเร็จแล้วขึ้นว่า "เชื่อมต่อ Instagram สำเร็จ" (Hard Rule 16)
       */
      const providerLabel = PROVIDER_LABEL[linked as ProviderKey] ?? linked
      pacesToast.success(`เชื่อมต่อ ${providerLabel} สำเร็จ`)
      // อัปเดตแถวทันทีโดยไม่ต้องรอ RSC (ค่าที่ server ส่งมาตอนโหลดหน้านี้ยังเป็นค่าก่อนเชื่อม
      // ในกรณีที่ callback กลับมาถึงก่อน RSC จะ re-render)
      setLinkedMap((prev) => ({ ...prev, [linked as ProviderKey]: true }))
    } else if (linkError === 'taken') {
      pacesToast.error('บัญชีนี้ถูกใช้กับบัญชีอื่นแล้ว')
    }

    /**
     * ล้าง query string กัน toast ซ้ำเมื่อผู้ใช้รีโหลด
     *
     * 🛑 ใช้ history.replaceState ไม่ใช่ `router.replace('/account')` — ปลายทางคือ URL เดิม
     * ทุกประการ ต่างกันแค่ query ที่เราเพิ่งใช้เสร็จ ส่วน `router.replace` สั่งดึง RSC payload
     * ของหน้านี้มาใหม่ทั้งหน้า: เสีย round-trip เปล่า ๆ **ทันทีที่ผู้ใช้เพิ่งกลับมาจาก OAuth**
     * (จังหวะที่หน้าเพิ่งโหลดเสร็จหมาด ๆ) แล้วภาพกระตุกอีกรอบตอน payload มาถึง
     *
     * ข้อมูลไม่ค้าง เพราะการกลับจาก OAuth เป็นการโหลดหน้าใหม่ทั้งหน้าอยู่แล้ว — server
     * เรนเดอร์ด้วยสถานะหลังเชื่อมมาให้ตั้งแต่แรก ไม่มีอะไรต้องดึงซ้ำ
     *
     * 🛑 ต้องเป็น '/account' ไม่ใช่ '/settings' — การ์ดนี้ย้ายมา /account ตั้งแต่ feature 00026
     * ผลของปลายทางเก่าคือ **เชื่อมสำเร็จแล้วผู้ใช้ถูกเด้งไปหน้า "การจัดส่ง" ทันที** ทั้งที่เพิ่ง
     * กดปุ่มจากหน้านี้ (user report 2026-08-12 — คนละจุดกับ redirect ฝั่ง backend ใน 7e1dd961
     * ต้องแก้ทั้งสองที่ถึงจะหาย)
     */
    window.history.replaceState(null, '', '/account')
  }, [searchParams])

  // ─── Connect Handler ────────────────────────────────────────────────────────
  const handleConnect = useCallback(async (provider: ProviderKey) => {
    setRedirecting(provider)
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
        setRedirecting(null) // ยังอยู่หน้าเดิม → ต้องคืนจอให้ผู้ใช้กดต่อได้
        return
      }
      // ขั้น 2: ทำ OAuth redirect — กลับมาที่ /account ซึ่งเป็นหน้าที่การ์ดนี้อยู่จริง
      // 🛑 เดิมเป็น '/settings' ซึ่งค้างมาตั้งแต่ก่อนย้ายการ์ดมาที่ /account (feature 00026)
      //    ผู้ใช้จึงถูกเด้งไปหน้า "การจัดส่ง" หลังกดเชื่อม แล้วไม่มีอะไรบอกว่าสำเร็จหรือล้มเหลว
      await signIn(provider, { callbackUrl: '/account' })

      /**
       * 🛑 ห้ามล้าง `redirecting` ตรงนี้ และห้ามมี `finally { setRedirecting(null) }`
       *
       * `signIn()` ของ next-auth ตั้ง `window.location.href` แล้ว **resolve promise ทันที**
       * (next-auth/react/index.js:263) โดยที่เบราว์เซอร์ยังไม่ได้ไปไหน — มันเพิ่งเริ่มขอหน้าใหม่
       * ⇒ โค้ดที่ล้างสถานะหลัง await จะถอดจอทับออก **ก่อน** การเปลี่ยนหน้าจะเกิดจริง
       * ผู้ใช้เลยเห็นจอทับวาบเดียวแล้วกลับมาเป็นหน้าเดิมค้างอยู่เฉย ๆ จนกว่าเซิร์ฟเวอร์จะตอบ
       * = อาการ "แวบ ๆ" ที่ user รายงาน (2026-08-12) ตรงตัว
       *
       * ปล่อยให้ค้างไว้เป็นคำตอบที่ถูก: หน้านี้กำลังจะถูกทิ้งทั้งหน้าอยู่แล้ว
       */
    } catch {
      pacesToast.error('เชื่อมต่อไม่สำเร็จ กรุณาลองใหม่')
      setRedirecting(null)
    }
  }, [])

  // ─── Disconnect Handler ─────────────────────────────────────────────────────
  const handleDisconnect = useCallback(async (provider: ProviderKey) => {
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

    setBusyProvider(provider)

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
      setBusyProvider(null)
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
    setBusyProvider(provider)
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

      // สำเร็จ — อัปเดตแถวทันที (ไม่ต้องไล่ if ทีละ provider อีกต่อไป) + toast + refresh
      setLinkedMap((prev) => ({ ...prev, [provider]: false }))

      pacesToast.success(`ยกเลิกการเชื่อมต่อ ${providerLabel} สำเร็จ`)

      /**
       * sync ฝั่ง server ไว้เบื้องหลัง — จอถูกอัปเดตด้วย setLinkedMap ไปแล้วบรรทัดบน
       *
       * ห่อ startTransition เพื่อให้ React ถือว่าเป็นงานที่ขัดจังหวะได้: ผู้ใช้กดปุ่มถัดไปได้ทันที
       * ไม่ต้องรอ RSC payload กลับมา (ถ้าไม่ห่อ การ re-render จากผลของ refresh จะเป็นงานด่วน
       * แข่งกับการตอบสนองปุ่ม = สะดุดบนเครื่องช้า)
       *
       * ยังต้องเรียกอยู่ ไม่ใช่ของเกิน: หน้านี้ถูก client-side cache ไว้ ถ้าไม่บอกให้ทิ้ง
       * ผู้ใช้กดออกไปหน้าอื่นแล้วกดกลับมาจะเห็นสถานะก่อนยกเลิกอีกครั้ง
       */
      startTransition(() => router.refresh())
    } finally {
      setBusyProvider(null)
    }
  }, [router, startTransition])

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

  /** provider ที่ render จริง — ประกาศเป็นข้อมูล ไม่ใช่ JSX ซ้ำ 4 ก้อน เพิ่มเจ้าใหม่ = เพิ่มแถวเดียว */
  const providers: { key: ProviderKey; icon: React.ReactNode; show: boolean }[] = [
    // Apple อยู่บนสุด — ลำดับเดียวกับหน้าล็อกอิน (App Store Guideline 4.8 บังคับให้
    // Sign in with Apple อยู่ระดับเดียวกับล็อกอินเจ้าอื่น ห้ามลดชั้น)
    //
    // 🛑 แถวนี้คือทางเดียวที่ผู้ใช้ "ที่มีบัญชีอยู่แล้ว" จะผูก Apple ได้ — ถ้าไม่มี เขาจะกดปุ่ม
    // Apple ในหน้าล็อกอินซึ่ง **สร้างบัญชีใหม่คนละใบ** แล้วไปตันที่ onboarding เพราะเบอร์โทร
    // ผูกกับบัญชีเดิมไปแล้ว (เบอร์ตั้งได้ครั้งเดียว) เจอจริง 2026-08-12 ต้องลบบัญชีค้างด้วยมือ
    {
      key: 'apple',
      show: true,
      // Hard Rule 6 exception: โลโก้ Apple สีดำตาม Human Interface Guidelines
      icon: <Icon icon="bxl:apple" width={22} height={22} style={{ color: '#000000' }} aria-label="Apple" />,
    },
    {
      key: 'facebook',
      show: true,
      // Hard Rule 6 exception: Facebook brand color #1877F2 — brand asset ใช้ได้ตาม ref
      icon: <Icon icon="bxl:facebook-circle" width={22} height={22} style={{ color: '#1877F2' }} aria-label="Facebook" />,
    },
    { key: 'line', show: true, icon: <LineIcon /> },
    {
      // IG เฉพาะเมื่อ NEXT_PUBLIC_ENABLE_IG_LOGIN=true (FR-LO-15 prepared/flag-off)
      key: 'instagram',
      show: enableIg,
      // Hard Rule 6 exception: Instagram brand color #E1306C — brand asset ใช้ได้ตาม ref
      icon: <Icon icon="bxl:instagram" width={22} height={22} style={{ color: '#E1306C' }} aria-label="Instagram" />,
    },
  ]

  return (
    <div className="card-body">
      {/* description */}
      <p className="text-default-500 mb-4 text-sm">
        ตั้งรหัสผ่านหรือเชื่อมบัญชี Social เพื่อให้เข้าสู่ระบบได้หลายวิธี
        {!hasPassword && (
          <span className="text-warning-ink mt-1 block text-xs">
            บัญชีนี้ยังไม่มีรหัสผ่าน — ต้องเหลือวิธีเข้าสู่ระบบอย่างน้อย 1 ทางเสมอ
          </span>
        )}
      </p>

      <div>
        {/* แถวรหัสผ่าน — เดิมการ์ดนี้พูดถึงรหัสผ่านในข้อความเตือนแต่ไม่มีทางตั้งเลย (feature 00026)
            ใช้ `AccountRow` ตัวเดียวกับแถว provider: เดิมก็อป markup ไปวางซ้ำเพราะ prop `provider`
            ผูกกับ OAuth flow — พอแยก layout ออกมาเป็น shell ล้วน เหตุผลนั้นก็หมดไป และชิปสถานะ
            ของสองฝั่งจะเพี้ยนจากกันอีกไม่ได้ (ก่อนหน้านี้แถว provider ใช้ `text-success`
            ส่วนแถวนี้ใช้ `text-success-ink` — คอนทราสต์คนละค่าบนพื้นเดียวกัน) */}
        <AccountRow
          icon={<Icon icon="key" width={20} height={20} aria-label="รหัสผ่าน" />}
          title="รหัสผ่าน"
          badge={
            <StatusBadge
              on={hasPassword}
              onLabel="ตั้งแล้ว"
              offLabel={hasPhone ? 'ยังไม่ได้ตั้ง' : 'ต้องเพิ่มเบอร์โทรก่อน'}
            />
          }
          action={
            <ActionButton
              busy={false}
              disabled={!hasPhone || redirecting !== null}
              tone="primary"
              onClick={handleSetPassword}
            >
              {hasPassword ? 'เปลี่ยนรหัสผ่าน' : 'ตั้งรหัสผ่าน'}
            </ActionButton>
          }
        />

        {providers
          .filter((p) => p.show)
          .map((p) => (
            <ProviderRow
              key={p.key}
              provider={p.key}
              label={PROVIDER_LABEL[p.key]}
              icon={p.icon}
              linked={linkedMap[p.key]}
              busy={busyProvider === p.key}
              // ระหว่างกำลังพาไป OAuth ปิดทุกปุ่ม — ไม่งั้นกดเจ้าที่สองซ้อนได้ แล้ว link-intent
              // cookie ของเจ้าแรกถูกเขียนทับ (มีใบเดียว) = เชื่อมผิดเจ้าโดยไม่มีอะไรฟ้อง
              disabled={redirecting !== null || (busyProvider !== null && busyProvider !== p.key)}
              onConnect={handleConnect}
              onDisconnect={handleDisconnect}
            />
          ))}
      </div>

      {/* จอทับตอนกำลังพาไปหน้าผู้ให้บริการ — อยู่นอก <div> ของรายการโดยเจตนา (ดู RedirectOverlay) */}
      {redirecting && <RedirectOverlay label={PROVIDER_LABEL[redirecting]} />}
    </div>
  )
}
