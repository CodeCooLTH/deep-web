'use client'

/**
 * Banner โปรโมชั่นเลื่อนได้ (mobile home) — keen-slider auto-slide + dots + swipe.
 * client component เดียวของ home (จำเป็นเพราะ carousel interactive). 3 banner = core ของ Deep.
 */
import { useState } from 'react'
import Link from 'next/link'
import { useKeenSlider } from 'keen-slider/react'
import type { KeenSliderInstance } from 'keen-slider/react'

import AppKeenSlider from '@/libs/styles/AppKeenSlider'

type Slide = { title: string; subtitle: string; cta: string; href: string; image: string; overlay: string }

// overlay ไล่เฉดจากซ้าย (เข้ม→จาง) ทับภาพจริง — Ink Plum โทน brand ให้ตัวอักษรขาวอ่านชัดทุกภาพ
const OVERLAY_PLUM = 'linear-gradient(96deg, rgba(23,18,43,.82) 0%, rgba(23,18,43,.52) 46%, rgba(23,18,43,.12) 100%)'
const OVERLAY_GREEN = 'linear-gradient(96deg, rgba(9,38,26,.82) 0%, rgba(9,38,26,.5) 46%, rgba(9,38,26,.1) 100%)'
const OVERLAY_GOLD = 'linear-gradient(96deg, rgba(46,30,10,.84) 0%, rgba(46,30,10,.52) 46%, rgba(46,30,10,.1) 100%)'

const SLIDES: Slide[] = [
  {
    title: 'ประมูลของสะสมของแท้',
    subtitle: 'มั่นใจทุกดีล · ผู้ขายยืนยันตัวตน',
    cta: 'เริ่มประมูล',
    href: '/m/auctions',
    image: '/images/banner/auctions.jpg',
    overlay: OVERLAY_PLUM,
  },
  {
    title: 'ยืนยันตัวตน เพิ่ม Trust',
    subtitle: 'ปลดล็อกความน่าเชื่อถือ ขายดีขึ้น',
    cta: 'ยืนยันเลย',
    href: '/m/settings/verification',
    image: '/images/banner/verify.jpg',
    overlay: OVERLAY_GREEN,
  },
  {
    title: 'ร้านน่าเชื่อถือ คัดมาให้',
    subtitle: 'เลเวลสูง · ยืนยันตัวตน · ซื้อขายจริง',
    cta: 'ดูร้านค้า',
    href: '/m/shops',
    image: '/images/banner/shops.jpg',
    overlay: OVERLAY_GOLD,
  },
]

// auto-slide ทุก 4 วิ (หยุดตอนลาก) — ตาม pattern CustomerReviews
const autoplay = (slider: KeenSliderInstance) => {
  let timeout: ReturnType<typeof setTimeout>
  const next = () => {
    clearTimeout(timeout)
    timeout = setTimeout(() => slider.next(), 4000)
  }
  slider.on('created', next)
  slider.on('dragStarted', () => clearTimeout(timeout))
  slider.on('animationEnded', next)
  slider.on('updated', next)
}

export default function BannerCarousel() {
  const [current, setCurrent] = useState(0)
  const [sliderRef, instanceRef] = useKeenSlider<HTMLDivElement>(
    { loop: true, slides: { perView: 1 }, slideChanged: s => setCurrent(s.track.details.rel) },
    [autoplay]
  )

  return (
    <div className='relative'>
      <AppKeenSlider>
        {/* shrink-0 บน slide: กัน flash ตอนรีเฟรช — ก่อน keen-slider hydrate ทุกสไลด์ width:100%
            แต่ flex บีบให้เรียงกัน 3 อัน; shrink-0 ทำให้สไลด์แรกเต็มจอทันที (overflow-hidden ซ่อนที่เหลือ) */}
        <div ref={sliderRef} className='keen-slider rounded-2xl overflow-hidden'>
          {SLIDES.map((s, i) => (
            <div key={i} className='keen-slider__slide shrink-0'>
              <Link href={s.href} className='no-underline block'>
                <div className='relative overflow-hidden bs-[152px] p-4 flex flex-col justify-center'>
                  {/* ภาพจริง (cover) + overlay ไล่เฉดให้ตัวอักษรอ่านชัด */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={s.image} alt={s.title} className='absolute inset-0 is-full bs-full object-cover' />
                  <div className='absolute inset-0' style={{ background: s.overlay }} />
                  <div className='relative flex flex-col gap-1.5 max-w-[74%]'>
                    <p className='text-[18px] font-extrabold text-white m-0 leading-tight line-clamp-2'>{s.title}</p>
                    <p className='text-[12.5px] text-white/90 m-0 leading-snug line-clamp-2'>{s.subtitle}</p>
                    <span className='inline-flex items-center gap-1 self-start mbs-1 bg-white text-[#2F2B3D] text-[12px] font-medium pli-3 plb-1.5 rounded-full'>
                      {s.cta}
                      <i className='tabler-arrow-right text-[14px]' />
                    </span>
                  </div>
                </div>
              </Link>
            </div>
          ))}
        </div>
      </AppKeenSlider>

      {/* dots — pill โปร่งมุมขวาล่าง กันทับ text + อ่านชัดทุกพื้นหลัง */}
      <div className='absolute bottom-2.5 right-2.5 z-10 flex items-center gap-1.5 pli-2 plb-1.5 rounded-full bg-black/20'>
        {SLIDES.map((_, i) => (
          <button
            key={i}
            type='button'
            aria-label={`ไปแบนเนอร์ ${i + 1}`}
            onClick={() => instanceRef.current?.moveToIdx(i)}
            className={`h-1.5 rounded-full transition-all ${i === current ? 'bg-white' : 'bg-white/50'}`}
            style={{ inlineSize: i === current ? '14px' : '6px' }}
          />
        ))}
      </div>
    </div>
  )
}
