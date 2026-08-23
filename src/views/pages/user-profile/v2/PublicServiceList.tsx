'use client'

/**
 * PublicServiceList — รายการบริการของร้าน `SERVICE_QUEUE` บนโปรไฟล์สาธารณะ
 *
 * โฉมใหม่ 2026-08-21 ยกโครงจากไฟล์อ้างอิงที่ user ส่ง (`deep_store_profile_responsive.html`
 * หัวข้อ `.service-grid` / `.service-card`) — ค่าทุกตัว (radius 16 · ภาพสูง 172 · body 14 ·
 * ราคา 24px/900 · meta-row 11px มีเส้นคั่นบน) มาจากไฟล์นั้นตรง ๆ
 *
 * ## 🛑 สิ่งที่ไฟล์อ้างอิงมีแต่เราไม่ใส่ และเหตุผล
 *
 * **ปุ่ม "จองบริการนี้" / "เลือกวันและเวลา"** — ไฟล์อ้างอิงวาดไว้ท้ายการ์ดทุกใบ แต่โปรไฟล์
 * สาธารณะ **ยังไม่มีเส้นทางจองจริง** ปุ่มที่กดแล้วไม่เกิดอะไรแย่กว่าไม่มีปุ่ม โดยเฉพาะกับ
 * กลุ่มผู้ใช้ตาม PRODUCT.md (ผู้สูงวัย/digital-literacy ต่ำ) ที่จะกดซ้ำแล้วคิดว่าเครื่องค้าง
 * ⇒ ทางติดต่อร้านมีอยู่แล้วที่ปุ่ม "ติดต่อร้านค้า" บนปก ซึ่งใช้ได้จริง
 *
 * **รูปบริการ + คำอธิบาย + "รับประกันงาน"** — `PublicService` ไม่มีฟิลด์พวกนี้เลย
 * (`id`/`name`/`durationMinutes`/`depositMode`/`depositValue` เท่านั้น) การแต่งข้อความ
 * ขึ้นมาเองคือการสร้างคำมั่นสัญญาแทนร้าน — ห้ามเด็ดขาด
 */

import Typography from '@mui/material/Typography'

import { Icon } from '@iconify/react'

import { formatDurationTH } from '@/lib/appointments'

export type PublicService = {
  id: string
  name: string
  durationMinutes: number | null
  depositMode: string
  depositValue: string
}

/** ป้ายมัดจำ — ไม่แสดงบรรทัดเลยถ้ามัดจำ 0/ยังไม่ตั้งค่า (ไม่ใช่ error state — UX spec §B edge states) */
function depositLabel(mode: string, value: string): { caption: string; amount: string } | null {
  const n = Number(value)
  if (!n || n <= 0) return null
  return mode === 'PERCENT'
    ? { caption: 'มัดจำ', amount: `${n}%` }
    : { caption: 'มัดจำ', amount: `฿${n.toLocaleString('th-TH')}` }
}

export default function PublicServiceList({
  services,
  showPrices,
}: {
  services: PublicService[]
  /** feature 00053 — ปิดแล้วไม่พิมพ์บล็อกมัดจำ (ตัวเลขเงินเดียวบนการ์ดบริการ) */
  showPrices: boolean
}) {
  return (
    /* `.service-grid` — 2 คอลัมน์ ยุบเหลือ 1 ที่ ≤650px ตามไฟล์อ้างอิง
       650 ไม่ใช่ breakpoint ของ MUI จึงเขียนเป็น media query ตรง ๆ ให้ตรงต้นแบบ */
    <div className='grid gap-4 [grid-template-columns:repeat(2,minmax(0,1fr))] max-[650px]:[grid-template-columns:1fr]'>
      {services.map((s) => {
        /* feature 00053 — ร้านที่ปิดสวิตช์ราคา ไม่แสดงมัดจำ: มันคือตัวเลขเงินเดียวบนการ์ดนี้
           และเป็นสิ่งที่ผู้ซื้อใช้ประเมินราคาเต็มของบริการ ปล่อยไว้ = ซ่อนราคาแบบไม่จริง */
        const deposit = showPrices ? depositLabel(s.depositMode, s.depositValue) : null

        return (
          <article
            key={s.id}
            className='rounded-[14px] overflow-hidden bg-[var(--mui-palette-background-paper)] border border-[#ececf2]'
            style={{ boxShadow: '0 6px 18px rgba(30,27,56,.05)' }}
          >
            {/* `.service-image` — ไม่มีรูปในข้อมูล จึงเป็นแผ่นทึบ + ไอคอนแทน (สูงเท่าต้นแบบ
                เพื่อให้การ์ดสูงเท่ากันทุกใบ ไม่งั้นกริดจะฟันหลอ) */}
            <div
              className='bs-[172px] max-[650px]:bs-[178px] flex items-center justify-center'
              style={{ background: '#191923', color: 'rgba(255,255,255,.35)' }}
              aria-hidden
            >
              <Icon icon='tabler:armchair' width={34} />
            </div>

            <div className='p-3.5'>
              {/* `.service-title` — ชื่อซ้าย ราคาขวา ชิดบน */}
              <div className='flex justify-between items-start gap-3'>
                <Typography component='b' className='text-[15px] font-bold leading-snug line-clamp-2'>
                  {s.name}
                </Typography>
                {deposit && (
                  <div className='text-end shrink-0'>
                    <div className='text-[10px] font-semibold text-[var(--mui-palette-text-secondary)]'>
                      {deposit.caption}
                    </div>
                    {/* `.price` 24px/900 สีม่วง — ใช้ `text-primary` ของธีม ไม่ใช่ `--purple` ของไฟล์อ้างอิง */}
                    <div className='text-[24px] font-black text-primary whitespace-nowrap tabular-nums leading-none'>
                      {deposit.amount}
                    </div>
                  </div>
                )}
              </div>

              {/* `.meta-row` — เส้นคั่นบน + ข้อมูลย่อย · แสดงเฉพาะเมื่อมีอะไรจะบอกจริง ๆ
                  ถ้าร้านไม่ได้ตั้งระยะเวลา การโชว์เส้นคั่นเปล่า ๆ จะอ่านเป็น "ข้อมูลหาย" */}
              {s.durationMinutes != null && (
                <div className='flex items-center gap-3 border-bs border-[#ececf2] pbs-2.5 mbs-2.5 text-[11px] text-[#777582]'>
                  <span className='inline-flex items-center gap-1'>
                    <Icon icon='tabler:clock' width={13} aria-hidden />
                    {formatDurationTH(s.durationMinutes)}
                  </span>
                </div>
              )}
            </div>
          </article>
        )
      })}
    </div>
  )
}
