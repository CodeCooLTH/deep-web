'use client'

/**
 * /onboarding — เฟส 2 ตั้งค่าร้านครั้งแรก (setup) หลังลงทะเบียน (มีเบอร์แล้ว)
 * เด้งจาก proxy เมื่อ token.needsOnboarding (ไม่มี slug). ผู้ใช้ผ่าน /dashboard มาแล้ว = รู้สึกเข้าระบบแล้ว
 *
 * Base (layout): AuthCardShell · Base (logic): OnboardingModal.tsx
 * Flow: ตั้ง URL ร้าน (slug บังคับ) → สินค้าแรก (ข้ามได้) → /dashboard
 * เฟส 1 (ข้อมูลร้าน + เบอร์ + OTP) อยู่ที่ /register
 * spec: docs/superpowers/specs/2026-06-17-fb-onboarding-mandatory-page-design.md
 */

import AuthCardShell from '../auth/components/AuthCardShell'
import { pacesToast } from '@/lib/paces-toast'
import { isValidSlugFormat, isReservedSlug, normalizeSlug } from '@/lib/shop-slug'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useRef, useState } from 'react'

type Step = 'slug' | 'product'
type Check = 'idle' | 'checking' | 'ok' | 'taken' | 'invalid'

export default function OnboardingPage() {
  const { data: session, status, update } = useSession()
  const router = useRouter()
  const user = (session?.user ?? {}) as { needsOnboarding?: boolean }

  const [step, setStep] = useState<Step>('slug')
  const [ready, setReady] = useState(false)

  const [slug, setSlug] = useState('')
  const [sStatus, setSStatus] = useState<Check>('idle')
  const [slugLoading, setSlugLoading] = useState(false)
  const sDebounce = useRef<ReturnType<typeof setTimeout> | null>(null)

  const [pName, setPName] = useState('')
  const [pPrice, setPPrice] = useState('')
  const [pLoading, setPLoading] = useState(false)

  useEffect(() => {
    if (status === 'loading') return
    if (status === 'unauthenticated') { router.replace('/auth/sign-in'); return }
    if (!user.needsOnboarding) { router.replace('/dashboard'); return }
    if (!ready) setReady(true)
  }, [status, user, ready, router])

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
      if (res.ok) setStep('product')
      else if (res.status === 409) { setSStatus('taken'); pacesToast.error('URL นี้มีคนใช้แล้ว') }
      else pacesToast.error('เกิดข้อผิดพลาด กรุณาลองใหม่')
    } catch { pacesToast.error('เกิดข้อผิดพลาด กรุณาลองใหม่') } finally { setSlugLoading(false) }
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
      <AuthCardShell>
        <div className="flex flex-1 items-center justify-center py-20">
          <div className="border-primary inline-block size-10 animate-spin rounded-full border-3 border-t-transparent" role="status" />
        </div>
      </AuthCardShell>
    )
  }

  return (
    <AuthCardShell>
      <div className="mb-5 flex flex-col items-center">
        <span className="flex size-16 items-center justify-center rounded-full bg-primary/10 text-primary text-3xl">🏪</span>
      </div>

      <div>
        {step === 'slug' && (
          <>
            <h4 className="mb-1 text-center text-lg font-bold text-default-900">ตั้ง URL ร้านของคุณ</h4>
            <p className="text-default-400 mb-5 text-center text-sm">ขั้นตอนสุดท้าย — ลูกค้าจะค้นหาร้านคุณผ่านลิงก์นี้</p>
            <label className="form-label">URL ร้านค้า <span className="text-danger">*</span></label>
            <input className="form-input" placeholder="yourshop" value={slug} onChange={(e) => onSlug(e.target.value)} maxLength={30} autoCapitalize="none" autoComplete="off" />
            {sStatus === 'ok' && <p className="mt-1 text-xs text-success">✓ URL นี้ว่างอยู่</p>}
            {sStatus === 'taken' && <p className="mt-1 text-xs text-danger">✕ มีคนใช้แล้ว</p>}
            {sStatus === 'invalid' && <p className="mt-1 text-xs text-danger">✕ a-z, 0-9, ขีดกลาง (3-30 ตัว)</p>}
            {slug && sStatus === 'ok' && <p className="mt-3 text-sm text-primary">deepthailand.app/<span className="font-mono">{slug}</span></p>}
            <button type="button" onClick={submitSlug} disabled={slugLoading || sStatus !== 'ok'} className="btn bg-primary text-white hover:bg-primary-hover mt-6 w-full disabled:opacity-50">{slugLoading ? 'กำลังบันทึก...' : 'ถัดไป →'}</button>
          </>
        )}

        {step === 'product' && (
          <>
            <h4 className="mb-1 text-center text-lg font-bold text-default-900">สร้างสินค้าแรกของคุณ</h4>
            <p className="text-default-400 mb-5 text-center text-sm">เพิ่มสินค้าชิ้นแรกเพื่อให้ลูกค้าเห็นร้าน</p>
            <div className="flex flex-col gap-4">
              <div><label className="form-label">ชื่อสินค้า</label><input className="form-input" placeholder="เช่น ข้าวหอมมะลิ" value={pName} onChange={(e) => setPName(e.target.value)} /></div>
              <div><label className="form-label">ราคา</label><div className="input-group"><span className="input-group-text">฿</span><input className="form-input" type="number" min="0.01" step="0.01" placeholder="0.00" value={pPrice} onChange={(e) => setPPrice(e.target.value)} /></div></div>
            </div>
            <div className="mt-6 flex flex-col gap-2">
              <button type="button" onClick={createProduct} disabled={pLoading} className="btn bg-primary text-white hover:bg-primary-hover w-full disabled:opacity-50">{pLoading ? 'กำลังสร้าง...' : 'สร้างสินค้าเลย'}</button>
              <button type="button" onClick={finish} disabled={pLoading} className="w-full text-center text-sm text-default-500 disabled:opacity-50">ข้ามไปก่อน เพิ่มทีหลังได้</button>
            </div>
          </>
        )}
      </div>

      <p className="text-default-400 mt-7.5 text-center text-xs">© {new Date().getFullYear()} Deep</p>
    </AuthCardShell>
  )
}
