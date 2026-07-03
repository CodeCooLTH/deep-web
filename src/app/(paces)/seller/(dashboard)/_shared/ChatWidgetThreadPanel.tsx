'use client'

/**
 * ChatWidgetThreadPanel — thread view ของ ChatWidget (feat 00011 Deep Chat, ChatWidget task)
 *
 * เรียก useSellerChatThread hook เดียวกับ full-page ../inbox/[conversationId]/components/ChatThread.tsx
 * (ดู comment หัวไฟล์นั้น) แต่ render `h-full` ไม่มี `.card`/`card-header` ซ้ำ — SellerChatWidget
 * (caller) เป็นคนวาด `.card` + header (bg-primary text-white back/ชื่อ/expand/close) ครอบอยู่แล้ว
 * (UX-Design-Spec-Bubble.md "Seller thread reuse")
 *
 * markup ข้อความ/composer copy ตรงจาก ChatThread.tsx (เหมือนกันทุกอย่างยกเว้นไม่มี card-header
 * ของตัวเอง + ไม่มี h-[calc(100vh-190px)] เพราะ parent panel คุมความสูงแทน) — bubble structure
 * ทั้งหมด (items-start/avatar สองฝั่ง/spacing) ตรงกับ Base ChatPage.tsx (ดู comment ละเอียดใน
 * ChatThread.tsx) ย่อขนาด spacing/avatar ลงเล็กน้อยเพื่อ fit compact panel เท่านั้น
 * (ไม่ใช้ max-w-[75%] arbitrary — ปล่อย flex-shrink จัดการ wrap เหมือน Base)
 */
import { useState } from 'react'
import Icon from '@/components/wrappers/Icon'
import { generateInitials } from '@/utils/helpers'
import { formatTime } from '@/lib/format-date'
import { useSellerChatThread, groupByDate } from './useSellerChatThread'
import SellerEmptyState from './SellerEmptyState'
import SellerErrorState from './SellerErrorState'

type Props = {
  conversationId: string
  buyerName: string
  buyerAvatar: string | null
}

/** avatar เล็ก — copy ตรงจาก ChatThread.tsx (duplicate เล็ก ๆ ตาม convention เดิมของโปรเจกต์
 * เช่น InboxList.tsx BuyerAvatar/ChatThread.tsx ChatAvatar — ไม่คุ้ม extract component แยก) */
function ChatAvatar({ avatar, name, size = 'size-7' }: { avatar: string | null; name: string; size?: string }) {
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

export default function ChatWidgetThreadPanel({ conversationId, buyerName, buyerAvatar }: Props) {
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

  if (errorState) {
    return (
      <div className="flex h-full items-center">
        <SellerErrorState
          compact
          title="ไม่พบบทสนทนานี้"
          message="บทสนทนานี้อาจถูกลบ หรือคุณไม่มีสิทธิ์เข้าถึง"
        />
      </div>
    )
  }

  if (loadingInitial) {
    return (
      <div className="flex h-full items-center justify-center">
        <div
          className="border-primary size-7 animate-spin rounded-full border-2 border-t-transparent"
          role="status"
          aria-label="กำลังโหลด"
        />
      </div>
    )
  }

  const groups = groupByDate(messages)

  return (
    <div className="flex h-full min-w-0 flex-col">
      {/* scroll body — plain div + ref (ต้อง programmatic scroll เหมือน full-page) */}
      <div ref={scrollRef} className="min-h-0 grow overflow-y-auto px-3 py-3">
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
              <div className="my-3 flex justify-center">
                <span className="badge bg-default-100 text-default-500 text-2xs">{g.label}</span>
              </div>

              {g.items.map((m) => {
                const mine = m.senderRole === 'SHOP'
                return (
                  // Base ChatPage.tsx:64/79 — items-start (ไม่ใช่ items-end) + avatar ทั้งสองฝั่ง
                  <div key={m.id} className={`my-3 flex items-start gap-2 ${mine ? 'justify-end' : ''}`}>
                    {!mine && <ChatAvatar avatar={buyerAvatar} name={buyerName} size="size-6" />}
                    {/* ไม่ใส่ max-w บน bubble — ปล่อย flex-shrink ของ parent row จัดการ wrap เอง
                        เหมือน Base (max-w-3/4 เดิม/max-w-[75%] เดิมไม่ใช่ pattern ของ Base) */}
                    <div>
                      <div className={`rounded px-3 py-2 ${mine ? 'bg-primary/15' : 'bg-light'}`}>
                        {m.type === 'IMAGE' && m.imageUrl && (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={`/api/files/${m.imageUrl}`}
                            alt="รูปภาพที่ส่ง"
                            className="max-w-48 rounded"
                          />
                        )}
                        {m.body && (
                          <p className={`text-default-800 text-sm ${m.type === 'IMAGE' ? 'mt-2' : ''} mb-0`}>
                            {m.body}
                          </p>
                        )}
                      </div>
                      <div className={`text-default-400 mt-1 flex items-center gap-1 text-2xs ${mine ? 'justify-end' : ''}`}>
                        <Icon icon="clock" />
                        {formatTime(m.createdAt)}
                      </div>
                    </div>
                    {/* avatar ฝั่ง SHOP — ดู comment เดียวกันใน ChatThread.tsx (ไม่มี shop avatar/ชื่อ
                        ส่งเข้า component นี้ จึงใช้ icon ร้านค้าแทน initials) */}
                    {mine && (
                      <span className="bg-primary flex size-6 shrink-0 items-center justify-center rounded-full text-white">
                        <Icon icon="building-store" className="size-3" />
                      </span>
                    )}
                  </div>
                )
              })}
            </div>
          ))
        )}
      </div>

      {/* composer — compact version ของ ChatThread.tsx composer */}
      <div className="border-t border-default-300 border-dashed px-3 py-2.5">
        {pendingImage && (
          <div className="mb-2 flex items-center gap-2">
            <div className="border-default-200 relative size-12 overflow-hidden rounded-lg border">
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

        <div className="flex gap-1.5">
          <label className="btn btn-icon btn-sm border-default-300 shrink-0 cursor-pointer" aria-label="แนบรูปภาพ">
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="hidden"
              onChange={handleFileChange}
              disabled={uploading || sending}
            />
            <Icon icon={uploading ? 'loader-2' : 'paperclip'} className={`text-base ${uploading ? 'animate-spin' : ''}`} />
          </label>

          <div className="input-icon-group grow">
            <input
              type="text"
              className="form-input form-input-sm bg-light/20"
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
            className="btn btn-sm bg-primary text-white hover:bg-primary-hover shrink-0 disabled:opacity-60"
            aria-label="ส่ง"
          >
            <Icon icon="send-2" className="text-lg" />
          </button>
        </div>
      </div>
    </div>
  )
}
