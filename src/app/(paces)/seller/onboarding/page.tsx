'use client'

/**
 * /onboarding — เฟส 2 ตั้งค่าร้านครั้งแรก (setup) หลังลงทะเบียน (มีเบอร์แล้ว, ผ่าน /dashboard มาแล้ว)
 * เด้งจาก proxy เมื่อ token.needsOnboarding (ไม่มี slug).
 *
 * Layout: หน้า seller เปล่า (Paces card centered) — ไม่ใช้ AuthCardShell ของ auth/sign-up
 * polish (safepay-ux): icon วงกลมต่อ step (focal point) + "ขั้นที่ x/N" + spacing กระชับ
 *   Base icon circle: theme/paces/Admin/TS/src/app/(admin)/pages/contact-us/page.tsx (size rounded-full bg-{c}/15)
 * field component จริง: ChoiceSelect / input-icon-group + Icon / form-textarea / input-group / invalid-msg
 * Flow: 1.ประเภทร้านค้า(ใหม่ feature 00028) → 2.หมวดหมู่ → 3.URL (slug) → 4.ที่อยู่ (address)
 *   → 5.สินค้าแรก/คิวงานแรก(ONLINE_SALES/SERVICE_QUEUE) หรือจบที่ที่อยู่แล้วไป /rooms/new (LODGING)
 *   → /dashboard
 * spec: docs/superpowers/specs/2026-06-17-fb-onboarding-flow-diagram.html
 *   + docs/20 - Features/00028 - Shop Business Type/UX-Design-Spec.md §A1
 *
 * feature 00028 (U10) — step ใหม่ 'vertical' แทรกก่อนสุด (ตัดสินใจกลับไม่ได้ที่สุดในทั้ง flow —
 * ต้องมาก่อน category เพราะ step ท้าย ๆ ต้องรู้ vertical ก่อนถึงจะตัดสินใจได้ว่าจะแสดง field ชุดไหน)
 * จำนวน step ไม่เท่ากันตาม vertical: ONLINE_SALES/SERVICE_QUEUE = 5 step, LODGING = 4 step
 * (ไม่มี step 'product' — ปุ่มที่ step 'address' นำทางออกไป /rooms/new แทน)
 */

import AuthLogo from '@/components/AuthLogo'
import BackToBusinessButton from './components/BackToBusinessButton'
import Icon from '@/components/wrappers/Icon'
import ChoiceSelect from '@/components/wrappers/ChoiceSelect'
import ThaiAddressSearch from '@/components/safepay/ThaiAddressSearch'
import VerticalTaxonomyPicker, { VERTICAL_LOCK_NOTICE } from '@/components/safepay/VerticalTaxonomyPicker'
import { pacesToast } from '@/lib/paces-toast'
import { SHOP_CATEGORY_LABELS, SHOP_CATEGORY_KEYS } from '@/lib/shop-categories'
import { isValidSlugFormat, isReservedSlug, normalizeSlug } from '@/lib/shop-slug'
import { DEFAULT_SHOP_VERTICAL, type ShopVertical } from '@/lib/lodging'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

type Step = 'vertical' | 'category' | 'slug' | 'address' | 'product'
type Check = 'idle' | 'checking' | 'ok' | 'taken' | 'invalid'
const CATEGORY_OPTIONS = SHOP_CATEGORY_KEYS.map((k) => ({ value: k, label: SHOP_CATEGORY_LABELS[k] }))

// subtitle ของ address ไม่คงที่ — เปลี่ยนตาม vertical ที่เลือกไว้ (Content outline UX spec §A1)
const ADDRESS_SUBTITLE: Record<ShopVertical, string> = {
  ONLINE_SALES: 'ที่อยู่สำหรับจัดส่งสินค้า',
  SERVICE_QUEUE: 'ที่อยู่ร้าน ให้ลูกค้ารู้ว่าต้องมาหาที่ไหน',
  LODGING: 'ที่อยู่ที่พัก ให้ผู้เข้าพักหาเจอ',
}

const STEP_META: Record<Exclude<Step, 'address' | 'product'>, { icon: string; heading: string; subtitle: string }> = {
  vertical: { icon: 'building-store', heading: 'ร้านของคุณเป็นแบบไหน', subtitle: VERTICAL_LOCK_NOTICE },
  category: { icon: 'category', heading: 'เลือกหมวดหมู่ร้านของคุณ', subtitle: 'เลือกหมวดที่ตรงกับสินค้าของคุณมากที่สุด' },
  slug: { icon: 'link', heading: 'ตั้ง URL ร้านของคุณ', subtitle: 'ลูกค้าจะค้นหาร้านคุณผ่านลิงก์นี้' },
}

/** หน้า seller เปล่า — Paces card centered (ไม่ใช่ auth split-card) */
function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-default-100 p-4">
      <div className="card w-full max-w-md">
        <div className="card-body p-6 sm:p-8">{children}</div>
      </div>
    </div>
  )
}

export default function OnboardingPage() {
  const { data: session, status, update } = useSession()
  const router = useRouter()
  const user = (session?.user ?? {}) as { needsOnboarding?: boolean }

  const [step, setStep] = useState<Step>('vertical')
  const [ready, setReady] = useState(false)

  // feature 00028 (U10) — ค่าเริ่มต้น ONLINE_SALES ตาม BR-SBT-07, เปลี่ยนได้จนกว่าจะกด "ถัดไป"
  // feature 00030 — null = เลือกหมวด "รับนัดหมายและจอง" แล้วแต่ยังไม่เลือกหมวดย่อย (ปุ่มถัดไปปิด)
  // ค่าตั้งต้นยังเป็น ONLINE_SALES เหมือนเดิม (BR-SBT-07) ผู้ใช้ที่ไม่แตะอะไรเลยกดถัดไปได้ทันที
  const [vertical, setVertical] = useState<ShopVertical | null>(DEFAULT_SHOP_VERTICAL)
  const [vLoading, setVLoading] = useState(false)

  const [category, setCategory] = useState('')
  const [catLoading, setCatLoading] = useState(false)

  const [slug, setSlug] = useState('')
  const [sStatus, setSStatus] = useState<Check>('idle')
  const [slugLoading, setSlugLoading] = useState(false)
  const sDebounce = useRef<ReturnType<typeof setTimeout> | null>(null)

  const [address, setAddress] = useState('')
  const [addrLoading, setAddrLoading] = useState(false)

  const [pName, setPName] = useState('')
  const [pPrice, setPPrice] = useState('')
  const [pLoading, setPLoading] = useState(false)

  // SERVICE_QUEUE — step สุดท้ายกลายเป็น "สร้างคิวงานแรก" แทนสินค้า
  const [qName, setQName] = useState('')
  const [qCapacity, setQCapacity] = useState('1')
  const [qLoading, setQLoading] = useState(false)

  useEffect(() => {
    if (status === 'loading') return
    if (status === 'unauthenticated') { router.replace('/auth/sign-in'); return }
    if (!user.needsOnboarding) { router.replace('/dashboard'); return }
    if (!ready) setReady(true)
  }, [status, user, ready, router])

  // dot progress dynamic ตาม vertical — LODGING ไม่มี step 'product' (4 step แทน 5)
  const stepDots = useMemo<Step[]>(
    () => (vertical === 'LODGING' ? ['vertical', 'category', 'slug', 'address'] : ['vertical', 'category', 'slug', 'address', 'product']),
    [vertical],
  )

  const submitVertical = async () => {
    if (!vertical) return pacesToast.error('กรุณาเลือกให้ครบว่าลูกค้ามาแบบไหน')
    setVLoading(true)
    try {
      const res = await fetch('/api/shops/update', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ vertical }) })
      if (res.ok) setStep('category')
      else pacesToast.error('บันทึกไม่สำเร็จ กรุณาลองใหม่')
    } catch { pacesToast.error('เกิดข้อผิดพลาด กรุณาลองใหม่') } finally { setVLoading(false) }
  }

  const submitCategory = async () => {
    if (!category) return pacesToast.error('กรุณาเลือกหมวดหมู่ร้านค้า')
    setCatLoading(true)
    try {
      const res = await fetch('/api/shops/update', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ category }) })
      if (res.ok) setStep('slug')
      else pacesToast.error('บันทึกไม่สำเร็จ กรุณาลองใหม่')
    } catch { pacesToast.error('เกิดข้อผิดพลาด กรุณาลองใหม่') } finally { setCatLoading(false) }
  }

  const onSlug = (v: string) => {
    const cleaned = v.toLowerCase().replace(/[^a-z0-9-]/g, '')
    setSlug(cleaned); setSStatus('idle')
    if (sDebounce.current) clearTimeout(sDebounce.current)
    const n = normalizeSlug(cleaned)
    if (!n || !isValidSlugFormat(n) || isReservedSlug(n)) { setSStatus(cleaned.length >= 3 ? 'invalid' : 'idle'); return }
    if (cleaned.length < 3) return
    setSStatus('checking')
    sDebounce.current = setTimeout(async () => {
      try { const res = await fetch(`/api/shops/check-slug?slug=${encodeURIComponent(n)}`); const d = await res.json(); setSStatus(d.available ? 'ok' : 'taken') }
      catch { setSStatus('idle') }
    }, 400)
  }
  const submitSlug = async () => {
    if (sStatus !== 'ok') return
    setSlugLoading(true)
    try {
      const res = await fetch('/api/shops/slug', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ slug: normalizeSlug(slug) }) })
      if (res.ok) setStep('address')
      else if (res.status === 409) { setSStatus('taken'); pacesToast.error('URL นี้มีคนใช้แล้ว') }
      else pacesToast.error('เกิดข้อผิดพลาด กรุณาลองใหม่')
    } catch { pacesToast.error('เกิดข้อผิดพลาด กรุณาลองใหม่') } finally { setSlugLoading(false) }
  }

  const finish = useCallback(async () => { await update(); router.replace('/dashboard') }, [update, router])
  // LODGING — ไม่มี step สินค้า/คิวงาน จบที่ step ที่อยู่แล้วไปสร้างห้องพักแรกทันที (UX spec §A1)
  const finishToRooms = useCallback(async () => { await update(); router.replace('/rooms/new') }, [update, router])

  const submitAddress = async () => {
    if (!address.trim()) return pacesToast.error('กรุณากรอกที่อยู่ร้าน')
    setAddrLoading(true)
    try {
      const res = await fetch('/api/shops/update', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ address: address.trim() }) })
      if (res.ok) {
        if (vertical === 'LODGING') await finishToRooms()
        else setStep('product')
      } else pacesToast.error('บันทึกไม่สำเร็จ กรุณาลองใหม่')
    } catch { pacesToast.error('เกิดข้อผิดพลาด กรุณาลองใหม่') } finally { setAddrLoading(false) }
  }

  const createProduct = async () => {
    if (!pName.trim()) return pacesToast.error('กรุณากรอกชื่อสินค้า')
    const price = Number(pPrice)
    if (!pPrice || isNaN(price) || price < 0.01) return pacesToast.error('กรุณากรอกราคา (ต่ำสุด ฿0.01)')
    setPLoading(true)
    try {
      const res = await fetch('/api/products', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: pName.trim(), price, type: 'PHYSICAL' }) })
      if (res.ok) { pacesToast.success('สร้างสินค้าแรกเรียบร้อย!'); await finish() }
      else { const d = await res.json().catch(() => ({})); pacesToast.error(d.error ?? 'สร้างสินค้าไม่สำเร็จ') }
    } catch { pacesToast.error('เกิดข้อผิดพลาด กรุณาลองใหม่') } finally { setPLoading(false) }
  }

  // SERVICE_QUEUE — สร้างคิวงานแรกแทนสินค้า (endpoint มีอยู่แล้ว ใช้อยู่ใน ResourceForm.tsx)
  const createQueue = async () => {
    if (!qName.trim()) return pacesToast.error('กรุณากรอกชื่อคิวงาน')
    const capacity = Number(qCapacity) || 1
    setQLoading(true)
    try {
      const res = await fetch('/api/shops/current/service-resources', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: qName.trim(), capacity }) })
      if (res.ok) { pacesToast.success('เพิ่มคิวงานแล้ว'); await finish() }
      else { const d = await res.json().catch(() => ({})); pacesToast.error(d?.error === 'VALIDATION_ERROR' ? 'มีบางช่องที่กรอกยังไม่ถูกต้อง' : 'เพิ่มคิวงานไม่สำเร็จ') }
    } catch { pacesToast.error('เกิดข้อผิดพลาด กรุณาลองใหม่') } finally { setQLoading(false) }
  }

  if (!ready) {
    return (
      <Shell>
        <div className="flex items-center justify-center py-16">
          <div className="border-primary inline-block size-10 animate-spin rounded-full border-3 border-t-transparent" role="status" />
        </div>
      </Shell>
    )
  }

  const dotIdx = stepDots.indexOf(step)
  // meta ของ address/product ขึ้นกับ vertical ที่เลือกไว้ ที่เหลือคงที่ (STEP_META)
  const meta =
    step === 'address'
      ? { icon: 'map-pin', heading: 'ตั้งที่อยู่ร้าน', subtitle: ADDRESS_SUBTITLE[vertical ?? DEFAULT_SHOP_VERTICAL] }
      : step === 'product' && vertical === 'SERVICE_QUEUE'
        ? { icon: 'armchair', heading: 'สร้างคิวงานแรกของคุณ', subtitle: 'เพิ่มคิวงานที่รับได้ เพื่อเริ่มนัดลูกค้า' }
        : step === 'product'
          ? { icon: 'package', heading: 'สร้างสินค้าแรกของคุณ', subtitle: 'เพิ่มสินค้าชิ้นแรกเพื่อให้ลูกค้าเห็นร้าน' }
          : STEP_META[step]

  return (
    <Shell>
      {/* ทางออกสำหรับผู้ถูกเชิญที่เพิ่งสร้างร้านส่วนตัวระหว่างทำงานในร้านคนอื่น (feature 00026 A3)
          วางบนสุด ไม่ใช่ท้ายหน้า: ท้ายหน้ามันไปนั่งติดกับ "ข้ามไปก่อน" กลายเป็นลิงก์เทาหน้าตา
          เหมือนกัน 2 อันในโซนนิ้วโป้งที่พาไปคนละที่ และต้องเลื่อนจนสุดถึงจะรู้ว่ามีทางออก
          component ตัดสินใจเองว่าจะโผล่ไหม — ไม่โผล่เลยถ้าไม่มี business membership */}
      <BackToBusinessButton />

      <div className="mb-6 flex justify-center"><AuthLogo /></div>

      {/* progress: dots + ขั้นที่ x/N (N ผัน 4/5 ตาม vertical) */}
      <div className="mb-5 flex items-center justify-center gap-3">
        <div className="flex gap-1.5">
          {stepDots.map((_, i) => (
            <div key={i} className={`size-2 rounded-full transition-colors ${i === dotIdx ? 'bg-primary' : i < dotIdx ? 'bg-primary/50' : 'bg-default-300'}`} />
          ))}
        </div>
        <span className="text-xs text-default-500">ขั้นที่ {dotIdx + 1}/{stepDots.length}</span>
      </div>

      {/* icon วงกลมต่อ step (focal point) */}
      <div className="mb-4 flex justify-center">
        <div className="flex size-14 items-center justify-center rounded-full bg-primary/15 text-primary">
          <Icon icon={meta.icon} className="size-7" />
        </div>
      </div>

      <h4 className="mb-1 text-center text-base font-bold text-default-900">{meta.heading}</h4>
      <p className="text-default-400 mb-5 text-center text-sm">{meta.subtitle}</p>

      {step === 'vertical' && (
        <>
          <VerticalTaxonomyPicker value={vertical} onChange={setVertical} columns={1} disabled={vLoading} />
          <button
            type="button"
            onClick={submitVertical}
            disabled={vLoading || !vertical}
            className="btn bg-primary text-white hover:bg-primary-hover mt-4 w-full disabled:opacity-50"
          >
            {vLoading ? 'กำลังบันทึก...' : 'ถัดไป'}
          </button>
        </>
      )}

      {step === 'category' && (
        <>
          <label className="form-label">หมวดหมู่ร้านค้า<span className="text-danger">*</span></label>
          <ChoiceSelect options={CATEGORY_OPTIONS} placeholder="-- เลือกหมวดหมู่ --" search={false} value={category} onChange={(v) => setCategory(v as string)} />
          <button type="button" onClick={submitCategory} disabled={catLoading} className="btn bg-primary text-white hover:bg-primary-hover mt-4 w-full disabled:opacity-50">{catLoading ? 'กำลังบันทึก...' : 'ถัดไป →'}</button>
        </>
      )}

      {step === 'slug' && (
        <>
          <label className="form-label">URL ร้านค้า<span className="text-danger">*</span></label>
          <div className="input-icon-group">
            <Icon icon="link" className="input-icon" />
            <input className="form-input" placeholder="yourshop" value={slug} onChange={(e) => onSlug(e.target.value)} maxLength={30} autoCapitalize="none" autoComplete="off" />
          </div>
          {sStatus === 'ok' && <p className="invalid-msg mt-1 text-sm text-success">URL นี้ว่างอยู่</p>}
          {sStatus === 'taken' && <p className="invalid-msg mt-1 text-sm text-danger">URL นี้มีคนใช้แล้ว</p>}
          {sStatus === 'invalid' && <p className="invalid-msg mt-1 text-sm text-danger">ใช้ a-z, 0-9, ขีดกลาง ได้ 3-30 ตัว</p>}
          {sStatus === 'checking' && <p className="invalid-msg mt-1 text-sm text-default-400">กำลังตรวจสอบ...</p>}
          {slug && sStatus === 'ok' && <p className="mt-3 text-sm text-primary">deepthailand.app/shop/<span className="font-mono">{slug}</span></p>}
          <button type="button" onClick={submitSlug} disabled={slugLoading || sStatus !== 'ok'} className="btn bg-primary text-white hover:bg-primary-hover mt-4 w-full disabled:opacity-50">{slugLoading ? 'กำลังบันทึก...' : 'ถัดไป →'}</button>
        </>
      )}

      {step === 'address' && (
        <>
          <label className="form-label">ค้นหาที่อยู่ของคุณ<span className="text-danger">*</span></label>
          <ThaiAddressSearch onChange={setAddress} disabled={addrLoading} />
          <button type="button" onClick={submitAddress} disabled={addrLoading || !address.trim()} className="btn bg-primary text-white hover:bg-primary-hover mt-4 w-full disabled:opacity-50">
            {addrLoading ? 'กำลังบันทึก...' : vertical === 'LODGING' ? 'เสร็จสิ้น ไปสร้างห้องพักแรก →' : 'ถัดไป →'}
          </button>
        </>
      )}

      {step === 'product' && vertical === 'SERVICE_QUEUE' && (
        <>
          <div className="flex flex-col gap-4">
            <div>
              <label className="form-label">ชื่อคิวงาน</label>
              <div className="input-icon-group">
                <Icon icon="armchair" className="input-icon" />
                <input className="form-input" placeholder="เช่น หมอนวด A" value={qName} onChange={(e) => setQName(e.target.value)} />
              </div>
            </div>
            <div>
              <label className="form-label">จำนวนคิวที่รับพร้อมกัน</label>
              <div className="flex items-center gap-2">
                <input className="form-input" type="number" inputMode="numeric" min={1} placeholder="1" value={qCapacity} onChange={(e) => setQCapacity(e.target.value)} />
                <span className="text-default-500 shrink-0">คิว</span>
              </div>
            </div>
          </div>
          <div className="mt-5 flex flex-col gap-2">
            <button type="button" onClick={createQueue} disabled={qLoading} className="btn bg-primary text-white hover:bg-primary-hover w-full disabled:opacity-50">{qLoading ? 'กำลังสร้าง...' : 'เพิ่มคิวงานเลย'}</button>
            <button type="button" onClick={finish} disabled={qLoading} className="w-full py-1 text-center text-sm text-default-500 disabled:opacity-50">ข้ามไปก่อน เพิ่มทีหลังได้</button>
          </div>
        </>
      )}

      {step === 'product' && vertical !== 'SERVICE_QUEUE' && (
        <>
          <div className="flex flex-col gap-4">
            <div>
              <label className="form-label">ชื่อสินค้า</label>
              <div className="input-icon-group">
                <Icon icon="package" className="input-icon" />
                <input className="form-input" placeholder="เช่น ข้าวหอมมะลิ" value={pName} onChange={(e) => setPName(e.target.value)} />
              </div>
            </div>
            <div>
              <label className="form-label">ราคา</label>
              <div className="input-group">
                <span className="input-group-text">฿</span>
                <input className="form-input" type="number" min="0.01" step="0.01" placeholder="0.00" value={pPrice} onChange={(e) => setPPrice(e.target.value)} />
              </div>
            </div>
          </div>
          <div className="mt-5 flex flex-col gap-2">
            <button type="button" onClick={createProduct} disabled={pLoading} className="btn bg-primary text-white hover:bg-primary-hover w-full disabled:opacity-50">{pLoading ? 'กำลังสร้าง...' : 'สร้างสินค้าเลย'}</button>
            <button type="button" onClick={finish} disabled={pLoading} className="w-full py-1 text-center text-sm text-default-500 disabled:opacity-50">ข้ามไปก่อน เพิ่มทีหลังได้</button>
          </div>
        </>
      )}

    </Shell>
  )
}
