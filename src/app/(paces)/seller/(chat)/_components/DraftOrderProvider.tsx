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
import { generateInitials } from '@/utils/helpers'
import { pacesConfirm } from '@/lib/paces-swal'
import { pacesToast } from '@/lib/paces-toast'
import { getChannelDisplay, ChannelBadgeOverlay } from '../inbox/components/ChannelBadge'
import OrderCreateForm, { type CatalogProduct } from '@/app/(paces)/seller/(dashboard)/orders/new/components/OrderCreateForm'

type Channel = 'DEEP' | 'MESSENGER' | 'INSTAGRAM' | string

// map ช่องทางแชท → ช่องทางการขาย ของฟอร์มออเดอร์ (STOREFRONT|FACEBOOK|LINE|TIKTOK)
// Messenger/Instagram = Meta → FACEBOOK; DEEP = แอปในระบบ → undefined (ใช้ default STOREFRONT)
function chatChannelToSalesChannel(channel: string): string | undefined {
  if (channel === 'MESSENGER' || channel === 'INSTAGRAM') return 'FACEBOOK'
  return undefined
}

export type OpenDraftInput = {
  conversationId: string
  customerName: string
  channel: Channel
  /** รูปโปรไฟล์ลูกค้า (http URL หรือ storage fileId) — โชว์ใน chip ตอนพับ (user request 2026-07-24) */
  customerAvatar?: string | null
  /** แก้ไขคำสั่งซื้อเดิม (user 2026-07-25) — มีค่า = โหลด order นี้เข้าฟอร์ม + submit PATCH; ไม่มี = สร้างใหม่ */
  editOrderToken?: string | null
}

type OrderDraft = {
  id: string
  conversationId: string
  customerName: string
  customerAvatar: string | null
  channel: string
  editOrderToken: string | null // null = สร้างใหม่; มีค่า = แก้ไขออเดอร์นั้น
  state: 'expanded' | 'minimized'
}

/** avatar เล็กของลูกค้า + ไอคอนช่องทาง (chip/หัวโมดัล) — src เดียวกับ ChatAvatar (http URL / fileId / initials) */
function DraftAvatar({ avatar, name, channel }: { avatar: string | null; name: string; channel: string }) {
  const [failed, setFailed] = useState(false)
  const src = avatar ? (avatar.startsWith('http') ? avatar : `/api/files/${avatar}`) : null
  return (
    <span className="relative shrink-0">
      {!src || failed ? (
        <span className="bg-primary/10 text-primary flex size-9 items-center justify-center rounded-full text-xs font-semibold">
          {generateInitials(name) || '?'}
        </span>
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt={name} className="bg-default-100 size-9 rounded-full object-cover" onError={() => setFailed(true)} />
      )}
      {channel !== 'DEEP' && <ChannelBadgeOverlay channel={channel} size="sm" />}
    </span>
  )
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
    const editToken = input.editOrderToken ?? null
    setDrafts((prev) => {
      // dedup: แก้ไข → key ด้วย editOrderToken (แก้คนละออเดอร์ = คนละร่าง); สร้างใหม่ → key ด้วย conversationId
      const existing = prev.find((d) =>
        editToken ? d.editOrderToken === editToken : !d.editOrderToken && d.conversationId === input.conversationId,
      )
      if (existing) {
        // มีร่างนี้อยู่แล้ว → ขยายตัวเดิม, ตัวอื่นที่ขยายอยู่ให้ย่อ (expanded ได้ทีละ 1)
        return prev.map((d) =>
          d.id === existing.id ? { ...d, state: 'expanded' } : d.state === 'expanded' ? { ...d, state: 'minimized' } : d,
        )
      }
      const next: OrderDraft = {
        id: (globalThis.crypto?.randomUUID?.() ?? `d${Date.now()}${prev.length}`),
        conversationId: input.conversationId,
        customerName: input.customerName,
        customerAvatar: input.customerAvatar ?? null,
        channel: input.channel,
        editOrderToken: editToken,
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
      pacesToast.success(draft.editOrderToken ? 'แก้ไขคำสั่งซื้อแล้ว' : 'สร้างคำสั่งซื้อแล้ว')
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
          // ไม่มี backdrop ทึบ (ลอยแบบหน้าต่าง ไม่บล็อกทั้งจอ). มือถือเต็มจอ (inset-0); desktop = หน้าต่างขนาดมือถือ
          // (w-96) dock ขวา (user request 2026-07-24: ให้เล็กเท่ามือถือ จะได้อ่านแชทที่อยู่ข้างหลังได้)
          // transform-gpu: ทำให้ลูก position:fixed (bottom-sheet ~11 ตัวของฟอร์ม POS) ยึดกับ "โมดัล" แทน
          // viewport (พฤติกรรม CSS: ancestor ที่มี transform เป็น containing block ของ fixed descendant) →
          // sheet ถูก contain ในโมดัลแทนกินเต็มจอ โดยไม่ต้องแก้ทีละ sheet (user report 2026-07-24)
          className={
            d.state === 'expanded'
              ? 'bg-card fixed inset-0 z-80 flex transform-gpu flex-col overflow-hidden shadow-lg lg:inset-y-4 lg:left-auto lg:right-4 lg:w-96 lg:rounded-lg'
              : 'hidden'
          }
        >
          {/* title-bar สีทึบ (ไม่ใช่ .card-header ขาว+dashed มาตรฐาน — เป็นแถบหัวหน้าต่าง action) */}
          <div className="bg-primary flex items-center gap-3 px-4 py-3 text-white">
            <DraftAvatar avatar={d.customerAvatar} name={d.customerName} channel={d.channel} />
            <div className="min-w-0 flex-1">
              <p className="mb-0 truncate text-sm font-semibold">
                {d.editOrderToken ? 'แก้ไขคำสั่งซื้อ' : 'คำสั่งซื้อใหม่'} · {d.customerName}
              </p>
              <p className="mb-0 truncate text-xs text-white/80">{getChannelDisplay(d.channel).label}</p>
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

          {/* compact = บังคับ layout มือถือ (QuickForm คอลัมน์เดียว) ทุกจอ — POS 3-col เดสก์ท็อปแน่นเกินในโมดัล
              (user report 2026-07-24). โมดัลแคบ (w-96) อยู่แล้วจึงไม่ต้อง max-w ครอบเพิ่ม */}
          <div className="min-h-0 flex-1 overflow-y-auto">
            <OrderCreateForm
              shopId={shopId}
              catalog={catalog}
              bestSellers={bestSellers}
              inventoryEnabled={inventoryEnabled}
              formId={`draft-order-form-${d.id}`}
              initialBuyerName={d.customerName}
              initialSalesChannel={chatChannelToSalesChannel(d.channel)}
              conversationId={d.conversationId}
              editOrderToken={d.editOrderToken ?? undefined}
              onSuccess={() => handleSuccess(d)}
              compact
            />
          </div>
        </div>
      ))}

      {/* dock — chip ของ draft ที่ย่อไว้ (แสดงเมื่อไม่มีตัวไหนขยายอยู่ เพราะโมดัลขยายกินเกือบเต็มจอ) */}
      {!expanded && minimized.length > 0 && (
        <div className="fixed bottom-4 start-4 z-80 flex flex-col-reverse items-start gap-2">
          {minimized.map((d) => (
            <div
              key={d.id}
              className="border-default-300 bg-card flex items-center gap-2 rounded-full border py-2 ps-3 pe-2 shadow-lg"
            >
              <button type="button" onClick={() => expand(d.id)} className="flex min-w-0 items-center gap-2">
                <DraftAvatar avatar={d.customerAvatar} name={d.customerName} channel={d.channel} />
                <span className="flex min-w-0 flex-col text-start">
                  <span className="text-default-500 text-2xs">{d.editOrderToken ? 'แก้ไขคำสั่งซื้อ' : 'คำสั่งซื้อใหม่'}</span>
                  <span className="text-default-800 truncate text-sm font-medium">{d.customerName}</span>
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
