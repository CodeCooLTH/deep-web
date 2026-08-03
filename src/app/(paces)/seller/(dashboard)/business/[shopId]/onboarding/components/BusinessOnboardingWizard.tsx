'use client'

/**
 * BusinessOnboardingWizard — wizard ตั้งค่า Business shop ครั้งแรก
 *   ONLINE_SALES/SERVICE_QUEUE: ข้อมูลร้าน → URL → สินค้าแรก/คิวงานแรก (3 step)
 *   LODGING: ข้อมูลร้าน → URL (2 step, ไม่มี step สุดท้าย — จบที่ slug แล้วไปสร้างห้องพักแรก)
 *
 * Base (step-flow state machine — dots progress + icon circle focal point, ตัด phone/OTP + step
 *   'address' ที่ CreateBusinessShopSchema ไม่มี field ให้ต่อ): src/app/(paces)/seller/onboarding/page.tsx
 * Base (field markup step ข้อมูลร้าน — input-text/select/file-upload): ../../../shop/components/ShopForm.tsx
 *   (ชื่อร้าน + หมวดหมู่ HR6 native form-select + โลโก้ upload POST /api/upload)
 *
 * feature 00028 (A2b, mirror A1) — step สุดท้ายแตกตาม vertical (props ส่งมาจาก page.tsx):
 *   ONLINE_SALES → เหมือนเดิม (สินค้าแรก, endpoint onboarding เดิม)
 *   SERVICE_QUEUE → ฟอร์ม "ชื่อคิวงาน" เรียก /api/shops/current/service-resources (ไม่ใช่ endpoint
 *     onboarding เดิม — endpoint นั้นออกแบบมาสำหรับ product เท่านั้น) — endpoint นี้ resolve shop
 *     จาก session.activeShopId (requireShopMember) ซึ่ง "ยังไม่ถูกสลับมาที่ business นี้" ระหว่าง
 *     onboard (เหตุผลเดียวกับที่ endpoint onboarding เดิม comment ไว้) จึงต้อง switchContext() ก่อน
 *     ยิง endpoint นี้เสมอ ไม่งั้นคิวงานจะถูกสร้างขึ้นที่ shop เดิมที่ active อยู่ ไม่ใช่ shop ใหม่นี้
 *   LODGING → ไม่มี step 'product' เลย ปุ่มที่ step 'slug' เปลี่ยนเป็น "เสร็จสิ้น ไปสร้างห้องพักแรก →"
 *     แล้ว switchContext() + redirect ไป /rooms/new แทน /dashboard (หน้านั้น gate ด้วย requireActiveShop)
 *
 * API: POST /api/business/shops/{shopId}/onboarding เรียกทีละ step (partial body) — ดู route.ts
 * slug check: reuse GET /api/shops/check-slug (global, ไม่แยก PERSONAL/BUSINESS — Shop.slug @unique เดียว)
 *
 * switchContext: สลับ active shop context มาที่ business นี้ (POST /api/business/switch-context +
 *   session.update) — mirror src/layouts/components/Sidenav/components/AccountSwitcher.tsx handleSwitch
 *   เรียกทั้งตอนจบ wizard ปกติ (finish/finishToRooms) และก่อนสร้างคิวงาน (createQueue) เพราะ endpoint
 *   นั้น session-scoped
 */

import { yupResolver } from '@hookform/resolvers/yup'
import { useRouter } from 'next/navigation'
import { useCallback, useMemo, useRef, useState } from 'react'
import { useForm } from 'react-hook-form'
import { useSession } from 'next-auth/react'
import * as Yup from 'yup'
import Icon from '@/components/wrappers/Icon'
import { pacesToast } from '@/lib/paces-toast'
import { SHOP_CATEGORY_LABELS, SHOP_CATEGORY_KEYS } from '@/lib/shop-categories'
import { isValidSlugFormat, isReservedSlug, normalizeSlug } from '@/lib/shop-slug'
import type { ShopVertical } from '@/lib/lodging'

type Step = 'info' | 'slug' | 'product'
type SlugCheck = 'idle' | 'checking' | 'ok' | 'taken' | 'invalid'
const STEP_META: Record<Step, { icon: string; heading: string; subtitle: string }> = {
  info: { icon: 'building-store', heading: 'ข้อมูลร้านธุรกิจ', subtitle: 'ตั้งชื่อ หมวดหมู่ และโลโก้ของร้าน' },
  slug: { icon: 'link', heading: 'ตั้ง URL ร้านของคุณ', subtitle: 'ลูกค้าจะค้นหาร้านคุณผ่านลิงก์นี้' },
  product: { icon: 'package', heading: 'สร้างสินค้าแรกของคุณ', subtitle: 'เพิ่มสินค้าชิ้นแรกเพื่อให้ลูกค้าเห็นร้าน' },
}

const infoSchema = Yup.object({
  shopName: Yup.string()
    .min(2, 'ชื่อร้านต้องมีอย่างน้อย 2 ตัวอักษร')
    .max(100, 'ชื่อร้านต้องไม่เกิน 100 ตัวอักษร')
    .required('กรุณากรอกชื่อร้าน'),
  category: Yup.string().oneOf(['', ...(SHOP_CATEGORY_KEYS as string[])]).default(''),
})
type InfoValues = Yup.InferType<typeof infoSchema>

interface BusinessOnboardingWizardProps {
  shopId: string
  initialShopName: string
  initialCategory: string
  initialLogo: string
  /** feature 00028 (A2b) — กำหนดว่า step สุดท้ายจะเป็นสินค้า/คิวงาน/ไม่มีเลย (LODGING) */
  vertical: ShopVertical
}

export default function BusinessOnboardingWizard({
  shopId,
  initialShopName,
  initialCategory,
  initialLogo,
  vertical,
}: BusinessOnboardingWizardProps) {
  const router = useRouter()
  const { update } = useSession()

  const [step, setStep] = useState<Step>('info')

  // step ข้อมูลร้าน — react-hook-form (shopName+category) แยกจาก logo (fileId state ตาม ShopForm pattern)
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<InfoValues>({
    resolver: yupResolver(infoSchema),
    defaultValues: { shopName: initialShopName, category: initialCategory },
  })
  const [logoFileId, setLogoFileId] = useState(initialLogo)
  const [logoUploading, setLogoUploading] = useState(false)
  const [infoLoading, setInfoLoading] = useState(false)

  // step slug
  const [slug, setSlug] = useState('')
  const [slugStatus, setSlugStatus] = useState<SlugCheck>('idle')
  const [slugLoading, setSlugLoading] = useState(false)
  const slugDebounce = useRef<ReturnType<typeof setTimeout> | null>(null)

  // step สินค้าแรก (ONLINE_SALES)
  const [pName, setPName] = useState('')
  const [pPrice, setPPrice] = useState('')
  const [pLoading, setPLoading] = useState(false)
  const [finishing, setFinishing] = useState(false)

  // step คิวงานแรก (SERVICE_QUEUE)
  const [qName, setQName] = useState('')
  const [qCapacity, setQCapacity] = useState('1')
  const [qLoading, setQLoading] = useState(false)

  // LODGING ไม่มี step 'product' — dots เหลือ 2 (info/slug)
  const stepDots = useMemo<Step[]>(() => (vertical === 'LODGING' ? ['info', 'slug'] : ['info', 'slug', 'product']), [vertical])

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setLogoUploading(true)
    try {
      const fd = new FormData()
      fd.append('file', file)
      const res = await fetch('/api/upload', { method: 'POST', body: fd })
      if (!res.ok) {
        pacesToast.error('อัปโหลดโลโก้ไม่สำเร็จ')
        return
      }
      const data = await res.json()
      setLogoFileId(data.fileId ?? '')
      pacesToast.success('อัปโหลดโลโก้แล้ว')
    } catch {
      pacesToast.error('เกิดข้อผิดพลาดขณะอัปโหลด')
    } finally {
      setLogoUploading(false)
    }
  }

  const submitInfo = async (values: InfoValues) => {
    setInfoLoading(true)
    try {
      const res = await fetch(`/api/business/shops/${shopId}/onboarding`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          shopName: values.shopName,
          ...(values.category ? { category: values.category } : {}),
          ...(logoFileId ? { logo: logoFileId } : {}),
        }),
      })
      if (res.ok) setStep('slug')
      else pacesToast.error('บันทึกไม่สำเร็จ กรุณาลองใหม่')
    } catch {
      pacesToast.error('เกิดข้อผิดพลาด กรุณาลองใหม่')
    } finally {
      setInfoLoading(false)
    }
  }

  const onSlug = (v: string) => {
    const cleaned = v.toLowerCase().replace(/[^a-z0-9-]/g, '')
    setSlug(cleaned)
    setSlugStatus('idle')
    if (slugDebounce.current) clearTimeout(slugDebounce.current)
    const n = normalizeSlug(cleaned)
    if (!n || !isValidSlugFormat(n) || isReservedSlug(n)) {
      setSlugStatus(cleaned.length >= 3 ? 'invalid' : 'idle')
      return
    }
    setSlugStatus('checking')
    slugDebounce.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/shops/check-slug?slug=${encodeURIComponent(n)}`)
        const d = await res.json()
        setSlugStatus(d.available ? 'ok' : 'taken')
      } catch {
        setSlugStatus('idle')
      }
    }, 400)
  }

  // สลับ active shop context มาที่ business นี้ ต้องเรียกก่อนยิง endpoint session-scoped ใด ๆ เสมอ
  //
  // IMPORTANT: คืน true/false — ผู้เรียกต้องเลือกเองว่าจะ best-effort หรือ block:
  //   - navigation อย่างเดียว (finish/finishToRooms) → best-effort พอ worst case คือลงหน้าปลายทาง
  //     ด้วย context ผิด ซึ่งผู้ใช้เห็นทันทีและสลับร้านเองได้
  //   - write action (createQueue) → **ต้องเช็คผลก่อนยิงต่อ** เพราะ endpoint session-scoped
  //     resolve ร้านจาก session เท่านั้น ถ้า switch ไม่สำเร็จแล้วยิงต่อ ข้อมูลจะถูกเขียนลง "ร้านที่
  //     active ค้างอยู่" แทนร้านที่ตั้งใจ โดย backend คืน 200 → UI ขึ้นว่าสำเร็จ = ผิดแบบเงียบสนิท
  const switchContext = useCallback(async (): Promise<boolean> => {
    try {
      const res = await fetch('/api/business/switch-context', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ shopId }),
      })
      if (!res.ok) return false
      await update({ activeShopId: shopId })
      return true
    } catch {
      return false
    }
  }, [update, shopId])

  const finish = useCallback(async () => {
    setFinishing(true)
    await switchContext()
    router.replace('/dashboard')
  }, [switchContext, router])

  // LODGING — จบที่ step slug แล้วไปสร้างห้องพักแรกทันที (หน้านั้น gate ด้วย requireActiveShop
  // จึงต้อง switchContext ก่อน ไม่งั้นเจอ notFound เพราะ active shop ยังเป็นอันเดิม)
  const finishToRooms = useCallback(async () => {
    setFinishing(true)
    await switchContext()
    router.replace('/rooms/new')
  }, [switchContext, router])

  const submitSlug = async () => {
    if (slugStatus !== 'ok') return
    setSlugLoading(true)
    try {
      const res = await fetch(`/api/business/shops/${shopId}/onboarding`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug: normalizeSlug(slug) }),
      })
      if (res.ok) {
        if (vertical === 'LODGING') await finishToRooms()
        else setStep('product')
      } else if (res.status === 409) {
        setSlugStatus('taken')
        pacesToast.error('URL นี้มีคนใช้แล้ว')
      } else pacesToast.error('เกิดข้อผิดพลาด กรุณาลองใหม่')
    } catch {
      pacesToast.error('เกิดข้อผิดพลาด กรุณาลองใหม่')
    } finally {
      setSlugLoading(false)
    }
  }

  const createProduct = async () => {
    if (!pName.trim()) return pacesToast.error('กรุณากรอกชื่อสินค้า')
    const price = Number(pPrice)
    if (!pPrice || isNaN(price) || price < 0.01) return pacesToast.error('กรุณากรอกราคา (ต่ำสุด ฿0.01)')
    setPLoading(true)
    try {
      const res = await fetch(`/api/business/shops/${shopId}/onboarding`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ product: { name: pName.trim(), price } }),
      })
      if (res.ok) {
        pacesToast.success('สร้างสินค้าแรกเรียบร้อย!')
        await finish()
      } else {
        const d = await res.json().catch(() => ({}))
        pacesToast.error(d.error ?? 'สร้างสินค้าไม่สำเร็จ')
      }
    } catch {
      pacesToast.error('เกิดข้อผิดพลาด กรุณาลองใหม่')
    } finally {
      setPLoading(false)
    }
  }

  // SERVICE_QUEUE — สร้างคิวงานแรกแทนสินค้า ผ่าน endpoint session-scoped จึงต้อง switchContext ก่อนเสมอ
  const createQueue = async () => {
    if (!qName.trim()) return pacesToast.error('กรุณากรอกชื่อคิวงาน')
    const capacity = Number(qCapacity) || 1
    setQLoading(true)
    try {
      // ต้องสลับ context ให้สำเร็จก่อนเสมอ — ยิงต่อทั้งที่สลับไม่ผ่าน = คิวงานไปโผล่ร้านอื่น
      // ที่ active ค้างอยู่ แล้ว backend คืน 200 (UI จะขึ้นว่าสำเร็จทั้งที่ผิดร้าน)
      if (!(await switchContext())) {
        pacesToast.error('สลับไปยังร้านนี้ไม่สำเร็จ กรุณาลองใหม่')
        return
      }
      const res = await fetch('/api/shops/current/service-resources', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: qName.trim(), capacity }),
      })
      if (res.ok) {
        pacesToast.success('เพิ่มคิวงานแล้ว')
        await finish()
      } else {
        const d = await res.json().catch(() => ({}))
        pacesToast.error(d?.error === 'VALIDATION_ERROR' ? 'มีบางช่องที่กรอกยังไม่ถูกต้อง' : 'เพิ่มคิวงานไม่สำเร็จ')
      }
    } catch {
      pacesToast.error('เกิดข้อผิดพลาด กรุณาลองใหม่')
    } finally {
      setQLoading(false)
    }
  }

  const dotIdx = stepDots.indexOf(step)
  const meta =
    step === 'product' && vertical === 'SERVICE_QUEUE'
      ? { icon: 'armchair', heading: 'สร้างคิวงานแรกของคุณ', subtitle: 'เพิ่มคิวงานที่รับได้ เพื่อเริ่มนัดลูกค้า' }
      : STEP_META[step]

  return (
    <div className="card mx-auto max-w-2xl">
      <div className="card-body p-6 sm:p-8">
        {/* progress: dots + ขั้นที่ x/N (N ผัน 2/3 ตาม vertical) */}
        <div className="mb-5 flex items-center justify-center gap-3">
          <div className="flex gap-1.5">
            {stepDots.map((_, i) => (
              <div
                key={i}
                className={`size-2 rounded-full transition-colors ${
                  i === dotIdx ? 'bg-primary' : i < dotIdx ? 'bg-primary/50' : 'bg-default-300'
                }`}
              />
            ))}
          </div>
          <span className="text-default-500 text-xs">ขั้นที่ {dotIdx + 1}/{stepDots.length}</span>
        </div>

        {/* icon วงกลมต่อ step (focal point) — mirror personal onboarding */}
        <div className="mb-4 flex justify-center">
          <div className="bg-primary/15 text-primary flex size-14 items-center justify-center rounded-full">
            <Icon icon={meta.icon} className="size-7" aria-hidden="true" />
          </div>
        </div>

        <h4 className="text-default-900 mb-1 text-center text-base font-bold">{meta.heading}</h4>
        <p className="text-default-400 mb-5 text-center text-sm">{meta.subtitle}</p>

        {step === 'info' && (
          <form onSubmit={handleSubmit(submitInfo)} noValidate>
            <div className="mb-4">
              <label className="form-label">
                ชื่อร้าน<span className="text-danger ms-0.5">*</span>
              </label>
              <input type="text" className="form-input" placeholder="เช่น สาขา 2" {...register('shopName')} />
              {errors.shopName && <p className="text-danger mt-1 text-sm">{errors.shopName.message}</p>}
            </div>

            {/* หมวดหมู่ — HR6 form-select native */}
            <div className="mb-4">
              <label className="form-label">
                หมวดหมู่ <span className="text-default-400 text-xs">(ไม่บังคับ)</span>
              </label>
              <select className="form-select" {...register('category')}>
                <option value="">-- เลือกหมวดหมู่ --</option>
                {SHOP_CATEGORY_KEYS.map((key) => (
                  <option key={key} value={key}>
                    {SHOP_CATEGORY_LABELS[key]}
                  </option>
                ))}
              </select>
              {errors.category && <p className="text-danger mt-1 text-sm">{errors.category.message}</p>}
            </div>

            <div className="mb-4">
              <label className="form-label">
                โลโก้ร้าน <span className="text-default-400 text-xs">(ไม่บังคับ)</span>
              </label>
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp"
                className="form-input"
                onChange={handleLogoUpload}
                disabled={logoUploading}
              />
              {logoUploading && (
                <p className="text-default-400 mt-1 flex items-center gap-1 text-sm">
                  <Icon icon="loader-2" className="animate-spin text-base" aria-hidden="true" />
                  กำลังอัปโหลด...
                </p>
              )}
              {logoFileId && !logoUploading && (
                <p className="text-success mt-1 flex items-center gap-1 text-sm">
                  <Icon icon="circle-check" className="text-base" aria-hidden="true" />
                  อัปโหลดแล้ว
                </p>
              )}
            </div>

            <button
              type="submit"
              disabled={infoLoading}
              className="btn bg-primary text-white hover:bg-primary-hover mt-2 w-full disabled:opacity-50"
            >
              {infoLoading ? 'กำลังบันทึก...' : 'ถัดไป →'}
            </button>
          </form>
        )}

        {step === 'slug' && (
          <>
            <label className="form-label">
              URL ร้านค้า<span className="text-danger">*</span>
            </label>
            <div className="input-icon-group">
              <Icon icon="link" className="input-icon" aria-hidden="true" />
              <input
                className="form-input"
                placeholder="yourbusiness"
                value={slug}
                onChange={(e) => onSlug(e.target.value)}
                maxLength={30}
                autoCapitalize="none"
                autoComplete="off"
              />
            </div>
            {slugStatus === 'ok' && <p className="invalid-msg text-success mt-1 text-sm">URL นี้ว่างอยู่</p>}
            {slugStatus === 'taken' && <p className="invalid-msg text-danger mt-1 text-sm">URL นี้มีคนใช้แล้ว</p>}
            {slugStatus === 'invalid' && (
              <p className="invalid-msg text-danger mt-1 text-sm">ใช้ a-z, 0-9, ขีดกลาง ได้ 3-30 ตัว</p>
            )}
            {slugStatus === 'checking' && <p className="invalid-msg text-default-400 mt-1 text-sm">กำลังตรวจสอบ...</p>}
            {slug && slugStatus === 'ok' && (
              <p className="text-primary mt-3 text-sm">
                deepthailand.app/shop/<span className="font-mono">{slug}</span>
              </p>
            )}
            <button
              type="button"
              onClick={submitSlug}
              disabled={slugLoading || slugStatus !== 'ok' || finishing}
              className="btn bg-primary text-white hover:bg-primary-hover mt-4 w-full disabled:opacity-50"
            >
              {slugLoading || finishing
                ? 'กำลังบันทึก...'
                : vertical === 'LODGING'
                  ? 'เสร็จสิ้น ไปสร้างห้องพักแรก →'
                  : 'ถัดไป →'}
            </button>
          </>
        )}

        {step === 'product' && vertical === 'SERVICE_QUEUE' && (
          <>
            <div className="flex flex-col gap-4">
              <div>
                <label className="form-label">ชื่อคิวงาน</label>
                <div className="input-icon-group">
                  <Icon icon="armchair" className="input-icon" aria-hidden="true" />
                  <input
                    className="form-input"
                    placeholder="เช่น หมอนวด A"
                    value={qName}
                    onChange={(e) => setQName(e.target.value)}
                  />
                </div>
              </div>
              <div>
                <label className="form-label">จำนวนคิวที่รับพร้อมกัน</label>
                <div className="flex items-center gap-2">
                  <input
                    className="form-input"
                    type="number"
                    inputMode="numeric"
                    min={1}
                    placeholder="1"
                    value={qCapacity}
                    onChange={(e) => setQCapacity(e.target.value)}
                  />
                  <span className="text-default-500 shrink-0">คิว</span>
                </div>
              </div>
            </div>
            <div className="mt-5 flex flex-col gap-2">
              <button
                type="button"
                onClick={createQueue}
                disabled={qLoading || finishing}
                className="btn bg-primary text-white hover:bg-primary-hover w-full disabled:opacity-50"
              >
                {qLoading ? 'กำลังสร้าง...' : 'เพิ่มคิวงานเลย'}
              </button>
              <button
                type="button"
                onClick={finish}
                disabled={qLoading || finishing}
                className="text-default-500 w-full py-1 text-center text-sm disabled:opacity-50"
              >
                ข้ามไปก่อน เพิ่มทีหลังได้
              </button>
            </div>
          </>
        )}

        {step === 'product' && vertical !== 'SERVICE_QUEUE' && (
          <>
            <div className="flex flex-col gap-4">
              <div>
                <label className="form-label">ชื่อสินค้า</label>
                <div className="input-icon-group">
                  <Icon icon="package" className="input-icon" aria-hidden="true" />
                  <input
                    className="form-input"
                    placeholder="เช่น ข้าวหอมมะลิ"
                    value={pName}
                    onChange={(e) => setPName(e.target.value)}
                  />
                </div>
              </div>
              <div>
                <label className="form-label">ราคา</label>
                <div className="input-group">
                  <span className="input-group-text">฿</span>
                  <input
                    className="form-input"
                    type="number"
                    min="0.01"
                    step="0.01"
                    placeholder="0.00"
                    value={pPrice}
                    onChange={(e) => setPPrice(e.target.value)}
                  />
                </div>
              </div>
            </div>
            <div className="mt-5 flex flex-col gap-2">
              <button
                type="button"
                onClick={createProduct}
                disabled={pLoading || finishing}
                className="btn bg-primary text-white hover:bg-primary-hover w-full disabled:opacity-50"
              >
                {pLoading ? 'กำลังสร้าง...' : 'สร้างสินค้าเลย'}
              </button>
              <button
                type="button"
                onClick={finish}
                disabled={pLoading || finishing}
                className="text-default-500 w-full py-1 text-center text-sm disabled:opacity-50"
              >
                ข้ามไปก่อน เพิ่มทีหลังได้
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
