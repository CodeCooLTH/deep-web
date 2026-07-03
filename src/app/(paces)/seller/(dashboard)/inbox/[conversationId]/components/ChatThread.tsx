'use client'

/**
 * ChatThread — client thread component ของ /inbox/[conversationId] (feat 00011 Deep Chat, S-12)
 *
 * Base: theme/paces/Admin/TS/src/app/(admin)/apps/chat/components/ChatPage.tsx:33-110
 * (card > card-header > scroll body > composer) — ตัด sidebar offcanvas/ChatToolbar/online-status
 * (UX-Design-Spec.md §S-12) + แก้ scroll body จาก SimpleBar → plain `<div overflow-y-auto>` + ref
 * (ต้อง programmatic scroll สำหรับ preserve-scroll ตอน load-older + scroll-to-bottom ตอนส่ง)
 * bubble สี: ซ้าย=BUYER `bg-light`, ขวา=SHOP `bg-primary/15` (Base ใช้ bg-warning/15/bg-info/15 —
 * แก้ตาม spec ให้ตรง semantic ผู้ส่งจริง)
 *
 * Avatar: reuse pattern BidderAvatar จาก AuctionBidFeed.tsx (ดู InboxList.tsx comment เดียวกัน)
 * Upload: pattern ProductImagesCardV2.tsx:54-90 (auto-upload ทันทีที่เลือกไฟล์ → preview chip)
 * Realtime: pattern AuctionDetailClient.tsx:144-179 (Supabase broadcast, signal-only ไม่เชื่อ payload)
 * Date divider group: pattern NotificationFeed.tsx (formatDate เทียบ today/yesterday, ห้าม Intl ตรง)
 *
 * arbitrary value `h-[calc(100vh-190px)]`: copy ตรงจาก Base ChatPage.tsx L22 — เป็น convention ของ
 * Paces "full-viewport app" (chat/kanban/email/file-manager ใน theme ใช้ pattern เดียวกันหมด)
 * ไม่ใช่ค่าที่เดาเอง — Paces ไม่มี token สำหรับ viewport-locked height
 *
 * (ChatWidget task) fetch/realtime/send/upload/mark-read logic ทั้งหมด extract ไปที่
 * ../../../_shared/useSellerChatThread.ts เพื่อให้ ChatWidgetThreadPanel.tsx (bubble panel)
 * เรียกใช้ชุดเดียวกัน — ไฟล์นี้เหลือแค่ render (UX ไม่เปลี่ยนแม้แต่บรรทัดเดียว)
 */
import Icon from '@/components/wrappers/Icon'
import { generateInitials } from '@/utils/helpers'
import { formatTime } from '@/lib/format-date'
import { useState } from 'react'
import { useSellerChatThread, groupByDate } from '../../../_shared/useSellerChatThread'
import SellerEmptyState from '../../../_shared/SellerEmptyState'
import SellerErrorState from '../../../_shared/SellerErrorState'
import { SellerThreadSkeleton } from '../../../_shared/SellerCardSkeleton'

type Props = {
  conversationId: string
  buyerName: string
  buyerAvatar: string | null
}

/** avatar เล็ก — รูปจริง (http URL หรือ storage fileId) + fallback initials */
function ChatAvatar({ avatar, name, size = 'size-9' }: { avatar: string | null; name: string; size?: string }) {
  const [failed, setFailed] = useState(false)
  const src = avatar ? (avatar.startsWith('http') ? avatar : `/api/files/${avatar}`) : null
  if (!src || failed) {
    return (
      <span className={`bg-primary/10 text-primary flex ${size} shrink-0 items-center justify-center rounded-full text-sm font-semibold`}>
        {generateInitials(name) || '?'}
      </span>
    )
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={name}
      loading="lazy"
      onError={() => setFailed(true)}
      className={`${size} shrink-0 rounded-full bg-default-100 object-cover`}
    />
  )
}

export default function ChatThread({ conversationId, buyerName, buyerAvatar }: Props) {
  const {
    messages,
    oldestCursor,
    loadingInitial,
    loadingOlder,
    sending,
    uploading,
    errorState,
    text,
    setText,
    pendingImage,
    scrollRef,
    topSentinelRef,
    handleFileChange,
    handleRemoveImage,
    handleSend,
  } = useSellerChatThread(conversationId)

  // ── render ───────────────────────────────────────────────────────────
  if (errorState) {
    // reuse SellerErrorState แทนเขียนการ์ด error ใหม่ (Link ใช้ next/link ได้ปกติในนี้ — ไฟล์นี้เป็น
    // client component 'use client' อยู่แล้ว ไม่ใช่ RSC จึงไม่ชน Hard Rule 2)
    return (
      <SellerErrorState
        title="ไม่พบบทสนทนานี้"
        message="บทสนทนานี้อาจถูกลบ หรือคุณไม่มีสิทธิ์เข้าถึง"
        retryHref="/inbox"
      />
    )
  }

  if (loadingInitial) {
    return <SellerThreadSkeleton />
  }

  const groups = groupByDate(messages)

  return (
    <div className="card h-[calc(100vh-190px)] min-w-0 flex-1 flex flex-col">
      {/* card-header — avatar+ชื่อผู้ซื้อ (deviate จาก Base: เพิ่ม avatar, ตัด online-status) */}
      <div className="card-header">
        <div className="flex items-center gap-3">
          <ChatAvatar avatar={buyerAvatar} name={buyerName} />
          <h5 className="text-base mb-0">{buyerName}</h5>
        </div>
      </div>

      {/* scroll body — plain div + ref (ไม่ SimpleBar ตาม spec, ต้อง programmatic scroll) */}
      <div ref={scrollRef} className="card-body min-h-0 grow overflow-y-auto py-4">
        {oldestCursor && (
          <div ref={topSentinelRef} className="flex justify-center py-2">
            {loadingOlder && (
              <div
                className="border-primary size-5 animate-spin rounded-full border-2 border-t-transparent"
                role="status"
                aria-label="กำลังโหลด"
              />
            )}
          </div>
        )}

        {messages.length === 0 ? (
          <SellerEmptyState
            compact
            icon="message-circle-2"
            title="เริ่มต้นการสนทนา"
            description="พิมพ์ข้อความทักทายลูกค้าได้เลย"
          />
        ) : (
          groups.map((g) => (
            <div key={g.key}>
              {/* date divider — badge chip กึ่งกลาง */}
              <div className="my-4 flex justify-center">
                <span className="badge bg-default-100 text-default-500 text-2xs">{g.label}</span>
              </div>

              {g.items.map((m) => {
                const mine = m.senderRole === 'SHOP'
                return (
                  <div key={m.id} className={`my-3 flex items-end gap-2.5 ${mine ? 'justify-end' : 'justify-start'}`}>
                    {!mine && <ChatAvatar avatar={buyerAvatar} name={buyerName} size="size-7" />}
                    <div className={`max-w-[75%] ${mine ? 'text-end' : ''}`}>
                      <div className={`rounded px-4 py-2.5 ${mine ? 'bg-primary/15' : 'bg-light'}`}>
                        {m.type === 'IMAGE' && m.imageUrl && (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={`/api/files/${m.imageUrl}`}
                            alt="รูปภาพที่ส่ง"
                            className="max-w-60 rounded"
                          />
                        )}
                        {m.body && (
                          <p className={`text-default-800 text-sm ${m.type === 'IMAGE' ? 'mt-2' : ''} mb-0`}>
                            {m.body}
                          </p>
                        )}
                      </div>
                      <div className="text-default-400 mt-1 flex items-center gap-1 text-xs">
                        {mine && <span className="grow" />}
                        <Icon icon="clock" />
                        {formatTime(m.createdAt)}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          ))
        )}
      </div>

      {/* composer — pattern ChatPage.tsx:99-109 + auto-upload preview chip */}
      <div className="border-t border-default-300 border-dashed px-4 py-3 sm:px-6 sm:py-3.75">
        {pendingImage && (
          <div className="mb-2 flex items-center gap-2">
            <div className="border-default-200 relative size-14 overflow-hidden rounded-lg border">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={pendingImage.previewUrl} alt="ตัวอย่างรูปที่จะส่ง" className="size-full object-cover" />
            </div>
            <button
              type="button"
              onClick={handleRemoveImage}
              className="btn btn-sm btn-icon border-default-300"
              aria-label="ลบรูป"
            >
              <Icon icon="x" className="text-base" />
            </button>
          </div>
        )}

        <div className="flex gap-2">
          <label className="btn btn-icon border-default-300 shrink-0 cursor-pointer" aria-label="แนบรูปภาพ">
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="hidden"
              onChange={handleFileChange}
              disabled={uploading || sending}
            />
            <Icon icon={uploading ? 'loader-2' : 'paperclip'} className={`text-lg ${uploading ? 'animate-spin' : ''}`} />
          </label>

          <div className="input-icon-group grow">
            <Icon icon="message" className="input-icon" />
            <input
              type="text"
              className="form-input bg-light/20"
              placeholder={pendingImage ? 'เพิ่มคำบรรยาย (ไม่บังคับ)' : 'พิมพ์ข้อความ...'}
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  handleSend()
                }
              }}
              disabled={sending}
            />
          </div>

          <button
            type="button"
            onClick={handleSend}
            disabled={sending || uploading || (!text.trim() && !pendingImage)}
            className="btn bg-primary text-white hover:bg-primary-hover shrink-0 disabled:opacity-60"
          >
            ส่ง <Icon icon="send-2" className="ms-1 text-xl" />
          </button>
        </div>
      </div>
    </div>
  )
}
