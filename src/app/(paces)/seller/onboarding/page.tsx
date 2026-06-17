'use client'

/**
 * /onboarding — เฟส 2 ตั้งค่าร้านครั้งแรก (setup) หลังลงทะเบียน (มีเบอร์แล้ว, ผ่าน /dashboard มาแล้ว)
 * เด้งจาก proxy เมื่อ token.needsOnboarding (ไม่มี slug).
 *
 * Layout: **หน้า seller เปล่า** (Paces card centered บน bg-default-100) — ไม่ใช้ AuthCardShell ของ auth/sign-up
 *   (user req: onboarding = อยู่ในระบบแล้ว ไม่ใช่ flow login)
 * field: component จริง Paces — ChoiceSelect / input-icon-group + Icon / form-textarea / input-group / invalid-msg
 * Flow: 1.หมวดหมู่ → 2.URL ร้าน (slug) → 3.ที่อยู่ (address) → 4.สินค้าแรก → /dashboard
 * เฟส 1 (username + เบอร์ + OTP) อยู่ที่ /register
 * spec: docs/superpowers/specs/2026-06-17-fb-onboarding-flow-diagram.html
 */

import AuthLogo from '@/components/AuthLogo'
import Icon from '@/components/wrappers/Icon'
import ChoiceSelect from '@/components/wrappers/ChoiceSelect'
import { pacesToast } from '@/lib/paces-toast'
import { SHOP_CATEGORY_LABELS, SHOP_CATEGORY_KEYS } from '@/lib/shop-categories'
import { isValidSlugFormat, isReservedSlug, normalizeSlug } from '@/lib/shop-slug'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useRef, useState } from 'react'

type Step = 'category' | 'slug' | 'address' | 'product'
type Check = 'idle' | 'checking' | 'ok' | 'taken' | 'invalid'
const CATEGORY_OPTIONS = SHOP_CATEGORY_KEYS.map((k) => ({ value: k, label: SHOP_CATEGORY_LABELS[k] }))
const STEP_DOTS: Step[] = ['category', 'slug', 'address', 'product']

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

  const [step, setStep] = useState<Step>('category')
  const [ready, setReady] = useState(false)

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

  useEffect(() => {
    if (status === 'loading') return
    if (status === 'unauthenticated') { router.replace('/auth/sign-in'); return }
    if (!user.needsOnboarding) { router.replace('/dashboard'); return }
    if (!ready) setReady(true)
  }, [status, user, ready, router])

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

  const submitAddress = async () => {
    if (!address.trim()) return pacesToast.error('กรุณากรอกที่อยู่ร้าน')
    setAddrLoading(true)
    try {
      const res = await fetch('/api/shops/update', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ address: address.trim() }) })
      if (res.ok) setStep('product')
      else pacesToast.error('บันทึกไม่สำเร็จ กรุณาลองใหม่')
    } catch { pacesToast.error('เกิดข้อผิดพลาด กรุณาลองใหม่') } finally { setAddrLoading(false) }
  }

  const finish = useCallback(async () => { await update(); router.replace('/dashboard') }, [update, router])
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

  if (!ready) {
    return (
      <Shell>
        <div className="flex items-center justify-center py-16">
          <div className="border-primary inline-block size-10 animate-spin rounded-full border-3 border-t-transparent" role="status" />
        </div>
      </Shell>
    )
  }

  const dotIdx = STEP_DOTS.indexOf(step)

  return (
    <Shell>
      <div className="mb-6 flex justify-center"><AuthLogo /></div>

      <div className="mb-5 flex justify-center gap-1.5">
        {STEP_DOTS.map((_, i) => (
          <div key={i} className={`size-2 rounded-full transition-colors ${i === dotIdx ? 'bg-primary' : i < dotIdx ? 'bg-primary/50' : 'bg-default-300'}`} />
        ))}
      </div>

      {step === 'category' && (
        <>
          <h4 className="mb-1 text-center text-lg font-bold text-default-900">เลือกหมวดหมู่ร้านของคุณ</h4>
          <p className="text-default-400 mb-5 text-center text-sm">เลือกหมวดที่ตรงกับสินค้าของคุณมากที่สุด</p>
          <label className="form-label">หมวดหมู่ร้านค้า<span className="text-danger">*</span></label>
          <ChoiceSelect options={CATEGORY_OPTIONS} placeholder="-- เลือกหมวดหมู่ --" search={false} value={category} onChange={(v) => setCategory(v as string)} />
          <button type="button" onClick={submitCategory} disabled={catLoading} className="btn bg-primary text-white hover:bg-primary-hover mt-6 w-full disabled:opacity-50">{catLoading ? 'กำลังบันทึก...' : 'ถัดไป →'}</button>
        </>
      )}

      {step === 'slug' && (
        <>
          <h4 className="mb-1 text-center text-lg font-bold text-default-900">ตั้ง URL ร้านของคุณ</h4>
          <p className="text-default-400 mb-5 text-center text-sm">ลูกค้าจะค้นหาร้านคุณผ่านลิงก์นี้</p>
          <label className="form-label">URL ร้านค้า<span className="text-danger">*</span></label>
          <div className="input-icon-group">
            <Icon icon="link" className="input-icon" />
            <input className="form-input" placeholder="yourshop" value={slug} onChange={(e) => onSlug(e.target.value)} maxLength={30} autoCapitalize="none" autoComplete="off" />
          </div>
          {sStatus === 'ok' && <p className="invalid-msg mt-1 text-sm text-success">URL นี้ว่างอยู่</p>}
          {sStatus === 'taken' && <p className="invalid-msg mt-1 text-sm text-danger">URL นี้มีคนใช้แล้ว</p>}
          {sStatus === 'invalid' && <p className="invalid-msg mt-1 text-sm text-danger">ใช้ a-z, 0-9, ขีดกลาง ได้ 3-30 ตัว</p>}
          {slug && sStatus === 'ok' && <p className="mt-3 text-sm text-primary">deepthailand.app/<span className="font-mono">{slug}</span></p>}
          <button type="button" onClick={submitSlug} disabled={slugLoading || sStatus !== 'ok'} className="btn bg-primary text-white hover:bg-primary-hover mt-6 w-full disabled:opacity-50">{slugLoading ? 'กำลังบันทึก...' : 'ถัดไป →'}</button>
        </>
      )}

      {step === 'address' && (
        <>
          <h4 className="mb-1 text-center text-lg font-bold text-default-900">ตั้งที่อยู่ร้าน</h4>
          <p className="text-default-400 mb-5 text-center text-sm">ที่อยู่สำหรับจัดส่ง/ติดต่อร้าน</p>
          <label className="form-label">ที่อยู่<span className="text-danger">*</span></label>
          <textarea className="form-textarea" rows={3} placeholder="บ้านเลขที่ / ถนน / ตำบล / อำเภอ / จังหวัด / รหัสไปรษณีย์" value={address} onChange={(e) => setAddress(e.target.value)} maxLength={500} />
          <button type="button" onClick={submitAddress} disabled={addrLoading} className="btn bg-primary text-white hover:bg-primary-hover mt-6 w-full disabled:opacity-50">{addrLoading ? 'กำลังบันทึก...' : 'ถัดไป →'}</button>
        </>
      )}

      {step === 'product' && (
        <>
          <h4 className="mb-1 text-center text-lg font-bold text-default-900">สร้างสินค้าแรกของคุณ</h4>
          <p className="text-default-400 mb-5 text-center text-sm">เพิ่มสินค้าชิ้นแรกเพื่อให้ลูกค้าเห็นร้าน</p>
          <div className="flex flex-col gap-5">
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
          <div className="mt-6 flex flex-col gap-2">
            <button type="button" onClick={createProduct} disabled={pLoading} className="btn bg-primary text-white hover:bg-primary-hover w-full disabled:opacity-50">{pLoading ? 'กำลังสร้าง...' : 'สร้างสินค้าเลย'}</button>
            <button type="button" onClick={finish} disabled={pLoading} className="w-full text-center text-sm text-default-500 disabled:opacity-50">ข้ามไปก่อน เพิ่มทีหลังได้</button>
          </div>
        </>
      )}
    </Shell>
  )
}
