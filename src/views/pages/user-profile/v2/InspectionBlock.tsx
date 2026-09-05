'use client'

/**
 * InspectionBlock — การ์ด "Deep ตรวจสอบร้านนี้ต่อเนื่อง" บนโปรไฟล์สาธารณะ (feature 00060 · T14)
 *
 * UX-Design-Spec: `docs/20 - Features/00060 - Shop Inspection Plan/UX-Design-Spec.md` §Surface A
 *
 * Base: src/views/pages/user-profile/v2/ShopProfile.tsx (`SIDE_CARD_SX`/`TABS_CARD_SX` — กรอบการ์ด
 *   14px/border #ececf2/เงาเดียวกับการ์ดอื่นในหน้า ตาม Theme Source Mapping แถว "Card frame")
 *   + src/views/pages/user-profile/v2/EvidencePanel.tsx (โครงหัวข้อ + ปุ่มเปิดหน้าเต็ม pattern
 *   เดียวกับ `onOpenBadgePage`) — ทั้งคู่ adapt มาจาก
 *   theme/vuexy/typescript-version/full-version/src/views/pages/user-profile/profile/index.tsx
 *   (โครง MUI/sx ของหน้าโปรไฟล์) ตั้งแต่แรกอยู่แล้ว (ดู commit cf4fd5cd)
 *
 * 🛑 ห้ามคำนวณสถานะเอง — ทุกอย่างที่นี่มาจาก `InspectionViewVM` ที่ page.tsx สร้างจาก
 * `getInspectionForPublicProfile()` (server) แล้ว component นี้แค่จัดวาง
 */
import { useState } from 'react'

import Typography from '@mui/material/Typography'

import { Icon } from '@iconify/react'

import ProfileLightbox from './ProfileLightbox'
import { InspectionCheckRow } from './InspectionChecklist'
import { pickNotableLines, totalCheckCount, type InspectionViewVM } from './inspection-view-vm'

import { formatDateTH } from '@/lib/format-date'

/** Signal Cyan (`#00BAD1`) — ไอคอนหัวข้อของบล็อกนี้เท่านั้น ตาม UX spec §Section breakdown */
const SIGNAL_CYAN = '#00BAD1'

/** กรอบการ์ด — ชุดเดียวกับ `SIDE_CARD_SX`/`TABS_CARD_SX` ของ `ShopProfile.tsx` (14px/#ececf2/เงา) */
const CARD_CLASS =
  // 🛑 บันไดรัศมีฝั่ง buyer: rounded(6) · rounded-lg(8) · rounded-2xl(12) · rounded-full
  //    การ์ด = 12px นิยามเดียวทั้งธีม (main #46 ยึดไว้ พร้อมด่าน buyer-card-radius.test.ts)
  //    เดิมไฟล์นี้เขียน rounded-[14px] เพราะก็อปค่าจาก ShopProfile **ตอนที่ main กำลังแก้ค่านั้น
  //    อยู่พอดี** — rebase ผ่านสะอาดไม่มี conflict แต่การ์ดใบนี้จะเป็นใบเดียวในหน้าที่รัศมีไม่ตรงชาวบ้าน
  'rounded-2xl border border-solid p-5 mbe-[18px]'

function StepDots({ step }: { step: 1 | 2 | 3 | 4 }) {
  return (
    <div aria-hidden className='flex items-center gap-1.5 mbs-2'>
      {([1, 2, 3, 4] as const).map((i) => (
        <span
          key={i}
          className='is-1.5 bs-1.5 rounded-full shrink-0'
          style={{
            background: i <= step ? SIGNAL_CYAN : 'transparent',
            border: i <= step ? 'none' : `1px solid ${SIGNAL_CYAN}`,
            opacity: i <= step ? 1 : 0.5,
          }}
        />
      ))}
    </div>
  )
}

export default function InspectionBlock({
  data,
  onOpenFull,
}: {
  /** null = ร้านไม่ใช่ LODGING หรือไม่เคยสมัครแผนเลย — ไม่ render อะไรทั้งสิ้น (UX spec Edge states) */
  data: InspectionViewVM | null
  onOpenFull: () => void
}) {
  const lastRound = data?.timeline[0] ?? null
  const [viewerIdx, setViewerIdx] = useState<number | null>(null)

  if (data === null) return null

  const notable = pickNotableLines(data, 3)
  const totalCount = totalCheckCount(data)

  return (
    <div className={CARD_CLASS} style={{ borderColor: '#ececf2', boxShadow: '0 4px 18px rgba(40,34,76,.08)' }}>
      {data.active ? (
        <>
          <div className='flex items-center gap-2'>
            <Icon icon='tabler:shield-check' width={20} style={{ color: SIGNAL_CYAN }} aria-hidden />
            <Typography component='h2' className='text-[15px] font-semibold min-is-0'>
              Deep ตรวจสอบร้านนี้ต่อเนื่อง
            </Typography>
          </div>
          <Typography className='text-[13px] mbs-1' color='text.secondary'>
            {`กำลังอยู่ในขั้น: ${data.stepLabelTh}`}
          </Typography>
          <StepDots step={data.step} />
        </>
      ) : (
        // สถานะ LAPSED — แถบสีเทากลาง ห้ามแดง ห้ามถ้อยคำลงโทษ (ร้านที่เลิกจ่ายไม่ได้ทำผิด)
        <div className='flex items-start gap-2'>
          <Icon icon='tabler:shield-check' width={20} className='text-[var(--mui-palette-text-disabled)]' aria-hidden />
          <div className='min-is-0'>
            <Typography component='h2' className='text-[15px] font-semibold' color='text.secondary'>
              ไม่ได้อยู่ในแผนการตรวจสอบต่อเนื่องแล้ว
            </Typography>
            <Typography className='text-[13px] mbs-1' color='text.secondary'>
              {`ข้อมูลล่าสุด: ตรวจเมื่อ ${data.dataAsOf ? formatDateTH(data.dataAsOf) : '—'}`}
            </Typography>
          </div>
        </div>
      )}

      {/* หลักฐานย่อ — สูงสุด 3 ข้อเด่น ไม่ใช่ตัวหาร N/18 (UX spec)
          🛑 ต้องมีหัวข้อกำกับว่านี่คือ "ข้อที่ผ่าน" ไม่ใช่ "สรุปทั้งหมด" — `pickNotableLines()`
             คัดเฉพาะแถวที่ผ่าน ⇒ ถ้าไม่มีคำกำกับ มันคือรายการข่าวดีล้วนที่หน้าตาเหมือนสรุปครบทุกข้อ
             คนที่ไม่กดเข้าไปดูต่อจะเข้าใจว่าร้านนี้ตรวจครบแล้วทุกข้อ ทั้งที่อาจมีข้อที่ยังไม่มีข้อมูล
             อีกหลายข้อซ่อนอยู่ (และข้อที่ "ไม่ผ่าน" ถูกยุบเป็น "ยังไม่มีข้อมูล" ตั้งแต่ server) */}
      {notable.length > 0 && (
        <Typography component='h3' className='text-[13px] font-semibold mbs-4' color='text.secondary'>
          ข้อที่ผ่านการตรวจล่าสุด
        </Typography>
      )}
      {notable.length > 0 && (
        <ul className='flex flex-col gap-2.5 m-0 p-0 list-none mbs-2'>
          {notable.map(({ line, roomName }) => (
            <InspectionCheckRow key={line.checkKey} line={line} roomName={roomName} dense />
          ))}
        </ul>
      )}

      {/* รอบตรวจล่าสุด (preview) — รอบล่าสุดเท่านั้น + ภาพย่อ ≤4 รูป */}
      {lastRound && (
        <div className='mbs-4 pbs-4 border-bs' style={{ borderColor: '#ececf2' }}>
          {lastRound.photoUrls.length > 0 && (
            <div className='flex gap-1.5 mbe-2'>
              {lastRound.photoUrls.slice(0, 4).map((url, i) => (
                <button
                  key={url}
                  type='button'
                  onClick={() => setViewerIdx(i)}
                  className='is-12 bs-12 rounded-lg overflow-hidden border-0 p-0 cursor-pointer shrink-0'
                  aria-label={`ดูภาพรอบตรวจ ${i + 1} จาก ${lastRound.photoUrls.length}`}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element -- URL จาก storage (toFileUrl) */}
                  <img src={url} alt='' className='is-full bs-full object-cover' />
                </button>
              ))}
            </div>
          )}
          <Typography className='text-[13px] font-semibold'>รอบตรวจล่าสุด</Typography>
          <Typography className='text-[13px]' color='text.secondary'>
            {`${formatDateTH(lastRound.completedAt)} · ตรวจโดย ${lastRound.inspectorDisplayName}`}
          </Typography>
        </div>
      )}

      <button
        type='button'
        onClick={onOpenFull}
        className='mbs-4 text-[13px] font-semibold text-primary bg-transparent border-0 p-0 cursor-pointer flex items-center gap-1'
      >
        {`ดูผลครบทุกข้อ (${totalCount} ข้อ) รวมข้อที่ยังไม่มีข้อมูล`}
        <Icon icon='tabler:chevron-right' width={15} aria-hidden />
      </button>

      {lastRound && lastRound.photoUrls.length > 0 && viewerIdx !== null && (
        <ProfileLightbox
          open
          onClose={() => setViewerIdx(null)}
          onPrev={viewerIdx > 0 ? () => setViewerIdx(viewerIdx - 1) : undefined}
          onNext={viewerIdx < lastRound.photoUrls.length - 1 ? () => setViewerIdx(viewerIdx + 1) : undefined}
          index={viewerIdx + 1}
          total={lastRound.photoUrls.length}
          ariaLabel={`ภาพรอบตรวจ ${formatDateTH(lastRound.completedAt)}`}
          mediaSlot={
            // eslint-disable-next-line @next/next/no-img-element -- URL จาก storage (toFileUrl)
            <img
              src={lastRound.photoUrls[viewerIdx]}
              alt=''
              className='max-is-full max-bs-full object-contain'
            />
          }
          panelSlot={
            <div className='p-5'>
              <Typography className='text-[15px] font-semibold'>{data.stepLabelTh}</Typography>
              <Typography className='text-[13px] mbs-1' color='text.secondary'>
                {`${formatDateTH(lastRound.completedAt)} · ตรวจโดย ${lastRound.inspectorDisplayName}`}
              </Typography>
            </div>
          }
        />
      )}
    </div>
  )
}
