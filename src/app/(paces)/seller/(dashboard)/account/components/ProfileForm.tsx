'use client'

/**
 * ProfileForm — การ์ด "ข้อมูลส่วนตัว" ของหน้า /account (feature 00026 B)
 *
 * Base:
 *   - card/card-header/form-input/form-label = theme/paces/Admin/TS/src/app/(admin)/apps/users/account-settings/page.tsx
 *   - avatar tap-to-change (label + sr-only input + icon สลับตอน uploading) =
 *     src/app/(paces)/seller/(dashboard)/shop/components/ShopMobileHero.tsx:110-140
 *     ปรับ rounded-lg → rounded-full โดยตั้งใจ: วงกลม = คน, สี่เหลี่ยมมน = ร้าน (ตาม AccountAvatar
 *     kind convention ที่แอปใช้อยู่แล้ว) — เป็นสัญญาณว่าหน้านี้ไม่ใช่ /shop
 *   - realtime availability check (idle/checking/ok/taken/invalid + debounce + invalid-msg) =
 *     src/app/(paces)/seller/onboarding/page.tsx (slug check) แต่คนละ endpoint
 *
 * flow อัปโหลดรูป: POST /api/upload → fileId → PATCH /api/users/me { avatar: '/api/files/{id}' }
 * (pattern เดียวกับฝั่ง buyer src/app/(marketing)/m/settings/profile/AvatarEditable.tsx)
 * avatar เซฟทันทีไม่รอปุ่มบันทึก — ปุ่มบันทึกคุมเฉพาะ displayName/username/email (PATCH เดียว)
 */

import AccountAvatar from '@/components/AccountAvatar'
import Icon from '@/components/wrappers/Icon'
import { pacesToast } from '@/lib/paces-toast'
import { uploadFileId } from '@/lib/upload-client'
import Swal from 'sweetalert2'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useRef, useState } from 'react'

const ACCEPT = 'image/png,image/jpeg,image/webp'
// รูปแบบเดียวกับ UpdateProfileSchema ฝั่ง server — client เช็คก่อนเพื่อบอกเร็ว ไม่ใช่เพื่อกัน
const USERNAME_RE = /^[a-z0-9_]{3,30}$/
type Check = 'idle' | 'checking' | 'ok' | 'taken' | 'invalid'

interface Props {
  user: {
    displayName: string
    username: string
    avatar: string | null
    email: string | null
    phone: string | null
  }
}

export default function ProfileForm({ user }: Props) {
  const router = useRouter()
  const { update } = useSession()

  const [avatar, setAvatar] = useState(user.avatar)
  const [avatarBusy, setAvatarBusy] = useState(false)

  const [displayName, setDisplayName] = useState(user.displayName)
  const [username, setUsername] = useState(user.username)
  const [uStatus, setUStatus] = useState<Check>('idle')
  const [saving, setSaving] = useState(false)

  const usernameChanged = username.trim().toLowerCase() !== user.username
  // email ไม่อยู่ใน dirty — ช่องถูก disabled และ server ยังไม่รับ field นี้ (ดูคอมเมนต์ที่ช่องอีเมล)
  const dirty = displayName.trim() !== user.displayName || usernameChanged

  // debounce เช็คชื่อผู้ใช้ — ยิงเฉพาะตอนค่าต่างจากเดิมจริง (ค่าเดิมถือว่าใช้ได้เสมอ)
  useEffect(() => {
    if (!usernameChanged) {
      setUStatus('idle')
      return
    }
    const next = username.trim().toLowerCase()
    if (!USERNAME_RE.test(next)) {
      setUStatus('invalid')
      return
    }
    setUStatus('checking')
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/account/check-username?username=${encodeURIComponent(next)}`)
        const d = (await res.json()) as { available?: boolean }
        setUStatus(d.available ? 'ok' : 'taken')
      } catch {
        // เช็คไม่ได้ → ไม่บล็อกการกดบันทึก (PATCH จะเช็คซ้ำและคืน 409 เองถ้าซ้ำจริง)
        setUStatus('idle')
      }
    }, 400)
    return () => clearTimeout(t)
  }, [username, usernameChanged])

  const uploadAvatar = useCallback(
    async (file: File) => {
      setAvatarBusy(true)
      try {
        // direct upload (2026-08-10) — ไม่ผ่าน body ของ function ที่ Vercel จำกัด 4.5MB
        const fileId = await uploadFileId(file, 'IMAGE')
        const next = `/api/files/${fileId}`
        const save = await fetch('/api/users/me', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ avatar: next }),
        })
        if (!save.ok) throw new Error()
        setAvatar(next)
        pacesToast.success('เปลี่ยนรูปโปรไฟล์แล้ว')
        // update() = สั่ง next-auth ดึง session ใหม่ (session callback อ่าน avatar สดจาก DB)
        // ไม่งั้นรูปบน topbar ยังเป็นของเก่าจนกว่าจะ login ใหม่
        await update()
        router.refresh()
      } catch {
        pacesToast.error('เปลี่ยนรูปไม่สำเร็จ กรุณาลองใหม่')
      } finally {
        setAvatarBusy(false)
      }
    },
    [router, update],
  )

  const removeAvatar = useCallback(async () => {
    setAvatarBusy(true)
    try {
      const res = await fetch('/api/users/me', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ avatar: null }),
      })
      if (!res.ok) throw new Error()
      setAvatar(null)
      pacesToast.success('ลบรูปโปรไฟล์แล้ว')
      await update()
      router.refresh()
    } catch {
      pacesToast.error('ลบรูปไม่สำเร็จ กรุณาลองใหม่')
    } finally {
      setAvatarBusy(false)
    }
  }, [router, update])

  const save = useCallback(async () => {
    if (saving || !dirty) return
    if (!displayName.trim()) {
      pacesToast.error('กรุณากรอกชื่อที่แสดง')
      return
    }
    setSaving(true)
    try {
      const body: Record<string, string> = { displayName: displayName.trim() }
      if (usernameChanged) body.username = username.trim().toLowerCase()
      const res = await fetch('/api/users/me', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (res.status === 409) {
        setUStatus('taken')
        pacesToast.error('ชื่อผู้ใช้นี้มีคนใช้แล้ว')
        return
      }
      if (!res.ok) {
        pacesToast.error('บันทึกไม่สำเร็จ กรุณาลองใหม่')
        return
      }
      pacesToast.success('บันทึกข้อมูลแล้ว')
      await update()
      router.refresh()
    } catch {
      pacesToast.error('บันทึกไม่สำเร็จ กรุณาลองใหม่')
    } finally {
      setSaving(false)
    }
  }, [saving, dirty, displayName, username, usernameChanged, router, update])

  /**
   * เพิ่มเบอร์โทร 2 ขั้นด้วย Swal input (Base: ConnectedAccountsClient.tsx ajax-input Swal pattern)
   *
   * ทำไมไม่ลิงก์ไป /register ที่มี flow นี้อยู่แล้ว: proxy ปล่อยให้เข้า /register ได้เฉพาะตอน
   * needsRegistration = true ซึ่งเป็น false สำหรับผู้ถูกเชิญที่ยังไม่มีร้านส่วนตัว (feature 00012 +
   * onboarding-gate ของ 00026) — กดแล้วจะถูกเด้งกลับ /dashboard ทันที คือปุ่มที่ไม่ทำอะไรเลย
   */
  const addPhone = useCallback(async () => {
    const phoneRes = await Swal.fire({
      title: 'เพิ่มเบอร์โทร',
      text: 'ตั้งได้ครั้งเดียวและเปลี่ยนไม่ได้ ใช้ยืนยันตัวตนและกู้คืนบัญชี',
      input: 'text',
      inputAttributes: { inputmode: 'tel', maxlength: '10', autocomplete: 'off' },
      inputPlaceholder: '0812345678',
      buttonsStyling: false,
      showCancelButton: true,
      confirmButtonText: 'ส่งรหัส OTP',
      cancelButtonText: 'ยกเลิก',
      customClass: {
        confirmButton: 'btn bg-primary text-white hover:bg-primary-hover mt-2 me-2',
        cancelButton: 'btn bg-light hover:text-default-800 mt-2',
      },
      preConfirm: async (value: string) => {
        const phone = (value ?? '').trim()
        if (!/^0[0-9]{9}$/.test(phone)) {
          Swal.showValidationMessage('กรุณากรอกเบอร์ 10 หลักที่ขึ้นต้นด้วย 0')
          return false
        }
        const res = await fetch('/api/otp/send', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ contact: phone, type: 'PHONE' }),
        })
        if (!res.ok) {
          Swal.showValidationMessage('ส่งรหัสไม่สำเร็จ กรุณาลองใหม่')
          return false
        }
        return phone
      },
    })
    if (!phoneRes.isConfirmed || !phoneRes.value) return
    const phone = phoneRes.value as string

    // deny button = "ส่งรหัสใหม่" — SMS ในไทยดีเลย์ 30-60 วิเป็นเรื่องปกติ ถ้าไม่มีปุ่มนี้ทางออก
    // เดียวของคนที่รอไม่เห็นรหัสคือกดยกเลิกแล้วเริ่มใหม่ทั้งชุด ซึ่งคนส่วนมากตีความว่าระบบพัง
    const otpRes = await Swal.fire({
      title: 'ใส่รหัส OTP',
      html: `เราส่งรหัส 6 หลักไปที่ <b>${phone}</b> แล้ว<br/><span class="text-default-500 text-xs">ยืนยันแล้วจะเปลี่ยนเบอร์ไม่ได้อีก</span>`,
      icon: 'question',
      input: 'text',
      inputAttributes: { inputmode: 'numeric', maxlength: '6', autocomplete: 'one-time-code' },
      buttonsStyling: false,
      showCancelButton: true,
      showDenyButton: true,
      confirmButtonText: 'ยืนยัน',
      denyButtonText: 'ส่งรหัสใหม่',
      cancelButtonText: 'ยกเลิก',
      customClass: {
        confirmButton: 'btn bg-primary text-white hover:bg-primary-hover mt-2 me-2',
        denyButton: 'btn bg-light hover:text-default-800 mt-2 me-2',
        cancelButton: 'btn bg-light hover:text-default-800 mt-2',
      },
      preConfirm: async (value: string) => {
        const otp = (value ?? '').trim()
        if (!/^[0-9]{6}$/.test(otp)) {
          Swal.showValidationMessage('รหัส OTP ต้องเป็นตัวเลข 6 หลัก')
          return false
        }
        const res = await fetch('/api/account/set-phone', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ phone, otp }),
        })
        if (!res.ok) {
          const d = (await res.json().catch(() => null)) as { error?: string } | null
          Swal.showValidationMessage(d?.error ?? 'ยืนยันไม่สำเร็จ กรุณาลองใหม่')
          return false
        }
        return true
      },
    })
    // กด "ส่งรหัสใหม่" → ยิง OTP ซ้ำแล้ววนกลับมาที่จอเดิม (เบอร์เดิม ไม่ต้องพิมพ์ใหม่)
    if (otpRes.isDenied) {
      const res = await fetch('/api/otp/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contact: phone, type: 'PHONE' }),
      })
      if (res.ok) pacesToast.success('ส่งรหัสใหม่แล้ว')
      else pacesToast.error('ส่งรหัสไม่สำเร็จ กรุณาลองใหม่')
      return
    }
    if (!otpRes.isConfirmed) return

    pacesToast.success('เพิ่มเบอร์โทรแล้ว')
    await update()
    router.refresh()
  }, [router, update])

  const saveBlocked = saving || !dirty || uStatus === 'checking' || uStatus === 'taken' || uStatus === 'invalid'

  return (
    <form
      className="card"
      onSubmit={(e) => {
        e.preventDefault()
        save()
      }}
    >
      {/* section header เส้นประ = ลายเซ็น Paces (theme account-settings/page.tsx:32-35) ตัด
          uppercase ออกตาม Sentence-Case Rule เพราะข้อความไทย
          เคยตัด header นี้ทิ้งรอบแก้ Impeccable ด้วยเหตุผลว่า "ซ้ำกับ /shop จนแยกไม่ออก" ซึ่ง
          ตรวจแล้วไม่จริง — ShopForm ไม่ได้ใช้ h5 เส้นประเลย (ใช้ไอคอนวงกลม + stepper คนละแบบ)
          และการมี header แค่การ์ดเดียวในหน้าที่มี 2 การ์ด อ่านเหมือนบั๊กมากกว่างานออกแบบ */}
      <div className="card-header">
        <h5 className="bg-light/15 border-default-300 flex w-full items-center justify-center gap-1.5 rounded border border-dashed p-1.25 text-sm font-medium">
          <Icon icon="user-circle" className="text-base" aria-hidden="true" />
          ข้อมูลส่วนตัว
        </h5>
      </div>

      <div className="card-body">
        {/* avatar + ชื่อ + badge — badge ใช้สไตล์เดียวกับ "ส่วนตัว" ใน account switcher
            เพื่อให้จับ visual grammar เดียวกันข้ามหน้า ไม่ใช่ศัพท์ภาพใหม่ */}
        <div className="mb-5 flex items-center gap-4">
          <label
            htmlFor="account-avatar"
            className="ring-card bg-light focus-within:ring-primary relative block size-20 shrink-0 cursor-pointer overflow-hidden rounded-full ring-4"
          >
            {avatarBusy ? (
              <span className="text-default-400 flex h-full w-full items-center justify-center">
                <Icon icon="loader-2" className="animate-spin text-xl" aria-hidden="true" />
              </span>
            ) : (
              <AccountAvatar src={avatar} kind="personal" className="h-full w-full" />
            )}
            <input
              id="account-avatar"
              type="file"
              accept={ACCEPT}
              className="sr-only"
              disabled={avatarBusy}
              onChange={(e) => {
                const f = e.target.files?.[0]
                // reset value — เลือกไฟล์เดิมซ้ำต้อง trigger onChange ได้อีก
                e.target.value = ''
                if (f) uploadAvatar(f)
              }}
            />
          </label>

          <div className="min-w-0">
            {/* ไม่มีป้ายข้างชื่อ (user ตัดสิน 2026-08-03): เคยมีป้าย "ไม่ผูกกับร้านไหน" ตรงนี้ แต่พอ
                วางติดชื่อคนแล้วอ่านรวดเดียวเป็น "<ชื่อ> · ไม่ผูกกับร้านไหน" = บรรยายตัวคนว่าไม่ได้
                สังกัดร้านไหน ซึ่งผิดและน่าตกใจสำหรับคนที่มีร้านอยู่หลายร้าน (user ถามเองว่าป้ายนี้
                คืออะไร = หลักฐานว่ามันสื่อไม่สำเร็จ)
                subtitle ที่เคยอธิบายเรื่องนี้ก็ถูกลบตามไปด้วย (user 2026-08-03 "มันแปลกมาก") — ทั้งป้าย
                และประโยคเกิดขึ้นตอน IA ยังพัง (/account ซ่อนในกลุ่ม "ร้านค้า" ลำดับ 8) จึงต้องแก้ต่าง
                ให้ตัวเอง พอย้ายมาเป็นกลุ่มเมนู "บัญชีของฉัน" ของตัวเองแล้ว บริบทบอกครบก่อนอ่าน
                ข้อความใด ๆ ด้วยซ้ำ — คำอธิบายที่เคยจำเป็นจึงกลายเป็นส่วนเกิน */}
            <span className="block truncate font-semibold">{user.displayName}</span>
            <div className="mt-1 flex items-center gap-3 text-sm">
              {/* min-h-11 + -my-2.5 — tap target 44px โดยที่กล่องข้อความไม่ดันบรรทัดให้ห่างขึ้น */}
              <label
                htmlFor="account-avatar"
                className="text-primary -my-2.5 inline-flex min-h-11 cursor-pointer items-center hover:underline"
              >
                เปลี่ยนรูป
              </label>
              {avatar && (
                <button
                  type="button"
                  onClick={removeAvatar}
                  disabled={avatarBusy}
                  className="text-default-500 hover:text-danger -my-2.5 inline-flex min-h-11 items-center disabled:opacity-50"
                >
                  ลบรูป
                </button>
              )}
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-4">
          <div>
            <label className="form-label" htmlFor="account-display-name">
              ชื่อที่แสดง
            </label>
            <input
              id="account-display-name"
              className="form-input"
              value={displayName}
              maxLength={100}
              onChange={(e) => setDisplayName(e.target.value)}
            />
          </div>

          <div>
            <label className="form-label" htmlFor="account-username">
              ชื่อผู้ใช้
            </label>
            <input
              id="account-username"
              className={`form-input${uStatus === 'taken' || uStatus === 'invalid' ? ' is-invalid' : ''}`}
              value={username}
              maxLength={30}
              autoCapitalize="none"
              autoComplete="off"
              aria-describedby="account-username-help"
              onChange={(e) => setUsername(e.target.value)}
            />
            <p id="account-username-help" className="mt-1.5 text-xs">
              {uStatus === 'invalid' && (
                <span className="text-danger">ใช้ a-z, 0-9 และ _ ความยาว 3-30 ตัวอักษร</span>
              )}
              {uStatus === 'taken' && <span className="text-danger">ชื่อผู้ใช้นี้มีคนใช้แล้ว</span>}
              {uStatus === 'checking' && <span className="text-default-400">กำลังตรวจสอบ...</span>}
              {uStatus === 'ok' && (
                // 2 ท่อน: ยืนยันก่อนว่า "ใช้ได้" (เขียว) แล้วค่อยบอกผลที่ตามมา — เดิมมีแต่ท่อนเตือน
                // สีเหลืองซึ่งผู้ใช้อ่านเป็น "กรอกผิด" ทั้งที่ระบบกำลังบอกว่าชื่อนี้ว่าง
                <>
                  <span className="text-success-ink">ชื่อนี้ว่างอยู่ ใช้ได้</span>
                  <span className="text-default-700 block">
                    เปลี่ยนแล้วลิงก์เดิม /u/{user.username} จะใช้ไม่ได้อีก ต้องแชร์ลิงก์ใหม่แทน
                  </span>
                </>
              )}
              {uStatus === 'idle' && (
                <span className="text-default-500">ลิงก์โปรไฟล์ของคุณคือ /u/{user.username}</span>
              )}
            </p>
          </div>

          <div>
            <label className="form-label" htmlFor="account-email">
              อีเมล
            </label>
            <input
              id="account-email"
              className="form-input"
              type="email"
              placeholder="ยังไม่ได้ระบุ"
              defaultValue={user.email ?? ''}
              disabled
            />
            {/* ยังแก้ไม่ได้จริง — UpdateProfileSchema ฝั่ง server ยังไม่รับ email (ต้องคิดเรื่อง
                ยืนยันอีเมลก่อน ไม่งั้นเป็นช่องอ้างสิทธิ์อีเมลคนอื่น) จึง disabled แทนที่จะให้พิมพ์
                แล้วเงียบ ๆ ไม่บันทึก */}
            <p className="text-default-500 mt-1.5 text-xs">แก้ไขอีเมลได้เร็ว ๆ นี้</p>
          </div>

          {/* เบอร์โทร — read-only เสมอ (immutable rule: ตั้งครั้งเดียว มีผลต่อ Trust Score) */}
          <div>
            <label className="form-label">เบอร์โทร</label>
            {user.phone ? (
              <div className="border-default-200 flex items-center gap-2 rounded-lg border px-3 py-2.5">
                <Icon icon="phone" className="text-default-400 shrink-0" aria-hidden="true" />
                <span className="flex-1 truncate">{user.phone}</span>
                <span className="badge bg-success/15 text-success-ink inline-flex shrink-0 items-center gap-1">
                  <Icon icon="circle-check" className="size-3" aria-hidden="true" />
                  ยืนยันแล้ว
                </span>
              </div>
            ) : (
              <div className="border-default-300 flex items-center gap-2 rounded-lg border border-dashed px-3 py-2.5">
                <Icon icon="phone" className="text-default-400 shrink-0" aria-hidden="true" />
                <span className="text-default-500 flex-1 text-sm">ยังไม่ได้เพิ่มเบอร์โทร</span>
                <button
                  type="button"
                  onClick={addPhone}
                  className="btn btn-sm bg-primary/15 text-primary min-h-11 shrink-0"
                >
                  เพิ่มเบอร์โทร
                </button>
              </div>
            )}
            <p className="text-default-700 mt-1.5 text-xs">
              {user.phone
                ? 'เปลี่ยนไม่ได้หลังตั้งค่าแล้ว เพื่อความปลอดภัยของบัญชีคุณ'
                : 'ใช้ยืนยันตัวตนและกู้คืนบัญชี ตั้งได้ครั้งเดียวเปลี่ยนไม่ได้'}
            </p>
          </div>
        </div>

        <div className="mt-5">
          <button
            type="submit"
            disabled={saveBlocked}
            className="btn bg-primary text-white hover:bg-primary-hover min-h-11 disabled:opacity-50"
          >
            {saving ? 'กำลังบันทึก...' : 'บันทึกการเปลี่ยนแปลง'}
          </button>
        </div>
      </div>
    </form>
  )
}
