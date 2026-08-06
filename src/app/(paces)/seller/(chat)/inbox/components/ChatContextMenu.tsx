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
 *
 * ── โหมด "เพ่งแถว" สำหรับมือถือ (user สั่ง 2026-08-06) ────────────────────────────
 * เดิมเมนูนี้เปิดได้ทางเดียวคือ `onContextMenu` = คลิกขวา ซึ่ง **จอสัมผัสไม่มี**: iOS Safari
 * ไม่ยิง contextmenu จากการกดค้างเลย ส่วน Android ยิงบ้างแต่โดนเมนูระบบของ <Link> แย่งไปก่อน
 * ผลคือแผงลัดทั้งแผง (ปักหมุด/ปิดงาน/ซ่อน/สแปม/สถานะขาย/แท็ก/กลุ่ม/เสียง) ใช้บนมือถือไม่ได้เลย
 * ตั้งแต่วันแรก — ไม่ใช่ของที่เคยได้แล้วพัง
 *
 * ทางเข้าใหม่บนมือถือ = กดค้าง (useLongPress ที่ InboxList) แล้วเข้าโหมดเพ่ง: เบลอทั้งฉากหลัง
 * ยกแถวที่กดขึ้นมาลอยเหนือฉาก แล้ววางเมนูใต้/เหนือแถวนั้น (user: "ชอบ longpress แบบ comment
 * ที่ blur ข้างหลัง มันเด่นดี ทำให้ user focus")
 *
 * โครง overlay/การวางตำแหน่ง/การโคลน ยกมาจาก `[conversationId]/components/MessageActionBubble.tsx`
 * (เมนูกดค้างบนบับเบิลข้อความ) ทั้งดุ้น — เหตุผลเดียวกันทุกข้อ รวมถึง "ทำไมต้องโคลนแทนการยกตัวจริง"
 * (แถวอยู่ในการ์ดที่มี overflow → ยก z-index ทะลุ portal ระดับ body ไม่ได้) และ "ทำไมต้อง clamp
 * ด้วย visualViewport" (position:fixed บน iOS ไม่หดตามคีย์บอร์ด)
 */
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import Icon from '@/components/wrappers/Icon'
import { pacesToast } from '@/lib/paces-toast'
import { CHAT_SOUND_EVENT, isChatSoundMuted, isConversationMuted, setConversationMuted } from '@/lib/chat-sound'
import TagInput from './TagInput'
import type { RowAction } from './ConversationRowMenu'

const STATUS_OPTIONS: { value: string; label: string; cls: string }[] = [
  { value: 'UNSPECIFIED', label: 'ยังไม่ระบุ', cls: 'text-default-700' },
  { value: 'INTERESTED', label: 'สนใจ', cls: 'text-success' },
  { value: 'NOT_INTERESTED', label: 'ไม่สนใจ', cls: 'text-default-600' },
]

/**
 * เมนูนี้เปิดได้ 2 ทางซึ่งต้องการหน้าตาคนละแบบ (idiom เดียวกับ MessageAnchor ใน MessageActionBubble):
 *   - `point` = คลิกขวาบนเดสก์ท็อป → เมนูเกาะเคอร์เซอร์ **ห้ามเบลอทั้งจอ** เมาส์ยังต้องใช้
 *     รายการรอบ ๆ ได้ และผู้ใช้ไม่ได้กำลังเพ่งแถวเดียว
 *   - `row`   = กดค้างบนมือถือ → โหมดเพ่ง (เบลอฉากหลัง + ยกแถวนั้นขึ้นมา + เมนูเกาะแถว)
 */
export type ChatRowAnchor =
  | { kind: 'point'; x: number; y: number }
  | { kind: 'row'; row: HTMLElement }

/** ระยะแถว↔เมนู — พอให้เห็นว่าเป็นคนละก้อนแต่ยังอ่านว่าเป็นชุดเดียวกัน */
const GAP = 12
/** กันชนขอบจอ */
const EDGE = 8

type Props = {
  anchor: ChatRowAnchor
  conversationId: string
  /** เธรดช่องทางนอกเท่านั้นที่มีฟิลด์ CRM (สถานะการขาย/แท็ก) — DEEP เห็นเฉพาะ action + เสียง */
  external: boolean
  salesStatus: string
  tags: string[]
  groups: { id: string; name: string }[]
  onMoveToGroup: (groupId: string | null) => void
  isPinned: boolean
  isResolved: boolean
  isSpam: boolean
  /** กำลังดูโหมด "ที่ซ่อนอยู่" → เมนูต้องเป็น "เลิกซ่อน" ไม่ใช่ "ซ่อน" */
  hiddenContext: boolean
  busyAction: boolean
  onAction: (action: RowAction) => void
  onClose: () => void
  onUpdated: () => void
}

export default function ChatContextMenu({
  anchor,
  conversationId,
  external,
  salesStatus,
  tags,
  groups,
  onMoveToGroup,
  isPinned,
  isResolved,
  isSpam,
  hiddenContext,
  busyAction,
  onAction,
  onClose,
  onUpdated,
}: Props) {
  // แตกเป็นค่าพื้นฐานก่อนใส่ deps ของ effect — ใส่ `anchor` (object ที่ caller สร้างใหม่ทุก render)
  // ตรง ๆ จะทำให้ effect วิ่งทุกรอบ แล้ว setState → render ใหม่ → วน infinite
  const row = anchor.kind === 'row' ? anchor.row : null
  const pointX = anchor.kind === 'point' ? anchor.x : 0
  const pointY = anchor.kind === 'point' ? anchor.y : 0
  const ref = useRef<HTMLDivElement>(null)
  const cloneHostRef = useRef<HTMLDivElement>(null)
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
  // ── ตำแหน่ง ─────────────────────────────────────────────────────────────
  // point: clamp ไม่ให้ล้นขอบขวา/ล่างของจอ (เมนูกว้าง ~208px) — ตรรกะเดิมทุกบรรทัด
  // row: วัดขนาดเมนูจริงก่อนแล้วค่อยวาง (ดู layout effect ล่าง) จึงเริ่มที่ null
  const [rowPos, setRowPos] = useState<{ top: number; left: number } | null>(null)
  const [clonePos, setClonePos] = useState<{ top: number; left: number; width: number } | null>(null)
  // แยกจาก rowPos เพื่อให้ transition ได้วิ่ง (ตั้งใน rAF = หลัง paint แรกที่ยัง opacity-0)
  const [shown, setShown] = useState(false)
  // นับครั้งที่ "พื้นที่ที่มองเห็นจริง" เปลี่ยน (คีย์บอร์ดขึ้น-ลง / หมุนจอ) → บังคับวัดตำแหน่งใหม่
  const [viewportTick, setViewportTick] = useState(0)
  const pointLeft = Math.min(pointX, (typeof window !== 'undefined' ? window.innerWidth : pointX) - 220)
  const pointTop = Math.min(pointY, (typeof window !== 'undefined' ? window.innerHeight : pointY) - 280)

  // ── โคลนแถวมาวางบนฉากเบลอ + ซ่อนตัวจริง ─────────────────────────────────
  // ซ่อนตัวจริงด้วย visibility (ไม่ใช่ display) เพราะต้องคง layout ของรายการไว้เป๊ะ — ไม่งั้นแถวอื่น
  // ขยับตอนกดค้าง; และถ้าไม่ซ่อน แถวเดิมยังนอนอยู่ใต้ฉากเบลอตำแหน่งเดียวกัน ขอบเบลอจะฟุ้งรอบโคลน
  // ที่คมชัด เห็นเป็นเงาซ้อนสองชั้น (บทเรียน MessageActionBubble)
  useLayoutEffect(() => {
    const host = cloneHostRef.current
    if (!host || !row) return
    const clone = row.cloneNode(true) as HTMLElement
    // id ซ้ำในหน้าเดียวกันทำให้ getElementById/label ชี้ผิดตัว — โคลนเป็นภาพนิ่ง ไม่ใช่ของที่กดได้
    clone.removeAttribute('id')
    clone.querySelectorAll('[id]').forEach((n) => n.removeAttribute('id'))
    host.replaceChildren(clone)
    const prev = row.style.visibility
    row.style.visibility = 'hidden'
    return () => {
      row.style.visibility = prev
    }
  }, [row])

  useLayoutEffect(() => {
    const el = ref.current
    if (!el || !row) return
    const { width, height } = el.getBoundingClientRect()
    const vw = window.innerWidth
    // ขอบเขต "ที่มองเห็นจริง" ไม่ใช่ innerHeight — บน iOS คีย์บอร์ด (ช่องค้นหาด้านบนรายการ) หด
    // visual viewport แต่ไม่หด layout viewport ของที่ position:fixed จึงไปนอนใต้คีย์บอร์ดได้
    const vv = window.visualViewport
    const minTop = (vv ? vv.offsetTop : 0) + EDGE
    const maxBottom = (vv ? vv.offsetTop + vv.height : window.innerHeight) - EDGE

    const rect = row.getBoundingClientRect()
    const left = Math.min(Math.max(EDGE, rect.left), Math.max(EDGE, vw - width - EDGE))

    // ใต้แถวก่อน (ตาไล่จากแถว→ตัวเลือก) → ไม่พอค่อยพลิกขึ้นเหนือแถว → ไม่พอทั้งคู่ก็เลื่อนแถวขึ้น
    // ให้ทั้งชุดพอดีพื้นที่ที่เห็น (เมนูสูงสุด max-h-96 และเลื่อนในตัวเองได้อยู่แล้ว)
    let cloneTop = rect.top
    let top = cloneTop + rect.height + GAP
    if (top + height > maxBottom) {
      const above = cloneTop - GAP - height
      if (above >= minTop) {
        top = above
      } else {
        cloneTop = Math.max(minTop, maxBottom - height - GAP - rect.height)
        top = Math.min(Math.max(minTop, cloneTop + rect.height + GAP), Math.max(minTop, maxBottom - height))
      }
    }

    setRowPos({ top, left })
    setClonePos({ top: cloneTop, left: rect.left, width: rect.width })
    const id = requestAnimationFrame(() => setShown(true))
    return () => cancelAnimationFrame(id)
  }, [row, viewportTick])

  useEffect(() => {
    function onDoc(e: Event) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    // touch: หน่วงหนึ่งเฟรมก่อนดัก ไม่งั้น touchend/click ที่ตามหลังการกดค้างครั้งนี้เอง
    // จะปิดเมนูทันทีที่เพิ่งเปิด (บทเรียน MessageActionBubble)
    const id = setTimeout(() => {
      document.addEventListener('mousedown', onDoc)
      document.addEventListener('touchstart', onDoc)
    }, 0)
    document.addEventListener('keydown', onKey)
    // โหมดเพ่ง: overlay กิน touch ทั้งจอ (touch-none) ผู้ใช้เลื่อนรายการเองไม่ได้ — scroll/resize
    // ที่เกิดตอนนี้คือคีย์บอร์ดปิดหรือหมุนจอ ต้อง **วัดตำแหน่งใหม่** ไม่ใช่ปิดทิ้ง (ไม่งั้นกลายเป็น
    // กดค้างแล้วเมนูหายเอง). โหมด point (เดสก์ท็อป) ไม่มี overlay กัน เลื่อนแล้วเมนูหลุดจากแถว → ปิด
    const onViewportChange = row ? () => setViewportTick((t) => t + 1) : onClose
    window.addEventListener('scroll', onViewportChange, true)
    window.addEventListener('resize', onViewportChange)
    window.visualViewport?.addEventListener('resize', onViewportChange)
    return () => {
      clearTimeout(id)
      document.removeEventListener('mousedown', onDoc)
      document.removeEventListener('touchstart', onDoc)
      document.removeEventListener('keydown', onKey)
      window.removeEventListener('scroll', onViewportChange, true)
      window.removeEventListener('resize', onViewportChange)
      window.visualViewport?.removeEventListener('resize', onViewportChange)
    }
  }, [onClose, row])

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
  const menu = (
    <div
      ref={ref}
      role="menu"
      style={row ? { top: rowPos?.top ?? -9999, left: rowPos?.left ?? -9999 } : { top: pointTop, left: pointLeft }}
      // z-50 เฉพาะโหมด point (ไม่มี overlay ครอบ) — โหมดเพ่งใช้ z-80 ของ overlay แทน
      // โหมดเพ่งเกิดบนมือถือล้วน จึงดัน .dropdown-item ให้สูงเต็ม tap target 44px (min-h-11 เป็น
      // token ปกติของ Tailwind ไม่ใช่ arbitrary value — HR7) เดสก์ท็อปคงความหนาแน่นเดิมไว้
      className={`border-default-300 bg-card fixed max-h-96 w-52 overflow-y-auto rounded-lg border shadow-lg ${
        row
          ? `[&_.dropdown-item]:min-h-11 transition-opacity duration-150 ${rowPos ? 'opacity-100' : 'opacity-0'}`
          : 'z-50'
      }`}
    >
      {/* action ประจำแถว (user สั่ง 2026-07-23: "action ที่ทำได้ในแต่ละ chat ต้องมีอยู่ใน right click
          ด้วย") — ชุดเดียวกับปุ่มลอยตอน hover (desktop) และปัดซ้าย (มือถือ) ปิดเมนูทันทีที่สั่ง
          เพราะ parent จะ refetch รายการแล้วสถานะในเมนูจะค้างของเก่า */}
      {(
        [
          { action: (isPinned ? 'unpin' : 'pin') as RowAction, icon: isPinned ? 'star-off' : 'star', label: isPinned ? 'เลิกปักหมุด' : 'ปักหมุด' },
          { action: (isResolved ? 'reopen' : 'resolve') as RowAction, icon: isResolved ? 'arrow-back-up' : 'circle-check', label: isResolved ? 'เปิดบทสนทนาใหม่' : 'ปิดงาน' },
          { action: (hiddenContext ? 'unhide' : 'hide') as RowAction, icon: hiddenContext ? 'eye' : 'eye-off', label: hiddenContext ? 'เลิกซ่อน' : 'ซ่อน' },
          { action: (isSpam ? 'unspam' : 'spam') as RowAction, icon: isSpam ? 'inbox' : 'alert-octagon', label: isSpam ? 'ไม่ใช่สแปม' : 'ย้ายเข้าสแปม' },
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
      <p className="text-default-700 px-3 pt-2 pb-1 text-2xs font-medium">สถานะการขาย</p>
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
        <p className="text-default-700 px-3 pb-1.5 text-2xs">ตอนนี้ปิดเสียงทั้งแอปอยู่ — ตั้งค่านี้จะยังไม่มีผล</p>
      )}

      {external && (
        <>
      <hr className="dropdown-divider" />

      <p className="text-default-700 px-3 pt-1 pb-1 text-2xs font-medium">ย้ายไปกลุ่ม</p>
      {groups.length === 0 ? (
        <p className="text-default-700 px-3 pb-1.5 text-2xs">ยังไม่มีกลุ่ม — กด “+” ที่แถบกลุ่มด้านบนเพื่อสร้าง</p>
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
              <Icon icon="folder" className="text-default-700 size-4" />
              <span>{g.name}</span>
            </button>
          ))}
          <button
            type="button"
            role="menuitem"
            onClick={() => onMoveToGroup(null)}
            className="dropdown-item text-default-700 text-sm"
          >
            <Icon icon="folder-off" className="size-4" />
            <span>เอาออกจากกลุ่ม</span>
          </button>
        </>
      )}

      <hr className="dropdown-divider" />

      <p className="text-default-700 px-3 pt-1 pb-1 text-2xs font-medium">แท็ก</p>
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
    </div>
  )

  // render ผ่าน portal ที่ document.body — หลุดจาก Chat Rail/การ์ดที่มี overflow/transform ซึ่ง clip
  // ตัว fixed จนแสดงไม่เต็ม (user report 2026-07-23). document.body มีเสมอ (เมนูโผล่ฝั่ง client)
  if (!row) return createPortal(menu, document.body)

  return createPortal(
    // HR7: z-80 = viewport overlay lock (Paces ไม่มี token; precedent CustomerPanelSheet.tsx)
    <div role="dialog" aria-modal="true" aria-label="ตัวเลือกของบทสนทนา" className="fixed inset-0 z-80">
      {/* ฉากเบลอ — Base CustomerPanelSheet.tsx (`absolute inset-0 bg-default-900/40 backdrop-blur-*`)
          blur-sm ไม่ใช่ blur-xs: ต้องดันทั้งรายการให้ถอยไปเป็นพื้นหลังจริง ๆ ไม่ใช่แค่ลดความเด่น

          touch-none อยู่ที่ฉากเบลอ **ไม่ใช่ที่ตัวครอบ** (ต่างจาก MessageActionBubble): มันกัน
          scroll ทะลุไปเลื่อนรายการข้างหลังได้เหมือนกัน แต่ไม่ไปบล็อกการเลื่อน "ในเมนู" ซึ่งเมนูนี้
          ต้องการจริง (ยาวเกิน max-h-96 ได้เมื่อร้านมีกลุ่ม/แท็กเยอะ) — touch-action คิดจาก
          intersection ของ element ที่นิ้วแตะ *กับบรรพบุรุษทั้งสาย* ตัวครอบที่เป็น none จึงล็อก
          ลูกไปด้วยทั้งหมด. โคลนแถวเป็น pointer-events-none นิ้วที่ลากโดนมันจึงตกมาที่ฉากนี้ตามเดิม */}
      <div
        aria-hidden="true"
        className={`bg-default-900/40 absolute inset-0 touch-none backdrop-blur-sm transition-opacity duration-200 ease-out ${
          shown ? 'opacity-100' : 'opacity-0'
        }`}
      />

      {/* แถวที่กด — โคลนวางทับตำแหน่งเดิมเป๊ะ ไม่ซูม (ต่างจากบับเบิลข้อความ): แถวกว้างเต็มจอ
          ซูม 5% แล้วขอบซ้าย/ขวาจะล้นออกนอกจอและโดนตัด ความเด่นมาจากฉากเบลอ + เงา + ขอบแทน
          pointer-events-none: แตะโดนแล้วต้องปิด (ปล่อย event ไหลไปถึง document listener) */}
      <div
        ref={cloneHostRef}
        aria-hidden="true"
        style={{ top: clonePos?.top ?? -9999, left: clonePos?.left ?? -9999, width: clonePos?.width }}
        className={`bg-card border-default-300 pointer-events-none fixed overflow-hidden rounded-lg border shadow-lg transition-opacity duration-200 ease-out ${
          shown ? 'opacity-100' : 'opacity-0'
        }`}
      />

      {menu}
    </div>,
    document.body,
  )
}
