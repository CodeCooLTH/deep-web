'use client'

/**
 * PublicRoomList — ห้องพักของร้าน `LODGING` บนโปรไฟล์สาธารณะ
 *
 * โฉมใหม่ 2026-08-21 — ยกภาษาการออกแบบมาจาก `.service-card` ของไฟล์อ้างอิงที่ user ส่ง
 * (`deep_store_profile_responsive.html`) ให้ทั้ง 3 ประเภทกิจการพูดภาษาเดียวกัน
 *
 * 🛑 ไฟล์อ้างอิง **ไม่มีหน้าห้องพัก** เลย (ร้านตัวอย่างในไฟล์เป็น `SERVICE_QUEUE`) — โครงนี้จึงเป็น
 * การ *แปล* ภาษาการออกแบบเดียวกันมาใช้ ไม่ใช่การลอก: การ์ดขอบมน 16 + เงาบาง · รูปเต็มความกว้าง ·
 * ชื่อซ้าย/ราคาขวาชิดบน · แถวข้อมูลย่อยมีเส้นคั่นบน
 *
 * 🛑 **ยังไม่มีร้าน LODGING สักร้านในฐานข้อมูล** (นับแล้ว 0 ทั้งที่ลบและยังไม่ตั้ง slug — 2026-08-21)
 * ⇒ หน้านี้ยังไม่เคยถูกเปิดด้วยข้อมูลจริง ให้ถือว่าเป็นโครงที่ *ยังไม่ผ่านการยืนยันด้วยตา*
 * วันที่มีร้านแรกต้องเปิดดูจริงก่อนเชื่อว่าใช้ได้
 */

import Typography from '@mui/material/Typography'

import { Icon } from '@iconify/react'

import { toFileUrl, variantUrlOf } from '@/lib/file-url'

export type PublicRoom = {
  id: string
  name: string
  capacity: number | null
  basePrice: number
  imageUrl: string | null
}

export default function PublicRoomList({
  rooms,
  showPrices,
}: {
  rooms: PublicRoom[]
  /** feature 00053 — ร้านนี้เปิดให้แสดงราคาบนหน้าร้านไหม (ปิด = ไม่พิมพ์บล็อกราคาเลย) */
  showPrices: boolean
}) {
  return (
    /* กริดเดียวกับ `.service-grid` — 2 คอลัมน์ ยุบเหลือ 1 ที่ ≤650px */
    <div className='grid gap-4 [grid-template-columns:repeat(2,minmax(0,1fr))] max-[650px]:[grid-template-columns:1fr]'>
      {rooms.map((r) => {
        const img = toFileUrl(r.imageUrl)
        // feature 00054 — การ์ดห้องพักสูง 172px ไม่ต้องใช้ไฟล์ต้นฉบับเต็มขนาด
        const thumb = variantUrlOf(r.imageUrl, 'thumb')

        return (
          <article
            key={r.id}
            className='rounded-2xl overflow-hidden bg-[var(--mui-palette-background-paper)] border border-[color:var(--mui-palette-divider)]'
            style={{ boxShadow: '0 6px 18px rgb(47 43 61 / .05)' }}
          >
            {/* สูงเท่า `.service-image` เป๊ะ เพื่อให้การ์ดของทั้งสองประเภทกิจการสูงเท่ากัน
                (ผู้ใช้คนเดียวกันอาจเปิดดูร้านทั้งสองแบบในวันเดียว — ความสูงที่ไม่ตรงกันอ่านเป็นความพลาด) */}
            <div
              className='bs-[172px] max-[650px]:bs-[178px] flex items-center justify-center'
              style={{ background: '#191923', color: 'rgba(255,255,255,.35)' }}
            >
              {img ? (
                // eslint-disable-next-line @next/next/no-img-element -- URL หลากโดเมน (storage/CDN)
                <img
                  src={thumb ?? img}
                  alt={r.name}
                  className='is-full bs-full object-cover'
                  loading='lazy'
                  /* ไม่มีรูปย่อ (ยังไม่ backfill / เบราว์เซอร์ไม่รองรับ WebP) → ต้นฉบับ
                     เขียนตรง ๆ ที่ element เพราะการ์ดนี้ไม่มี state ของตัวเองเลย การเพิ่ม state
                     เพื่อ fallback ชั้นเดียวจะบังคับให้ทั้งไฟล์กลายเป็น client component */
                  onError={(e) => {
                    const el = e.currentTarget
                    if (img && el.src !== new URL(img, window.location.origin).href) el.src = img
                  }}
                />
              ) : (
                <Icon icon='tabler:bed' width={34} aria-hidden />
              )}
            </div>

            <div className='p-3.5'>
              <div className='flex justify-between items-start gap-3'>
                <Typography component='b' className='text-[15px] font-bold leading-snug line-clamp-2'>
                  {r.name}
                </Typography>
                {/* feature 00053 — ปิดสวิตช์ราคาแล้วบล็อกนี้หายทั้งก้อน (รวมคำว่า "เริ่มต้นที่"/"ต่อคืน"
                    ซึ่งเป็นคำอธิบายของตัวเลข ไม่มีตัวเลขแล้วมันไม่มีความหมายของตัวเอง)
                    ชื่อห้องเป็น flex item เดียวที่เหลือ จึงกินความกว้างเต็มแถวเองโดยไม่ต้องแก้คลาส */}
                {showPrices && (
                  <div className='text-end shrink-0'>
                    <div className='text-[12px] font-medium text-[var(--mui-palette-text-secondary)]'>
                      เริ่มต้นที่
                    </div>
                    <div className='text-[22px] font-extrabold text-primary whitespace-nowrap tabular-nums leading-none'>
                      {`฿${r.basePrice.toLocaleString('th-TH')}`}
                    </div>
                    <div className='text-[12px] text-[var(--mui-palette-text-secondary)]'>ต่อคืน</div>
                  </div>
                )}
              </div>

              {/* `.meta-row` — โผล่เฉพาะเมื่อมีอะไรจะบอกจริง ๆ เส้นคั่นเปล่า ๆ อ่านเป็น "ข้อมูลหาย" */}
              {r.capacity != null && (
                <div className='flex items-center gap-3 border-bs border-[color:var(--mui-palette-divider)] pbs-2.5 mbs-2.5 text-[11px] text-[#777582]'>
                  <span className='inline-flex items-center gap-1'>
                    <Icon icon='tabler:users' width={13} aria-hidden />
                    {`พักได้ ${r.capacity} คน`}
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
