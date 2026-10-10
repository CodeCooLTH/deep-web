'use client'

/**
 * MemberRoleControls — เลือกประเภทสมาชิก (เจ้าของ ↔ พนักงาน) + ปุ่มโอนเจ้าของหลัก ในแถวสมาชิก
 * ส่วนขยาย 00012 (2026-10-05) — docs/20 - Features/00012 - Shop Staff Invite Links/EXTENSIONS-2026-10-05-member-roles.md
 *
 * Base: theme/paces/Admin/TS/src/app/(admin)/form/elements/components/InputTextfieldType.tsx (form-select)
 *     + theme/paces/Admin/TS/src/app/(admin)/plugins/sweet-alerts/components/SweetAlerts.tsx (confirm ผ่าน paces-swal)
 * (ปุ่มโอนย้ายไป TransferOwnershipButton บนแถวเจ้าของหลัก — critique 2026-10-05)
 * IA อ้างอิง gochat-v3 settings/members: เปลี่ยนค่าแล้วบันทึกทันที (ยกเว้น 2 ทิศที่ถามก่อน: ลดตัวเอง · ตั้งคนอื่นเป็นเจ้าของ)
 *
 * `form-select` ปกติ ไม่ใช่ `-sm` — `-sm` สูง 30px ต่ำกว่าพื้นที่นิ้ว 44px (ux spec)
 */

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { pacesConfirm } from '@/lib/paces-swal'
import { pacesToast } from '@/lib/paces-toast'
import { memberErrorText } from './member-error-text'
import { useCanAskToBuy } from '@/components/paces/PaymentRestrictionProvider'

type Role = 'OWNER' | 'ADMIN'
const ROLE_LABEL: Record<Role, string> = { OWNER: 'เจ้าของ', ADMIN: 'พนักงาน' }
// error ที่แปลว่าจอที่เห็นอยู่ล้าสมัย — โหลดใหม่ให้เห็นสิทธิ์ปัจจุบัน
const STALE = new Set(['NOT_OWNER', 'FORBIDDEN_ROLE', 'NOT_PRIMARY_OWNER', 'PRIMARY_OWNER_LOCKED'])

interface Props {
  shopId: string
  memberId: string
  name: string
  role: Role
  isSelf: boolean
  primaryOwnerName: string
}

export default function MemberRoleControls({
  shopId, memberId, name, role, isSelf, primaryOwnerName,
}: Props) {
  const router = useRouter()
  const askToBuy = useCanAskToBuy()
  const [value, setValue] = useState<Role>(role)
  const [busy, setBusy] = useState(false)

  const fail = (code: string) => {
    pacesToast.error(memberErrorText(code, name, primaryOwnerName, askToBuy))
    if (STALE.has(code)) router.refresh()
  }

  const changeRole = async (next: Role) => {
    // ลดตัวเองเป็นพนักงาน = หน้านี้กลายเป็น 404 ของตัวเอง และเปลี่ยนกลับเองไม่ได้ ⇒ ถามก่อน
    if (isSelf && next === 'ADMIN') {
      const ok = await pacesConfirm.danger(
        'เปลี่ยนตัวเองเป็นพนักงาน?',
        'คุณจะได้บทบาทผู้ดูแล เข้าหน้านี้และดูการเงินของร้านไม่ได้อีก และเปลี่ยนกลับเองไม่ได้ ต้องให้เจ้าของคนอื่นเปลี่ยนให้',
        { confirmButtonText: 'เปลี่ยนเป็นพนักงาน' },
      )
      if (!ok) return
    }
    // เลื่อนเป็นเจ้าของ = ได้สิทธิ์ลบคน/แก้บัญชีรับเงิน และลดสิทธิ์เราได้ก่อนเราย้อนทัน ⇒ ถามก่อน
    // (critique 2026-10-05 P1-a · บนคอม กดลูกศรใน select ก็ยิง change ได้)
    if (!isSelf && next === 'OWNER') {
      const ok = await pacesConfirm.warning(
        `ตั้ง ${name} เป็นเจ้าของ?`,
        `${name} จะเชิญ/ลบสมาชิก เปลี่ยนบทบาทคนอื่น แก้บัญชีรับเงิน และดูยอดขายกับกำไรของร้านได้เหมือนคุณ · บทบาทพนักงานเดิมของ ${name} จะถูกล้าง`,
        { confirmButtonText: 'ตั้งเป็นเจ้าของ' },
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
      pacesToast.success(
        next === 'OWNER'
          ? `ตั้ง ${name} เป็นเจ้าของแล้ว`
          : `เปลี่ยน ${name} เป็นพนักงานแล้ว ได้บทบาทผู้ดูแล ปรับได้ที่ปุ่ม “แก้ไขบทบาท”`,
      )
      if (isSelf && next === 'ADMIN') router.push('/dashboard')
      else router.refresh()
    } catch {
      setValue(role)
      fail('')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <select
        className="form-select w-32"
        value={value}
        disabled={busy}
        aria-label={`ประเภทสมาชิกของ ${name}`}
        onChange={(e) => changeRole(e.target.value as Role)}
      >
        <option value="OWNER">{ROLE_LABEL.OWNER}</option>
        <option value="ADMIN">{ROLE_LABEL.ADMIN}</option>
      </select>
    </div>
  )
}
