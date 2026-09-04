'use client'

/**
 * ChooseShopClient — grid เลือกร้าน (client) ของ /choose-shop (feature 00012 Screen 3)
 *
 * Base:
 *   - card grid = theme/paces/Admin/TS/src/app/(admin)/ui/cards/page.tsx
 *     (grid grid-cols-* gap-base ห่อด้วย .card)
 *   - avatar initials fallback = src/app/(paces)/seller/(dashboard)/inbox/components/InboxList.tsx:50-71
 *     (BuyerAvatar pattern: img ถ้ามี logo จริง → onError fallback initials วงกลม bg-primary/10 text-primary)
 *   - switch-context flow = src/layouts/components/TopBar/components/UserDropdownDetailed.tsx:91-120
 *     (handleSwitch: POST switch-context → session.update({activeShopId}) → navigate)
 *   - empty-state โครง (icon วงกลม + title + desc + CTA) =
 *     src/app/(paces)/seller/(dashboard)/business/create/page.tsx:96-130 (GateCard)
 *
 * UX spec: docs/superpowers/specs/2026-07-04-shop-staff-invite-link-ux-spec.md (Screen 3)
 */

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useSession } from 'next-auth/react'
import Icon from '@/components/wrappers/Icon'
import { pacesToast } from '@/lib/paces-toast'
import { generateInitials } from '@/utils/helpers'

export interface ShopOption {
  shopId: string
  name: string
  logo: string | null
  role: 'OWNER' | 'ADMIN'
}

const ROLE_LABEL: Record<ShopOption['role'], string> = { OWNER: 'เจ้าของ', ADMIN: 'ผู้ดูแล' }
const ROLE_BADGE: Record<ShopOption['role'], string> = {
  OWNER: 'bg-primary/15 text-primary',
  ADMIN: 'bg-info/15 text-info',
}

/** avatar ร้าน — รูปจริง (Shop.logo เป็น URL ตรง ตาม SellerHeader.tsx) + fallback initials */
function ShopAvatar({ logo, name }: { logo: string | null; name: string }) {
  const [failed, setFailed] = useState(false)
  if (!logo || failed) {
    return (
      <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary font-semibold">
        {generateInitials(name) || '?'}
      </span>
    )
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={logo}
      alt={name}
      onError={() => setFailed(true)}
      className="size-11 shrink-0 rounded-full object-cover"
    />
  )
}

export default function ChooseShopClient({
  shops,
  hideOpenShop = false,
}: {
  shops: ShopOption[]
  /**
   * ซ่อนปุ่ม "เปิดร้านของฉัน" — เปิดจากในแอป iOS (Apple Guideline 3.1.1)
   *
   * 🛑 นี่คือ **ต้นทาง** ของการเป็นผู้ขาย: กดปุ่มนี้ = สร้างร้าน → proxy บังคับไป
   * `/register` → `/onboarding` ซึ่งคือ "ฟอร์มลงทะเบียนกิจการ" ที่ Apple สั่งให้เอาออก
   *
   * เลือกปิดที่นี่แทนการปิดปลายทาง เพราะปิดปลายทาง (`/register`, `/onboarding`)
   * ทำให้คนที่ค้างกลางทาง **ติดตายเข้าแอปไม่ได้เลย** — เกิดขึ้นจริงกับ 4 บัญชีบน prod
   * ระหว่าง 2026-08-25 ถึง 09-04 (ดูหัวไฟล์ `seller/register/page.tsx`)
   *
   * 🛑 นี่คือ UX ไม่ใช่การควบคุมสิทธิ์ — `POST /api/shops/open-personal` ยังเรียกตรงได้
   * ซึ่งยอมรับได้ เพราะกฎของ Apple ครอบ "สิ่งที่ผู้ใช้เห็นและกดได้ในแอป" ไม่ใช่ API
   */
  hideOpenShop?: boolean
}) {
  const router = useRouter()
  const { update } = useSession()
  const [switching, setSwitching] = useState(false)
  const [opening, setOpening] = useState(false)
  const [linkInput, setLinkInput] = useState('')
  const [linkError, setLinkError] = useState('')

  // เลือกร้าน → ต่อ handleSwitch pattern เดียวกับ UserDropdownDetailed.tsx:91-120
  const handleSwitch = async (shopId: string) => {
    if (switching) return
    setSwitching(true)
    try {
      const res = await fetch('/api/business/switch-context', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ shopId }),
      })
      if (res.status === 403) {
        pacesToast.error('ไม่มีสิทธิ์เข้าถึงร้านนี้แล้ว')
        return
      }
      if (!res.ok) {
        pacesToast.error('สลับร้านไม่สำเร็จ กรุณาลองใหม่')
        return
      }
      // jwt callback re-verify membership อีกชั้นก่อนเชื่อค่านี้จริง (2-layer verify)
      await update({ activeShopId: shopId })
      router.push('/dashboard')
    } catch {
      pacesToast.error('สลับร้านไม่สำเร็จ กรุณาลองใหม่')
    } finally {
      setSwitching(false)
    }
  }

  // "เปิดร้านของฉัน(เอง)" — ทั้ง 0-shop state และปุ่ม secondary ใน grid state เรียกอันเดียวกัน
  const handleOpenPersonal = async () => {
    if (opening) return
    setOpening(true)
    try {
      const res = await fetch('/api/shops/open-personal', { method: 'POST' })
      if (!res.ok) {
        pacesToast.error('เปิดร้านไม่สำเร็จ กรุณาลองใหม่')
        return
      }
      const data = (await res.json()) as { shopId: string }
      await update({ activeShopId: data.shopId })
      router.push('/onboarding')
    } catch {
      pacesToast.error('เปิดร้านไม่สำเร็จ กรุณาลองใหม่')
    } finally {
      setOpening(false)
    }
  }

  // parse slug จากลิงก์เชิญที่วาง — รับทั้ง URL เต็ม (.../i/<slug>) หรือ slug ล้วน
  const handleLinkGo = () => {
    setLinkError('')
    const trimmed = linkInput.trim()
    if (!trimmed) return
    const urlMatch = trimmed.match(/\/i\/([a-zA-Z0-9_-]+)\/?$/)
    const slug = urlMatch ? urlMatch[1] : /^[a-zA-Z0-9_-]+$/.test(trimmed) ? trimmed : null
    if (!slug) {
      setLinkError('ลิงก์ไม่ถูกต้อง')
      return
    }
    router.push(`/i/${slug}`)
  }

  // 0 ร้าน — empty state (GateCard-โครง)
  if (shops.length === 0) {
    return (
      <div className="text-center">
        <div className="mb-4 flex justify-center">
          <div className="flex size-14 items-center justify-center rounded-full bg-primary/15 text-primary">
            <Icon icon="building-store" className="size-7" aria-hidden="true" />
          </div>
        </div>
        <h3 className="mb-1.25 text-xl font-bold">ยังไม่มีร้านค้าของคุณ</h3>
        <p className="text-default-400 mb-5">เริ่มขายของออนไลน์ได้ทันที หรือวางลิงก์เชิญถ้ามีคนแชร์มาให้</p>

        {!hideOpenShop && (
          <button
            type="button"
            onClick={handleOpenPersonal}
            disabled={opening}
            className="btn bg-primary text-white hover:bg-primary-hover w-full disabled:opacity-50"
          >
            {opening ? 'กำลังเปิดร้าน...' : 'เปิดร้านของฉัน'}
          </button>
        )}

        <div className="mt-5 text-start">
          <label className="form-label">มีลิงก์เชิญ? วางที่นี่</label>
          <div className="input-icon-group">
            <Icon icon="link" className="input-icon" aria-hidden="true" />
            <input
              className="form-input"
              placeholder="deepthailand.app/i/xxxxxxxxxxxx"
              value={linkInput}
              onChange={(e) => {
                setLinkInput(e.target.value)
                setLinkError('')
              }}
            />
          </div>
          {linkError && <p className="invalid-msg mt-1 text-sm text-danger">{linkError}</p>}
          <button
            type="button"
            onClick={handleLinkGo}
            className="btn bg-default-100 text-default-700 hover:bg-default-200 mt-2 w-full"
          >
            ไป
          </button>
        </div>
      </div>
    )
  }

  // >=2 ร้าน — grid เลือกร้าน
  return (
    <div>
      <h4 className="font-bold mb-2 text-default-900 text-lg text-center">เลือกร้านที่จะเข้าใช้งาน</h4>
      <p className="text-default-400 mb-5 text-center">คุณมีสิทธิ์เข้าถึงหลายร้าน — เลือกร้านที่ต้องการ</p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {shops.map((s) => (
          <button
            key={s.shopId}
            type="button"
            onClick={() => handleSwitch(s.shopId)}
            disabled={switching}
            className="card flex items-center gap-3 p-4 text-start hover:bg-primary/5 disabled:opacity-50"
          >
            <ShopAvatar logo={s.logo} name={s.name} />
            <div className="min-w-0 flex-1">
              <p className="truncate font-semibold text-default-900">{s.name}</p>
              <span className={`badge mt-1 inline-block ${ROLE_BADGE[s.role]}`}>{ROLE_LABEL[s.role]}</span>
            </div>
          </button>
        ))}
      </div>

      {!hideOpenShop && (
        <>
          <button
            type="button"
            onClick={handleOpenPersonal}
            disabled={opening}
            className="btn border border-dashed border-default-300 text-primary hover:bg-primary/5 mt-4 inline-flex w-full items-center justify-center gap-1.5 disabled:opacity-50"
          >
            <Icon icon="plus" aria-hidden="true" />
            {opening ? 'กำลังเปิดร้าน...' : 'เปิดร้านของฉันเอง (เป็นผู้ขาย)'}
          </button>

          <p className="text-2xs text-default-400 mt-3 text-center">
            ถูกเชิญเป็นผู้ดูแล = ยังไม่ถือเป็นผู้ขาย และไม่มีร้านของตัวเอง — เปิดร้านเองได้ทุกเมื่อ
          </p>
        </>
      )}
    </div>
  )
}
