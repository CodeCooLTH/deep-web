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

/**
 * เปลือกของแผ่นคำสั่ง (โหมดเพ่ง) — แยกออกมาเป็นค่าคงที่เพราะต้องมีคอมเมนต์ carve-out กำกับ
 * "บรรทัดที่ใช้ค่า arbitrary จริง" ตาม HR7 ซึ่งเขียนแทรกกลาง template literal ใน JSX ไม่ได้
 */
const SHEET_SHELL = 'bg-card relative max-h-[85dvh] w-full overflow-y-auto rounded-t-2xl pt-2 pb-[calc(env(safe-area-inset-bottom)+1rem)] shadow-lg' // HR7 carve-out: Paces ไม่มี token viewport-height/safe-area — precedent CustomerPanelSheet.tsx/OrderQrSheet.tsx บรรทัดเดียวกัน

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
  /** กลุ่มที่เธรดนี้อยู่ตอนนี้ — ชิปกลุ่มต้องย้ำได้ว่าอยู่กลุ่มไหน และกดซ้ำ = เอาออกจากกลุ่ม */
  currentGroupId: string | null
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
  currentGroupId,
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
  // point: clamp ไม่ให้ล้นขอบขวา/ล่างของจอ — ตรรกะเดิมทุกบรรทัด
  // row: แผงยึดขอบล่างจออยู่แล้ว (bottom sheet) ไม่ต้องคำนวณ — ที่ต้องคำนวณคือ "แถวที่ยกลอย"
  //      ต้องไม่ถูกแผงบัง (ดู layout effect ล่าง)
  const [clonePos, setClonePos] = useState<{ top: number; left: number; width: number } | null>(null)
  // แยกจาก clonePos เพื่อให้ transition ได้วิ่ง (ตั้งใน rAF = หลัง paint แรกที่ยัง opacity-0)
  const [shown, setShown] = useState(false)
  // นับครั้งที่ "พื้นที่ที่มองเห็นจริง" เปลี่ยน (คีย์บอร์ดขึ้น-ลง / หมุนจอ) → บังคับวัดตำแหน่งใหม่
  const [viewportTick, setViewportTick] = useState(0)
  /** ความสูงคีย์บอร์ดที่กินขอบล่างจออยู่ตอนนี้ — แผ่นคำสั่งต้องยกขึ้นเท่านี้ (ดู layout effect) */
  const [bottomInset, setBottomInset] = useState(0)
  // ตัวเลข clamp ต้องตามขนาดการ์ดจริง: กว้าง w-74 (296px) + กันชน, สูงสุด max-h-96 + py-3 สองข้าง
  // (เดิมเป็น 220/280 ตามเมนูรายการแบบเก่าที่กว้าง w-52 — ไม่อัปเดตแล้วการ์ดจะล้นขอบล่างจอ)
  const pointLeft = Math.min(pointX, (typeof window !== 'undefined' ? window.innerWidth : pointX) - 312)
  const pointTop = Math.min(pointY, (typeof window !== 'undefined' ? window.innerHeight : pointY) - 416)

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

  // ── ตำแหน่งของแถวที่ยกลอย ────────────────────────────────────────────────
  // แถวอยู่ "ที่เดิม" เป็นค่าตั้งต้น (นั่นคือสิ่งที่ทำให้รู้ว่ากำลังจัดการแชทไหน) — ยกเว้นตอนที่มันจะ
  // ไปนอนใต้แผง: แถวล่าง ๆ ของจอกับแผงสูง ~430px ทับกันแน่นอน แล้วโหมดเพ่งจะเหลือแต่ฉากเบลอเปล่า
  // ไม่มีบริบทว่ากดแชทไหน จึงดันแถวขึ้นมาให้พ้นหลังคาแผงพอดี (ยังคง left/width เดิม)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el || !row) return
    const { height: sheetH } = el.getBoundingClientRect()
    // ขอบเขต "ที่มองเห็นจริง" ไม่ใช่ innerHeight — บน iOS คีย์บอร์ด (ช่องค้นหาด้านบนรายการ) หด
    // visual viewport แต่ไม่หด layout viewport ของที่ position:fixed จึงไปนอนใต้คีย์บอร์ดได้
    const vv = window.visualViewport
    const minTop = (vv ? vv.offsetTop : 0) + EDGE
    const maxBottom = (vv ? vv.offsetTop + vv.height : window.innerHeight) - EDGE

    const rect = row.getBoundingClientRect()
    const ceiling = maxBottom - sheetH - GAP - rect.height
    setClonePos({
      top: Math.max(minTop, Math.min(rect.top, ceiling)),
      left: rect.left,
      width: rect.width,
    })
    // แผ่นยึด "ขอบล่างที่มองเห็นจริง" ไม่ใช่ขอบล่างของ layout viewport — บน iOS คีย์บอร์ด (ที่เปิดจาก
    // ช่องเพิ่มแท็กในแผ่นนี้เอง) ไม่หด layout viewport ของที่ position:fixed แผ่นจึงไปนอนใต้คีย์บอร์ด
    // ทั้งใบ พิมพ์แท็กไม่ได้เลย. ยกขอบล่างขึ้นเท่าความสูงคีย์บอร์ดแทน (0 เมื่อไม่มีคีย์บอร์ด)
    setBottomInset(vv ? Math.max(0, window.innerHeight - (vv.offsetTop + vv.height)) : 0)
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


  // ── ชิ้นส่วนที่ใช้ร่วมทั้งสองโหมด ────────────────────────────────────────
  //
  // ภาษาใหม่ของแผงนี้ (user: "มันไม่สวย" 2026-08-06) — ของเดิมคือดรอปดาวน์เดสก์ท็อปกว้าง 208px
  // ที่ถูกยืดเป็น 8 บล็อกเรียงลงมา ทุกแถวหน้าตาเท่ากันหมด ตาไม่มีที่เกาะ และบนจอ 390px มันใช้
  // ความกว้างครึ่งเดียวแต่ยาวเกือบเต็มจอ. ที่เปลี่ยน:
  //   - 4 คำสั่งที่ใช้บ่อยสุด = ไทล์แถวเดียว (เห็นทีเดียวครบ ไม่ต้องไล่อ่านทีละบรรทัด)
  //   - สถานะการขาย = segmented (เห็นค่าปัจจุบัน + เปลี่ยนใน 1 แตะ จากเดิม 3 บรรทัดหาเครื่องหมายถูก)
  //   - กลุ่ม/แท็ก = ชิป (สแกนแนวนอน ไม่ใช่รายการยาว)
  //   - เสียง = สวิตช์ .form-switch (เห็นสถานะโดยไม่ต้องอ่านคำว่าเปิด/ปิด)
  //   - เส้นคั่นเหลือเส้นเดียว จากเดิม 4 เส้น
  // Base: theme/paces/Admin/TS/src/app/(admin)/ui/{offcanvas,modals}/page.tsx (โครง sheet ผ่าน
  // CustomerPanelSheet.tsx) + .form-switch/.badge/.btn ของธีม — ไม่มีคอมโพเนนต์ที่ประกอบขึ้นเอง

  /** ทุกเป้ากดในโหมด sheet ต้อง ≥44px ตาม PRODUCT.md (กลุ่มผู้ใช้ digital-literacy ต่ำ/ผู้สูงวัย) */
  const tileCls =
    'flex min-h-15 flex-col items-center justify-center gap-1.5 rounded-lg px-1 text-xs font-medium transition-colors disabled:opacity-50'

  const tiles = (
    // action ประจำแถว (user สั่ง 2026-07-23: "action ที่ทำได้ในแต่ละ chat ต้องมีอยู่ใน right click
    // ด้วย") — ชุดเดียวกับปุ่มลอยตอน hover (desktop) และปัดซ้าย (มือถือ) ปิดแผงทันทีที่สั่ง
    // เพราะ parent จะ refetch รายการแล้วสถานะในแผงจะค้างของเก่า
    // สีไอคอนบอกน้ำหนักของคำสั่ง ไม่ใช่ตกแต่ง: ปักหมุด=warning, ปิดงาน=success (งานจบแล้ว),
    // ซ่อน=กลาง, สแปม=danger. ใช้ token `-ink` เพราะเป็นตัวอักษร/ไอคอนบนพื้นอ่อน (ดู DESIGN.md
    // "สองโทน: เขียวเป็นพื้น vs เขียวเป็นหมึก")
    <div className="grid grid-cols-4 gap-2 px-3 pb-3">
      {(
        [
          { action: (isPinned ? 'unpin' : 'pin') as RowAction, icon: isPinned ? 'star-off' : 'star', label: isPinned ? 'เลิกปักหมุด' : 'ปักหมุด', tone: 'text-warning-ink', on: isPinned },
          { action: (isResolved ? 'reopen' : 'resolve') as RowAction, icon: isResolved ? 'arrow-back-up' : 'circle-check', label: isResolved ? 'เปิดใหม่' : 'ปิดงาน', tone: 'text-success-ink', on: isResolved },
          { action: (hiddenContext ? 'unhide' : 'hide') as RowAction, icon: hiddenContext ? 'eye' : 'eye-off', label: hiddenContext ? 'เลิกซ่อน' : 'ซ่อน', tone: 'text-default-700', on: false },
          { action: (isSpam ? 'unspam' : 'spam') as RowAction, icon: isSpam ? 'inbox' : 'alert-octagon', label: isSpam ? 'ไม่ใช่สแปม' : 'สแปม', tone: 'text-danger-ink', on: isSpam },
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
          className={`${tileCls} ${
            item.on
              ? 'bg-primary/15 text-primary-ink'
              : 'bg-default-100 text-default-800 hover:bg-default-200'
          }`}
        >
          <Icon icon={item.icon} className={`text-xl ${item.on ? 'text-primary-ink' : item.tone}`} />
          <span className="text-center leading-tight">{item.label}</span>
        </button>
      ))}
    </div>
  )

  const salesSegmented = (
    <div className="px-4 pb-3">
      <p className="text-default-700 text-2xs mb-1.5 font-semibold">สถานะการขาย</p>
      <div className="bg-default-100 flex gap-1 rounded-lg p-1">
        {STATUS_OPTIONS.map((o) => {
          const active = salesStatus === o.value
          return (
            <button
              key={o.value}
              type="button"
              role="menuitemradio"
              aria-checked={active}
              disabled={busy}
              onClick={() => patch({ salesStatus: o.value }, `ตั้งสถานะ "${o.label}" แล้ว`)}
              className={`flex min-h-9 flex-1 items-center justify-center gap-1 rounded-md text-sm disabled:opacity-50 ${
                active ? `bg-card font-semibold shadow-sm ${o.cls}` : 'text-default-800'
              }`}
            >
              {active && <Icon icon="check" className="text-sm" />}
              {o.label}
            </button>
          )
        })}
      </div>
    </div>
  )

  /** ชิปเลือกกลุ่ม — กดกลุ่มที่อยู่แล้วซ้ำ = เอาออกจากกลุ่ม (ไม่ต้องมีปุ่ม "เอาออก" แยก) */
  const groupChips = (
    <div className="px-4 pb-3">
      <p className="text-default-700 text-2xs mb-1.5 font-semibold">กลุ่ม</p>
      {groups.length === 0 ? (
        <p className="text-default-700 text-2xs">ยังไม่มีกลุ่ม — กด “+” ที่แถบกลุ่มด้านบนเพื่อสร้าง</p>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {groups.map((g) => {
            const active = currentGroupId === g.id
            return (
              <button
                key={g.id}
                type="button"
                role="menuitemradio"
                aria-checked={active}
                onClick={() => onMoveToGroup(active ? null : g.id)}
                className={`inline-flex min-h-9 items-center gap-1.5 rounded-full px-3 text-sm ${
                  active ? 'bg-primary/15 text-primary-ink font-semibold' : 'bg-default-100 text-default-800 hover:bg-default-200'
                }`}
              >
                <Icon icon={active ? 'folder-filled' : 'folder'} className="text-base" />
                {g.name}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )

  const tagChips = (
    <div className="px-4 pb-3">
      <p className="text-default-700 text-2xs mb-1.5 font-semibold">แท็ก</p>
      {tags.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-1.5">
          {tags.map((t) => (
            <span
              key={t}
              className="bg-primary/15 text-primary-ink inline-flex min-h-8 items-center gap-1.5 rounded-full ps-3 pe-2 text-xs"
            >
              {t}
              <button
                type="button"
                disabled={busy}
                onClick={() => patch({ tags: tags.filter((x) => x !== t) }, 'ลบแท็กแล้ว')}
                aria-label={`ลบแท็ก ${t}`}
                className="hover:bg-primary/20 flex size-5 items-center justify-center rounded-full disabled:opacity-50"
              >
                <Icon icon="x" width={12} height={12} />
              </button>
            </span>
          ))}
        </div>
      )}
      <TagInput selected={tags} onAdd={(t) => patch({ tags: [...tags, t] }, `เพิ่มแท็ก "${t}" แล้ว`)} />
    </div>
  )

  const soundRow = (
    <>
      {/* เสียงเฉพาะแชทนี้ — ปิดเสียงระดับแอปอยู่จะบอกตรง ๆ ว่าตั้งตรงนี้ก็ไม่มีผล (สวิตช์ระดับแอป
          อยู่ที่ปุ่มลำโพงบนหัวหน้าแชท) ดีกว่าซ่อนจนผู้ใช้หาไม่เจอว่าปิดไว้ที่ไหน
          เป็นสวิตช์ ไม่ใช่รายการ "ปิดเสียง/เปิดเสียง" เพราะมันคือสถานะเปิด-ปิด ไม่ใช่คำสั่งครั้งเดียว */}
      <label className="text-default-800 flex min-h-12 cursor-pointer items-center gap-3 px-4 text-sm">
        <Icon icon={threadMuted ? 'bell-off' : 'bell'} className="text-default-700 text-lg" />
        <span className="grow">เสียงแจ้งเตือนของแชทนี้</span>
        <input
          type="checkbox"
          className="form-switch"
          checked={!threadMuted}
          onChange={() => setConversationMuted(conversationId, !threadMuted)}
        />
      </label>
      {appMuted && (
        <p className="bg-warning/15 text-warning-ink text-2xs mx-4 mt-1 rounded-md px-2.5 py-1.5">
          ตอนนี้ปิดเสียงทั้งแอปอยู่ — ตั้งค่านี้จะยังไม่มีผล
        </p>
      )}
    </>
  )

  const body = (
    <>
      {tiles}
      {external && salesSegmented}
      {external && groupChips}
      {external && tagChips}
      <hr className="border-default-300 mx-4 mb-2 border-t" />
      {soundRow}
    </>
  )

  // render ผ่าน portal ที่ document.body — หลุดจาก Chat Rail/การ์ดที่มี overflow/transform ซึ่ง clip
  // ตัว fixed จนแสดงไม่เต็ม (user report 2026-07-23). document.body มีเสมอ (แผงโผล่ฝั่ง client)
  //
  // โหมด point (คลิกขวาบนเดสก์ท็อป) = การ์ดเกาะเคอร์เซอร์ เนื้อในชุดเดียวกับ sheet แต่แน่นกว่า
  // ไม่มีฉากเบลอ ไม่ยกแถว — เมาส์ยังต้องเห็น/ใช้รายการรอบ ๆ ได้
  if (!row) {
    return createPortal(
      <div
        ref={ref}
        role="menu"
        style={{ top: pointTop, left: pointLeft }}
        className="border-default-300 bg-card fixed z-50 max-h-96 w-74 overflow-y-auto rounded-lg border py-3 shadow-lg"
      >
        {body}
      </div>,
      document.body,
    )
  }

  return createPortal(
    // โหมดเพ่ง (กดค้างบนมือถือ) — แถวที่กดลอยอยู่ที่เดิมเหนือฉากเบลอ ชุดคำสั่งขึ้นมาจากขอบล่าง
    // ซึ่งเป็นโซนที่นิ้วโป้งเอื้อมถึงจริง และอยู่ตำแหน่งเดิมทุกครั้งไม่ว่าจะกดแถวไหน (user เลือก
    // ทิศทาง A จาก mockup 2026-08-06)
    // HR7: z-80 = viewport overlay lock (Paces ไม่มี token; precedent CustomerPanelSheet.tsx)
    <div
      role="dialog"
      aria-modal="true"
      aria-label="ตัวเลือกของบทสนทนา"
      // top-0 + bottom แบบคำนวณ (ไม่ใช่ inset-0) — ขอบล่างต้องเป็นขอบล่าง "ที่มองเห็นจริง"
      // ไม่งั้นคีย์บอร์ดที่เปิดจากช่องเพิ่มแท็กจะทับแผ่นทั้งใบ (ดู bottomInset)
      style={{ bottom: bottomInset }}
      className="fixed inset-x-0 top-0 z-80 flex items-end justify-center"
    >
      {/* ฉากเบลอ — Base CustomerPanelSheet.tsx. blur-sm ไม่ใช่ blur-xs: ต้องดันทั้งรายการให้ถอยไป
          เป็นพื้นหลังจริง ๆ ไม่ใช่แค่ลดความเด่น
          touch-none อยู่ที่ฉากเบลอ ไม่ใช่ที่ตัวครอบ: กัน scroll ทะลุไปเลื่อนรายการข้างหลังได้เหมือนกัน
          แต่ไม่บล็อกการเลื่อน "ในแผง" ซึ่งจำเป็นเมื่อร้านมีกลุ่ม/แท็กเยอะจนแผงชนเพดาน 85dvh —
          touch-action คิดจาก intersection ของ element ที่นิ้วแตะ *กับบรรพบุรุษทั้งสาย* */}
      <button
        type="button"
        aria-label="ปิด"
        onClick={onClose}
        className={`bg-default-900/40 absolute inset-0 touch-none backdrop-blur-sm transition-opacity duration-200 ease-out ${
          shown ? 'opacity-100' : 'opacity-0'
        }`}
      />

      {/* แถวที่กด — โคลนวางทับตำแหน่งเดิม ไม่ซูม (ต่างจากบับเบิลข้อความที่ซูม 5%): แถวกว้างเต็มจอ
          ซูมแล้วขอบซ้าย/ขวาล้นออกนอกจอโดนตัด ความเด่นมาจากฉากเบลอ + เงา + ขอบแทน
          pointer-events-none: แตะโดนแล้วต้องปิด (ปล่อยให้ event ตกไปถึงฉากเบลอที่อยู่ข้างล่าง) */}
      <div
        ref={cloneHostRef}
        aria-hidden="true"
        style={{ top: clonePos?.top ?? -9999, left: clonePos?.left ?? -9999, width: clonePos?.width }}
        className={`bg-card border-default-300 pointer-events-none fixed overflow-hidden rounded-lg border shadow-lg transition-opacity duration-200 ease-out ${
          shown ? 'opacity-100' : 'opacity-0'
        }`}
      />

      {/* แผ่นคำสั่ง — HR7 carve-out: ไม่มี token viewport-height/safe-area ใน Paces scale
          (precedent บรรทัดเดียวกันที่ CustomerPanelSheet.tsx / OrderQrSheet.tsx) */}
      <div
        ref={ref}
        role="menu"
        className={`${SHEET_SHELL} transition-transform duration-200 ease-out ${
          shown ? 'translate-y-0' : 'translate-y-full'
        }`}
      >
        {/* grip — บอกว่าแผ่นนี้มาจากขอบล่าง (precedent CustomerPanelSheet.tsx) */}
        <div className="bg-default-300 mx-auto mb-3 h-1 w-9 rounded-full" />
        {body}
      </div>
    </div>,
    document.body,
  )
}
