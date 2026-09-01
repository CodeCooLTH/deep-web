'use client'

/**
 * Base: theme/paces/Admin/TS/src/app/(admin)/ui/notifications/page.tsx (Basic variant, บรรทัด 44–58)
 *
 * Toast เดี่ยวของระบบ Paces — markup คัดจาก reference (header brand-row + body):
 *   - container: bg-default-100 border-default-300 rounded-md border shadow
 *   - header: logo-sm + "Deep" + relative time + close (×)
 *   - body: semantic icon (success/error/warning/info) + ข้อความ
 * ปรับจาก reference: ตัด data-hs-remove-element (Preline DOM-remove ชน React reconcile)
 *   → จัดการ dismiss + slide-out ด้วย React state เอง; ใส่ semantic icon ใน body;
 *   relative time สด (เลือกโดย user) แทน "11 mins ago" คงที่.
 */

import logoSm from '@/assets/images/logo-deep-mark.png'
import { relativeTimeTh } from '@/lib/relative-time-th'
import type { ChatMessageToastPayload, PacesToastType } from '@/lib/paces-toast'
import { ChannelBadgeOverlay } from '@/app/(paces)/seller/(chat)/inbox/components/ChannelBadge'
import { generateInitials } from '@/utils/helpers'
import { Icon } from '@iconify/react'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
import { toFileUrl } from '@/lib/file-url'

const VARIANT: Record<PacesToastType, { icon: string; color: string }> = {
  success: { icon: 'tabler:circle-check', color: 'text-success' },
  error: { icon: 'tabler:alert-circle', color: 'text-danger' },
  warning: { icon: 'tabler:alert-triangle', color: 'text-warning' },
  info: { icon: 'tabler:info-circle', color: 'text-info' },
}

const EXIT_MS = 300 // ต้องตรงกับ `transition-all duration-300` บน container ด้านล่าง (ถ้าแก้ duration ต้องแก้คู่กัน)

/**
 * avatar ผู้ส่ง + fallback ตัวอักษรแรกของชื่อ
 * Base: BuyerAvatar ใน src/app/(paces)/seller/(chat)/inbox/components/InboxList.tsx:174
 * (ตรรกะเดียวกันเป๊ะ — http URL ใช้ตรง ๆ, ค่าอื่นถือเป็น fileId ของ storage ยิงผ่าน /api/files/)
 * ไม่ import ตัวเดิมเพราะมันไม่ได้ export และอยู่ในไฟล์ client ก้อนใหญ่ (InboxList ทั้งหน้า)
 *
 * avatarUrl ของ Messenger เป็น null เสมอ (Meta ไม่ให้ profile_pic จนกว่าจะผ่าน App Review)
 * → ตกมาที่ initials เป็นเรื่องปกติ ไม่ใช่บั๊ก
 */
function SenderAvatar({ avatar, name }: { avatar: string | null; name: string }) {
  const [failed, setFailed] = useState(false)
  const src = avatar ? (toFileUrl(avatar)) : null
  if (!src || failed) {
    return (
      <span className="bg-primary/10 text-primary flex size-12 shrink-0 items-center justify-center rounded-full font-semibold">
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
      className="bg-default-100 size-12 shrink-0 rounded-full object-cover"
    />
  )
}

interface Props {
  id: number
  type: PacesToastType
  message: string
  duration: number
  onClose: (id: number) => void
  /** มีค่า = toast แจ้งข้อความใหม่ (หน้าตาแบบ notification) แทน alert ปกติ */
  chatMessage?: ChatMessageToastPayload
}

export default function PacesToastItem({ id, type, message, duration, onClose, chatMessage }: Props) {
  const router = useRouter()
  const [visible, setVisible] = useState(false)
  const [leaving, setLeaving] = useState(false)
  const [nowTick, setNowTick] = useState(() => Date.now())

  const createdAt = useRef(Date.now())
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const deadlineRef = useRef(0)
  const remainingRef = useRef(duration)

  const variant = VARIANT[type]

  const dismiss = () => {
    setLeaving((prev) => {
      if (prev) return prev
      setTimeout(() => onClose(id), EXIT_MS)
      return true
    })
  }

  const startTimer = (ms: number) => {
    if (duration <= 0) return // duration 0 = sticky
    clearTimeout(timerRef.current)
    deadlineRef.current = Date.now() + ms
    timerRef.current = setTimeout(dismiss, ms)
  }

  useEffect(() => {
    const raf = requestAnimationFrame(() => setVisible(true))
    startTimer(duration)
    const tick = setInterval(() => setNowTick(Date.now()), 10_000)
    return () => {
      cancelAnimationFrame(raf)
      clearTimeout(timerRef.current)
      clearInterval(tick)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const pause = () => {
    if (duration <= 0) return
    clearTimeout(timerRef.current)
    remainingRef.current = Math.max(0, deadlineRef.current - Date.now())
  }
  const resume = () => startTimer(remainingRef.current)

  const shown = visible && !leaving

  // ---- toast แจ้งข้อความใหม่ (user request 2026-07-29) ----
  // layout ตาม notification ของ Facebook ที่ user ส่งมาเป็น reference:
  //   [รูปผู้ส่ง + badge ช่องทาง]  **ชื่อ** ส่งข้อความถึงคุณ: "ข้อความ"
  //                               เวลา · ชื่อเพจ                        [จุดยังไม่อ่าน]
  // Hard Rule 6: เอา IA/ลำดับข้อมูลตาม ref แต่สี/ตัวอักษร/ระยะ = token ของ Paces ทั้งหมด
  // (ไม่มีสีน้ำเงิน Facebook — จุดยังไม่อ่านใช้ bg-primary ของ Paces)
  if (chatMessage) {
    const openThread = () => {
      router.push(`/inbox/${chatMessage.conversationId}`)
      dismiss()
    }

    return (
      <div
        role="link"
        tabIndex={0}
        aria-label={message}
        onMouseEnter={pause}
        onMouseLeave={resume}
        onClick={openThread}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            openThread()
          }
        }}
        className={`bg-default-100 border-default-300 hover:bg-default-200 relative w-80 max-w-[calc(100vw-2rem)] cursor-pointer rounded-md border p-3 shadow transition-all duration-300 ${
          shown ? 'translate-x-0 opacity-100' : 'translate-x-5 opacity-0'
        }`}>
        <div className="flex items-start gap-3">
          {/* wrapper ต้อง relative — ChannelBadgeOverlay วาง absolute มุมล่างขวาของ avatar */}
          <div className="relative shrink-0">
            <SenderAvatar avatar={chatMessage.senderAvatarUrl} name={chatMessage.senderName} />
            <ChannelBadgeOverlay channel={chatMessage.channel} />
          </div>

          {/* min-w-0 บังคับให้ลูกที่ truncate ย่อได้จริงใน flex (ไม่งั้นดันกล่องล้น) */}
          <div className="min-w-0 flex-1">
            <p className="text-default-700 text-sm">
              <strong className="text-default-800 font-semibold">{chatMessage.senderName}</strong>{' '}
              ส่งข้อความถึงคุณ
              {chatMessage.preview ? `: "${chatMessage.preview}"` : ' (ไฟล์แนบ)'}
            </p>
            <p className="text-default-500 mt-1 truncate text-xs">
              {relativeTimeTh(createdAt.current, nowTick)}
              {chatMessage.channelName ? ` · ${chatMessage.channelName}` : ''}
            </p>
          </div>

          {/* จุด "ยังไม่อ่าน" ตาม ref — ใช้ bg-primary ของ Paces ไม่ใช่น้ำเงิน Facebook */}
          <span className="bg-primary mt-4 size-2.5 shrink-0 rounded-full" aria-hidden="true" />
        </div>

        <button
          type="button"
          // stopPropagation — ไม่งั้นกดปิดแล้วเด้งเข้าเธรดไปด้วย (การ์ดทั้งใบคลิกได้)
          onClick={(e) => {
            e.stopPropagation()
            dismiss()
          }}
          aria-label="ปิด"
          className="absolute end-1 top-1 flex min-h-11 min-w-11 items-center justify-center opacity-50 hover:opacity-100 focus:opacity-100 focus:outline-hidden lg:min-h-0 lg:min-w-0">
          <Icon icon="tabler:x" className="text-default-800 size-4" />
        </button>
      </div>
    )
  }

  return (
    <div
      role="alert"
      tabIndex={-1}
      onMouseEnter={pause}
      onMouseLeave={resume}
      // w-80 + max-w กัน overflow บนจอเล็ก (Paces ไม่มี token responsive-width ตรงนี้)
      className={`bg-default-100 border-default-300 w-80 max-w-[calc(100vw-2rem)] rounded-md border shadow transition-all duration-300 ${
        shown ? 'translate-x-0 opacity-100' : 'translate-x-5 opacity-0'
      }`}>
      <div className="border-default-300 flex items-center border-b px-3 py-2">
        <p className="text-default-600 flex items-center gap-1.5 text-sm">
          <Image src={logoSm} alt="Deep" className="size-4" />
          <strong className="font-semibold">Deep</strong>
        </p>
        <div className="ms-auto flex items-center gap-2">
          <span className="text-default-400 text-xs">{relativeTimeTh(createdAt.current, nowTick)}</span>
          <button
            type="button"
            onClick={dismiss}
            aria-label="ปิด"
            className="flex min-h-11 min-w-11 items-center justify-center opacity-50 hover:opacity-100 focus:opacity-100 focus:outline-hidden lg:min-h-0 lg:min-w-0">
            <Icon icon="tabler:x" className="text-default-800 size-6" />
          </button>
        </div>
      </div>
      <div className="flex items-start gap-2 p-3 text-sm">
        <Icon icon={variant.icon} className={`${variant.color} mt-0.5 size-4 shrink-0`} />
        <span className="text-default-700">{message}</span>
      </div>
    </div>
  )
}
