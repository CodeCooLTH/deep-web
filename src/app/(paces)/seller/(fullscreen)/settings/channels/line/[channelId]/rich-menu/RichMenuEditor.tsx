'use client'

/**
 * RichMenuEditor — หน้าจัดการเมนูลัดใน LINE (feature 00045, ux Design Spec §B/§C/§D)
 *
 * Base: src/app/(paces)/seller/(fullscreen)/_shared/FullscreenPageHeader.tsx (ใช้ตรง ไม่ก็อป)
 * Base: src/app/(paces)/seller/(fullscreen)/auctions/components/AuctionForm.tsx — แถบปุ่มติดล่างบนมือถือ
 * Base: src/app/(paces)/seller/(dashboard)/settings/channels/LineChannelCard.tsx — banner info/danger
 * Base: theme/paces/Admin/TS/src/app/(admin)/plugins/sweet-alerts/components/SweetAlerts.tsx
 *   (ผ่าน `pacesConfirm` ตาม convention ของ (paces))
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import Icon from '@/components/wrappers/Icon'
import { pacesToast } from '@/lib/paces-toast'
import { pacesConfirm } from '@/lib/paces-swal'
import { uploadToStorage } from '@/lib/upload-client'
import {
  RICH_MENU_LAYOUTS,
  countChatBarText,
  encodeCustomTemplateKey,
  layoutBounds,
  layoutCellCount,
  layoutRows,
  parseTemplateKey,
  type RichMenuButton,
  type RichMenuLayoutKey,
} from '@/lib/line/rich-menu'
import { RICH_MENU_CANVAS_HEIGHT, RICH_MENU_CANVAS_WIDTH, RICH_MENU_CHAT_BAR_MAX } from '@/lib/line/constants'
import {
  prepareCustomMenuImage,
  renderRichMenuBlueprint,
  renderRichMenuImage,
} from '@/lib/line/rich-menu-canvas'
import FullscreenPageHeader from '../../../../../_shared/FullscreenPageHeader'

type State = 'NONE' | 'DRAFT' | 'ACTIVE' | 'UNKNOWN'

/** คำอธิบายว่าปุ่มแต่ละชนิดทำอะไร — ผู้ขายแก้ได้แค่ "คำ" ไม่ได้แก้พฤติกรรม จึงต้องบอกให้ชัด */
const ACTION_HINT: Record<string, string> = {
  uri: 'เปิดลิงก์หน้าร้านของคุณ',
  postback: 'ตอบสถานะพัสดุอัตโนมัติ',
  location: 'รับตำแหน่งที่ลูกค้าส่งมา',
  message: 'ส่งข้อความเข้าแชท',
  datetimepicker: 'ให้ลูกค้าเลือกวันเวลา',
}

const BACK_HREF = '/settings/channels'

/**
 * กรอบช่องบนพรีวิว — เส้นคู่ ขาวทึบข้างนอก + primary ข้างใน
 *
 * เส้นสีเดียวจะจมหายเมื่อภาพของร้านมีสีตรงกับเส้น (ภาพเป็นของร้าน เราคุมสีไม่ได้เลย) Paces ไม่มี
 * primitive สำหรับ "เส้นที่ต้องอ่านออกบนพื้นสีอะไรก็ได้" จึงต้อง compose เอง — แยกเป็น const
 * เพราะ carve-out ของ HR7 ต้องเขียนกำกับ *บรรทัดเดียวกับ class* ซึ่งทำไม่ได้ถ้าฝังใน JSX
 */
const CELL_BOX = 'absolute border-2 border-white/90 shadow-[inset_0_0_0_1px_var(--color-primary)]' // HR7 carve-out: inset ring ซ้อนสองชั้น Paces ไม่มี token
const CELL_BOX_FOCUS = 'absolute border-2 border-white/90 bg-primary/20 shadow-[inset_0_0_0_3px_var(--color-primary)]' // HR7 carve-out: เดียวกัน (สถานะโฟกัส)

export default function RichMenuEditor(props: {
  channelId: string
  channelName: string
  tokenInvalid: boolean
  templateKey: string
  templateTitle: string
  initialChatBarText: string
  initialButtons: RichMenuButton[]
}) {
  const router = useRouter()
  const [chatBarText, setChatBarText] = useState(props.initialChatBarText)
  const [labels, setLabels] = useState<string[]>(props.initialButtons.map((b) => b.label))
  const [state, setState] = useState<State | null>(null)
  const [stateStale, setStateStale] = useState(false)
  const [consentAt, setConsentAt] = useState<string | null>(null)
  const [busy, setBusy] = useState<null | 'save' | 'activate' | 'deactivate'>(null)
  const [imageError, setImageError] = useState<string[] | null>(null)
  const canvasBoxRef = useRef<HTMLDivElement>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)

  // ── โหมดภาพ (D-RM-2b) ────────────────────────────────────────────────────
  const initial = parseTemplateKey(props.templateKey)
  const [mode, setMode] = useState<'AUTO' | 'CUSTOM'>(initial.mode)
  const [layoutKey, setLayoutKey] = useState<RichMenuLayoutKey>(initial.layoutKey ?? 'grid-2x2')
  /** ภาพที่ร้านอัปโหลด — เก็บแยกจาก previewUrl ของโหมด auto เพื่อให้สลับโหมดไปมาแล้วไม่ต้องอัปใหม่ */
  const [customUrl, setCustomUrl] = useState<string | null>(null)
  const [customFileId, setCustomFileId] = useState<string | null>(null)
  const [preparing, setPreparing] = useState(false)
  const [showGrid, setShowGrid] = useState(true)
  const [focusIndex, setFocusIndex] = useState<number | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const cellCount = mode === 'CUSTOM' ? layoutCellCount(layoutKey) : props.initialButtons.length

  /**
   * 🛑 จำนวนปุ่มต้องเท่าจำนวนช่องของเลย์เอาต์เสมอ — เปลี่ยนเลย์เอาต์แล้วต้องเติม/ตัดปุ่มตาม
   * ไม่งั้น `buildRichMenuPayload` จะโยน `RICH_MENU_BUTTON_COUNT_MISMATCH` ตอนกดเปิดใช้
   * ช่องที่เกินมาใช้ปุ่ม "คุยกับแอดมิน" เป็นค่าตั้งต้น เพราะเป็นปลายทางที่ทำงานเสมอไม่ว่าร้านแบบไหน
   */
  const buttons = useMemo<RichMenuButton[]>(() => {
    const base = props.initialButtons
    return Array.from({ length: cellCount }, (_, i) => {
      const src = base[i] ?? {
        key: `extra-${i}`,
        label: 'คุยกับแอดมิน',
        action: { type: 'message', text: 'ขอคุยกับแอดมินครับ/ค่ะ' } as const,
      }
      return { ...src, label: labels[i] ?? src.label }
    })
  }, [props.initialButtons, labels, cellCount])

  const chatBarLen = countChatBarText(chatBarText.trim())
  const chatBarOver = chatBarLen > RICH_MENU_CHAT_BAR_MAX
  const hasEmptyLabel = buttons.some((b) => !b.label.trim())
  const needsImage = mode === 'CUSTOM' && !customFileId
  const canSubmit =
    !chatBarOver && chatBarLen > 0 && !hasEmptyLabel && !props.tokenInvalid && !needsImage && !preparing

  const loadState = useCallback(async () => {
    try {
      const res = await fetch(`/api/channels/line/rich-menu?shopChannelId=${encodeURIComponent(props.channelId)}`)
      if (!res.ok) return
      const data = (await res.json()) as { state: State; stateStale: boolean; consentAt: string | null }
      setState(data.state)
      setStateStale(data.stateStale)
      setConsentAt(data.consentAt)
    } catch {
      // เงียบได้ — สถานะเป็นข้อมูลประกอบ ไม่ได้บล็อกการแก้ไขร่าง
    }
  }, [props.channelId])

  useEffect(() => {
    void loadState()
  }, [loadState])

  // พรีวิว = ภาพเดียวกับที่จะส่งไป LINE จริง (ไม่ได้วาดคนละทาง — FR-RM-03)
  useEffect(() => {
    if (mode === 'CUSTOM') return // ภาพมาจากร้าน ไม่ต้องวาด
    let revoked: string | null = null
    let cancelled = false
    void (async () => {
      try {
        const { blob } = await renderRichMenuImage(buttons)
        if (cancelled) return
        const url = URL.createObjectURL(blob)
        revoked = url
        setPreviewUrl((prev) => {
          if (prev) URL.revokeObjectURL(prev)
          return url
        })
      } catch {
        if (!cancelled) setPreviewUrl(null)
      }
    })()
    return () => {
      cancelled = true
      if (revoked) URL.revokeObjectURL(revoked)
    }
  }, [buttons, mode])

  /** เรนเดอร์ + อัปโหลด + บันทึกร่าง — คืน true เมื่อสำเร็จ */
  const saveDraft = useCallback(async (): Promise<boolean> => {
    setImageError(null)
    // โหมด CUSTOM ใช้ไฟล์ที่ร้านอัปโหลดไว้แล้ว — ไม่เรนเดอร์ทับ (ไม่งั้นภาพของร้านหายไปเฉย ๆ)
    let fileId = customFileId
    if (mode === 'AUTO') {
      const { blob } = await renderRichMenuImage(buttons)
      const file = new File([blob], 'rich-menu.jpg', { type: 'image/jpeg' })
      // ผ่าน direct upload เท่านั้น — ห้ามส่งไฟล์ผ่าน body ของ route (เพดาน 4.5MB ของ function)
      fileId = (await uploadToStorage(file, { purpose: 'IMAGE' })).fileId
    }
    const res = await fetch('/api/channels/line/rich-menu', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        shopChannelId: props.channelId,
        templateKey: mode === 'CUSTOM' ? encodeCustomTemplateKey(layoutKey) : props.templateKey,
        chatBarText: chatBarText.trim(),
        buttons,
        imageFileId: fileId,
      }),
    })
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { error?: string }
      pacesToast.error(body.error ?? 'บันทึกร่างไม่สำเร็จ')
      return false
    }
    return true
  }, [buttons, chatBarText, props.channelId, props.templateKey, mode, layoutKey, customFileId])

  async function handlePickFile(file: File | null) {
    if (!file) return
    setImageError(null)
    setPreparing(true)
    try {
      const prepared = await prepareCustomMenuImage(file)
      if (!prepared.ok) {
        setImageError(prepared.reasons)
        return
      }
      const uploaded = await uploadToStorage(prepared.file, { purpose: 'IMAGE' })
      setCustomFileId(uploaded.fileId)
      setCustomUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev)
        return URL.createObjectURL(prepared.file)
      })
      setShowGrid(true) // ร้านต้องเห็นก่อนว่าภาพตัวเองตรงกับช่องไหม
    } catch (e) {
      pacesToast.error(e instanceof Error ? e.message : 'เตรียมภาพไม่สำเร็จ')
    } finally {
      setPreparing(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  async function handleBlueprint() {
    try {
      const blob = await renderRichMenuBlueprint(buttons.map((b) => b.label), layoutKey)
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `เมนูลัด-แบบร่าง-${cellCount}ช่อง.png`
      a.click()
      URL.revokeObjectURL(url)
    } catch {
      pacesToast.error('สร้างแบบร่างไม่สำเร็จ')
    }
  }

  async function handleSave() {
    setBusy('save')
    try {
      if (await saveDraft()) {
        pacesToast.success('บันทึกร่างแล้ว')
        await loadState()
      }
    } catch (e) {
      pacesToast.error(e instanceof Error ? e.message : 'บันทึกร่างไม่สำเร็จ')
    } finally {
      setBusy(null)
    }
  }

  async function handleActivate() {
    /**
     * 🛑 จอขอความยินยอม (BR-RM-01) — ขึ้น **ครั้งแรกต่อเพจ** เท่านั้น
     *
     * ถ้อยคำสำคัญกว่าเลย์เอาต์ทั้งจอ: ต้องระบุชื่อเพจจริง · บอกว่า **ระบบตรวจไม่ได้** ว่ามีเมนูเดิม
     * อยู่หรือเปล่า (ห้ามเขียนทำนองว่า "ไม่พบเมนูเดิม" ซึ่งเราไม่มีทางรู้) · และบอกว่าคืนของเดิมได้
     * ทุกเมื่อ เพราะร้านที่ทำเมนูไว้เองจะเห็นของเดิมยัง "ใช้งานอยู่" ใน OA Manager ทั้งที่ลูกค้า
     * ไม่เห็นแล้ว — เป็นอาการที่ร้าน debug เองไม่ได้เลยถ้าไม่ถูกบอกไว้ก่อน
     */
    if (!consentAt) {
      const ok = await pacesConfirm.warning(
        `เปิดใช้เมนูของ Deep บนเพจ "${props.channelName}"?`,
        'ถ้าเพจนี้เคยตั้งเมนูไว้เองใน LINE Official Account Manager เมนูของ Deep จะแสดงแทนทันที — ระบบตรวจไม่ได้ว่าเพจนี้มีเมนูเดิมอยู่หรือเปล่า เพราะ LINE ไม่เปิดให้เครื่องมือภายนอกตรวจสอบส่วนนี้ และฝั่ง LINE Official Account Manager จะยังแสดงเมนูเดิมของคุณว่า "ใช้งานอยู่" ซึ่งเป็นเรื่องปกติ กดคืนเมนูเดิมได้ทุกเมื่อในหน้านี้',
        { confirmButtonText: 'เปิดใช้เมนู', cancelButtonText: 'ยกเลิก' },
      )
      if (!ok) return
    }

    setBusy('activate')
    try {
      if (!(await saveDraft())) return
      if (!consentAt) {
        const c = await fetch('/api/channels/line/rich-menu/consent', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ shopChannelId: props.channelId }),
        })
        if (!c.ok) {
          pacesToast.error('บันทึกการยืนยันไม่สำเร็จ')
          return
        }
      }
      const res = await fetch('/api/channels/line/rich-menu/activate', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ shopChannelId: props.channelId }),
      })
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string; reasons?: string[] }
        if (body.reasons?.length) setImageError(body.reasons)
        pacesToast.error(body.error ?? 'เปิดใช้เมนูไม่สำเร็จ')
        return
      }
      pacesToast.success('เปิดใช้เมนูสำเร็จ — ลูกค้าเห็นเมนูนี้แล้ว')
      await loadState()
      router.refresh()
    } catch (e) {
      pacesToast.error(e instanceof Error ? e.message : 'เปิดใช้เมนูไม่สำเร็จ')
    } finally {
      setBusy(null)
    }
  }

  async function handleDeactivate() {
    const ok = await pacesConfirm.warning(
      'คืนเมนูเดิมของเพจนี้?',
      'ลูกค้าจะไม่เห็นเมนูของ Deep อีก — เมนูที่สร้างไว้ยังอยู่ เปิดใช้ใหม่ได้ทุกเมื่อโดยไม่ต้องสร้างใหม่',
      { confirmButtonText: 'คืนเมนูเดิม', cancelButtonText: 'ไม่ใช่ตอนนี้' },
    )
    if (!ok) return
    setBusy('deactivate')
    try {
      const res = await fetch('/api/channels/line/rich-menu/deactivate', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ shopChannelId: props.channelId }),
      })
      if (!res.ok) {
        pacesToast.error('คืนเมนูเดิมไม่สำเร็จ')
        return
      }
      pacesToast.success('คืนเมนูเดิมแล้ว')
      await loadState()
      router.refresh()
    } finally {
      setBusy(null)
    }
  }

  const primaryIsDeactivate = state === 'ACTIVE'
  const actionButtons = (
    <>
      <button
        type="button"
        onClick={() => void handleSave()}
        disabled={!canSubmit || busy !== null}
        className="btn border-primary text-primary hover:bg-primary/10 min-h-11 border disabled:opacity-50 sm:min-h-0"
      >
        {busy === 'save' ? 'กำลังบันทึก…' : 'บันทึกร่าง'}
      </button>
      <button
        type="button"
        onClick={() => void (primaryIsDeactivate ? handleDeactivate() : handleActivate())}
        disabled={!canSubmit || busy !== null}
        className="btn bg-primary text-white hover:bg-primary-hover min-h-11 inline-flex items-center gap-1.5 disabled:opacity-50 sm:min-h-0"
      >
        <Icon icon={primaryIsDeactivate ? 'arrow-back-up' : 'rocket'} className="text-base" aria-hidden="true" />
        {busy === 'activate' || busy === 'deactivate'
          ? 'กำลังดำเนินการ…'
          : primaryIsDeactivate
            ? 'คืนเมนูเดิม'
            : 'เปิดใช้เมนู'}
      </button>
    </>
  )

  return (
    <>
      <FullscreenPageHeader
        title="เมนูลัดใน LINE"
        subtitle={props.channelName}
        backHref={BACK_HREF}
        toolbarExtra={<span className="hidden items-center gap-2 lg:inline-flex">{actionButtons}</span>}
      />

      {/* pb เผื่อแถบปุ่มติดล่างบนมือถือ ไม่ให้ทับเนื้อหาบรรทัดสุดท้าย */}
      <div className="mx-auto max-w-6xl pb-28 lg:pb-8">
        <div className="bg-info/15 text-info-ink mt-4 rounded-lg px-4 py-3 text-sm">
          <p className="mb-1">ตั้งค่าเมนูนี้ได้เฉพาะที่นี่ — แก้ไขผ่าน LINE Official Account Manager ไม่ได้</p>
          <p className="mb-0">การแก้ไขแต่ละครั้งจะสร้างเมนูใหม่ทดแทนของเดิมโดยอัตโนมัติ</p>
        </div>

        {props.tokenInvalid && (
          <div className="bg-danger/15 text-danger-ink mt-3 rounded-lg px-4 py-3 text-sm">
            การเชื่อมต่อ LINE OA ของเพจนี้มีปัญหา — แก้ไขคำบนปุ่มได้ แต่เปิดใช้เมนูไม่ได้จนกว่าจะเชื่อมต่อใหม่
          </div>
        )}

        {imageError && (
          <div className="bg-danger/15 text-danger-ink mt-3 rounded-lg px-4 py-3 text-sm">
            <p className="mb-1 font-semibold">ภาพเมนูไม่ผ่านเกณฑ์ของ LINE</p>
            <ul className="mb-0 ms-4 list-disc">
              {imageError.map((r) => (
                <li key={r}>{r}</li>
              ))}
            </ul>
          </div>
        )}

        <div className="mt-4 grid gap-6 lg:grid-cols-2">
          <div>
            <p className="text-default-700 mb-3 text-sm font-semibold">{props.templateTitle}</p>

            {/* แหล่งภาพเมนู — segmented control (Base: settings/chatbot/ChatbotTabs.tsx)
                สลับโหมดแล้วไม่ล้าง state ของอีกโหมด: ร้านที่อัปโหลดรูปไว้แล้วสลับไปดูของระบบ
                แล้วสลับกลับ ต้องไม่ต้องอัปโหลดใหม่ */}
            <p className="text-default-800 mb-2 text-sm font-semibold">แหล่งภาพเมนู</p>
            <div className="bg-light mb-4 flex gap-1 rounded-lg p-1" role="group" aria-label="แหล่งภาพเมนู">
              {(
                [
                  { v: 'AUTO' as const, icon: 'sparkles', label: 'ให้ระบบสร้างให้' },
                  { v: 'CUSTOM' as const, icon: 'photo', label: 'ใช้ภาพของร้านเอง' },
                ]
              ).map((o) => (
                <button
                  key={o.v}
                  type="button"
                  aria-pressed={mode === o.v}
                  onClick={() => setMode(o.v)}
                  className={`min-h-11 flex-1 rounded-md text-sm ${
                    mode === o.v ? 'bg-card text-default-900 font-semibold shadow-sm' : 'text-default-600'
                  }`}
                >
                  <span className="inline-flex items-center gap-1.5">
                    <Icon icon={o.icon} className="text-base" aria-hidden="true" />
                    {o.label}
                  </span>
                </button>
              ))}
            </div>

            {mode === 'CUSTOM' && (
              <>
                <p className="text-default-800 mb-2 text-sm font-semibold">รูปแบบการวางช่อง</p>
                <div className="mb-3 grid grid-cols-2 gap-2">
                  {(Object.keys(RICH_MENU_LAYOUTS) as RichMenuLayoutKey[]).map((k) => (
                    <button
                      key={k}
                      type="button"
                      aria-pressed={layoutKey === k}
                      onClick={() => setLayoutKey(k)}
                      className={`min-h-11 rounded-lg border px-3 py-2 text-start text-xs ${
                        layoutKey === k
                          ? 'border-primary bg-primary/10 text-primary font-semibold'
                          : 'border-default-200 text-default-700'
                      }`}
                    >
                      {RICH_MENU_LAYOUTS[k].label}
                    </button>
                  ))}
                </div>

                <button
                  type="button"
                  onClick={() => void handleBlueprint()}
                  className="btn border-primary text-primary hover:bg-primary/10 mb-3 min-h-11 w-full border"
                >
                  <Icon icon="download" className="text-base" aria-hidden="true" />
                  ดาวน์โหลดแบบร่างขนาดจริง (PNG)
                </button>

                <input
                  ref={fileRef}
                  type="file"
                  accept="image/jpeg,image/png"
                  className="hidden"
                  onChange={(e) => void handlePickFile(e.target.files?.[0] ?? null)}
                />
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  disabled={preparing}
                  className="border-default-200 hover:border-primary mb-4 w-full rounded-lg border border-dashed bg-body-bg px-4 py-6 text-center disabled:opacity-60"
                >
                  <Icon icon="cloud-upload" className="text-default-400 text-2xl" aria-hidden="true" />
                  <span className="text-default-700 mt-2 block text-sm">
                    {preparing ? 'กำลังเตรียมภาพ…' : customFileId ? 'เปลี่ยนรูป' : 'แตะเพื่อเลือกรูป'}
                  </span>
                  <span className="text-default-500 mt-1 block text-xs">
                    JPG/PNG · แนวนอนมาก (คล้ายแบนเนอร์)
                  </span>
                </button>
              </>
            )}

            <p className="text-default-800 mb-1 text-sm font-semibold">
              {mode === 'CUSTOM' ? 'คำอธิบายปุ่ม (ไม่ปรากฏบนภาพ)' : 'แก้ข้อความบนปุ่ม'}
            </p>
            {mode === 'CUSTOM' && (
              // ไม่ซ่อนใน accordion — เป็นฟิลด์บังคับ ซ่อนแล้วร้านจะงงว่าทำไมกดบันทึกไม่ได้
              <p className="text-default-500 mb-2 text-xs leading-relaxed">
                จำเป็นแม้มีตัวหนังสือในภาพแล้ว — ใช้ตอนเราสรุปให้คุณเห็นในกล่องแชทเวลาลูกค้ากด
                และช่วยผู้ใช้ที่เปิดโหมดอ่านหน้าจอให้รู้ว่าปุ่มนี้คือปุ่มอะไร
              </p>
            )}
            <div className="flex flex-col gap-3">
              {buttons.map((b, i) => (
                <div key={`${b.key}-${i}`}>
                  <label className="text-default-600 mb-1 block text-xs" htmlFor={`rm-label-${i}`}>
                    {mode === 'CUSTOM' && <span className="text-primary font-semibold">{i + 1}. </span>}
                    {ACTION_HINT[b.action.type] ?? 'ปุ่มบนเมนู'}
                  </label>
                  <input
                    id={`rm-label-${i}`}
                    className={`form-input ${!b.label.trim() ? 'is-invalid' : ''}`}
                    value={labels[i] ?? b.label}
                    // 🛑 onFocus ไม่ใช่ onMouseEnter — มือถือไม่มี hover และเป็นอุปกรณ์หลักของผู้ขาย
                    onFocus={() => setFocusIndex(i)}
                    onBlur={() => setFocusIndex(null)}
                    onChange={(e) =>
                      setLabels((prev) => {
                        const next = Array.from({ length: cellCount }, (_, idx) => prev[idx] ?? buttons[idx]?.label ?? '')
                        next[i] = e.target.value
                        return next
                      })
                    }
                  />
                  {!b.label.trim() && <p className="text-danger-ink mt-1 mb-0 text-xs">ต้องมีข้อความบนปุ่ม</p>}
                </div>
              ))}
            </div>

            <p className="text-default-800 mt-5 mb-2 text-sm font-semibold">ข้อความบนแถบเปิด-ปิดเมนู</p>
            <div className="flex items-center gap-3">
              <input
                id="rm-chatbar"
                className={`form-input max-w-48 ${chatBarOver ? 'is-invalid' : ''}`}
                value={chatBarText}
                onChange={(e) => setChatBarText(e.target.value)}
                aria-describedby="rm-chatbar-help"
              />
              {/* นับเป็น code point ตัวเดียวกับที่ server ใช้ — ห้ามนับด้วย .length (HR16) */}
              <span
                className={`text-xs tabular-nums ${chatBarOver ? 'text-danger-ink' : 'text-default-400'}`}
              >
                {chatBarLen} / {RICH_MENU_CHAT_BAR_MAX}
              </span>
            </div>
            <p id="rm-chatbar-help" className="text-default-500 mt-1 mb-0 text-xs">
              ข้อความนี้อยู่บนแถบที่ลูกค้าแตะเพื่อเปิด-ปิดเมนู
            </p>
          </div>

          <div>
            <div className="mb-2 flex items-center justify-between gap-2">
              <p className="text-default-800 mb-0 text-sm font-semibold">
                {mode === 'CUSTOM' ? 'พรีวิว — ภาพที่คุณอัปโหลด' : 'พรีวิว — ภาพที่ลูกค้าจะเห็นจริง'}
              </p>
              {mode === 'CUSTOM' && customUrl && (
                <label className="text-default-600 inline-flex min-h-11 items-center gap-2 text-xs">
                  <input
                    type="checkbox"
                    className="form-switch"
                    checked={showGrid}
                    onChange={(e) => setShowGrid(e.target.checked)}
                  />
                  แสดงเส้นแบ่งช่อง
                </label>
              )}
            </div>
            <div ref={canvasBoxRef} className="card relative overflow-hidden p-0">
              {mode === 'CUSTOM' ? (
                customUrl ? (
                  <>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={customUrl} alt="ภาพเมนูที่คุณอัปโหลด" className="block w-full" />
                    {showGrid && (
                      <div className="pointer-events-none absolute inset-0" aria-hidden="true">
                        {layoutBounds(layoutRows(layoutKey)).map((c, i) => {
                          /* ตำแหน่งคำนวณจาก layoutBounds() ตัวเดียวกับที่ส่งพิกัดให้ LINE — ห้ามวาด
                             ด้วยสูตรอื่น ไม่งั้นร้านเห็นตรงแต่ลูกค้ากดผิดช่อง (TD-RM-6)
                             เป็น inline style ที่คำนวณจากข้อมูลจริง ไม่ใช่ arbitrary class (HR7) */
                          const st = {
                            left: `${(c.x / RICH_MENU_CANVAS_WIDTH) * 100}%`,
                            top: `${(c.y / RICH_MENU_CANVAS_HEIGHT) * 100}%`,
                            width: `${(c.width / RICH_MENU_CANVAS_WIDTH) * 100}%`,
                            height: `${(c.height / RICH_MENU_CANVAS_HEIGHT) * 100}%`,
                          }
                          const on = focusIndex === i
                          return (
                            <div
                              key={i}
                              style={st}
                              className={on ? CELL_BOX_FOCUS : CELL_BOX}
                            >
                              <span className="bg-primary m-1 flex size-6 items-center justify-center rounded-full text-2xs font-bold text-white">
                                {i + 1}
                              </span>
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </>
                ) : (
                  <div className="text-default-500 flex h-40 items-center justify-center px-6 text-center text-sm">
                    ยังไม่มีภาพ — อัปโหลดภาพเมนูของร้านก่อน แล้วจะเห็นว่าปุ่มแต่ละช่องอยู่ตรงไหน
                  </div>
                )
              ) : previewUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={previewUrl} alt="ตัวอย่างเมนูลัดที่ลูกค้าจะเห็นใน LINE" className="w-full" />
              ) : (
                <div className="text-default-500 flex h-40 items-center justify-center text-sm">
                  กำลังเตรียมภาพ…
                </div>
              )}
            </div>
            {state && (
              <p className="text-default-500 mt-2 mb-0 text-xs">
                สถานะตอนนี้:{' '}
                {state === 'ACTIVE'
                  ? 'ลูกค้าเห็นเมนูนี้อยู่'
                  : state === 'DRAFT'
                    ? 'สร้างไว้แล้ว ยังไม่เปิดใช้'
                    : state === 'NONE'
                      ? 'ยังไม่ได้สร้าง'
                      : 'ไม่ได้ใช้เมนูของ Deep'}
                {stateStale && ' (อาจไม่ตรงปัจจุบัน)'}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* แถบปุ่มติดล่างบนมือถือ — โซนนิ้วโป้ง; เดสก์ท็อปปุ่มอยู่ใน header แทน
          pb = p-3 (0.75rem) + safe-area ตามท่าเดียวกับ AuctionForm.tsx (viewportFit:'cover' เปิดแล้ว
          ตั้งแต่ 2026-08-06 ก่อนหน้านั้น env() คืน 0 เสมอ — docs/conventions/ios-safe-area.md) */}
      <div className="border-default-200 bg-card fixed inset-x-0 bottom-0 z-20 flex gap-2 border-t p-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] lg:hidden"> {/* carve-out: safe-area ไม่มี token */}
        {actionButtons}
      </div>
    </>
  )
}
