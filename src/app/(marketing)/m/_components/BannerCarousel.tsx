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

type Slide = { title: string; subtitle: string; cta: string; href: string; gradient: string; icon: string }

const SLIDES: Slide[] = [
  {
    title: 'ประมูลของสะสมของแท้',
    subtitle: 'มั่นใจทุกดีล · ผู้ขายยืนยันตัวตน',
    cta: 'เริ่มประมูล',
    href: '/m/auctions',
    gradient: 'linear-gradient(120deg, #6558E8 0%, #7367F0 55%, #9A8FF6 100%)',
    icon: 'tabler-gavel',
  },
  {
    title: 'ยืนยันตัวตน เพิ่ม Trust',
    subtitle: 'ปลดล็อกความน่าเชื่อถือ ขายดีขึ้น',
    cta: 'ยืนยันเลย',
    href: '/settings/verification',
    gradient: 'linear-gradient(120deg, #17A055 0%, #28C76F 55%, #5FD994 100%)',
    icon: 'tabler-shield-check',
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
                <div className='relative overflow-hidden bs-[144px] p-4 flex flex-col justify-center' style={{ background: s.gradient }}>
                  <div className='absolute -top-8 -right-8 size-28 rounded-full bg-white/10' />
                  <i className={`${s.icon} absolute -bottom-1 right-3 text-[72px] text-white/12`} />
                  <div className='relative flex flex-col gap-1.5 max-w-[76%]'>
                    <p className='text-[17px] font-extrabold text-white m-0 leading-tight line-clamp-2'>{s.title}</p>
                    <p className='text-[12.5px] text-white/85 m-0 leading-snug line-clamp-2'>{s.subtitle}</p>
                    <span className='inline-flex items-center gap-1 self-start mbs-1 bg-white text-[#2F2B3D] text-[12px] font-semibold pli-3 plb-1.5 rounded-full'>
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
