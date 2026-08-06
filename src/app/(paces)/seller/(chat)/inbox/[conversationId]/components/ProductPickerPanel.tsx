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
 * **ทุกโหมดเติมลงช่องพิมพ์ ไม่ส่งออกเอง** — เหตุผล 2 ข้อ:
 *   1) พฤติกรรมเดียวกับข้อความสำเร็จรูปที่ user อนุมัติแล้ว (คนตรวจก่อนกดส่งเสมอ)
 *   2) การ์ดสินค้า (`type=PRODUCT`) ส่งได้เฉพาะเธรด Deep — ช่องทาง Messenger/IG ระบบคืน 400
 *      (`ช่องทางนี้ยังไม่รองรับการ์ดสินค้า`) การเติมข้อความ+รูปจึงเป็นทางเดียวที่ทำงานได้ทุกช่องทาง
 *      (user เลือก "ส่งรูป + ข้อความแทน" 2026-07-23)
 *
 * Base: theme/paces/Admin/TS/src/app/(admin)/apps/chat/components/ChatPage.tsx (composer/แถวการ์ด)
 *   + AiSuggestPanel.tsx/QuickMessageBar.tsx ในเธรดนี้ (โครงแผงที่ user อนุมัติแล้ว)
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import Icon from '@/components/wrappers/Icon'
import ProductThumb from '@/app/(paces)/seller/(dashboard)/orders/new/components/ProductThumb'

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
export type ProductPickPayload = { text?: string; imageFileId?: string }

type Props = {
  onPick: (payload: ProductPickPayload) => void
  onClose: () => void
  disabled?: boolean
}

/** รูปแรกของสินค้า — seed เก่าบางตัวเก็บเป็น URL เต็ม (picsum/CDN) ไม่ใช่ storage fileId
 *  (guard ชุดเดียวกับ (dashboard)/products/page.tsx:98-100) */
function imageSrc(images: string[]): string | null {
  const first = images[0]
  if (!first) return null
  return String(first).startsWith('http') ? String(first) : `/api/files/${first}`
}

const priceText = (p: number) => `฿${p.toLocaleString('th-TH')}`

export default function ProductPickerPanel({ onPick, onClose, disabled }: Props) {
  const [items, setItems] = useState<PickerProduct[]>([])
  const [loading, setLoading] = useState(true)
  const [failed, setFailed] = useState(false)
  const [q, setQ] = useState('')
  const [selected, setSelected] = useState<PickerProduct | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setFailed(false)
    try {
      // ?sort=best — ขายดีก่อน (user สั่ง 2026-07-23) แล้วต่อด้วยตัวที่ยังไม่เคยขาย + แนบ soldCount
      const res = await fetch('/api/products?sort=best', { cache: 'no-store' })
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
  }, [])

  useEffect(() => {
    load()
  }, [load])

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== 'Escape') return
      // Escape ในหน้าเลือกรูปแบบ = ถอยกลับไปรายการก่อน ไม่ปิดทั้งแผง (กันกดพลาดแล้วต้องเริ่มใหม่)
      if (selected) setSelected(null)
      else onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose, selected])

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

  function pick(mode: 'image' | 'detail' | 'stock') {
    if (!selected || disabled) return
    const img = selected.images[0]
    if (mode === 'image') onPick({ imageFileId: img })
    else if (mode === 'detail') onPick({ text: detailText(selected), imageFileId: img })
    else onPick({ text: `${selected.name} — คงเหลือ ${selected.stockQty} ชิ้น` })
    setSelected(null)
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
        <button
          type="button"
          onClick={onClose}
          aria-label="ปิด"
          className="text-default-700 hover:text-default-800 flex size-7 items-center justify-center rounded"
        >
          <Icon icon="x" className="text-base" />
        </button>
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
              ต่างจากต้นแบบแค่ปลายทางของการกด: ที่นั่น
              navigate ไป /orders/new ที่นี่เปิดหน้าเลือกรูปแบบการส่ง */}
          <div
            className="flex snap-x snap-mandatory gap-2.5 overflow-x-auto overscroll-contain pb-1 [&::-webkit-scrollbar]:hidden"
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
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setSelected(p)}
                    disabled={disabled}
                    aria-label={`${p.name} ${formatThb(p.price)}`}
                    className={`w-28 shrink-0 snap-start overflow-hidden rounded-xl border border-default-200 bg-card text-left transition-transform duration-150 hover:shadow-sm active:scale-95 ${
                      disabled ? 'pointer-events-none opacity-50' : ''
                    }`}
                  >
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

      <div className="text-default-700 pt-1.5 text-2xs">เลือกแล้วเนื้อหาจะไปอยู่ในช่องพิมพ์ — แก้ไขก่อนส่งได้</div>
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
