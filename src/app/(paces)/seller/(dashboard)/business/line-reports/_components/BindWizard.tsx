'use client'

/**
 * BindWizard — ผูกกลุ่ม LINE 3 ขั้น (create / resume PENDING / rebind INACTIVE) · feature 00068 · E2
 *
 * Base: ไม่พบ theme match สำหรับ stepper (addendum E §9 ข้อ 2) — ใช้แพตเทิร์น `<ol>` + วงกลมเลขขั้นของ
 *   src/app/(paces)/seller/(dashboard)/settings/channels/LineChannelCard.tsx (LineConnectWizard)
 *   ← theme/paces/Admin/TS/src/app/(admin)/ui/cards/page.tsx (.card) · form/elements/components/ChecksRadioSwitches.tsx (checkbox)
 *
 * กติกา (addendum E §4.1):
 *  1. สร้างกลุ่มครั้งเดียวต่อ wizard — ได้ groupId แล้ว ทุกการสร้างโค้ดใหม่ใช้ `/groups/{id}/bind-code` (ไม่ยิง `/bind-code` ซ้ำ ไม่งั้น PENDING ค้างเต็มเพดาน 10)
 *  2. ห้าม router.replace ตอนสร้างสำเร็จ (unmount แล้วโค้ดหาย) — ใช้ history.replaceState เปลี่ยน URL เฉย ๆ
 *  3. ผูกสำเร็จ → แบนเนอร์ + ปุ่มไปตั้งค่า → refresh ให้ RSC render โหมดตั้งค่า
 * 🛑 โค้ดดิบอยู่ใน state เท่านั้น (ไม่ localStorage/URL) · โมดูลนี้ห้าม import config.ts/bind-code.ts (server-only/node crypto) — addFriendUrl มาเป็น prop
 * poll: setTimeout ต่อเมื่อคำขอก่อนเสร็จ (ไม่ซ้อน · GET 120/นาที/IP) · หยุดเมื่อแท็บซ่อน · ออฟไลน์ไม่หยุดนับถอยหลัง · 404 → กลับรายการ
 */
import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { QRCodeSVG } from 'qrcode.react'
import Icon from '@/components/wrappers/Icon'
import { pacesToast } from '@/lib/paces-toast'
import {
  DENIED_FALLBACK_MESSAGE,
  POLL_NOTICE,
  bindCodeRequest,
  canCreateCode,
  classifyPollStatus,
  createHint,
  initialSelection,
  pickedShopsSummary,
  togglePick,
} from '@/lib/line-report/bind-wizard-rules'
import BindCodeBox from './BindCodeBox'
import CodeCountdown from './CodeCountdown'
import ShopPicker, { type PickerShop } from './ShopPicker'

const LIST_HREF = '/business/line-reports'
const POLL_MS = 3000
const FALLBACK_ERROR = 'เกิดข้อผิดพลาด ลองอีกครั้ง'

type Phase = 'form' | 'waiting' | 'expired' | 'bound'
type StepState = 'done' | 'current' | 'todo'

export type BindWizardProps = {
  mode: 'create' | 'resume' | 'rebind'
  /** create: ร้านที่เลือกได้ (จาก listReportableShops) */
  shops?: readonly PickerShop[]
  /** resume/rebind: id กลุ่มที่มีอยู่แล้ว */
  groupId?: string
  /** resume/rebind: ชื่อร้านที่กลุ่มรวมอยู่ (แสดงสรุปอย่างเดียว) */
  shopNames?: readonly string[]
  /** resume: โค้ดเดิมยังใช้ได้อยู่ไหม + หมดอายุเมื่อไหร่ (ไม่มีโค้ดดิบ) */
  liveCodeExpiresAt?: string | null
  /** null = ไม่ได้ตั้ง LINE_REPORT_BOT_BASIC_ID → ซ่อน QR/ปุ่มเปิด LINE */
  addFriendUrl: string | null
  /** เหตุที่สร้างโค้ดไม่ได้ (แพ็กเกจหยุด/บอทไม่พร้อม) — null = ใช้ได้ */
  blockedReason?: string | null
}

type ApiResult = { ok: boolean; status: number; data: { message?: string; [k: string]: unknown } }

async function call(url: string, method: 'GET' | 'POST', body?: unknown): Promise<ApiResult> {
  try {
    const res = await fetch(url, {
      method,
      credentials: 'same-origin',
      cache: 'no-store',
      headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
    const data = await res.json().catch(() => ({}))
    return { ok: res.ok, status: res.status, data }
  } catch {
    return { ok: false, status: 0, data: { message: 'เชื่อมต่อไม่ได้ ลองอีกครั้ง' } }
  }
}

function Step({ n, state, title, children }: { n: number; state: StepState; title: string; children?: React.ReactNode }) {
  return (
    <li aria-current={state === 'current' ? 'step' : undefined} className="border-default-200 flex gap-3 border-t border-dashed pt-5 first:border-t-0 first:pt-0">
      <span
        aria-hidden="true"
        className={`flex size-8 shrink-0 items-center justify-center rounded-full text-sm font-semibold ${state === 'current' ? 'bg-primary text-white' : 'bg-primary/15 text-primary'}`}
      >
        {state === 'done' ? <Icon icon="check" className="text-base" /> : n}
      </span>
      <div className="min-w-0 flex-1">
        <h5 className="text-default-800 mb-1 text-md font-semibold">
          {title}
        </h5>
        {children}
      </div>
    </li>
  )
}

export default function BindWizard({ mode, shops = [], groupId: groupIdProp, shopNames = [], liveCodeExpiresAt = null, addFriendUrl, blockedReason = null }: BindWizardProps) {
  const router = useRouter()
  const [groupId, setGroupId] = useState<string | null>(groupIdProp ?? null)
  const [selected, setSelected] = useState<string[]>(() => initialSelection(shops))
  const [acknowledged, setAcknowledged] = useState(false)
  const [busy, setBusy] = useState(false)
  const [code, setCode] = useState<string | null>(null)
  const [expiresAt, setExpiresAt] = useState<string | null>(null)
  const [phase, setPhase] = useState<Phase>('form')
  // ข้อความสถานะของ poll ที่ค้างอยู่ (null = ปกติ) — DENIED = หยุด poll แล้ว
  const [notice, setNotice] = useState<string | null>(null)
  const [showQr, setShowQr] = useState(false)
  const inflight = useRef(false)

  const pickedNames = groupIdProp ? shopNames : shops.filter((s) => selected.includes(s.id)).map((s) => s.name)
  const available = blockedReason === null && (mode !== 'create' || shops.length > 0)
  const createReady = canCreateCode({ selectedIds: selected, acknowledged, busy, available })
  // ได้ groupId แล้ว (หรือเปิดกลุ่มเดิม) = สร้างโค้ดใหม่ผ่าน endpoint ของกลุ่ม ไม่ต้องรับทราบซ้ำ (API §4.3)
  const regenReady = !busy && available

  async function submit() {
    if (inflight.current) return
    if (groupId ? !regenReady : !createReady) return
    inflight.current = true
    setBusy(true)
    try {
      const req = bindCodeRequest({ groupId, selected, mode })
      if (!req) return
      const r = await call(req.url, 'POST', req.body)
      if (!r.ok) {
        pacesToast.error(r.data.message ?? FALLBACK_ERROR)
        if (r.status === 404) router.push(LIST_HREF)
        return
      }
      const id = r.data.groupId as string
      if (!groupId) {
        setGroupId(id)
        // เปลี่ยนแค่ URL ให้รีโหลดแล้วตกที่โหมด resume — ห้าม router.replace (unmount แล้วโค้ดหาย)
        window.history.replaceState(null, '', `${LIST_HREF}/${id}`)
      }
      setCode(r.data.code as string)
      setExpiresAt(r.data.expiresAt as string)
      setNotice(null)
      setPhase('waiting')
    } finally {
      inflight.current = false
      setBusy(false)
    }
  }

  // poll สถานะผูกกลุ่มเฉพาะตอนรอ
  useEffect(() => {
    if (phase !== 'waiting' || !groupId) return
    let stopped = false
    let running = false
    let timer: ReturnType<typeof setTimeout> | undefined

    const check = async () => {
      const r = await call(`/api/line-report/groups/${groupId}`, 'GET')
      if (stopped) return
      if (!r.ok) {
        const kind = classifyPollStatus(r.status)
        if (kind === 'GONE') {
          stopped = true
          pacesToast.error('ไม่พบกลุ่มนี้')
          router.push(LIST_HREF)
        } else if (kind === 'DENIED') {
          stopped = true
          const msg = r.data.message ?? DENIED_FALLBACK_MESSAGE
          pacesToast.error(msg)
          setNotice(msg)
        } else {
          setNotice(POLL_NOTICE[kind])
        }
        return
      }
      setNotice(null)
      const g = r.data.group as { status: string; bind: { hasLiveCode: boolean; expiresAt: string | null } }
      if (g.status === 'ACTIVE') {
        stopped = true
        setPhase('bound')
      } else if (!g.bind.hasLiveCode) {
        stopped = true
        setPhase('expired')
      } else if (g.bind.expiresAt) {
        setExpiresAt(g.bind.expiresAt)
      }
    }
    const loop = async () => {
      if (stopped) return
      // แท็บซ่อน = ข้ามรอบ (ไม่ยิง) · กลับมา visible แล้ว onVisible ยิงทันที
      if (document.visibilityState === 'visible' && !running) {
        running = true
        await check()
        running = false
      }
      if (!stopped) timer = setTimeout(loop, POLL_MS)
    }
    const onVisible = () => {
      if (document.visibilityState === 'visible' && !running) {
        clearTimeout(timer)
        void loop()
      }
    }
    document.addEventListener('visibilitychange', onVisible)
    timer = setTimeout(loop, POLL_MS)
    return () => {
      stopped = true
      clearTimeout(timer)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [phase, groupId, router])

  // นับถึงศูนย์: GET อีกครั้งเดียวก่อนหยุด กันแข่งกับกลุ่มที่เพิ่งผูกสำเร็จในวินาทีสุดท้าย
  async function onExpire() {
    if (groupId) {
      const r = await call(`/api/line-report/groups/${groupId}`, 'GET')
      if (r.ok && (r.data.group as { status: string }).status === 'ACTIVE') {
        setPhase('bound')
        return
      }
    }
    setPhase('expired')
  }

  function goConfigure() {
    // create: URL ถูก replaceState ไว้แล้ว แต่ router ฝั่ง Next ยังไม่ผูกกับ RSC ของหน้านั้น → replace ให้ชัวร์ (ผูกสำเร็จแล้วไม่ต้องใช้โค้ดอีก)
    if (mode === 'create' && groupId) router.replace(`${LIST_HREF}/${groupId}`)
    else router.refresh()
  }

  const hasCode = code !== null && expiresAt !== null
  const bound = phase === 'bound'
  const step2: StepState = hasCode || bound ? 'done' : 'current'
  const step3: StepState = bound ? 'done' : hasCode ? 'current' : 'todo'
  const hint = createHint({ selectedIds: selected, acknowledged })
  // server บอกว่ายังมีโค้ดสด → ให้ CodeCountdown ตัดสินหมดอายุฝั่ง client (ไม่อ่านนาฬิกาตอน SSR กัน hydration mismatch)
  const resumeLive = mode === 'resume' && liveCodeExpiresAt !== null

  return (
    <div className="card mb-base max-w-3xl">
      <div className="card-body">
        <ol role="list" className="m-0 flex list-none flex-col gap-5 p-0">
          <Step n={1} state="done" title="เพิ่ม Deep รายงานยอด เข้ากลุ่ม LINE">
            <p className="text-default-700 mb-2 text-sm">เพิ่มบอทเป็นเพื่อนก่อน แล้วเชิญบอทเข้ากลุ่มที่ต้องการรับรายงาน</p>
            <p className="text-default-700 mb-3 flex items-start gap-1.5 text-xs">
              <Icon icon="info-circle" className="mt-0.5 shrink-0 text-sm" aria-hidden="true" />
              กลุ่มหนึ่งมี OA ได้ตัวเดียว — ถ้ามี OA อื่น (เช่น OA ของร้าน) ในกลุ่ม ให้นำออกก่อน
            </p>
            {addFriendUrl ? (
              <>
                <div className="flex flex-wrap gap-2">
                  <a
                    href={addFriendUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn btn-sm border-default-300 bg-card text-default-700 hover:bg-default-50 inline-flex items-center gap-1.5 border"
                  >
                    <Icon icon="brand-line" className="text-base" aria-hidden="true" />
                    เปิดใน LINE
                  </a>
                  <button
                    type="button"
                    aria-expanded={showQr}
                    onClick={() => setShowQr((v) => !v)}
                    className="btn btn-sm border-default-300 bg-card text-default-700 hover:bg-default-50 inline-flex items-center gap-1.5 border"
                  >
                    <Icon icon="qrcode" className="text-base" aria-hidden="true" />
                    {showQr ? 'ซ่อน QR' : 'แสดง QR'}
                  </button>
                </div>
                {showQr && (
                  <div className="border-default-200 mt-3 flex w-fit items-center justify-center rounded-lg border bg-white p-4">
                    <QRCodeSVG value={addFriendUrl} size={160} />
                  </div>
                )}
              </>
            ) : (
              <p className="text-default-700 mb-0 text-xs">ยังไม่มีลิงก์เพิ่มเพื่อนของบอท ค้นหา Deep รายงานยอด ใน LINE เอง</p>
            )}
          </Step>

          <Step n={2} state={step2} title={mode === 'create' ? 'เลือกร้านและสร้างโค้ดผูกกลุ่ม' : 'สร้างโค้ดผูกกลุ่ม'}>
            {hasCode || bound ? (
              <>
                <p className="text-default-700 mb-0 text-sm break-words">{pickedShopsSummary(pickedNames)}</p>
                {mode === 'create' && <p className="text-default-700 mt-0.5 mb-0 text-xs">เปลี่ยนร้านได้หลังผูกเสร็จ</p>}
              </>
            ) : mode === 'create' ? (
              <>
                <p className="text-default-700 mb-2 text-sm">เลือก 1 ร้านเป็นรายงานของสาขา เลือกหลายร้านเป็นรายงานรวมพร้อมแยกรายร้าน</p>
                <ShopPicker shops={shops} selected={selected} onToggle={(id) => setSelected((cur) => togglePick(cur, id))} />
                <label className="mt-2 flex min-h-11 cursor-pointer items-start gap-2.5 py-2">
                  <input type="checkbox" className="form-checkbox mt-0.5 shrink-0" checked={acknowledged} onChange={(e) => setAcknowledged(e.target.checked)} />
                  <span className="text-default-800 text-sm">รับทราบว่าทุกคนในกลุ่มจะเห็นตัวเลขที่ส่ง และ Deep ลบข้อความที่ส่งไปแล้วออกจากกลุ่มไม่ได้</span>
                </label>
                <button
                  type="button"
                  onClick={submit}
                  disabled={!createReady}
                  className="btn bg-primary hover:bg-primary-hover mt-2 inline-flex w-full items-center justify-center gap-1.5 text-white sm:w-auto"
                >
                  {busy && <Icon icon="loader-2" className="animate-spin text-base" aria-hidden="true" />}
                  สร้างโค้ด
                </button>
                <p className="text-default-700 mt-2 mb-0 text-xs">{blockedReason ?? hint ?? 'โค้ดใช้ได้ 10 นาที และใช้ผูกได้ครั้งเดียว'}</p>
              </>
            ) : (
              <>
                {pickedNames.length > 0 && <p className="text-default-700 mb-2 text-sm break-words">{pickedShopsSummary(pickedNames)}</p>}
                <div className="bg-light rounded-lg p-4">
                  {mode === 'rebind' ? (
                    <p className="text-default-800 mb-3 text-sm">ผูกกลุ่มนี้อีกครั้ง — ค่าที่ตั้งไว้เดิมยังอยู่ครบ</p>
                  ) : (
                    <>
                      <p className="text-default-800 mb-1 text-sm">โค้ดที่สร้างไว้แสดงซ้ำไม่ได้</p>
                      <p className="text-default-700 mb-3 text-xs">
                        {resumeLive ? (
                          <CodeCountdown expiresAt={liveCodeExpiresAt} prefix="โค้ดเดิมยังใช้ได้อีก " expiredText="โค้ดเดิมหมดอายุแล้ว" />
                        ) : (
                          'โค้ดเดิมหมดอายุแล้ว'
                        )}
                      </p>
                    </>
                  )}
                  <button
                    type="button"
                    onClick={submit}
                    disabled={!regenReady}
                    className="btn bg-primary hover:bg-primary-hover inline-flex w-full items-center justify-center gap-1.5 text-white sm:w-auto"
                  >
                    <Icon icon={busy ? 'loader-2' : mode === 'rebind' ? 'link' : 'refresh'} className={`text-base ${busy ? 'animate-spin' : ''}`} aria-hidden="true" />
                    {mode === 'rebind' ? 'สร้างโค้ด' : 'สร้างโค้ดใหม่'}
                  </button>
                  {blockedReason && <p className="text-default-700 mt-2 mb-0 text-xs">{blockedReason}</p>}
                </div>
              </>
            )}
          </Step>

          <Step n={3} state={step3} title="พิมพ์ในกลุ่ม แล้วรอสักครู่">
            {/* wrapper อยู่ใน DOM ตลอด เพื่อให้ screen reader ประกาศเมื่อเนื้อในเปลี่ยน (หมดอายุ/ผูกสำเร็จ/poll ล้ม) — ห้ามใส่ role บนกล่องที่โผล่มาพร้อมข้อความ */}
            <div role="status">
              {bound ? (
                <div className="bg-success/15 text-success-ink rounded-lg p-4">
                  <p className="mb-3 flex items-center gap-1.5 text-sm font-medium">
                    <Icon icon="circle-check" className="text-lg" aria-hidden="true" />
                    ผูกกลุ่มสำเร็จแล้ว
                  </p>
                  <button type="button" onClick={goConfigure} className="btn bg-primary hover:bg-primary-hover inline-flex w-full items-center justify-center text-white sm:w-auto">
                    ตั้งค่ารายงานของกลุ่มนี้
                  </button>
                </div>
              ) : hasCode ? (
                <>
                  <p className="text-default-700 mb-3 text-sm">
                    {phase === 'expired' ? 'สร้างโค้ดใหม่แล้วพิมพ์ในกลุ่มอีกครั้ง' : 'พิมพ์ข้อความด้านล่างในกลุ่มที่เชิญบอทไว้แล้ว หน้านี้จะอัปเดตเองเมื่อผูกสำเร็จ'}
                  </p>
                  <BindCodeBox
                    code={code}
                    expiresAt={expiresAt}
                    expired={phase === 'expired'}
                    busy={busy}
                    blockedReason={blockedReason}
                    onExpire={onExpire}
                    onRegenerate={submit}
                  />
                  {notice && phase === 'waiting' && (
                    <p className="text-warning-ink mt-2 mb-0 flex items-center gap-1.5 text-xs">
                      <Icon icon="alert-triangle" className="text-sm" aria-hidden="true" />
                      {notice}
                    </p>
                  )}
                </>
              ) : null}
            </div>
          </Step>
        </ol>

        {!bound && (
          <div className="mt-6">
            <Link href={LIST_HREF} className="text-primary inline-flex min-h-11 items-center text-sm">
              ยกเลิก
            </Link>
          </div>
        )}
      </div>
    </div>
  )
}
