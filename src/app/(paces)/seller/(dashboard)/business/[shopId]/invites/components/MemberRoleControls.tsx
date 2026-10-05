'use client'

/**
 * MemberRoleControls — เลือกบทบาท (เจ้าของ ↔ ผู้ดูแล) + ปุ่มโอนเจ้าของหลัก ในแถวสมาชิก
 * ส่วนขยาย 00012 (2026-10-05) — docs/20 - Features/00012 - Shop Staff Invite Links/EXTENSIONS-2026-10-05-member-roles.md
 *
 * Base: theme/paces/Admin/TS/src/app/(admin)/form/elements/components/InputTextfieldType.tsx (form-select)
 *     + theme/paces/Admin/TS/src/app/(admin)/plugins/sweet-alerts/components/SweetAlerts.tsx (confirm ผ่าน paces-swal)
 * IA อ้างอิง gochat-v3 settings/members: เปลี่ยนค่าแล้วบันทึกทันที
 *
 * `form-select` ปกติ ไม่ใช่ `-sm` — `-sm` สูง 30px ต่ำกว่าพื้นที่นิ้ว 44px (ux spec)
 */

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { pacesConfirm, pacesConfirmAsync } from '@/lib/paces-swal'
import { pacesToast } from '@/lib/paces-toast'
import { memberErrorText } from './member-error-text'

type Role = 'OWNER' | 'ADMIN'
const ROLE_LABEL: Record<Role, string> = { OWNER: 'เจ้าของ', ADMIN: 'ผู้ดูแล' }
// error ที่แปลว่าจอที่เห็นอยู่ล้าสมัย — โหลดใหม่ให้เห็นสิทธิ์ปัจจุบัน
const STALE = new Set(['NOT_OWNER', 'NOT_PRIMARY_OWNER', 'PRIMARY_OWNER_LOCKED'])

interface Props {
  shopId: string
  memberId: string
  name: string
  role: Role
  isSelf: boolean
  primaryOwnerName: string
  /** ผู้ดูเป็นเจ้าของหลัก → เห็นปุ่มโอน */
  canTransfer: boolean
}

export default function MemberRoleControls({
  shopId, memberId, name, role, isSelf, primaryOwnerName, canTransfer,
}: Props) {
  const router = useRouter()
  const [value, setValue] = useState<Role>(role)
  const [busy, setBusy] = useState(false)

  const fail = (code: string) => {
    pacesToast.error(memberErrorText(code, name, primaryOwnerName))
    if (STALE.has(code)) router.refresh()
  }

  const changeRole = async (next: Role) => {
    // ลดตัวเองเป็นผู้ดูแล = หน้านี้กลายเป็น 404 ของตัวเอง และเปลี่ยนกลับเองไม่ได้ ⇒ ถามก่อน
    if (isSelf && next === 'ADMIN') {
      const ok = await pacesConfirm.danger(
        'เปลี่ยนตัวเองเป็นผู้ดูแล?',
        'คุณจะเข้าหน้านี้ไม่ได้อีก และเปลี่ยนกลับเองไม่ได้ ต้องให้เจ้าของคนอื่นเปลี่ยนให้',
        { confirmButtonText: 'เปลี่ยนเป็นผู้ดูแล' },
      )
      if (!ok) return
    }
    setValue(next)
    setBusy(true)
    try {
      const res = await fetch(`/api/business/shops/${shopId}/members/${memberId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: next }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        setValue(role)
        return fail(body.error ?? '')
      }
      pacesToast.success(`เปลี่ยนบทบาทของ ${name} เป็น${ROLE_LABEL[next]}แล้ว`)
      if (isSelf && next === 'ADMIN') router.push('/dashboard')
      else router.refresh()
    } catch {
      setValue(role)
      fail('')
    } finally {
      setBusy(false)
    }
  }

  const transfer = async () => {
    const result = await pacesConfirmAsync({
      icon: 'warning',
      title: `โอนความเป็นเจ้าของหลักให้ ${name}?`,
      text: `แพ็กเกจของ ${name} จะเป็นตัวกำหนดโควตาของร้านนี้แทนแพ็กเกจของคุณ และ ${name} ต้องมีแพ็กเกจที่ยังมีที่ว่างพอสำหรับร้านนี้ คุณจะยังเป็นเจ้าของร่วมอยู่ แต่เจ้าของคนอื่นจะเปลี่ยนบทบาทหรือลบคุณได้`,
      confirmButtonText: 'โอนเจ้าของหลัก',
      errorText: 'ติดต่อเซิร์ฟเวอร์ไม่ได้ กดโอนอีกครั้งเมื่อเน็ตกลับมา',
      run: async () => {
        const res = await fetch(`/api/business/shops/${shopId}/transfer`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ memberId }),
        })
        if (res.ok) return { ok: true as const }
        if (res.status >= 500) throw new Error('server') // ยิงไม่ถึง/ล่ม = กดใหม่ในโมดัลได้
        const body = await res.json().catch(() => ({}))
        return { ok: false as const, code: String(body.error ?? '') }
      },
    })
    if (!result) return
    if (!result.ok) return fail(result.code)
    pacesToast.success(`โอนความเป็นเจ้าของหลักให้ ${name} แล้ว`)
    router.refresh()
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <select
        className="form-select w-32"
        value={value}
        disabled={busy}
        aria-label={`บทบาทของ ${name}`}
        onChange={(e) => changeRole(e.target.value as Role)}
      >
        <option value="OWNER">{ROLE_LABEL.OWNER}</option>
        <option value="ADMIN">{ROLE_LABEL.ADMIN}</option>
      </select>
      {canTransfer && (
        <button
          type="button"
          className="btn btn-sm bg-light hover:text-default-800"
          disabled={busy}
          aria-label={`โอนความเป็นเจ้าของหลักให้ ${name}`}
          onClick={transfer}
        >
          โอนเจ้าของหลัก
        </button>
      )}
    </div>
  )
}
