'use client'

/**
 * IShipPickupModal — "เรียกรถเข้ารับพัสดุ" ของ iShip (แยกออกจาก ShippingSettingsRow ใน 00087
 * เพื่อให้หน้า /pickups กับหน้าตั้งค่าใช้โมดัลตัวเดียวกัน ไม่มีโค้ดสองชุด)
 *
 * Base: settings/ShippingSettingsRow.tsx (บล็อกโมดัลเรียกรถ + handlePickup ย้ายมา 1:1)
 *       theme/paces/Admin/TS/src/app/(admin)/ui/modals/page.tsx (ผ่าน IShipModalShell)
 */

import { useState } from 'react'
import Icon from '@/components/wrappers/Icon'
import IShipModalShell from '@/components/safepay/iship/IShipModalShell'
import { pacesToast } from '@/lib/paces-toast'

interface Props {
  courierCode: string
  /** ชื่อขนส่งที่แสดง — ไม่มี = แสดงรหัส */
  courierName: string | null
  onClose: () => void
  /** เรียกหลังส่งคำขอสำเร็จ (เช่น router.refresh ในหน้ารายการ) */
  onDone?: () => void
}

async function readError(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as { error?: { message?: string } }
    return body.error?.message ?? 'เกิดข้อผิดพลาด กรุณาลองใหม่'
  } catch {
    return 'เกิดข้อผิดพลาด กรุณาลองใหม่'
  }
}

export default function IShipPickupModal({ courierCode, courierName, onClose, onDone }: Props) {
  const [parcelCount, setParcelCount] = useState('1')
  const [busy, setBusy] = useState(false)

  async function handlePickup() {
    if (busy) return
    const count = Number(parcelCount)
    if (!Number.isInteger(count) || count < 1 || count > 100) {
      pacesToast.warning('จำนวนกล่องต้องเป็นจำนวนเต็ม 1–100')
      return
    }
    setBusy(true)
    try {
      const res = await fetch('/api/seller/iship/pickups', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ courierCode, parcelCount: count }),
        cache: 'no-store',
      })
      if (!res.ok) {
        pacesToast.error(await readError(res))
        return
      }
      const body = (await res.json()) as { timeoutAtText?: string | null }
      onClose()
      onDone?.()
      pacesToast.success(
        body.timeoutAtText ? `เรียกรถสำเร็จ — เข้ารับ ${body.timeoutAtText}` : 'เรียกรถเข้ารับสำเร็จแล้ว',
      )
    } finally {
      setBusy(false)
    }
  }

  return (
    <IShipModalShell
      title="เรียกรถเข้ารับพัสดุ"
      size="sm"
      onClose={onClose}
      footer={
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="btn inline-flex items-center justify-center border border-default-300 py-2.5 text-default-700 disabled:opacity-60"
          >
            ยกเลิก
          </button>
          <button
            type="button"
            onClick={handlePickup}
            disabled={busy}
            className="btn inline-flex items-center justify-center gap-2 bg-primary py-2.5 text-white hover:bg-primary-hover disabled:opacity-60"
          >
            {busy ? (
              <span className="inline-block size-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
            ) : (
              <Icon icon="truck" className="text-base" aria-hidden="true" />
            )}
            เรียกรถ
          </button>
        </div>
      }
    >
      <p className="mb-3 text-sm text-default-500">พนักงานขนส่งจะมารับที่อยู่ผู้ส่งที่ตั้งไว้</p>
      <p className="mb-4 flex items-center gap-2 rounded-lg bg-info/15 px-3 py-2.5 text-sm text-info">
        <Icon icon="truck-delivery" className="shrink-0 text-base" aria-hidden="true" />
        ขนส่ง: {courierName ?? courierCode} (ค่าตั้งต้น)
      </p>
      <label className="form-label" htmlFor="iship-parcel-count">
        จำนวนกล่องที่จะส่ง
      </label>
      <input
        id="iship-parcel-count"
        type="number"
        min="1"
        max="100"
        className="form-input"
        value={parcelCount}
        onChange={(e) => setParcelCount(e.target.value)}
      />
    </IShipModalShell>
  )
}
