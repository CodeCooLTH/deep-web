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
import { countChatBarText, type RichMenuButton } from '@/lib/line/rich-menu'
import { RICH_MENU_CHAT_BAR_MAX } from '@/lib/line/constants'
import { renderRichMenuImage } from '@/lib/line/rich-menu-canvas'
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

  const buttons = useMemo<RichMenuButton[]>(
    () => props.initialButtons.map((b, i) => ({ ...b, label: labels[i] ?? b.label })),
    [props.initialButtons, labels],
  )

  const chatBarLen = countChatBarText(chatBarText.trim())
  const chatBarOver = chatBarLen > RICH_MENU_CHAT_BAR_MAX
  const hasEmptyLabel = labels.some((l) => !l.trim())
  const canSubmit = !chatBarOver && chatBarLen > 0 && !hasEmptyLabel && !props.tokenInvalid

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
  }, [buttons])

  /** เรนเดอร์ + อัปโหลด + บันทึกร่าง — คืน true เมื่อสำเร็จ */
  const saveDraft = useCallback(async (): Promise<boolean> => {
    setImageError(null)
    const { blob } = await renderRichMenuImage(buttons)
    const file = new File([blob], 'rich-menu.jpg', { type: 'image/jpeg' })
    // ผ่าน direct upload เท่านั้น — ห้ามส่งไฟล์ผ่าน body ของ route (เพดาน 4.5MB ของ function)
    const uploaded = await uploadToStorage(file, { purpose: 'IMAGE' })
    const res = await fetch('/api/channels/line/rich-menu', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        shopChannelId: props.channelId,
        templateKey: props.templateKey,
        chatBarText: chatBarText.trim(),
        buttons,
        imageFileId: uploaded.fileId,
      }),
    })
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { error?: string }
      pacesToast.error(body.error ?? 'บันทึกร่างไม่สำเร็จ')
      return false
    }
    return true
  }, [buttons, chatBarText, props.channelId, props.templateKey])

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

            <p className="text-default-800 mb-2 text-sm font-semibold">แก้ข้อความบนปุ่ม</p>
            <div className="flex flex-col gap-3">
              {props.initialButtons.map((b, i) => (
                <div key={b.key}>
                  <label className="text-default-600 mb-1 block text-xs" htmlFor={`rm-label-${b.key}`}>
                    {ACTION_HINT[b.action.type] ?? 'ปุ่มบนเมนู'}
                  </label>
                  <input
                    id={`rm-label-${b.key}`}
                    className={`form-input ${!labels[i]?.trim() ? 'is-invalid' : ''}`}
                    value={labels[i] ?? ''}
                    onChange={(e) =>
                      setLabels((prev) => prev.map((v, idx) => (idx === i ? e.target.value : v)))
                    }
                  />
                  {!labels[i]?.trim() && (
                    <p className="text-danger-ink mt-1 mb-0 text-xs">ต้องมีข้อความบนปุ่ม</p>
                  )}
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
            <p className="text-default-800 mb-2 text-sm font-semibold">พรีวิว — ภาพที่ลูกค้าจะเห็นจริง</p>
            <div ref={canvasBoxRef} className="card overflow-hidden p-0">
              {previewUrl ? (
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
