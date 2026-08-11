'use client'

/**
 * ProductPickerPanel — แผง "เลือกสินค้า" เหนือช่องพิมพ์ (feature 00018 composer improvement #4)
 *
 * user สั่ง 2026-07-23: "เพิ่ม action button ในช่องพิมพ์ กดแล้วเลือกสินค้า และเวลาเลือกสินค้าจะต้อง
 * เลือกรูปแบบการส่งได้: ส่งรูปภาพสินค้าอย่างเดียว / ส่งรายละเอียดสินค้า / ส่งจำนวนคงเหลือ"
 *
 * โครง/สไตล์ = แผงเดียวกับ QuickMessageBar + AiSuggestPanel เป๊ะ (แถบ in-flow full-bleed, header
 * ไอคอน+ชื่อซ้าย / ปิดขวา, body max-h-64 scroll) — accent เป็น `info` เพื่อแยกจาก primary
 * (สำเร็จรูป) และ success (AI); เปิดได้ทีละแผงเท่านั้นผ่าน activePanel ของ ChatThread
 *
 * 🔄 **แก้ 2026-08-11:** เดิม "ทุกโหมดเติมลงช่องพิมพ์ ไม่ส่งออกเอง" โดยให้เหตุผลข้อ 2 ว่า
 * *การ์ดสินค้าส่งได้เฉพาะเธรด Deep — Messenger/IG คืน 400* — **เหตุผลนั้นหมดไปแล้ว** ตอนนี้
 * ทุกช่องทางส่งการ์ดได้ (LINE = Flex, Messenger/IG = Generic Template) จึงเพิ่ม **โหมดที่ 4
 * "ส่งการ์ดสินค้า" ที่ส่งออกทันที** ส่วน 3 โหมดเดิมยังเติมช่องพิมพ์เหมือนเดิมทุกประการ
 *
 * เหตุผลข้อ 1 ยังจริงและเป็นเหตุผลที่ไม่เปลี่ยน 3 โหมดเดิม:
 *   1) พฤติกรรมเดียวกับข้อความสำเร็จรูปที่ user อนุมัติแล้ว (คนตรวจก่อนกดส่งเสมอ)
 *
 * 🛑 **แก้ 2026-08-11 (รอบสอง): ยุบ `ProductMultiSelectSheet` กลับเข้ามาเป็น "โหมด" ของแผงนี้**
 * รอบแรกทำเป็นชีตแยกโดยให้เหตุผลว่าสไลด์แนวนอน (การ์ด 112px) ทบทวนของที่เลือกยาก จึงยกโครง grid
 * ของ QuickMessageBar มาใช้ — **เหตุผลนั้นตอบได้แค่ว่า "ต้องเห็นของที่เลือก" ไม่ได้ตอบว่า "ต้องเป็น
 * คนละแผง"** สิ่งที่ออกมาคือแผงที่สองซึ่งซ้ำกับแผงนี้เกือบทั้งใบ (fetch เดียวกัน ค้นหา skeleton
 * empty error การ์ดสินค้า ก็อปมาทั้งชุด) แต่ใช้ไอคอน/ชื่อหัวข้อ/ทรงคนละแบบ → ผู้ขายอ่านว่าเป็น
 * *คนละฟีเจอร์* ทั้งที่มันคือรายการสินค้าตัวเดิมที่ติ๊กได้ (user ทัก 2026-08-11: "ทำไมต้องแยก panel
 * ในเมื่อกดตรง icon มันก็แค่เปิดให้เลือกสินค้าได้หลายรายการ" + "มันไม่จำเป็นต้องเป็นกริดก็ได้
 * มันก็เป็น carousel เหมือนเดิม แต่ทำให้ checked ได้")
 *
 * Base: theme/paces/Admin/TS/src/app/(admin)/apps/chat/components/ChatPage.tsx (composer/แถวการ์ด)
 *   + AiSuggestPanel.tsx/QuickMessageBar.tsx ในเธรดนี้ (โครงแผงที่ user อนุมัติแล้ว)
 *   + VerticalTaxonomyPicker.tsx (เครื่องหมายถูกมุมขวาบนของการ์ดที่ถูกเลือก)
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import Icon from '@/components/wrappers/Icon'
import ProductThumb from '@/app/(paces)/seller/(dashboard)/orders/new/components/ProductThumb'
import { useThreadShopId } from '@/app/(paces)/seller/(chat)/_components/DraftOrderProvider'
import {
  describeProductSelection,
  maxSelectableProducts,
  productCardsPerMessage,
  productSendButtonLabel,
} from '@/lib/chat-product-card-batch'

/** field ที่ใช้จริงจาก GET /api/products (serializeProduct คืนมากกว่านี้ — ประกาศเท่าที่ใช้) */
type PickerProduct = {
  id: string
  name: string
  price: number
  images: string[]
  shortDescription: string | null
  description: string | null
  isActive: boolean
  /** null = ร้านไม่ได้ track สต็อก (ไม่มี Inventory add-on หรือไม่ได้เปิด track ต่อสินค้า) */
  stockQty: number | null
  /** จำนวนสั่งซื้อรวม (ไม่รวม CANCELLED) — มาจาก `?sort=best` (0 = ยังไม่เคยมีคนสั่งซื้อ) */
  soldCount?: number
}

const formatThb = (n: number) => new Intl.NumberFormat('th-TH', { style: 'currency', currency: 'THB' }).format(n)

/** เนื้อหาที่จะเติมลงช่องพิมพ์ — text และ/หรือ รูปแนบ */
export type ProductPickPayload = {
  text?: string
  imageFileId?: string
  /** (2026-08-11) โหมดที่ 4 "ส่งการ์ดสินค้า" — ส่งออกทันที ไม่เติมช่องพิมพ์ (ดู comment หัวไฟล์)
   *  ChatThread เป็นคนยิง `type=PRODUCT` เพราะแผงนี้ไม่รู้จัก conversationId */
  sendCardProductId?: string
}

type Props = {
  onPick: (payload: ProductPickPayload) => void
  onClose: () => void
  disabled?: boolean
  /** ช่องทางของเธรด — ตัวกำหนดเพดานการ์ดต่อข้อความ/เพดานรวม (ดู lib/chat-product-card-batch) */
  channel: string
  /** ส่งการ์ดหลายใบ — คืน true เมื่อสำเร็จ (แผงปิดเอง); false = คงโหมดเลือกหลายรายการและของที่
   *  เลือกไว้ครบ กดใหม่ได้ทันทีโดยไม่ต้องไล่ติ๊กใหม่ */
  onSendMany: (productIds: string[]) => Promise<boolean>
}

/** รูปแรกของสินค้า — seed เก่าบางตัวเก็บเป็น URL เต็ม (picsum/CDN) ไม่ใช่ storage fileId
 *  (guard ชุดเดียวกับ (dashboard)/products/page.tsx:98-100) */
function imageSrc(images: string[]): string | null {
  const first = images[0]
  if (!first) return null
  return String(first).startsWith('http') ? String(first) : `/api/files/${first}`
}

const priceText = (p: number) => `฿${p.toLocaleString('th-TH')}`

export default function ProductPickerPanel({ onPick, onClose, disabled, channel, onSendMany }: Props) {
  const [items, setItems] = useState<PickerProduct[]>([])
  const [loading, setLoading] = useState(true)
  const [failed, setFailed] = useState(false)
  const [q, setQ] = useState('')
  const [selected, setSelected] = useState<PickerProduct | null>(null)
  /** โหมดเลือกหลายรายการ — สไลด์ตัวเดิมทุกประการ ต่างแค่ "แตะแล้วติ๊ก" แทน "แตะแล้วไปหน้าเลือกรูปแบบ" */
  const [multi, setMulti] = useState(false)
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [sending, setSending] = useState(false)

  const perMessage = productCardsPerMessage(channel)
  const maxSelectable = maxSelectableProducts(channel)
  const count = selectedIds.length
  const selection = describeProductSelection(count, perMessage)
  const atMax = count >= maxSelectable

  /**
   * ร้านของเธรดที่เปิดอยู่ (feature 00037) — **ไม่ใช่ร้านที่ active**
   *
   * 🛑 แผงนี้เอาผลไปส่ง "การ์ดสินค้า" ให้ลูกค้าจริง หยิบผิดร้าน = ส่งชื่อ/ราคา/รูปของอีกร้าน
   * ออกไปหาลูกค้า โดยไม่มีอะไรบนจอบอกว่าผิด (คลาสเดียวกับบั๊กสร้างออเดอร์ 2026-08-11)
   */
  const threadShopId = useThreadShopId()

  const load = useCallback(async () => {
    setLoading(true)
    setFailed(false)
    try {
      // ?sort=best — ขายดีก่อน (user สั่ง 2026-07-23) แล้วต่อด้วยตัวที่ยังไม่เคยขาย + แนบ soldCount
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
   * Escape ถอย "ทีละชั้น" ไม่ปิดรวดเดียว — กดพลาดแล้วต้องเริ่มใหม่คือการทำลายงานของผู้ใช้ด้วยปุ่มเดียว
   * ลำดับ: หน้าเลือกรูปแบบ → รายการ · มีของติ๊กค้าง → ล้างของที่ติ๊ก · อยู่โหมดหลายรายการ → กลับโหมดเดิม
   */
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== 'Escape' || sending) return
      if (selected) setSelected(null)
      else if (count > 0) setSelectedIds([])
      else if (multi) setMulti(false)
      else onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose, selected, multi, count, sending])

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase()
    if (!needle) return items
    return items.filter((p) => p.name.toLowerCase().includes(needle))
  }, [items, q])

  /** รายละเอียดสินค้า = ชื่อ + ราคา + คำอธิบายสั้น (user เลือก 2026-07-23) — ไม่ใช้ description
   *  ตัวเต็มเพราะยาวเกินไปสำหรับแชท (ยังแก้ต่อในช่องพิมพ์ได้ก่อนส่ง) */
  function detailText(p: PickerProduct) {
    const lines = [p.name, priceText(p.price)]
    const short = p.shortDescription?.trim()
    if (short) lines.push(short)
    return lines.join('\n')
  }

  function pick(mode: 'image' | 'detail' | 'stock' | 'card') {
    if (!selected || disabled) return
    const img = selected.images[0]
    if (mode === 'card') onPick({ sendCardProductId: selected.id })
    else if (mode === 'image') onPick({ imageFileId: img })
    else if (mode === 'detail') onPick({ text: detailText(selected), imageFileId: img })
    else onPick({ text: `${selected.name} — คงเหลือ ${selected.stockQty} ชิ้น` })
    setSelected(null)
  }

  function toggle(id: string) {
    setSelectedIds((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id)
      if (prev.length >= maxSelectable) return prev // เพดานรวม — ใบที่ยังไม่ติ๊กถูก disable อยู่แล้ว
      return [...prev, id]
    })
  }

  /** ออกจากโหมดหลายรายการ = ทิ้งของที่ติ๊กไว้เสมอ ไม่ให้ค้างเป็นสถานะที่มองไม่เห็นในโหมดเดิม */
  function leaveMulti() {
    setMulti(false)
    setSelectedIds([])
  }

  async function handleSendMany() {
    if (count === 0 || sending || disabled) return
    setSending(true)
    try {
      await onSendMany(selectedIds) // สำเร็จ → ChatThread ปิดทั้งแผงเอง (แผงนี้ unmount ไปแล้ว)
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="border-default-300 bg-info/5 -mx-4 -mt-3 mb-3 border-b border-dashed px-4 py-2 sm:-mx-6 sm:-mt-3.75 sm:px-6">
      <div className="flex items-center justify-between pb-1.5">
        <span className="text-info flex items-center gap-2 text-sm font-semibold">
          {selected ? (
            <>
              <button
                type="button"
                onClick={() => setSelected(null)}
                aria-label="กลับไปเลือกสินค้า"
                className="text-default-700 hover:text-info flex size-7 items-center justify-center rounded"
              >
                <Icon icon="arrow-left" className="text-base" />
              </button>
              <span className="max-w-52 truncate">{selected.name}</span>
            </>
          ) : (
            <>
              <Icon icon="package" className="text-base" />
              เลือกสินค้า
            </>
          )}
        </span>
        <span className="flex items-center gap-1">
          {/* สวิตช์โหมดหลายรายการ — โผล่เฉพาะหน้ารายการ ไม่ใช่หน้าเลือกรูปแบบการส่ง (ตรงนั้นผู้ใช้
              เลือกสินค้าไปแล้ว 1 ชิ้น การกดตรงนี้จะกำกวมว่าของที่เลือกไว้หายไปไหน)

              🛑 ต้องมี "ข้อความ" ไม่ใช่ไอคอนเปล่า (user สั่ง 2026-08-11) — ไอคอน `square-check`
              เดี่ยว ๆ อ่านไม่ออกว่ามันทำอะไร มี aria-label ก็ช่วยเฉพาะ screen reader คนที่มองเห็น
              ต้องเดาเอาเอง (คลาสเดียวกับป้ายพฤติกรรมลูกค้าที่เพิ่งแก้ไปคอมมิต 81f66bc0)
              เป็น toggle จริง ๆ (aria-pressed) ไม่ใช่ประตูไปแผงอื่น — กดซ้ำกลับโหมดเดิมได้

              min-h-11 sm:min-h-7 — 44px เฉพาะจอที่กดด้วยนิ้ว ส่วนจอกว้าง (rail ในเดสก์ท็อป = เมาส์)
              ยุบกลับให้เท่าปุ่มปิดข้าง ๆ ไม่ให้หัวแผงบวมกินพื้นที่เธรด. ท่าเดียวกับปุ่ม "ตอบเอง"
              ของแถบ Meta AI ใน ChatThread.tsx ไฟล์เดียวกันนี้ */}
          {!selected && (
            <button
              type="button"
              onClick={() => (multi ? leaveMulti() : setMulti(true))}
              disabled={disabled || sending}
              aria-pressed={multi}
              className={`focus-visible:ring-info-ink flex min-h-11 items-center gap-1 rounded px-1.5 text-xs font-medium transition-colors focus-visible:ring-2 focus-visible:outline-none sm:min-h-7 ${
                multi ? 'bg-info/15 text-info-ink' : 'text-default-700 hover:text-info'
              } ${disabled || sending ? 'pointer-events-none opacity-50' : ''}`}
            >
              <Icon icon={multi ? 'square-check-filled' : 'square-check'} className="text-base" />
              เลือกหลายรายการ
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            aria-label="ปิด"
            disabled={sending}
            className={`text-default-700 hover:text-default-800 flex size-7 items-center justify-center rounded ${
              sending ? 'pointer-events-none opacity-50' : ''
            }`}
          >
            <Icon icon="x" className="text-base" />
          </button>
        </span>
      </div>

      {selected ? (
        /* ── เลือกรูปแบบการส่ง ── */
        <div className="flex flex-col gap-2 pb-1">
          <ModeButton
            icon="photo"
            label="ส่งรูปภาพสินค้าอย่างเดียว"
            hint={selected.images[0] ? undefined : 'สินค้านี้ยังไม่มีรูป'}
            disabled={!selected.images[0]}
            onClick={() => pick('image')}
          />
          <ModeButton
            icon="file-description"
            label="ส่งรายละเอียดสินค้า"
            hint={`${priceText(selected.price)}${selected.shortDescription ? ' · มีคำอธิบายสั้น' : ''}`}
            onClick={() => pick('detail')}
          />
          {/* สินค้าที่ไม่ได้ track สต็อก (stockQty = null) ไม่มีตัวเลือกนี้เลย — ไม่มีทางกดแล้วผิดหวัง
              (user เลือก "ซ่อนตัวเลือกไปเลย" 2026-07-23) */}
          {selected.stockQty !== null && (
            <ModeButton
              icon="stack-2"
              label="ส่งจำนวนคงเหลือ"
              hint={`คงเหลือ ${selected.stockQty} ชิ้น`}
              onClick={() => pick('stock')}
            />
          )}
          {/**
           * (2026-08-11) โหมดที่ 4 — ส่งออกทันที ต่างจากอีก 3 โหมดข้างบนที่เติมช่องพิมพ์ให้ตรวจก่อน
           *
           * 🛑 ย้ายมาไว้ "ท้ายสุด" + มีเส้นคั่นและหัวข้อกลุ่มของตัวเอง (ux retroactive review 2026-08-11)
           * รอบแรกวางไว้เป็นปุ่มบนสุด ซึ่งเป็นตำแหน่งที่ก่อนหน้านี้เป็นของ "ส่งรูปภาพสินค้าอย่างเดียว"
           * มาตลอด — ผู้ขายที่มือชินกับ "ปุ่มบนสุด = แค่เติมลงช่องพิมพ์ ยังแก้ได้ก่อนส่ง" จะกดตำแหน่ง
           * เดิมแล้วได้การกระทำที่ **ส่งออกจริงทันที ย้อนกลับไม่ได้ และเสียโควตาเป็นเงินร้านบน LINE**
           * ปุ่มทั้งสี่ยังใช้ `ModeButton` ตัวเดียวกัน (หน้าตาเหมือนกันหมด) เส้นคั่น+หัวข้อจึงเป็นสิ่ง
           * เดียวที่บอกว่ากลุ่มล่างทำงานคนละแบบกับกลุ่มบน
           */}
          <div className="border-default-300 mt-0.5 border-t border-dashed pt-2">
            <p className="text-default-700 mb-1.5 text-2xs font-semibold">ส่งออกทันที</p>
            <ModeButton
              icon="layout-cards"
              label="ส่งการ์ดสินค้า"
              hint="ลูกค้าเห็นเป็นการ์ด (รูป ชื่อ ราคา) — ส่งทันทีเมื่อกด"
              onClick={() => pick('card')}
            />
          </div>
        </div>
      ) : (
        <>
          <div className="input-icon-group mb-2">
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

          {/* สไลด์แนวนอน เรียงขายดีก่อน (user สั่ง 2026-07-23 + ส่งภาพ "สินค้าขายดี" บน command center
              มาให้เป็นแบบ) — Base: (dashboard)/dashboard/components/BestSellerStrip.tsx ทั้งการ์ด
              (w-28 / ProductThumb aspect-video / ชื่อ line-clamp-2 min-h-8 / ราคา bold primary /
              บรรทัดที่ 3 เป็น meta) และพฤติกรรม scroll-snap + ซ่อน scrollbar
              ต่างจากต้นแบบแค่ปลายทางของการกด: ที่นั่น navigate ไป /orders/new ที่นี่เปิดหน้าเลือก
              รูปแบบการส่ง — หรือ "ติ๊กเลือก" เมื่ออยู่โหมดหลายรายการ

              -mx-0.5 px-0.5: กล่องนี้ overflow-x-auto จึงตัดทุกอย่างที่ล้นขอบ — ring ของการ์ดที่ถูก
              ติ๊กวาดนอก layout box 2px ใบซ้ายสุดตอน scrollLeft=0 จะโดนตัดหายไปข้างเดียว เผื่อที่ให้
              แล้วดึงกลับด้วย margin ติดลบ ตำแหน่งการ์ดจึงเท่าเดิมทุกประการ */}
          <div
            className="-mx-0.5 flex snap-x snap-mandatory gap-2.5 overflow-x-auto overscroll-contain px-0.5 pb-1 [&::-webkit-scrollbar]:hidden"
            style={{ scrollbarWidth: 'none' }}
          >
            {loading ? (
              <>
                {[0, 1, 2].map((i) => (
                  <div key={i} className="bg-default-100 h-36 w-28 shrink-0 animate-pulse rounded-xl" role="status" aria-label="กำลังโหลดสินค้า" />
                ))}
              </>
            ) : failed ? (
              <div className="text-default-700 flex flex-col items-center gap-2 py-4 text-center text-sm">
                <span>โหลดรายการสินค้าไม่สำเร็จ</span>
                <button type="button" onClick={load} className="btn border-default-300 min-h-11">
                  <Icon icon="refresh" className="me-1" /> ลองใหม่
                </button>
              </div>
            ) : filtered.length === 0 ? (
              <p className="text-default-700 mb-0 py-4 text-center text-sm">
                {items.length === 0 ? 'ยังไม่มีสินค้าที่เปิดขายอยู่' : 'ไม่พบสินค้าที่ค้นหา'}
              </p>
            ) : (
              filtered.map((p) => {
                const src = imageSrc(p.images)
                const isSelected = multi && selectedIds.includes(p.id)
                // เต็มเพดานรวมแล้ว → ใบที่ยังไม่ติ๊กกดไม่ได้ (ใบที่ติ๊กแล้วยังกดเอาออกได้เสมอ)
                const blocked = multi && !isSelected && atMax
                const off = disabled || sending || blocked
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => (multi ? toggle(p.id) : setSelected(p))}
                    disabled={off}
                    aria-pressed={multi ? isSelected : undefined}
                    /* เต็มเพดานแล้วกดไม่ได้ — เหตุผลต้องติดมากับตัวการ์ด ไม่ใช่อยู่แต่ในแถบส่งด้านล่าง
                       คนที่ใช้ screen reader ไล่ทีละใบตาม DOM จะได้ยินแค่ "ปิดใช้งาน" แล้วไม่รู้ว่าทำไม */
                    aria-label={
                      blocked
                        ? `${p.name} ${formatThb(p.price)} — เลือกครบ ${maxSelectable} รายการแล้ว เอารายการอื่นออกก่อน`
                        : `${p.name} ${formatThb(p.price)}`
                    }
                    /* ติ๊กแล้วใช้ ring ไม่ใช่ border-2 — ความหนาขอบที่เปลี่ยนจะดันการ์ดทั้งแถวขยับ 1px
                       ทุกครั้งที่ติ๊ก/เอาออก (ring วาดนอก layout box จึงไม่กระทบเพื่อนบ้าน)

                       🛑 `-ink` ไม่ใช่ `info` เปล่า: #5bc3e1 บนพื้นการ์ดขาวได้ **2.03:1** ซึ่งตกเกณฑ์
                       non-text ของ WCAG 1.4.11 (≥3:1) ทั้งที่ "การ์ดใบนี้ถูกเลือกอยู่ไหม" คือข้อมูลที่
                       สื่อด้วยสีล้วน — #1e40af ได้ 8.72:1 และยังเป็นเฉดเดิม (ปรับความเข้ม ไม่สลับเฉด
                       ตาม docs/conventions/contrast-fix-keeps-hue.md). ยืนยันด้วย ux gate 2026-08-11
                       focus-visible: ยกจาก orders/new/components/ProductGrid.tsx ซึ่งเป็นการ์ดเลือก
                       สินค้าที่ทำหน้าที่เดียวกันและมีวงแหวนโฟกัสตั้งใจอยู่แล้ว (sibling-surface-parity) */
                    className={`bg-card focus-visible:ring-info-ink relative w-28 shrink-0 snap-start overflow-hidden rounded-xl border text-left transition-transform duration-150 hover:shadow-sm focus-visible:ring-2 focus-visible:outline-none active:scale-95 ${
                      isSelected ? 'border-info-ink ring-info-ink ring-2' : 'border-default-200'
                    } ${off ? 'pointer-events-none opacity-50' : ''}`}
                  >
                    {isSelected && (
                      <span className="bg-card absolute end-1.5 top-1.5 z-10 rounded-full p-0.5 shadow-sm">
                        <Icon icon="circle-check-filled" className="text-info-ink size-5" />
                      </span>
                    )}
                    {/* ProductThumb + aspect-video ชุดเดียวกับ BestSellerStrip (user สั่ง 2026-08-06
                        "ทำให้เหมือนสินค้าขายดีใน command center"): รูป 96×96 จัตุรัสของเดิมกินเกินครึ่ง
                        การ์ด และร้านส่วนใหญ่สินค้าไม่มีรูป ⇒ กล่องเทาว่างเป็นตัวเด่นที่สุดของแผง.
                        ProductThumb ยังมี fallback ตอนรูปโหลดไม่ขึ้น (onError) ซึ่ง <img> ดิบที่เคย
                        เขียนไว้ตรงนี้ไม่มี — รูปเสียแล้วได้ไอคอนรูปแตกของเบราว์เซอร์ */}
                    <ProductThumb src={src} alt={p.name} className="aspect-video w-full" iconClassName="size-8" />
                    <div className="p-2">
                      {/* min-h-8 = จอง 2 บรรทัดของ text-xs เสมอ → ราคา/บรรทัดล่างของทุกใบอยู่ระดับเดียวกัน
                          (ทรงเดียวกับ BestSellerStrip — นี่คือ "การ์ดไม่สมส่วน" ที่เคยรายงานที่นั่น) */}
                      <p className="line-clamp-2 min-h-8 text-xs font-medium text-dark">{p.name}</p>
                      <p className="mt-0.5 truncate text-sm font-bold text-primary">{formatThb(p.price)}</p>
                      {/* บรรทัดที่ 3 ตาม BestSellerStrip — แต่สลับเป็น "คงเหลือ" เมื่อร้าน track สต็อก
                          เพราะในบริบทแชท สิ่งที่แม่ค้าต้องรู้ก่อนตอบลูกค้าคือ "ของยังมีไหม" */}
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
              })
            )}
          </div>
        </>
      )}

      {/* แถบส่งของโหมดหลายรายการ — โผล่เฉพาะตอนอยู่โหมดนั้นและอยู่หน้ารายการ
          🛑 ป้าย "จะแบ่งเป็นกี่ข้อความ" ต้องอยู่ **ก่อนกดส่ง** (มติ user 2026-08-11) และอยู่ 2 จุด
          (บรรทัดสถานะ + บนตัวปุ่มเอง) — ผู้ขายที่ตากวาดไปที่ปุ่มอย่างเดียวต้องเห็นเหมือนกัน
          warning ไม่ใช่ danger: เกินเพดานต่อการ์ดไม่ใช่ความผิดพลาด ยังกดส่งได้ปกติ */}
      {multi && !selected ? (
        <div className="border-default-300 mt-1.5 border-t border-dashed pt-2">
          {/* 🛑 เพดานรวมถูกยุบเข้ามาในป้ายเดียวกัน ไม่แยกเป็นบรรทัดที่สอง — `atMax` เกิดพร้อม
              `exceedsPerMessage` **เสมอ** (atMax = count ≥ perMessage×3 ⇒ count > perMessage) สอง
              บรรทัดจึงโผล่คู่กันตลอดกาลโดยไม่มีเคสไหนแยกกันได้เลย. แผงนี้อยู่เหนือช่องพิมพ์ในเธรด
              ทุก px ที่มันสูงขึ้นคือพื้นที่อ่านข้อความที่หายไปตรง ๆ (เคยโดนบ่นมาแล้วบน prod 08-09
              ตอนแถบ AI takeover ทำพื้นที่ข้อความเล็กลง) — ux gate 2026-08-11 P1-2 */}
          {selection.exceedsPerMessage && (
            <div className="bg-warning/15 text-warning-ink mb-2 flex items-start gap-1.5 rounded px-2 py-1.5 text-xs">
              <Icon icon="alert-triangle" className="mt-0.5 shrink-0 text-sm" aria-hidden="true" />
              <span>
                {selection.text}
                {atMax && ` · เลือกได้สูงสุด ${maxSelectable} รายการต่อการส่งหนึ่งครั้ง`}
              </span>
            </div>
          )}
          <div className="mb-1.5 flex items-center justify-between gap-2">
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
          <button
            type="button"
            onClick={handleSendMany}
            disabled={count === 0 || sending || disabled}
            className="btn bg-primary min-h-11 w-full text-white disabled:opacity-50"
          >
            {sending ? (
              <>
                <Icon icon="loader-2" className="me-1 animate-spin" aria-hidden="true" /> กำลังส่ง…
              </>
            ) : (
              productSendButtonLabel(count, perMessage)
            )}
          </button>
        </div>
      ) : (
        /* หนี้ที่ ux ชี้ 2026-08-11: ข้อความเดิมเขียนว่า "ทุกโหมดเติมช่องพิมพ์" ซึ่งไม่จริงตั้งแต่มี
           โหมด "ส่งการ์ดสินค้า" ที่ส่งออกทันที — แยกคำตามหน้าที่ผู้ใช้อยู่จริง */
        <div className="text-default-700 pt-1.5 text-2xs">
          {selected ? 'การ์ดสินค้าส่งออกทันที — อีก 3 แบบจะไปอยู่ในช่องพิมพ์ให้แก้ก่อนส่ง' : 'แตะสินค้าเพื่อเลือกรูปแบบการส่ง'}
        </div>
      )}
    </div>
  )
}

/** ปุ่มเลือกรูปแบบการส่ง — hit area ≥44px (PRODUCT.md) + hint บอกว่าจะได้อะไรจริง ๆ */
function ModeButton({
  icon,
  label,
  hint,
  disabled,
  onClick,
}: {
  icon: string
  label: string
  hint?: string
  disabled?: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`bg-card border-default-200 hover:border-info text-default-800 flex min-h-11 items-center gap-2.5 rounded-lg border px-3 py-2.5 text-left text-sm transition-colors ${
        disabled ? 'pointer-events-none opacity-50' : ''
      }`}
    >
      <Icon icon={icon} className="text-info shrink-0 text-lg" />
      <span className="min-w-0 flex-1">
        <span className="block font-medium">{label}</span>
        {hint && <span className="text-default-700 block text-xs">{hint}</span>}
      </span>
    </button>
  )
}
