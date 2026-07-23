'use client'

/**
 * ChatContextMenu — เมนูคลิกขวาบนแถวแชท (feature 00018 CRM): ตั้งสถานะการขาย + เพิ่ม/ลบแท็กเร็ว
 * PATCH /api/chat/conversations/[id]/crm เอง แล้วเรียก onUpdated ให้ parent refetch
 *
 * Base: theme/paces dropdown (.dropdown-item) — วางที่ตำแหน่งเคอร์เซอร์ (fixed) clamp ไม่ให้ล้นจอ
 * เฉพาะเธรดช่องทางนอก (external) — DEEP ไม่มี CRM ฟิลด์ (ดู chat-crm.service)
 *
 * ปิด/เปิดเสียงรายเธรด (user สั่ง 2026-07-23) อยู่ในเมนูนี้ด้วย — เป็นค่าฝั่ง client ล้วน
 * (localStorage ผ่าน lib/chat-sound) ไม่ยิง API และไม่ต้อง refetch รายการ
 */
import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import Icon from '@/components/wrappers/Icon'
import { pacesToast } from '@/lib/paces-toast'
import { CHAT_SOUND_EVENT, isChatSoundMuted, isConversationMuted, setConversationMuted } from '@/lib/chat-sound'
import TagInput from './TagInput'
import type { RowAction } from './ConversationRowMenu'

const STATUS_OPTIONS: { value: string; label: string; cls: string }[] = [
  { value: 'UNSPECIFIED', label: 'ยังไม่ระบุ', cls: 'text-default-500' },
  { value: 'INTERESTED', label: 'สนใจ', cls: 'text-success' },
  { value: 'NOT_INTERESTED', label: 'ไม่สนใจ', cls: 'text-default-600' },
]

type Props = {
  x: number
  y: number
  conversationId: string
  /** เธรดช่องทางนอกเท่านั้นที่มีฟิลด์ CRM (สถานะการขาย/แท็ก) — DEEP เห็นเฉพาะ action + เสียง */
  external: boolean
  salesStatus: string
  tags: string[]
  groups: { id: string; name: string }[]
  onMoveToGroup: (groupId: string | null) => void
  isPinned: boolean
  isResolved: boolean
  /** กำลังดูโหมด "ที่ซ่อนอยู่" → เมนูต้องเป็น "เลิกซ่อน" ไม่ใช่ "ซ่อน" */
  hiddenContext: boolean
  busyAction: boolean
  onAction: (action: RowAction) => void
  onClose: () => void
  onUpdated: () => void
}

export default function ChatContextMenu({
  x,
  y,
  conversationId,
  external,
  salesStatus,
  tags,
  groups,
  onMoveToGroup,
  isPinned,
  isResolved,
  hiddenContext,
  busyAction,
  onAction,
  onClose,
  onUpdated,
}: Props) {
  const ref = useRef<HTMLDivElement>(null)
  const [busy, setBusy] = useState(false)
  // สถานะเสียงอ่านหลัง mount (localStorage ไม่มีฝั่ง server) — เมนูนี้ render หลังคลิกอยู่แล้ว
  const [appMuted, setAppMuted] = useState(false)
  const [threadMuted, setThreadMuted] = useState(false)
  useEffect(() => {
    const sync = () => {
      setAppMuted(isChatSoundMuted())
      setThreadMuted(isConversationMuted(conversationId))
    }
    sync()
    window.addEventListener(CHAT_SOUND_EVENT, sync)
    return () => window.removeEventListener(CHAT_SOUND_EVENT, sync)
  }, [conversationId])
  // clamp ไม่ให้ล้นขอบขวา/ล่างของจอ (เมนูกว้าง ~208px สูง ~ประมาณ)
  const left = Math.min(x, (typeof window !== 'undefined' ? window.innerWidth : x) - 220)
  const top = Math.min(y, (typeof window !== 'undefined' ? window.innerHeight : y) - 280)

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDoc)
      document.removeEventListener('keydown', onKey)
    }
  }, [onClose])

  async function patch(body: Record<string, unknown>, successMsg: string) {
    if (busy) return
    setBusy(true)
    try {
      const res = await fetch(`/api/chat/conversations/${conversationId}/crm`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) {
        pacesToast.chat.error('ทำรายการไม่สำเร็จ ลองใหม่อีกครั้ง')
        return
      }
      pacesToast.chat.success(successMsg)
      onUpdated()
    } catch {
      pacesToast.chat.error('ทำรายการไม่สำเร็จ ลองใหม่อีกครั้ง')
    } finally {
      setBusy(false)
    }
  }

  // render ผ่าน portal ที่ document.body — หลุดจาก Chat Rail/การ์ดที่มี overflow/transform ซึ่ง clip
  // ตัว fixed จนแสดงไม่เต็ม (user report 2026-07-23). document.body มีเสมอ (menu โผล่หลังคลิกฝั่ง client)
  return createPortal(
    <div
      ref={ref}
      role="menu"
      style={{ top, left }}
      className="border-default-300 bg-card fixed z-50 max-h-96 w-52 overflow-y-auto rounded-lg border shadow-lg"
    >
      {/* action ประจำแถว (user สั่ง 2026-07-23: "action ที่ทำได้ในแต่ละ chat ต้องมีอยู่ใน right click
          ด้วย") — ชุดเดียวกับปุ่มลอยตอน hover (desktop) และปัดซ้าย (มือถือ) ปิดเมนูทันทีที่สั่ง
          เพราะ parent จะ refetch รายการแล้วสถานะในเมนูจะค้างของเก่า */}
      {(
        [
          { action: (isPinned ? 'unpin' : 'pin') as RowAction, icon: isPinned ? 'star-off' : 'star', label: isPinned ? 'เลิกปักหมุด' : 'ปักหมุด' },
          { action: (isResolved ? 'reopen' : 'resolve') as RowAction, icon: isResolved ? 'arrow-back-up' : 'circle-check', label: isResolved ? 'เปิดบทสนทนาใหม่' : 'ปิดงาน' },
          { action: (hiddenContext ? 'unhide' : 'hide') as RowAction, icon: hiddenContext ? 'eye' : 'eye-off', label: hiddenContext ? 'เลิกซ่อน' : 'ซ่อน' },
        ] as const
      ).map((item) => (
        <button
          key={item.action}
          type="button"
          role="menuitem"
          disabled={busyAction}
          onClick={() => {
            onAction(item.action)
            onClose()
          }}
          className="dropdown-item text-sm"
        >
          <Icon icon={item.icon} className="size-4" />
          <span>{item.label}</span>
        </button>
      ))}

      <hr className="dropdown-divider" />

      {external && (
        <>
      <p className="text-default-400 px-3 pt-2 pb-1 text-2xs font-medium">สถานะการขาย</p>
      {STATUS_OPTIONS.map((o) => (
        <button
          key={o.value}
          type="button"
          role="menuitem"
          disabled={busy}
          onClick={() => patch({ salesStatus: o.value }, `ตั้งสถานะ "${o.label}" แล้ว`)}
          className="dropdown-item text-sm"
        >
          <Icon icon="check" className={`size-4 ${salesStatus === o.value ? o.cls : 'opacity-0'}`} />
          <span className={o.cls}>{o.label}</span>
        </button>
      ))}

      <hr className="dropdown-divider" />
        </>
      )}

      {/* เสียงเฉพาะแชทนี้ — ปิดเสียงระดับแอปอยู่จะบอกตรง ๆ ว่าตั้งตรงนี้ก็ไม่มีผล (สวิตช์ระดับแอป
          อยู่ที่ปุ่มลำโพงบนหัวหน้าแชท) ดีกว่าซ่อนเมนูจนผู้ใช้หาไม่เจอว่าปิดไว้ที่ไหน */}
      <button
        type="button"
        role="menuitem"
        onClick={() => setConversationMuted(conversationId, !threadMuted)}
        className="dropdown-item text-sm"
      >
        <Icon icon={threadMuted ? 'bell-off' : 'bell'} className="size-4" />
        <span>{threadMuted ? 'เปิดเสียงแชทนี้' : 'ปิดเสียงแชทนี้'}</span>
      </button>
      {appMuted && (
        <p className="text-default-500 px-3 pb-1.5 text-2xs">ตอนนี้ปิดเสียงทั้งแอปอยู่ — ตั้งค่านี้จะยังไม่มีผล</p>
      )}

      {external && (
        <>
      <hr className="dropdown-divider" />

      <p className="text-default-400 px-3 pt-1 pb-1 text-2xs font-medium">ย้ายไปกลุ่ม</p>
      {groups.length === 0 ? (
        <p className="text-default-400 px-3 pb-1.5 text-2xs">ยังไม่มีกลุ่ม — กด “+” ที่แถบกลุ่มด้านบนเพื่อสร้าง</p>
      ) : (
        <>
          {groups.map((g) => (
            <button
              key={g.id}
              type="button"
              role="menuitem"
              onClick={() => onMoveToGroup(g.id)}
              className="dropdown-item text-sm"
            >
              <Icon icon="folder" className="text-default-500 size-4" />
              <span>{g.name}</span>
            </button>
          ))}
          <button
            type="button"
            role="menuitem"
            onClick={() => onMoveToGroup(null)}
            className="dropdown-item text-default-500 text-sm"
          >
            <Icon icon="folder-off" className="size-4" />
            <span>เอาออกจากกลุ่ม</span>
          </button>
        </>
      )}

      <hr className="dropdown-divider" />

      <p className="text-default-400 px-3 pt-1 pb-1 text-2xs font-medium">แท็ก</p>
      {tags.length > 0 && (
        <div className="flex flex-wrap gap-1 px-3 pb-1.5">
          {tags.map((t) => (
            <span key={t} className="badge bg-primary/15 text-primary text-2xs inline-flex items-center gap-1">
              {t}
              <button
                type="button"
                disabled={busy}
                onClick={() => patch({ tags: tags.filter((x) => x !== t) }, 'ลบแท็กแล้ว')}
                aria-label={`ลบแท็ก ${t}`}
              >
                <Icon icon="x" width={11} height={11} />
              </button>
            </span>
          ))}
        </div>
      )}
      <div className="px-3 pb-2.5 pt-1">
        <TagInput
          selected={tags}
          onAdd={(t) => patch({ tags: [...tags, t] }, `เพิ่มแท็ก "${t}" แล้ว`)}
        />
      </div>
        </>
      )}
    </div>,
    document.body,
  )
}
