'use client'

/**
 * ProductMultiSelectSheet — เลือกสินค้าหลายชิ้นแล้วส่งเป็นการ์ดเลื่อนซ้ายขวาใบเดียว
 * (ส่วนขยาย 2026-08-11 — user สั่ง "อยากส่งหลายรายการได้")
 *
 * ทำไมเป็นชีต/โมดัลแยก ไม่ใช่ toggle บนสไลด์แนวนอนของ ProductPickerPanel: สไลด์นั้นการ์ดกว้าง
 * 112px ต่อใบและเลื่อนแนวนอน — พอเลือกหลายชิ้นแล้ว "ทบทวนว่าเลือกอะไรไปบ้าง" ต้องเลื่อนไป-มา
 * ซึ่งเป็นปัญหาเดียวกับที่ QuickMessageBar เจอและแก้ไปแล้วในโฟลเดอร์เดียวกัน (grid + ค้นหา +
 * เต็มพื้นที่แชทบนมือถือ / โมดัลกลางจอบนเดสก์ท็อป) — ยกโครงนั้นมาทั้งชุดแทนการประดิษฐ์ใหม่
 * ผลพลอยได้: โหมดเดิม (เลือกชิ้นเดียว 4 รูปแบบ) ไม่ถูกแตะเลยแม้แต่บรรทัดเดียว
 *
 * Base: QuickMessageBar.tsx (container/backdrop/z-index/header/ค้นหา/skeleton/empty/error ทั้งชุด)
 *   + ProductPickerPanel.tsx (การ์ดสินค้า: ProductThumb aspect-video, ชื่อ line-clamp-2 min-h-8,
 *     ราคา bold, บรรทัด meta คงเหลือ/สั่งซื้อแล้ว) + VerticalTaxonomyPicker.tsx (ChoiceCard:
 *     กรอบหนา + เครื่องหมายถูกมุมขวาบนเมื่อถูกเลือก)
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import Icon from '@/components/wrappers/Icon'
import ProductThumb from '@/app/(paces)/seller/(dashboard)/orders/new/components/ProductThumb'
import { useLockBodyScroll } from '@/hooks/useLockBodyScroll'
import { useThreadShopId } from '@/app/(paces)/seller/(chat)/_components/DraftOrderProvider'
import {
  describeProductSelection,
  maxSelectableProducts,
  productCardsPerMessage,
  productSendButtonLabel,
} from '@/lib/chat-product-card-batch'

/** ชุด field เดียวกับ ProductPickerPanel — มาจาก GET /api/products ตัวเดียวกัน */
type PickerProduct = {
  id: string
  name: string
  price: number
  images: string[]
  isActive: boolean
  stockQty: number | null
  soldCount?: number
}

const formatThb = (n: number) => new Intl.NumberFormat('th-TH', { style: 'currency', currency: 'THB' }).format(n)

/** guard ชุดเดียวกับ ProductPickerPanel — seed เก่าบางตัวเก็บเป็น URL เต็ม ไม่ใช่ storage fileId */
function imageSrc(images: string[]): string | null {
  const first = images[0]
  if (!first) return null
  return String(first).startsWith('http') ? String(first) : `/api/files/${first}`
}

type Props = {
  /** ช่องทางของเธรด — ตัวกำหนดเพดานต่อข้อความ/เพดานรวม (ดู lib/chat-product-card-batch) */
  channel: string
  /** ส่งการ์ด — คืน true เมื่อสำเร็จ (ชีตปิดเอง); false = เปิดค้างไว้ให้กดใหม่โดยไม่ต้องเลือกซ้ำ */
  onSend: (productIds: string[]) => Promise<boolean>
  /** ปิดชีต กลับไปแถบเลือกสินค้าเดิม (ไม่ปิดทั้งแผง) */
  onClose: () => void
  disabled?: boolean
}

export default function ProductMultiSelectSheet({ channel, onSend, onClose, disabled }: Props) {
  // ชีตนี้ mount เฉพาะตอนเปิด จึงตรึงหน้าข้างหลังตลอดอายุของมัน (docs/conventions/overlay-scroll-lock.md)
  useLockBodyScroll(true)

  const [items, setItems] = useState<PickerProduct[]>([])
  const [loading, setLoading] = useState(true)
  const [failed, setFailed] = useState(false)
  const [q, setQ] = useState('')
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [sending, setSending] = useState(false)

  const perMessage = productCardsPerMessage(channel)
  const maxSelectable = maxSelectableProducts(channel)

  /** ร้านของเธรดที่เปิดอยู่ (feature 00037) — ชีตนี้ส่งการ์ดสินค้าออกให้ลูกค้าเหมือนแผงเลือกเดี่ยว */
  const threadShopId = useThreadShopId()

  const load = useCallback(async () => {
    setLoading(true)
    setFailed(false)
    try {
      // shopId = ร้านของเธรด ไม่ใช่ร้านที่ active (เหตุผลเต็มอยู่ที่ ProductPickerPanel)
      const res = await fetch(
        `/api/products?sort=best${threadShopId ? `&shopId=${encodeURIComponent(threadShopId)}` : ''}`,
        { cache: 'no-store' },
      )
      if (!res.ok) {
        setFailed(true)
        return
      }
      const data: PickerProduct[] = await res.json()
      setItems(data.filter((p) => p.isActive))
    } catch {
      setFailed(true)
    } finally {
      setLoading(false)
    }
  }, [threadShopId])

  useEffect(() => {
    load()
  }, [load])

  /**
   * Escape ถอยทีละชั้นเหมือนที่ ProductPickerPanel ทำอยู่แล้ว — มีของเลือกค้างอยู่ = ล้างก่อน
   * ปิดรวดเดียวทั้งที่เพิ่งเลือกไป 12 ชิ้นคือการทำลายงานของผู้ใช้โดยกดปุ่มเดียว
   */
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== 'Escape' || sending) return
      if (selectedIds.length > 0) setSelectedIds([])
      else onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose, selectedIds.length, sending])

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase()
    if (!needle) return items
    return items.filter((p) => p.name.toLowerCase().includes(needle))
  }, [items, q])

  const count = selectedIds.length
  const selection = describeProductSelection(count, perMessage)
  const atMax = count >= maxSelectable

  function toggle(id: string) {
    setSelectedIds((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id)
      if (prev.length >= maxSelectable) return prev // เพดานรวม — การ์ดที่ยังไม่เลือกถูก disable อยู่แล้ว
      return [...prev, id]
    })
  }

  async function handleSend() {
    if (count === 0 || sending || disabled) return
    setSending(true)
    try {
      const ok = await onSend(selectedIds)
      if (ok) onClose()
    } finally {
      setSending(false)
    }
  }

  return (
    <>
      {/* backdrop — เดสก์ท็อปเท่านั้น (ใต้ lg ชีตเต็มพื้นที่แชทอยู่แล้ว ไม่มีฉากหลังให้มืด)
          Base: QuickMessageBar.tsx */}
      <div className="fixed inset-0 z-80 hidden bg-black/50 lg:block" aria-hidden="true" onMouseDown={onClose} />
      <div
        className="bg-card absolute inset-0 z-40 flex flex-col lg:fixed lg:z-80 lg:m-auto lg:h-176 lg:max-h-full lg:w-full lg:max-w-5xl lg:rounded-lg lg:shadow-lg"
        role="dialog"
        aria-modal="true"
        aria-label="เลือกสินค้าหลายชิ้น"
      >
        {/* header — โครงเดียวกับ QuickMessageBar/ProductPickerPanel (ชื่อ+ไอคอนซ้าย, ปิดขวา) */}
        <div className="border-default-300 flex items-center justify-between gap-2 border-b border-dashed px-4 py-2.5 sm:px-6">
          <span className="text-info flex items-center gap-2 text-sm font-semibold">
            <Icon icon="layers-intersect" className="text-base" />
            เลือกสินค้าหลายชิ้น
          </span>
          <button
            type="button"
            onClick={onClose}
            aria-label="ปิด"
            className="text-default-700 hover:text-default-800 flex size-7 items-center justify-center rounded"
          >
            <Icon icon="x" className="text-base" />
          </button>
        </div>

        {/* ค้นหา */}
        <div className="px-4 pt-3 sm:px-6">
          <div className="input-icon-group">
            <Icon icon="search" className="input-icon" />
            <input
              type="search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="ค้นหาสินค้า"
              aria-label="ค้นหาสินค้า"
              className="form-input bg-card"
            />
          </div>
        </div>

        {/* กริดการ์ด */}
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-3 sm:px-6">
          {loading ? (
            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
              {[0, 1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="bg-default-100 h-40 animate-pulse rounded-lg" role="status" aria-label="กำลังโหลดสินค้า" />
              ))}
            </div>
          ) : failed ? (
            <div className="text-default-700 flex flex-col items-center gap-2 py-10 text-center text-sm">
              <span>โหลดรายการสินค้าไม่สำเร็จ</span>
              <button type="button" onClick={load} className="btn border-default-300 min-h-11">
                <Icon icon="refresh" className="me-1" /> ลองใหม่
              </button>
            </div>
          ) : filtered.length === 0 ? (
            <p className="text-default-700 mb-0 py-10 text-center text-sm">
              {items.length === 0 ? 'ยังไม่มีสินค้าที่เปิดขายอยู่' : `ไม่พบสินค้าที่ตรงกับ "${q.trim()}"`}
            </p>
          ) : (
            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
              {filtered.map((p) => {
                const isSelected = selectedIds.includes(p.id)
                // เต็มเพดานรวมแล้ว → ใบที่ยังไม่ถูกเลือกกดไม่ได้ (ใบที่เลือกแล้วยังกดเอาออกได้เสมอ)
                const blocked = !isSelected && atMax
                return (
                  <button
                    key={p.id}
                    type="button"
                    aria-pressed={isSelected}
                    aria-label={`${p.name} ${formatThb(p.price)}${isSelected ? ' เลือกแล้ว' : ''}`}
                    disabled={disabled || blocked || sending}
                    onClick={() => toggle(p.id)}
                    className={`bg-card relative overflow-hidden rounded-lg border-2 text-left transition-colors ${
                      isSelected ? 'border-info bg-info/5' : 'border-default-200 hover:border-info/40'
                    } ${disabled || blocked || sending ? 'pointer-events-none opacity-50' : ''}`}
                  >
                    {isSelected && (
                      <span className="bg-card absolute end-2 top-2 z-10 rounded-full p-0.5 shadow-sm">
                        <Icon icon="circle-check-filled" className="text-info size-5" />
                      </span>
                    )}
                    <ProductThumb src={imageSrc(p.images)} alt={p.name} className="aspect-video w-full" iconClassName="size-8" />
                    <div className="p-2">
                      <p className="text-dark line-clamp-2 min-h-8 text-xs font-medium">{p.name}</p>
                      <p className="text-primary mt-0.5 truncate text-sm font-bold">{formatThb(p.price)}</p>
                      {p.stockQty !== null ? (
                        <p className="text-default-700 mt-1 flex items-center gap-1 truncate text-2xs">
                          <Icon icon="stack-2" className="size-3 shrink-0" />
                          คงเหลือ {p.stockQty.toLocaleString('th-TH')}
                        </p>
                      ) : (
                        <p className="text-default-700 mt-1 flex items-center gap-1 truncate text-2xs">
                          <Icon icon="package" className="size-3 shrink-0" />
                          สั่งซื้อแล้ว {(p.soldCount ?? 0).toLocaleString('th-TH')} ชิ้น
                        </p>
                      )}
                    </div>
                  </button>
                )
              })}
            </div>
          )}
        </div>

        {/* footer — ตัวนับ + ป้ายแบ่งข้อความ + ปุ่มส่ง
            🛑 ป้าย "จะแบ่งเป็นกี่ข้อความ" ต้องอยู่ **ก่อนกดส่ง** (มติ user 2026-08-11) และอยู่ 2 จุด
            (banner + บนตัวปุ่มเอง) — ผู้ขายที่ตากวาดไปที่ปุ่มอย่างเดียวต้องเห็นเหมือนกัน
            warning ไม่ใช่ danger: เกินเพดานไม่ใช่ความผิดพลาด ยังกดส่งได้ปกติ */}
        <div className="border-default-300 border-t px-4 py-3 sm:px-6">
          {selection.exceedsPerMessage && (
            <div className="bg-warning/15 text-warning-ink mb-2 flex items-start gap-1.5 rounded px-2 py-1.5 text-xs">
              <Icon icon="alert-triangle" className="mt-0.5 shrink-0 text-sm" />
              <span>{selection.text}</span>
            </div>
          )}
          <div className="mb-2 flex items-center justify-between gap-2">
            <span className="text-default-700 min-w-0 truncate text-xs" aria-live="polite">
              {selection.exceedsPerMessage ? `เลือกแล้ว ${count} รายการ` : selection.text}
            </span>
            {count > 0 && (
              <button
                type="button"
                onClick={() => setSelectedIds([])}
                disabled={sending}
                className="text-default-700 hover:text-danger shrink-0 text-xs"
              >
                ล้างทั้งหมด
              </button>
            )}
          </div>
          {atMax && (
            <p className="text-default-700 mb-2 text-2xs">เลือกได้สูงสุด {maxSelectable} รายการต่อการส่งหนึ่งครั้ง</p>
          )}
          <button
            type="button"
            onClick={handleSend}
            disabled={count === 0 || sending || disabled}
            className="btn bg-primary min-h-11 w-full text-white disabled:opacity-50"
          >
            {sending ? (
              <>
                <Icon icon="loader-2" className="me-1 animate-spin" /> กำลังส่ง…
              </>
            ) : (
              productSendButtonLabel(count, perMessage)
            )}
          </button>
        </div>
      </div>
    </>
  )
}
