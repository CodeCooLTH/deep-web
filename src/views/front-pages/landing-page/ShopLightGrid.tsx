'use client'

// React Imports
import { useEffect, useRef, useState } from 'react'

// Next Imports
import Link from 'next/link'

// MUI Imports
import Typography from '@mui/material/Typography'

// Third-party Imports
import classnames from 'classnames'

// Util Imports
import { getTierChipTone, getTierGradient } from '@/lib/trust-tier'

// Type Imports
import type { LandingShop } from './TrustSearchHero'

// Styles Imports
import frontCommonStyles from '@views/front-pages/styles.module.css'

/** ทุกกี่ ms ลำแสงขยับหนึ่งช่อง — ช้าพอให้อ่านชื่อร้านทันตอนแสงผ่าน */
const BEAM_STEP_MS = 260

/** ลำแสงกว้างกี่ช่อง (ช่องที่ลำแสงอยู่ ± ค่านี้ สว่าง) */
const BEAM_REACH = 1

/** ร้านที่ดีลจบจริงไม่ถึงเท่านี้ = ร้านใหม่ → พื้นเทา (กติกาเดียวกับ TrustSearchHero / ปกโปรไฟล์) */
const NEW_SHOP_MIN_DEALS = 3

function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false)

  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)')
    const read = () => setReduced(query.matches)

    read()
    query.addEventListener('change', read)

    return () => query.removeEventListener('change', read)
  }, [])

  return reduced
}

/**
 * กริดร้านในระบบแบบ "ลำแสงกวาด" — ไทล์หรี่อยู่ สว่างขึ้นเมื่อลำแสงผ่านหรือเมื่อชี้ (แรงบันดาลใจจากภาพ
 * reference ที่ user ส่ง 2026-10-13 · layout/skin ยึด buyer theme ตาม HR6)
 *
 * - ลำแสงเดินตามลำดับการอ่าน (ซ้าย→ขวา บน→ล่าง) จึงไม่ต้องรู้ว่าตอนนี้กริดมีกี่คอลัมน์
 * - หยุดเมื่อชี้อยู่บนกริด หรือกริดอยู่นอกจอ — ไม่เปลืองรอบ render
 * - prefers-reduced-motion → ไม่มีลำแสง ทุกไทล์สว่างตลอด
 * - คลิกไทล์ = ไปหน้าโปรไฟล์ร้าน (ต่างจาก reference ที่คลิกเพื่อ "จอดแสง" เพราะผู้ใช้ที่มาหน้านี้
 *   ต้องการเช็กร้าน ไม่ใช่เล่นกับแสง)
 */
const ShopLightGrid = ({ shops, shopCount }: { shops: LandingShop[]; shopCount: number }) => {
  const reduced = useReducedMotion()
  const ref = useRef<HTMLDivElement>(null)
  const [beam, setBeam] = useState(0)
  const [hover, setHover] = useState(-1)
  const [onScreen, setOnScreen] = useState(false)

  useEffect(() => {
    const el = ref.current

    if (!el) return
    const observer = new IntersectionObserver(([entry]) => setOnScreen(entry.isIntersecting), { threshold: 0.2 })

    observer.observe(el)

    return () => observer.disconnect()
  }, [])

  const running = !reduced && onScreen && hover < 0 && shops.length > 1

  useEffect(() => {
    if (!running) return
    // วนเกินท้ายไป BEAM_REACH*2 ช่อง ให้แสงหลุดออกจากไทล์สุดท้ายจนหมดก่อนเริ่มรอบใหม่
    const span = shops.length + BEAM_REACH * 2
    const timer = window.setInterval(() => setBeam(b => (b + 1) % span), BEAM_STEP_MS)

    return () => clearInterval(timer)
  }, [running, shops.length])

  if (shops.length === 0) return null

  const isLit = (i: number) => {
    if (reduced) return true
    if (hover >= 0) return i === hover

    return Math.abs(i - (beam - BEAM_REACH)) <= BEAM_REACH
  }

  return (
    <section id='shops' className='bg-backgroundPaper'>
      <div className={classnames('flex flex-col gap-8 pbs-12 pbe-12 md:pbs-20 md:pbe-20', frontCommonStyles.layoutSpacing)}>
        <div className='flex flex-col items-center gap-1 text-center'>
          <Typography variant='h4' color='text.primary'>
            ร้านในระบบตอนนี้ <span className='tabular-nums'>{shopCount.toLocaleString('th-TH')}</span> ร้าน
          </Typography>
          <Typography className='max-is-[560px]'>
            ทุกร้านมี Trust Score 0–100 จากการยืนยันตัวตน ออเดอร์ที่จบจริง เรตติ้ง อายุบัญชี และ Badge — แตะการ์ดเพื่อดูโปรไฟล์ร้าน
          </Typography>
        </div>

        <div
          ref={ref}
          className='grid grid-cols-2 gap-4 rounded-2xl border border-[var(--mui-palette-divider)] p-5 sm:grid-cols-3 lg:grid-cols-5 lg:gap-6'
          onMouseLeave={() => setHover(-1)}
        >
          {shops.map((s, i) => {
            const lit = isLit(i)
            const isNewShop = s.deals < NEW_SHOP_MIN_DEALS
            const tone = getTierChipTone(s.trustScore)

            return (
              <Link
                key={s.username}
                href={`/u/${s.username}`}
                aria-label={`${s.shopName} — Trust Score ${s.trustScore} ${s.tierLabel}`}
                onMouseEnter={() => setHover(i)}
                onFocus={() => setHover(i)}
                onBlur={() => setHover(-1)}
                className={classnames(
                  'group relative isolate block aspect-square overflow-hidden rounded-2xl no-underline',
                  'outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2',
                  'transition-[transform,box-shadow] duration-500',
                  lit ? 'shadow-md -translate-y-0.5' : 'shadow-none'
                )}
                style={{ transitionTimingFunction: 'cubic-bezier(0.25, 1, 0.5, 1)' }}
              >
                {/* พื้น: โลโก้ร้านถ้ามี ไม่งั้นไล่สีของ tier (getTierGradient — SSOT Tier Lists) */}
                {s.image ? (
                  <img src={s.image} alt='' className='absolute inset-0 size-full object-cover' draggable={false} />
                ) : (
                  <span
                    aria-hidden='true'
                    className='absolute inset-0 grid place-items-center text-[2.875rem] font-medium text-white/90'
                    style={{ background: getTierGradient(isNewShop ? 0 : s.trustScore) }}
                  >
                    {s.shopName.slice(0, 1)}
                  </span>
                )}

                {/* ไล่เงาล่างให้ชื่อร้านสีขาวอ่านออก — ทับรูปของร้าน = Photo Scrim (ดำได้), ทับไล่สีของเรา = หมึกพลัม */}
                <span
                  aria-hidden='true'
                  className='absolute inset-0'
                  style={{
                    backgroundImage: s.image
                      ? 'linear-gradient(180deg, transparent 45%, rgb(0 0 0 / 0.72) 100%)'
                      : 'linear-gradient(180deg, transparent 45%, rgb(47 43 61 / 0.72) 100%)'
                  }}
                />

                {/* คะแนน: พื้นขาวทึบ + หมึกจาก getTierChipTone (คำนวณบนพื้นขาว ≥4.79:1) */}
                <span
                  className='absolute inline-flex items-baseline gap-1 rounded-full bg-white pli-2.5 plb-1 block-start-3 inline-end-3'
                  style={{ color: tone.text }}
                >
                  <span className='text-[1.125rem] font-extrabold leading-none tabular-nums'>{s.trustScore}</span>
                  <span className='text-[0.8125rem] font-medium'>{s.tierLabel.replace('Deep ', '')}</span>
                </span>

                <span className='absolute inset-x-0 block-end-0 flex flex-col gap-0.5 p-3 md:p-4'>
                  <span className='flex items-center gap-1 text-[0.9375rem] font-medium leading-[1.467] text-white'>
                    <span className='truncate'>{s.shopName}</span>
                    {s.verified && <i className='tabler-rosette-discount-check-filled shrink-0 text-base' />}
                  </span>
                  <span className='text-[0.8125rem] text-white/90'>
                    {s.deals > 0 ? `${s.deals.toLocaleString('th-TH')} ดีลสำเร็จ` : 'ร้านใหม่'}
                  </span>
                </span>

                {/* ม่านหรี่ — ยกออกเมื่อลำแสงผ่านหรือชี้ */}
                <span
                  aria-hidden='true'
                  className='pointer-events-none absolute inset-0 bg-backgroundPaper transition-opacity duration-500'
                  style={{ opacity: lit ? 0 : 0.55, transitionTimingFunction: 'cubic-bezier(0.25, 1, 0.5, 1)' }}
                />
              </Link>
            )
          })}
        </div>
      </div>
    </section>
  )
}

export default ShopLightGrid
