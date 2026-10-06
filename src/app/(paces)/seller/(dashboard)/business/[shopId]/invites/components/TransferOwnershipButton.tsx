'use client'

/**
 * TransferOwnershipButton — ปุ่มเดียวบนแถวเจ้าของหลัก: เลือกสมาชิก → โอนเจ้าของหลัก (EXT 00012 BR-MR-03..05)
 *
 * Base: theme/paces/Admin/TS/src/app/(admin)/plugins/sweet-alerts/components/SweetAlerts.tsx
 * chase ผ่าน bookings/[token]/components/BookingDetail.tsx (Swal input:'select' + inputValidator)
 *
 * ทำไมปุ่มเดียว ไม่ใช่ปุ่มทุกแถว: การโอนเกิดปีละครั้ง ปุ่มซ้ำทุกแถวมีน้ำหนักบนจอเท่าการเปลี่ยนบทบาท
 * (critique 2026-10-05 P2) · ปุ่มยืนยันสีแดงเพราะผู้กดเอาคืนเองไม่ได้ (P1-c)
 */

import { useRouter } from 'next/navigation'
import Swal from 'sweetalert2'
import { pacesToast } from '@/lib/paces-toast'
import { memberErrorText } from './member-error-text'
import { useCanAskToBuy } from '@/components/paces/PaymentRestrictionProvider'

const STALE = new Set(['NOT_OWNER', 'NOT_PRIMARY_OWNER', 'PRIMARY_OWNER_LOCKED', 'NOT_A_MEMBER'])

export default function TransferOwnershipButton({
  shopId, candidates, primaryOwnerName,
}: {
  shopId: string
  candidates: { id: string; name: string }[]
  primaryOwnerName: string
}) {
  const router = useRouter()
  const askToBuy = useCanAskToBuy()

  const open = async () => {
    const res = await Swal.fire({
      icon: 'warning',
      title: 'โอนความเป็นเจ้าของหลัก',
      html:
        '<p class="text-start text-sm">เมื่อโอนแล้ว</p>' +
        '<ul class="text-start text-sm list-disc ps-5 mt-1 space-y-1">' +
        '<li>แพ็กเกจของผู้รับจะกำหนดโควตาของร้านนี้แทนแพ็กเกจของคุณ</li>' +
        '<li>ระดับยืนยันและคะแนนความน่าเชื่อถือของร้านจะคิดจากเบอร์ของผู้รับ</li>' +
        '<li>คุณจะเป็นเจ้าของร่วม และเอาเจ้าของหลักคืนเองไม่ได้ ต้องให้ผู้รับโอนกลับให้</li>' +
        '</ul>',
      input: 'select',
      inputOptions: Object.fromEntries(candidates.map((c) => [c.id, c.name])),
      inputPlaceholder: 'เลือกสมาชิกที่จะรับโอน',
      inputValidator: (v) => (v ? undefined : 'เลือกสมาชิกที่จะรับโอนก่อน'),
      showCancelButton: true,
      confirmButtonText: 'โอนเจ้าของหลัก',
      cancelButtonText: 'ยกเลิก',
      showLoaderOnConfirm: true,
      allowOutsideClick: () => !Swal.isLoading(),
      buttonsStyling: false,
      customClass: {
        confirmButton: 'btn bg-danger text-white hover:bg-danger-hover mt-2 me-2',
        cancelButton: 'btn bg-light hover:text-default-800 mt-2',
      },
      // ยิงไม่ถึง = ค้างโมดัลให้กดใหม่ · ปลายทางตอบ "ไม่ให้" = ปิดโมดัลแล้วบอกทางออก (paces-swal.ts)
      preConfirm: async (memberId: string) => {
        try {
          const r = await fetch(`/api/business/shops/${shopId}/transfer`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ memberId }),
          })
          if (r.ok) return { ok: true as const, memberId }
          if (r.status >= 500) throw new Error('server')
          const body = await r.json().catch(() => ({}))
          return { ok: false as const, memberId, code: String(body.error ?? '') }
        } catch {
          Swal.showValidationMessage('ติดต่อเซิร์ฟเวอร์ไม่ได้ กดโอนอีกครั้งเมื่อเน็ตกลับมา')
          return false
        }
      },
    })
    if (!res.isConfirmed || !res.value) return
    const name = candidates.find((c) => c.id === res.value.memberId)?.name ?? 'สมาชิกคนนี้'
    if (!res.value.ok) {
      pacesToast.error(memberErrorText(res.value.code, name, primaryOwnerName, askToBuy))
      if (STALE.has(res.value.code)) router.refresh()
      return
    }
    pacesToast.success(`โอนความเป็นเจ้าของหลักให้ ${name} แล้ว · ตอนนี้คุณเป็นเจ้าของร่วม`)
    router.refresh()
  }

  return (
    <button type="button" className="btn btn-sm bg-light hover:text-default-800 mt-2" onClick={open}>
      โอนเจ้าของหลักให้คนอื่น…
    </button>
  )
}
