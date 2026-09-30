'use client'

/**
 * ThreadMessageList — รายการข้อความของ ChatThread (M1 ของ docs/superpowers/specs/2026-09-29-chat-smooth-audit.md)
 *
 * ย้ายจาก ChatThread.tsx (groups.map เดิม) มาเป็น component ระดับ module ห่อ React.memo — markup/className
 * เหมือนเดิมทุกตัวอักษร ที่เปลี่ยนคือ "ใครทำให้วาดใหม่": การพิมพ์ / tick นาฬิกา / state อื่นของ ChatThread
 * ไม่ทำให้ตัวนี้วาดใหม่อีก เพราะ props ทุกตัวเป็น primitive หรือมี identity คงที่
 *
 * 🛑 ห้ามส่งอ็อบเจกต์ที่ hook คืนทั้งก้อน หรือฟังก์ชันที่ประกาศสดใน render ของ ChatThread เข้ามา
 * (hook-return-identity-in-deps.md) — callback ต้องผ่าน useStableCallback/useCallback ที่ผู้เรียก
 * 🛑 ห้ามประกาศ component ภายใน render (component-declared-in-render.md)
 * `lastMsgIsOld` เป็น boolean แทน nowMs — ส่งเวลาปัจจุบันเข้ามาจะทำให้ memo พังทุก tick
 */
import { memo, useMemo } from 'react'
import Icon from '@/components/wrappers/Icon'
import { groupByDate, type ChatMessageView } from '@/app/(paces)/seller/(dashboard)/_shared/useSellerChatThread'
import { computeBurstEndIds } from '@/lib/chat-message-burst'
import { isSelfContainedBubble } from '@/lib/chat-bubble-frame'
import { formatTimeHM, formatDateTimeTH, formatChatBubbleTime } from '@/lib/format-date'
import { withEmojiPresentation } from '@/lib/emoji-presentation'
import { describeSendFailure, stripSendFailurePrefix } from '@/lib/chat-send-failure'
import { resolveChatChannel } from '@/lib/chat-channel'
import { canRetryFailedMessage, needsUncertainSendConfirm, UNCERTAIN_RESEND_CONFIRM } from '@/lib/chat-retry-eligibility'
import { attachmentDisplayName, formatAttachmentSize } from '@/lib/chat-attachment'
import { shouldWarnQuoteUnavailable, quoteJumpTargetId } from '@/lib/chat-quote-availability'
import { parseMetaOrderCard } from '@/lib/meta-order-card'
import { parseMetaSystemNotice, parseMetaAiHandoffNotice } from '@/lib/meta-system-notice'
import { isLibraryEligible } from '@/lib/customer-file-library'
import { AUTO_ORDER_RESULT_TYPE } from '@/lib/auto-order-message-type'
import { pacesConfirm } from '@/lib/paces-swal'
import Swal from 'sweetalert2'
import { useT } from '@/i18n/LocaleProvider'
import { fmt } from '@/i18n/fmt'
import AutoOrderResultCard from './AutoOrderResultCard'
import AutoReplyTag from './AutoReplyTag'
import type { OpenDraftInput } from '../../../_components/DraftOrderProvider'
import PhotoAlbum from './PhotoAlbum'
import SaveToLibraryButton from './SaveToLibraryButton'
import {
  ATTACHMENT_ICON,
  ChatAvatar,
  ChatImageMessage,
  CopyMessageButton,
  CreateOrderFromMessageButton,
  MediaDownloadLink,
  MetaGenericCardCarousel,
  MetaOrderCardBubble,
  OrderCardBubble,
  OwnProductCardCarousel,
  ProductCardBubble,
  ReactMessageButton,
  ReplyMessageButton,
  ShopDeliveryStatus,
  buildAlbumRows,
  mediaSrc,
  type ChatMessageWithAutoOrder,
  type ChatMessageWithDelivery,
} from './ChatThread'

// จัดเวลาเป็นกลุ่ม — แสดงเวลาเฉพาะ "ท้าย burst" (ก่อนเว้นช่วง > 5 นาที หรือสลับผู้ส่ง หรือข้อความสุดท้าย)
const GROUP_GAP_MS = 5 * 60 * 1000

/** วงแหวนไฮไลต์ชั่วคราวบนบับเบิลปลายทาง — ใช้ร่วมทั้งบับเบิลปกติและอัลบั้มรูป (ผูกกับ id เดียวกับ
 *  ที่ `data-message-id` ใช้ ไม่งั้นกระโดดถูกใบแต่ไฮไลต์ไปโผล่คนละใบ) */
const highlightClassFor = (highlightedId: string | null, id: string) =>
  highlightedId === id ? 'ring-primary rounded-lg ring-2' : ''

export type ThreadMessageListProps = {
  messages: ChatMessageView[]
  conversationId: string
  channel: string
  buyerName: string
  buyerAvatar: string | null
  shopAvatar: string | null
  channelAvatarUrl: string | null
  shopUsername: string | undefined
  isCommentReplyThread: boolean
  neverInbound: boolean
  /** id ข้อความ SHOP ล่าสุดที่ไม่ใช่ QUEUED (ช่องทางนอก) — ป้ายอ่านแล้ว/ส่งแล้ว */
  lastShopMsgId: string | null
  readAtMs: number
  deliveredAtMs: number
  /** ข้อความล่าสุดส่งมานานเกิน 1 นาทีแล้วหรือยัง (ซ่อนเวลา) — boolean ไม่ใช่ nowMs เพื่อไม่ให้ memo พังทุก tick */
  lastMsgIsOld: boolean
  highlightedId: string | null
  savedFiles: Set<string>
  savingFileId: string | null
  metaAiMessageIds: Set<string>
  // ── callback: identity ต้องคงที่ (useStableCallback / setState / useCallback ของ hook) ──
  toggleLibrary: (m: { id: string; imageUrl?: string | null }) => Promise<void> | void
  setReplyingTo: (m: ChatMessageView | null) => void
  setActionTarget: (t: { mode: 'reactions'; message: ChatMessageView; x: number; y: number }) => void
  openDraft: (input: OpenDraftInput) => void
  openEditOrder: (token: string) => void
  /** เปิด Lightbox ที่สไลด์ของคีย์นี้ (messageId หรือ `${messageId}:${cardIndex}`) */
  openSlide: (key: string) => void
  jumpToMessage: (targetId: string) => void
  resendMessage: (payload: any) => void // eslint-disable-line @typescript-eslint/no-explicit-any
  cancelMessage: (id: string) => Promise<unknown> | void
  retryMessage: (localId: string, payload: any) => void // eslint-disable-line @typescript-eslint/no-explicit-any
}

function ThreadMessageListImpl({
  messages,
  conversationId,
  channel,
  buyerName,
  buyerAvatar,
  shopAvatar,
  channelAvatarUrl,
  shopUsername,
  isCommentReplyThread,
  neverInbound,
  lastShopMsgId,
  readAtMs,
  deliveredAtMs,
  lastMsgIsOld,
  highlightedId,
  savedFiles,
  savingFileId,
  metaAiMessageIds,
  toggleLibrary,
  setReplyingTo,
  setActionTarget,
  openDraft,
  openEditOrder,
  openSlide,
  jumpToMessage,
  resendMessage,
  cancelMessage,
  retryMessage,
}: ThreadMessageListProps) {
  const t = useT()
  const highlightClass = (id: string) => highlightClassFor(highlightedId, id)
  // ค่าคำนวณหนักผูกกับ messages อย่างเดียว — ตัดกลุ่มด้วย burstIdentity กฎ+เทสอยู่ที่ src/lib/chat-message-burst.ts
  const groups = useMemo(() => groupByDate(messages), [messages])
  const albumRows = useMemo(() => groups.map((g) => buildAlbumRows(g.items)), [groups])
  const burstEndIds = useMemo(() => computeBurstEndIds(messages, GROUP_GAP_MS), [messages])
  const lastMsgId = messages[messages.length - 1]?.id ?? null

  return (
    <>
      {groups.map((g, gi) => (
            <div key={g.key}>
              {/* date divider — badge chip กึ่งกลาง */}
              <div className="my-4 flex justify-center">
                <span className="badge bg-default-100 text-default-700 text-2xs">{g.label}</span>
              </div>

              {albumRows[gi].map((row) => {
                // อัลบั้มรูป (ชุดรูปที่ส่งติดกัน) — render grid + meta ของข้อความตัวสุดท้ายในชุด
                if (row.kind === 'album') {
                  const ms = row.ms
                  const last = ms[ms.length - 1]
                  const mine = last.senderRole === 'SHOP'
                  // 🛑 (CR 2026-08-23) บล็อกอัลบั้มมีตรรกะคู่ขนานกับบับเบิลปกติ แต่เดิม **ไม่ gate
                  // ปุ่มตอบกลับ/รีแอ็กชันด้วย mid เลย** — รอดมาได้เพราะอัลบั้มถูกประกอบจากข้อความที่
                  // persist แล้วเท่านั้น. แถว QUEUED เป็นแถว persist จริงที่มี id จริง จึงหลุดช่องนี้ทันที
                  // (E-12: ส่งรูปกริดทีเดียวสร้างหลายแถว QUEUED พร้อมกัน = เคสหลักของบล็อกนี้พอดี)
                  // ผูกกับ ms[0] เหมือน reply/react ที่อ้าง ms[0] อยู่แล้ว — และเช็ค last ด้วยเพราะ
                  // แถวท้ายคือตัวที่แบกเมตาไลน์ ทั้งกลุ่มอยู่คิวเดียวกันเสมอ (ส่งพร้อมกันใบเดียว)
                  const queued =
                    mine &&
                    ((ms[0] as ChatMessageWithDelivery).deliveryStatus === 'QUEUED' ||
                      (last as ChatMessageWithDelivery).deliveryStatus === 'QUEUED')
                  // (P5) ยิงไม่ออก — ใบไหนในกองล้มก็ถือว่ากองนี้ไม่ถึงลูกค้า (fail-closed: ผู้ขายเห็น
                  // ปัญหาไว้ดีกว่าเห็นช้า) เทียบเท่า failedPersisted ของบับเบิลเดี่ยว
                  const albumFailed =
                    mine && ms.some((x) => (x as ChatMessageWithDelivery).deliveryStatus === 'FAILED')
                  const atBurstEnd = burstEndIds.has(last.id)
                  const isLastOld = last.id === lastMsgId && lastMsgIsOld
                  const showTime = atBurstEnd && !queued && !isLastOld
                  return (
                    /**
                     * data-message-id / data-message-bubble / group — อัลบั้มต้องมีของชุดเดียวกับบับเบิล
                     * ปกติ (user report prod 2026-08-04 "ผม react ไม่ได้ พวก reply, emoji ยังทำไม่ได้"):
                     * เดิมสาขานี้เป็น <div> เปล่า ๆ ไม่มี data attribute เลย → useLongPress หา
                     * closest('[data-message-id]') ไม่เจอ และไม่มีชุดปุ่ม hover ให้กดบนเดสก์ท็อป
                     * รีแอ็กชัน/ตอบกลับผูกกับ **ก้อน** ด้วย mid จริงของรูปใบแรก (ms[0]) เพราะ Meta เก็บ
                     * รีแอ็กชันที่ระดับข้อความ และ mid#1..n เป็นค่าที่เราสร้างเอง ไม่มีอยู่บน Meta
                     */
                    <div
                      key={ms[0].id}
                      data-message-id={ms[0].id}
                      className={`group relative my-5 flex items-start gap-2.5 ${mine ? 'justify-end' : ''}`}
                    >
                      {!mine && <ChatAvatar avatar={buyerAvatar} name={buyerName} />}
                      {mine && (
                        <div className="flex items-start gap-0.5">
                          {/* !queued (CR 2026-08-23): reply/react ต้องการ mid ของช่องทาง ซึ่งแถวในคิว
                              ยังไม่มี — ซ่อนแทน disabled ตามเหตุผลเดียวกับ canReply ของบับเบิลปกติ */}
                          {!queued && <ReplyMessageButton onReply={() => setReplyingTo(ms[0])} />}
                          {/* feature 00048 — ปุ่มผูกกับ "รูปนำของกลุ่ม" (ms[0]) เหมือนที่ reply/react
                              ทำอยู่แล้ว. รูปใบที่ 2 เป็นต้นไปเก็บได้จากใน lightbox ซึ่งมีปุ่มรายสไลด์
                              **ไม่ gate ด้วย !queued โดยตั้งใจ** — อ้าง imageUrl (fileId ของเรา) ไม่ใช่ mid */}
                          {isLibraryEligible({
                            type: ms[0].type,
                            isSticker: ms[0].isSticker,
                            fromCard: false,
                            hasFile: Boolean(ms[0].imageUrl),
                            storageKey: ms[0].imageUrl,
                          }) && (
                            <SaveToLibraryButton
                              saved={Boolean(ms[0].imageUrl && savedFiles.has(ms[0].imageUrl))}
                              busy={savingFileId === ms[0].imageUrl}
                              onToggle={() => void toggleLibrary(ms[0])}
                            />
                          )}
                          {!queued && (
                            <ReactMessageButton
                              onOpen={(rect) =>
                                setActionTarget({
                                  mode: 'reactions',
                                  message: ms[0],
                                  x: rect.left + rect.width / 2,
                                  y: rect.top,
                                })
                              }
                            />
                          )}
                        </div>
                      )}
                      {/* R23: ไม่มี title ที่ระดับบับเบิล — ลูกที่กดได้ (รูป/ปุ่ม) จะรับ tooltip ไปด้วย */}
                      <div data-message-bubble className={`min-w-0 ${highlightClass(ms[0].id)}`}>
                        <PhotoAlbum ms={ms} onOpen={(id) => openSlide(id)} />
                        {/* ชิปรีแอ็กชันของก้อน (ผูกกับ ms[0] ตามที่ Meta เก็บ) */}
                        {ms[0].reactionEmoji && (
                          <span className={`mt-1 flex ${mine ? 'justify-end' : ''}`}>
                            <span className="bg-card border-default-200 rounded-full border px-1.5 py-0.5 text-sm leading-none shadow-sm">
                              {withEmojiPresentation(ms[0].reactionEmoji)}
                            </span>
                          </span>
                        )}
                        {(showTime || (mine && (atBurstEnd || queued || albumFailed || last.id === lastShopMsgId))) && (
                          <div className={`text-default-700 mt-1 flex flex-wrap items-center gap-1.5 text-xs ${mine ? 'justify-end' : ''}`}>
                            {showTime && (
                              <span className="flex items-center gap-1 whitespace-nowrap" title={formatDateTimeTH(last.createdAt)} aria-hidden="true">
                                <Icon icon="clock" />
                                {formatChatBubbleTime(last.createdAt)}
                              </span>
                            )}
                            {/* 🛑 (P5 2026-08-23) เดิมบล็อกนี้เขียนบันไดเองแยกจากบับเบิลเดี่ยว แล้วหลุดจากกันจริง:
                                มีแค่ 2 ขั้น (ขาด "ได้รับแล้ว") และไม่จัดการ failed เลย ⇒ กลุ่มรูปที่ยิงไม่ออก
                                ขึ้นว่า "ส่งแล้ว" ตอนนี้เรียก ShopDeliveryStatus ตัวเดียวกับบับเบิลเดี่ยว */}
                            {albumFailed && (
                              // อัลบั้มไม่มีคลัสเตอร์กู้คืน (retry ของ *กลุ่มรูป* ยังไม่มีนิยาม) — แต่การเงียบ
                              // หรือขึ้น "ส่งแล้ว" แย่กว่าการบอกตรง ๆ ว่าไม่สำเร็จ ผู้ขายส่งใหม่เองได้
                              <span className="text-danger flex items-center gap-1">
                                <Icon icon="alert-circle" className="text-sm" />
                                ส่งไม่สำเร็จ
                              </span>
                            )}
                            {mine && (
                              <ShopDeliveryStatus
                                sending={queued}
                                failed={albumFailed}
                                isLatest={last.id === lastShopMsgId}
                                createdAt={last.createdAt}
                                readAtMs={readAtMs}
                                deliveredAtMs={deliveredAtMs}
                              />
                            )}
                            {mine && atBurstEnd && (
                              <ChatAvatar
                                avatar={shopAvatar}
                                name={buyerName}
                                size="size-5"
                                fallback={
                                  <span className="bg-primary flex size-5 shrink-0 items-center justify-center rounded-full text-white">
                                    <Icon icon="building-store" className="size-3" />
                                  </span>
                                }
                              />
                            )}
                          </div>
                        )}
                        {/* R19/P2-b: div ไม่รองรับ aria-label — เวลาเต็มเป็นข้อความจริง วางหลังเนื้อหา
                            (ต้นไม่ได้ ไม่งั้นทุกบับเบิลถูกอ่านเวลาก่อนเนื้อหา) · ไม่อยู่ใต้เงื่อนไขแถวเวลา */}
                        <span className="sr-only">{fmt(t.inbox.messageTimeSr, { date: formatDateTimeTH(last.createdAt) })}</span>
                      </div>
                      {/**
                       * feature 00048 — อัลบั้ม "ฝั่งลูกค้า" ไม่เคยมีชุดปุ่ม hover เลย (ของเดิมมีเฉพาะ
                       * ฝั่งร้าน ซึ่งวางไว้ *ก่อน* บับเบิลเพราะข้อความร้านชิดขวา) — ซึ่งเป็นเคสหลักของ
                       * ฟีเจอร์นี้พอดี: ลูกค้าส่งสลิปติดกันหลายใบแล้วถูกยุบเป็นอัลบั้ม
                       * เติมเฉพาะปุ่มของฟีเจอร์นี้ ไม่เติม reply/react (นั่นเป็นช่องว่างเดิมคนละเรื่อง
                       * ที่ต้องตัดสินแยก ไม่ใช่ของแถมที่แอบใส่มากับงานนี้)
                       */}
                      {!mine &&
                        isLibraryEligible({
                          type: ms[0].type,
                          isSticker: ms[0].isSticker,
                          fromCard: false,
                          hasFile: Boolean(ms[0].imageUrl),
                          storageKey: ms[0].imageUrl,
                        }) && (
                          <div className="flex items-start gap-0.5">
                            <SaveToLibraryButton
                              saved={Boolean(ms[0].imageUrl && savedFiles.has(ms[0].imageUrl))}
                              busy={savingFileId === ms[0].imageUrl}
                              onToggle={() => void toggleLibrary(ms[0])}
                            />
                          </div>
                        )}
                    </div>
                  )
                }
                const m = row.m
                // เหตุการณ์การโทร — การ์ดชิดขวา (user สั่ง 2026-08-06 "ต้องชิดขวา")
                //
                // เดิมวางกึ่งกลางแบบ date divider ด้วยเหตุผลว่า Meta ส่ง senderRole='SHOP' มาทุกสาย
                // **แม้เป็นสายที่ลูกค้าโทรเข้า** การชิดขวาจึงอาจสื่อผิดว่าร้านเป็นคนโทร. user ตัดสินใจ
                // เอาชิดขวา (ตรงกับที่ Messenger วางเอง) — จึงคง "หน้าตาการ์ดระบบ" ไว้เหมือนเดิม
                // (พื้น default-100 ไม่ใช่ bg-primary ของบับเบิลร้าน, ไม่มี avatar/สถานะส่ง) เพื่อไม่ให้
                // อ่านเป็นข้อความที่ร้านพิมพ์เอง ย้ายแค่ตำแหน่ง ไม่เปลี่ยนความหมาย
                // ยังไม่มีปุ่ม "โทรกลับ" เพราะเรายังโทรกลับไม่ได้จริง (Calling API ต้อง subscribe
                // webhook `calls` + รัน WebRTC เอง) ปุ่มที่กดไม่ได้ = UI โกหก
                /**
                 * feature 00061 — การ์ดผลลัพธ์ของตัวสร้างออเดอร์อัตโนมัติ
                 *
                 * 🛑 ต้องอยู่ **เหนือ** สาขา `mine`/บับเบิลปกติ — ข้อความชนิดนี้มี
                 * `senderRole='SHOP'` เหมือนที่ร้านพิมพ์เอง ถ้าตกลงไปข้างล่างมันจะถูกวาดเป็น
                 * บับเบิลสีน้ำเงินชิดขวาที่มี body เป็น `null` = ฟองว่างเปล่า
                 *
                 * 🛑 และต้องไม่ชิดข้าง — "เต็มความกว้าง" คือสิ่งเดียวที่แยกการ์ดระบบออกจาก
                 * ข้อความที่ร้านพิมพ์ได้จากระยะไกลบนมือถือโดยไม่ต้องอ่านตัวหนังสือ
                 */
                if (m.type === AUTO_ORDER_RESULT_TYPE) {
                  const mAuto = m as ChatMessageWithAutoOrder
                  const token = mAuto.autoOrderCard?.token
                  // ลูกค้าได้รับสรุปใบนี้ไปแล้วหรือยัง — derive จากบับเบิล `type=ORDER` ที่มีอยู่
                  // ในเธรดอยู่แล้ว **ไม่เพิ่มคอลัมน์ใหม่** (การส่งจริงทิ้งหลักฐานไว้เองแล้ว)
                  const sentBubble = token
                    ? messages.find(
                        (x) =>
                          x.type === 'ORDER' &&
                          (x as { orderRefToken?: string | null }).orderRefToken === token,
                      )
                    : undefined
                  return (
                    <div key={m.id} data-message-id={m.id}>
                      <AutoOrderResultCard
                        conversationId={conversationId}
                        createdAt={m.createdAt}
                        card={mAuto.autoOrderCard ?? null}
                        alreadySentAt={sentBubble ? String(sentBubble.createdAt) : null}
                      />
                    </div>
                  )
                }
                if (m.type === 'CALL') {
                  const missed = m.body === 'Missed call'
                  return (
                    // my-5 + justify-end = แนวเดียวกับแถวบับเบิลฝั่งร้าน (บรรทัด ~1848) ให้ขอบขวาตรงกัน
                    <div key={m.id} className="my-5 flex justify-end">
                      <div className="bg-default-100 flex max-w-xs items-center gap-2.5 rounded-lg px-3.5 py-2.5">
                        <span className="bg-primary/15 text-primary flex size-9 shrink-0 items-center justify-center rounded-full">
                          <Icon icon="phone-off" className="text-lg" />
                        </span>
                        <span className="min-w-0">
                          <span className="text-default-900 block text-sm font-semibold">
                            {missed ? 'สายที่ไม่ได้รับ' : 'มีการโทรด้วยเสียง'}
                          </span>
                          <span className="text-default-700 block text-xs">
                            {missed ? 'ไม่มีใครรับสายนี้' : 'การโทรผ่านแชทนี้'} · {formatTimeHM(m.createdAt)}
                          </span>
                        </span>
                      </div>
                    </div>
                  )
                }
                const mine = m.senderRole === 'SHOP'
                // feature 00018 T4 (ภาคผนวก A-3): deliveryStatus/failureReason มีจริงตอน runtime
                // (getMessages ไม่ select เลย คืนทุกคอลัมน์ของ ChatMessage — ดู comment หัวไฟล์)
                const mExt = m as ChatMessageWithDelivery
                // 🛑 (CR 2026-08-23) signal เดียวที่ตัดสินว่าแถวนี้ยังไม่ออกจากระบบเรา — ใช้ทุกจุดที่
                // ห้ามขึ้น "ส่งแล้ว"/ห้ามตอบกลับ-รีแอ็กชัน. แชท DEEP ไม่มีคิว (deliveryStatus=null เสมอ)
                // ⇒ queued เป็น false เสมอ พฤติกรรมเดิม 100%
                const queued = mine && mExt.deliveryStatus === 'QUEUED'
                // จัดเวลาเป็นกลุ่ม — แสดงเวลาเฉพาะท้าย burst, ไม่ขณะกำลังส่ง, และข้อความล่าสุดซ่อนหลัง 1 นาที
                const atBurstEnd = burstEndIds.has(m.id)
                const isLastOld = m.id === lastMsgId && lastMsgIsOld
                const showTime = atBurstEnd && m._status !== 'sending' && !queued && !isLastOld
                // ── ส่งไม่สำเร็จ (user สั่ง 2026-08-02) ─────────────────────────────────
                // รวม 2 เส้นทางให้เป็นสถานะเดียวกันในสายตาผู้ขาย เพราะสำหรับเขามันคือเรื่อง
                // เดียวกัน ("ข้อความนี้ไม่ถึงลูกค้า") ต่างกันแค่ว่าพลาดตรงไหน:
                //   - deliveryStatus='FAILED' = บันทึกลง DB แล้ว แต่ Meta ปฏิเสธ (มีเหตุผลให้ดู)
                //   - _status='failed'        = บับเบิล optimistic ที่ยังไม่เคยถึง server ของเรา
                const failedPersisted = mExt.deliveryStatus === 'FAILED'
                const failed = mine && (failedPersisted || m._status === 'failed')
                // 🛑 ส่ง commentOriginNoInbound เข้าไปด้วยเสมอ — เธรดที่มาจากการตอบคอมเมนต์และ
                // ลูกค้ายังไม่เคยพิมพ์กลับ ติดเพดาน "ตอบได้ข้อความเดียว" ของ Meta ไม่ใช่หน้าต่าง
                // 24 ชม. ถ้าไม่ส่งบริบทนี้ไป ผู้ขายจะได้อ่านว่า "เกินเวลา… นับจากลูกค้าทักล่าสุด"
                // ในเธรดที่ไม่มี "ข้อความล่าสุดของลูกค้า" อยู่เลย (impeccable critique 2026-08-09 P0)
                // 🛑 ส่ง `channel` ไปด้วย (clarify 2026-08-23 P0-2) — `CHANNEL_NOT_ACTIVE` เกิดได้
                // ทั้งฝั่ง Meta และ LINE ถ้าไม่บอกช่องทาง ผู้ขาย LINE จะถูกสั่งให้ไปเชื่อม
                // Facebook Page ซึ่งไม่มีอยู่ในบัญชีของเขาเลย
                const failDetail = failedPersisted
                  ? describeSendFailure(mExt.failureReason, {
                      commentOriginNoInbound: isCommentReplyThread && neverInbound,
                      channel: resolveChatChannel(channel),
                    })
                  : null
                // ฝั่ง optimistic เคยไม่มีเหตุผลให้ดู (เห็นแต่ toast ตอนกดส่ง) — แต่ toast หายเองใน
                // ไม่กี่วินาที เหลือบับเบิลแดงที่ไม่บอกว่าทำไม. ตั้งแต่เลิกล็อกช่องพิมพ์ตามหน้าต่าง
                // 24 ชม. (2026-08-03) บับเบิลล้มเหลวเกิดถี่ขึ้นมาก เหตุผลจึงต้องอยู่ติดข้อความถาวร
                // เท่ากันทั้งสองเส้นทาง — hook เก็บไว้ที่ `_failReason` ให้แล้ว
                const baseFailReason = failDetail
                  ? failDetail.known && failDetail.metaCode !== null
                    ? `${failDetail.text} (Meta #${failDetail.metaCode})`
                    : failDetail.text
                  : stripSendFailurePrefix(m._failReason)
                // หมายเหตุประจำชุด (ux 2026-08-05): ใบนี้พังแต่ใบอื่นในชุดเดียวกันถึงลูกค้าแล้ว —
                // ต่อท้ายเหตุผลเสมอไม่ว่าเหตุผลจะมาจาก server (failDetail) หรือ client (_failReason)
                // เพราะสิ่งที่กันคือผู้ขายไปเลือกรูปส่งใหม่ทั้งชุดเองที่ composer = ลูกค้าได้รูปซ้ำ
                const failReason = m._batchNote
                  ? baseFailReason
                    ? `${baseFailReason} — ${m._batchNote}`
                    : m._batchNote
                  : baseFailReason
                // ส่งซ้ำได้เฉพาะชนิดที่ประกอบ payload กลับได้ครบจากแถวที่เก็บไว้: TEXT ใช้ body,
                // ไฟล์แนบทุกชนิดใช้ imageUrl (=fileId ที่ยังอยู่ใน storage — คอลัมน์เดียวกันหมดทั้ง
                // IMAGE/VIDEO/AUDIO/FILE). ORDER เก็บแต่ orderRefToken ส่วนข้อความลิงก์ที่ยิงจริง
                // ประกอบขึ้นตอนส่งและไม่ได้เก็บไว้ → ต้องส่งการ์ดใหม่จากออเดอร์
                //
                // 2026-08-03: เดิมเช็คแค่ TEXT/IMAGE ทำให้ VIDEO/AUDIO/FILE ที่ล้มเหลวไม่มีปุ่มส่งใหม่
                // เลย ทั้งที่ resendMessage/OutgoingRetry รองรับครบ 4 ชนิดอยู่แล้ว — ร้านต้องแนบไฟล์
                // ใหม่จากศูนย์ทุกครั้ง ซึ่งเจ็บขึ้นมากหลังเลิกล็อกช่องพิมพ์ (ล้มเหลวบ่อยขึ้น)
                const retryAttachment =
                  (m.type === 'IMAGE' || m.type === 'VIDEO' || m.type === 'AUDIO' || m.type === 'FILE') &&
                  !!m.imageUrl
                // (2026-08-10) "กดซ้ำมีผลไหม" เป็นความจริงของ *เหตุผล* ไม่ใช่ของ *ชนิดข้อความ* —
                // resolve จากแหล่งที่ถูกต้องตามเส้นทาง: persisted อ่านจาก describeSendFailure ตัวเดียวกับ
                // ที่คำนวณ failDetail ข้างบน (Meta ทุก rule ยัง retryable=true เหมือนเดิม — ไม่แตะพฤติกรรม
                // Meta), optimistic อ่านจาก `_retryable` ที่ hook เซ็ตจาก JSON ของ POST (ไม่รู้ = true
                // ค่าเดิมของทุกเหตุก่อน 2026-08-10). ตัวตัดสินจริงอยู่ใน canRetryFailedMessage (pure fn)
                const retryable = failDetail ? failDetail.retryable : (m._retryable ?? true)
                const canRetryFailed = canRetryFailedMessage({
                  failedPersisted,
                  messageType: m.type,
                  hasTextBody: !!m.body?.trim(),
                  hasRetryableAttachment: retryAttachment,
                  hasOptimisticRetryPayload: !!m._retry,
                  retryable,
                })
                /**
                 * 🛑 ด่านความตั้งใจก่อนส่งซ้ำ — **เฉพาะแถวที่ "ยิงไปแล้วแต่ไม่รู้ผล"** เท่านั้น
                 * (fix round 2 ของ /impeccable clarify) แถว FAILED อื่นคือเคสที่ปลายทางปฏิเสธ
                 * = เรารู้แน่ว่าไม่ถึง ⇒ กดลองใหม่ได้ทันทีเหมือนเดิม ห้ามเพิ่มขั้นตอนให้
                 *
                 * เกณฑ์อยู่ใน `needsUncertainSendConfirm` (ฟังก์ชันบริสุทธิ์ + เทส [blocker] +
                 * พิสูจน์ด้วย mutation) ไม่ใช่เทอร์นารีในนี้ — ui-boolean-needs-a-testable-home.md
                 */
                const retryFailed = async () => {
                  if (needsUncertainSendConfirm(mExt.failureReason)) {
                    const ok = await pacesConfirm.warning(
                      UNCERTAIN_RESEND_CONFIRM.title,
                      UNCERTAIN_RESEND_CONFIRM.text,
                      {
                        confirmButtonText: UNCERTAIN_RESEND_CONFIRM.confirmButtonText,
                        cancelButtonText: UNCERTAIN_RESEND_CONFIRM.cancelButtonText,
                        // ทางที่ปลอดภัยคือ "ยังไม่ส่ง" ⇒ Enter ที่ค้างมาจากช่องพิมพ์ต้องไม่ยืนยันให้เอง
                        focusCancel: true,
                      },
                    )
                    if (!ok) return
                  }
                  if (failedPersisted) {
                    resendMessage({
                      type: retryAttachment ? (m.type as 'IMAGE' | 'VIDEO' | 'AUDIO' | 'FILE') : 'TEXT',
                      body: m.body,
                      ...(retryAttachment ? { imageUrl: m.imageUrl! } : {}),
                    })
                    // เอาแถวเดิมออกด้วย (user report 2026-08-03: "กดลองใหม่แล้วทำไมอันบนไม่หายไป")
                    //
                    // เดิมตั้งใจให้ append-only — แถวที่ยิงไม่ออกคือเหตุการณ์จริงที่ควรเห็น แต่ผลคือ
                    // ข้อความเดียวกันค้างเป็นบับเบิลแดง 2 อันซ้อน (และเป็น N อันถ้ากดหลายรอบ) ซึ่ง
                    // ไม่ตรงกับสิ่งที่คำว่า "ลองใหม่" สื่อ และไม่ตรงกับอีกเส้นทางของปุ่มเดียวกัน
                    // (`retryMessage` ของบับเบิล optimistic แทนที่ในตัวมาตลอด)
                    //
                    // เหตุผล "append-only" ที่เคยเขียนไว้หมดอายุไปแล้วตั้งแต่มีปุ่ม "ยกเลิก" ซึ่งลบแถว
                    // FAILED ทิ้งจริงผ่าน DELETE endpoint เดียวกันนี้ — ลบตอนยกเลิกได้ ก็ลบตอนลองใหม่ได้
                    void cancelMessage(m.id)
                  } else if (m._retry) {
                    retryMessage(m.id, m._retry)
                  }
                }
                // ถามยืนยันก่อน: เนื้อความหายถาวร กู้ไม่ได้ (undo ทำไม่ได้เพราะแถวถูกลบจริง)
                //
                // ข้อความยืนยันแยก 2 กรณี (ux 2026-08-05): ประโยค "ลูกค้าไม่เคยได้รับข้อความนี้อยู่แล้ว"
                // เขียนไว้สมัยที่ failed = "ยังไม่ถึง server" เสมอ — พอมีเคสเน็ตหลุดหลังกดส่ง (_ambiguous)
                // ประโยคนี้อาจเป็นเท็จ (บางใบอาจถึงลูกค้าไปแล้วจริง) ห้ามยืนยันสิ่งที่ระบบไม่รู้
                const cancelFailed = async () => {
                  const r = await Swal.fire({
                    buttonsStyling: false,
                    icon: 'warning',
                    title: 'ยกเลิกการส่งข้อความนี้?',
                    text: m._ambiguous
                      ? 'ยังไม่แน่ใจว่าข้อความนี้ถึงลูกค้าแล้วหรือยัง — ถ้ายกเลิกตอนนี้ ระบบจะไม่ลองส่งซ้ำให้อีก'
                      : 'ข้อความจะหายไปจากห้องแชทและกู้คืนไม่ได้ — ลูกค้าไม่เคยได้รับข้อความนี้อยู่แล้ว',
                    showCancelButton: true,
                    confirmButtonText: 'ยกเลิกการส่ง',
                    cancelButtonText: 'เก็บไว้ก่อน',
                    customClass: {
                      confirmButton: 'btn bg-danger text-white hover:bg-danger-hover mt-2 me-2',
                      cancelButton: 'btn bg-light hover:text-default-800 mt-2',
                    },
                  })
                  if (r.isConfirmed) await cancelMessage(m.id)
                }
                // ปุ่มคัดลอกข้อความ — โผล่ตอน hover เฉพาะ desktop (lg:group-hover) และเฉพาะข้อความที่มี text
                // (user request 2026-07-24) วางข้างบับเบิล: ฝั่งเรา=ซ้าย, ฝั่งลูกค้า=ขวา
                const copyBtn = m.body ? <CopyMessageButton text={m.body} /> : null
                // action cluster (hover) — ตอบกลับ (ทุกชนิด) + คัดลอก (เฉพาะข้อความมี text). ตอบกลับไม่ได้ถ้า:
                // ข้อความถูกลบ, หรือยังเป็น optimistic (id ยังไม่ใช่ uuid จริง — route.replyToMessageId ต้องเป็น uuid)
                // 🛑 !queued (CR 2026-08-23): แถวที่ยังอยู่ในคิวมี uuid จริงแล้ว แต่ยังไม่มี mid ของ
                // ช่องทางให้ผูก reply_to — ครอบทั้ง ReplyMessageButton และ ReactMessageButton
                // ด้านล่างเพราะ gate ด้วยตัวแปรเดียวกันอยู่แล้ว
                const canReply = !m.isDeleted && !m._status && !m.id.startsWith('local-') && !queued
                /**
                 * feature 00048 — ปุ่ม "เก็บเข้าคลัง" ฝั่งเดสก์ท็อป (ทางเข้าที่ 2 จาก 3)
                 * เงื่อนไขมาจาก isLibraryEligible ตัวเดียวกับเมนูกดค้างของมือถือ — ห้ามคัดลอก
                 * เงื่อนไขมาเขียนซ้ำ ไม่งั้นสองทางเข้าจะเพี้ยนกันโดยไม่มีอะไรฟ้อง
                 *
                 * (CR 2026-08-23) **ไม่ gate ด้วย !queued โดยตั้งใจ** — เก็บเข้าคลังอ้าง `imageUrl`
                 * (fileId ของเราเอง) ไม่ใช่ mid ของช่องทาง จึงใช้ได้ทันทีแม้แถวยังอยู่ในคิว
                 * เหตุผลเดียวกับที่ order / save-to-library / record-payment / copy ในเมนูกดค้างไม่ถูก gate
                 */
                const libEligible =
                  isLibraryEligible({
                    type: m.type,
                    isSticker: m.isSticker,
                    fromCard: false,
                    hasFile: Boolean(m.imageUrl),
                    storageKey: m.imageUrl,
                  }) &&
                  !m.isDeleted &&
                  !m._status &&
                  !m.id.startsWith('local-')
                const libBtn = libEligible ? (
                  <SaveToLibraryButton
                    saved={Boolean(m.imageUrl && savedFiles.has(m.imageUrl))}
                    busy={savingFileId === m.imageUrl}
                    onToggle={() => void toggleLibrary(m)}
                  />
                ) : null
                const actionCluster =
                  canReply || copyBtn || libBtn ? (
                    // ปุ่มตอบกลับ + คัดลอก เรียง "ข้างกัน" (user 2026-07-25) ไม่ใช่บน-ล่าง
                    <div className="flex items-start gap-0.5">
                      {canReply && <ReplyMessageButton onReply={() => setReplyingTo(m)} />}
                      {libBtn}
                      {copyBtn}
                      {/* รีแอ็กชัน (user 2026-08-03) — เงื่อนไขเดียวกับ canReply: ต้องเป็นข้อความจริง
                          ที่ถึง Meta แล้ว ไม่งั้นไม่มี mid ให้ผูก. y = ขอบบนของปุ่ม ให้แผงเด้งเหนือปุ่ม */}
                      {canReply && (
                        <ReactMessageButton
                          onOpen={(rect) =>
                            setActionTarget({
                              mode: 'reactions',
                              message: m,
                              x: rect.left + rect.width / 2,
                              y: rect.top,
                            })
                          }
                        />
                      )}
                      {/* สร้างคำสั่งซื้อจากข้อความนี้ (user 2026-08-04) — เงื่อนไขเดียวกับปุ่มในเมนู
                          กดค้างของมือถือ: เฉพาะข้อความที่มีตัวอักษร (รูป/การ์ดไม่มีอะไรให้กระจาย) */}
                      {m.body?.trim() && (
                        <CreateOrderFromMessageButton
                          onCreate={() =>
                            openDraft({
                              conversationId,
                              customerName: buyerName,
                              channel,
                              customerAvatar: buyerAvatar,
                              pageAvatarUrl: channelAvatarUrl,
                              prefillText: m.body!,
                              // feature 00033 — เวลาของข้อความนี้ ใช้เป็นวันที่สั่งซื้อ
                              messageCreatedAt: new Date(m.createdAt).toISOString(),
                            })
                          }
                        />
                      )}
                    </div>
                  ) : null
                // ข้อความ "ระบบ" ที่ Facebook แทรกเองในเธรด (user report 2026-07-30) — เช่น
                // "คุณกำลังตอบกลับความคิดเห็น...ดูความคิดเห็น(url)" หรือ "<ชื่อ> replied to an ad."
                // Meta ส่งมาในนามเพจ ถ้า render เป็นบับเบิลปกติจะเข้าใจผิดว่าแอดมินพิมพ์เอง
                // (user: "ทำให้เข้าใจผิดว่าคนพิมพ์") + URL ดิบยาวเต็มจอ
                // → บรรทัดกลางจอสีจางแบบ Messenger ตามรูปที่ user ส่งมา ไม่ใช่บับเบิล
                // เพิ่ม parseMetaAiHandoffNotice (feature "Meta AI ถือสิทธิ์คุมเธรด" 2026-08-08) —
                // ข้อความสลับสิทธิ์คุมเธรด AI↔คน คนละชุดสตริงกับ parseMetaSystemNotice เดิม แต่
                // shape MetaSystemNotice เดียวกัน JSX ด้านล่างจึง render ได้โดยไม่ต้องแก้
                // การ์ดสินค้าแบบ carousel (m.cards) ก็ขึ้นต้น body ด้วย CARD_PREFIX เหมือนกัน (คงไว้
                // ตามสเปก — ปุ่มคัดลอก/ตอบกลับผูกกับ body) แต่ต้อง**ไม่**ตกไปเป็นบรรทัดระบบกลางจอ
                // แบบเดิมอีกต่อไป — ต้องแสดงเป็นการ์ดเลื่อนในบับเบิลปกติ (ชิดขวา/ซ้ายตามผู้ส่งจริง)
                // เธรดเก่าที่ไม่มี cards ยังตกไปทางเดิมทุกประการ (ไม่มีอะไรเปลี่ยนสำหรับแถวเก่า)
                const hasGenericCards = !!m.cards && m.cards.length > 0
                // 🛑 การ์ดคำขอชำระเงินก็ต้องชนะบรรทัดระบบเช่นกัน (user report 2026-08-09) —
                // อาการเดียวกับ carousel ข้างบนเป๊ะ แค่คนละชนิดการ์ด: parseMetaSystemNotice
                // จับคำนำหน้า "[การ์ดจาก Facebook]" ของการ์ด **ทุกชนิด** แล้ว early-return ตรงนี้
                // ก่อนโค้ดจะไปถึง metaOrder ด้านล่าง → การ์ดยอดเงินที่เข้ามาทางเส้น Graph sync
                // (ซึ่งเติมคำนำหน้าเสมอ) จึงขึ้นเป็นข้อความดิบ "[การ์ดจาก Facebook] ฿360.00
                // order — Waiting for payment" กลางจอ
                // การ์ดชนิดอื่น (โทร/ปุ่ม) ยังตกไปเป็นบรรทัดระบบตามเดิม เพราะ parseMetaOrderCard
                // แคบเฉพาะรูป "฿N order" เท่านั้น
                const isMetaOrderCard = m.type === 'TEXT' && !!parseMetaOrderCard(m.body)
                const systemNotice =
                  m.type === 'TEXT' && !hasGenericCards && !isMetaOrderCard
                    ? (parseMetaSystemNotice(m.body) ?? parseMetaAiHandoffNotice(m.body))
                    : null
                if (systemNotice) {
                  return (
                    <div key={m.id} className="my-5 px-4 text-center">
                      <p className="text-default-600 mb-0 text-xs">
                        {systemNotice.text}
                        {systemNotice.url && (
                          <>
                            {' '}
                            <a
                              href={systemNotice.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-primary font-medium hover:underline"
                            >
                              {systemNotice.linkLabel}
                            </a>
                          </>
                        )}
                      </p>
                    </div>
                  )
                }
                return (
                  // Base ChatPage.tsx:64/79 — `my-5 flex items-start gap-2.5` (+ justify-end ฝั่งตัวเอง)
                  // data-message-id: ให้ตัวจับ "กดค้าง" ที่ระดับ container หาได้ว่านิ้วอยู่บนข้อความไหน
                  // (hook เรียกในลูปไม่ได้ จึงมี useLongPress ตัวเดียวแล้ว resolve ย้อนกลับจาก DOM)
                  //
                  // 🛑 (CR 2026-08-23) ห้ามสลับลำดับ flex item — `actionCluster` ต้องมา **ก่อน** บับเบิล
                  // เสมอ และห้ามถอด `justify-end`: ด้วย justify-content:flex-end ขอบซ้ายของ item สุดท้าย
                  // = containerWidth − bubbleWidth **ไม่มีพจน์ของความกว้าง actionCluster อยู่ในสมการ**
                  // นั่นคือเหตุผลเดียวที่บับเบิลไม่ขยับตอนปุ่มโผล่/หาย (ทั้งตอน hover และตอน canReply
                  // พลิกเพราะแถวเปลี่ยนจาก QUEUED เป็น SENT) — ไม่ได้มี min-w/skeleton กันไว้เลย
                  // ถ้ารื้อโครงนี้ (เช่นย้าย avatar เข้ามาปนในแถวระดับนี้ หรือสลับให้บับเบิลมาก่อน)
                  // บับเบิลจะกระตุกทุกครั้งที่ปุ่มโผล่/หาย **โดยไม่มี type error หรือเทสตัวไหนฟ้อง**
                  <div
                    key={m.id}
                    data-message-id={m.id}
                    className={`group my-5 flex items-start gap-2.5 ${mine ? 'justify-end' : ''}`}
                  >
                    {!mine && <ChatAvatar avatar={buyerAvatar} name={buyerName} />}
                    {mine && actionCluster}
                    {/* feature 00018 T4 (ภาคผนวก A-3): เดิม Base ไม่ใส่ max-w บนคอลัมน์นี้เลย ทำให้
                        ข้อความยาว (auto-reply) ดันเต็มบรรทัด — ห้ามใส่ percent bracket (ผิด HR7 ตาม
                        comment เดิมของไฟล์นี้) จึงใช้ Tailwind scale class มาตรฐาน (ไม่ใช่ bracket)
                        max-w-96 (24rem) — precedent scale class เดียวกับ InboxList.tsx max-w-52 และ
                        max-w-60 ที่บรรทัด IMAGE ด้านล่างในไฟล์นี้เอง; min-w-0 กัน flex item ไม่ยอม shrink,
                        break-words กันคำ/ลิงก์ยาวล้นกรอบ */}
                    {/* relative: จุดยึดของป้าย "ระบบตอบ" ที่เกยขอบบนบับเบิล (feature 00023 S-23) */}
                    {/* data-message-bubble: จุดที่ MessageActionBubble โคลนไปลอยเหนือฉากเบลอตอน
                        กดค้าง — ต้องอยู่ที่คอลัมน์นี้ (ไม่ใช่แถวด้านนอกที่กว้างเต็มบรรทัด) เพราะ
                        ที่ผู้ใช้ "เพ่ง" คือเนื้อข้อความ + quote + ป้ายระบบตอบ ไม่ใช่ avatar/ปุ่ม hover */}
                    {/* R23: ไม่มี title ที่ระดับบับเบิล — ลูกที่กดได้ (ป้าย DeepBot/รูป/การ์ด/quote/ยกเลิก)
                        จะรับ tooltip ไปซ้อน popover · เวลาเต็มอยู่ที่ <p> ของเนื้อข้อความ + แถวเวลา + sr-only */}
                    <div
                      data-message-bubble
                      className={`relative min-w-0 max-w-96 break-words ${highlightClass(m.id)}`}
                    >
                      {/* ป้ายลอยเกยขอบบนมีช่องเดียว — ป้ายบอทของเราชนะเสมอถ้าเกิดพร้อมกัน
                          ป้าย Meta AI เป็น span ไม่ใช่ปุ่ม: ไม่มีข้อมูลเงื่อนไขของ Meta ให้เปิดดู */}
                      {mExt.autoReplyKind ? (
                        <AutoReplyTag isTest={mExt.autoReplyKind === 'AUTO_TEST'} trace={m.autoReply ?? null} />
                      ) : channel === 'MESSENGER' && metaAiMessageIds.has(m.id) ? (
                        <span
                          title={t.inbox.metaAiBadgeExplain}
                          className="border-default-300 bg-card text-default-700 absolute top-0 end-2.5 z-20 inline-flex -translate-y-1/2 items-center gap-1 rounded-full border px-2 py-0.5 text-2xs font-medium whitespace-nowrap shadow"
                        >
                          <Icon icon="brand-meta" className="text-xs" aria-hidden="true" />
                          <span aria-hidden="true">{t.inbox.metaAiBadge}</span>
                          <span className="sr-only">{t.inbox.metaAiBadgeExplain}</span>
                        </span>
                      ) : null}
                      {/* reply quote (feature 00018 Phase 3) — กล่องจาง ๆ เยื้องเหนือบับเบิล ให้เห็นชัดว่าเป็น
                          quote คนละก้อนกับข้อความตอบ (user report 2026-07-25: ดูยาก) */}
                      {mExt.replyTo && (
                        <div className={`mb-1 flex ${mine ? 'justify-end' : 'justify-start'}`}>
                          {/* กดได้เมื่อรู้ปลายทาง (`id`) — quote ของข้อความเก่าก่อนระบบเก็บ id หรือบับเบิล
                              optimistic ที่ปลายทางยังเป็น local id จะไม่มี affordance ให้กด แทนที่จะมี
                              ปุ่มที่กดแล้วไม่เกิดอะไร (ห้ามสร้าง affordance ปลอม — precedent เดียวกับ
                              รูปที่ mirror ไม่สำเร็จในไฟล์นี้ที่ไม่ใส่ cursor-zoom-in) */}
                          {(() => {
                            const quote = mExt.replyTo!
                            const quoteTargetId = quoteJumpTargetId(quote.id)
                            const shellClass =
                              'border-default-300 bg-default-100/70 max-w-full rounded-lg border-s-2 px-2.5 py-1 text-start'
                            const inner = (
                              <>
                                <p className="text-default-700 mb-0 text-2xs font-medium">
                                  {fmt(t.inbox.quotedReplyTo, { name: quote.senderRole === 'SHOP' ? t.inbox.quotedShopMessage : buyerName })}
                                </p>
                                {/* รูปย่อแทนคำว่า "[รูปภาพ]" — ในเธรดที่ลูกค้าส่งรูปติดกันหลายใบ ข้อความนั้น
                                    บอกไม่ได้เลยว่าหมายถึงใบไหน (user เทียบกับ Messenger ที่แสดงรูปย่อ)
                                    object-cover เพราะเป็นภาพ "จำได้ว่าใบไหน" ไม่ใช่ภาพที่ต้องเห็นครบเฟรม */}
                                {quote.imageUrl ? (
                                  <span className="mt-0.5 flex items-center gap-1.5">
                                    <img
                                      src={mediaSrc(quote.imageUrl)}
                                      alt=""
                                      aria-hidden="true"
                                      className="bg-default-200 size-10 shrink-0 rounded object-cover"
                                    />
                                    {/* caption ของรูป (ถ้ามี) — รูปเปล่าไม่ต้องมีคำว่า "[รูปภาพ]" ซ้ำกับรูปที่เห็นอยู่ */}
                                    {quote.body && quote.body !== '[รูปภาพ]' && (
                                      <span className="text-default-700 line-clamp-2 min-w-0 text-xs opacity-90">
                                        {quote.body}
                                      </span>
                                    )}
                                  </span>
                                ) : (
                                  <p className="text-default-700 mb-0 line-clamp-2 text-xs opacity-90">
                                    {quote.body ?? '[สื่อ/ไฟล์แนบ]'}
                                  </p>
                                )}
                                {/* bugfix 2026-08-10 — quotable=false: ข้อความเป้าหมายไม่มี quoteToken (ข้อความ
                                    เก่าก่อนระบบเก็บ token/สื่อที่ LINE ไม่คืน token ให้) จึงถอยไปส่งแบบไม่อ้างอิง
                                    (ส่งได้ตามปกติ ไม่ใช่ error) — เดิมถอยเงียบสนิท ผู้ขายเห็นกล่อง quote นี้แล้ว
                                    เข้าใจว่าลูกค้าเห็นแบบเดียวกัน ทั้งที่ในแอป LINE มาเป็นข้อความธรรมดา
                                    Base: theme/paces .../ChatPage.tsx:72-74 (icon+text meta line, text-xs) —
                                    ตัดสินด้วย shouldWarnQuoteUnavailable (lib/chat-quote-availability.ts) ไม่ใช่
                                    เทอร์นารีตรงนี้ (docs/conventions/ui-boolean-needs-a-testable-home.md) */}
                                {shouldWarnQuoteUnavailable({ channel, quotable: quote.quotable, carrierIsShop: mine }) && (
                                  <p className="text-default-500 mb-0 mt-1 flex items-center gap-1 text-xs">
                                    <Icon icon="info-circle" className="text-xs" aria-hidden="true" />
                                    ลูกค้าไม่เห็นว่าข้อความนี้ตอบข้อความไหน
                                  </p>
                                )}
                              </>
                            )
                            return quoteTargetId ? (
                              <button
                                type="button"
                                onClick={() => jumpToMessage(quoteTargetId)}
                                aria-label="ไปที่ข้อความที่ถูกอ้างถึง"
                                className={`${shellClass} hover:bg-default-200 cursor-pointer`}
                              >
                                {inner}
                              </button>
                            ) : (
                              <div className={shellClass}>{inner}</div>
                            )
                          })()}
                        </div>
                      )}
                      {/* รูปล้วน (IMAGE ไม่มี caption เช่น sticker/thumbs-up) → ไม่มีกรอบ bubble/bg/padding
                          user: "ทำไมถึงมี border อยากให้เป็น icon ไม่ต้องมี background" — รูป/สติกเกอร์
                          มีสี+รูปทรงในตัวอยู่แล้ว กรอบทำให้ดูเป็นกล่องรูป; รูปที่มี caption หรือ text/
                          PRODUCT ยังคงกรอบ bubble ไว้ (bg-light คงที่สำหรับ PRODUCT ตาม BR-CTX-05) */}
                      {(() => {
                        // unsend (Phase 3): ผู้ส่งลบข้อความ → แสดง "ข้อความถูกลบ" จาง ๆ แทนเนื้อหา (ที่ถูกล้างแล้ว)
                        if (m.isDeleted) {
                          return (
                            <div className={`rounded px-6 py-3 ${mine ? 'bg-primary/15' : 'bg-light'}`}>
                              <p className="text-default-700 mb-0 flex items-center gap-1 text-sm italic">
                                <Icon icon="ban" className="text-sm" />
                                ข้อความถูกลบ
                              </p>
                            </div>
                          )
                        }
                        // รูป/วิดีโอล้วน (ไม่มี caption) → ไม่มีกรอบ bubble (มีสี+รูปทรงในตัว); เสียง/ไฟล์คงกรอบ
                        // ORDER = การ์ด self-contained เช่นกัน (มีกรอบ/สีในตัว) → ไม่ต้องกรอบ bubble ครอบ
                        // การ์ดคำขอชำระเงินของ Meta มาเป็น TEXT "฿400.00 order" — self-contained เหมือน ORDER
                        const metaOrder = m.type === 'TEXT' ? parseMetaOrderCard(m.body) : null
                        // การ์ดสินค้าแบบ carousel จาก Facebook (2026-08-09) — self-contained เหมือน
                        // ORDER/metaOrder (มีกรอบ/สีในตัวการ์ดแต่ละใบแล้ว) ไม่ต้องกรอบ bubble ครอบซ้ำ
                        const genericCards = hasGenericCards ? m.cards! : null
                        // การ์ดสินค้าหลายชิ้น (ส่วนขยาย 2026-08-11) — มีตั้งแต่ 2 ใบขึ้นไปเท่านั้น
                        // ใบเดียวยังเป็น ProductCardBubble เดิมทุกประการ (ไม่มี "carousel ใบเดียว"
                        // ให้ผู้ขายงงว่าทำไมบางทีมีลูกศรเลื่อนบางทีไม่มี)
                        const ownProductCards =
                          m.type === 'PRODUCT' && (m.productCards?.length ?? 0) > 1 ? m.productCards! : null
                        // 🛑 ย้ายการตัดสินไปเป็นฟังก์ชันบริสุทธิ์ (2026-08-11) — เดิมเป็น OR ห้าก้อน
                        // คาไว้ตรงนี้ ซึ่ง "ลืมเคส" ได้โดยไม่มีอะไรฟ้อง (การ์ดสินค้าใบเดียวตกหล่นมา
                        // ตั้งแต่วันแรกจนโดนครอบกรอบซ้ำ) ดู src/lib/chat-bubble-frame.ts + เทส [blocker]
                        const bareImage = isSelfContainedBubble({
                          type: m.type,
                          hasBody: !!m.body,
                          hasImageUrl: !!m.imageUrl,
                          isMetaOrderCard: !!metaOrder,
                          hasGenericCards: !!genericCards,
                          productCardsCount: m.productCards?.length ?? 0,
                          hasResolvedSoloCard: !!m.productCard,
                        })
                        return (
                          <div className={bareImage ? '' : `rounded px-6 py-3 ${m.type === 'PRODUCT' ? 'bg-light' : mine ? 'bg-primary text-white' : 'bg-light'}`}>
                        {m.type === 'ORDER' ? (
                          <OrderCardBubble card={m.orderCard ?? null} onEdit={openEditOrder} />
                        ) : metaOrder ? (
                          <MetaOrderCardBubble amount={metaOrder.amount} status={metaOrder.status} />
                        ) : genericCards ? (
                          <MetaGenericCardCarousel
                            cards={genericCards}
                            messageId={m.id}
                            onOpenImage={(i) => openSlide(`${m.id}:${i}`)}
                          />
                        ) : ownProductCards ? (
                          <OwnProductCardCarousel cards={ownProductCards} username={shopUsername} messageId={m.id} />
                        ) : m.type === 'PRODUCT' ? (
                          <ProductCardBubble card={m.productCard ?? null} username={shopUsername} />
                        ) : (
                          <>
                            {m.type === 'IMAGE' && m.imageUrl && (
                              <ChatImageMessage
                                storageKey={m.imageUrl}
                                isStickerHint={m.isSticker}
                                imageWidth={m.imageWidth}
                                imageHeight={m.imageHeight}
                                onOpen={() => openSlide(m.id)}
                              />
                            )}
                            {/* feature 00018 — ไฟล์แนบช่องทางนอก (วิดีโอ/เสียง/ไฟล์) mirror มาแล้ว serve ผ่าน /api/files */}
                            {m.type === 'VIDEO' && m.imageUrl && (
                              <>
                                <video src={mediaSrc(m.imageUrl)} controls className="chat-media max-w-60 rounded" />
                                <MediaDownloadLink storageKey={m.imageUrl} label="บันทึกวิดีโอ" attachmentName={m.attachmentName} />
                              </>
                            )}
                            {m.type === 'AUDIO' && m.imageUrl && (
                              <>
                                <audio src={mediaSrc(m.imageUrl)} controls className="max-w-60" />
                                <MediaDownloadLink storageKey={m.imageUrl} label="บันทึกไฟล์เสียง" attachmentName={m.attachmentName} />
                              </>
                            )}
                            {/* บับเบิลไฟล์ — เดิมเป็นลิงก์ "เปิดไฟล์แนบ" ตายตัว ซึ่งบอกไม่ได้เลยว่าเป็นไฟล์อะไร
                                ตอนที่ไฟล์แนบมีแต่ของที่ mirror มาจาก Meta (ไม่มีชื่อ) ยังพอรับได้ แต่พอร้าน
                                ส่งเอกสารเองได้แล้ว "ใบเสนอราคา-สมชาย.pdf · 1.2 MB" คือข้อมูลที่ต้องเห็น */}
                            {m.type === 'FILE' && m.imageUrl && (
                              <a
                                href={`/api/files/${m.imageUrl}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className={`flex max-w-60 items-center gap-2.5 rounded-lg border p-2.5 ${
                                  mine ? 'border-white/30 bg-white/10' : 'border-default-300 bg-default-50'
                                }`}
                              >
                                <span
                                  className={`flex size-9 shrink-0 items-center justify-center rounded-lg ${
                                    mine ? 'bg-white/20 text-white' : ATTACHMENT_ICON.FILE.cls
                                  }`}
                                >
                                  <Icon icon={ATTACHMENT_ICON.FILE.icon} className="text-lg" />
                                </span>
                                <span className="min-w-0">
                                  <span className={`block truncate text-sm font-medium ${mine ? 'text-white' : 'text-default-800'}`}>
                                    {attachmentDisplayName(m.imageUrl, m.attachmentName)}
                                  </span>
                                  <span className={`mt-0.5 block text-xs ${mine ? 'text-white/75' : 'text-default-700'}`}>
                                    {[formatAttachmentSize(m.attachmentSize), 'เปิดไฟล์'].filter(Boolean).join(' · ')}
                                  </span>
                                </span>
                              </a>
                            )}
                            {m.type === 'FILE' && m.imageUrl && (
                              <MediaDownloadLink storageKey={m.imageUrl} attachmentName={m.attachmentName} />
                            )}
                            {m.body && (
                              // whitespace-pre-wrap: คงการเว้นบรรทัด (\n) ที่ลูกค้า/เพจพิมพ์มา — ไม่งั้น
                              // เบราว์เซอร์ยุบเป็นช่องว่างเดียว เลข list/ย่อหน้าติดกันเป็นพรืดอ่านยาก
                              // (เดียวกับ note ใน CustomerCrmSection ที่ใช้ pattern นี้อยู่แล้ว)
                              <p
                                title={formatDateTimeTH(m.createdAt)}
                                className={`text-sm whitespace-pre-wrap ${mine ? 'text-white' : 'text-default-800'} ${m.type === 'IMAGE' ? 'mt-2' : ''} mb-0`}
                              >
                                {m.body}
                              </p>
                            )}
                            {/* กันบับเบิลว่าง (ข้อมูลเก่า/ข้อความไม่รองรับที่ body ว่าง) — แสดง placeholder จาง ๆ
                                (อยู่ใน branch non-PRODUCT แล้ว จึงเช็คแค่ body/imageUrl ว่าง) */}
                            {!m.body && !m.imageUrl && (
                              <p className="text-default-700 mb-0 text-sm italic">ข้อความไม่รองรับ — เปิดดูใน Messenger</p>
                            )}
                            {/* extension #3 Scam-link Detection (FR-SCAM-04/06) — warning banner เฉพาะ
                                TEXT ที่ flaggedScam=true (BR-SCAM-04 scan เฉพาะ TEXT); WARN เท่านั้น
                                ไม่ block ส่ง (FR-SCAM-05); token bg-warning/15 text-warning (HR7 ไม่ arbitrary) */}
                            {m.type === 'TEXT' && m.flaggedScam && (
                              <div className="bg-warning/15 text-warning mt-2 flex items-start gap-1.5 rounded px-2 py-1 text-2xs">
                                <Icon icon="alert-triangle" className="mt-0.5 shrink-0 text-sm" />
                                <span>ข้อความนี้มีลิงก์ที่ควรระวัง — อย่าโอนเงินหรือให้รหัส OTP กับคนที่ไม่รู้จัก</span>
                              </div>
                            )}
                            {/* feature 00023 — ป้าย "ระบบตอบ" ย้ายออกจากบับเบิลไปเกยขอบบนแล้ว
                                (user 2026-07-31) ดู AutoReplyTag ที่ต้นคอลัมน์ข้อความ */}
                          </>
                        )}
                          </div>
                        )
                      })()}
                      {/* reaction (feature 00018 Phase 2, message_reactions) — emoji ที่ react บนข้อความนี้
                          ชิปเล็ก ๆ เกยขอบล่างบับเบิล (FB-style); ฝั่งเรา justify-end, ฝั่งลูกค้า justify-start

                          withEmojiPresentation: Meta ส่งหัวใจมาเป็น U+2764 เปล่า ๆ ซึ่ง default เป็น
                          "ตัวหนังสือ" เบราว์เซอร์เลยวาดเป็นหัวใจดำเล็ก ๆ ไม่ใช่หัวใจแดงแบบใน Facebook
                          (user report 2026-08-03) — ต้องต่อ VS-16 ให้ก่อน ดู lib/emoji-presentation
                          text-sm + leading-none: ขนาดใกล้ชิปรีแอ็กชันของ Messenger จริง (12px เล็กไป) */}
                      {m.reactionEmoji && (
                        <div className={`-mt-1.5 flex ${mine ? 'justify-end' : 'justify-start'}`}>
                          <span className="bg-card border-default-200 rounded-full border px-1.5 py-1 text-sm leading-none shadow-sm">
                            {withEmojiPresentation(m.reactionEmoji)}
                          </span>
                        </div>
                      )}
                      {/* meta row (user request 2026-07-23): เวลาเป็นกลุ่ม (ท้าย burst, ไม่ทุกข้อความ) +
                          avatar เพจ/ร้าน ย้ายมาอยู่ใต้ข้อความ ขนาดเล็ก (size-5) + สถานะส่ง/อ่าน.
                          กำลังส่ง = ไม่มีเวลา; ข้อความล่าสุดซ่อนเวลาหลังส่งเกิน 1 นาที */}
                      {(showTime ||
                        m.edited || // ป้าย "แก้ไขแล้ว" ต้องโผล่แม้ข้อความนั้นไม่ได้อยู่ท้าย burst (ไม่มีแถวเวลา)
                        (mine &&
                          (atBurstEnd ||
                            m._status === 'sending' ||
                            // (CR 2026-08-23) แถวในคิวต้องมีแถวเมตาเพื่อโชว์ "กำลังส่ง" แม้ไม่ใช่ท้าย burst
                            queued ||
                            failed ||
                            m.id === lastShopMsgId))) && (
                        // 🛑 `m._status === 'sent'` เดิมถูกถอดออกจากก้อนนี้ และ **ห้ามหานิยามถาวรมาแทน**
                        // (เช่น "mine && ไม่ failed && ไม่ sending") — นิยามแบบนั้นเป็นจริง **ตลอดไป**
                        // สำหรับทุกข้อความที่ยืนยันแล้ว ไม่ transient เหมือน `_status` ⇒ แถวเมตาจะโผล่ใต้
                        // *ทุกข้อความ* ในเบิร์สต์ ขัดดีไซน์เดิมที่ให้เวลา/สถานะโชว์เฉพาะท้ายกลุ่ม
                        // `atBurstEnd || m.id === lastShopMsgId` ครอบเคสจริงหมดแล้ว
                        // (เหตุผลเดียวกับที่สาขา else ของเทอร์นารีสถานะข้างล่างถูกถอดทิ้ง — ดู R-23)
                        <div className={`text-default-700 mt-1 flex flex-wrap items-center gap-1.5 text-xs ${mine ? 'justify-end' : ''}`}>
                          {/* ส่งไม่สำเร็จ — อยู่ "หน้าเวลา" (user สั่ง 2026-08-02) แทนกล่องแดงเต็มบรรทัด
                              ใต้บับเบิลแบบเดิม ซึ่งกินพื้นที่เท่าข้อความอีกอันทั้งที่เป็นสถานะของ
                              ข้อความที่อยู่ข้างบนมันเอง. รูปแบบ: [ส่งใหม่] ส่งไม่สำเร็จ (i) | ยกเลิก
                              เหตุผลเต็มย้ายไปอยู่ใน (i) — hover เห็น, แตะได้บนมือถือที่ไม่มี hover */}
                          {failed && (
                            // (F4) gap-2.5 บนมือถือ = 10px > การขยาย hit box ข้างละ 8px ⇒ พื้นที่แตะไม่ทับกัน
                            // (เดิม gap-1 = 4px แต่ขยายข้างละ 12px ⇒ ทับกัน ~20px แตะ "ลองใหม่" ไปโดน (i))
                            <span className="text-danger flex items-center gap-2 lg:gap-1">
                              {/* user สั่ง 2026-08-03: ป้าย "ส่งไม่สำเร็จ" → "ลองใหม่" ให้เป็นคำสั่งที่กดได้
                                  รวมเข้ากับปุ่ม ↻ เป็นชิ้นเดียว (เดิมไอคอนกับคำแยกกัน กดได้แค่ไอคอนเล็ก ๆ)
                                  ยังคง "ส่งไม่สำเร็จ" ไว้เมื่อส่งซ้ำไม่ได้ — เขียน "ลองใหม่" ทั้งที่กดไม่ได้
                                  คือ UI โกหก (เช่น การ์ดออเดอร์ที่ประกอบ payload กลับไม่ได้) */}
                              {canRetryFailed ? (
                                <button
                                  type="button"
                                  onClick={() => void retryFailed()}
                                  title="ส่งข้อความนี้ใหม่"
                                  aria-label="ส่งข้อความนี้ใหม่"
                                  className="hover:bg-danger/10 -mx-1 -my-3.5 flex items-center gap-1 rounded px-1 py-3.5 lg:-m-1 lg:p-1"
                                >
                                  <Icon icon="refresh" className="text-sm" />
                                  ลองใหม่
                                </button>
                              ) : (
                                <span>ส่งไม่สำเร็จ</span>
                              )}
                              {failReason && (
                                <button
                                  type="button"
                                  title={failReason}
                                  aria-label={`สาเหตุ: ${failReason}`}
                                  onClick={() =>
                                    Swal.fire({
                                      buttonsStyling: false,
                                      icon: 'info',
                                      title: 'ส่งข้อความไม่สำเร็จ',
                                      text: failReason,
                                      confirmButtonText: 'เข้าใจแล้ว',
                                      customClass: {
                                        confirmButton: 'btn bg-primary text-white hover:bg-primary-hover mt-2',
                                      },
                                    })
                                  }
                                  /**
                                   * พื้นที่นิ้วเป็น pseudo-element ไม่ใช่ความกว้างจริงของปุ่ม
                                   * (user รายงาน 2026-09-10: "ทำไมตรงนี้มันห่างกัน มันควรติดกันป่ะ")
                                   *
                                   * เดิม `min-w-11` = กล่อง 44px รอบไอคอนที่กว้างแค่ ~13px ⇒ **กิน
                                   * ความกว้างจริงในการจัดวางข้างละ ~15px** แล้วบวก `gap-2` อีก 8px
                                   * ⇒ ห่างจากขีดคั่นราว 23px ดูโดดออกจากปุ่มข้าง ๆ ที่ใช้ท่า
                                   * `-mx-1 px-1` (ขยายพื้นที่กดแล้วดึง layout กลับด้วย margin ติดลบ)
                                   *
                                   * `after:-inset-y-3` → สูง ~45px ครบเกณฑ์ 44px ของ PRODUCT.md
                                   * `after:-inset-x-1` → ขยายข้างละ 4px = **ครึ่งหนึ่งของ `gap-2`
                                   * (8px) พอดี** ⇒ hit box ของปุ่มติดกันมาจรดกันตรงกลางโดยไม่ทับ
                                   * ข้อนี้สำคัญ: คอมเมนต์ด้านบนบันทึกไว้ว่าเคยขยายข้างละ 12px แล้ว
                                   * **แตะ "ลองใหม่" ไปโดน ⓘ** (2026-08-03) ⇒ ห้ามเกินครึ่งของ gap
                                   *
                                   * เดสก์ท็อปไม่ต้องมี (ใช้เมาส์ ชี้ตรงไอคอนได้อยู่แล้ว)
                                   */
                                  className="hover:bg-danger/10 relative flex items-center justify-center rounded p-1 after:absolute after:-inset-x-1 after:-inset-y-3 lg:-m-1 lg:after:hidden"
                                >
                                  <Icon icon="info-circle" className="text-sm" />
                                </button>
                              )}
                              <span className="text-default-300" aria-hidden="true">
                                |
                              </span>
                              <button
                                type="button"
                                onClick={cancelFailed}
                                // คำสั้น (user สั่ง 2026-08-03) — บริบทอยู่ครบแล้วจากบับเบิลที่มันเกาะอยู่
                                // ส่วนคำเต็มยังอยู่ใน aria-label + หัวข้อ Swal ตอนยืนยัน
                                aria-label="ยกเลิกการส่งข้อความนี้"
                                // (P4) เส้นใต้ **ถาวร** ไม่ใช่เฉพาะ hover — มือถือไม่มี hover ⇒ เดิมเป็น
                                // ข้อความเปล่าที่อยู่ห่างจาก "ลองใหม่" แค่หนึ่งนิ้ว ไม่มีอะไรบอกว่ากดได้
                                className="underline decoration-dotted underline-offset-2 -mx-1 -my-3.5 rounded px-1 py-3.5 hover:decoration-solid lg:-m-1 lg:p-1"
                              >
                                ยกเลิก
                              </button>
                            </span>
                          )}
                          {/* ลูกค้าแก้ข้อความนี้ทีหลัง (message_edits, 2026-08-03) — ต้องบอกให้รู้
                              เพราะร้านอาจอ่าน/คุยกับเวอร์ชันก่อนแก้ไปแล้ว (ที่อยู่/จำนวน/เบอร์
                              เปลี่ยนได้ทั้งนั้น) เนื้อความที่แสดงคือของใหม่เสมอ */}
                          {m.edited && <span className="text-default-600">แก้ไขแล้ว</span>}
                          {showTime && (
                            <span className="flex items-center gap-1 whitespace-nowrap" title={formatDateTimeTH(m.createdAt)} aria-hidden="true">
                              <Icon icon="clock" />
                              {formatChatBubbleTime(m.createdAt)}
                            </span>
                          )}
                          {/* !failed: บับเบิลที่ยิงไม่ออกเคยขึ้น "ส่งแล้ว" ควบคู่กับแถบแดง เพราะเงื่อนไข
                              เดิมดูแค่ _status (undefined สำหรับแถวที่บันทึกแล้ว) ไม่ได้ดู deliveryStatus */}
                          {/* บันได 3 ขั้นของข้อความที่ส่งสำเร็จ (2026-08-05):
                                อ่านแล้ว   — ลูกค้าเปิดอ่านจริง (message_reads) เขียวขั้นเดียวในบันไดนี้
                                ได้รับแล้ว — Meta ยืนยันว่าถึงเครื่องลูกค้า (message_deliveries) สีปกติ
                                ส่งแล้ว    — Meta รับคำสั่งแล้ว (ตอบ mid) แต่ยังไม่มีหลักฐานว่าถึง
                              เขียวสงวนไว้ให้ "อ่านแล้ว" ตัวเดียวตาม Verified-Means-Green — "ได้รับแล้ว"
                              เป็นสถานะระหว่างทาง ไม่ใช่สัญญาณความน่าเชื่อถือระดับเดียวกัน (ux 2026-08-05)
                              เธรด Instagram ไม่มีขั้นกลาง (deliveredAtMs=0 เสมอ) ข้ามไปที่อ่านแล้วเลย */}
                          {/* (P5 2026-08-23) บันไดสถานะ + "กำลังส่ง" ย้ายไป ShopDeliveryStatus ซึ่งเป็น
                              SSOT ที่บล็อกอัลบั้มเรียกตัวเดียวกัน — ห้ามเขียนคำสถานะซ้ำที่นี่อีก (HR16)
                              !queued ในกิ่งบันได = การ์ดชั้นสอง (lastShopMsgId ข้าม QUEUED ที่ต้นทางแล้ว)
                              🛑 (R-23) ไม่มีสาขา else ที่ให้เช็คถูกเขียวกับข้อความที่ไม่ใช่ใบล่าสุด —
                              ถอดโดยตั้งใจ ไม่ใช่ลืม: เขียวสงวนไว้ให้สถานะที่ยืนยันแล้วเท่านั้น
                              🛑 **แต่คำอ้างตอนถอดว่า "ผู้ใช้เห็นความเปลี่ยนแปลงเป็นศูนย์" จริงเฉพาะช่องทางนอก**
                              (Messenger/IG/LINE ยังได้บันได 3 ขั้นที่ใบล่าสุดเหมือนเดิม)
                              **แชท DEEP เสียของไปจริง**: `lastShopMsgId` เป็น null เสมอเมื่อไม่ใช่ช่องทางนอก
                              ⇒ DEEP ไม่เคยมีบันไดอยู่แล้ว และเคยพึ่งเช็คถูกชั่วคราวจาก `_status='sent'`
                              เป็นสัญญาณยืนยันการส่งเพียงอย่างเดียว ตอนนี้จึงเหลือ **สปินเนอร์แล้วเงียบ
                              ไม่มีสัญญาณยืนยันเลย** — รู้ตัวแล้ว รอเจ้าของระบบตัดสินว่าจะคืนอะไรให้ DEEP
                              (ห้ามแก้พฤติกรรมเองก่อนได้คำตอบ) */}
                          {mine && (
                            <ShopDeliveryStatus
                              sending={m._status === 'sending' || queued}
                              failed={failed}
                              isLatest={m.id === lastShopMsgId}
                              createdAt={m.createdAt}
                              readAtMs={readAtMs}
                              deliveredAtMs={deliveredAtMs}
                            />
                          )}
                          {/* avatar เพจ/ร้าน = ตัวสุดท้ายของแถวเสมอ (user สั่ง 2026-07-23: "เวลาต้อง
                              อยู่ด้านซ้าย และ icon page อยู่ชิดขวาเสมอ") — แถวนี้ justify-end อยู่แล้ว
                              พอ avatar เป็น child สุดท้ายจึงชิดขอบขวาของคอลัมน์ข้อความ ส่วนเวลา/สถานะ
                              ไหลไปทางซ้ายของมัน (เดิม avatar เป็น child ตัวแรก = ไปอยู่ซ้ายสุดของกลุ่ม) */}
                          {/* ใครเป็นคนตอบ (user สั่ง 2026-08-02) — ร้านที่มีพนักงานหลายคนย้อนดู
                              ไม่ได้เลยว่าใครตอบข้อความไหน เพราะทุกบับเบิลใช้โลโก้เพจเหมือนกันหมด
                                m.sender มีค่า  → รูปคนนั้น (ไม่มีรูป = ไอคอนคน placeholder) + ชื่อตอน hover
                                m.sender = null → ข้อความมาทาง webhook/บอท ไม่มี "คน" ให้แสดง → รูปเพจตามเดิม */}
                          {mine &&
                            atBurstEnd &&
                            (m.sender ? (
                              <span title={m.sender.name}>
                                <ChatAvatar
                                  avatar={m.sender.avatar}
                                  name={m.sender.name}
                                  size="size-5"
                                  fallback={
                                    <span className="bg-default-200 text-default-600 flex size-5 shrink-0 items-center justify-center rounded-full">
                                      <Icon icon="user" className="size-3" />
                                    </span>
                                  }
                                />
                                <span className="sr-only">ส่งโดย {m.sender.name}</span>
                              </span>
                            ) : (
                              <ChatAvatar
                                avatar={shopAvatar}
                                name={buyerName}
                                size="size-5"
                                fallback={
                                  <span className="bg-primary flex size-5 shrink-0 items-center justify-center rounded-full text-white">
                                    <Icon icon="building-store" className="size-3" />
                                  </span>
                                }
                              />
                            ))}
                        </div>
                      )}
                      {/* R19/P2-b: เวลาเต็มเป็นข้อความจริงหลังเนื้อหา (ชุดเดียวกับ sr-only "ส่งโดย") */}
                      <span className="sr-only">{fmt(t.inbox.messageTimeSr, { date: formatDateTimeTH(m.createdAt) })}</span>
                    </div>
                    {!mine && actionCluster}
                  </div>
                )
              })}
            </div>
      ))}
    </>
  )
}

export const ThreadMessageList = memo(ThreadMessageListImpl)
