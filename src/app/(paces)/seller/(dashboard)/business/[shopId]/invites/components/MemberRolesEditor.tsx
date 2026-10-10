'use client'

/**
 * MemberRolesEditor — ปุ่ม "แก้ไขบทบาท" + โมดัลเลือกบทบาทของพนักงาน (00071 P2 · T5)
 *
 * Base: theme/paces/Admin/TS/src/app/(admin)/apps/ecommerce/categories/components/AddCategoryModal.tsx
 *   (card > card-header + card-body + footer border-t) แปลงเป็น controlled ตาม in-app precedent
 *   src/app/(paces)/seller/(dashboard)/wallet/components/TopUpRequestModal.tsx
 * Base (ปุ่ม): theme/paces/Admin/TS/src/app/(admin)/ui/badges/page.tsx ใช้ btn bg-light
 * Spec: docs/superpowers/specs/2026-10-10-00071-p2-role-picker-ux-spec.md
 */

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import Icon from '@/components/wrappers/Icon'
import StaffRolePicker from '@/components/paces/StaffRolePicker'
import { pacesToast } from '@/lib/paces-toast'
import { useLockBodyScroll } from '@/hooks/useLockBodyScroll'
import { STAFF_ROLES } from '@/lib/shop-permissions'
import { canSubmitRoles, rolesDiffer, type StaffRole } from '@/lib/shop-role-picker'
import { memberErrorText } from './member-error-text'
import { useCanAskToBuy } from '@/components/paces/PaymentRestrictionProvider'

// ล้าสมัย = โหลดใหม่ให้เห็นสิทธิ์ปัจจุบัน (NOT_A_MEMBER ปิดโมดัลด้วย)
const STALE = new Set(['NOT_OWNER', 'FORBIDDEN_ROLE', 'NOT_A_MEMBER', 'PRIMARY_OWNER_LOCKED'])

interface Props {
  shopId: string
  memberId: string
  name: string
  /** roles ปัจจุบันจาก server (ผ่านตัวกรองบทบาทที่รู้จักแล้วเท่านั้น) */
  roles: string[]
  billingAvailable: boolean
  primaryOwnerName: string
}

export default function MemberRolesEditor({ shopId, memberId, name, roles, billingAvailable, primaryOwnerName }: Props) {
  const [open, setOpen] = useState(false)
  const launcherRef = useRef<HTMLButtonElement | null>(null)
  const wasOpen = useRef(false)

  // คืนโฟกัสที่ปุ่มตอนปิด — controlled modal ไม่ได้ฟรีเหมือน Preline
  useEffect(() => {
    if (wasOpen.current && !open) launcherRef.current?.focus()
    wasOpen.current = open
  }, [open])

  return (
    <>
      <button
        ref={launcherRef}
        type="button"
        onClick={() => setOpen(true)}
        aria-label={`แก้ไขบทบาทของ ${name}`}
        className="btn bg-light hover:text-primary min-h-11 inline-flex items-center gap-1.5 text-xs"
      >
        <Icon icon="pencil" aria-hidden="true" />
        แก้ไขบทบาท
      </button>
      {open && (
        <RolesDialog
          shopId={shopId}
          memberId={memberId}
          name={name}
          roles={roles}
          billingAvailable={billingAvailable}
          primaryOwnerName={primaryOwnerName}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  )
}

// แยก component ระดับ module (ไม่ประกาศใน render) — draft เริ่มจาก props ทุกครั้งที่เปิด เพราะ mount ใหม่
function RolesDialog({
  shopId, memberId, name, roles, billingAvailable, primaryOwnerName, onClose,
}: Props & { onClose: () => void }) {
  const router = useRouter()
  const askToBuy = useCanAskToBuy()
  useLockBodyScroll(true)
  const initial = STAFF_ROLES.filter((r) => roles.includes(r))
  const [draft, setDraft] = useState<StaffRole[]>(initial)
  const [busy, setBusy] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')
  const bodyRef = useRef<HTMLDivElement | null>(null)

  const canSave = canSubmitRoles(draft, billingAvailable) && rolesDiffer(draft, initial) && !busy
  const close = () => {
    if (!busy) onClose()
  }

  useEffect(() => {
    bodyRef.current?.querySelector<HTMLInputElement>('input[type=checkbox]')?.focus()
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !busy) onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [busy, onClose])

  const save = async () => {
    setBusy(true)
    setErrorMsg('')
    try {
      const res = await fetch(`/api/business/shops/${shopId}/members/${memberId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ roles: draft }),
      })
      if (res.ok) {
        pacesToast.success(`บันทึกบทบาทของ ${name} แล้ว`)
        onClose()
        router.refresh()
        return
      }
      const code = ((await res.json().catch(() => ({}))) as { error?: string }).error ?? ''
      setErrorMsg(memberErrorText(code, name, primaryOwnerName, askToBuy, 'save'))
      if (STALE.has(code)) router.refresh()
      if (code === 'NOT_A_MEMBER') onClose()
    } catch {
      setErrorMsg(memberErrorText('', name, primaryOwnerName, askToBuy, 'save'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div
      className="size-full fixed top-0 start-0 z-80 overflow-x-hidden overflow-y-auto overscroll-contain bg-black/50 flex items-start sm:items-center py-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="memberRolesModalLabel"
      tabIndex={-1}
      onClick={(e) => {
        if (e.target === e.currentTarget) close()
      }}
    >
      <div className={'ease-in-out transition-all duration-200 lg:max-w-lg md:max-w-md md:w-full w-[calc(100%-24px)] m-3 md:mx-auto flex items-center' /* carve-out HR7: เต็มจอลบขอบ m-3 บนมือถือ — copy จาก TopUpRequestModal */}>
        <div className="w-full flex flex-col card pointer-events-auto">
          <div className="card-header p-5 gap-3">
            <h3 id="memberRolesModalLabel" className="font-medium text-sm min-w-0 truncate">
              บทบาทของ {name}
            </h3>
            <button type="button" aria-label="ปิด" onClick={close} disabled={busy} className="shrink-0 disabled:opacity-40">
              <Icon icon="x" className="text-2xl align-middle text-default-600" />
            </button>
          </div>

          <div ref={bodyRef} className="card-body overflow-y-auto space-y-5">
            {errorMsg && (
              <div
                role="alert"
                aria-live="polite"
                className="flex items-start gap-2 rounded-md bg-danger/10 border border-danger/30 p-3 text-sm text-danger"
              >
                <Icon icon="alert-circle" className="shrink-0 text-base mt-0.5" aria-hidden="true" />
                <span>{errorMsg}</span>
              </div>
            )}
            <p className="text-sm text-default-600 mb-0">บันทึกแล้วมีผลทันที {name} ไม่ต้องเข้าระบบใหม่</p>
            <StaffRolePicker
              legend="เลือกบทบาท"
              selected={draft}
              onChange={setDraft}
              billingAvailable={billingAvailable}
              action="save"
              disabled={busy}
            />
          </div>

          <div className="flex justify-end items-center gap-x-2 border-t border-default-300 card-body">
            <button type="button" onClick={close} disabled={busy} className="btn bg-light min-h-11 disabled:opacity-60">
              ยกเลิก
            </button>
            <button
              type="button"
              onClick={save}
              disabled={!canSave}
              className="btn bg-primary text-white hover:bg-primary-hover min-h-11 disabled:opacity-60"
            >
              {busy ? 'กำลังบันทึก...' : 'บันทึกบทบาท'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
