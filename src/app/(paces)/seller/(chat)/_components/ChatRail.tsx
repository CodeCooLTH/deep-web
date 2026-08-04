'use client'

/**
 * ChatRail — คอลัมน์ซ้าย (รายการแชท) ของหน้าแชทเต็มจอ, desktop ≥1024px เท่านั้น (rewrite ตาม
 * .superpowers/sdd/chat-standalone.md — ย้ายจาก inbox/components/ChatRailClient.tsx เดิม)
 *
 * ของเดิม (feat 00018 T2): render node นี้ "แทนที่" เนื้อหาเมนู Sidenav ของ seller ผ่าน
 * SidenavContent.tsx (usePathname ตัดสินโหมด) — เป็นต้นเหตุบั๊กทั้งวัน (สลับไม่ทัน soft
 * navigation, ชนกับ token --sidenav-width, การ์ดขาวทับพื้นเมนูสีเข้ม) ตอนนี้ (chat)/layout.tsx
 * ไม่มี Sidenav ให้แทนที่แล้ว — mount component นี้ตรงเป็นคอลัมน์แรกแทน data fetch/UI ข้างในไม่
 * เปลี่ยนแม้แต่บรรทัดเดียว (ยังใช้ InboxList เดิม, ยัง fetch /api/channels + /api/chat/conversations
 * เหมือนเดิม)
 *
 * Base: theme/paces/Admin/TS/src/app/(admin)/apps/chat/components/ContactList.tsx
 * (โครงสร้าง sidebar แชท: search header เหนือ contact list ที่ scroll ได้ในตัว)
 *
 * scroll container: เดิมพึ่ง SimpleBar ของ Sidenav/index.tsx ครอบให้ (aside > SimpleBar >
 * เนื้อหา) — ตอนนี้ไม่มี Sidenav แล้ว ต้องมี SimpleBar ของตัวเอง (Base: ContactList.tsx:32,
 * SimpleBar id="chat-sidebar" ผูก viewport-height ของมันเอง — ที่นี่ใช้ size-full แทน เพราะ
 * parent (chat)/layout.tsx คุมความสูงคอลัมน์ให้แล้วผ่าน flex h-dvh ไม่ต้องคำนวณ viewport ซ้ำ)
 *
 * reuse InboxList ทั้งชุดเหมือนเดิม — ห้ามแก้ (นอกขอบเขต, ยกเว้นแก้ import path ตอนย้ายไฟล์)
 *
 * data fetch: GET /api/channels (ตัวกรอง "เพจ") + GET /api/chat/conversations (รายการเริ่มต้น)
 * — contract ดู .superpowers/sdd/t1-report.md; response ของ /api/chat/conversations enrich
 * counterparty มาแล้วที่ route (ตรง ConversationListItem ทุก field ไม่ต้อง map เพิ่ม)
 *
 * ความกว้าง 320px คุมที่ (chat)/layout.tsx (lg:w-80 — Tailwind scale ปกติ ไม่ใช่ arbitrary/
 * scoped-CSS-var-override เหมือนของเดิมที่ต้องแย่ง cascade กับ --sidenav-width เพราะตอนนี้ไม่มี
 * Sidenav ให้แย่งด้วยแล้ว)
 *
 * ปุ่ม "กลับเมนูหลัก" เดิม (sticky bottom ของ rail) — ตัดออก: ChatHeader.tsx (บนสุดของหน้าแชท
 * ทั้งหน้า) มีปุ่ม "กลับหน้าหลัก" ที่เห็นตลอดเวลาอยู่แล้วทุก breakpoint การมีซ้ำอีกจุดในนี้จะรก
 * โดยไม่จำเป็น (เดิมมีเพราะตอนนั้นยังไม่มี header ของตัวเอง จึงต้องมีทางออกฝังอยู่ใน rail เอง)
 */
import { useEffect, useState } from 'react'
import { SimpleBar } from '@/components/wrappers/SimpleBar'
import InboxTabs from './InboxTabs'
import SellerEmptyState from '@/app/(paces)/seller/(dashboard)/_shared/SellerEmptyState'
import { SellerInboxSkeleton } from '@/app/(paces)/seller/(dashboard)/_shared/SellerCardSkeleton'
import InboxList, { type ConversationListItem, type ChannelFilterOption, type ChatGroupTab } from '../inbox/components/InboxList'
import { buildChatListParams, DEFAULT_CHAT_FILTER } from '../inbox/components/chat-list-query'

// feat 00018 งาน 2: เก็บ field ดิบ (provider/name/avatarUrl) แทน label สำเร็จรูป — ตรงกับ
// ChannelView ที่ GET /api/channels คืนมาอยู่แล้ว (allow-list ที่ shop-channel.service.ts)
type ChannelsApiResponse = {
  items: { id: string; provider: string; name: string; avatarUrl: string | null }[]
}
type ConversationsApiResponse = { items: ConversationListItem[]; nextCursor: string | null }

type Props = {
  /** ร้านที่ active (resolve ที่ (chat)/layout.tsx) — ส่งต่อให้ InboxList ใช้ subscribe realtime
   *  `chat:shop:{shopId}`; null = resolve ไม่ได้ (ไม่มีร้าน/หลุดสิทธิ์) → ไม่ subscribe เฉย ๆ */
  shopId: string | null
  /** ร้านเชื่อม iShip แล้วหรือยัง — ส่งต่อให้ InboxList ใช้ตัดสินว่าจะโชว์หัวข้อ "พัสดุ" ในตัวกรอง
   *  รับจาก layout.tsx (RSC ถาม DB อยู่แล้ว) แทนที่จะให้ rail ยิง /api/seller/iship/connection เอง —
   *  ประหยัดหนึ่ง round-trip และถูกต้องตั้งแต่ render แรก ไม่มีจังหวะที่ตัวกรองกะพริบหาย */
  hasShipping?: boolean
}

export default function ChatRail({ shopId, hasShipping = false }: Props) {
  const [loading, setLoading] = useState(true)
  const [loadFailed, setLoadFailed] = useState(false)
  const [items, setItems] = useState<ConversationListItem[]>([])
  const [nextCursor, setNextCursor] = useState<string | null>(null)
  const [channels, setChannels] = useState<ChannelFilterOption[]>([])
  const [groups, setGroups] = useState<ChatGroupTab[]>([])

  useEffect(() => {
    let cancelled = false

    async function load() {
      setLoading(true)
      setLoadFailed(false)
      try {
        // endpoint แยกกัน — ตัวกรอง "เพจ"/กลุ่ม ไม่ควรทำให้ list ล่มถ้าโหลดไม่สำเร็จ
        let channelOptions: ChannelFilterOption[] = []
        try {
          const channelsRes = await fetch('/api/channels')
          if (channelsRes.ok) {
            const channelsData: ChannelsApiResponse = await channelsRes.json()
            channelOptions = channelsData.items.map((c) => ({
              id: c.id,
              provider: c.provider,
              name: c.name,
              avatarUrl: c.avatarUrl,
            }))
          }
        } catch (e) {
          console.error('[ChatRail] load channels failed', e)
        }

        // กลุ่ม/แท็บจัดหมวดแชท (feature 00018) — non-fatal เหมือน channels
        let groupOptions: ChatGroupTab[] = []
        try {
          const groupsRes = await fetch('/api/chat/groups')
          if (groupsRes.ok) {
            const groupsData: { items: ChatGroupTab[] } = await groupsRes.json()
            groupOptions = groupsData.items
          }
        } catch (e) {
          console.error('[ChatRail] load groups failed', e)
        }

        // bug fix (user report 2026-08-01): เดิมยิง '?take=20' เปล่า ๆ → backend ตกไป
        // default status='open' ทั้งที่ InboxList ไฮไลต์แท็บ "ทั้งหมด" อยู่ → เธรดที่ปิดงานแล้ว
        // หายไปตอนเข้าหน้าครั้งแรก แล้วโผล่หลังกดสลับแท็บไป-กลับ (การสลับ = refetch ด้วย
        // status=all). ต้องประกอบจาก DEFAULT_CHAT_FILTER เสมอ ห้ามเขียน query string เอง —
        // เป็นบั๊กเดียวกับที่ inbox/page.tsx (ฝั่ง SSR <1024px) เจอเมื่อ 2026-07-31
        const initialParams = buildChatListParams(DEFAULT_CHAT_FILTER, { take: 20 })
        const conversationsRes = await fetch(`/api/chat/conversations?${initialParams.toString()}`)
        if (!conversationsRes.ok) throw new Error('load conversations failed')
        const conversationsData: ConversationsApiResponse = await conversationsRes.json()

        if (cancelled) return
        setChannels(channelOptions)
        setGroups(groupOptions)
        setItems(conversationsData.items)
        setNextCursor(conversationsData.nextCursor)
      } catch (e) {
        if (cancelled) return
        console.error('[ChatRail] load conversations failed', e)
        setLoadFailed(true)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    load()
    return () => {
      cancelled = true
    }
  }, [])

  return (
    // scrollableNodeProps: SimpleBar เลื่อนจริงที่ `.simplebar-content-wrapper` ข้างใน ไม่ใช่ที่ root
    // → ต้องยัด overscroll-contain ลงโหนดนั้นโดยตรง ไม่งั้นเลื่อนรายการแชทจนสุดแล้ว scroll จะไหลต่อ
    // ไปหาหน้าเว็บ/หัวแชท (bug เดียวกับที่แก้ในเธรด — user report prod 2026-07-23)
    <SimpleBar className="size-full" scrollableNodeProps={{ className: 'overscroll-contain' }}>
      {/* แท็บ ข้อความ | ความคิดเห็น (feature 00029) — อยู่เหนือรายการเหมือน Business Suite */}
      <InboxTabs shopId={shopId} />
      {loading ? (
        <div className="px-4 pt-4 pb-4">
          <SellerInboxSkeleton />
        </div>
      ) : loadFailed ? (
        <div className="px-4 pt-4 pb-4">
          <SellerEmptyState compact icon="alert-circle" title="โหลดรายการแชทไม่สำเร็จ" description="ลองรีเฟรชหน้าใหม่อีกครั้ง" />
        </div>
      ) : items.length === 0 ? (
        <div className="px-4 pt-4 pb-4">
          <SellerEmptyState
            compact
            icon="message-circle"
            title="ยังไม่มีข้อความ"
            description="เมื่อลูกค้าทักแชทมาที่ร้าน จะแสดงในหน้านี้"
          />
        </div>
      ) : (
        <InboxList initialItems={items} initialNextCursor={nextCursor} channels={channels} initialGroups={groups} shopId={shopId} hasShipping={hasShipping} railMode />
      )}
    </SimpleBar>
  )
}
