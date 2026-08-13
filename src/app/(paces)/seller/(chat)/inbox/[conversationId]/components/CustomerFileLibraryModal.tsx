'use client'

/**
 * CustomerFileLibraryModal — "ดูไฟล์ทั้งหมด" ของคลังไฟล์ (feature 00048)
 *
 * Base: CustomerPanelSheet.tsx (โครง responsive bottom-sheet <1024 / modal กลางจอ ≥1024 ซึ่ง Base
 * ของมันเองคือ theme/paces/Admin/TS/src/app/(admin)/ui/offcanvas/page.tsx + ui/modals/page.tsx)
 * ต่างที่ความกว้าง: max-w-3xl แทน max-w-sm เพราะต้องโชว์กริดหลายคอลัมน์
 *
 * 🛑 เปิด "ในหน้าเดิม" ไม่ใช่ navigate ไปหน้าแยก — ออกจากห้องแชทแล้วเสีย scroll/สถานะเธรด
 * ซึ่งเป็นบทเรียนที่โปรเจกต์นี้เจอซ้ำหลายรอบกับ modal/หน้าแยกในบริบทแชท
 *
 * 🛑 React-controlled overlay (ไม่ใช่ hs-overlay ของ Preline) ⇒ **ต้องเรียก useLockBodyScroll เอง**
 * และทุกกล่องที่เลื่อนได้ต้องมี overscroll-contain — การแปลง hs-overlay เป็น controlled div
 * ทิ้งการล็อก scroll ที่เคยได้ฟรีไปทุกใบ (docs/conventions/overlay-scroll-lock.md)
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import Icon from '@/components/wrappers/Icon'
import { useLockBodyScroll } from '@/hooks/useLockBodyScroll'
import { pacesToast } from '@/lib/paces-toast'
import { LIBRARY_COPY, LIBRARY_PAGE_TAKE } from '@/lib/customer-file-library'
import type { LibraryItem } from '@/services/customer-file-library.service'
import CustomerFileTile from './CustomerFileTile'
import CustomerFileViewer from './CustomerFileViewer'

type Cursor = { sentAt: string; id: string }

export default function CustomerFileLibraryModal({
  conversationId,
  customerName,
  onClose,
  onChanged,
}: {
  conversationId: string
  customerName: string
  onClose: () => void
  /** แจ้งแผงด้านหลังให้ refetch พรีวิว 9 ช่อง — เรียกตอนปิด ไม่ใช่ทุกครั้งที่แก้ (มติ D-19 ไม่ทำ realtime) */
  onChanged: () => void
}) {
  const [items, setItems] = useState<LibraryItem[]>([])
  const [cursor, setCursor] = useState<Cursor | null>(null)
  const [loading, setLoading] = useState(true)
  const [failed, setFailed] = useState(false)
  const [active, setActive] = useState<LibraryItem | null>(null)
  const [dirty, setDirty] = useState(false)
  const sentinelRef = useRef<HTMLDivElement | null>(null)

  useLockBodyScroll(true)

  // ESC ปิด (เหมือนทุก sheet/modal ในแอป — precedent CustomerPanelSheet)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !active) handleClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active])

  /**
   * 🛑 loadPage เป็น useCallback ที่ dep เฉพาะ conversationId — ห้ามผูกกับ state ที่เปลี่ยนทุก
   * fetch (items/cursor) ไม่งั้น effect ที่ dep กับมันจะยิงซ้ำไม่หยุด
   * (docs/conventions/hook-return-identity-in-deps.md — เกิดจริงที่ /inbox/comments)
   */
  const loadPage = useCallback(
    async (after: Cursor | null) => {
      const qs = new URLSearchParams({ take: String(LIBRARY_PAGE_TAKE) })
      if (after) {
        qs.set('cursorSentAt', after.sentAt)
        qs.set('cursorId', after.id)
      }
      const res = await fetch(`/api/chat/conversations/${conversationId}/library?${qs.toString()}`)
      if (!res.ok) throw new Error('load failed')
      return (await res.json()) as { items: LibraryItem[]; total: number; nextCursor: Cursor | null }
    },
    [conversationId],
  )

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setFailed(false)
    loadPage(null)
      .then((d) => {
        if (cancelled) return
        setItems(d.items)
        setCursor(d.nextCursor)
      })
      .catch(() => {
        if (!cancelled) setFailed(true)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [loadPage])

  // โหลดเพิ่มเมื่อเลื่อนถึง sentinel — ไม่มีปุ่ม "โหลดเพิ่ม" (Base: OrdersList ใน CustomerPanel.tsx)
  useEffect(() => {
    const node = sentinelRef.current
    if (!node || !cursor || loading) return
    const ob = new IntersectionObserver(
      (entries) => {
        if (!entries[0]?.isIntersecting) return
        setLoading(true)
        loadPage(cursor)
          .then((d) => {
            setItems((prev) => [...prev, ...d.items])
            setCursor(d.nextCursor)
          })
          .catch(() => pacesToast.error(LIBRARY_COPY.loadFailed))
          .finally(() => setLoading(false))
      },
      { rootMargin: '160px' },
    )
    ob.observe(node)
    return () => ob.disconnect()
  }, [cursor, loading, loadPage])

  function handleClose() {
    if (dirty) onChanged()
    onClose()
  }

  return (
    <div className="fixed inset-0 z-80 flex items-end justify-center lg:items-center" role="dialog" aria-modal="true" aria-label={LIBRARY_COPY.sectionTitle}>
      {/* HR7 carve-out: z-80 = viewport overlay lock (precedent CustomerPanelSheet/OrderQrSheet) */}
      <button type="button" aria-label="ปิด" onClick={handleClose} className="bg-default-900/40 absolute inset-0 backdrop-blur-xs" />

      <div className={'bg-card relative flex max-h-[85dvh] w-full flex-col overflow-hidden rounded-t-2xl pb-[env(safe-area-inset-bottom)] shadow-lg lg:h-[80dvh] lg:max-w-3xl lg:rounded-2xl lg:pb-0' /* HR7 carve-out: dvh + safe-area ไม่มี token ใน Paces scale — precedent CustomerPanelSheet.tsx */}>
        {/* grip (มือถือเท่านั้น) */}
        <div className="bg-default-300 mx-auto mt-2 mb-1 h-1 w-9 rounded-full lg:hidden" />

        <div className="border-default-200 flex items-center justify-between gap-2 border-b px-4 py-3">
          {/* min-w-0 ที่กล่อง + max-w-full ที่ลูก — ชื่อลูกค้ายาว 30+ ตัวอักษรต้องถูกตัด
              ไม่ใช่ดันหัวโมดัลกว้างเกินจอ (เกิดบน prod มาแล้ว 2026-08-12) */}
          <h3 className="text-default-900 min-w-0 max-w-full truncate text-base font-bold">
            {LIBRARY_COPY.modalTitle(customerName)}
          </h3>
          <button type="button" onClick={handleClose} aria-label="ปิด" className="btn btn-icon text-default-700 hover:bg-default-100 shrink-0">
            <Icon icon="x" className="text-lg" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4">
          {failed ? (
            <div className="text-default-700 flex flex-col items-center gap-2 py-10 text-sm">
              <span>{LIBRARY_COPY.loadFailed}</span>
              <button type="button" onClick={() => loadPage(null).then((d) => { setItems(d.items); setCursor(d.nextCursor); setFailed(false) }).catch(() => setFailed(true))} className="btn bg-light hover:text-default-800">
                <Icon icon="refresh" className="me-1" /> {LIBRARY_COPY.retry}
              </button>
            </div>
          ) : (
            <>
              {/* 3 คอลัมน์บนจอเล็ก · 4 คอลัมน์เมื่อโมดัลกว้างพอ (มติ Q40) */}
              <div className="grid grid-cols-3 gap-1 lg:grid-cols-4">
                {items.map((it) => (
                  <CustomerFileTile key={it.id} item={it} onOpen={setActive} />
                ))}
              </div>
              <div ref={sentinelRef} />
              {loading ? (
                <div className="text-default-700 flex items-center justify-center gap-2 py-4 text-xs">
                  <span className="border-default-200 border-t-primary size-4 animate-spin rounded-full border-2" />
                  กำลังโหลด...
                </div>
              ) : null}
            </>
          )}
        </div>
      </div>

      <CustomerFileViewer
        conversationId={conversationId}
        items={items}
        active={active}
        onClose={() => setActive(null)}
        onRemoved={(fileId) => {
          setItems((prev) => prev.filter((i) => i.fileId !== fileId))
          setDirty(true)
        }}
        onPatched={(updated) => {
          setItems((prev) => prev.map((i) => (i.fileId === updated.fileId ? updated : i)))
          setDirty(true)
        }}
      />
    </div>
  )
}
