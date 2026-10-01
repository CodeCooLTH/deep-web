'use client'
import { cn } from '@/utils/helpers'
import Icon from '../wrappers/Icon'

export type TablePaginationProps = {
  totalItems: number
  start: number
  end: number
  itemsName?: string
  showInfo?: boolean
  // Pagination control props
  previousPage: () => void
  canPreviousPage: boolean
  pageCount: number
  pageIndex: number
  setPageIndex: (index: number) => void
  nextPage: () => void
  canNextPage: boolean
}

/**
 * สร้าง list ของ page index ที่จะแสดง (windowing)
 * - ถ้า pageCount ≤ 7 → แสดงทุกหน้า (เหมือนเดิม)
 * - ถ้า pageCount > 7 → แสดง first + current±1 + last + ellipsis
 *   ผลลัพธ์: number = index ของหน้า, null = ellipsis
 */
function buildPageWindows(pageCount: number, pageIndex: number): (number | null)[] {
  if (pageCount <= 7) {
    return Array.from({ length: pageCount }, (_, i) => i)
  }

  const pages: (number | null)[] = []
  const first = 0
  const last = pageCount - 1

  // ช่วงที่แสดงรอบ current: current-1, current, current+1 (clamp ให้อยู่ใน range)
  const windowStart = Math.max(first + 1, pageIndex - 1)
  const windowEnd = Math.min(last - 1, pageIndex + 1)

  // หน้าแรก
  pages.push(first)

  // ellipsis ซ้าย (ถ้า windowStart > first+1)
  if (windowStart > first + 1) {
    pages.push(null)
  }

  // หน้ากลาง (window)
  for (let i = windowStart; i <= windowEnd; i++) {
    pages.push(i)
  }

  // ellipsis ขวา (ถ้า windowEnd < last-1)
  if (windowEnd < last - 1) {
    pages.push(null)
  }

  // หน้าสุดท้าย
  pages.push(last)

  return pages
}

const TablePagination = ({
  totalItems,
  start,
  end,
  itemsName = 'รายการ',
  showInfo,
  previousPage,
  canPreviousPage,
  pageCount,
  pageIndex,
  setPageIndex,
  nextPage,
  canNextPage,
}: TablePaginationProps) => {
  const pageWindows = buildPageWindows(pageCount, pageIndex)

  return (
    // flex-wrap — จอ 320 การ์ดเหลือ ~248px แต่ปุ่มหน้า (44px/ปุ่มบนมือถือ) + ข้อความรวม ~334px
    // เดิมเป็นแถวไม่ตัดบรรทัด แล้ว body overflow-x:hidden ตัดปุ่ม "ถัดไป" หายไปเลย = ไปหน้าถัดไปไม่ได้ (audit 2026-10-01)
    <div
      className={cn(
        'flex w-full flex-wrap items-center gap-x-3 gap-y-2 text-center',
        showInfo ? 'justify-center sm:justify-between' : 'justify-center sm:justify-end',
      )}
    >
      {showInfo && (
        <div className="text-default-700 w-full sm:w-auto sm:text-start">
          {/* ข้อความภาษาไทย แทน "Showing X to Y of N items" */}
          แสดง <span className="font-semibold">{start}</span>–<span className="font-semibold">{end}</span> จาก <span className="font-semibold">{totalItems}</span> {itemsName}
        </div>
      )}
      <div className="mt-sm-0">
        <div>
          <ul className="pagination pagination-boxed pagination-sm mb-0 flex flex-wrap justify-center gap-y-1">
            <li className="page-item">
              <button className="page-link" onClick={() => previousPage()} disabled={!canPreviousPage}>
                <span>
                  <Icon icon="chevron-left" />
                </span>
              </button>
            </li>

            {pageWindows.map((pageNum, idx) =>
              pageNum === null ? (
                // ellipsis — disabled, ไม่สามารถกดได้
                <li key={`ellipsis-${idx}`} className="page-item disabled" aria-hidden="true">
                  <span className="page-link">…</span>
                </li>
              ) : (
                <li key={pageNum} className={`page-item ${pageIndex === pageNum ? 'active' : ''}`}>
                  <button className="page-link" onClick={() => setPageIndex(pageNum)}>
                    {pageNum + 1}
                  </button>
                </li>
              )
            )}

            <li className="page-item">
              <button className="page-link" onClick={() => nextPage()} disabled={!canNextPage}>
                <Icon icon="chevron-right" />
              </button>
            </li>
          </ul>
        </div>
      </div>
    </div>
  )
}

export default TablePagination
