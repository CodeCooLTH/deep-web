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
import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import Icon from '@/components/wrappers/Icon'
import { generateInitials } from '@/utils/helpers'
import { pacesConfirm } from '@/lib/paces-swal'
import { ORDER_VOCAB, type OrderVocab } from '@/lib/seller-menu'
import { pacesToast } from '@/lib/paces-toast'
import { getChannelDisplay, ChannelBadgeOverlay } from '../inbox/components/ChannelBadge'
import OrderCreateForm, { type CatalogProduct } from '@/app/(paces)/seller/(dashboard)/orders/new/components/OrderCreateForm'
// feature 00024 — บล็อกวันเข้าใช้บริการในโมดัลนี้ (user request 2026-08-05)
import type { ServiceResourceOption } from '@/app/(paces)/seller/(dashboard)/orders/new/components/AppointmentBlock'
import type { AppointmentGranularity } from '@/lib/appointments'
import ShipmentDraftPanel from './ShipmentDraftPanel'
import type { IShipCreateMode } from '@/lib/iship/after-order-create'
// feature 00033 — ตัดสินว่าเวลาข้อความที่กดสร้างออเดอร์อยู่ในช่วงที่ยอมรับไหม (SSOT เดียวกับ OrderDateRow)
import { isOrderDateInWindow } from '@/lib/order-date-window'

type Channel = 'DEEP' | 'MESSENGER' | 'INSTAGRAM' | string

// map ช่องทางแชท → ช่องทางการขาย ของฟอร์มออเดอร์ (STOREFRONT|FACEBOOK|LINE|TIKTOK)
// Messenger/Instagram = Meta → FACEBOOK; DEEP = แอปในระบบ → undefined (ใช้ default STOREFRONT)
function chatChannelToSalesChannel(channel: string): string | undefined {
  if (channel === 'MESSENGER' || channel === 'INSTAGRAM') return 'FACEBOOK'
  return undefined
}

/** ชนิดของงานในหน้าต่าง — คำสั่งซื้อ (เดิม) หรือพัสดุ (feature 00022) */
export type DraftKind = 'ORDER' | 'SHIPMENT'

export type OpenDraftInput = {
  conversationId: string
  customerName: string
  channel: Channel
  /** รูปโปรไฟล์ลูกค้า (http URL หรือ storage fileId) — โชว์ใน chip ตอนพับ (user request 2026-07-24) */
  customerAvatar?: string | null
  /**
   * รูปเพจที่เธรดนี้ผูกอยู่ (ShopChannel.avatarUrl) — user สั่ง 2026-08-07: "ถ้า page มี logo
   * ให้ใช้ logo page แทน" กติกาเดียวกับ badge ในรายการแชท/หัวเธรดที่ทำไว้ตั้งแต่ 2026-07-23
   * (ร้านหลายเพจแยกออกทันทีว่าร่างใบนี้เป็นของเพจไหน) ไม่ส่ง/โหลดไม่ขึ้น → ถอยไปโลโก้ช่องทางเอง
   */
  pageAvatarUrl?: string | null
  /** แก้ไขคำสั่งซื้อเดิม (user 2026-07-25) — มีค่า = โหลด order นี้เข้าฟอร์ม + submit PATCH; ไม่มี = สร้างใหม่ */
  editOrderToken?: string | null
  /** default 'ORDER' — 'SHIPMENT' ต้องมี shipmentOrderToken ด้วย */
  kind?: DraftKind
  /** คำสั่งซื้อที่จะเปิด/ดูพัสดุ (feature 00022) */
  shipmentOrderToken?: string | null
  /**
   * ข้อความจากเธรดที่จะให้ฟอร์ม "กระจาย" เป็นชื่อ/เบอร์/ที่อยู่ให้เลย (user สั่ง 2026-08-04 —
   * กดค้างบนข้อความในแชท → สร้างคำสั่งซื้อ)
   *
   * มีผลเฉพาะตอน "สร้างร่างใหม่" เท่านั้น: ถ้าร่างของเธรดนี้เปิดค้างอยู่แล้ว การกดจะขยายร่างเดิม
   * ตามพฤติกรรมเดิม **ไม่ทับค่าที่ร้านพิมพ์ไว้** — ทับได้คือทำข้อมูลที่กรอกมาแล้วหาย
   */
  prefillText?: string
  /**
   * feature 00033 — เวลาของข้อความที่กดสร้างออเดอร์ (ISO string)
   *
   * ใช้เป็น "วันที่สั่งซื้อ" ให้เลย: ลูกค้าพิมพ์สรุปออเดอร์ไว้เมื่อคืน แอดมินมาคีย์เช้าวันรุ่งขึ้น
   * ยอดต้องตกคืนที่สั่ง ไม่ใช่เช้าที่คีย์
   *
   * มีผลเฉพาะตอนสร้างร่างใหม่ เหมือน prefillText — ร่างที่เปิดค้างอยู่แล้วไม่ถูกทับ
   */
  messageCreatedAt?: string
}

type ChatDraft = {
  id: string
  kind: DraftKind
  conversationId: string
  customerName: string
  customerAvatar: string | null
  channel: string
  /** รูปเพจที่เธรดนี้ผูกอยู่ (ShopChannel.avatarUrl) — badge มุม avatar ใช้แทนโลโก้ช่องทาง */
  pageAvatarUrl: string | null
  editOrderToken: string | null // null = สร้างใหม่; มีค่า = แก้ไขออเดอร์นั้น
  shipmentOrderToken: string | null
  /** ข้อความที่จะให้ฟอร์มกระจายตอน mount (null = ไม่มี) */
  prefillText: string | null
  /** feature 00033 — เวลาของข้อความต้นทาง (null = ไม่มีข้อความต้นทาง ไม่ใช่ "เก่าเกินไป") */
  messageCreatedAt: string | null
  state: 'expanded' | 'minimized'
}

/**
 * คำบนหัวหน้าต่าง/chip — ต่างกันตามชนิดงาน ร้านจะได้รู้ว่า chip ที่ย่อไว้คืออะไร
 *
 * ต้องผันตามประเภทกิจการด้วย (user request 2026-08-05): ร้านบริการเห็นปุ่มล่างเขียน
 * "บันทึกการเข้ารับบริการ" แต่หัวหน้าต่างเดียวกันเขียน "คำสั่งซื้อใหม่" — คำสองคำเรียก
 * ของสิ่งเดียวกันอยู่คนละที่บนจอเดียว. vocab.noun เป็น SSOT (ดู ORDER_VOCAB ใน lib/seller-menu)
 */
function draftTitle(d: Pick<ChatDraft, 'kind' | 'editOrderToken'>, vocab: OrderVocab): string {
  if (d.kind === 'SHIPMENT') return 'พัสดุ'
  // ใช้ nounShort ไม่ใช่ noun — แถบหัวมี avatar + ชื่อลูกค้า + ปุ่มย่อ/ปิด อยู่ในความกว้าง w-96
  // "การเข้ารับบริการใหม่" กินที่จนชื่อลูกค้าถูกตัด (user เคาะ 2026-08-05 ให้เหลือ "บริการใหม่")
  return d.editOrderToken ? `แก้ไข${vocab.nounShort}` : `${vocab.nounShort}ใหม่`
}

/** avatar เล็กของลูกค้า + ไอคอนช่องทาง (chip/หัวโมดัล) — src เดียวกับ ChatAvatar (http URL / fileId / initials) */
function DraftAvatar({
  avatar,
  name,
  channel,
  pageAvatarUrl,
  onSolid = false,
}: {
  avatar: string | null
  name: string
  channel: string
  pageAvatarUrl: string | null
  /**
   * avatar ตัวนี้วางอยู่บนพื้น bg-primary ทึบ (แถบหัวหน้าต่าง) ไม่ใช่พื้นการ์ด
   *
   * สำคัญเฉพาะตอน fallback เป็นตัวอักษรย่อ ซึ่งเกิดจริงบ่อยกับ Messenger (Meta ไม่ให้
   * profile_pic จนกว่าจะผ่าน App Review) — หมึกสีน้ำเงินบนพื้นน้ำเงินทึบแทบมองไม่เห็น
   * บนพื้นทึบจึงใช้คู่ขาวโปร่ง ชุดเดียวกับปุ่มย่อ/ปิดในแถบเดียวกัน (hover:bg-white/15)
   */
  onSolid?: boolean
}) {
  const [failed, setFailed] = useState(false)
  const src = avatar ? (avatar.startsWith('http') ? avatar : `/api/files/${avatar}`) : null
  return (
    <span className="relative shrink-0">
      {!src || failed ? (
        <span
          className={`flex size-9 items-center justify-center rounded-full text-xs font-semibold ${
            onSolid ? 'bg-white/20 text-white' : 'bg-primary/10 text-primary-ink'
          }`}
        >
          {generateInitials(name) || '?'}
        </span>
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt={name} className="bg-default-100 size-9 rounded-full object-cover" onError={() => setFailed(true)} />
      )}
      {/* รูปเพจก่อน โลโก้ช่องทางเป็นตัวสำรอง — ChannelBadgeOverlay ถอยเองเมื่อ URL ของ Meta หมดอายุ
          ไม่ส่ง size = md (size-4) ตัวเดียวกับ InboxList/CustomerPanel: ขนาด badge ที่นี่เคยเป็น sm
          ซึ่ง "เกือบเหมือนแต่ไม่เท่า" พี่น้อง และรูปเพจต้องดูออกว่าเป็นเพจไหนตั้งแต่ขนาดเล็ก
          (avatar ที่นี่เล็กกว่ารายการแชท size-9 vs size-10 เพราะเป็นชิป/แถบหัวหน้าต่างที่แคบกว่า) */}
      {channel !== 'DEEP' && <ChannelBadgeOverlay channel={channel} imageUrl={pageAvatarUrl} />}
    </span>
  )
}

/**
 * vocab อยู่ใน context ด้วย (เพิ่ม 2026-08-05) — client component ในโฟลเดอร์แชทหลายตัวเรียกรายการ
 * ว่า "คำสั่งซื้อ" ตายตัว (การ์ดออเดอร์, เมนูกดค้างบนข้อความ, รายการแชท) ทั้งที่ร้านบริการ/บ้านพัก
 * เรียกคนละชื่อ. ตัวเหล่านั้นอยู่ลึกจาก layout หลายชั้นเกินกว่าจะส่ง prop ไล่ลงไปไหว และ Provider
 * ตัวนี้ครอบทั้ง (chat) อยู่แล้วพร้อม vocab ในมือ — เปิดให้ hook เดิมคืนค่าให้จึงถูกกว่าสร้าง context ใหม่
 */
type DraftOrderContextValue = { openDraft: (input: OpenDraftInput) => void; vocab: OrderVocab }
const DraftOrderContext = createContext<DraftOrderContextValue | null>(null)

export function useDraftOrders(): DraftOrderContextValue {
  const ctx = useContext(DraftOrderContext)
  if (!ctx) throw new Error('useDraftOrders ต้องอยู่ภายใต้ <DraftOrderProvider>')
  return ctx
}

/**
 * อ่านเฉพาะคลังคำ โดยไม่บังคับว่าต้องมี Provider — ใช้กับ component ที่แค่ "เรียกชื่อรายการให้ถูก"
 * ไม่ได้จะเปิดโมดัล (รายการแชท, การ์ดออเดอร์ในบับเบิล)
 *
 * ทำไมต้องมีคู่กับ useDraftOrders: layout ห่อ Provider เฉพาะตอนมีร้าน active (`if (!activeCtx?.shopId)
 * return shell`) ผู้ใช้ที่ยังไม่มีร้านจึงอยู่นอก Provider — ถ้า component พวกนั้นเรียก useDraftOrders
 * ตรง ๆ ทั้งหน้าจะพังด้วย error ที่ไม่เกี่ยวกับสิ่งที่มันต้องการเลย
 * ไม่มี Provider → ชุดคำของ ONLINE_SALES (fail-safe เดียวกับ resolveOrderVocab)
 */
export function useOrderVocab(): OrderVocab {
  return useContext(DraftOrderContext)?.vocab ?? ORDER_VOCAB.ONLINE_SALES
}

type ProviderProps = {
  shopId: string
  catalog: CatalogProduct[]
  bestSellers: CatalogProduct[]
  inventoryEnabled: boolean
  /** คลังคำผันตามประเภทกิจการ (feature 00030) — layout เป็นคนคำนวณ */
  vocab: OrderVocab
  /** ประเภทกิจการดิบ — ฟอร์มใช้ตัดสินว่า "รายการพิมพ์เอง" ต้องมีที่อยู่จัดส่งไหม (shopShipsGoods) */
  shopVertical?: string
  /** feature 00024 — ร้านนี้ใช้ระบบนัดหมายได้ไหม (SERVICE_QUEUE เท่านั้น); false = ฟอร์มไม่ render บล็อกวันนัด */
  serviceResourcesEnabled?: boolean
  /** ทรัพยากรบริการที่เปิดใช้งาน (ช่าง/ช่องบริการ) — ว่าง = ไม่มีอะไรให้จอง บล็อกไม่ขึ้น */
  serviceResources?: ServiceResourceOption[]
  /** ร้านรับนัดรายวัน (DAY) หรือระบุช่วงเวลา (TIME) */
  appointmentGranularity?: AppointmentGranularity
  children: React.ReactNode
}

export default function DraftOrderProvider({
  shopId,
  catalog,
  bestSellers,
  inventoryEnabled,
  vocab,
  shopVertical,
  serviceResourcesEnabled = false,
  serviceResources = [],
  appointmentGranularity = 'DAY',
  children,
}: ProviderProps) {
  const [drafts, setDrafts] = useState<ChatDraft[]>([])

  // feature 00022 — โหมดสร้างพัสดุของร้าน
  // ที่นี่เป็น client component จึงถามผ่าน API ครั้งเดียวตอน mount (ต่างจากหน้า POS
  // ที่ server ส่งมาให้ตอน render). ร้านที่ไม่ได้เชื่อมต่อ/ร้านบ้านพักจะได้ 403 หรือ
  // connected=false → คงค่า 'OFF' ไว้ = ไม่มีอะไรเกิดขึ้นตอนสร้างออเดอร์จากแชท
  const [ishipCreateMode, setIshipCreateMode] = useState<IShipCreateMode>('OFF')
  useEffect(() => {
    let alive = true
    void (async () => {
      try {
        const res = await fetch('/api/seller/iship/connection', { cache: 'no-store' })
        if (!res.ok) return
        const body = (await res.json()) as { connected?: boolean; status?: string; createMode?: string }
        if (alive && body.connected && body.status === 'ACTIVE') {
          setIshipCreateMode((body.createMode as IShipCreateMode) ?? 'OFF')
        }
      } catch {
        // เงียบโดยเจตนา — ถามไม่ได้ก็คงเป็น 'OFF' ไม่ควรรบกวนหน้าแชทด้วย error เรื่องขนส่ง
      }
    })()
    return () => {
      alive = false
    }
  }, [])
  const router = useRouter()
  const pathname = usePathname()

  const openDraft = useCallback((input: OpenDraftInput) => {
    const editToken = input.editOrderToken ?? null
    const kind: DraftKind = input.kind ?? 'ORDER'
    const shipmentToken = input.shipmentOrderToken ?? null
    setDrafts((prev) => {
      // dedup: พัสดุ → key ด้วยออเดอร์ที่จะเปิดพัสดุ; แก้ไข → key ด้วย editOrderToken
      // (แก้คนละออเดอร์ = คนละร่าง); สร้างใหม่ → key ด้วย conversationId
      const existing = prev.find((d) =>
        kind === 'SHIPMENT'
          ? d.kind === 'SHIPMENT' && d.shipmentOrderToken === shipmentToken
          : d.kind === 'ORDER' &&
            (editToken
              ? d.editOrderToken === editToken
              : !d.editOrderToken && d.conversationId === input.conversationId),
      )
      if (existing) {
        // มีร่างนี้อยู่แล้ว → ขยายตัวเดิม, ตัวอื่นที่ขยายอยู่ให้ย่อ (expanded ได้ทีละ 1)
        return prev.map((d) =>
          d.id === existing.id ? { ...d, state: 'expanded' } : d.state === 'expanded' ? { ...d, state: 'minimized' } : d,
        )
      }
      const next: ChatDraft = {
        id: (globalThis.crypto?.randomUUID?.() ?? `d${Date.now()}${prev.length}`),
        kind,
        conversationId: input.conversationId,
        customerName: input.customerName,
        customerAvatar: input.customerAvatar ?? null,
        pageAvatarUrl: input.pageAvatarUrl ?? null,
        channel: input.channel,
        editOrderToken: editToken,
        shipmentOrderToken: shipmentToken,
        prefillText: input.prefillText ?? null,
        messageCreatedAt: input.messageCreatedAt ?? null,
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

  /**
   * หน้าต่างไหนกำลังเป็น "อ่านอย่างเดียว" ตอนนี้ (user report 2026-08-07)
   *
   * คำถามยืนยันตอนปิดมีเหตุผลเดียวคือ "ข้อมูลที่กรอกไว้จะหาย" — หน้าต่างพัสดุที่เปิดมาดูสถานะ
   * ไม่มีอะไรให้หายสักอย่าง ถามทุกครั้งจึงเป็นการขวางเปล่า ๆ (ผู้ใช้: "หน้านี้มัน view เฉย ๆ
   * ไม่ใช่หน้า edit ไม่จำเป็นต้องถาม")
   *
   * ต้องให้ตัวแผงเป็นคนบอก ไม่ใช่ตัดสินจาก kind==='SHIPMENT' ที่นี่ — หน้าต่างพัสดุเดียวกัน
   * สลับเป็น "ฟอร์มเปิดพัสดุ/ผูกใบ" ได้ในตัวมันเอง (forceForm/linkMode) ซึ่งกรอกข้อมูลจริง
   * และต้องถามเหมือนเดิม
   *
   * เก็บใน ref ไม่ใช่ state: ค่านี้ไม่มีผลต่อสิ่งที่วาดบนจอ ถ้าเป็น state ทุกครั้งที่แผงสลับโหมด
   * จะ re-render ทั้ง Provider (= ฟอร์ม POS ทุกใบที่ mount ค้างไว้) โดยไม่ได้อะไรกลับมา
   */
  const viewOnlyRef = useRef<Record<string, boolean>>({})
  const setViewOnly = useCallback((id: string, v: boolean) => {
    viewOnlyRef.current[id] = v
  }, [])

  const requestClose = useCallback(async (id: string) => {
    if (!viewOnlyRef.current[id]) {
      // impeccable clarify (2026-08-07) — ของเดิม: 'ปิดหน้าต่างนี้?' / '…กดย่อ (−) แทน' / 'ปิดเลย' + 'ยกเลิก'
      //  · หัวเรื่องเดิมพูดถึง "ท่าทาง" (ปิดหน้าต่าง) ไม่ใช่ "สิ่งที่จะเสีย" — ย้ายผลลัพธ์ขึ้นมาเป็นหัวเรื่อง
      //  · 'ยกเลิก' (ค่า default ของ pacesConfirm) อ่านได้เป็น "ยกเลิกคำสั่งซื้อ" ในบริบทนี้พอดี
      //    → ตั้งชื่อปุ่มตามผลลัพธ์ของมันเอง (clarify: ห้ามใช้ ยืนยัน/ยกเลิก/ตกลง กับ confirm ที่มีผลจริง)
      //  · '(−)' ให้สัญลักษณ์แบกความหมายเดี่ยว ๆ — เปลี่ยนเป็นคำว่า "ย่อหน้าต่าง" ให้ตรงกับ
      //    aria-label ของปุ่มจริง (บรรทัด ~413) คนใช้ screen reader จึงได้ยินคำเดียวกับที่อ่านเจอ
      //  · ห้ามอ้างตำแหน่ง "มุมบนขวา": requestClose มี 2 ทางเข้า — กากบาทบนหัวหน้าต่างที่เปิดอยู่
      //    และกากบาทบนชิปที่ย่อไว้แล้ว (บรรทัด ~524) ซึ่งไม่มีปุ่มย่อให้กดอีก คำแนะนำต้องจริงทั้งคู่
      //  · 'กรอกต่อ' (คำที่ BusinessCreateModal ใช้) over-promise ในทางเข้าที่สอง (กดแล้วชิปยังย่ออยู่
      //    ไม่ได้เด้งกลับมาให้กรอก) → 'เก็บไว้ก่อน' บอกผลลัพธ์ที่เป็นจริงทั้ง 2 ทางเข้า
      const ok = await pacesConfirm.danger(
        'ปิดแล้วข้อมูลที่กรอกไว้จะหาย',
        'ถ้ายังทำไม่เสร็จ ย่อหน้าต่างเก็บไว้ แล้วกลับมาทำต่อทีหลังได้',
        { confirmButtonText: 'ปิดและทิ้งข้อมูล', cancelButtonText: 'เก็บไว้ก่อน' },
      )
      if (!ok) return
    }
    delete viewOnlyRef.current[id]
    setDrafts((prev) => prev.filter((d) => d.id !== id))
  }, [])

  const handleSuccess = useCallback(
    (draft: ChatDraft) => {
      setDrafts((prev) => prev.filter((d) => d.id !== draft.id))
      // toast ใช้คำสั้นเช่นกัน — "สร้างการเข้ารับบริการแล้ว" ยาวเกินกว่าที่ toast บรรทัดเดียวรับไหว
      // สร้างสำเร็จใช้ createLabel ตรง ๆ ห้ามประกอบ "บันทึก/สร้าง" + noun เอง — LODGING คำล็อกคือ
      // "เปิดบิลเข้าพัก" ไม่ใช่ "บันทึกบิลเข้าพัก" (memory: feedback_vocab_substitution_needs_sentence_sets)
      // toast มีที่ให้คำเต็มอยู่แล้ว ต่างจากหัวหน้าต่างที่ต้องย่อ
      pacesToast.success(draft.editOrderToken ? `แก้ไข${vocab.nounShort}แล้ว` : `${vocab.createLabel}แล้ว`)
      // ถ้ากำลังเปิดแชทของ draft นี้อยู่ → refresh ให้แท็บคำสั่งซื้อเห็นออเดอร์ใหม่ทันที
      if (pathname === `/inbox/${draft.conversationId}`) router.refresh()
    },
    [pathname, router],
  )

  /** พัสดุสำเร็จ — toast ขึ้นที่ ShipmentDraftPanel แล้ว (มีเคส "สร้างได้แต่ส่งข้อความไม่ผ่าน") */
  const handleShipmentDone = useCallback(
    (draft: ChatDraft) => {
      setDrafts((prev) => prev.filter((d) => d.id !== draft.id))
      if (pathname === `/inbox/${draft.conversationId}`) router.refresh()
    },
    [pathname, router],
  )

  /**
   * เธรดที่กำลังเปิดอยู่ตอนนี้ (null = ไม่ได้อยู่ในห้องแชทไหนเลย เช่นแท็บความคิดเห็น/หน้าอื่น)
   * ใช้ทั้งการย่ออัตโนมัติและการไฮไลต์ chip — คำนวณที่เดียว
   */
  const currentConversationId = pathname?.startsWith('/inbox/') ? (pathname.split('/')[2] ?? null) : null

  /**
   * สลับไปแชทอื่นแล้วหน้าต่างที่ค้างอยู่ต้องย่อเอง (user request 2026-08-07)
   *
   * Provider mount ที่ (chat)/layout.tsx จึงไม่ unmount ตอนเปลี่ยนห้อง — หน้าต่างของลูกค้า A
   * เลยลอยทับเธรดของลูกค้า B ต่อไป ซึ่งอันตรายกว่าน่ารำคาญ: ปุ่ม "แจ้งเลขในแชท" ในหน้าต่างนั้น
   * ส่งเข้าห้องของ A ขณะที่ตาอ่านบทสนทนาของ B อยู่
   *
   * ย่อ ไม่ใช่ปิด — ร่างคำสั่งซื้อที่กรอกค้างไว้ต้องไม่หายเพราะแค่เปลี่ยนห้อง
   * คืน prev ตัวเดิมเมื่อไม่มีอะไรต้องย่อ ไม่งั้น setState ทุกครั้งที่ path เปลี่ยน = re-render เปล่า
   */
  useEffect(() => {
    setDrafts((prev) =>
      prev.some((d) => d.state === 'expanded' && d.conversationId !== currentConversationId)
        ? prev.map((d) =>
            d.state === 'expanded' && d.conversationId !== currentConversationId
              ? { ...d, state: 'minimized' as const }
              : d,
          )
        : prev,
    )
  }, [currentConversationId])

  const expanded = drafts.find((d) => d.state === 'expanded') ?? null
  const minimized = drafts.filter((d) => d.state === 'minimized')

  return (
    <DraftOrderContext.Provider value={{ openDraft, vocab }}>
      {children}

      {/* ทุก draft mount ฟอร์มค้างไว้ (hidden เมื่อไม่ได้ขยาย) กันข้อมูลที่กรอกหาย — expanded เห็นทีละ 1 */}
      {drafts.map((d) => (
        <div
          key={d.id}
          role="dialog"
          aria-label={`${draftTitle(d, vocab)} ${d.customerName}`}
          aria-hidden={d.state !== 'expanded'}
          // z-80 = viewport overlay (Paces ไม่มี token; precedent CustomerPanelSheet/OrderQrSheet — HR7 carve-out)
          // ไม่มี backdrop ทึบ (ลอยแบบหน้าต่าง ไม่บล็อกทั้งจอ). มือถือเต็มจอ (inset-0); desktop = หน้าต่างขนาดมือถือ
          // (w-96) dock ขวา (user request 2026-07-24: ให้เล็กเท่ามือถือ จะได้อ่านแชทที่อยู่ข้างหลังได้)
          // transform-gpu: ทำให้ลูก position:fixed (bottom-sheet ~11 ตัวของฟอร์ม POS) ยึดกับ "โมดัล" แทน
          // viewport (พฤติกรรม CSS: ancestor ที่มี transform เป็น containing block ของ fixed descendant) →
          // sheet ถูก contain ในโมดัลแทนกินเต็มจอ โดยไม่ต้องแก้ทีละ sheet (user report 2026-07-24)
          className={
            d.state === 'expanded'
              // pt/pb safe-area เฉพาะโหมดเต็มจอ (<lg): ตั้งแต่เปิด viewportFit:'cover' (2026-08-06)
              // inset-0 = ทับ status bar/home indicator จริง; ≥lg เป็นหน้าต่าง inset-y-4 ไม่ต้องเว้น
              // (lg:pt-0/lg:pb-0 ล้างค่ากลับ) — HR7 carve-out: safe-area ไม่มี token
              ? 'bg-card fixed inset-0 z-80 flex transform-gpu flex-col overflow-hidden shadow-lg pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)] lg:inset-y-4 lg:left-auto lg:right-4 lg:w-96 lg:rounded-lg lg:pt-0 lg:pb-0'
              : 'hidden'
          }
        >
          {/* title-bar สีทึบ (ไม่ใช่ .card-header ขาว+dashed มาตรฐาน — เป็นแถบหัวหน้าต่าง action) */}
          <div className="bg-primary flex items-center gap-3 px-4 py-3 text-white">
            <DraftAvatar avatar={d.customerAvatar} name={d.customerName} channel={d.channel} pageAvatarUrl={d.pageAvatarUrl} onSolid />
            <div className="min-w-0 flex-1">
              <p className="mb-0 truncate text-sm font-semibold">
                {draftTitle(d, vocab)} · {d.customerName}
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
            {d.kind === 'SHIPMENT' && d.shipmentOrderToken ? (
              <ShipmentDraftPanel
                conversationId={d.conversationId}
                orderToken={d.shipmentOrderToken}
                onDone={() => handleShipmentDone(d)}
                onViewOnlyChange={(v) => setViewOnly(d.id, v)}
              />
            ) : (() => {
              // feature 00033 — คำนวณครั้งเดียวเก็บเป็นตัวแปรเดียว ห้ามคำนวณสองรอบให้หลุดจากกัน
              // messageCreatedAt === null = ไม่มีข้อความต้นทาง (ต้องแยกจาก "มีแต่เก่าเกิน")
              const msgMs = d.messageCreatedAt ? new Date(d.messageCreatedAt).getTime() : null
              const msgInWindow = msgMs != null && isOrderDateInWindow(msgMs, Date.now())
              return (
              <OrderCreateForm
              vocab={vocab}
                shopVertical={shopVertical}
                shopId={shopId}
                catalog={catalog}
                bestSellers={bestSellers}
                inventoryEnabled={inventoryEnabled}
                formId={`draft-order-form-${d.id}`}
                initialBuyerName={d.customerName}
                initialSalesChannel={chatChannelToSalesChannel(d.channel)}
                conversationId={d.conversationId}
                editOrderToken={d.editOrderToken ?? undefined}
                prefillParseText={d.prefillText ?? undefined}
                ishipCreateMode={ishipCreateMode}
                serviceResourcesEnabled={serviceResourcesEnabled}
                serviceResources={serviceResources}
                appointmentGranularity={appointmentGranularity}
                onSuccess={() => handleSuccess(d)}
                prefillCreatedAt={msgInWindow ? d.messageCreatedAt ?? undefined : undefined}
                prefillCreatedAtTooOld={msgMs != null && !msgInWindow}
                compact
              />
              )
            })()}
          </div>
        </div>
      ))}

      {/* dock — chip ของ draft ที่ย่อไว้ (แสดงเมื่อไม่มีตัวไหนขยายอยู่ เพราะโมดัลขยายกินเกือบเต็มจอ) */}
      {!expanded && minimized.length > 0 && (
        // มุมขวาล่าง + เรียงแนวนอน (user สั่ง 2026-08-02) — เดิมอยู่ซ้ายล่างและเรียงแนวตั้ง
        // ซึ่งพอมีหลายร่างจะไต่ขึ้นไปบังรายการแชทเป็นแถบยาว
        //   flex-row-reverse: ร่างล่าสุดอยู่ "ใกล้มุมขวา" ที่สุด (ความหมายเดียวกับ flex-col-reverse
        //     เดิมที่ให้ตัวล่าสุดใกล้ขอบล่างสุด) ตัวเก่าไหลไปทางซ้าย — พฤติกรรมเดียวกับ dock ร่าง
        //     ของ Gmail/Messenger ที่คนคุ้นอยู่แล้ว
        //   inset-x-4 + wrap-reverse: ต้องกางเต็มความกว้างถึงจะรู้ว่าเมื่อไหร่ควรขึ้นบรรทัดใหม่
        //     (ไม่งั้นแถวยาวเกินจอแล้วชิปตัวเก่าหลุดขอบซ้ายไปเลย) บรรทัดใหม่ซ้อน "ขึ้นบน" ตาม wrap-reverse
        //   pointer-events-none ที่ปลอก + auto ที่ชิป: ปลอกกินความกว้างทั้งจอ ถ้าไม่ปิดรับคลิก
        //     มันจะบังแถบพิมพ์ข้อความที่อยู่ใต้มัน
        <div className="pointer-events-none fixed inset-x-4 bottom-4 z-80 flex flex-row-reverse flex-wrap-reverse justify-start gap-2">
          {minimized.map((d) => {
            // chip ของ "แชทที่กำลังเปิดอยู่" ต้องแยกออกจากตัวอื่นให้เห็น (user request 2026-08-07):
            // ย่อหลายใบแล้ว chip เรียงกันหน้าตาเหมือนกันหมด ตาไม่รู้ว่าใบไหนของห้องที่อ่านอยู่
            //
            // ป้าย "แชทนี้" ถูกถอดออกตามที่ user สั่ง (2026-08-07 รอบสอง) — ชิปสั้น ๆ มีป้ายต่อท้าย
            // แล้วชื่อลูกค้าโดนบีบจนอ่านไม่ออก เปลี่ยนเป็นพื้นหลัง primary/15 ทั้งใบแทน
            // ซึ่งเห็นชัดกว่าตอนกวาดตาผ่าน dock (ต่างกันทั้งใบ ไม่ใช่ต่างที่ขอบเส้นเดียว)
            // aria-current แทนตัวหนังสือที่หายไป — screen reader ยังบอกได้ว่าใบไหนคือห้องที่เปิดอยู่
            const here = d.conversationId === currentConversationId
            return (
            <div
              key={d.id}
              className={`pointer-events-auto flex items-center gap-2 rounded-full border py-2 ps-3 pe-2 shadow-lg ${
                here ? 'bg-primary/15 border-primary ring-primary/25 ring-2' : 'bg-card border-default-300'
              }`}
            >
              <button
                type="button"
                // กดชิปแล้วพาไปห้องแชทของร่างนั้นด้วย (user request 2026-08-07)
                //
                // ไม่ใช่แค่ความสะดวก: การย่ออัตโนมัติด้านบนทำงานตอน "เปลี่ยนห้อง" เท่านั้น ถ้าขยายชิป
                // ของลูกค้า A ทิ้งไว้ขณะยืนอยู่ในห้องของ B หน้าต่างจะค้างเปิดคร่อมเธรดผิดคนได้เลย
                // (deps ของ effect ไม่เปลี่ยน จึงไม่มีใครย่อให้) — อาการเดียวกับที่ effect นั้นตั้งใจกัน
                // คือปุ่มในหน้าต่างส่งข้อความเข้าห้อง A ขณะตาอ่านบทสนทนาของ B
                //
                // เช็ค here ก่อน: อยู่ห้องเดียวกันอยู่แล้วการ push ซ้ำมีแต่จะทำให้เธรดโหลดใหม่เปล่า ๆ
                onClick={() => {
                  expand(d.id)
                  if (!here) router.push(`/inbox/${d.conversationId}`)
                }}
                aria-current={here ? 'true' : undefined}
                className="flex min-w-0 items-center gap-2"
              >
                <DraftAvatar avatar={d.customerAvatar} name={d.customerName} channel={d.channel} pageAvatarUrl={d.pageAvatarUrl} />
                <span className="flex min-w-0 flex-col text-start">
                  <span className="text-default-700 text-2xs">{draftTitle(d, vocab)}</span>
                  <span className="text-default-800 truncate text-sm font-medium">{d.customerName}</span>
                </span>
              </button>
              <button
                type="button"
                onClick={() => requestClose(d.id)}
                aria-label={`ปิดร่าง${vocab.noun}`}
                className="text-default-700 hover:text-default-700 flex size-6 shrink-0 items-center justify-center rounded-full"
              >
                <Icon icon="x" className="size-4" />
              </button>
            </div>
            )
          })}
        </div>
      )}
    </DraftOrderContext.Provider>
  )
}
