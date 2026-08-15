'use client'

/**
 * OfficialChannelsBlock — เพจทางการของร้าน: แถวสรุป + หน้าเต็ม
 *
 * user สั่ง 2 รอบ:
 *   รอบแรก: "อยากให้คนดูรู้ว่านี่คือ official page ที่แท้จริง เนื่องจากเจอปัญหาว่ามีการปลอม
 *            social media page เยอะมากในปัจจุบัน"
 *   รอบสอง: "ผมไม่ชอบการแสดงผลตรงนี้ มันกินพื้นที่เกินไป **และถ้าเขามี 3-4 page ที่เป็น
 *            official จริง ๆ ล่ะ ทำไง**"
 *
 * ── รอบแรกผมแก้ถูกเรื่อง แต่แก้ด้วยวิธีที่ไม่ scale ────────────────────
 * การ์ดเต็มใบสูงราว 200px กับ 2 เพจ และโตเป็น **เชิงเส้น** ตามจำนวนเพจ (4 เพจ ≈ 300px+)
 * ร้านที่ทำการตลาดจริงจังมักมีหลายเพจ (เพจหลัก / เพจย่อยรายสินค้า / IG / LINE) ⇒ ยิ่งร้านที่
 * ควรได้ประโยชน์จากบล็อกนี้มากที่สุด กลับเป็นร้านที่โดนบล็อกนี้ดันเนื้อหาตกจอมากที่สุด
 *
 * ── ทางแก้ รอบสาม: **ยึดผังที่ prod ใช้อยู่แล้ว** ไม่ใช่ประดิษฐ์ผังใหม่ ─────────
 * user ส่งภาพหน้าจอ prod มาให้ดู (2026-08-13) — `ChannelStrip` ของจริง **กะทัดรัดอยู่แล้ว**:
 * เพจเรียงกันแนวนอน แต่ละก้อนมีรูป+เช็คเขียว / ชื่อเพจ (ตัดที่ 150px) / แพลตฟอร์ม + ยอดติดตาม
 * ครบในราว 44px
 *
 * 🛑 รอบสองผมจะเปลี่ยนเป็น "รูปซ้อนกัน + ชื่อเดียว" ซึ่ง **แย่กว่า prod** — ความสูงเท่ากันแต่
 * เสียชื่อเพจใบที่สอง เสียแพลตฟอร์ม เสียยอดติดตามไปทั้งหมด นั่นคือการแก้ปัญหาที่ไม่มีอยู่จริง
 * แล้วสร้างปัญหาใหม่ (ผัง prod ผ่านการลองผิด 3 รอบกับ user มาแล้ว — ดูคอมเมนต์ ChannelStrip)
 *
 * ของเดิมขาดแค่ 2 อย่าง แก้แค่ 2 อย่าง:
 *   1. **ไม่มีคำว่า "ทางการ" ที่ไหนเลย** — ความหมายอยู่ในเช็ค 9px + tooltip ที่มือถือเข้าไม่ถึง
 *      ⇒ เพิ่มบรรทัดกำกับ ~18px บรรทัดเดียว
 *   2. **`VISIBLE = 2` แล้ว "อีก N" กางต่อในหน้า** ⇒ 3–4 เพจดันเนื้อหาตกจอ
 *      ⇒ เปลี่ยน "อีก N" ให้เปิด **หน้าเต็ม** แทนการกางในหน้า ⇒ ความสูงคงที่ไม่ว่าจะกี่เพจ
 *
 * 🛑 **ชื่อเพจต้องยังอยู่ในแถวสรุป** ห้ามยุบเหลือ "เพจทางการ 2 เพจ" — ผู้ซื้อไทยจำนวนมาก
 * รู้จักเพจของร้านก่อนรู้จัก Deep การเห็นชื่อเพจเดียวกับที่เคยเห็นในฟีดคือหลักฐาน "มาถูกร้าน"
 * ที่ทำงานทันทีโดยไม่ต้องกดอะไร (เหตุผลเดิมที่ user สั่งย้ายช่องทางขึ้นมาไว้ใต้ slug เมื่อ 2026-08-09)
 *
 * 🛑 ข้อความกันเพจปลอมย้ายไปอยู่หลังการแตะ — **ยอมรับข้อแลกเปลี่ยนนี้โดยตั้งใจ**: คนที่กำลัง
 * สงสัยว่าเพจที่เจอมาเป็นของจริงไหม คือคนที่จะกดเข้าไปอ่าน ส่วนคนที่ไม่สงสัยก็ไม่ได้ต้องการมัน
 * สิ่งที่ยังอยู่หน้าแรกคือส่วนที่ทำงานแบบไม่ต้องอ่าน: เช็คเขียว + คำว่า "เพจทางการ" + ชื่อเพจ
 *
 * 🛑 สองอย่างที่ห้ามเขียนเด็ดขาด (ยกกติกาจาก `trustNote()` ใน OfficialChannels.tsx):
 *   - ห้ามเขียนว่า "Deep ตรวจสอบแล้วว่าเป็นเพจของร้าน" — เราไม่ได้ตรวจ เรารับผลจาก OAuth
 *   - ห้ามเขียนว่าเพจที่ไม่อยู่ในรายการเป็น "เพจปลอม" — ร้านอาจมีเพจจริงที่ยังไม่ได้เชื่อม
 *     ประโยคที่พูดได้จริงคือ "ยังไม่ได้ยืนยันกับ Deep" ซึ่งพอสำหรับการตัดสินใจอยู่แล้ว
 */
import { useState } from 'react'

import Typography from '@mui/material/Typography'
import Dialog from '@mui/material/Dialog'
import IconButton from '@mui/material/IconButton'

import CustomAvatar from '@core/components/mui/Avatar'
import { Icon } from '@iconify/react'

import type { OfficialChannel } from './OfficialChannels'
import {
  channelProfileUrl,
  CHANNEL_FULL_LABEL,
  CHANNEL_FOLLOWER_LABEL,
} from '@/lib/official-channel-link'
import { compactCount } from '@/lib/format-compact-number'

/**
 * 🛑 ลิงก์/ป้าย/คำเรียกยอด มาจาก `src/lib/official-channel-link.ts` ที่เดียว — ห้ามประกอบ URL เอง
 * ที่นี่ ก่อนหน้านี้มี builder กระจาย 3 ที่ที่ไม่ตรงกัน และตัวที่สร้างจาก `externalId` ล้วน ๆ
 * ทำให้ปุ่มของ Instagram/LINE พาไป 404 (ดูเหตุผลเต็มในไฟล์ SSOT)
 */

/** จำนวนเพจที่โชว์เต็มรูปแบบในแถวสรุป — ค่าเดียวกับ `VISIBLE` ของ ChannelStrip บน prod
 *  ที่เหลือยุบเป็น "อีก N" ซึ่งเปิดหน้าเต็ม (prod กางในหน้า = ที่มาของปัญหาร้านหลายเพจ) */
const VISIBLE = 2

/** สีแบรนด์ของช่องทาง — carve-out ของ HR6 (เป็น asset ของเจ้าของแพลตฟอร์ม ไม่ใช่สีเราเอง) */
const BRAND_BG: Record<string, string> = {
  MESSENGER: '#1877F2',
  INSTAGRAM: 'linear-gradient(45deg,#f09433,#dc2743,#bc1888)',
  LINE: '#06C755',
}
const BRAND_ICON: Record<string, string> = {
  MESSENGER: 'lucide:facebook',
  INSTAGRAM: 'lucide:instagram',
  LINE: 'lucide:message-circle',
}

/**
 * รูปเพจ + **badge แพลตฟอร์มมุมขวาล่าง** — ใช้ทั้งแถวสรุป (เล็ก) และหน้าเต็ม (ใหญ่)
 *
 * 🛑 มุมนี้เคยเป็นเช็คเขียว แล้วบล็อกนี้ **ทำงานไม่ได้เลยตอนรูปเพจโหลดสำเร็จ** (user ส่งภาพ
 * หน้าจอจริงมา 2026-08-13): ร้านที่มีเพจ Facebook กับ Instagram ชื่อเดียวกัน — ซึ่งเป็นกรณี
 * *ปกติที่สุด* ของร้านที่ทำการตลาดจริงจัง — จะได้สองแถวที่ **รูปเหมือนกัน ชื่อเหมือนกัน
 * เช็คเขียวเหมือนกัน** ต่างกันแค่ตัวหนังสือบรรทัดล่าง ทั้งที่ทั้งบล็อกมีไว้ให้ผู้ซื้อเทียบว่า
 * "เพจที่ฉันเห็นในฟีดคือใบไหน" ⇒ ข้อมูลที่ *ขาด* คือแพลตฟอร์ม ไม่ใช่สถานะยืนยัน
 *
 * ส่วนเช็คเขียวไม่ได้หายไปไหน — หัวบล็อกมี `✓ เพจทางการ` กำกับทั้งรายการอยู่แล้ว การย้ำที่ทุก
 * แถวจึงเป็นการใช้พื้นที่ที่มีค่าที่สุด (มุมของรูป) ไปกับข้อมูลที่ซ้ำ
 *
 * Base: `OrderSourceLogo.tsx` ฝั่งผู้ขาย (รูปเพจ + badge แพลตฟอร์มห้อยมุม + ring คั่นให้อ่าน
 * เป็นคนละชั้น) — แพตเทิร์นเดียวกับ avatar+channel badge ในกล่องแชท (sibling-surface-parity)
 */
function ChannelMark({ c, size }: { c: OfficialChannel; size: number }) {
  const badge = Math.max(14, Math.round(size * 0.42))

  return (
    <span className='shrink-0 relative' style={{ inlineSize: size, blockSize: size }}>
      <CustomAvatar
        src={c.avatarUrl ?? undefined}
        alt=''
        variant='rounded'
        sx={{
          inlineSize: size,
          blockSize: size,
          borderRadius: '8px',
          background: BRAND_BG[c.provider] ?? 'var(--mui-palette-action-hover)',
          color: 'common.white',
        }}
      >
        <Icon icon={BRAND_ICON[c.provider] ?? 'lucide:link'} width={Math.round(size * 0.5)} />
      </CustomAvatar>
      {/* สีแบรนด์ของแพลตฟอร์มเป็น carve-out ของ HR6 (asset ของเจ้าของแพลตฟอร์ม ไม่ใช่สีเรา)
          ring สีพื้นการ์ดคั่นไว้ ไม่งั้น badge จะจมไปกับรูปเพจที่สีใกล้กัน */}
      <span
        className='absolute -bottom-0.5 -inline-end-0.5 rounded-full text-white flex items-center justify-center border-2 border-[var(--mui-palette-background-paper)]'
        style={{ inlineSize: badge, blockSize: badge, background: BRAND_BG[c.provider] ?? '#6b7280' }}
        aria-hidden
      >
        <Icon icon={BRAND_ICON[c.provider] ?? 'lucide:link'} width={Math.round(badge * 0.6)} />
      </span>
    </span>
  )
}

export default function OfficialChannelsBlock({
  channels,
  shopName,
}: {
  channels: OfficialChannel[]
  shopName: string
}) {
  const [pageOpen, setPageOpen] = useState(false)

  /* 🛑 ห้ามเรียก `useLockBodyScroll` ที่นี่ — `<Dialog>` ล็อก scroll ให้เองอยู่แล้ว การล็อกซ้อน
     ทำให้ MUI จำค่า `body.style.overflow` ผิดเป็น `hidden` แล้ว "คืนค่า" เป็น hidden หลังปิด
     ⇒ หน้าเลื่อนไม่ได้อีกเลยจนกว่าจะรีโหลด (prod 2026-08-15)
     เหตุผลเต็ม + ด่านกันซ้ำ: `src/__tests__/overlay-scroll-lock-single-owner.test.ts` */

  if (channels.length === 0) return null

  return (
    <>
      {/* ── แถวสรุป: ผังเดียวกับ ChannelStrip ของ prod ── */}
      <div className='flex flex-col gap-1'>
        {/* (1) บรรทัดกำกับ = **ทางเข้าหน้าเต็มเสมอ** ไม่ใช่เฉพาะตอนมีเพจเกิน 2
               🛑 critique 2026-08-13 P0: เดิมทางเข้าเดียวคือปุ่ม "ดูทั้งหมด N เพจ" ซึ่ง render
               เมื่อ `rest > 0` เท่านั้น ⇒ ร้านที่มี 1–2 เพจ (รวมร้านอ้างอิงที่มี 2 พอดี)
               **ไม่มีทางอ่านประโยคกันเพจปลอมเลย** ซึ่งเป็นประโยคที่ user สั่งให้มีตั้งแต่แรก
               เหตุผลเดิมที่เขียนไว้ว่า "คนที่สงสัยคือคนที่จะกดเข้าไปอ่าน" ใช้ได้ก็ต่อเมื่อ *มีอะไรให้กด* */}
        {/* 🛑 `<h2>` ต้องอยู่ **นอก** `<button>` — critique 2026-08-13 จับได้ว่ารอบก่อนผมวางไว้ข้างใน
            ซึ่ง (ก) เป็น HTML ที่ไม่ถูกต้อง (button รับได้เฉพาะ phrasing content) และ (ข) `role=button`
            อยู่ในกลุ่ม *children presentational* ⇒ heading ถูกถอดออกจาก accessibility tree ทั้งอัน
            ผลคือ screen reader ที่ไล่ตามหัวข้อยังข้ามบล็อกกันเพจปลอมไปเหมือนเดิม — คอมเมนต์เดิม
            เขียนว่าแก้แล้ว ทั้งที่โค้ดให้ผลตรงข้าม (คลาสเดียวกับ aria-name-requires-supporting-role.md) */}
        <div className='flex items-center gap-1.5 min-bs-[44px]'>
          <Icon
            icon='tabler:rosette-discount-check-filled'
            width={15}
            className='shrink-0'
            style={{ color: 'var(--mui-palette-success-main)' }}
          />
          {/* 🛑 หัวข้อเหลือ "เพจทางการ" คำเดียว — "· ยืนยันความเป็นเจ้าของแล้ว" ถูกถอด (user 2026-08-13)
              เพราะเช็คเขียวข้างหน้ามันพูดเรื่องเดียวกันอยู่แล้ว และคำว่า "ทางการ" ก็แปลว่ายืนยันแล้วในตัว
              ⇒ เป็นการอธิบายไอคอนด้วยคำ แล้วอธิบายคำนั้นซ้ำอีกที */}
          <Typography component='h2' variant='caption' color='text.secondary' className='min-is-0 flex-1 truncate'>
            เพจทางการ
          </Typography>
          {/* 🛑 **ทางเข้าหน้าเต็มมีปุ่มเดียว** — เดิมมีสองตัวที่ทำงานเหมือนกันเป๊ะ (ลูกศรมุมขวา +
              ปุ่ม "ดูทั้งหมด N เพจ" ใต้รายการ) user จับได้ 2026-08-13 ว่ามันคือความหมายเดียวกัน
              เก็บตัวนี้ไว้เพราะ **ต้องมีทุกกรณี**: ร้านที่มี ≤2 เพจไม่เคย render ปุ่มอีกตัวเลย
              (`rest > 0`) ⇒ ถ้าเก็บตัวนั้นแทน ร้านกลุ่มใหญ่จะเข้าไม่ถึงข้อความกันเพจปลอมอีกครั้ง
              ซึ่งเป็นบั๊กเดียวกับที่ critique P0 เพิ่งปิดไป · ป้ายเป็นข้อความไม่ใช่ลูกศรเปล่า
              เพราะลูกศรเดี่ยว ๆ ไม่บอกว่ากดแล้วไปไหน และตัวเลขที่หายไปจากปุ่มเดิมต้องมีที่อยู่ใหม่ */}
          <button
            type='button'
            onClick={() => setPageOpen(true)}
            aria-haspopup='dialog'
            aria-label={`ดูเพจทางการทั้งหมด ${channels.length} เพจ และวิธีตรวจสอบเพจปลอม`}
            className='shrink-0 flex items-center gap-0.5 min-bs-11 -mie-1 pli-1 border-0 bg-transparent cursor-pointer font-[inherit] text-[13px] font-semibold text-primary rounded focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--mui-palette-primary-main)]'
          >
            {`ทั้งหมด ${channels.length} เพจ`}
            <Icon icon='tabler:chevron-right' width={14} />
          </button>
        </div>

        <div className='flex flex-wrap items-center gap-x-5 gap-y-1'>
          {channels.slice(0, VISIBLE).map((c) => {
            const href = channelProfileUrl(c)

            const inner = (
              <>
                {/* 28px ไม่ใช่ 20 — badge แพลตฟอร์มบนรูป 20px จะเหลือ ~9px ซึ่งอ่านไม่ออก
                    และแถวนี้สูง ~40px อยู่แล้วเพราะชื่อเพจยาวได้ 2 บรรทัด จึงไม่ได้กินที่เพิ่ม */}
                <ChannelMark c={c} size={28} />
                <span className='flex flex-col leading-tight min-is-0'>
                  {/* 🛑 2 บรรทัดแทน truncate บรรทัดเดียว (critique 2026-08-13 P0)
                      ชื่อเพจจริงยาว 34 ตัวอักษร และ **หางของชื่อคือที่ที่เพจของร้านเดียวกันต่างกัน**
                      ("… สายซิ่ง" vs "… สาขาสอง") — ตัดหางทิ้งทำให้สองเพจเหลือข้อความเหมือนกันเป๊ะ
                      ซึ่งทำลายเหตุผลทั้งหมดที่บล็อกนี้มีอยู่ (ใช้เทียบกับเพจที่เจอที่อื่น) */}
                  <span
                    className='text-[13px] font-semibold max-is-[150px]'
                    style={{
                      display: '-webkit-box',
                      WebkitBoxOrient: 'vertical',
                      WebkitLineClamp: 2,
                      overflow: 'hidden',
                    }}
                  >
                    {c.name}
                  </span>
                  <span className='text-[13px] text-[var(--mui-palette-text-secondary)]'>
                    {CHANNEL_FULL_LABEL[c.provider] ?? c.provider}
                    {/* ซ่อนเมื่อไม่รู้ยอด ห้ามแสดง 0 (null = ยังไม่รู้ ไม่ใช่ไม่มีคนถูกใจ) */}
                    {typeof c.followerCount === 'number' && (
                      <>
                        {' · '}
                        <span className='font-semibold tabular-nums text-[var(--mui-palette-text-primary)]'>
                          {compactCount(c.followerCount)}
                        </span>
                        {` ${CHANNEL_FOLLOWER_LABEL[c.provider] ?? 'ผู้ติดตาม'}`}
                      </>
                    )}
                  </span>
                </span>
              </>
            )

            /* 🛑 `items-start` ไม่ใช่ `items-center` — ชื่อเพจยาวได้ 2 บรรทัด (ชื่อจริงยาวถึง 34
               ตัวอักษร) พอจัดกึ่งกลาง รูปจะลอยอยู่ระหว่างบรรทัด แถวสองแถวที่ชื่อยาวไม่เท่ากันจะ
               ไม่มีเส้นฐานร่วมกันเลย · `pbs-0.5` ดันรูปให้เสมอบรรทัดแรกของชื่อพอดี */
            const cls =
              'flex items-start gap-2 pbs-0.5 min-bs-[44px] no-underline text-[color:inherit] min-is-0'

            return href ? (
              <a
                key={`${c.provider}-${c.externalId}`}
                href={href}
                target='_blank'
                rel='noopener noreferrer'
                className={cls}
                aria-label={`เปิด ${c.name} ใน ${CHANNEL_FULL_LABEL[c.provider] ?? c.provider} (ยืนยันความเป็นเจ้าของแล้ว)`}
              >
                {inner}
              </a>
            ) : (
              <div key={`${c.provider}-${c.externalId}`} className={cls}>
                {inner}
              </div>
            )
          })}

          {/* 🛑 ไม่มีปุ่ม "ดูทั้งหมด N เพจ" ตรงนี้แล้ว — ย้ายไปรวมกับปุ่มบนหัวข้อ (user 2026-08-13)
              ความสูงยังคงที่ไม่ว่าร้านจะมีกี่เพจ เพราะแถวนี้ยัง slice ที่ VISIBLE เหมือนเดิม
              (prod ใช้ `setExpanded(true)` กางในหน้า ซึ่งทำให้ 4 เพจดันเนื้อหาตกจอ) */}
        </div>
      </div>

      {/* ── หน้าเต็ม: ทุกเพจ + กลไก + ข้อความกันเพจปลอม ── */}
      <Dialog fullScreen open={pageOpen} onClose={() => setPageOpen(false)} aria-labelledby='proto-channel-page-title'>
        <div className='flex flex-col bs-full bg-[var(--mui-palette-background-paper)]'>
          <div
            className='sticky inset-block-start-0 z-10 flex items-center gap-2 pli-3 plb-2 border-be bg-[var(--mui-palette-background-paper)]'
            style={{ paddingBlockStart: 'calc(8px + env(safe-area-inset-top))' }}
          >
            <IconButton onClick={() => setPageOpen(false)} aria-label='ย้อนกลับ' size='large' className='shrink-0'>
              <Icon icon='tabler:arrow-left' width={22} />
            </IconButton>
            <Typography id='proto-channel-page-title' component='h1' className='text-[18px] font-bold min-is-0 truncate'>
              เพจทางการ
            </Typography>
          </div>

          <div className='flex-1 overflow-y-auto overscroll-contain'>
            <div className='mli-auto max-is-[640px] pli-5 plb-5'>
              <Typography variant='body2' color='text.secondary' className='mbe-1'>
                {shopName}
              </Typography>
              <Typography className='text-[22px] font-extrabold tabular-nums leading-tight' color='text.primary'>
                {`${channels.length} เพจ`}
              </Typography>

              <Typography variant='body2' color='text.secondary' className='mbs-2 mbe-4 leading-relaxed'>
                ร้านเชื่อมเพจเหล่านี้เองด้วยการเข้าสู่ระบบกับแพลตฟอร์ม ชื่อและรูปดึงมาจากแพลตฟอร์มโดยตรง
                ไม่ใช่ข้อความที่ร้านพิมพ์เข้ามา
              </Typography>

              <ul className='m-0 p-0 list-none flex flex-col'>
                {channels.map((c) => {
                  const href = channelProfileUrl(c)

                  const inner = (
                    <>
                      <ChannelMark c={c} size={44} />
                      <span className='min-is-0 flex-1'>
                        {/* max-is-full + truncate ต้องมาคู่กัน ไม่งั้นชื่อยาวดันกล่องกว้างเกินจอ
                            (บทเรียน prod 2026-08-12: flex item มี min-width:auto เป็นค่าตั้งต้น) */}
                        <span className='block text-[15px] font-semibold truncate max-is-full'>{c.name}</span>
                        <Typography component='span' variant='caption' color='text.secondary' className='block'>
                          {CHANNEL_FULL_LABEL[c.provider] ?? c.provider}
                          {typeof c.followerCount === 'number' && (
                            <>
                              {' · '}
                              <span className='font-semibold tabular-nums text-[var(--mui-palette-text-primary)]'>
                                {compactCount(c.followerCount)}
                              </span>
                              {` ${CHANNEL_FOLLOWER_LABEL[c.provider] ?? 'ผู้ติดตาม'}`}
                            </>
                          )}
                        </Typography>
                      </span>
                      {href && (
                        <span className='text-[13px] font-semibold text-primary shrink-0 flex items-center gap-1'>
                          {/* "เปิดเพจ" ผิดคำสำหรับ LINE OA ซึ่งไม่ใช่เพจ — ใช้ชื่อช่องทางจริง
                              และลิงก์ต้องอ่านรู้เรื่องนอกบริบท (screen reader อ่านรายการลิงก์แยกจากแถว) */}
                          {`เปิดใน ${CHANNEL_FULL_LABEL[c.provider] ?? c.provider}`}
                          <Icon icon='lucide:external-link' width={13} />
                        </span>
                      )}
                    </>
                  )

                  const cls = 'flex items-center gap-3 plb-3 border-be last:border-be-0 min-is-0 min-bs-[44px]'

                  return (
                    <li key={`${c.provider}-${c.externalId}`} className='min-is-0'>
                      {href ? (
                        <a
                          href={href}
                          target='_blank'
                          rel='noopener noreferrer'
                          className={`${cls} no-underline text-[color:inherit]`}
                          aria-label={`เปิด ${c.name} ใน ${CHANNEL_FULL_LABEL[c.provider] ?? c.provider} (ยืนยันความเป็นเจ้าของแล้ว)`}
                        >
                          {inner}
                        </a>
                      ) : (
                        <div className={cls}>{inner}</div>
                      )}
                    </li>
                  )
                })}
              </ul>

              {/* ── ข้อความกันเพจปลอม: ทำให้รายการนี้กลายเป็นทะเบียนอ้างอิง ── */}
              <div
                className='mbs-5 rounded-lg pli-4 plb-3 flex items-start gap-2'
                style={{ background: 'var(--mui-palette-background-default)' }}
              >
                <Icon
                  icon='tabler:alert-triangle'
                  width={17}
                  className='shrink-0 text-[var(--mui-palette-text-secondary)]'
                  style={{ marginBlockStart: 2 }}
                />
                <Typography variant='body2' color='text.primary' className='leading-relaxed'>
                  {`หากพบเพจอื่นที่อ้างว่าเป็น "${shopName}" แต่ไม่อยู่ในรายการนี้ แปลว่ายังไม่ได้ยืนยันกับ Deep`}
                </Typography>
              </div>
            </div>
          </div>
        </div>
      </Dialog>
    </>
  )
}
