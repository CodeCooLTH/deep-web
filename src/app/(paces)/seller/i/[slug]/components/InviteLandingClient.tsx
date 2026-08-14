'use client'

/**
 * InviteLandingClient — เนื้อหาในหน้า /i/[slug] (feature 00012, ปรับใหญ่ใน 00012 ext)
 *
 * Base:
 * - Social FB/LINE button JSX = copy ตรงจาก
 *   src/app/(paces)/seller/auth/sign-in/components/SignInForm.tsx:109-142
 *   (theme ต้นทาง: theme/paces/Admin/TS/src/app/auth/card/sign-in/components/Form.tsx)
 * - dashed divider = copy structure เดียวกับ SignInForm.tsx (theme dashed-divider pattern)
 * - avatar initials fallback = mirror
 *   src/app/(paces)/seller/(dashboard)/inbox/components/InboxList.tsx (BuyerAvatar)
 * - spinner บนปุ่ม = mirror src/app/(paces)/seller/onboarding/page.tsx (border-primary animate-spin) ย่อขนาด
 *
 * Flow (00012 ext — เดิมผู้ถูกเชิญหลุดไป flow สมัคร/สร้างร้านของผู้ขาย):
 * - ยังไม่ login → เลือกทางเข้า 3 ทางในหน้าเดียว
 *     · Facebook / LINE (callbackUrl กลับมาที่ /i/<slug>)
 *     · เบอร์โทรศัพท์ → PhoneAuthSteps (สมัครสั้น ไม่สร้างร้าน) สลับ in-place ไม่ redirect ออก
 *     · ลิงก์เล็ก → /auth/sign-in?callbackUrl=/i/<slug> สำหรับคนที่มี username/password แล้ว
 * - login แล้ว → หน้ารับคำเชิญ (โลโก้ร้านใหญ่กลางการ์ด + ชื่อร้าน + ปุ่มยอมรับ)
 *   → POST /api/i/<slug>/accept → session.update(activeShopId) → /dashboard
 *
 * UX Spec: docs/superpowers/specs/2026-08-01-invite-admins-modal-and-accept-mockup.html §B1/B3
 */

import { Icon as BxIcon } from '@iconify/react'
import { signIn, signOut, useSession } from 'next-auth/react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import Icon from '@/components/wrappers/Icon'
import { pacesToast } from '@/lib/paces-toast'
import { generateInitials } from '@/utils/helpers'
import PhoneAuthSteps from './PhoneAuthSteps'
import { toFileUrl } from '@/lib/file-url'

interface InviteLandingClientProps {
  shopName: string
  shopLogo: string | null
  slug: string
  hasSession: boolean
}

/** avatar ร้าน — รูปจริง (ถ้ามี) + fallback initials (mirror BuyerAvatar ใน InboxList.tsx) */
function ShopAvatar({
  shopLogo,
  shopName,
  size = 'sm',
}: {
  shopLogo: string | null
  shopName: string
  /** sm = แถบบริบทระหว่างเลือกวิธี login · lg = พระเอกของหน้ารับคำเชิญ */
  size?: 'sm' | 'lg'
}) {
  const [failed, setFailed] = useState(false)
  const src = shopLogo ? (toFileUrl(shopLogo)) : null
  const box = size === 'lg' ? 'size-20' : 'size-11'
  const text = size === 'lg' ? 'text-2xl' : 'text-base'
  // ขอบขาว + เงาเฉพาะขนาดใหญ่ ให้โลโก้ลอยเด่นจากพื้นการ์ด
  const ring = size === 'lg' ? 'border-4 border-card shadow-lg' : ''

  if (!src || failed) {
    return (
      <span
        className={`bg-primary/10 text-primary flex ${box} ${text} ${ring} shrink-0 items-center justify-center rounded-full font-semibold`}
      >
        {generateInitials(shopName) || '?'}
      </span>
    )
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={shopName}
      className={`${box} ${ring} shrink-0 rounded-full object-cover`}
      onError={() => setFailed(true)}
    />
  )
}

export default function InviteLandingClient({
  shopName,
  shopLogo,
  slug,
  hasSession,
}: InviteLandingClientProps) {
  const router = useRouter()
  const { update } = useSession()
  const [accepting, setAccepting] = useState(false)
  // guest เท่านั้น: 'choose' = เลือกวิธีเข้าสู่ระบบ, 'phone' = ฟอร์มเบอร์โทร 3 ขั้น
  const [guestMode, setGuestMode] = useState<'choose' | 'phone'>('choose')

  const callbackUrl = `/i/${slug}`

  /**
   * Sign in with Apple — App Store Guideline 4.8 (rejection 2026-08-04)
   *
   * ต้องมีที่นี่ด้วย ไม่ใช่เฉพาะหน้าล็อกอินหลัก: หน้ารับคำเชิญเป็น "ทางเข้าระบบ" อีกทางหนึ่งที่มี
   * ปุ่ม Facebook/LINE อยู่ — กฎ 4.8 ผูกกับ "ทุกที่ที่ให้ล็อกอินด้วยเจ้าอื่น" ไม่ใช่หน้าใดหน้าหนึ่ง
   */
  const handleApple = async () => {
    await signIn('apple', { callbackUrl })
  }

  const handleFacebook = async () => {
    await signIn('facebook', { callbackUrl })
  }

  const handleLine = async () => {
    await signIn('line', { callbackUrl })
  }

  const handleAccept = async () => {
    setAccepting(true)
    try {
      const res = await fetch(`/api/i/${slug}/accept`, { method: 'POST' })
      if (res.ok) {
        const data = await res.json()
        await update({ activeShopId: data.shopId })
        router.push('/dashboard')
        return
      }
      // map error ตาม status/body (feedback_service_error_route_mapping)
      const body = await res.json().catch(() => ({}) as { error?: string })
      if (res.status === 409 && body.error === 'ADMIN_QUOTA_EXCEEDED') {
        pacesToast.error('ร้านนี้มีผู้ดูแลเต็มจำนวนแล้ว กรุณาติดต่อเจ้าของร้าน')
      } else if (res.status === 409 && body.error === 'ALREADY_OWNER') {
        pacesToast.error('คุณเป็นเจ้าของร้านนี้อยู่แล้ว')
      } else if (res.status === 410) {
        pacesToast.error('ลิงก์เชิญนี้ใช้งานไม่ได้แล้ว')
      } else {
        pacesToast.error('เกิดข้อผิดพลาด กรุณาลองใหม่')
      }
    } catch {
      pacesToast.error('เกิดข้อผิดพลาด กรุณาลองใหม่')
    } finally {
      setAccepting(false)
    }
  }

  // ── login แล้ว → หน้ารับคำเชิญ ────────────────────────────────────────────
  if (hasSession) {
    return (
      <div>
        {/* hero คำเชิญ — โลโก้ร้านคือสิ่งแรกที่ตาไปหยุด ตามด้วยชื่อร้านซึ่งเป็นข้อความใหญ่สุดในการ์ด */}
        <div className="mb-6 flex flex-col items-center text-center">
          <ShopAvatar shopLogo={shopLogo} shopName={shopName} size="lg" />
          <p className="text-default-500 mt-4 text-sm">คุณได้รับคำเชิญให้เข้าร่วม</p>
          <h4 className="text-default-900 mt-1 text-xl font-bold">{shopName}</h4>
          <span className="bg-primary/15 text-primary mt-3 inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold">
            <Icon icon="shield-check" aria-hidden="true" />
            ในฐานะผู้ดูแลร้าน
          </span>
        </div>

        <button
          type="button"
          onClick={handleAccept}
          disabled={accepting}
          className="btn bg-primary w-full py-3 font-semibold text-white hover:bg-primary-hover disabled:opacity-60"
        >
          {accepting ? (
            <>
              <span className="border-white me-2 inline-block size-4 animate-spin rounded-full border-2 border-t-transparent" />
              กำลังดำเนินการ...
            </>
          ) : (
            <>
              <Icon icon="check" className="me-2" />
              ยอมรับคำเชิญ
            </>
          )}
        </button>

        {/* ตอบความสับสนเดิมตรง ๆ: ผู้ถูกเชิญเคยถูกพาไป flow สร้างร้านจนไม่แน่ใจว่าต้องเปิดร้านไหม */}
        <div className="bg-success/15 text-success-ink mt-4 flex items-start gap-2 rounded-lg p-3 text-xs">
          <Icon icon="check" className="mt-0.5 shrink-0 text-base" aria-hidden="true" />
          <span>
            คุณจะเข้าใช้งาน<span className="font-semibold">ร้านนี้</span>ในฐานะผู้ดูแลได้ทันที
            ไม่ต้องสร้างร้านของตัวเอง
          </span>
        </div>

        {/* ทางออกเมื่อ login มาผิดบัญชี — เกิดง่ายมากเพราะคนกดลิงก์เชิญบนมือถือมักมี session
            บัญชีส่วนตัวค้างอยู่แล้ว ถ้าไม่มีปุ่มนี้จะไม่มีทางสลับบัญชีจากหน้านี้เลย
            (ยอมรับไปแล้วย้อนไม่ได้ — ผูก ShopMember กับ user ผิดคน) */}
        <p className="mt-5 text-center">
          <button
            type="button"
            onClick={() => signOut({ callbackUrl })}
            className="text-default-400 underline underline-offset-4 text-sm"
          >
            ไม่ใช่บัญชีของคุณ? เข้าสู่ระบบด้วยบัญชีอื่น
          </button>
        </p>
      </div>
    )
  }

  // ── ยังไม่ login: ฟอร์มเบอร์โทร ───────────────────────────────────────────
  if (guestMode === 'phone') {
    return <PhoneAuthSteps shopName={shopName} onBack={() => setGuestMode('choose')} />
  }

  // ── ยังไม่ login: เลือกวิธีเข้าสู่ระบบ ────────────────────────────────────
  return (
    <div>
      {/* แบนเนอร์บริบท — ต้องรู้ตลอดว่ากำลังจะเข้าร้านไหน */}
      <div className="bg-primary/10 mb-6 flex items-center gap-3 rounded-lg p-3">
        <ShopAvatar shopLogo={shopLogo} shopName={shopName} />
        <div className="min-w-0">
          <p className="text-default-900 truncate font-bold">{shopName}</p>
          <p className="text-default-500 text-sm">เชิญคุณเป็น &ldquo;ผู้ดูแลร้าน&rdquo;</p>
        </div>
      </div>

      {/* กลุ่มปุ่มเข้าสู่ระบบ — stack แนวตั้ง (copy จาก SignInForm.tsx) */}
      <div className="flex flex-col gap-3">
        {/* Apple อยู่บนสุด — Guideline 4.8 บังคับให้อยู่ระดับเดียวกับล็อกอินเจ้าอื่น ห้ามลดชั้น */}
        <button
          type="button"
          onClick={handleApple}
          className="btn border border-default-300 text-default-900 hover:border-default-400 hover:bg-default-50 w-full"
        >
          <BxIcon
            icon="bxl:apple"
            width={18}
            height={18}
            className="me-2 flex-shrink-0"
            style={{ color: '#000000' }} // brand asset Apple — carve-out จาก Paces token (Hard Rule 6)
          />
          เข้าสู่ระบบด้วย Apple
        </button>

        <button
          type="button"
          onClick={handleFacebook}
          className="btn border border-default-300 text-default-900 hover:border-default-400 hover:bg-default-50 w-full"
        >
          <BxIcon
            icon="bxl:facebook-circle"
            width={18}
            height={18}
            className="me-2 flex-shrink-0"
            style={{ color: '#1877f2' }} // brand asset Facebook — carve-out จาก Paces token (Hard Rule 6)
          />
          เข้าสู่ระบบด้วย Facebook
        </button>

        <button
          type="button"
          onClick={handleLine}
          className="btn border border-default-300 text-default-900 hover:border-default-400 hover:bg-default-50 w-full"
        >
          <BxIcon
            icon="ri:line-fill"
            width={18}
            height={18}
            className="me-2 flex-shrink-0"
            style={{ color: '#06C755' }} // brand asset LINE — carve-out จาก Paces token (Hard Rule 6)
          />
          เข้าสู่ระบบด้วย LINE
        </button>

        {/* ทางเข้าสำหรับคนที่ไม่มี FB/LINE — สมัครสั้นด้วยเบอร์โทร ไม่ต้องเปิดร้าน */}
        <button
          type="button"
          onClick={() => setGuestMode('phone')}
          className="btn border border-default-300 text-default-900 hover:border-default-400 hover:bg-default-50 w-full"
        >
          <Icon icon="phone" className="me-2 flex-shrink-0 text-lg text-default-500" aria-hidden="true" />
          ใช้เบอร์โทรศัพท์
        </button>
      </div>

      {/* dashed divider — copy structure จาก SignInForm.tsx */}
      <p className="relative my-5 text-center text-default-400 after:absolute after:start-0 after:end-0 after:top-2.75 after:h-0.75 after:border-t after:border-b after:border-dashed after:border-default-300">
        <span className="relative z-10 bg-card font-medium px-4">หรือ</span>
      </p>

      <p className="text-center">
        <Link
          href={`/auth/sign-in?callbackUrl=${encodeURIComponent(callbackUrl)}`}
          className="text-default-400 underline underline-offset-4 text-sm"
        >
          มีชื่อผู้ใช้และรหัสผ่านอยู่แล้ว? เข้าสู่ระบบ
        </Link>
      </p>
    </div>
  )
}
