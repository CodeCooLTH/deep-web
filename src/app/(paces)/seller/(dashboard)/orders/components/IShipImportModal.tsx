'use client'

/**
 * IShipImportModal — ดึงพัสดุจาก iShip มาสร้างคำสั่งซื้อ (ส่วนขยาย feature 00022)
 *
 * สำหรับร้านที่ทำงานสลับลำดับกับที่ระบบสมมติไว้ — เปิดพัสดุบนเว็บ iShip ตั้งแต่ตอนแพ็กของ
 * แล้วไม่อยากมาคีย์ออเดอร์ซ้ำอีกรอบ เลือกใบแล้วระบบสร้างคำสั่งซื้อจากข้อมูลบนพัสดุให้เลย
 *
 * เนื้อในไม่เขียนใหม่ — reuse ShipmentLinkPanel ในโหมด IMPORT (รายการ/ค้นหา/สถานะว่าง/
 * error เป็นชุดเดียวกับตอนผูกพัสดุกับออเดอร์ที่มีอยู่แล้ว) ที่นี่มีแค่เปลือกโมดัล
 *
 * Base (เปลือกโมดัล — dialog/backdrop/Escape/header-X, focus trap, คืน focus ตอนปิด):
 *   src/app/(paces)/seller/(dashboard)/orders/[token]/components/ShipmentEntryModal.tsx
 */

import { useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import Icon from '@/components/wrappers/Icon'
import ShipmentLinkPanel from '@/components/safepay/iship/ShipmentLinkPanel'

interface Props {
  open: boolean
  onClose: () => void
}

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'

export default function IShipImportModal({ open, onClose }: Props) {
  const router = useRouter()
  const dialogRef = useRef<HTMLDivElement>(null)
  const previouslyFocused = useRef<HTMLElement | null>(null)

  useEffect(() => {
    if (!open) return
    previouslyFocused.current = document.activeElement as HTMLElement | null
    dialogRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)[0]?.focus()

    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        onClose()
        return
      }
      if (e.key !== 'Tab') return
      const nodes = dialogRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)
      if (!nodes || nodes.length === 0) return
      const first = nodes[0]
      const last = nodes[nodes.length - 1]
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('keydown', onKey)
      previouslyFocused.current?.focus()
    }
  }, [open, onClose])

  if (!open) return null

  return (
    <div
      ref={dialogRef}
      className="size-full fixed top-0 start-0 z-80 overflow-x-hidden overflow-y-auto bg-dark/40 flex items-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="ishipImportModalLabel"
      tabIndex={-1}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className="ease-in-out transition-all duration-200 sm:max-w-md w-[calc(100%-24px)] m-3 sm:mx-auto flex items-center"> {/* w-[calc(100%-24px)]: carve-out เดิมจาก ShipmentEntryModal (Base) — เว้นขอบ 12px รอบโมดัลบนจอแคบ ไม่มี Paces token ให้ค่านี้ */}
        <div className="w-full flex flex-col card pointer-events-auto">
          <div className="card-header p-5">
            <h3
              id="ishipImportModalLabel"
              className="font-medium text-sm flex items-center gap-1.5"
            >
              <Icon icon="package-import" className="text-base" aria-hidden="true" />
              ดึงจาก iShip
            </h3>
            <button type="button" aria-label="ปิด" onClick={onClose}>
              <Icon icon="x" className="text-2xl align-middle text-default-600" />
            </button>
          </div>

          {/* ไม่ใช้ card-body เพราะเนื้อในมีเส้นคั่นเต็มความกว้างระหว่างบล็อกอยู่แล้ว */}
          <ShipmentLinkPanel
            mode="IMPORT"
            onImported={({ orderToken }) => {
              onClose()
              // พาไปที่ออเดอร์ที่เพิ่งเกิดทันที — ร้านมักต้องไปเติมรายการสินค้าต่อ
              // (iShip ไม่ได้ส่งรายการสินค้ามาให้) การทิ้งไว้ที่หน้ารายการจะทำให้ต้องไปหาเอง
              router.push(`/orders/${orderToken}`)
            }}
          />
        </div>
      </div>
    </div>
  )
}
