'use client'

/**
 * OnboardingModal — feature 00001 — modal 5 step หลัก
 *
 * Base (modal shell / backdrop / header / footer / บานพับ open-close):
 *   theme/paces/Admin/TS/src/app/(admin)/ui/modals/page.tsx
 *   (backdrop bg-dark/40 fixed inset-0 z-80, card, border-default-300,
 *    flex flex-col, header p-5, body overflow-y-auto, footer border-t p-4)
 *
 * Base (form inputs / label):
 *   theme/paces/Admin/TS/src/app/(admin)/form/elements/components/InputTextfieldType.tsx
 *
 * Base (summary card / list):
 *   theme/paces/Admin/TS/src/app/(admin)/ui/cards/page.tsx
 *   theme/paces/Admin/TS/src/app/(admin)/ui/list-group/page.tsx
 *
 * ทำไม React-controlled overlay ไม่ใช้ hs-overlay:
 *   Preline hs-overlay พังเมื่อ re-render (feedback_filterdropdown_reusable)
 *
 * ทำไม useReducer:
 *   state หลายมิติ (5 step × หลาย field) → useReducer อ่านง่ายกว่า useState กองซ้อน
 *
 * ทำไม dynamic MapPicker:
 *   Leaflet ใช้ window — ต้อง dynamic ssr:false กัน SSR crash (SDS §5.2)
 */

import dynamic from 'next/dynamic'
import { useRouter } from 'next/navigation'
import { useReducer, useEffect, useCallback, useRef } from 'react'
import Icon from '@/components/wrappers/Icon'
import ThaiAddressSearch, { type ThaiAddress } from '@/components/safepay/ThaiAddressSearch'
import { pacesToast } from '@/lib/paces-toast'
import SalesChannelPicker from './SalesChannelPicker'
import CategoryMultiSelect from './CategoryMultiSelect'
import ProductImageDropzone from './ProductImageDropzone'

// ─── dynamic import สำหรับ MapPicker — ห้าม SSR (Leaflet ต้องการ window) ───────
const MapPicker = dynamic(() => import('./MapPicker'), { ssr: false })

// ─── Types ────────────────────────────────────────────────────────────────────

export type ModalStep = 'sales_channels' | 'categories' | 'address' | 'first_product' | 'summary'

export interface OnboardingModalProps {
  open: boolean
  initialStep?: ModalStep
  facebookPrefill?: boolean
  onClose: () => void
}

// step metadata — ลำดับคงที่
const STEPS: ModalStep[] = ['sales_channels', 'categories', 'address', 'first_product', 'summary']

// ─── State / Reducer ──────────────────────────────────────────────────────────

interface ModalState {
  currentStep: ModalStep
  // step 1
  selectedChannels: string[]
  // step 2
  selectedCategories: string[]
  // step 3
  address: string
  lat: number | null
  lng: number | null
  selectedProvince: string | null
  showMap: boolean
  provinceWarning: boolean
  provinceWarningAcknowledged: boolean
  reverseProvince: string | null
  // step 4
  productName: string
  productSku: string
  productPrice: string
  productDescription: string
  productImageIds: string[]
  // step 5
  earnedBadges: BadgeSummaryItem[]
  nextBadge: BadgeSummaryItem | null
  badgeLoadDone: boolean
  // session
  isLoading: boolean
  completedSteps: Set<ModalStep>
}

type BadgeSummaryItem = {
  id: string
  nameTH: string
  nameEN: string
  icon: string
  earned: boolean
  progressLabel: string | null
}

type ModalAction =
  | { type: 'GO_STEP'; step: ModalStep }
  | { type: 'SET_CHANNELS'; channels: string[] }
  | { type: 'SET_CATEGORIES'; categories: string[] }
  | { type: 'SET_ADDRESS'; address: string }
  | { type: 'SET_PROVINCE'; province: string | null }
  | { type: 'SET_LATLNG'; lat: number; lng: number }
  | { type: 'SET_REVERSE_PROVINCE'; province: string | null }
  | { type: 'TOGGLE_MAP' }
  | { type: 'SHOW_PROVINCE_WARNING' }
  | { type: 'ACK_PROVINCE_WARNING' }
  | { type: 'SET_PRODUCT_NAME'; name: string }
  | { type: 'SET_PRODUCT_SKU'; sku: string }
  | { type: 'SET_PRODUCT_PRICE'; price: string }
  | { type: 'SET_PRODUCT_DESCRIPTION'; desc: string }
  | { type: 'SET_IMAGE_IDS'; ids: string[] }
  | { type: 'SET_LOADING'; loading: boolean }
  | { type: 'MARK_STEP_DONE'; step: ModalStep }
  | { type: 'SET_BADGES'; earned: BadgeSummaryItem[]; next: BadgeSummaryItem | null }
  | { type: 'BADGE_LOAD_DONE' }

function initState(initialStep: ModalStep, facebookPrefill: boolean): ModalState {
  return {
    currentStep: initialStep,
    selectedChannels: facebookPrefill ? ['facebook'] : [],
    selectedCategories: [],
    address: '',
    lat: null,
    lng: null,
    selectedProvince: null,
    showMap: false,
    provinceWarning: false,
    provinceWarningAcknowledged: false,
    reverseProvince: null,
    productName: '',
    productSku: '',
    productPrice: '',
    productDescription: '',
    productImageIds: [],
    earnedBadges: [],
    nextBadge: null,
    badgeLoadDone: false,
    isLoading: false,
    completedSteps: new Set(),
  }
}

function reducer(state: ModalState, action: ModalAction): ModalState {
  switch (action.type) {
    case 'GO_STEP':
      return { ...state, currentStep: action.step }
    case 'SET_CHANNELS':
      return { ...state, selectedChannels: action.channels }
    case 'SET_CATEGORIES':
      return { ...state, selectedCategories: action.categories }
    case 'SET_ADDRESS':
      return { ...state, address: action.address }
    case 'SET_PROVINCE':
      return { ...state, selectedProvince: action.province }
    case 'SET_LATLNG':
      return { ...state, lat: action.lat, lng: action.lng }
    case 'SET_REVERSE_PROVINCE':
      return { ...state, reverseProvince: action.province }
    case 'TOGGLE_MAP':
      return { ...state, showMap: !state.showMap }
    case 'SHOW_PROVINCE_WARNING':
      return { ...state, provinceWarning: true, provinceWarningAcknowledged: false }
    case 'ACK_PROVINCE_WARNING':
      return { ...state, provinceWarningAcknowledged: true, provinceWarning: false }
    case 'SET_PRODUCT_NAME':
      return { ...state, productName: action.name }
    case 'SET_PRODUCT_SKU':
      return { ...state, productSku: action.sku }
    case 'SET_PRODUCT_PRICE':
      return { ...state, productPrice: action.price }
    case 'SET_PRODUCT_DESCRIPTION':
      return { ...state, productDescription: action.desc }
    case 'SET_IMAGE_IDS':
      return { ...state, productImageIds: action.ids }
    case 'SET_LOADING':
      return { ...state, isLoading: action.loading }
    case 'MARK_STEP_DONE': {
      const next = new Set(state.completedSteps)
      next.add(action.step)
      return { ...state, completedSteps: next }
    }
    case 'SET_BADGES':
      return { ...state, earnedBadges: action.earned, nextBadge: action.next }
    case 'BADGE_LOAD_DONE':
      return { ...state, badgeLoadDone: true }
    default:
      return state
  }
}

// ─── Progress dots ────────────────────────────────────────────────────────────

/**
 * StepDots — 5 จุดเชื่อมด้วยเส้น (done=bg-success, current=bg-primary, pending=border)
 * Base: badge pill pattern จาก theme/paces/.../ui/badges/page.tsx
 */
function StepDots({ currentIndex }: { currentIndex: number }) {
  const total = STEPS.length
  return (
    <div className="flex items-center justify-center gap-0">
      {Array.from({ length: total }).map((_, i) => {
        const isDone = i < currentIndex
        const isCurrent = i === currentIndex
        return (
          <div key={i} className="flex items-center">
            <div
              className={[
                'size-2.5 rounded-full transition-colors',
                isDone
                  ? 'bg-success'
                  : isCurrent
                    ? 'bg-primary'
                    : 'border border-default-300 bg-card',
              ].join(' ')}
            />
            {/* เส้นเชื่อมระหว่างจุด — ยกเว้นจุดสุดท้าย */}
            {i < total - 1 && (
              <div
                className={[
                  // ความกว้าง 20px ใช้ w-5 (Tailwind token = 1.25rem) ซึ่งเพียงพอแสดงเส้น
                  'h-px w-5',
                  i < currentIndex ? 'bg-success' : 'bg-default-200',
                ].join(' ')}
              />
            )}
          </div>
        )
      })}
    </div>
  )
}

// ─── Step label mapping ───────────────────────────────────────────────────────

const STEP_TITLES: Record<ModalStep, string> = {
  sales_channels: 'ช่องทางการขาย',
  categories: 'หมวดหมู่ร้านค้า',
  address: 'ที่อยู่ร้านและพิกัด',
  first_product: 'สร้างสินค้าแรก',
  summary: 'สรุปและ Achievement',
}

const STEP_SUBTITLES: Record<ModalStep, string> = {
  sales_channels: 'เลือกช่องทางที่ใช้ขายสินค้าจริงๆ ทั้งหมด เพื่อให้ลูกค้ารู้ว่าคุณขายผ่านไหนบ้าง',
  categories: 'เลือกหมวดหมู่ร้านได้สูงสุด 5 หมวด เพื่อช่วยให้ลูกค้าค้นหาร้านคุณได้ง่ายขึ้น',
  address: 'กรอกที่อยู่ร้านและ (ถ้าต้องการ) ปักหมุดตำแหน่งบนแผนที่',
  first_product: 'เพิ่มสินค้าแรกพร้อมรูปภาพเพื่อให้ลูกค้าเห็นร้านคุณตั้งแต่วันแรก',
  summary: 'สรุปสิ่งที่ตั้งค่าในครั้งนี้ พร้อม Achievement ที่ได้รับ',
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function OnboardingModal({
  open,
  initialStep = 'sales_channels',
  facebookPrefill = false,
  onClose,
}: OnboardingModalProps) {
  const router = useRouter()

  // ทำไม useReducer: state มีหลายมิติข้ามหลาย step — useReducer อ่านง่ายกว่า useState สิบกว่าตัว
  const [state, dispatch] = useReducer(reducer, undefined, () =>
    initState(initialStep, facebookPrefill)
  )

  // ─── sync initialStep เมื่อ parent ส่ง deep-link ใหม่ ──────────────────────
  const prevInitialStep = useRef(initialStep)
  useEffect(() => {
    if (open && initialStep !== prevInitialStep.current) {
      dispatch({ type: 'GO_STEP', step: initialStep })
      prevInitialStep.current = initialStep
    }
  }, [open, initialStep])

  // ─── Escape key ─────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onClose])

  // ─── โหลด badge เมื่อเข้า summary ──────────────────────────────────────────
  useEffect(() => {
    if (state.currentStep !== 'summary' || state.badgeLoadDone) return

    async function loadBadges() {
      try {
        const res = await fetch('/api/account/badge-progress', {
          headers: { 'Content-Type': 'application/json' },
        })
        if (!res.ok) {
          dispatch({ type: 'BADGE_LOAD_DONE' })
          return
        }
        // คาด response = BadgeProgress[] (getBadgeProgress จาก badge.service)
        type BadgeProgressItem = {
          badge: { id: string; nameTH?: string; nameEN: string; icon?: string }
          earned: boolean
          progressLabel: string | null
          progressRatio: number
        }
        const data: BadgeProgressItem[] = await res.json()

        const earned: BadgeSummaryItem[] = data
          .filter((b) => b.earned)
          .map((b) => ({
            id: b.badge.id,
            nameTH: b.badge.nameTH ?? b.badge.nameEN,
            nameEN: b.badge.nameEN,
            icon: b.badge.icon ?? 'award',
            earned: true,
            progressLabel: b.progressLabel,
          }))

        // next achievement = badge ที่ earned=false และ progressRatio สูงสุด
        const notEarned = data.filter((b) => !b.earned)
        const nextRaw = notEarned.sort((a, b) => b.progressRatio - a.progressRatio)[0]
        const next: BadgeSummaryItem | null = nextRaw
          ? {
              id: nextRaw.badge.id,
              nameTH: nextRaw.badge.nameTH ?? nextRaw.badge.nameEN,
              nameEN: nextRaw.badge.nameEN,
              icon: nextRaw.badge.icon ?? 'award',
              earned: false,
              progressLabel: nextRaw.progressLabel,
            }
          : null

        dispatch({ type: 'SET_BADGES', earned, next })
      } catch {
        // degrade gracefully — ซ่อน achievement section, ไม่ทำ modal พัง (SDS §6)
      } finally {
        dispatch({ type: 'BADGE_LOAD_DONE' })
      }
    }

    loadBadges()
  }, [state.currentStep, state.badgeLoadDone])

  // ─── Navigation helpers ──────────────────────────────────────────────────────

  const currentIndex = STEPS.indexOf(state.currentStep)
  const isFirstStep = currentIndex === 0
  const isLastStep = currentIndex === STEPS.length - 1

  function goNext() {
    if (!isLastStep) dispatch({ type: 'GO_STEP', step: STEPS[currentIndex + 1] })
  }

  function goBack() {
    if (!isFirstStep) dispatch({ type: 'GO_STEP', step: STEPS[currentIndex - 1] })
  }

  // ─── API handlers ────────────────────────────────────────────────────────────

  /** Step 1: POST /api/account/sales-channels */
  async function handleSaveChannels() {
    dispatch({ type: 'SET_LOADING', loading: true })
    try {
      const res = await fetch('/api/account/sales-channels', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channels: state.selectedChannels }),
      })
      if (res.ok) {
        dispatch({ type: 'MARK_STEP_DONE', step: 'sales_channels' })
        goNext()
      } else if (res.status === 429) {
        pacesToast.warning('คำขอบ่อยเกินไป กรุณารอสักครู่')
      } else {
        const data = await res.json().catch(() => ({}))
        pacesToast.error((data as { error?: string }).error ?? 'เกิดข้อผิดพลาด กรุณาลองใหม่')
      }
    } catch {
      pacesToast.error('เกิดข้อผิดพลาด กรุณาลองใหม่')
    } finally {
      dispatch({ type: 'SET_LOADING', loading: false })
    }
  }

  /** Step 2: POST /api/account/categories */
  async function handleSaveCategories() {
    if (state.selectedCategories.length === 0) {
      pacesToast.error('กรุณาเลือกหมวดหมู่อย่างน้อย 1 หมวด หรือกด "ข้ามไปก่อน"')
      return
    }
    dispatch({ type: 'SET_LOADING', loading: true })
    try {
      const res = await fetch('/api/account/categories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ categories: state.selectedCategories }),
      })
      if (res.ok) {
        dispatch({ type: 'MARK_STEP_DONE', step: 'categories' })
        goNext()
      } else if (res.status === 429) {
        pacesToast.warning('คำขอบ่อยเกินไป กรุณารอสักครู่')
      } else {
        const data = await res.json().catch(() => ({}))
        pacesToast.error((data as { error?: string }).error ?? 'เกิดข้อผิดพลาด กรุณาลองใหม่')
      }
    } catch {
      pacesToast.error('เกิดข้อผิดพลาด กรุณาลองใหม่')
    } finally {
      dispatch({ type: 'SET_LOADING', loading: false })
    }
  }

  /**
   * Step 3: reverse-geocode แล้ว POST /api/shops/update
   * ถ้าปักพิกัดและจังหวัดไม่ตรง → show warning ก่อน (ไม่ block)
   */
  async function handleSaveAddress(skipWarningCheck = false) {
    if (!state.address.trim()) {
      pacesToast.error('กรุณากรอกที่อยู่')
      return
    }

    // ถ้ามีพิกัด + ยังไม่ได้ acknowledge warning → ตรวจก่อน
    if (state.lat !== null && state.lng !== null && !skipWarningCheck) {
      dispatch({ type: 'SET_LOADING', loading: true })
      try {
        const geoRes = await fetch('/api/geo/reverse', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ lat: state.lat, lng: state.lng }),
        })
        if (geoRes.ok) {
          const geoData: { province: string | null } = await geoRes.json()
          dispatch({ type: 'SET_REVERSE_PROVINCE', province: geoData.province })

          // เทียบระดับจังหวัด (BR-10): ไม่ตรง + ไม่ null → warn (ไม่ block)
          if (
            geoData.province !== null &&
            state.selectedProvince !== null &&
            geoData.province !== state.selectedProvince
          ) {
            dispatch({ type: 'SHOW_PROVINCE_WARNING' })
            dispatch({ type: 'SET_LOADING', loading: false })
            return // รอ user กด "ยืนยัน บันทึกต่อ" (ACK_PROVINCE_WARNING) → call ซ้ำ skipWarningCheck=true
          }
        }
        // Nominatim timeout/error → degrade gracefully, บันทึกได้ (SDS §6)
      } catch {
        // degrade gracefully
      }
      dispatch({ type: 'SET_LOADING', loading: false })
    }

    // บันทึก
    dispatch({ type: 'SET_LOADING', loading: true })
    try {
      const body: Record<string, unknown> = { address: state.address }
      if (state.lat !== null && state.lng !== null) {
        body.latitude = state.lat
        body.longitude = state.lng
      }
      const res = await fetch('/api/shops/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (res.ok) {
        dispatch({ type: 'MARK_STEP_DONE', step: 'address' })
        goNext()
      } else if (res.status === 429) {
        pacesToast.warning('คำขอบ่อยเกินไป กรุณารอสักครู่')
      } else {
        const data = await res.json().catch(() => ({}))
        pacesToast.error((data as { error?: string }).error ?? 'เกิดข้อผิดพลาด กรุณาลองใหม่')
      }
    } catch {
      pacesToast.error('เกิดข้อผิดพลาด กรุณาลองใหม่')
    } finally {
      dispatch({ type: 'SET_LOADING', loading: false })
    }
  }

  /** Step 4: POST /api/products */
  async function handleCreateProduct() {
    if (!state.productName.trim()) {
      pacesToast.error('กรุณากรอกชื่อสินค้า')
      return
    }
    const priceNum = Number(state.productPrice)
    if (!state.productPrice || isNaN(priceNum) || priceNum < 0.01) {
      pacesToast.error('กรุณากรอกราคาสินค้า (ต่ำสุด ฿0.01)')
      return
    }
    dispatch({ type: 'SET_LOADING', loading: true })
    try {
      const body: Record<string, unknown> = {
        name: state.productName.trim(),
        price: priceNum,
        type: 'PHYSICAL',
      }
      if (state.productSku.trim()) body.sku = state.productSku.trim()
      if (state.productDescription.trim()) body.description = state.productDescription.trim()
      if (state.productImageIds.length > 0) body.images = state.productImageIds

      const res = await fetch('/api/products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (res.ok) {
        dispatch({ type: 'MARK_STEP_DONE', step: 'first_product' })
        pacesToast.success('สร้างสินค้าแรกเรียบร้อย!')
        goNext()
      } else if (res.status === 429) {
        pacesToast.warning('คำขอบ่อยเกินไป กรุณารอสักครู่')
      } else {
        const data = await res.json().catch(() => ({}))
        pacesToast.error((data as { error?: string }).error ?? 'ไม่สามารถสร้างสินค้าได้ กรุณาลองใหม่')
      }
    } catch {
      pacesToast.error('เกิดข้อผิดพลาด กรุณาลองใหม่')
    } finally {
      dispatch({ type: 'SET_LOADING', loading: false })
    }
  }

  if (!open) return null

  return (
    /* backdrop — Base: modal shell จาก theme/paces/Admin/TS/src/app/(admin)/ui/modals/page.tsx
       (fixed start-0 top-0 z-80 size-full overflow-y-auto) + bg-dark/40 */
    <div
      className="fixed inset-0 z-80 overflow-x-hidden overflow-y-auto flex items-center justify-center bg-dark/40"
      role="dialog"
      aria-modal="true"
      aria-labelledby="onboarding-modal-title"
      tabIndex={-1}
      onClick={(e) => {
        // ปิด modal เมื่อคลิก backdrop (ไม่ใช่ dialog เอง)
        if (e.target === e.currentTarget) onClose()
      }}
    >
      {/* dialog container — max-w-xl mobile เต็มจอ (w-full mx-3 sm:mx-auto) */}
      {/* ทำไม w-full mx-3 sm:mx-auto max-w-xl: mobile ≤ sm เต็มความกว้าง (กัน card ชิดขอบ);
          desktop ≤ xl (672px) — ไม่มี Paces token สำหรับ modal width constraint นี้ */}
      <div className="w-full mx-3 sm:mx-auto sm:max-w-xl">
        {/* card — Base: pointer-events-auto flex flex-col rounded-md border bg-white จาก modals/page.tsx */}
        <div className="border-default-300 pointer-events-auto flex flex-col rounded-md border bg-white">

          {/* ─── Header ──────────────────────────────────────────────────────── */}
          {/* Base: border-default-300 flex items-center justify-between border-b p-5 */}
          <div className="border-default-300 flex flex-col gap-3 border-b px-5 pt-5 pb-4">
            {/* row: ชื่อ step + ปุ่มปิด */}
            <div className="flex items-center justify-between">
              <h3 id="onboarding-modal-title" className="text-base font-semibold text-default-800">
                {STEP_TITLES[state.currentStep]}
              </h3>
              <button
                type="button"
                aria-label="ปิด"
                onClick={onClose}
                className="btn size-9 flex items-center justify-center text-default-500 hover:text-primary"
              >
                <span className="sr-only">ปิด</span>
                <Icon icon="x" className="size-5" />
              </button>
            </div>
            {/* progress dots */}
            <StepDots currentIndex={currentIndex} />
            {/* subtitle */}
            <p className="text-sm text-default-500">{STEP_SUBTITLES[state.currentStep]}</p>
          </div>

          {/* ─── Body (overflow-y-auto) ───────────────────────────────────────── */}
          {/* Base: overflow-y-auto p-5 จาก modals/page.tsx; max-h จำกัดเพื่อกัน modal สูงเกินจอบน mobile */}
          {/* max-h-[60vh] ใช้ vh unit — ไม่มี Paces token สำหรับ viewport-relative modal body height */}
          <div className="overflow-y-auto max-h-[60vh] p-5">

            {/* ── Step 1: ช่องทางการขาย ── */}
            {state.currentStep === 'sales_channels' && (
              <SalesChannelPicker
                value={state.selectedChannels}
                onChange={(channels) => dispatch({ type: 'SET_CHANNELS', channels })}
                disabled={state.isLoading}
              />
            )}

            {/* ── Step 2: หมวดหมู่ ── */}
            {state.currentStep === 'categories' && (
              <CategoryMultiSelect
                value={state.selectedCategories}
                onChange={(categories) => dispatch({ type: 'SET_CATEGORIES', categories })}
                max={5}
                disabled={state.isLoading}
              />
            )}

            {/* ── Step 3: ที่อยู่ + แผนที่ ── */}
            {state.currentStep === 'address' && (
              <div className="flex flex-col gap-4">
                {/* ThaiAddressSearch — prop contract ตาม SDS §5 */}
                <div>
                  <label className="form-label">ที่อยู่ร้าน</label>
                  <ThaiAddressSearch
                    onChange={(composed) => dispatch({ type: 'SET_ADDRESS', address: composed })}
                    onSelect={(a: ThaiAddress | null) =>
                      dispatch({ type: 'SET_PROVINCE', province: a?.province ?? null })
                    }
                    disabled={state.isLoading}
                  />
                </div>

                {/* toggle MapPicker */}
                <button
                  type="button"
                  onClick={() => dispatch({ type: 'TOGGLE_MAP' })}
                  className="btn bg-light hover:bg-light-hover border border-default-300 inline-flex items-center gap-2 text-sm"
                >
                  <Icon icon={state.showMap ? 'map-pin-off' : 'map-pin'} className="size-4" />
                  {state.showMap ? 'ซ่อนแผนที่' : 'ปักพิกัดบนแผนที่ (ไม่บังคับ)'}
                </button>

                {/* MapPicker — dynamic ssr:false (SDS §5.2 + Hard Rule: Leaflet ต้อง client-only) */}
                {state.showMap && (
                  <div className="card border border-default-300">
                    <div className="card-body p-2">
                      <MapPicker
                        initialLat={state.lat}
                        initialLng={state.lng}
                        onLocationChange={(lat, lng) =>
                          dispatch({ type: 'SET_LATLNG', lat, lng })
                        }
                      />
                      {state.lat !== null && (
                        <p className="mt-2 text-xs text-default-400">
                          พิกัด: {state.lat.toFixed(5)}, {state.lng?.toFixed(5)}
                        </p>
                      )}
                    </div>
                  </div>
                )}

                {/* Province warning banner (BR-10) — bg-warning/15 Paces token */}
                {state.provinceWarning && !state.provinceWarningAcknowledged && (
                  <div className="flex flex-col gap-2 rounded bg-warning/15 px-3 py-2">
                    <div className="flex items-start gap-2 text-warning text-sm">
                      <Icon icon="alert-triangle" className="size-4 mt-0.5 shrink-0" />
                      <span>
                        พิกัดอาจไม่ตรงกับที่อยู่ที่กรอก — กรุณาตรวจสอบ
                        {state.reverseProvince && state.selectedProvince
                          ? ` (พิกัด: ${state.reverseProvince}, ที่อยู่: ${state.selectedProvince})`
                          : ''}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        dispatch({ type: 'ACK_PROVINCE_WARNING' })
                        // บันทึกต่อหลัง acknowledge (skipWarningCheck=true)
                        handleSaveAddress(true)
                      }}
                      className="btn btn-sm bg-warning text-white self-start"
                    >
                      ยืนยัน บันทึกต่อ
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* ── Step 4: สร้างสินค้าแรก ── */}
            {state.currentStep === 'first_product' && (
              <div className="flex flex-col gap-4">
                {/* ชื่อสินค้า (req) — Base: form-input / form-label จาก InputTextfieldType.tsx */}
                <div>
                  <label className="form-label" htmlFor="ob-product-name">
                    ชื่อสินค้า <span className="text-danger">*</span>
                  </label>
                  <input
                    id="ob-product-name"
                    type="text"
                    className="form-input"
                    placeholder="เช่น เสื้อยืดโอเวอร์ไซส์"
                    value={state.productName}
                    onChange={(e) => dispatch({ type: 'SET_PRODUCT_NAME', name: e.target.value })}
                    disabled={state.isLoading}
                  />
                </div>

                {/* SKU (optional) */}
                <div>
                  <label className="form-label" htmlFor="ob-product-sku">
                    SKU <span className="text-default-400 text-xs">(ไม่บังคับ)</span>
                  </label>
                  <input
                    id="ob-product-sku"
                    type="text"
                    className="form-input"
                    placeholder="เช่น SKU-001"
                    value={state.productSku}
                    onChange={(e) => dispatch({ type: 'SET_PRODUCT_SKU', sku: e.target.value })}
                    disabled={state.isLoading}
                  />
                </div>

                {/* ราคา (req) — input-group ฿ prefix (Base: Paces form primitive) */}
                <div>
                  <label className="form-label" htmlFor="ob-product-price">
                    ราคา <span className="text-danger">*</span>
                  </label>
                  <div className="input-group">
                    <span className="input-group-text">฿</span>
                    <input
                      id="ob-product-price"
                      type="number"
                      min="0.01"
                      step="0.01"
                      className="form-input"
                      placeholder="0.00"
                      value={state.productPrice}
                      onChange={(e) =>
                        dispatch({ type: 'SET_PRODUCT_PRICE', price: e.target.value })
                      }
                      disabled={state.isLoading}
                    />
                  </div>
                </div>

                {/* คำอธิบาย (optional) — form-textarea Base: InputTextfieldType.tsx */}
                <div>
                  <label className="form-label" htmlFor="ob-product-desc">
                    คำอธิบาย <span className="text-default-400 text-xs">(ไม่บังคับ)</span>
                  </label>
                  <textarea
                    id="ob-product-desc"
                    rows={3}
                    className="form-input"
                    placeholder="อธิบายสินค้าของคุณ..."
                    value={state.productDescription}
                    onChange={(e) =>
                      dispatch({ type: 'SET_PRODUCT_DESCRIPTION', desc: e.target.value })
                    }
                    disabled={state.isLoading}
                  />
                </div>

                {/* ProductImageDropzone — prop contract ล็อคแล้ว */}
                <div>
                  <label className="form-label">
                    รูปสินค้า <span className="text-default-400 text-xs">(ไม่บังคับ)</span>
                  </label>
                  <ProductImageDropzone
                    value={state.productImageIds}
                    onChange={(ids) => dispatch({ type: 'SET_IMAGE_IDS', ids })}
                    disabled={state.isLoading}
                  />
                </div>
              </div>
            )}

            {/* ── Step 5: Summary ── */}
            {state.currentStep === 'summary' && (
              <div className="flex flex-col gap-4">
                {/* สรุปข้อมูล session — Base: card + list-group จาก ui/cards + ui/list-group */}
                <div className="card border border-default-300">
                  <div className="card-header">
                    <h5 className="card-title text-sm">สิ่งที่ตั้งค่าในครั้งนี้</h5>
                  </div>
                  <ul className="list-group list-group-flush">
                    <li className="list-group-item flex items-center justify-between gap-2 text-sm">
                      <span className="text-default-500 shrink-0">ช่องทางการขาย</span>
                      <span className="text-default-800 text-right">
                        {state.completedSteps.has('sales_channels') && state.selectedChannels.length > 0
                          ? state.selectedChannels.join(', ')
                          : <span className="text-default-400">ข้ามไป</span>}
                      </span>
                    </li>
                    <li className="list-group-item flex items-center justify-between gap-2 text-sm">
                      <span className="text-default-500 shrink-0">หมวดหมู่</span>
                      <span className="text-default-800 text-right">
                        {state.completedSteps.has('categories') && state.selectedCategories.length > 0
                          ? state.selectedCategories.join(', ')
                          : <span className="text-default-400">ข้ามไป</span>}
                      </span>
                    </li>
                    <li className="list-group-item flex items-center justify-between gap-2 text-sm">
                      <span className="text-default-500 shrink-0">ที่อยู่</span>
                      <span className="text-default-800 text-right truncate max-w-xs">
                        {state.completedSteps.has('address') && state.address
                          ? state.address
                          : <span className="text-default-400">ข้ามไป</span>}
                      </span>
                    </li>
                    <li className="list-group-item flex items-center justify-between gap-2 text-sm">
                      <span className="text-default-500 shrink-0">สินค้าแรก</span>
                      <span className="text-default-800">
                        {state.completedSteps.has('first_product') && state.productName
                          ? state.productName
                          : <span className="text-default-400">ข้ามไป</span>}
                      </span>
                    </li>
                  </ul>
                </div>

                {/* Achievement section — degrade gracefully ถ้า badge error (SDS §6) */}
                {state.badgeLoadDone && (
                  <div className="flex flex-col gap-3">
                    {/* Earned badges */}
                    {state.earnedBadges.length > 0 && (
                      <div className="card border border-success/30 bg-success/5">
                        <div className="card-header">
                          <h5 className="card-title text-sm text-success">
                            <Icon icon="award" className="size-4 inline me-1" />
                            Achievement ที่ได้รับ
                          </h5>
                        </div>
                        <div className="card-body flex flex-col gap-2">
                          {state.earnedBadges.map((b) => (
                            <div key={b.id} className="flex items-center gap-2">
                              <span className="badge bg-success/15 text-success rounded-full">
                                <Icon icon={b.icon} className="size-3.5 me-1" />
                                {b.nameTH}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Next achievement */}
                    {state.nextBadge && (
                      <div className="card border border-primary/20 bg-primary/5">
                        <div className="card-header">
                          <h5 className="card-title text-sm text-primary">
                            <Icon icon="target" className="size-4 inline me-1" />
                            Achievement ถัดไป
                          </h5>
                        </div>
                        <div className="card-body">
                          <div className="flex items-start gap-2">
                            <Icon icon={state.nextBadge.icon} className="size-5 text-primary shrink-0 mt-0.5" />
                            <div>
                              <p className="text-sm font-medium text-default-700">
                                {state.nextBadge.nameTH}
                              </p>
                              {state.nextBadge.progressLabel && (
                                <p className="text-xs text-default-500 mt-0.5">
                                  {state.nextBadge.progressLabel}
                                </p>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* ไม่มี badge เลย — degrade gracefully ซ่อน section ทั้งหมด (SDS §6) */}
                  </div>
                )}

                {/* loading badge indicator */}
                {!state.badgeLoadDone && (
                  <div className="flex items-center gap-2 text-default-400 text-sm">
                    <Icon icon="loader-2" className="size-4 animate-spin" />
                    กำลังโหลด Achievement...
                  </div>
                )}
              </div>
            )}

          </div>
          {/* ── end body ── */}

          {/* ─── Footer ──────────────────────────────────────────────────────── */}
          {/* Base: border-default-300 flex items-center justify-end border-t p-4 จาก modals/page.tsx
              ปรับ justify-between สำหรับ layout: ย้อนกลับ ← ช่องว่าง → ข้าม + ถัดไป */}
          <div className="border-default-300 flex items-center justify-between gap-2 border-t p-4">
            {/* ปุ่มย้อนกลับ — แสดงตั้งแต่ step ≥ 2 (index ≥ 1) */}
            {!isFirstStep ? (
              <button
                type="button"
                onClick={goBack}
                disabled={state.isLoading}
                className="btn bg-light hover:bg-light-hover disabled:pointer-events-none disabled:opacity-50"
              >
                ย้อนกลับ
              </button>
            ) : (
              <div /> /* spacer เพื่อ push ปุ่มขวาไปขวา */
            )}

            {/* ปุ่ม action ขวา */}
            <div className="flex items-center gap-2">
              {/* "ข้ามไปก่อน" — ทุก step ยกเว้น summary */}
              {state.currentStep !== 'summary' && (
                <button
                  type="button"
                  onClick={goNext}
                  disabled={state.isLoading}
                  className="btn bg-light hover:bg-light-hover text-default-600 disabled:pointer-events-none disabled:opacity-50"
                >
                  ข้ามไปก่อน
                </button>
              )}

              {/* ปุ่มหลัก (ถัดไป / บันทึก / เสร็จสิ้น) */}
              {state.currentStep === 'sales_channels' && (
                <button
                  type="button"
                  onClick={handleSaveChannels}
                  disabled={state.isLoading}
                  className="btn bg-primary text-white hover:bg-primary-hover inline-flex items-center gap-2 disabled:pointer-events-none disabled:opacity-50"
                >
                  {state.isLoading && <Icon icon="loader-2" className="size-4 animate-spin" />}
                  บันทึก
                </button>
              )}

              {state.currentStep === 'categories' && (
                <button
                  type="button"
                  onClick={handleSaveCategories}
                  disabled={state.isLoading || state.selectedCategories.length === 0}
                  className="btn bg-primary text-white hover:bg-primary-hover inline-flex items-center gap-2 disabled:pointer-events-none disabled:opacity-50"
                >
                  {state.isLoading && <Icon icon="loader-2" className="size-4 animate-spin" />}
                  บันทึก
                </button>
              )}

              {state.currentStep === 'address' && (
                <button
                  type="button"
                  onClick={() => handleSaveAddress(false)}
                  disabled={state.isLoading || !state.address.trim()}
                  className="btn bg-primary text-white hover:bg-primary-hover inline-flex items-center gap-2 disabled:pointer-events-none disabled:opacity-50"
                >
                  {state.isLoading && <Icon icon="loader-2" className="size-4 animate-spin" />}
                  บันทึก
                </button>
              )}

              {state.currentStep === 'first_product' && (
                <button
                  type="button"
                  onClick={handleCreateProduct}
                  disabled={state.isLoading}
                  className="btn bg-primary text-white hover:bg-primary-hover inline-flex items-center gap-2 disabled:pointer-events-none disabled:opacity-50"
                >
                  {state.isLoading && <Icon icon="loader-2" className="size-4 animate-spin" />}
                  สร้างสินค้า
                </button>
              )}

              {state.currentStep === 'summary' && (
                <>
                  <button
                    type="button"
                    onClick={() => {
                      onClose()
                      router.push('/orders/new')
                    }}
                    className="btn bg-light hover:bg-light-hover border border-default-300 text-sm"
                  >
                    ไปหน้าสร้างคำสั่งซื้อ
                  </button>
                  <button
                    type="button"
                    onClick={onClose}
                    className="btn bg-primary text-white hover:bg-primary-hover"
                  >
                    เสร็จสิ้น
                  </button>
                </>
              )}
            </div>
          </div>
          {/* ── end footer ── */}

        </div>
      </div>
    </div>
  )
}
