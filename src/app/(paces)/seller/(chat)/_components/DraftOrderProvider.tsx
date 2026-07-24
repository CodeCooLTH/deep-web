'use client'

/**
 * DraftOrderProvider — ระบบ "โมดัลสร้างคำสั่งซื้อแบบพับได้ + dock หลายอัน" (feature 00018, user request
 * 2026-07-24 อ้าง FB-style minimizable windows). mount ที่ (chat)/layout.tsx จึง **ค้างข้ามแชท**:
 * สลับไป /inbox/[id] อื่นแล้ว draft ยังอยู่ (Provider ไม่ unmount ตาม route content)
 *
 * - openDraft(): เปิดร่างของเธรดนั้น (มีอยู่แล้ว = ขยายตัวเดิม ไม่สร้างซ้ำ) — expanded ได้ทีละ 1 (POS
 *   กินพื้นที่มาก) ที่เหลือ minimize เป็น chip ที่ dock; minimize ไม่ unmount ฟอร์ม (แค่ hidden) กันข้อมูลหาย
 * - reuse OrderCreateForm เดิมทั้งชุด (prefill ชื่อลูกค้า + onSuccess ปิด draft + refresh แทน navigate)
 *
 * Base: ไม่มี "dockable modal" primitive ใน Paces — โครง overlay อิง precedent ในโปรเจกต์
 * (CustomerPanelSheet.tsx/OrderQrSheet.tsx: fixed inset + z-80 carve-out HR7, React state ไม่ใช้ Preline)
 */
import { createContext, useCallback, useContext, useState } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import Icon from '@/components/wrappers/Icon'
import { pacesConfirm } from '@/lib/paces-swal'
import { pacesToast } from '@/lib/paces-toast'
import OrderCreateForm, { type CatalogProduct } from '@/app/(paces)/seller/(dashboard)/orders/new/components/OrderCreateForm'

type Channel = 'DEEP' | 'MESSENGER' | 'INSTAGRAM' | string
const CHANNEL_LABEL: Record<string, string> = { DEEP: 'Deep', MESSENGER: 'Messenger', INSTAGRAM: 'Instagram' }

export type OpenDraftInput = { conversationId: string; customerName: string; channel: Channel }

type OrderDraft = {
  id: string
  conversationId: string
  customerName: string
  channelLabel: string
  state: 'expanded' | 'minimized'
}

type DraftOrderContextValue = { openDraft: (input: OpenDraftInput) => void }
const DraftOrderContext = createContext<DraftOrderContextValue | null>(null)

export function useDraftOrders(): DraftOrderContextValue {
  const ctx = useContext(DraftOrderContext)
  if (!ctx) throw new Error('useDraftOrders ต้องอยู่ภายใต้ <DraftOrderProvider>')
  return ctx
}

type ProviderProps = {
  shopId: string
  catalog: CatalogProduct[]
  bestSellers: CatalogProduct[]
  inventoryEnabled: boolean
  children: React.ReactNode
}

export default function DraftOrderProvider({ shopId, catalog, bestSellers, inventoryEnabled, children }: ProviderProps) {
  const [drafts, setDrafts] = useState<OrderDraft[]>([])
  const router = useRouter()
  const pathname = usePathname()

  const openDraft = useCallback((input: OpenDraftInput) => {
    setDrafts((prev) => {
      const existing = prev.find((d) => d.conversationId === input.conversationId)
      if (existing) {
        // มีร่างของเธรดนี้อยู่แล้ว → ขยายตัวเดิม, ตัวอื่นที่ขยายอยู่ให้ย่อ (expanded ได้ทีละ 1)
        return prev.map((d) =>
          d.id === existing.id ? { ...d, state: 'expanded' } : d.state === 'expanded' ? { ...d, state: 'minimized' } : d,
        )
      }
      const next: OrderDraft = {
        id: (globalThis.crypto?.randomUUID?.() ?? `d${Date.now()}${prev.length}`),
        conversationId: input.conversationId,
        customerName: input.customerName,
        channelLabel: CHANNEL_LABEL[input.channel] ?? 'แชท',
        state: 'expanded',
      }
      return [...prev.map((d) => (d.state === 'expanded' ? { ...d, state: 'minimized' as const } : d)), next]
    })
  }, [])

  const minimize = useCallback((id: string) => {
    setDrafts((prev) => prev.map((d) => (d.id === id ? { ...d, state: 'minimized' } : d)))
  }, [])

  const expand = useCallback((id: string) => {
    setDrafts((prev) =>
      prev.map((d) => (d.id === id ? { ...d, state: 'expanded' } : d.state === 'expanded' ? { ...d, state: 'minimized' } : d)),
    )
  }, [])

  const requestClose = useCallback(async (id: string) => {
    const ok = await pacesConfirm.danger('ปิดหน้าต่างนี้?', 'ข้อมูลที่กรอกไว้จะหายไป ถ้าอยากเก็บไว้ทำต่อทีหลัง กดย่อ (−) แทน', {
      confirmButtonText: 'ปิดเลย',
    })
    if (!ok) return
    setDrafts((prev) => prev.filter((d) => d.id !== id))
  }, [])

  const handleSuccess = useCallback(
    (draft: OrderDraft) => {
      setDrafts((prev) => prev.filter((d) => d.id !== draft.id))
      pacesToast.success('สร้างคำสั่งซื้อแล้ว')
      // ถ้ากำลังเปิดแชทของ draft นี้อยู่ → refresh ให้แท็บคำสั่งซื้อเห็นออเดอร์ใหม่ทันที
      if (pathname === `/inbox/${draft.conversationId}`) router.refresh()
    },
    [pathname, router],
  )

  const expanded = drafts.find((d) => d.state === 'expanded') ?? null
  const minimized = drafts.filter((d) => d.state === 'minimized')

  return (
    <DraftOrderContext.Provider value={{ openDraft }}>
      {children}

      {/* ทุก draft mount ฟอร์มค้างไว้ (hidden เมื่อไม่ได้ขยาย) กันข้อมูลที่กรอกหาย — expanded เห็นทีละ 1 */}
      {drafts.map((d) => (
        <div
          key={d.id}
          role="dialog"
          aria-label={`สร้างคำสั่งซื้อ ${d.customerName}`}
          aria-hidden={d.state !== 'expanded'}
          // z-80 = viewport overlay (Paces ไม่มี token; precedent CustomerPanelSheet/OrderQrSheet — HR7 carve-out)
          // ไม่มี backdrop ทึบ (ลอยแบบหน้าต่าง ไม่บล็อกทั้งจอ ตาม design); มือถือเต็มจอ (inset-0), desktop inset-6
          className={
            d.state === 'expanded'
              ? 'bg-card fixed inset-0 z-80 flex flex-col overflow-hidden shadow-lg lg:inset-6 lg:rounded-lg'
              : 'hidden'
          }
        >
          {/* title-bar สีทึบ (ไม่ใช่ .card-header ขาว+dashed มาตรฐาน — เป็นแถบหัวหน้าต่าง action) */}
          <div className="bg-primary flex items-center gap-3 px-4 py-3 text-white">
            <Icon icon="shopping-cart-plus" className="size-5 shrink-0" />
            <div className="min-w-0 flex-1">
              <p className="mb-0 truncate text-sm font-semibold">สร้างคำสั่งซื้อใหม่</p>
              <p className="mb-0 truncate text-xs text-white/80">
                {d.customerName} · {d.channelLabel}
              </p>
            </div>
            <button
              type="button"
              onClick={() => minimize(d.id)}
              aria-label="ย่อหน้าต่าง"
              className="flex size-8 shrink-0 items-center justify-center rounded-lg hover:bg-white/15"
            >
              <Icon icon="minus" className="size-5" />
            </button>
            <button
              type="button"
              onClick={() => requestClose(d.id)}
              aria-label="ปิด"
              className="flex size-8 shrink-0 items-center justify-center rounded-lg hover:bg-white/15"
            >
              <Icon icon="x" className="size-5" />
            </button>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto">
            <OrderCreateForm
              shopId={shopId}
              catalog={catalog}
              bestSellers={bestSellers}
              inventoryEnabled={inventoryEnabled}
              formId={`draft-order-form-${d.id}`}
              initialBuyerName={d.customerName}
              onSuccess={() => handleSuccess(d)}
            />
          </div>
        </div>
      ))}

      {/* dock — chip ของ draft ที่ย่อไว้ (แสดงเมื่อไม่มีตัวไหนขยายอยู่ เพราะโมดัลขยายกินเกือบเต็มจอ) */}
      {!expanded && minimized.length > 0 && (
        <div className="fixed bottom-4 end-4 z-80 flex flex-col-reverse items-end gap-2">
          {minimized.map((d) => (
            <div
              key={d.id}
              className="border-default-300 bg-card flex items-center gap-2 rounded-full border py-2 ps-3 pe-2 shadow-lg"
            >
              <button type="button" onClick={() => expand(d.id)} className="flex min-w-0 items-center gap-2">
                <Icon icon="shopping-cart-plus" className="text-primary size-4 shrink-0" />
                <span className="text-default-800 truncate text-sm font-medium">
                  คำสั่งซื้อใหม่ · {d.customerName}
                </span>
              </button>
              <button
                type="button"
                onClick={() => requestClose(d.id)}
                aria-label="ปิดร่างคำสั่งซื้อ"
                className="text-default-400 hover:text-default-700 flex size-6 shrink-0 items-center justify-center rounded-full"
              >
                <Icon icon="x" className="size-4" />
              </button>
            </div>
          ))}
        </div>
      )}
    </DraftOrderContext.Provider>
  )
}
