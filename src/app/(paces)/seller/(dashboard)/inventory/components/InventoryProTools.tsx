'use client'

/**
 * InventoryProTools — ส่วน "เครื่องมือ Pro" บน /inventory เมื่อ entitlement ACTIVE+PRO
 * (feat 00009 S-16, FR-DSP-06/09/10)
 *
 * Base (โครงการ์ด): src/app/(paces)/seller/(dashboard)/inventory/components/AdvanceWarningBanner.tsx
 *   (rounded-lg border/bg block + ปุ่ม/ลิงก์ท้ายบรรทัด) — สลับ tone เป็น primary/10 เดียวกับ
 *   UpgradeToProCard เพื่อความสอดคล้อง (ต่างจาก warning tone ของ AdvanceWarningBanner)
 * Base (CSV export link): API.md §4.6 — GET request ธรรมดา ส่ง cookie session ไปด้วยเมื่อ
 *   browser navigate ผ่าน <a href> ตรง ๆ (ไม่ใช้ next/link เพราะปลายทางเป็นไฟล์ดาวน์โหลด ไม่ใช่ route
 *   ภายใน Next — HR2 ไม่บังคับใช้ในกรณีนี้ เพราะไม่ใช่ในหน้า client navigate)
 * Base (CSV import): เปิด CsvImportModal (S-18, committed แล้ว — component เดิมมี props
 *   {open, onClose, onSuccess?} พร้อมใช้)
 *
 * client component เพราะต้องเก็บ state เปิด/ปิด CsvImportModal (ปุ่ม "นำเข้า CSV")
 */

import { useState } from 'react'
import Icon from '@/components/wrappers/Icon'
import CsvImportModal from './CsvImportModal'

export default function InventoryProTools() {
  const [importOpen, setImportOpen] = useState(false)

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-primary/20 bg-primary/10 px-4 py-3 text-sm font-medium text-primary">
        <div className="flex items-center gap-2">
          <Icon icon="crown" className="size-5 shrink-0" aria-hidden="true" />
          <span>เครื่องมือ Pro — นำเข้า/ส่งออกสต็อกเป็นไฟล์ CSV</span>
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {/* ดาวน์โหลดไฟล์ตรง ๆ — ใช้ <a> ธรรมดาไม่ใช่ next/link (ปลายทางเป็นไฟล์แนบ ไม่ใช่ route) */}
          <a
            href="/api/inventory/csv/export"
            className="btn bg-light text-dark hover:text-primary inline-flex items-center gap-1.5"
          >
            <Icon icon="file-export" className="text-base" aria-hidden="true" />
            ส่งออก CSV
          </a>
          <button
            type="button"
            onClick={() => setImportOpen(true)}
            className="btn bg-primary text-white hover:bg-primary-hover inline-flex items-center gap-1.5"
          >
            <Icon icon="file-import" className="text-base" aria-hidden="true" />
            นำเข้า CSV
          </button>
        </div>
      </div>

      <CsvImportModal open={importOpen} onClose={() => setImportOpen(false)} />
    </>
  )
}
