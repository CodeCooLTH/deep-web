'use client'

/**
 * InboxRow — แถวเดียวของรายการแชท (M2 ของ docs/superpowers/specs/2026-09-29-chat-smooth-audit.md)
 *
 * ย้ายจาก `items.map` ใน InboxList.tsx มาเป็น component ระดับ module ห่อ React.memo — markup/className
 * เหมือนเดิมทุกตัวอักษร ที่เปลี่ยนคือ "ใครทำให้วาดใหม่": refresh ที่ patchConversationRows คง identity ของ
 * item ที่ไม่เปลี่ยน → แถวที่ไม่เปลี่ยนไม่วาดใหม่ · การเลือกห้อง/สถานะกดค้างส่งเป็น boolean ต่อแถว
 * (isActive/actioning) ไม่ส่ง id ที่เลือกให้ทุกแถว
 *
 * 🛑 props ทุกตัวต้อง primitive หรือ identity คงที่ (setState / useStableCallback) — ห้ามส่ง
 * ออบเจกต์/ฟังก์ชันที่ประกาศสดใน render ของ InboxList (hook-return-identity-in-deps.md)
 * 🛑 ห้ามประกาศ component ในตัว render (component-declared-in-render.md)
 */
import { memo } from 'react'
import Link from 'next/link'
import Icon from '@/components/wrappers/Icon'
import { fileUrlOf } from '@/lib/file-url'
import { lateDays, rowBadge } from '@/lib/follow-up-inbox'
import { formatCount, formatDueLabel } from '@/lib/follow-up-view'
import { fmt } from '@/i18n/fmt'
import { customerBadges } from '@/lib/customer-behavior'
import { orderStageChipLabel } from '@/lib/order-stage'
import { generateInitials } from '@/utils/helpers'
import { formatChatListTime, formatDate } from '@/lib/format-date'
import { THREAD_AGENT_STACK_MAX } from '@/services/thread-agents.service'
import SwipeableRow from './SwipeableRow'
import { ChannelBadgeOverlay, ChannelMark, getChannelDisplay, resolveChatChannel } from './ChannelBadge'
import type { ChatRowAnchor } from './ChatContextMenu'
import type { RowAction } from './ChatContextMenu'
import { useT } from '@/i18n/LocaleProvider'
import { BuyerAvatar, type ConversationListItem } from './InboxList'
import { useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { salesStatusMeta } from '../[conversationId]/components/CustomerCrmSection'
import type { InboxSortMode } from '@/lib/inbox-sort'
import { PrefetchKind } from 'next/dist/client/components/router-reducer/router-reducer-types'
import { shouldPrefetchRow } from '@/lib/inbox-row-prefetch'

export type InboxRowProps = {
  c: ConversationListItem
  /** ลำดับแถวในรายการ — primitive; ใช้ตัดสิน prefetch (inbox-row-prefetch.ts) */
  index: number
  /** ห้องที่กำลังเปิดอยู่ — boolean ต่อแถว ไม่ส่ง activeConversationId ให้ทุกแถว */
  isActive: boolean
  unreadCount: number
  groupChip: string | null
  /** แถวนี้กำลังทำ action (ปักหมุด/ปิดงาน/…) อยู่ */
  actioning: boolean
  hiddenMode: boolean
  orderNoun: string
  sortMode: InboxSortMode
  /** avatar ของเพจ/OA ที่แถวนี้ผูกอยู่ (null = ไม่มี/ไม่ผูก) — lookup ที่ parent เพื่อไม่ส่ง Map ทั้งก้อนเข้ามา */
  channelAvatarUrl: string | null
  channelName: string | null | undefined
  /** ขอบเขตปัจจุบันมีเพจเดียว → badge ใช้รูปเพจ */
  singleChannelScope: boolean
  /** แพลตฟอร์มของแถวนี้มีหลายบัญชีในร้าน → ต้องบอกชื่อบัญชี */
  providerDuplicated: boolean
  onRowAction: (id: string, action: RowAction) => void | Promise<void>
  setCtxMenu: (v: { id: string; anchor: ChatRowAnchor }) => void
}

function InboxRowImpl({
  index,
  c,
  isActive,
  unreadCount,
  groupChip,
  actioning,
  hiddenMode,
  orderNoun,
  sortMode,
  channelAvatarUrl,
  channelName,
  singleChannelScope,
  providerDuplicated,
  onRowAction,
  setCtxMenu,
}: InboxRowProps) {
  const t = useT()
  const router = useRouter()
  const SALES_STATUS_META: Record<string, { label: string; cls: string }> = useMemo(() => salesStatusMeta(t), [t])
      const unread = unreadCount > 0
      // feature 00018 CRM — ชื่อในแชท (alias) มาก่อนชื่อจริง ถ้าตั้งไว้ (user: "Wave 110")
      const name =
        c.alias?.trim() || c.counterparty?.displayName || (c.channel === 'DEEP' ? 'ผู้ซื้อ' : 'ผู้ติดต่อ')
      const preview = c.lastMessagePreview ?? 'เริ่มการสนทนาแล้ว'
      const isResolved = c.resolvedAt !== null
      const salesStatus = c.contactSalesStatus ?? 'UNSPECIFIED'
      const contactTags = c.contactTags ?? []
      // 00066 — ป้ายติดตามลูกค้า: ป้ายเดียวต่อแถว เลยกำหนดชนะค้างอยู่ (rowBadge เป็นฟังก์ชันบริสุทธิ์)
      const followBadge = rowBadge(c.followUp)
      const followBadgeText =
        followBadge === 'late' && c.followUp
          ? fmt(t.followUps.rowLateAria, { late: c.followUp.late, open: c.followUp.open })
          : fmt(t.followUps.rowOpen, { n: c.followUp?.open ?? 0 })
      // ป้ายพฤติกรรมลูกค้า — SSOT เดียวกับหัวแผงลูกค้า/ตาราง /orders
      // `hasHistory` = ผูกกับลูกค้าในระบบแล้ว (null = ยังไม่ผูก → ไม่มีป้ายเลย)
      const behaviorBadges = c.customerBehavior
        ? customerBadges(c.customerBehavior, {
            hasHistory: true,
            orderNoun: orderNoun,
            copy: t.inbox.customerPanel,
          })
        : []
      return (
        // S-7: แยก <Link> (เนื้อหาแถว) ออกจาก kebab (sibling) — nested button ใน anchor เป็น
        // invalid HTML + คลิก kebab จะ propagate ไป navigate. outer div รับ hover ทั้งแถว
        // ปักหมุด (user สั่ง 2026-07-23): แถวที่ปักหมุดพื้นเทาจาง + แถบ accent เหลืองด้านซ้าย
        // (สีเดียวกับดาว) — แถวปกติใส่ border-transparent ความหนาเท่ากันไว้ด้วย ไม่งั้นเนื้อหา
        // ขยับ 2px ตอนกด/เลิกปักหมุด. ลำดับ "ปักหมุดขึ้นบนสุด" backend จัดให้แล้ว (S-7
        // pin-first keyset cursor) ฝั่งนี้ไม่ต้องเรียงซ้ำ
        <SwipeableRow
          key={c.id}
          actionsWidth={224}
          actions={
            <>
              <button
                type="button"
                onClick={() => onRowAction(c.id, c.isPinned ? 'unpin' : 'pin')}
                disabled={actioning}
                className="bg-warning text-2xs flex flex-1 flex-col items-center justify-center gap-0.5 text-white disabled:opacity-50"
              >
                <Icon icon={c.isPinned ? 'star-off' : 'star'} width={18} height={18} />
                {c.isPinned ? 'เลิกปัก' : 'ปักหมุด'}
              </button>
              <button
                type="button"
                onClick={() => onRowAction(c.id, isResolved ? 'reopen' : 'resolve')}
                disabled={actioning}
                // 🛑 เขียวเฉพาะทิศ "ปิดงาน" — เดิมใช้ bg-success ทั้งสองทิศ ทำให้สีเดียวหมายถึง
                // สองอย่างที่ตรงข้ามกัน (ปิดงาน vs เปิดใหม่) และผิดกฎ Verified-Means-Green
                // ที่สงวนเขียวไว้กับ "สำเร็จ/ยืนยันแล้ว" — "เปิดใหม่" คือการย้อนสถานะสำเร็จ
                // ไม่ใช่การทำให้สำเร็จ (impeccable critique 2026-08-09)
                className={`text-2xs flex flex-1 flex-col items-center justify-center gap-0.5 text-white disabled:opacity-50 ${
                  isResolved ? 'bg-default-500' : 'bg-success'
                }`}
              >
                <Icon icon={isResolved ? 'arrow-back-up' : 'circle-check'} width={18} height={18} />
                {isResolved ? 'เปิดใหม่' : 'ปิดงาน'}
              </button>
              <button
                type="button"
                onClick={() => onRowAction(c.id, hiddenMode ? 'unhide' : 'hide')}
                disabled={actioning}
                className="bg-default-500 text-2xs flex flex-1 flex-col items-center justify-center gap-0.5 text-white disabled:opacity-50"
              >
                <Icon icon={hiddenMode ? 'eye' : 'eye-off'} width={18} height={18} />
                {hiddenMode ? 'เลิกซ่อน' : 'ซ่อน'}
              </button>
              {/* สแปม (user สั่ง 2026-07-24) — ในถังสแปมปุ่มนี้กลายเป็น "ไม่ใช่สแปม" */}
              <button
                type="button"
                onClick={() => onRowAction(c.id, c.isSpam ? 'unspam' : 'spam')}
                disabled={actioning}
                className="bg-danger text-2xs flex flex-1 flex-col items-center justify-center gap-0.5 text-white disabled:opacity-50"
              >
                <Icon icon={c.isSpam ? 'inbox' : 'alert-octagon'} width={18} height={18} />
                {c.isSpam ? 'ไม่ใช่สแปม' : 'สแปม'}
              </button>
            </>
          }
        >
        <div
          // จุดยึดของ "กดค้าง" — useLongPress ที่ container resolve ย้อนกลับมาที่ element นี้
          // เพื่อโคลนไปลอยเหนือฉากเบลอ (ดู ChatContextMenu โหมด 'row')
          data-conversation-id={c.id}
          onContextMenu={(e) => {
            // เปิดได้ทุกเธรดแล้ว (user สั่ง 2026-07-23: action ประจำแถวต้องอยู่ในคลิกขวาด้วย) —
            // เดิมเปิดเฉพาะช่องทางนอกเพราะเมนูมีแต่ฟิลด์ CRM; ตอนนี้ DEEP ก็มี ปักหมุด/ปิดงาน/
            // ซ่อน/เสียง ให้ใช้ (เมนูซ่อนเฉพาะส่วน CRM เอง)
            e.preventDefault()
            setCtxMenu({ id: c.id, anchor: { kind: 'point', x: e.clientX, y: e.clientY } })
          }}
          className={`group relative flex items-stretch border-s-2 ${
            isActive
              ? // แชทที่กำลังเปิดอยู่ — เด่นชัดสุด (primary tint + แถบ primary) เพื่อให้รู้ว่าคุยห้องไหน
                // (user report 2026-07-23: active/pinned พื้นหลังกลืนกันแยกไม่ออก) ชนะ pinned
                'border-primary bg-primary/10'
              : c.isPinned
                ? 'border-warning bg-default-100/60 hover:bg-default-100'
                : 'border-transparent hover:bg-default-100'
          }`}
        >
          {/* ดาวปักหมุด (user สั่ง 2026-07-23: "พอไปอยู่หน้าสุดมันกินพื้นที่ อยากให้อยู่หน้าชื่อ
              แทน") — เดิมเป็นปุ่มคอลัมน์แยกหน้าสุด กิน ~42px ของทุกแถวตลอดเวลาเพื่อ action ที่
              ใช้กับไม่กี่แถว. ตอนนี้เป็น **indicator inline หน้าชื่อ** แสดงเฉพาะแถวที่ปักหมุด
              ส่วน *การกดปักหมุด* ย้ายไปอยู่กับ action อื่นครบชุดแล้ว: ชุดปุ่มลอยตอน hover
              (≥1024px) และ kebab (<1024px) — ไม่ได้หายไปไหน. เหตุที่ทำเป็น indicator ไม่ใช่
              ปุ่ม: ตำแหน่งหน้าชื่ออยู่ใน <Link> ปุ่มซ้อนใน anchor เป็น invalid HTML และคลิก
              จะ propagate ไป navigate (เหตุผลเดียวกับที่ kebab ต้องเป็น sibling) */}
          {/* py-3 — เคยขยับเป็น py-4 (2026-07-30 "การ์ดเล็กไปหน่อย") แล้วถอยกลับวันถัดมา
              (user: "เอาจริง ๆ ทำมามันก็ใหญ่ไปอ่ะ") เพราะแถวนี้มีชิปหลายชั้นอยู่แล้ว
              (ad_id / สถานะขาย / โฟลเดอร์) ความสูงจึงมาจากเนื้อหา ไม่ใช่ padding —
              เพิ่ม padding ทับเข้าไปยิ่งทำให้เห็นเธรดต่อจอน้อยลงโดยไม่ได้อ่านง่ายขึ้น */}
          <Link
            href={`/inbox/${c.id}`}
            /**
             * 🛑 `prefetch` ต้องระบุเอง — ค่า default ของ Next ไม่พอสำหรับหน้านี้
             *
             * เอกสารของ Next 16 (`client/app-dir/link.d.ts:103-105`) เขียนตรงตัว:
             *   · default 'auto' → **dynamic route ได้แค่ partial prefetch ถึง `loading.js`**
             *   · `true`         → prefetch เต็มทั้ง route และ **ข้อมูล**
             * `/inbox/[conversationId]` เป็น dynamic ⇒ ที่ผ่านมา Next ดึงมาแค่สเกเลตัน
             * ⇒ กดแล้ว **เห็น loading เสมอโดยการออกแบบ** ไม่ว่าจะทำ RSC ให้เร็วแค่ไหน
             * (user 2026-09-10: "มันเหมือนจะไว แต่มันก็มี loading อยู่ดี ทำให้รู้สึกว่าช้า")
             *
             * เปิดเต็มได้เพราะเพิ่งถอด Graph call 680ms ออกจากการเรนเดอร์เธรดไปในรอบเดียวกัน
             * — ก่อนหน้านั้น prefetch เต็มคือการยิง Meta ให้ทุกแถวที่เลื่อนผ่านตา ซึ่งรับไม่ไหว
             *
             * ต้นทุน: Next prefetch เฉพาะลิงก์ที่ **อยู่ในจอ** และ dedupe ให้ แต่ก็ยังแปลว่า
             * แถวที่เลื่อนผ่าน = เรนเดอร์เธรดจริงฝั่งเซิร์ฟเวอร์ 1 ครั้ง ⇒ ถ้าค่า invocation
             * บน Vercel พุ่ง ให้ลดเป็น `prefetch={undefined}` (กลับค่าเดิม) หรือจำกัดตาม index
             */
            prefetch={shouldPrefetchRow(index)}
            // แถวที่ไม่ได้ prefetch ตอนเข้าจอ (L1 audit 2026-09-29): ดึงตอนนิ้ว/เมาส์กดลง ก่อน click จริง
            onPointerDown={shouldPrefetchRow(index) ? undefined : () => router.prefetch(`/inbox/${c.id}`, { kind: PrefetchKind.FULL }) /* FULL = เท่ากับ Link prefetch={true} · ค่าเริ่มต้น AUTO ได้แค่ loading boundary เมื่อไม่เปิด PPR */}
            className="flex min-w-0 flex-1 justify-between gap-3 py-3 pe-3.75 ps-3.75"
          >
            <div className="flex min-w-0 flex-1 items-center gap-3">
              <span className="relative shrink-0">
                <BuyerAvatar avatar={c.counterparty?.avatar ?? null} name={name} />
                {/* badge = โลโก้ "แพลตฟอร์ม" เสมอ (มติแบบ C 2026-08-09 — user เลือกจาก mockup)
                    เดิมส่งรูปเพจเข้ามา (user สั่ง 2026-07-23) เพื่อให้ร้านหลายเพจแยกออกว่า
                    ทักมาจากเพจไหน — แต่พอมี LINE เข้ามาปนในลิสต์เดียวกันแล้วพังทันที เพราะ
                    ร้านตั้งโลโก้ร้านเดียวกันทั้งเพจ FB และ LINE OA เป็นเรื่องปกติ → badge
                    เหมือนกันเป๊ะทุกแถว แยกไม่ออกแม้แต่ว่าคนละแพลตฟอร์ม (user เจอเองบน prod)
                    "บัญชีไหน" ย้ายไปตอบด้วยบรรทัดที่มาข้างล่างแทน — ตรงกับบทเรียนที่จดไว้เอง
                    ในไฟล์นี้ (คอมเมนต์ของ prop `shop`): ภาพซ้ำกันได้โดยไม่ตั้งใจ ข้อความไม่ซ้ำ */}
                <ChannelBadgeOverlay
                  channel={c.channel}
                  imageUrl={
                    singleChannelScope ? channelAvatarUrl : null
                  }
                />
              </span>
              {/* ชื่อลูกค้า "เข้มเสมอ" ทั้งอ่านแล้ว/ยังไม่อ่าน (user report 2026-07-30: "จางไปดูยาก")
                  เดิมอ่านแล้ว = text-default-600 font-medium → ใช้ความจางของ *ชื่อ* มาบอกสถานะอ่าน
                  ทำให้ข้อมูลที่สำคัญที่สุดในแถว (ลูกค้าคนไหน) อ่านยากที่สุด และเธรดที่อ่านแล้ว
                  คือส่วนใหญ่ของรายการ → ทั้งหน้าดูจางไปหมด
                  สถานะอ่านสื่อด้วย 2 อย่างที่เหลืออยู่แล้ว: น้ำหนักฟอนต์ (bold/semibold) +
                  บรรทัด preview ที่เทาลง + badge จำนวนที่ยังไม่อ่าน — ไม่ต้องเอาสีชื่อมาแลก
                  (token Paces ล้วน ไม่มี arbitrary value — HR7) */}
              <span className="min-w-0 overflow-hidden text-start">
                <span
                  className={`text-default-900 flex items-center gap-1 truncate text-xs ${
                    unread ? 'font-bold' : 'font-semibold'
                  }`}
                >
                  {c.isPinned && (
                    <Icon
                      icon="star-filled"
                      width={14}
                      height={14}
                      // ดาวปักหมุด: คงสี warning (เหลือง) ไว้ ไม่ใช้ -ink (user 2026-08-03
                      // "มันต้องสีเหลืองป่ะ") — เคสนี้ "สี = ตัวตนของไอคอน" ดาวสีน้ำตาลอ่านไม่ออกว่าเป็นดาว
                      // ไม่เสียการเข้าถึง เพราะสถานะปักหมุดสื่อผ่านทางอื่นครบ: แถวถูกเรียงขึ้นบนสุด +
                      // aria-label ของปุ่ม + เมนู ⋯ เขียนว่า "เลิกปักหมุด" (WCAG 1.4.11 ไม่บังคับเมื่อ
                      // ข้อมูลมีในรูปแบบอื่นแล้ว) — ต่างจากข้อความที่ไม่มีทางเลือกอื่นนอกจากอ่าน
                      className="text-warning shrink-0"
                      aria-label="ปักหมุดไว้"
                    />
                  )}
                  {/* ในแท็บ "ทั้งหมด" เธรดที่ปิดงาน/สแปมปนอยู่กับเธรดปกติโดยไม่มีอะไรบอก
                      (user report 2026-07-31) — ใช้ไอคอนสีนำหน้าชื่อแบบเดียวกับดาวปักหมุด
                      ไม่ใช้ข้อความ เพราะพื้นที่ชื่อแคบและ badge ข้อความแย่งสายตากับชื่อลูกค้า */}
                  {isResolved && (
                    <Icon
                      icon="circle-check"
                      width={14}
                      height={14}
                      className="text-success shrink-0"
                      aria-label="ปิดงานแล้ว"
                    />
                  )}
                  {c.isSpam && (
                    <Icon
                      icon="alert-octagon"
                      width={14}
                      height={14}
                      className="text-danger shrink-0"
                      aria-label="สแปม"
                    />
                  )}
                  <span className="truncate">{name}</span>
                </span>
                {/* "คุณ: " นำหน้าเมื่อข้อความล่าสุดเป็นของฝั่งร้าน (user สั่ง 2026-07-23:
                    "จะได้รู้ว่าเป็นข้อความของใคร") — convention เดียวกับ Messenger/LINE
                    ใส่เฉพาะตอนมี preview จริง (ไม่ใส่ทับ fallback "เริ่มการสนทนาแล้ว")
                    senderRole='SHOP' ครอบทั้งที่ตอบจาก Deep และ echo จากแอป Messenger ของร้าน
                    — ทั้งคู่คือ "เรา" ในสายตาผู้ใช้ */}
                {/* preview: text-xs ตามเดิม (เคยขยับเป็น text-sm แล้วถอยกลับพร้อม padding แถว
                    2026-07-31 — แถวสูงเกินไป). คงสี text-default-700 ที่ปรับจาก 400 ไว้
                    เพราะเป็นเรื่องคอนทราสต์ให้อ่านออก ไม่ใช่เรื่องขนาด และตอนนี้บรรทัดนี้
                    เป็นตัวหลักที่บอกสถานะอ่าน (ชื่อเข้มเสมอแล้ว) */}
                <span
                  // 🛑 text-xs (13px) ไม่ใช่ text-2xs (11px) — impeccable critique 2026-08-09:
                  // ทั้งแถวเคยมีขนาดตัวอักษรแค่ 2 ระดับห่างกัน 1.18 เท่า และ "ข้อความล่าสุด"
                  // ใช้ขนาดเดียวกับชิป ad_id เป๊ะ ลำดับชั้นจึงเหลือแค่ weight+สีเทา ซึ่งถูกใช้
                  // ไปกับสถานะอ่าน/ยังไม่อ่านหมดแล้ว (user: "ความเด่นชัดของข้อความหายไปเลย")
                  // 🛑 ลบ max-w-52 (208px คงที่) — ตั้งมาให้พอดี rail เดสก์ท็อป 320px แต่มือถือ
                  // drill-down กินเต็มจอ ทำให้ทิ้งที่ว่าง 88px/แถวบนจอ 430px และ 426px บนแท็บเล็ต
                  // ขณะที่ข้อความถูกตัดตั้งแต่คำที่ 5 — ซึ่งคือจุดที่คำทักทายจบพอดี ข้อมูลที่ใช้
                  // ตัดสินใจอยู่หลังจุดตัด · min-w-0 ที่ ancestor ทำให้ truncate ทำงานอยู่แล้ว
                  className={`block truncate text-xs ${
                    unread ? 'text-default-900 font-medium' : 'text-default-700'
                  }`}
                >
                  {/* user request 2026-08-01: ป้าย DeepBot/DeepAI เคยแทนที่คำว่า "คุณ: " ตรงนี้
                      ด้วยตัวอักษรสี primary + ไอคอน ซึ่งเด่นกว่าชื่อลูกค้าจนแย่งสายตาไปทั้งแถว
                      ย้ายไปเป็นชิปในแถวป้ายด้านล่าง (ที่เดียวกับ "สั่งซื้อแล้ว"/แท็ก) แล้วคืน
                      "คุณ: " ให้ทุกข้อความที่ฝั่งร้านส่ง ไม่ว่าคนหรือบอทเป็นคนส่ง — ในสายตา
                      ลูกค้าทั้งคู่คือ "ร้าน" เหมือนกันอยู่แล้ว */}
                  {c.lastSenderRole === 'SHOP' && c.lastMessagePreview && (
                    <span className="text-default-700 font-normal">คุณ: </span>
                  )}
                  {preview}
                </span>
                {/* บรรทัด "ที่มา" (มติแบบ C 2026-08-09) — ตอบว่า "บัญชีไหน" ที่ badge มุม
                    avatar ตอบไม่ได้ เพราะ badge บอกได้แค่แพลตฟอร์ม. เบาที่สุดในแถวโดยตั้งใจ
                    (text-2xs + เทา) ไม่ให้แย่งลำดับชั้นจากชื่อลูกค้าซึ่งยังเป็นพระเอก
                    เธรด DEEP ไม่มีบัญชีให้อ้าง → ใช้ "แอป Deep" (ไม่ใช่ "Deep" เฉย ๆ กันสับสน
                    กับชื่อแบรนด์) · เพจถูกถอดไปแล้วแต่เธรดเก่ายังอยู่ → ถอยไปชื่อแพลตฟอร์ม */}
                {providerDuplicated && (
                  <span className="text-default-500 mt-0.5 flex min-w-0 items-center gap-1 text-2xs">
                    <ChannelMark
                      channel={c.channel}
                      imageUrl={channelAvatarUrl}
                    />
                    <span className="truncate">
                      {channelName ??
                        getChannelDisplay(c.channel).label}
                    </span>
                  </span>
                )}
                {/* feature 00018 CRM — สถานะการขาย + tag (ถ้าตั้งไว้) โชว์ในแถว
                    + E5: ชิป `ad_id.…` บอกว่าโฆษณาไหนพาลูกค้ามา (แบบ Business Suite) */}
                {(salesStatus !== 'UNSPECIFIED' ||
                  contactTags.length > 0 ||
                  !!c.referralAdId ||
                  followBadge !== null ||
                  behaviorBadges.length > 0 ||
                  (c.lastSenderRole === 'SHOP' && !!c.lastMessageAutoReplyKind)) && (
                  <span className="mt-1 flex flex-wrap items-center gap-1">
                    {/* 00066 (e) — ชิปแรกในบรรทัดป้าย · เลยกำหนด = แดงอ่อน+ไอคอน · ค้างอยู่ = เขียว (user 2026-10-05: "ติดตาม" ทั่วไปใช้เขียว แบบ gochat)
                        aria-label เต็ม + title เดียวกัน (มือถือไม่มี hover จึงห้ามพึ่ง title อย่างเดียว) */}
                    {followBadge !== null && c.followUp && (
                      <span
                        role="img"
                        className={`badge text-2xs ${followBadge === 'late' ? 'bg-danger/15 text-danger-ink' : 'bg-success/15 text-success-ink'}`}
                        aria-label={followBadgeText}
                        title={followBadgeText}
                      >
                        <Icon icon="star" className="size-3 shrink-0" />
                        {fmt(t.followUps.rowOpen, { n: formatCount(c.followUp.open) })}
                      </span>
                    )}
                    {/* ป้ายพฤติกรรมลูกค้า — user สั่ง 2026-08-11
                        รอบแรกผมทำเป็น **ไอคอนล้วนไม่มีคำ** เพราะ critique 2026-08-09 เพิ่งตัดชิป
                        ในแถวนี้จาก "ชิงพื้นที่ได้ถึง 6 ใบ" เหลือ 1 — ผลคือมันขึ้นจริงแต่ผู้ขาย
                        **อ่านไม่ออกว่าเป็นป้าย** (user: "มันไปซ่อนอยู่ตรงไหน งง") ป้ายที่อ่านไม่ออก
                        มีค่าเท่ากับไม่มีป้าย จึงกลับมาเป็นชิปมีคำตามที่ user ระบุถ้อยคำมาเอง
                        คุมพื้นที่แทนด้วย: คำสั้น (`ตีกลับ 2 รายการ`) + max-w + truncate
                        ไม่ให้ดันแถวสูงขึ้นที่ rail 320px */}
                    {behaviorBadges.map((b) => (
                      <span
                        key={b.key}
                        role="img"
                        aria-label={b.detail ?? b.label}
                        title={b.detail ?? b.label}
                        className={`badge text-2xs inline-flex max-w-32 shrink-0 items-center gap-1 ${
                          b.tone === 'warning' ? 'bg-warning/15 text-warning-ink' : 'bg-info/15 text-info-ink'
                        }`}
                      >
                        <Icon icon={b.icon} width={12} height={12} className="shrink-0" aria-hidden="true" />
                        <span className="truncate">{b.label}</span>
                      </span>
                    ))}
                    {/* ชิปโฟลเดอร์ย้ายไปมุมขวาล่าง (ใต้เวลา) แล้ว — user สั่ง 2026-07-24 */}
                    {/* DeepBot/DeepAI — ย้ายมาจากหน้าบรรทัด preview (user 2026-08-01) ให้เป็น
                        ป้ายระดับเดียวกับแท็ก/สถานะขาย ไม่แย่งสายตาจากชื่อลูกค้าอีกต่อไป */}
                    {c.lastSenderRole === 'SHOP' && c.lastMessageAutoReplyKind && (
                      <span className="badge bg-primary/15 text-primary-ink text-2xs inline-flex items-center gap-1">
                        <Icon icon="robot" width={12} height={12} className="shrink-0" aria-hidden="true" />
                        {c.lastMessageIsAiEnhanced ? 'DeepAI' : 'DeepBot'}
                      </span>
                    )}
                    {salesStatus !== 'UNSPECIFIED' && (
                      <span className={`badge text-2xs ${SALES_STATUS_META[salesStatus]?.cls ?? ''}`}>
                        {SALES_STATUS_META[salesStatus]?.label ?? salesStatus}
                      </span>
                    )}
                    {c.referralAdId && (
                      // ตัดข้อความให้สั้น (`max-w-24 truncate`) เหมือน Business Suite ที่โชว์ "ad_id...."
                      // — รหัสเต็มอ่านได้จาก title (hover) และที่แผงลูกค้าด้านขวา
                      <span
                        className="badge bg-default-100 text-default-600 text-2xs inline-flex max-w-24 items-center gap-1"
                        title={`ad_id.${c.referralAdId}`}
                      >
                        <Icon icon="brand-meta" className="size-3 shrink-0" />
                        <span className="truncate">ad_id.{c.referralAdId}</span>
                      </span>
                    )}
                    {/* 🛑 โชว์แท็กใบเดียว ไม่ใช่ 2 (impeccable critique 2026-08-09) — แถวชิงพื้นที่
                        กันได้ถึง 6 ใบ (บอท/สถานะขาย/ad_id/แท็ก×2/+N) แล้ว flex-wrap ไม่มีเพดาน
                        ทำให้ความสูงแถวต่างกันได้ 2.4 เท่า (64px→153px) ในรายการเดียวกัน จนกวาด
                        สายตาเป็นจังหวะไม่ได้ · ลดเหลือ 1 ใบทำให้เคสส่วนใหญ่จบใน 1 บรรทัด
                        แท็กที่เหลือยังนับรวมใน +N และดูครบได้ที่แผงลูกค้า/เมนูคลิกขวา
                        แท็กผู้ใช้พิมพ์เองยาวได้ไม่จำกัด จึงต้อง max-w-28 + truncate กันดันแถว */}
                    {contactTags.slice(0, 1).map((t) => (
                      <span key={t} className="badge bg-primary/15 text-primary-ink text-2xs max-w-28 truncate" title={t}>{t}</span>
                    ))}
                    {contactTags.length > 1 && (
                      <span className="badge bg-default-100 text-default-700 text-2xs">+{contactTags.length - 1}</span>
                    )}
                  </span>
                )}
                {/* user request 2026-07-29 — ป้าย "ขั้นตอนล่าสุดของออเดอร์" แทนชิปตะกร้า+จำนวนเดิม
                    (2026-07-25): จำนวนบอกแค่ว่าลูกค้าเคยซื้อกี่ครั้ง ไม่ได้บอกสิ่งที่แอดมินต้องรู้
                    ระหว่างคุยว่า "ของถึงไหนแล้ว". อ้างอิงออเดอร์ล่าสุดใบเดียว; กฎการหมดอายุของป้าย
                    (สำเร็จ 3 วัน / ยกเลิก 1 วัน) อยู่ที่ deriveOrderStage ใน src/lib/order-stage.ts
                    กดแล้วเปิด right panel รายการคำสั่งซื้อเหมือนเดิม (/inbox/{id}?panel=orders)
                    เป็น <span role="link"> ไม่ใช่ <a>/<button> เพราะทั้งแถวอยู่ใน <Link> —
                    nested anchor เป็น invalid HTML + คลิกจะ navigate ผิดที่ (precedent เดียวกับ
                    ดาวปักหมุด/kebab บรรทัดบน) stopPropagation กัน bubble ไปเปิดแชท */}
                {c.orderStage && (() => {
                  const openOrders = (e: React.SyntheticEvent) => {
                    e.preventDefault()
                    e.stopPropagation()
                    router.push(`/inbox/${c.id}?panel=orders`)
                  }
                  // คำบนชิปมาจาก orderStageChipLabel() ที่เดียว (HR16) — ครอบทั้ง
                  // "พิมพ์ N ครั้ง" (user 2026-07-31) และ "พัสดุมีปัญหา ×N" (user 2026-08-20)
                  // เดิมประกอบข้อความตรงนี้ใน JSX ซึ่งไม่มีที่ให้เทสจับและก็อปไปจออื่นไม่ได้
                  const stageLabel = orderStageChipLabel(c.orderStage)
                  return (
                    <span
                      role="link"
                      tabIndex={0}
                      onClick={openOrders}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') openOrders(e)
                      }}
                      aria-label={`${orderNoun}ล่าสุด: ${stageLabel} — ดูรายการ${orderNoun}`}
                      title={stageLabel}
                      className={`badge ${c.orderStage.cls} text-2xs mt-1 inline-flex w-fit shrink-0 cursor-pointer items-center gap-1 focus-visible:outline-none focus-visible:ring-2`}
                    >
                      <Icon icon={c.orderStage.icon} width={13} height={13} className="shrink-0" />
                      {/* ป้ายนัด ("นัด 16 ส.ค. 69") ยาวกว่าคำสถานะเดิมพอสมควร และ rail แคบสุดที่
                          320px — เพดาน+truncate กันไม่ให้ชิปดันแถวสูงขึ้นทั้งรายการ ข้อความเต็ม
                          ยังอ่านได้จาก title (hover) และ aria-label (screen reader) ซึ่งรับค่า
                          เต็มเสมอ ไม่ได้ถูก CSS ตัด — precedent เดียวกับชิป ad_id ด้านบน */}
                      <span className="truncate">{stageLabel}</span>
                    </span>
                  )
                })()}
                {/* 00066 — แถบงานด่วน (แบบ gochat-v3 user สั่ง 2026-10-05): ใบที่เลยกำหนด/ครบวันนี้ที่เก่าสุด
                    ให้เห็นจากรายการแชทเลยว่า "ต้องทำอะไรกับลูกค้าคนนี้" ไม่ต้องเปิดห้อง · ใบไกลกว่าวันนี้ไม่ขึ้น
                    (ชิป "ติดตาม n" บอกอยู่แล้วว่ามีค้าง) · ตัวเลือกใบมาจาก urgentOf ฝั่ง server */}
                {c.followUp?.urgent && (() => {
                  const u = c.followUp.urgent
                  const days = lateDays(u, new Date())
                  const when =
                    days === null
                      ? formatDueLabel(t.followUps, u, new Date(), formatDate)
                      : days === 0
                        ? t.followUps.stripLateToday
                        : fmt(t.followUps.stripLateDays, { n: days })
                  return (
                    <span
                      className={`mt-1 flex min-w-0 items-center gap-1 rounded px-1.5 py-0.5 text-2xs ${
                        u.late ? 'bg-danger/10 text-danger-ink' : 'bg-warning/15 text-warning-ink'
                      }`}
                      title={`${when} · ${u.title}`}
                    >
                      <Icon icon={u.late ? 'clock-exclamation' : 'clock'} className="size-3 shrink-0" aria-hidden="true" />
                      <span className="shrink-0 font-semibold">{when}</span>
                      <span className="shrink-0">·</span>
                      <span className="min-w-0 truncate">{u.title}</span>
                      {u.more > 0 && <span className="shrink-0 font-semibold">+{u.more}</span>}
                    </span>
                  )
                })()}
              </span>
            </div>

            {/* คอลัมน์ขวา (user สั่ง 2026-07-24): เวลา+badge อยู่ "บนขวา", ชิปโฟลเดอร์ "ล่างขวา"
                (ใต้เวลา). self-stretch + justify-between ดันสองก้อนไปหัว-ท้ายของความสูงแถว —
                แถวไหนไม่มีกลุ่มก็ไม่โชว์ชิป (เวลายังอยู่บนขวาเหมือนเดิม) */}
            <span className="flex shrink-0 flex-col items-end justify-between self-stretch py-0.5">
              <span className="flex flex-col items-end gap-1.25">
                {/* timestamp — สีตามสถานะอ่าน (main); indicator ปักหมุดอยู่หน้าชื่อแล้ว */}
                {/* เดิมซ่อนเวลาตอน hover (`lg:group-hover:invisible`, 2026-08-02) เพราะชุดปุ่ม
                    มาทับที่ตรงนี้พอดี — พอ user สั่งย้ายชุดปุ่มไปกลางการ์ด (2026-08-03) มันไม่ทับ
                    แล้ว การซ่อนเวลาจึงกลายเป็นการทิ้งข้อมูลฟรี ๆ ทุกครั้งที่เมาส์ผ่าน → เอาออก */}
                <span
                  className={`text-2xs ${unread ? 'text-default-700 font-semibold' : 'text-default-700'}`}
                >
                  {/* 00018 ext 2026-09-09 — เวลาที่โชว์ต้องเป็นคีย์เดียวกับที่ใช้เรียง ไม่งั้น
                      รายการดูเหมือนเรียงมั่ว (เรียงด้วยเลขหนึ่ง โชว์อีกเลขหนึ่ง)
                      lastInboundAt = null (ลูกค้าไม่เคยพิมพ์) → บอกตรง ๆ ห้ามเอา lastMessageAt
                      มาแปะแทน (docs/conventions/partial-data-must-be-labeled-or-filled.md) */}
                  {sortMode === 'LAST_CUSTOMER_MESSAGE'
                    ? c.lastInboundAt
                      ? formatChatListTime(c.lastInboundAt)
                      : // 🛑 คอลัมน์ขวาเป็น `shrink-0` ⇒ มันไม่หด แต่ไป "บีบคอลัมน์ซ้าย"
                        // (ชื่อลูกค้า+ข้อความล่าสุด ซึ่งเป็น min-w-0 flex-1) แทน ⇒ ป้ายนี้ต้องสั้น
                        // ใกล้เคียงสตริงเวลาปกติ ("5 น." ~6 ตัวอักษร) ไม่ใช่ประโยคเต็ม และต้อง
                        // nowrap ไม่งั้นตกบรรทัดแล้วความสูงแถวเพี้ยนเฉพาะกลุ่มนี้
                        // (prod: 475/8,958 เธรด = 5.3% ไม่ใช่ edge case)
                        <span className="whitespace-nowrap">{t.inbox.sort.neverInbound}</span>
                    : formatChatListTime(c.lastMessageAt)}
                </span>
                {/**
                  * ป้ายชื่อร้าน (feature 00037) — เฉพาะโหมดรวม
                  *
                  * วางในคอลัมน์ขวาไม่ใช่แถวชิปฝั่งซ้าย เพราะคอลัมน์นี้ปกติมีแค่เวลา (+ตัวนับ
                  * เมื่อมี) ซึ่งเตี้ยกว่าคอลัมน์ซ้าย (ชื่อ+ข้อความล่าสุด ≥2 บรรทัดเสมอ) อยู่แล้ว
                  * — เพิ่มบรรทัดเล็กที่นี่จึงไม่ดันความสูงแถวในเคสปกติ ต่างจากการแทรกเข้าแถวชิป
                  * ซ้ายที่จะเพิ่มบรรทัดจริงทุกแถว (user เคยบอกแล้วว่าแถว "ใหญ่ไป")
                  *
                  * สี default-500 ไม่ใช่ primary: ป้ายนี้ซ้ำได้หลายสิบครั้งต่อจอ ถ้าใช้สีธีม
                  * จะกินสัดส่วนเกิน One Voice — สงวน primary ไว้กับปุ่มหลักตัวเดียวของแถบเครื่องมือ
                  */}
                {/* 🛑 ซ่อนป้ายชื่อร้านเมื่อบรรทัดชื่อเพจโชว์อยู่ (user สั่ง 2026-08-09) —
                    เพจหนึ่งเพจเป็นของร้านเดียวเสมอ พอรู้ว่าเพจไหนก็รู้ว่าร้านไหนอัตโนมัติ
                    การโชว์ทั้งคู่คือบอกเรื่องเดียวกันสองที่ในแถวเดียว แถมป้ายร้านอยู่ฝั่งขวา
                    ที่แคบกว่าจึงถูกตัดจนอ่านไม่ได้ความ ("BT Pre…") ขณะที่บรรทัดชื่อเพจได้
                    ความกว้างเต็มแถว — เก็บอันที่อ่านออก ทิ้งอันที่อ่านไม่ออก
                    เธรด DEEP ไม่มีเพจให้อ้าง บรรทัดชื่อเพจจึงไม่เคยโชว์ → ยังเห็นชื่อร้านเสมอ */}
                {c.shop && !providerDuplicated && (
                  <span
                    className="text-default-500 text-2xs flex max-w-24 items-center justify-end gap-0.5 truncate"
                    title={`ร้าน ${c.shop.name}`}
                  >
                    <Icon icon="building-store" className="size-3 shrink-0" />
                    <span className="truncate">{c.shop.name}</span>
                  </span>
                )}
                {/* จำนวนที่ยังไม่อ่าน — คอลัมน์ขวา ใต้เวลา เหนือชิปกลุ่ม (user สั่ง 2026-07-31
                    หลังลองแบบติดมุม avatar แล้วเลือกกลับมาที่เดิม) คงรูปวงกลมไว้ตามที่สั่ง
                    badge "ปิดงานแล้ว" ไม่อยู่ตรงนี้แล้ว (เป็นไอคอน check หน้าชื่อ) จึงไม่เบียดกัน */}
                {unread && (
                  <span className="bg-danger flex h-4.5 min-w-4.5 items-center justify-center rounded-full px-1 text-2xs font-semibold text-white">
                    {unreadCount > 99 ? '99+' : unreadCount}
                  </span>
                )}
                {/* feature 00061 — ร่างคำสั่งซื้อที่ยังค้างในห้องนี้
                    🛑 **วางถัดจาก** badge ยังไม่อ่าน ไม่ใช่แทนที่ — สองอย่างตอบคำถามคนละอัน
                    ("มีข้อความยังไม่อ่าน" vs "มีร่างรอจัดการ") และห้องหนึ่งมีได้ทั้งคู่พร้อมกัน
                    (อ่านข้อความแล้วแต่ยังไม่จัดการร่าง)
                    🛑 ต้องมี aria-label — ตัวเลขเปล่าไม่บอกว่าหมายถึงอะไร ต่างจาก badge
                    ยังไม่อ่านที่บริบทข้างเคียงบอกอยู่แล้ว */}
                {(c.draftOrderCount ?? 0) > 0 && (
                  <span
                    className="badge bg-warning/15 text-warning-ink text-2xs inline-flex items-center gap-0.5"
                    aria-label={`มี ${c.draftOrderCount} ร่างคำสั่งซื้อรอจัดการ`}
                    title={`มี ${c.draftOrderCount} ร่างคำสั่งซื้อรอจัดการ`}
                  >
                    <Icon icon="file-alert" width={11} height={11} className="shrink-0" aria-hidden="true" />
                    {c.draftOrderCount}
                  </span>
                )}
              </span>
              {/* แถวล่างสุดของคอลัมน์ขวา — ชิปโฟลเดอร์ + กองรูปแอดมินที่ตอบ
                  🛑 กองรูป **อยู่ในสายการวางปกติ ห้ามใช้ absolute** (แก้ 2026-09-10 รอบ 3):
                  สองรอบแรกวางแบบ absolute แล้วไล่คำนวณ end ให้เท่ากับ padding ของแถว
                  (end-2.5 → end-3.75 → end-4.25 ชดเชยความหนา ring) — user ส่งภาพ DevTools
                  มายืนยันว่ายังหลุดออกไปนอกกล่องของ <Link> อยู่ดี. อยู่ในคอลัมน์เดียวกับ
                  เวลา/ตัวนับที่ยังไม่อ่านซึ่งเป็น `items-end` อยู่แล้ว ⇒ **ขอบขวาตรงกันเอง
                  ตลอดไปโดยไม่ต้องคำนวณ** และขยับตามทุกครั้งที่ padding ของแถวเปลี่ยน */}
              {(groupChip || (c.threadAgents && c.threadAgents.length > 0)) && (
                <span className="flex items-center gap-1.5">
                  {groupChip && (
                    <span className="badge bg-default-100 text-default-600 text-2xs inline-flex max-w-28 items-center gap-1">
                      <Icon icon="folder" width={11} height={11} className="shrink-0" />
                      <span className="truncate">{groupChip}</span>
                    </span>
                  )}
                  {c.threadAgents && c.threadAgents.length > 0 && (
                    <span
                      role="img"
                      aria-label={`${t.inbox.agentsLabel}: ${c.threadAgents.map((a) => a.name).join(', ')}`}
                      /**
                       * me-0.5 = ชดเชยความหนา `ring-2` ที่ **วาดนอกกล่อง**
                       *
                       * คอลัมน์นี้เป็น `items-end` ซึ่งจัด "ขอบกล่อง" ให้ตรงกัน แต่วงแหวน
                       * ไม่ได้อยู่ในกล่อง ⇒ ขอบที่ตาเห็นล้ำไปขวากว่าเวลา/ตัวนับ 2px เสมอ
                       * ไม่ว่าจะจัดวางยังไง (user ทักเรื่องนี้ 3 รอบ — 2 รอบแรกผมไล่แก้
                       * ด้วย absolute + คำนวณ end ซึ่งผิดวิธีตั้งแต่ต้น)
                       *
                       * 🛑 ห้ามถอด `items-end` ของคอลัมน์เพื่อแก้เรื่องนี้ — นั่นคือตัวที่
                       * ทำให้เวลา/ตัวนับ/ชิปชิดขวาพร้อมกัน ถอดแล้วทุกตัวเลื่อนไปชิดซ้าย
                       */
                      className="group/agents relative me-0.5 flex items-center -space-x-1.5"
                    >
                      {c.threadAgents.slice(0, THREAD_AGENT_STACK_MAX).map((a) => (
                        <span
                          key={a.userId}
                          aria-hidden="true"
                          className="ring-card bg-default-200 text-default-700 flex size-5 shrink-0 items-center justify-center overflow-hidden rounded-full text-2xs font-bold ring-2"
                        >
                          {a.avatar ? (
                            // fileUrlOf — `User.avatar` เก็บได้ทั้ง URL ดิบและ fileId ของ storage เรา
                            // ตัวเดียวกับที่ BuyerAvatar ใช้ ห้าม interpolate เอง
                            // eslint-disable-next-line @next/next/no-img-element -- 20px ไม่คุ้มค่า next/image
                            <img src={fileUrlOf(a.avatar)} alt="" loading="lazy" className="size-full object-cover" />
                          ) : (
                            generateInitials(a.name).slice(0, 2) || '?'
                          )}
                        </span>
                      ))}
                      {c.threadAgents.length > THREAD_AGENT_STACK_MAX && (
                        <span
                          aria-hidden="true"
                          className="ring-card bg-primary flex size-5 shrink-0 items-center justify-center rounded-full text-2xs font-bold text-white ring-2"
                        >
                          {c.threadAgents.length - THREAD_AGENT_STACK_MAX}+
                        </span>
                      )}
                      {/* กล่องชื่อ — เดสก์ท็อปเท่านั้น (มือถือไม่มี hover; screen reader อ่านจาก
                          aria-label ข้างบนได้ทุกจอ). ยึด `group/agents` ไม่ใช่ `group` ของแถว
                          ไม่งั้นชี้ตรงไหนของแถวก็เด้ง */}
                      <span className="bg-default-900 pointer-events-none absolute bottom-full end-0 z-30 mb-1.5 hidden whitespace-nowrap rounded-lg px-2.5 py-1.5 text-2xs leading-relaxed text-white opacity-0 shadow-lg transition-opacity lg:block lg:group-hover/agents:opacity-100">
                        {c.threadAgents.slice(0, THREAD_AGENT_STACK_MAX).map((a) => (
                          <span key={a.userId} className="block font-medium">
                            {a.name}
                          </span>
                        ))}
                        {c.threadAgents.length > THREAD_AGENT_STACK_MAX && (
                          <span className="text-default-300 block">
                            {t.inbox.agentsMore.replace('{n}', String(c.threadAgents.length - THREAD_AGENT_STACK_MAX))}
                          </span>
                        )}
                      </span>
                    </span>
                  )}
                </span>
              )}
            </span>
          </Link>

          {/* ชุดปุ่มลอยตอน hover (ปักหมุด/ปิดงาน/⋯) ถูกถอดออก 2026-09-10 ตามคำสั่ง user
              ("ให้เอาออกดีไหม ให้เค้าไป คลิกขวาเอา")

              🛑 ไม่ได้เสียความสามารถอะไรเลย — `ChatContextMenu` (คลิกขวาบนเดสก์ท็อป /
              กดค้างบนมือถือ) มี `RowAction` **ครบทั้ง 8 ค่าของ type** (pin/unpin ·
              resolve/reopen · hide/unhide · spam/unspam) บวกสถานะขาย/แท็ก/กลุ่ม/เสียง
              ⇒ ชุดปุ่มลอยเป็น subset แท้ ๆ ของมัน และเมนู ⋯ (ConversationRowMenu) ก็เป็น
              เมนูตัวที่สองของแถวเดียวกันที่เนื้อหาไม่เท่ากัน = คำถามเดียวมีสองคำตอบ (HR16)

              ทำไมถึงถอดตอนนี้ ไม่ใช่การกลับมติไปมา: ตอนที่ชุดปุ่มนี้ถูกสั่งให้ทำ (2026-07-23)
              คลิกขวายังเปิดได้เฉพาะเธรดช่องทางนอก และ **กดค้างบนมือถือยังไม่มี** (มาทีหลัง
              2026-08-06) มันจึงเป็นทางเข้าเดียวจริง ๆ ในตอนนั้น — เหตุผลนั้นหมดอายุไปแล้ว

              ที่เสียไปจริง ๆ มีข้อเดียวคือ "การค้นพบ" (คลิกขวามองไม่เห็น) ส่วนอีก 2 ข้อที่
              ดูเหมือนจะเสียนั้นไม่จริง: เมนูเบราว์เซอร์บนแถวถูก `e.preventDefault()` ปิดไป
              ตั้งแต่แรกอยู่แล้ว และชุดปุ่มเดิมเป็น `hidden` จนกว่าจะ hover ⇒ แท็บไปไม่ถึง
              เลยตั้งแต่ต้น ขณะที่ปุ่ม Menu/Shift+F10 ยิง `contextmenu` ได้จริง */}

        </div>
        </SwipeableRow>
  )
}

export const InboxRow = memo(InboxRowImpl)
