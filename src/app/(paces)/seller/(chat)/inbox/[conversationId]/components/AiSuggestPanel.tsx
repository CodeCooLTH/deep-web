'use client'

/**
 * AiSuggestPanel — แผง "AI ช่วยร่างคำตอบ" เหนือช่องพิมพ์ (feature 00018 composer improvement #3
 * + extension 00019 2026-07-29 usage-limit)
 *
 * เดิมเปิดแล้ว auto POST ai-suggest ทันที — ตอนนี้เช็คโควตาก่อนเสมอ (GET /api/chat/ai-quota)
 * แล้ว branch ตาม isPaidPlan/freeRemaining/canUseCredit (BR-AIQ-12) — skeleton เดิมครอบทั้ง 2
 * ขั้นต่อเนื่อง (quota-check → auto suggest) ไม่แยก loading UI ตามสเปก
 *
 * accent เขียว (success token) ตาม reference ผู้ใช้ (Hard Rule 6 — asset/สีตาม ref) — ไม่ hardcode hex
 * ใช้ text-success/bg-success token. Paces primitive เท่านั้น (HR7). Base: theme/paces card + list rows.
 *
 * layout (user สั่ง 2026-07-23): "ไม่อยากให้เป็น panel ลอย ๆ ไม่มี shadow ไม่ให้ดูเป็น popover"
 * เดิมเป็น `absolute bottom-full ... rounded-lg border shadow-lg` = การ์ดลอยทับพื้นที่ข้อความ
 * ตอนนี้เป็น **แถบในสายเลย์เอาต์** (in-flow) ของ composer: full-bleed ด้วย -mx/-mt ลบ padding ของ
 * composer ออกแล้วใส่กลับเอง → เต็มความกว้างชนขอบการ์ด, ไม่มี shadow/z-index/rounded, คั่นด้วย
 * เส้นประ border-dashed ชุดเดียวกับที่การ์ดนี้ใช้อยู่ (border-default-300) พื้น bg-success/5 บาง ๆ
 * พอให้รู้ว่าเป็นโซน AI. ผลพลอยได้: ไม่บังข้อความอีกต่อไป (ดันเนื้อหาขึ้นแทนการทับ)
 *
 * Sweet Alerts (credit path เท่านั้น): Base = SubscribeButton.tsx (inventory) — Swal.fire
 * ({ buttonsStyling:false, showLoaderOnConfirm, allowOutsideClick, preConfirm, showValidationMessage }).
 * ร้าน paid plan (unlimited path) ต้องไม่เห็น Swal ใด ๆ จากไฟล์นี้เลย (FR-AIQ-02) — โค้ด path นั้น
 * ไม่แตะ Swal/credit เลยตามโครงสร้าง (handleUseCredit ถูกเรียกจากปุ่ม credit-prompt เท่านั้น
 * ซึ่ง render เฉพาะตอน !isPaidPlan)
 */
import { useCallback, useEffect, useState } from 'react'
import { useThreadShopId } from '../../../_components/DraftOrderProvider'
import Link from 'next/link'
import Swal from 'sweetalert2'
import { formatTokensCompact, type UsageCost } from '@/lib/ai-pricing'
import Icon from '@/components/wrappers/Icon'
import { pacesToast } from '@/lib/paces-toast'

type Props = {
  conversationId: string
  onPick: (text: string) => void
  onClose: () => void
}

/** contract: GET /api/chat/ai-quota (docs/20 - Features/00019 .../EXTENSIONS-2026-07-29-usage-limit.md) */
type AiQuotaStatus = {
  isPaidPlan: boolean
  freeLimit: number
  usedToday: number | null
  freeRemaining: number | null
  canUseCredit: boolean
  priceBaht: number
  balance: number
}

// fallback message เดียวกับที่ ai-suggest ใช้อยู่เดิม — ai-quota ใช้ pattern เดียวกัน (data.error ?? fallback)
const GENERIC_RETRY_MESSAGE = 'ขอคำแนะนำไม่สำเร็จ ลองใหม่อีกครั้ง'

/**
 * phase ของแผง:
 * - loading        : กำลังเช็คโควตา (GET ai-quota) หรือกำลังขอร่าง (POST ai-suggest แบบ auto) — skeleton เดียวกัน
 * - quota-error     : GET ai-quota ล้มเหลว (fail-closed — ห้าม fallback ไป auto POST เอง)
 * - suggest-error   : POST ai-suggest (auto path) ล้มเหลว
 * - credit-prompt   : ครบโควตาฟรี + มียอดเงินพอ — รอผู้ใช้กดปุ่มแล้วยืนยันใน Swal
 * - credit-block    : ครบโควตาฟรี + ยอดเงินไม่พอ — บล็อกทันที
 * - success         : มี suggestions แล้ว (ไม่ว่าจะมาจาก unlimited/free/credit path)
 */
type Phase = 'loading' | 'quota-error' | 'suggest-error' | 'credit-prompt' | 'credit-block' | 'success'

export default function AiSuggestPanel({ conversationId, onPick, onClose }: Props) {
  const threadShopId = useThreadShopId()
  const [phase, setPhase] = useState<Phase>('loading')
  const [quota, setQuota] = useState<AiQuotaStatus | null>(null)
  const [quotaError, setQuotaError] = useState<string | null>(null)
  const [suggestError, setSuggestError] = useState<string | null>(null)
  const [suggestions, setSuggestions] = useState<string[]>([])
  /**
   * ต้นทุนจริงของรอบล่าสุด (user 2026-07-31: "จะได้คิดราคาขายได้")
   * null = ยังไม่เคยขอ หรือ Gemini ไม่ส่ง usageMetadata กลับมา — ต้องไม่แสดง 0 หลอกตา
   */
  const [cost, setCost] = useState<UsageCost | null>(null)

  // POST ai-suggest แบบ auto (unlimited path / free path เท่านั้น — credit path ยิงผ่าน handleUseCredit
  // ใน Swal preConfirm แยกต่างหาก ไม่ผ่านฟังก์ชันนี้)
  const fetchSuggestions = useCallback(async () => {
    setPhase('loading')
    try {
      const res = await fetch(`/api/chat/conversations/${conversationId}/ai-suggest`, { method: 'POST' })
      const data = await res.json().catch(() => null)
      if (!res.ok) {
        // race condition (FR-AIQ-07): โควตาที่เห็นตอน GET ai-quota ถูกคนอื่นของร้านเดียวกันใช้หมดไปก่อน
        // POST มาถึง — ไม่ใช่ error ทั่วไป ให้ตกไปสถานะ credit-prompt/credit-block ตาม canUseCredit จริง
        if (res.status === 402 && data?.error === 'QUOTA_EXCEEDED') {
          setQuota((prev) => (prev ? { ...prev, freeRemaining: 0, canUseCredit: !!data.canUseCredit } : prev))
          setPhase(data.canUseCredit ? 'credit-prompt' : 'credit-block')
          return
        }
        setSuggestError(data?.error ?? GENERIC_RETRY_MESSAGE)
        setPhase('suggest-error')
        return
      }
      setSuggestions(Array.isArray(data?.suggestions) ? data.suggestions : [])
      setCost((data?.cost as UsageCost | null) ?? null)
      setPhase('success')
    } catch {
      setSuggestError(GENERIC_RETRY_MESSAGE)
      setPhase('suggest-error')
    }
  }, [conversationId])

  // GET ai-quota — ก่อนเสมอ (BR-AIQ-12) ตัดสินว่าจะ auto POST / โชว์ปุ่มยอดเงิน / บล็อก
  const fetchQuota = useCallback(async () => {
    setPhase('loading')
    setQuotaError(null)
    try {
      // feature 00037 — โควตา AI เป็นของรายร้าน ต้องถามของ 'ร้านเจ้าของเธรด' ไม่ใช่ร้าน active
      const res = await fetch(`/api/chat/ai-quota${threadShopId ? `?shopId=${threadShopId}` : ''}`)
      const data = await res.json().catch(() => null)
      if (!res.ok) {
        setQuotaError(data?.error ?? GENERIC_RETRY_MESSAGE)
        setPhase('quota-error')
        return
      }
      const status = data as AiQuotaStatus
      setQuota(status)
      if (status.isPaidPlan || (status.freeRemaining ?? 0) > 0) {
        fetchSuggestions() // unlimited path / free path — auto ต่อเนื่อง ไม่มี dialog คั่น
      } else if (status.canUseCredit) {
        setPhase('credit-prompt')
      } else {
        setPhase('credit-block')
      }
    } catch {
      setQuotaError(GENERIC_RETRY_MESSAGE)
      setPhase('quota-error')
    }
  }, [fetchSuggestions])

  useEffect(() => {
    fetchQuota()
  }, [fetchQuota])

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  // credit path — Base: SubscribeButton.tsx handleOpenDialog ทั้งฟังก์ชัน (confirm+fetch ใน flow เดียว,
  // error ค้าง dialog ผ่าน showValidationMessage) ต่างจาก Base ตรงที่ต้องส่ง body {confirmUseCredit:true}
  const handleUseCredit = useCallback(async () => {
    const balance = quota?.balance ?? 0
    const priceBaht = quota?.priceBaht ?? 1

    const result = await Swal.fire({
      buttonsStyling: false,
      icon: 'question',
      title: 'ใช้เงินในกระเป๋า ฿1 ขอร่างเพิ่ม?',
      text: `ยอดคงเหลือในกระเป๋าเงิน ฿${balance}`,
      showCancelButton: true,
      confirmButtonText: 'ใช้เงินในกระเป๋า ฿1',
      cancelButtonText: 'ยกเลิก',
      showLoaderOnConfirm: true,
      allowOutsideClick: () => !Swal.isLoading(),
      customClass: {
        confirmButton: 'btn bg-primary text-white hover:bg-primary-hover mt-2 me-2',
        cancelButton: 'btn bg-light hover:text-default-800 mt-2',
      },
      preConfirm: async () => {
        try {
          const res = await fetch(`/api/chat/conversations/${conversationId}/ai-suggest`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ confirmUseCredit: true }),
          })
          const data = await res.json().catch(() => null)
          if (res.ok) return data
          if (res.status === 402 && data?.error === 'INSUFFICIENT_CREDIT') {
            Swal.showValidationMessage('ยอดเงินไม่พอ — <a href="/wallet" class="underline">เติมเงิน</a>')
            return false
          }
          Swal.showValidationMessage(typeof data?.error === 'string' ? data.error : 'เกิดข้อผิดพลาด กรุณาลองใหม่')
          return false
        } catch {
          Swal.showValidationMessage('เกิดข้อผิดพลาด กรุณาลองใหม่')
          return false
        }
      },
    })

    if (result.isConfirmed && result.value) {
      const data = result.value as { suggestions?: string[]; cost?: UsageCost | null }
      setSuggestions(Array.isArray(data.suggestions) ? data.suggestions : [])
      setCost(data.cost ?? null)
      setPhase('success')
      // API ไม่ส่ง balance หลังหักกลับมาตรง ๆ (contract response 200 มีแค่ suggestions/usedCredit/freeRemaining)
      // คำนวณจากยอดที่รู้ล่าสุด (จาก GET ai-quota) ลบราคาคงที่ ฿1 — ค่าประมาณที่ดีที่สุดที่ client มี
      const newBalance = Math.max(0, balance - priceBaht)
      pacesToast.success(`หักเงิน ฿1 แล้ว คงเหลือ ฿${newBalance}`)
    }
  }, [conversationId, quota])

  // ซ่อนปุ่ม refresh เฉพาะสถานะ quota-blocked (credit-prompt/credit-block) — กดแล้วเจอ 402 ซ้ำไม่มีประโยชน์
  // และ quota-error (ยังไม่รู้โควตา — ใช้ปุ่ม "ลองใหม่" ในเนื้อหาแทน ซึ่งยิง GET ai-quota ไม่ใช่ POST)
  const showRefreshButton = phase === 'loading' || phase === 'suggest-error' || phase === 'success'

  return (
    <div className="border-default-300 bg-success/5 -mx-4 -mt-3 mb-3 border-b border-dashed px-4 py-2 sm:-mx-6 sm:-mt-3.75 sm:px-6">
      {/* header — ไม่มีเส้นคั่นในตัวแล้ว (แถบทั้งก้อนถูกคั่นจาก composer ด้วยเส้นประด้านล่างพอ) */}
      <div className="flex items-center justify-between pb-1.5">
        <span className="text-success flex items-center gap-2 text-sm font-semibold">
          <Icon icon="sparkles" className="text-base" />
          AI ช่วยร่างคำตอบ
          {quota?.isPaidPlan && <span className="badge bg-success/15 text-success">ใช้ได้ไม่จำกัด</span>}
        </span>
        <div className="flex items-center gap-2">
          {!quota?.isPaidPlan && typeof quota?.freeRemaining === 'number' && quota.freeRemaining > 0 && (
            <span className="text-default-700 text-xs">เหลือฟรีวันนี้ {quota.freeRemaining}/10</span>
          )}
          {/* ต้นทุนจริงของรอบล่าสุด (user 2026-07-31 — ย้ายจาก footer มาไว้ข้างปุ่ม refresh)
              อยู่หัวแผงเพราะเป็นตัวเลขที่ร้านต้องเห็นสะสมจนคาดเดาค่าใช้จ่ายรายเดือนได้เอง
              ไม่ใช่หมายเหตุท้ายแผงที่สายตาข้ามไป */}
          {cost && (
            <span
              className="bg-default-100 text-default-600 rounded-full px-2 py-0.5 text-2xs tabular-nums whitespace-nowrap"
              title={`${cost.model} · เข้า ${cost.inputTokens.toLocaleString()} token · ออก ${cost.outputTokens.toLocaleString()} token${cost.isEstimate ? ' · ไม่มีเรตของรุ่นนี้ ใช้เรตสูงสุดแทน (ค่าจริงถูกกว่านี้)' : ''}`}
            >
              {formatTokensCompact(cost.inputTokens + cost.outputTokens)} Token,{' '}
              {cost.isEstimate ? '≤' : ''}
              {cost.costUsd.toFixed(4)} USD
            </span>
          )}
          <div className="flex items-center gap-1">
            {showRefreshButton && (
              <button
                type="button"
                onClick={fetchSuggestions}
                disabled={phase === 'loading'}
                className="text-default-700 hover:text-success flex size-7 items-center justify-center rounded"
                aria-label="ขอคำแนะนำใหม่"
                title="ขอคำแนะนำใหม่"
              >
                <Icon icon="refresh" className={`text-base ${phase === 'loading' ? 'animate-spin' : ''}`} />
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="text-default-700 hover:text-default-800 flex size-7 items-center justify-center rounded"
              aria-label="ปิด"
            >
              <Icon icon="x" className="text-base" />
            </button>
          </div>
        </div>
      </div>

      {/* body — max-h กันร่างยาว ๆ 3 อันดันช่องข้อความหายไปทั้งจอ (แถบนี้อยู่ในสายเลย์เอาต์แล้ว
          ความสูงของมันกินพื้นที่เธรดจริง ต่างจากตอนเป็น popover ลอย) */}
      <div className="flex max-h-64 flex-col gap-2 overflow-y-auto">
        {phase === 'loading' ? (
          <>
            {[0, 1, 2].map((i) => (
              <div key={i} className="bg-default-100 h-11 animate-pulse rounded-lg" />
            ))}
          </>
        ) : phase === 'quota-error' ? (
          <div className="text-default-700 flex flex-col items-center gap-2 py-4 text-center text-sm">
            <Icon icon="alert-circle" className="text-warning text-2xl" />
            <span>{quotaError}</span>
            <button type="button" onClick={fetchQuota} className="btn btn-sm border-default-300">
              <Icon icon="refresh" className="me-1" /> ลองใหม่
            </button>
          </div>
        ) : phase === 'suggest-error' ? (
          <div className="text-default-700 flex flex-col items-center gap-2 py-4 text-center text-sm">
            <Icon icon="alert-circle" className="text-warning text-2xl" />
            <span>{suggestError}</span>
            <button type="button" onClick={fetchSuggestions} className="btn btn-sm border-default-300">
              <Icon icon="refresh" className="me-1" /> ลองใหม่
            </button>
          </div>
        ) : phase === 'credit-prompt' ? (
          <div className="text-default-700 flex flex-col items-center gap-2 py-4 text-center text-sm">
            <span>ใช้ฟรีครบ 10 ครั้งของวันนี้แล้ว</span>
            <button type="button" onClick={handleUseCredit} className="btn btn-sm bg-primary text-white">
              ใช้เงินในกระเป๋า ฿1 เพื่อขอร่างเพิ่ม
            </button>
          </div>
        ) : phase === 'credit-block' ? (
          <div className="text-default-700 flex flex-col items-center gap-2 py-4 text-center text-sm">
            <Icon icon="alert-circle" className="text-warning text-2xl" />
            <span>ยอดเงินไม่พอ (คงเหลือ ฿{quota?.balance ?? 0})</span>
            <div className="flex items-center gap-2">
              <Link href="/wallet" className="btn btn-sm border-default-300">
                เติมเงิน
              </Link>
              <Link href="/business" className="btn btn-sm border-default-300">
                อัพเกรดแพ็กเกจ ใช้ AI ไม่จำกัด
              </Link>
            </div>
          </div>
        ) : (
          suggestions.map((s, i) => (
            <button
              key={i}
              type="button"
              onClick={() => onPick(s)}
              className="bg-card border-default-200 hover:border-success rounded-lg border px-3 py-2.5 text-left text-sm text-default-800 transition-colors"
            >
              {s}
            </button>
          ))
        )}
      </div>

      {/* footer disclaimer — ไม่มีเส้นคั่นในตัว (ดูเหตุผลที่ header) */}
      <div className="text-default-700 pt-1.5 text-2xs">
        AI สร้างคำแนะนำ — ตรวจทานก่อนส่งทุกครั้ง
      </div>
    </div>
  )
}
