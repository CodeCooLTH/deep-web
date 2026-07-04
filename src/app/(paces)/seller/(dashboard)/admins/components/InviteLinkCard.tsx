'use client'

/**
 * InviteLinkCard — การ์ด "ลิงก์เชิญพนักงาน" ของหน้า /admins (feature 00012, Task 4.3)
 *
 * Base (card shell): theme/paces/Admin/TS/src/app/(admin)/ui/cards/page.tsx (card>card-header+card-body)
 * Base (Swal input:'select' + preConfirm ยิง fetch ใน flow เดียว, error ค้าง dialog ผ่าน
 *   showValidationMessage, success → pacesToast + router.refresh()):
 *   theme/paces/Admin/TS/src/app/(admin)/plugins/sweet-alerts/components/SweetAlerts.tsx (ajaxAlert(): input+preConfirm)
 *   ผสาน in-app precedent src/app/(paces)/seller/(dashboard)/inventory/components/SubscribeButton.tsx
 * Base (empty-state list ว่าง + icon): .../business/[shopId]/invites/components/PendingInvitesTable.tsx
 * Reuse ตรง ๆ (ห้ามสร้างใหม่):
 *   - CopyLinkButton: src/app/(paces)/seller/(dashboard)/orders/[token]/components/CopyLinkButton.tsx
 *   - RowActionDeleteButton: .../business/[shopId]/invites/components/RowActionDeleteButton.tsx
 *
 * UX Spec: docs/superpowers/specs/2026-07-04-shop-staff-invite-link-ux-spec.md Screen 1
 */

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Swal from 'sweetalert2'
import Icon from '@/components/wrappers/Icon'
import { formatDate } from '@/lib/format-date'
import { pacesToast } from '@/lib/paces-toast'
import CopyLinkButton from '../../orders/[token]/components/CopyLinkButton'
import RowActionDeleteButton from '../../business/[shopId]/invites/components/RowActionDeleteButton'

export interface InviteLinkRow {
  url: string
  slug: string
  expiresAt: string
}

interface InviteLinkCardProps {
  links: InviteLinkRow[]
}

// error code จาก POST /api/shops/current/invite-links (route.ts) → ข้อความไทย
const CREATE_ERROR_MESSAGE: Record<string, string> = {
  NOT_OWNER: 'คุณไม่มีสิทธิ์สร้างลิงก์เชิญ',
  SHOP_LOCKED: 'ธุรกิจนี้ถูกล็อกอยู่ ไม่สามารถสร้างลิงก์เชิญได้',
  NO_ACTIVE_PACKAGE: 'ไม่มีแพ็กเกจที่ใช้งานอยู่',
  VALIDATION_ERROR: 'ข้อมูลไม่ถูกต้อง กรุณาลองใหม่',
}

export default function InviteLinkCard({ links }: InviteLinkCardProps) {
  const router = useRouter()
  const [isCreating, setIsCreating] = useState(false)

  const handleCreate = async () => {
    setIsCreating(true)
    try {
      // Base: SubscribeButton.tsx handleOpenDialog — confirm(เลือกอายุ)+fetch ใน flow เดียว,
      // error ค้าง dialog ผ่าน showValidationMessage
      const result = await Swal.fire({
        buttonsStyling: false,
        title: 'เลือกอายุลิงก์เชิญ',
        input: 'select',
        inputOptions: { '24h': '24 ชั่วโมง', '7d': '7 วัน (แนะนำ)', '30d': '30 วัน' },
        inputValue: '7d',
        showCancelButton: true,
        confirmButtonText: 'สร้างลิงก์',
        cancelButtonText: 'ยกเลิก',
        showLoaderOnConfirm: true,
        allowOutsideClick: () => !Swal.isLoading(),
        customClass: {
          confirmButton: 'btn bg-primary text-white hover:bg-primary-hover mt-2 me-2',
          cancelButton: 'btn bg-light hover:text-default-800 mt-2',
        },
        preConfirm: async (expiryKey) => {
          try {
            const res = await fetch('/api/shops/current/invite-links', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ expiryKey }),
            })
            if (res.ok) return true
            const data = await res.json().catch(() => ({}))
            Swal.showValidationMessage(CREATE_ERROR_MESSAGE[data?.error as string] ?? 'เกิดข้อผิดพลาด กรุณาลองใหม่')
            return false
          } catch {
            Swal.showValidationMessage('เกิดข้อผิดพลาด กรุณาลองใหม่')
            return false
          }
        },
      })

      if (result.isConfirmed && result.value === true) {
        pacesToast.success('สร้างลิงก์เชิญสำเร็จ')
        router.refresh()
      }
    } finally {
      setIsCreating(false)
    }
  }

  return (
    <div className="card">
      <div className="card-header">
        <h4 className="card-title">ลิงก์เชิญพนักงาน</h4>
        <button
          type="button"
          onClick={handleCreate}
          disabled={isCreating}
          className="btn btn-sm bg-primary text-white hover:bg-primary-hover inline-flex items-center gap-1.5 disabled:opacity-60"
        >
          <Icon icon="plus" aria-hidden="true" />
          สร้างลิงก์เชิญ
        </button>
      </div>

      {links.length === 0 ? (
        <div className="card-body">
          <div className="flex flex-col items-center gap-2 py-8 text-center">
            <Icon icon="link" className="text-4xl text-default-300" aria-hidden="true" />
            <p className="text-default-500 font-semibold">ยังไม่มีลิงก์เชิญที่ใช้งานอยู่ กดสร้างลิงก์ใหม่ด้านบน</p>
          </div>
        </div>
      ) : (
        <div className="card-body space-y-3">
          {links.map((link) => (
            <div
              key={link.slug}
              className="flex flex-col gap-2 rounded-lg border border-default-300 border-dashed p-3 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="min-w-0 flex-1">
                <CopyLinkButton value={link.url} showPreview label="คัดลอก" />
                <p className="text-default-500 text-2xs mt-1.5">
                  หมดอายุ {formatDate(link.expiresAt)} · ใช้ซ้ำได้จนหมดอายุ
                </p>
              </div>
              <RowActionDeleteButton
                endpoint={`/api/shops/current/invite-links/${link.slug}`}
                ariaLabel={`ยกเลิกลิงก์เชิญ ${link.slug}`}
                icon="link-off"
                confirmTitle="ยกเลิกลิงก์นี้?"
                confirmText="ลิงก์นี้จะใช้เชิญคนใหม่ไม่ได้อีก (คนที่เข้าร่วมไปแล้วยังเป็นสมาชิกอยู่)"
                successMessage="ยกเลิกลิงก์เรียบร้อย"
                errorMessages={{ NOT_OWNER: 'คุณไม่มีสิทธิ์ยกเลิกลิงก์นี้' }}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
