'use client'

/**
 * CsvImportModal — modal นำเข้าสต็อกจาก CSV (feat 00009 S-18, FR-DSP-10, Pro-exclusive)
 *
 * Base (modal shell + dropzone): src/app/(paces)/seller/(dashboard)/wallet/components/TopUpRequestModal.tsx
 *   (controlled div modal — open/onClose prop, backdrop bg-black/50 คลิกนอกปิด, card→card-header→
 *   card-body→card-footer, error banner bg-danger/10 border-danger/30 บรรทัด 236-245; dropzone
 *   บรรทัด 313-337 — เปลี่ยน accept="image/*" → ".csv", ตัด img preview thumbnail ทิ้ง เพราะไฟล์นี้
 *   parse เป็นตารางแทนรูปสลิป)
 * Base (confirm flow): src/app/(paces)/seller/(dashboard)/inventory/components/SubscribeButton.tsx
 *   (Swal.fire ตรง preConfirm fetch ระหว่าง dialog ค้าง + showLoaderOnConfirm + allowOutsideClick guard)
 * Base (preview table คอลัมน์+badge): theme/paces/Admin/TS/src/app/(admin)/apps/ecommerce/(inventory)/product-stocks/components/ProductStockTable.tsx
 *   — ไฟล์ต้นทางใช้ TanStack (DataTable) แต่ UX-Design-Spec §Design Decision #4 สั่งห้าม TanStack
 *   สำหรับตารางนี้ (ไม่ต้อง sort/filter/pagination) → ประกอบเป็น <table> ธรรมดา
 *   divide-y divide-default-200 text-sm เอง (HR7 adapt, ผสม pattern plain <table> ที่มีอยู่แล้วใน
 *   src/app/(paces)/admin/(dashboard)/verifications/page.tsx) + คง badge status token จากไฟล์ต้นทาง
 *   (bg-success/15 text-success / bg-danger/15 text-danger)
 * Parse: @/lib/csv parseCsv() (คอมมิต S-1, pure client-safe module) — ไม่เพิ่ม npm dependency
 *
 * Flow: เลือกไฟล์ .csv → FileReader.readAsText → parseCsv() → validate header (ต้องมี productId+
 *   stockQty) → preview table (badge "รอนำเข้า" ต่อแถว valid, "ล้มเหลว" ทันทีถ้า parse แถวนั้นไม่ได้)
 *   → กด "นำเข้า X แถว" → Sweet Alerts confirm (icon warning, bulk-overwrite) → preConfirm POST
 *   /api/inventory/csv/import → map ผลจริงกลับเข้าตาราง (OK/ERROR + error ไทย) + footer สรุป
 *   "สำเร็จ X · ล้มเหลว Y" + pacesToast (success ถ้า error=0, warning ถ้ามี) → ปุ่มเปลี่ยนเป็น "ปิด"
 */

import Icon from '@/components/wrappers/Icon'
import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import Swal from 'sweetalert2'
import { pacesToast } from '@/lib/paces-toast'
import { cn } from '@/utils/helpers'
import { parseCsv } from '@/lib/csv'
import { formatBaht } from '@/lib/format-money'
import { useLockBodyScroll } from '@/hooks/useLockBodyScroll'

// ─── Constants ─────────────────────────────────────────────────────────────────
const MAX_ROWS = 500

// ─── Props ──────────────────────────────────────────────────────────────────────
interface CsvImportModalProps {
  open: boolean
  onClose: () => void
  onSuccess?: () => void
}

type RowStatus = 'PENDING' | 'OK' | 'ERROR'

interface PreviewRow {
  rowIndex: number // 1-based ลำดับที่แสดง (คอลัมน์ #)
  productId: string
  productName: string // จากคอลัมน์ "name" ถ้ามีในไฟล์ (export มีให้) ไม่งั้น fallback เป็น productId
  stockQty: number | null // null = parse/validate ไม่ผ่าน → ไม่ถูกส่งเข้า API
  /** ราคาทุนจากไฟล์ (feature 00016 ส่วนขยาย)
   *  undefined = cell ว่าง/ไม่มีคอลัมน์นี้ → **ไม่ส่ง key ไป API** = ไม่แตะต้นทุนเดิม
   *  number    = ตั้งค่าใหม่ (รวม 0 ที่แปลว่า "ต้นทุนศูนย์บาทจริง")
   *  ห้ามแปลง cell ว่างเป็น 0 เด็ดขาด — export แล้ว import กลับโดยไม่แก้อะไรจะล้างต้นทุนทั้งร้าน */
  cost?: number
  status: RowStatus
  error?: string // ข้อความไทย — ทั้ง client-validate error และ error จาก API หลัง import
}

// ─── map error code รายแถวจาก API (API.md §4.7 per-row) → ข้อความไทย ──────────────
function rowErrorMessage(code: string | undefined): string {
  switch (code) {
    case 'PRODUCT_NOT_FOUND':
      return 'ไม่พบสินค้านี้'
    case 'PRODUCT_NOT_PHYSICAL':
      return 'ไม่ใช่สินค้าจับต้องได้'
    case 'CONCURRENT_MODIFICATION':
      return 'มีการแก้ไขพร้อมกัน กรุณาลองใหม่'
    default:
      return code || 'เกิดข้อผิดพลาด'
  }
}

// ─── map error ระดับ request ทั้งก้อน (API.md §4.7) → ข้อความไทยใน Swal.showValidationMessage ──
function requestErrorMessage(errorBody: string): string {
  switch (errorBody) {
    case 'INVENTORY_NOT_PRO':
      return 'ต้องอัพเกรดเป็น Deep Stock Pro ก่อนใช้งานฟีเจอร์นี้'
    case 'Rate limit exceeded':
      return 'ทำรายการถี่เกินไป กรุณาลองใหม่ภายหลัง'
    case 'Invalid input':
      return 'ข้อมูลไม่ถูกต้อง กรุณาลองใหม่'
    default:
      return errorBody || 'เกิดข้อผิดพลาด กรุณาลองใหม่'
  }
}

type ImportApiResult = {
  totalRows: number
  successCount: number
  errorCount: number
  results: { row: number; productId: string; status: 'OK' | 'ERROR'; resultingQty?: number; error?: string }[]
}

export default function CsvImportModal({ open, onClose, onSuccess }: CsvImportModalProps) {
  const router = useRouter()
  const fileInputRef = useRef<HTMLInputElement>(null)

  // ─── State ──────────────────────────────────────────────────────────────────
  const [fileName, setFileName] = useState<string>('')
  const [rows, setRows] = useState<PreviewRow[]>([])
  const [parseError, setParseError] = useState<string>('')
  const [overCap, setOverCap] = useState(false)
  // ไฟล์เทมเพลตเก่า (ก่อน 2026-08-08) ไม่มีคอลัมน์ cost — ข้อความยืนยันจึงไม่ควรพูดถึงต้นทุน
  const [hasCostColumn, setHasCostColumn] = useState(false)
  const [imported, setImported] = useState(false) // true หลังยิง import ผ่าน (แม้มีบาง แถว error)
  const [isImporting, setIsImporting] = useState(false)
  const [summary, setSummary] = useState<{ ok: number; err: number } | null>(null)

  // แถวที่ผ่าน client-validate แล้ว (มี stockQty ไม่ null) — จำนวนนี้คือ "X แถว" บนปุ่มนำเข้า
  const validRows = rows.filter((r) => r.stockQty !== null)

  // ─── ปิด modal + reset state ทั้งหมด ───────────────────────────────────────
  const handleClose = () => {
    if (isImporting) return
    setFileName('')
    setRows([])
    setParseError('')
    setOverCap(false)
    setImported(false)
    setSummary(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
    onClose()
  }

  // ─── เลือกไฟล์ → FileReader อ่าน text → parseCsv() → validate + build preview rows ──────
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] ?? null
    if (!file) return
    setParseError('')
    setImported(false)
    setSummary(null)
    setFileName(file.name)

    const reader = new FileReader()
    reader.onload = () => {
      // ตัด UTF-8 BOM ทิ้งก่อน — stringifyCsv (export) ใส่ BOM นำหน้าไฟล์เสมอ กัน Excel เพี้ยนภาษาไทย
      // ถ้าไม่ตัด header cell แรก ("productId") จะกลายเป็น "﻿productId" ไม่ match กับที่ค้นหา
      const text = String(reader.result ?? '').replace(/^﻿/, '')

      // นับจำนวนบรรทัดดิบก่อนเรียก parseCsv() — parseCsv cap ที่ 501 แถว (500 data + header) แบบ
      // เงียบ ๆ (comment ในไฟล์ src/lib/csv.ts) ต้องนับเองก่อนถึงจะรู้ว่าไฟล์จริงเกิน 500 แถวหรือไม่
      const rawLineCount = text.split(/\r\n|\r|\n/).filter((l) => l.trim() !== '').length
      const dataLineCount = Math.max(rawLineCount - 1, 0)
      setOverCap(dataLineCount > MAX_ROWS)

      const parsed = parseCsv(text)
      if (parsed.length === 0) {
        setParseError('ไฟล์ว่างเปล่า')
        setRows([])
        return
      }

      const header = parsed[0].map((h) => h.trim().toLowerCase())
      const idxProductId = header.indexOf('productid')
      const idxStockQty = header.indexOf('stockqty')
      const idxName = header.indexOf('name') // optional — export มีให้เพื่อแสดงชื่อสินค้าใน preview
      const idxCost = header.indexOf('cost') // optional — ไฟล์เทมเพลตเก่า (ก่อน 2026-08-08) ไม่มีคอลัมน์นี้
      setHasCostColumn(idxCost >= 0)

      if (idxProductId === -1 || idxStockQty === -1) {
        setParseError('ไฟล์ไม่ถูกต้อง — ต้องมีคอลัมน์ productId และ stockQty')
        setRows([])
        return
      }

      // ตัดแถวว่างล้วน (trailing newline จาก parseCsv อาจสร้างแถวว่างท้ายไฟล์)
      const dataRows = parsed.slice(1).filter((r) => r.some((cell) => cell.trim() !== ''))
      const built: PreviewRow[] = dataRows.slice(0, MAX_ROWS).map((r, i) => {
        const productId = (r[idxProductId] ?? '').trim()
        const qtyRaw = (r[idxStockQty] ?? '').trim()
        const name = idxName >= 0 ? (r[idxName] ?? '').trim() : ''
        const qtyNum = Number(qtyRaw)
        const qtyValid = qtyRaw !== '' && Number.isInteger(qtyNum) && qtyNum >= 0

        // ต้นทุน: cell ว่าง = ไม่แตะค่าเดิม (ไม่ใช่ 0) — ต่างจาก stockQty ที่บังคับทุกแถว
        // รับทศนิยมได้ (ต่างจาก stockQty ที่ต้องเป็นจำนวนเต็ม) เพราะราคาทุนมีสตางค์ได้จริง
        const costRaw = idxCost >= 0 ? (r[idxCost] ?? '').trim() : ''
        const costNum = Number(costRaw)
        const costOmitted = costRaw === ''
        const costValid = costOmitted || (Number.isFinite(costNum) && costNum >= 0)
        const rowValid = productId !== '' && qtyValid && costValid

        return {
          rowIndex: i + 1,
          productId,
          productName: name || productId || `แถวที่ ${i + 1}`,
          stockQty: rowValid ? qtyNum : null,
          cost: rowValid && !costOmitted ? costNum : undefined,
          // แถว invalid ตั้งแต่ parse client → ทำเครื่องหมาย ERROR ทันที ไม่ต้องรอ import
          //
          // ต้นทุนติดลบถูกจับที่นี่ก่อนถึง API โดยตั้งใจ: ฝั่ง server มันจะทำให้ทั้งไฟล์
          // ถูกปฏิเสธเป็น 400 (เหมือน stockQty ติดลบ) การบอกตั้งแต่ตอน preview ว่าแถวไหน
          // ผิดจึงมีประโยชน์กว่าให้กดแล้วเจอข้อความรวม ๆ ว่าไฟล์ใช้ไม่ได้
          status: rowValid ? 'PENDING' : 'ERROR',
          error: !rowValid
            ? productId === ''
              ? 'ไม่พบรหัสสินค้า (productId)'
              : !qtyValid
                ? 'จำนวนสต็อกไม่ถูกต้อง'
                : 'ต้นทุนติดลบไม่ได้'
            : undefined,
        }
      })
      setRows(built)
    }
    reader.onerror = () => setParseError('อ่านไฟล์ไม่สำเร็จ กรุณาลองใหม่')
    reader.readAsText(file, 'utf-8')
    // อนุญาตเลือกไฟล์เดิมซ้ำได้ (change event ยิงซ้ำ) — reset value หลังอ่าน
    e.target.value = ''
  }

  // ─── กด "นำเข้า X แถว" → Sweet Alerts confirm (bulk-overwrite warning) ─────────────────
  const handleImportClick = async () => {
    if (validRows.length === 0) return

    // Base: SubscribeButton.tsx handleOpenDialog — confirm + fetch ใน flow เดียว,
    // error ระดับ request ค้าง dialog ผ่าน showValidationMessage
    const result = await Swal.fire({
      buttonsStyling: false,
      icon: 'warning',
      title: `ยืนยันนำเข้าสต็อก ${validRows.length} แถว?`,
      text: hasCostColumn
        ? 'การนำเข้าจะแทนที่จำนวนสต็อกปัจจุบันของสินค้าที่ตรงกัน และตั้งต้นทุนใหม่ตามไฟล์ (ช่องว่าง = ไม่แก้ไขต้นทุนเดิม) — ตรวจสอบให้แน่ใจ'
        : 'การนำเข้าจะแทนที่จำนวนสต็อกปัจจุบันของสินค้าที่ตรงกัน — ตรวจสอบให้แน่ใจ',
      showCancelButton: true,
      confirmButtonText: `นำเข้า ${validRows.length} แถว`,
      cancelButtonText: 'ยกเลิก',
      showLoaderOnConfirm: true,
      allowOutsideClick: () => !Swal.isLoading(),
      customClass: {
        confirmButton: 'btn bg-primary text-white hover:bg-primary-hover mt-2 me-2',
        cancelButton: 'btn bg-light hover:text-default-800 mt-2',
      },
      preConfirm: async () => {
        try {
          setIsImporting(true)
          const res = await fetch('/api/inventory/csv/import', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              // ส่ง key `cost` เฉพาะแถวที่ไฟล์ระบุมาจริง — แถวที่ cell ว่างต้องไม่มี key นี้เลย
              // ไม่ใช่ส่ง null/0 (นั่นคือ "ล้างค่า"/"ตั้งศูนย์" ซึ่งเป็นคนละความหมาย)
              rows: validRows.map((r) => ({
                productId: r.productId,
                stockQty: r.stockQty,
                ...(r.cost === undefined ? {} : { cost: r.cost }),
              })),
            }),
          })
          const data = await res.json().catch(() => ({}))
          if (!res.ok) {
            Swal.showValidationMessage(requestErrorMessage(data?.error ?? ''))
            return false
          }
          return data as ImportApiResult
        } catch {
          Swal.showValidationMessage('เกิดข้อผิดพลาด กรุณาลองใหม่')
          return false
        } finally {
          setIsImporting(false)
        }
      },
    })

    if (result.isConfirmed && result.value && typeof result.value === 'object') {
      const { successCount, errorCount, results } = result.value as ImportApiResult

      // map ผลจริงกลับเข้าแถว preview ตามลำดับ — validRows ถูกส่งไปตามลำดับเดิมไม่ reorder
      // จึงจับคู่ results[] (ลำดับเดียวกัน) กับ validRows ทีละตัวได้ตรง ๆ
      let vi = 0
      setRows((prev) =>
        prev.map((r) => {
          if (r.stockQty === null) return r // แถว invalid ตั้งแต่ parse — คง ERROR local เดิม ไม่ถูกส่งไป
          const apiResult = results[vi]
          vi++
          if (!apiResult) return r
          return {
            ...r,
            status: apiResult.status,
            error: apiResult.status === 'ERROR' ? rowErrorMessage(apiResult.error) : undefined,
          }
        }),
      )

      // แถวที่ invalid ตั้งแต่ parse (ไม่ถูกส่งเข้า API) นับรวมเป็นความล้มเหลวใน footer summary ด้วย
      const localInvalidCount = rows.length - validRows.length
      const totalErr = errorCount + localInvalidCount
      setSummary({ ok: successCount, err: totalErr })
      setImported(true)

      if (totalErr === 0) {
        pacesToast.success(`นำเข้าสำเร็จ ${successCount} แถว`)
      } else {
        pacesToast.warning(`นำเข้าสำเร็จ ${successCount} แถว, ล้มเหลว ${totalErr} แถว`)
      }
      onSuccess?.()
      router.refresh()
    }
  }

  // ─── badge meta ต่อสถานะแถว ─────────────────────────────────────────────────
  const statusBadge = (status: RowStatus) => {
    switch (status) {
      case 'OK':
        return { label: 'สำเร็จ', cls: 'bg-success/15 text-success' }
      case 'ERROR':
        return { label: 'ล้มเหลว', cls: 'bg-danger/15 text-danger' }
      default:
        return { label: 'รอนำเข้า', cls: 'bg-default-100 text-default-600' }
    }
  }

  // ─── ถ้า modal ถูก controlled ให้ hidden/visible ─────────────────────────────
  // ตรึงหน้าข้างหลังขณะโมดัลเปิด — controlled modal ไม่ได้ของนี้จาก Preline (ดู useLockBodyScroll)
  useLockBodyScroll(open)

  if (!open) return null

  return (
    /* controlled div modal — copy pattern TopUpRequestModal.tsx (ไม่ใช้ hs-overlay data-attr
       เพราะ modal นี้ mount ตาม open prop ของ React state ให้ reset ได้ถูกต้องทุกครั้งเปิด/ปิด) */
    <div
      className="size-full fixed top-0 start-0 z-80 overflow-x-hidden overflow-y-auto bg-black/50 flex items-start sm:items-center py-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="csvImportModalLabel"
      tabIndex={-1}
      onClick={(e) => {
        if (e.target === e.currentTarget) handleClose()
      }}
    >
      {/* modal กว้างกว่า TopUpRequestModal (lg:max-w-2xl แทน lg:max-w-lg) เพราะต้องมีที่พอสำหรับ
          ตาราง preview 4 คอลัมน์ — ไม่ใช่ arbitrary value, ยังอยู่ใน Tailwind scale มาตรฐาน */}
      <div className={'ease-in-out transition-all duration-200 lg:max-w-2xl md:max-w-lg md:w-full w-[calc(100%-24px)] m-3 md:mx-auto flex items-center' /* HR7 carve-out: เปลือกโมดัลที่ใช้ร่วมกัน 8 ไฟล์ (Base: TopUpRequestModal) — Paces ไม่มี token สำหรับ "เต็มจอลบขอบคงที่ 24px" */}>
        <div className="w-full flex flex-col card pointer-events-auto">
          {/* ─── Header ─────────────────────────────────────────────────────── */}
          <div className="card-header p-5">
            <h3 id="csvImportModalLabel" className="font-medium text-sm">
              นำเข้าสต็อกจาก CSV
            </h3>
            <button
              type="button"
              aria-label="ปิด"
              onClick={handleClose}
              disabled={isImporting}
              className="disabled:opacity-40"
            >
              <Icon icon="x" className="text-2xl align-middle text-default-600" />
            </button>
          </div>

          {/* ─── Body ───────────────────────────────────────────────────────── */}
          <div className="card-body overflow-y-auto space-y-5">
            {/* Error banner — parse-level เท่านั้น (ไฟล์ว่าง/header ผิด) */}
            {parseError && (
              <div
                role="alert"
                aria-live="polite"
                className="flex items-start gap-2 rounded-md bg-danger/10 border border-danger/30 p-3 text-sm text-danger"
              >
                <Icon icon="alert-circle" className="shrink-0 text-base mt-0.5" />
                <span>{parseError}</span>
              </div>
            )}

            {/* ─── Dropzone (copy pattern TopUpRequestModal.tsx:313-337, accept=.csv) ──────── */}
            <div>
              <label className="form-label mb-1">ไฟล์ CSV</label>
              <div
                className="relative flex items-center gap-3 rounded-lg border border-default-200 bg-default-50 px-4 py-3 cursor-pointer hover:border-primary transition-colors"
                onClick={() => !isImporting && fileInputRef.current?.click()}
                role="button"
                tabIndex={0}
                aria-label="เลือกไฟล์ CSV"
                onKeyDown={(e) => e.key === 'Enter' && !isImporting && fileInputRef.current?.click()}
              >
                <Icon icon="file-upload" className="size-5 text-default-400 shrink-0" />
                <span className="text-sm text-default-500 truncate flex-1">
                  {fileName || 'คลิกเพื่อเลือกไฟล์ .csv'}
                </span>
                {fileName && !parseError && (
                  <Icon icon="circle-check" className="size-4 text-success shrink-0" />
                )}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv"
                  className="hidden"
                  onChange={handleFileChange}
                  disabled={isImporting}
                />
              </div>
              <a
                href="/api/inventory/csv/export"
                className="mt-2 inline-block text-xs text-primary hover:underline"
              >
                ดาวน์โหลดเทมเพลต (ไฟล์สต็อกปัจจุบัน) →
              </a>
              {/* กฎที่ไม่มีใครเดาเองได้ ต้องอ่านก่อนเลือกไฟล์ ไม่ใช่หลังกด — กรอก 0 ทั้งคอลัมน์
                  เพราะเข้าใจผิด = ล้างต้นทุนทั้งร้าน กู้ไม่ได้ จึงแสดงถาวรไม่ผูกกับการเลือกไฟล์
                  โทนเทากลาง ไม่ใช่ warning เพราะเป็นคำอธิบายวิธีใช้ ไม่ใช่คำเตือนว่ามีอะไรผิด */}
              <div className="bg-default-50 border-default-200 text-default-600 mt-2 flex items-start gap-2 rounded-md border p-2.5 text-xs">
                <Icon icon="info-circle" className="text-default-400 mt-0.5 size-4 shrink-0" aria-hidden="true" />
                <span>
                  คอลัมน์ <strong className="text-default-800">cost</strong> (ต้นทุน):
                  เว้นว่าง = <strong className="text-default-800">ไม่แก้ไข</strong>ต้นทุนเดิม ·
                  ใส่ <strong className="text-default-800">0</strong> = ตั้งต้นทุนเป็น{' '}
                  <strong className="text-default-800">0 บาทจริง</strong>
                </span>
              </div>
            </div>

            {/* ─── Warning banner เกิน 500 แถว ────────────────────────────────────── */}
            {overCap && (
              <div
                role="alert"
                aria-live="polite"
                className="flex items-start gap-2 rounded-md bg-warning/10 border border-warning/30 p-3 text-sm text-warning"
              >
                <Icon icon="alert-triangle" className="shrink-0 text-base mt-0.5" />
                <span>ไฟล์มีมากกว่า 500 แถว ระบบจะนำเข้าเฉพาะ 500 แถวแรกเท่านั้น</span>
              </div>
            )}

            {/* ─── Preview table — plain <table>, ไม่ TanStack (UX-Design-Spec #4) ─────────── */}
            {/* overflow-x-auto จำเป็นตั้งแต่เพิ่มคอลัมน์ที่ 5 (ต้นทุน) — ที่ความกว้างโมดัล
                บนมือถือ (~280px) ห้าคอลัมน์ล้นแน่นอน */}
            {rows.length > 0 && (
              <div className="max-h-96 overflow-x-auto overflow-y-auto rounded-lg border border-default-200">
                <table className="min-w-full divide-y divide-default-200 text-sm">
                  <thead className="bg-default-50 sticky top-0">
                    <tr>
                      <th className="text-default-500 px-3 py-2 text-start text-xs font-semibold uppercase">
                        #
                      </th>
                      <th className="text-default-500 px-3 py-2 text-start text-xs font-semibold uppercase">
                        สินค้า
                      </th>
                      <th className="text-default-500 px-3 py-2 text-start text-xs font-semibold uppercase">
                        สต็อกใหม่
                      </th>
                      <th className="text-default-500 px-3 py-2 text-start text-xs font-semibold uppercase">
                        ต้นทุน
                      </th>
                      <th className="text-default-500 px-3 py-2 text-start text-xs font-semibold uppercase">
                        สถานะ
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-default-200">
                    {rows.map((r) => {
                      const meta = statusBadge(r.status)
                      return (
                        <tr key={r.rowIndex}>
                          <td className="px-3 py-2 text-default-400 tabular-nums">{r.rowIndex}</td>
                          <td className="px-3 py-2 text-default-800 truncate max-w-48">
                            {r.productName}
                          </td>
                          <td className="px-3 py-2 tabular-nums text-default-700">
                            {r.stockQty ?? '—'}
                          </td>
                          {/* "ไม่แก้ไข" ต้องอ่านออกว่าไม่ใช่ค่าตัวเลข จึงใช้สีจาง ส่วน ฿0 เป็นค่าจริง
                              ที่กำลังจะถูกตั้ง ต้องเข้มเท่าตัวเลขอื่น ไม่งั้นสองอย่างนี้ดูเหมือนกัน */}
                          <td className="px-3 py-2 tabular-nums">
                            {r.cost === undefined ? (
                              <span className="text-default-400">ไม่แก้ไข</span>
                            ) : (
                              <span className="text-default-800">{formatBaht(r.cost)}</span>
                            )}
                          </td>
                          <td className="px-3 py-2">
                            <span className={cn('badge', meta.cls)}>{meta.label}</span>
                            {r.status === 'ERROR' && r.error && (
                              <p className="mt-0.5 text-xs text-danger">{r.error}</p>
                            )}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* ─── Footer ─────────────────────────────────────────────────────── */}
          {/* min-h-11 บนปุ่ม footer = 44px touch target */}
          <div className="flex justify-between items-center gap-x-2 border-t border-default-300 card-body">
            {summary ? (
              <p className="text-sm text-default-600">
                สำเร็จ {summary.ok} · ล้มเหลว {summary.err}
              </p>
            ) : (
              <span />
            )}
            <div className="flex items-center gap-x-2">
              {!imported && (
                <button
                  type="button"
                  className="btn bg-light hover:text-primary disabled:opacity-40 min-h-11"
                  onClick={handleClose}
                  disabled={isImporting}
                >
                  ยกเลิก
                </button>
              )}
              {imported ? (
                <button
                  type="button"
                  className="btn bg-primary text-white hover:bg-primary-hover min-h-11"
                  onClick={handleClose}
                >
                  ปิด
                </button>
              ) : (
                <button
                  type="button"
                  disabled={validRows.length === 0 || isImporting}
                  onClick={handleImportClick}
                  className="btn bg-primary text-white hover:bg-primary-hover disabled:opacity-60 inline-flex items-center gap-2 min-h-11"
                >
                  {isImporting && <Icon icon="loader-2" className="size-4 animate-spin" />}
                  นำเข้า {validRows.length} แถว
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
