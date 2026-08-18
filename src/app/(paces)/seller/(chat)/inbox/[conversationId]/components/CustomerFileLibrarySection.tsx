'use client'

/**
 * CustomerFileLibrarySection — section "คลังไฟล์" ท้ายแท็บ "ข้อมูลลูกค้า" (feature 00048)
 *
 * อยู่ **ล่างสุด** โดยตั้งใจ: ของที่อยู่เหนือมัน (โปรไฟล์ CRM / ป้าย Meta / สถิติ) คือสิ่งที่ผู้ขาย
 * ต้องอ่านก่อนตอบทุกครั้ง ส่วนคลังไฟล์คือสิ่งที่ "ไปหาเมื่อต้องการ" — ดันขึ้นบนแล้วกริดรูป 9 ช่อง
 * จะผลักโน้ต/เบอร์ตกจอทุกครั้งที่เปิดแผง
 *
 * 🛑 คลังว่างต้อง **แสดง section พร้อมวิธีเก็บ ห้ามซ่อน** — ซ่อนแล้วไม่มีใครค้นพบว่ามีฟีเจอร์นี้
 * (รอยเดิมของรีโปนี้: สวิตช์ที่ 12/12 ร้านไม่เคยเจอเพราะไม่มีอะไรบอกว่ามีอยู่)
 */
import { useCallback, useEffect, useState } from 'react'
import { useT } from '@/i18n/LocaleProvider'
import { fmt } from '@/i18n/fmt'
import Icon from '@/components/wrappers/Icon'
import SellerEmptyState from '@/app/(paces)/seller/(dashboard)/_shared/SellerEmptyState'
import { LIBRARY_ICONS, LIBRARY_PREVIEW_TAKE, LIBRARY_CHANGED_EVENT } from '@/lib/customer-file-library'
import type { LibraryItem } from '@/services/customer-file-library.service'
import CustomerFileTile from './CustomerFileTile'
import CustomerFileViewer from './CustomerFileViewer'
import CustomerFileLibraryModal from './CustomerFileLibraryModal'

export default function CustomerFileLibrarySection({
  conversationId,
  customerName,
  hideHeading = false,
  onTotalChange,
}: {
  conversationId: string
  customerName: string
  /** ผู้เรียกมีหัวข้อของตัวเองอยู่แล้ว (หัวกล่องยุบได้ใน CustomerPanel) → ไม่ต้องมีหัวเรื่องซ้อนกัน 2 ชั้น */
  hideHeading?: boolean
  /** ส่งจำนวนไฟล์ขึ้นไปให้ผู้เรียกโชว์ตอนกล่องยุบ — ตัวเลขยังเป็นของ section นี้เจ้าเดียว (SSOT ไม่แตก) */
  onTotalChange?: (n: number) => void
}) {
  const t = useT()
  const [items, setItems] = useState<LibraryItem[]>([])
  const [total, setTotal] = useState(0)
  // แจ้งจำนวนขึ้นผู้เรียกใน effect (ไม่ใช่ตอน render / ไม่ใช่ใน fetch handler) — ผู้เรียก setState
  // ระหว่าง render ของลูกไม่ได้ และ dep เป็นตัวเลขจึงยิงเฉพาะตอนค่าเปลี่ยนจริง
  useEffect(() => {
    onTotalChange?.(total)
  }, [total, onTotalChange])
  const [loading, setLoading] = useState(true)
  const [failed, setFailed] = useState(false)
  const [active, setActive] = useState<LibraryItem | null>(null)
  const [modalOpen, setModalOpen] = useState(false)

  /**
   * 🛑 dep เฉพาะ conversationId — ห้ามผูกกับ state ที่เปลี่ยนทุกครั้งที่ fetch เสร็จ
   * (docs/conventions/hook-return-identity-in-deps.md: `/inbox/comments` เคยยิง API รัวไม่หยุด
   * เพราะ effect dep กับค่าที่เปลี่ยน identity ทุก render)
   */
  const load = useCallback(async () => {
    const res = await fetch(`/api/chat/conversations/${conversationId}/library?take=${LIBRARY_PREVIEW_TAKE}`)
    if (!res.ok) throw new Error('load failed')
    return (await res.json()) as { items: LibraryItem[]; total: number }
  }, [conversationId])

  const refresh = useCallback(() => {
    setLoading(true)
    setFailed(false)
    load()
      .then((d) => {
        setItems(d.items)
        setTotal(d.total)
      })
      .catch(() => setFailed(true))
      .finally(() => setLoading(false))
  }, [load])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setFailed(false)
    load()
      .then((d) => {
        if (cancelled) return
        setItems(d.items)
        setTotal(d.total)
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
  }, [load])

  /**
   * เก็บ/เอาออกจากคลังเกิดที่ **เธรด** (ปุ่ม hover เดสก์ท็อป · เมนูกดค้างมือถือ · แถบ lightbox)
   * ซึ่งเป็นพี่น้องกับแผงนี้ ส่ง prop ถึงกันไม่ได้ → ฟัง CustomEvent แทน (ทิศตรงข้ามของ
   * `JUMP_TO_MESSAGE_EVENT`; เหตุผลเต็มอยู่ที่ `LIBRARY_CHANGED_EVENT` ใน lib)
   *
   * 🛑 dep เป็น `refresh` ซึ่งเป็น `useCallback` ที่ identity นิ่ง (ผูกกับ conversationId เท่านั้น)
   * ห้ามเปลี่ยนไป dep กับค่าที่ fetch แล้วเปลี่ยน identity ทุกรอบ — จะกลายเป็นลูปยิง API ไม่หยุด
   * (docs/conventions/hook-return-identity-in-deps.md)
   *
   * กรองด้วย conversationId: เธรดที่ปิดไปแล้วอาจยัง unmount ไม่ทันในจังหวะสลับห้อง การรับ
   * ทุก event จะทำให้แผงของอีกห้องยิงโหลดค่าที่ไม่เกี่ยวกับตัวเอง
   */
  useEffect(() => {
    const onChanged = (e: Event) => {
      const id = (e as CustomEvent<{ conversationId?: string }>).detail?.conversationId
      if (id === conversationId) refresh()
    }
    window.addEventListener(LIBRARY_CHANGED_EVENT, onChanged)
    return () => window.removeEventListener(LIBRARY_CHANGED_EVENT, onChanged)
  }, [conversationId, refresh])

  return (
    // ไม่มีเส้นคั่นบน/ระยะห่างบนแล้ว (2026-08-14): ย้ายจาก "ท้ายแท็บข้อมูลลูกค้า" มาเป็นแท็บของ
    // ตัวเอง — เส้นประที่เคยใช้แยกมันออกจากบล็อกเหนือขึ้นไปจึงกลายเป็นเส้นลอยที่ไม่ได้แยกอะไรเลย
    <div>
      {!hideHeading && (
        <div className="mb-2.5 flex items-center gap-1.5">
          <h4 className="text-default-900 text-sm font-semibold">{t.inbox.librarySectionTitle}</h4>
          {/* badge จำนวน — 0 ไม่ render (แสดง empty state แทน ไม่ใช่ badge "0") */}
          {total > 0 ? <span className="badge bg-default-100 text-default-700 text-2xs">{total}</span> : null}
        </div>
      )}

      {loading && items.length === 0 ? (
        // skeleton แพตเทิร์นเดียวกับ crmSlot ในไฟล์แม่ (CustomerPanel.tsx)
        <div className="bg-default-100 h-40 animate-pulse rounded-lg" />
      ) : failed ? (
        <div className="text-default-700 flex flex-col items-center gap-2 py-6 text-sm">
          <span>{t.inbox.libraryLoadFailed}</span>
          <button type="button" onClick={refresh} className="btn bg-light hover:text-default-800">
            <Icon icon="refresh" className="me-1" /> {t.inbox.libraryRetry}
          </button>
        </div>
      ) : items.length === 0 ? (
        <SellerEmptyState compact icon={LIBRARY_ICONS.empty} title={t.inbox.libraryEmptyTitle} description={t.inbox.libraryEmptyBody} />
      ) : (
        <>
          {/* กริด 3 คอลัมน์คงที่ทุก breakpoint — ช่องโตตาม container ไม่เพิ่มคอลัมน์
              (แผงกว้าง 384px บนเดสก์ท็อป และเต็มความกว้างในโหมด sheet) */}
          <div className="grid grid-cols-3 gap-1">
            {items.map((it) => (
              <CustomerFileTile key={it.id} item={it} onOpen={setActive} />
            ))}
          </div>

          {/* ลิงก์โผล่เฉพาะเมื่อมีของเกินที่โชว์จริง — ปุ่มที่กดแล้วเห็นของเท่าเดิมคือปุ่มที่หลอกให้กด */}
          {total > LIBRARY_PREVIEW_TAKE ? (
            <div className="mt-2.5 text-center">
              <button type="button" onClick={() => setModalOpen(true)} className="text-primary inline-flex items-center gap-0.5 text-sm font-medium">
                {fmt(t.inbox.librarySeeAll, { n: total })}
                <Icon icon="chevron-right" className="text-base" aria-hidden="true" />
              </button>
            </div>
          ) : null}
        </>
      )}

      <CustomerFileViewer
        conversationId={conversationId}
        items={items}
        active={active}
        onClose={() => setActive(null)}
        onRemoved={(fileId) => {
          setItems((prev) => prev.filter((i) => i.fileId !== fileId))
          setTotal((t) => Math.max(0, t - 1))
          // ถ้ายังมีของเหลือเกิน 9 ใบ การลบทำให้ต้องดึงใบถัดไปขึ้นมาแทนช่องที่หายไป
          refresh()
        }}
        onPatched={(updated) => setItems((prev) => prev.map((i) => (i.fileId === updated.fileId ? updated : i)))}
      />

      {modalOpen ? (
        <CustomerFileLibraryModal
          conversationId={conversationId}
          customerName={customerName}
          onClose={() => setModalOpen(false)}
          onChanged={refresh}
        />
      ) : null}
    </div>
  )
}
