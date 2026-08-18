'use client'

/**
 * ShipmentTraceSection — บล็อก "สถานะล่าสุด" ใน sheet พัสดุของห้องแชท
 *
 * user สั่ง 2026-08-17: ขอไทม์ไลน์เต็มแบบเดียวกับที่มีอยู่แล้วในหน้า `/orders`
 * (แทนบรรทัดเดียว "อัปเดตล่าสุดจากขนส่ง" ที่ทำไว้รอบก่อน ซึ่งบอกได้แค่เหตุการณ์เดียว)
 *
 * 🛑 **ไม่ได้วาดไทม์ไลน์ใหม่** — ใช้ `ShipmentTraceList` ที่แยกออกมาจาก `ShipmentHoverCard`
 * และ **ไม่ได้สร้าง endpoint ใหม่** — ยิง `/api/seller/iship/shipments/[id]/traces` ตัวเดิม
 *
 * 🛑 ยิงตอน "เปิด sheet" เท่านั้น ไม่ prefetch ตอนโหลดห้องแชท — เหตุผลเดียวกับที่ hover card
 * ยิงตอน hover: ผู้ขายเปิดห้องแชทบ่อยกว่ากดดูพัสดุมาก การดึงทุกครั้งคือจ่าย latency + โควตา
 * iShip ให้กับสิ่งที่ส่วนใหญ่ไม่ได้ดู (component นี้ mount เมื่อ sheet เปิดแล้วเท่านั้น)
 *
 * ร้านที่แจ้งเลขพัสดุเอง (ไม่ผ่าน iShip) ไม่มี `shipmentId` → ผู้เรียกไม่ต้อง render ตัวนี้เลย
 */

import { useEffect, useState } from 'react'
import Icon from '@/components/wrappers/Icon'
import ShipmentTraceList, { sortTraces, type TraceEvent } from '@/components/safepay/iship/ShipmentTraceList'

/** จำนวนที่แสดงก่อนกด "ดูทั้งหมด" — เท่ากับ hover card (4) เพื่อให้สองจอเล่าเรื่องเท่ากัน */
const PREVIEW = 4

/**
 * 🛑 ผู้เรียกต้องใส่ `key={shipmentId}` — ไม่ reset state ด้วย setState ใน effect
 * (`react-hooks/set-state-in-effect` และเป็นแพตเทิร์นที่ CLAUDE.md เตือนไว้เรื่อง cascading render)
 * ในทางปฏิบัติ component นี้ mount ใหม่ทุกครั้งที่เปิด sheet อยู่แล้ว เพราะอยู่ใน `{open && …}`
 */
export default function ShipmentTraceSection({ shipmentId }: { shipmentId: string }) {
  const [traces, setTraces] = useState<TraceEvent[] | null>(null)
  const [state, setState] = useState<'loading' | 'done' | 'error'>('loading')
  const [showAll, setShowAll] = useState(false)

  useEffect(() => {
    let alive = true
    fetch(`/api/seller/iship/shipments/${shipmentId}/traces`, { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((data: { data?: TraceEvent[] } | TraceEvent[]) => {
        if (!alive) return
        // 🛑 รูปตอบกลับมี 2 แบบ (`ishipJson` ห่อด้วย `data` บ้าง คืน array ดิบบ้าง) — ตัวอ่าน
        // ต้องรับทั้งคู่ ท่าเดียวกับ ShipmentHoverCard ที่พิสูจน์กับของจริงมาแล้ว
        setTraces(Array.isArray(data) ? data : (data.data ?? []))
        setState('done')
      })
      .catch(() => {
        if (alive) setState('error')
      })
    // เธรดเดียวเปลี่ยนพัสดุได้ (ร้านยกเลิกแล้วเปิดใบใหม่) → ผูก dep ไว้กับ id ไม่ใช่ [] เปล่า
    return () => {
      alive = false
    }
  }, [shipmentId])

  const all = traces ? sortTraces(traces) : []
  const shown = showAll ? all : all.slice(0, PREVIEW)

  return (
    <div className="border-default-200 mx-3 mb-3 rounded-lg border px-3 py-2.5">
      <p className="text-default-800 mb-2 text-xs font-semibold">สถานะล่าสุด</p>

      {state === 'loading' && (
        <p className="text-default-700 mb-0 flex items-center gap-2 text-xs">
          <Icon icon="loader-2" className="animate-spin text-sm" aria-hidden="true" />
          กำลังดึงสถานะจาก iShip…
        </p>
      )}

      {/* ข้อความบอกทางออกที่ทำได้จริงจากจอนี้ — ไม่ใช่ "ลองใหม่อีกครั้ง" ลอย ๆ */}
      {state === 'error' && (
        <p className="text-default-700 mb-0 text-xs">ดึงสถานะไม่สำเร็จ — เปิดหน้าคำสั่งซื้อเพื่อลองใหม่</p>
      )}

      {state === 'done' && all.length === 0 && (
        <p className="text-default-700 mb-0 text-xs">ขนส่งยังไม่บันทึกการเดินทางของพัสดุใบนี้</p>
      )}

      {shown.length > 0 && <ShipmentTraceList traces={shown} />}

      {all.length > PREVIEW && (
        <button
          type="button"
          onClick={() => setShowAll((v) => !v)}
          className="text-primary mt-1 text-xs font-medium"
        >
          {showAll ? 'ย่อรายการ' : `ดูทั้งหมด ${all.length} รายการ`}
        </button>
      )}
    </div>
  )
}
