'use client'

/**
 * InviteLandingClient — เนื้อหาในหน้า /i/[slug] (feature 00012, Task 4.2)
 *
 * Base:
 * - Social FB/LINE button JSX = copy ตรงจาก
 *   src/app/(paces)/seller/auth/sign-in/components/SignInForm.tsx:93-148
 *   (theme ต้นทาง: theme/paces/Admin/TS/src/app/auth/card/sign-in/components/Form.tsx)
 * - dashed divider = copy structure เดียวกับ SignInForm.tsx (theme dashed-divider pattern)
 * - avatar initials fallback = mirror
 *   src/app/(paces)/seller/(dashboard)/inbox/components/InboxList.tsx (BuyerAvatar)
 * - spinner บนปุ่ม = mirror src/app/(paces)/seller/onboarding/page.tsx (border-primary animate-spin) ย่อขนาด
 *
 * Flow:
 * - ยังไม่ login → ปุ่ม FB/LINE (callbackUrl กลับมาที่ /i/<slug>) + divider "หรือ" + ลิงก์ไปหน้า sign-in ทั่วไป
 * - login แล้ว → ปุ่ม "ยอมรับคำเชิญ" → POST /api/i/<slug>/accept → session.update(activeShopId) → /dashboard
 */

import { Icon as BxIcon } from '@iconify/react'
import { signIn, useSession } from 'next-auth/react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import Icon from '@/components/wrappers/Icon'
import { pacesToast } from '@/lib/paces-toast'
import { generateInitials } from '@/utils/helpers'

interface InviteLandingClientProps {
  shopName: string
  shopLogo: string | null
  slug: string
  hasSession: boolean
}

/** avatar ร้าน — รูปจริง (ถ้ามี) + fallback initials (mirror BuyerAvatar ใน InboxList.tsx) */
function ShopAvatar({ shopLogo, shopName }: { shopLogo: string | null; shopName: string }) {
  const [failed, setFailed] = useState(false)
  const src = shopLogo ? (shopLogo.startsWith('http') ? shopLogo : `/api/files/${shopLogo}`) : null
  if (!src || failed) {
    return (
      <span className="bg-primary/10 text-primary flex size-11 shrink-0 items-center justify-center rounded-full text-base font-semibold">
        {generateInitials(shopName) || '?'}
      </span>
    )
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={shopName}
      className="size-11 shrink-0 rounded-full object-cover"
      onError={() => setFailed(true)}
    />
  )
}

export default function InviteLandingClient({ shopName, shopLogo, slug, hasSession }: InviteLandingClientProps) {
  const router = useRouter()
  const { update } = useSession()
  const [accepting, setAccepting] = useState(false)

  const callbackUrl = `/i/${slug}`

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

  return (
    <div>
      {/* invite banner */}
      <div className="bg-primary/10 mb-6 flex items-center gap-3 rounded-lg p-3">
        <ShopAvatar shopLogo={shopLogo} shopName={shopName} />
        <div className="min-w-0">
          <p className="truncate font-bold text-default-900">{shopName}</p>
          <p className="text-default-500 text-sm">เชิญคุณเป็น &ldquo;ผู้ดูแลร้าน&rdquo;</p>
        </div>
      </div>

      {!hasSession ? (
        <>
          {/* กลุ่มปุ่ม Social Login — stack แนวตั้ง (copy จาก SignInForm.tsx:93-148) */}
          <div className="flex flex-col gap-3">
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
                style={{ color: '#1877f2' }}
              />
              เข้าสู่ระบบด้วย Facebook
            </button>

            <button
              type="button"
              onClick={handleLine}
              className="btn border border-default-300 text-default-900 hover:border-default-400 hover:bg-default-50 w-full"
            >
              {/* LINE brand green #06C755 — brand asset exception จาก Paces token (Hard Rule 6) */}
              <BxIcon
                icon="ri:line-fill"
                width={18}
                height={18}
                className="me-2 flex-shrink-0"
                style={{ color: '#06C755' }}
              />
              เข้าสู่ระบบด้วย LINE
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
              เข้าสู่ระบบด้วยวิธีอื่น
            </Link>
          </p>
        </>
      ) : (
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
      )}
    </div>
  )
}
