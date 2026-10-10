'use client'

/**
 * InterestedProductsSection — "สินค้าที่สนใจ" ในแผงลูกค้า (00019-ext-mem, UX spec W10-W12)
 * แถวเรียบ divide-y: ซ้าย = ปุ่มเดียว (รูป+ชื่อ+ตัวเลือก) เปิดถาดสินค้าในเธรด · ขวา = ✕ ปุ่มแยก 44px
 * Base: theme/paces/Admin/TS/src/app/(admin)/apps/chat/components/ChatPage.tsx (แถวรายการ/ปุ่มไอคอน)
 */
import { useRef, useState } from 'react'
import { useT } from '@/i18n/LocaleProvider'
import { fmt } from '@/i18n/fmt'
import Icon from '@/components/wrappers/Icon'
import ProductThumb from '@/app/(paces)/seller/(dashboard)/orders/new/components/ProductThumb'
import { fileUrlOf } from '@/lib/file-url'
import { pacesToast } from '@/lib/paces-toast'
import { INTERESTED_PRODUCT_MAX } from '@/lib/chat-memory-types'
import { canAddMoreProducts, productRowView, shouldShowProductsSection } from '@/lib/chat-memory-ui'
import { dispatchProductTrayOpen } from '@/lib/chat-memory-events'
import type { useChatMemory } from './useChatMemory'
import ProductPickerPanel from './ProductPickerPanel'

export type InterestedProductsSectionProps = {
  conversationId: string
  channel: string // ส่งต่อให้ picker
  state: ReturnType<typeof useChatMemory>
  vertical?: string | null // ส่งต่อให้ picker ผันคำเรียกของที่ขาย (ไม่ส่ง = ONLINE_SALES)
  onRequestClose?: () => void // sheet เท่านั้น: ปิด sheet หลังยิง PRODUCT_TRAY_OPEN_EVENT
}

const noop = () => {}
const noopMany = async () => ({ ok: false, sentMessages: 0 })

export default function InterestedProductsSection({ channel, state, vertical, onRequestClose }: InterestedProductsSectionProps) {
  const t = useT()
  const m = t.inbox.customerPanel.interested
  const { data } = state
  const [pickerOpen, setPickerOpen] = useState(false)
  const listRef = useRef<HTMLUListElement>(null)
  const addRef = useRef<HTMLButtonElement>(null)

  const rows = data?.products ?? []
  const canUse = data?.canUseProducts === true
  if (!data || !shouldShowProductsSection({ canUseProducts: canUse, rowCount: rows.length })) return null

  const canAdd = canUse && canAddMoreProducts(rows.length)
  const isFull = canUse && !canAdd

  async function remove(id: string, name: string, index: number) {
    const prev = rows
    state.applyProducts(rows.filter((r) => r.id !== id))
    // โฟกัสไป ✕ ของแถวถัดไป (ไม่มี = แถวก่อนหน้า, ไม่เหลือ = ปุ่มเพิ่ม) หลัง React วาดใหม่
    requestAnimationFrame(() => {
      const btns = listRef.current?.querySelectorAll<HTMLButtonElement>('[data-remove]')
      const target = btns?.[Math.min(index, (btns?.length ?? 0) - 1)] ?? addRef.current
      target?.focus()
    })
    const ok = await state.removeProduct(id)
    if (ok) pacesToast.chat.success(fmt(m.removed, { name }))
    else {
      state.applyProducts(prev)
      pacesToast.chat.error(m.removeError)
    }
  }

  async function onAttach(picks: { productId: string; selections: { key: string; value: string }[] }[]) {
    const res = await state.addProducts(picks)
    if (res.saved.length) state.applyProducts([...rows, ...res.saved])
    if (res.full) pacesToast.chat.warning(fmt(m.attachFull, { max: INTERESTED_PRODUCT_MAX }))
    else if (res.failed && !res.saved.length) pacesToast.chat.error(m.attachError)
    else if (res.skipped > 0) pacesToast.chat.success(fmt(m.attachedPartial, { ok: res.saved.length, skip: res.skipped }))
    else pacesToast.chat.success(fmt(m.attached, { count: res.saved.length }))
    const ok = res.saved.length > 0 || res.skipped > 0 || res.full
    if (ok) setPickerOpen(false)
    return { ok, saved: res.saved.length, skipped: res.skipped }
  }

  return (
    <section className="flex flex-col gap-2" aria-labelledby="interested-products-heading">
      <div className="flex items-center justify-between gap-2">
        <h3 id="interested-products-heading" className="text-default-900 min-w-0 flex-1 truncate text-sm font-semibold">
          {m.title}
          {rows.length > 0 && (
            <span className="text-default-700 ms-2 text-xs font-normal">
              {fmt(m.count, { count: rows.length, max: INTERESTED_PRODUCT_MAX })}
            </span>
          )}
        </h3>
        {canUse && (
          <button
            ref={addRef}
            type="button"
            aria-disabled={isFull || undefined}
            aria-label={pickerOpen ? t.common.close : m.addLabel}
            onClick={() => {
              if (isFull) return
              setPickerOpen((v) => !v)
            }}
            className={`btn btn-sm text-primary hover:bg-primary/10 inline-flex min-h-11 shrink-0 items-center gap-1 ${isFull ? 'opacity-50' : ''}`}
          >
            <Icon icon={pickerOpen ? 'x' : 'plus'} className="text-base" aria-hidden="true" />
            {!pickerOpen && m.add}
          </button>
        )}
      </div>

      {isFull && <p className="text-default-700 text-xs">{fmt(m.full, { max: INTERESTED_PRODUCT_MAX })}</p>}

      {canUse && pickerOpen && canAdd && (
        <ProductPickerPanel
          mode="attach"
          inline
          channel={channel}
          vertical={vertical}
          onPick={noop}
          onSendMany={noopMany}
          onClose={() => setPickerOpen(false)}
          attach={{ remaining: INTERESTED_PRODUCT_MAX - rows.length, onAttach }}
        />
      )}

      {rows.length === 0 ? (
        <p className="text-default-700 text-xs">{m.empty}</p>
      ) : (
        <ul ref={listRef} className="divide-default-200 divide-y">
          {rows.map((r, i) => {
            const view = productRowView(r.state)
            const src = r.imageFileId ? fileUrlOf(r.imageFileId) : null
            const reason =
              view.badge === 'inactive' ? m.inactive : view.badge === 'deleted' ? m.deleted : null
            return (
              <li key={r.id} className="flex items-center gap-1">
                <button
                  type="button"
                  aria-disabled={!view.tappable || undefined}
                  aria-label={fmt(m.rowLabel, { name: r.name })}
                  onClick={() => {
                    if (!view.tappable || !r.productId) return
                    dispatchProductTrayOpen(r.productId)
                    onRequestClose?.()
                  }}
                  className={`flex min-h-11 min-w-0 flex-1 items-center gap-2 py-2 text-start ${
                    view.tappable ? 'hover:bg-default-100 rounded-lg' : 'cursor-default'
                  }`}
                >
                  <ProductThumb
                    src={src}
                    alt=""
                    className="size-10 shrink-0 rounded-lg"
                    iconClassName="size-5"
                  />
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className={`truncate text-sm ${view.tappable ? 'text-default-900' : 'text-default-700'}`}>
                      {r.name}
                    </span>
                    {(r.optionLabel || reason) && (
                      <span className="flex min-w-0 flex-wrap items-center gap-x-2 text-xs">
                        {r.optionLabel && <span className="text-default-700 truncate">{r.optionLabel}</span>}
                        {reason && (
                          <>
                            <span
                              className={`badge ${
                                view.badge === 'inactive'
                                  ? 'bg-warning/15 text-warning-ink'
                                  : 'bg-default-100 text-default-700'
                              }`}
                            >
                              {reason}
                            </span>
                            <span className="text-default-700">{m.noSend}</span>
                          </>
                        )}
                      </span>
                    )}
                  </span>
                </button>
                <button
                  type="button"
                  data-remove=""
                  aria-label={fmt(m.removeLabel, { name: r.name })}
                  onClick={() => void remove(r.id, r.name, i)}
                  className="text-default-700 hover:bg-default-100 inline-flex size-11 shrink-0 items-center justify-center rounded-lg"
                >
                  <Icon icon="x" className="text-base" aria-hidden="true" />
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
