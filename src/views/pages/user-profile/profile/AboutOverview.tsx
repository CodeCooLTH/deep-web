'use client'

// MUI Imports
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'

// Icon Imports
import { Icon } from '@iconify/react'

import {
  resolveVerifyBadge,
  VERIFY_BADGE_PALETTE,
  VERIFY_LEVEL_TITLES,
  VERIFY_LEVEL_NOT_YET_LABEL,
} from '@/lib/verify-badge'

// Base: theme/vuexy/typescript-version/full-version/src/views/pages/user-profile/profile/AboutOverview.tsx
// (icon-row pattern) — ตัด Card/CardHeader ออกเพราะเป็นการ์ดใบเดียวในแท็บ ห่อแล้ว padding ไม่ตรง
// กับแท็บอื่น (user รายงาน 2026-07-30) และตัด eyebrow ตัวพิมพ์ใหญ่ของธีมทิ้ง (ไทยไม่มี case)

export type AboutData = {
  bio?: string | null
  location?: string | null
  /** "มิ.ย. 2568" — formatMonthYearTH() ผลลัพธ์ */
  memberSince: string
  chatResponseRate?: number | null
  chatMedianResponseSec?: number | null
  chatResponseSampleSize?: number | null
  /** ── เพิ่ม 2026-08-11 (user: "เกี่ยวกับร้าน อยากให้เพิ่ม stat มากขึ้น") ── */
  /** ป้ายหมวดหมู่ที่แปลแล้ว (shopCategoryLabel) ไม่ใช่คีย์ดิบอย่าง `automotive` */
  categoryLabel?: string | null
  /** ที่อยู่ร้านที่ผู้ขายกรอกเอง (`Shop.address`) */
  address?: string | null
  /** พิกัดที่ผู้ขายปักไว้ — ต้องมีครบทั้งคู่ถึงจะเปิดแผนที่ได้ */
  latitude?: number | null
  longitude?: number | null
  /** ระดับยืนยันตัวตนสูงสุดที่อนุมัติแล้ว (0 = ยังไม่ยืนยัน) */
  maxVerifyLevel?: number
  /**
   * ระดับที่อนุมัติแล้วทั้งหมด — **ไม่รับประกันว่าต่อเนื่อง** (DB ไม่มี constraint บังคับลำดับ)
   * ต้องใช้ตัวนี้เช็คทีละระดับ ห้าม derive จาก `maxVerifyLevel` ด้วยการเทียบ `>=`
   */
  verifiedLevels?: number[]
}

/** แถวข้อมูลหนึ่งบรรทัด — ไอคอน + ป้ายกำกับ + ค่า */
const Row = ({ icon, label, children }: { icon: string; label: string; children: React.ReactNode }) => (
  <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
    <Icon icon={icon} fontSize={17} style={{ flexShrink: 0, marginBlockStart: 2 }} />
    <Box sx={{ minInlineSize: 0 }}>
      {/* ป้ายกำกับต้องมี — ค่าอย่าง "ส.ค. 2569" หรือที่อยู่ลอย ๆ ไม่บอกว่ามันคืออะไร
          ต่างจากหัวโปรไฟล์ที่บริบทรอบข้างช่วยตีความให้ */}
      <Typography variant='caption' color='text.disabled' sx={{ display: 'block', lineHeight: 1.4 }}>
        {label}
      </Typography>
      <Typography variant='body2' color='text.primary' sx={{ lineHeight: 1.5 }}>
        {children}
      </Typography>
    </Box>
  </Box>
)

const AboutOverview = ({ data }: { data: AboutData }) => {
  const { bio, location, memberSince, categoryLabel, address, latitude, longitude, maxVerifyLevel } = data

  /* fallback จาก maxVerifyLevel เมื่อผู้เรียกยังไม่ส่ง verifiedLevels มา — ยอมรับความไม่แม่นตรงนี้
     ได้เพราะเป็นทางสำรอง ไม่ใช่ทางหลัก (ผู้เรียกจริงทั้ง 2 หน้าส่งค่ามาครบแล้ว) */
  const verifiedLevels =
    data.verifiedLevels ?? Array.from({ length: maxVerifyLevel ?? 0 }, (_, i) => i + 1)

  /* 🛑 ต้องมีครบทั้ง lat และ lng ถึงจะเปิดแผนที่ได้ — เช็คแค่ตัวเดียวแล้วส่งอีกตัวเป็น undefined
     จะได้ลิงก์ที่พาไปพิกัดผิดบนโลก ไม่ใช่ลิงก์ที่พัง (ผิดเงียบ อันตรายกว่าพังเสียงดัง) */
  const hasPin = typeof latitude === 'number' && typeof longitude === 'number'

  /* เปิดแอปแผนที่แทนการฝัง iframe ของ Google:
     - ฝัง iframe ต้องมี API key และโหลดสคริปต์ของ Google บนหน้าที่ผู้ซื้อเปิดครั้งแรก
       ซึ่งเป็นจุดสัมผัสแรกที่ต้องเบาที่สุด
     - ลิงก์ออกเปิดในแอปแผนที่ของเครื่องผู้ใช้เอง ซึ่งนำทางต่อได้จริง ต่างจาก iframe ที่ดูได้อย่างเดียว */
  const mapHref = hasPin
    ? `https://www.google.com/maps/search/?api=1&query=${latitude},${longitude}`
    : null

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column' }}>
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        {/* คำอธิบายร้านอยู่ในรูปแบบเดียวกับแถวอื่น (ไอคอน + ป้ายกำกับ) ตามที่ user สั่ง 2026-08-11
            — เดิมเป็นย่อหน้าลอยอยู่เหนือรายการ ซึ่งอ่านเป็นคนละชนิดกับข้อมูลที่เหลือทั้งที่อยู่ในแท็บเดียวกัน

            🛑 ตัวหนังสือยังเป็น 15px ไม่ใช่ 14px เหมือนแถวอื่น — นี่คือประโยคเดียวในแท็บที่ร้าน
            เขียนเอง ที่เหลือเป็นข้อมูลที่ระบบดึงมา ลดขนาดให้เท่ากันหมดจะกลบเสียงของร้าน */}
        {bio && (
          <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
            <Icon icon='tabler-file-description' fontSize={17} style={{ flexShrink: 0, marginBlockStart: 2 }} />
            <Box sx={{ minInlineSize: 0 }}>
              <Typography variant='caption' color='text.disabled' sx={{ display: 'block', lineHeight: 1.4 }}>
                รายละเอียดร้าน
              </Typography>
              <Typography component='p' sx={{ m: 0, fontSize: '15px', color: 'text.primary', lineHeight: 1.55 }}>
                {bio}
              </Typography>
            </Box>
          </Box>
        )}

        {categoryLabel && (
          <Row icon='tabler-category' label='หมวดหมู่ร้าน'>
            {categoryLabel}
          </Row>
        )}

        <Row icon='tabler-calendar' label='เปิดร้านตั้งแต่'>
          {memberSince}
        </Row>

        {/* ── ตารางยืนยันตัวตน 3 ระดับ (user 2026-08-11: "อยากได้ตารางครบ 3 ระดับ แบบหน้า /verification") ──

            เดิมเป็นแถวเดียวบอกแค่ระดับสูงสุด ⇒ ผู้ซื้อรู้ว่า "ผ่านถึงระดับ 1" แต่ไม่รู้ว่ายังเหลืออะไร
            และไม่รู้ว่าระบบมีทั้งหมดกี่ระดับ — ตัวเลขลอย ๆ ที่ไม่มีสเกลกำกับตีความไม่ได้

            🛑 ต้องเช็คทีละระดับด้วย `verifiedLevels.includes(level)` ห้ามใช้ `maxLevel >= level`
            เพราะ **ฐานข้อมูลไม่มี constraint บังคับว่าต้องผ่านตามลำดับ** (VerificationRecord
            approve แยกรายคำขอ) สิ่งที่กัน "ผ่าน L3 แต่ไม่ผ่าน L2" คือหน้าจอฝั่งผู้ขายเท่านั้น
            ไม่ใช่กติการะดับข้อมูล — ถ้าอนุมานว่าต่อเนื่อง แถว L2 จะขึ้น "ผ่าน" ทั้งที่ไม่จริง

            🛑 render ครบ 3 แถวเสมอแม้ยังไม่ผ่านอะไรเลย — ต่างจากป้ายบนหัวโปรไฟล์ที่ซ่อนตอน 0
            เพราะที่นี่คือ checklist หลักฐาน ไม่ใช่ตราประดับ · คนที่ไม่เห็นแถวจะแยกไม่ออกว่า
            "ร้านนี้ยังไม่ยืนยัน" หรือ "หน้านี้ไม่แสดงเรื่องนี้" ซึ่งคนละความหมายกันมาก

            สถานะมี 2 แบบเท่านั้น (ผ่าน / ยังไม่ยืนยัน) — ไม่มี "กำลังรอตรวจ" เพราะ query
            ของหน้าสาธารณะดึงเฉพาะ APPROVED และ user เคาะแล้วว่าไม่เปิดเผยว่าร้านเคยยื่นแล้วไม่ผ่าน */}
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <Typography variant='caption' color='text.disabled' sx={{ display: 'block', lineHeight: 1.4 }}>
            การยืนยันตัวตน
          </Typography>
          {([1, 2, 3] as const).map((level) => {
            const passed = verifiedLevels.includes(level)
            const levelBadge = resolveVerifyBadge(level)!

            return (
              <Box key={level} sx={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
                {/* 🛑 รูปทรงต่างกัน ไม่ใช่แค่สี (WCAG 1.4.1) — วงกลมทึบมีเครื่องหมายถูก vs วงกลมเส้นประ
                    คนตาบอดสีต้องแยกออกโดยไม่ต้องพึ่งสีเลย */}
                <Icon
                  icon={passed ? 'tabler-circle-check-filled' : 'tabler-circle-dashed'}
                  fontSize={17}
                  style={{
                    flexShrink: 0,
                    marginBlockStart: 2,
                    color: passed ? VERIFY_BADGE_PALETTE[levelBadge.tone].fg : undefined,
                  }}
                />
                <Box sx={{ minInlineSize: 0 }}>
                  <Typography variant='caption' color='text.disabled' sx={{ display: 'block', lineHeight: 1.4 }}>
                    {`ระดับ ${level} · ${VERIFY_LEVEL_TITLES[level]}`}
                  </Typography>
                  <Typography
                    variant='body2'
                    sx={{
                      lineHeight: 1.5,
                      color: passed ? VERIFY_BADGE_PALETTE[levelBadge.tone].fg : 'text.disabled',
                      fontWeight: passed ? 600 : 400,
                    }}
                  >
                    {passed ? levelBadge.label : VERIFY_LEVEL_NOT_YET_LABEL}
                  </Typography>
                </Box>
              </Box>
            )
          })}
        </Box>

        {address && (
          <Row icon='tabler-map-pin' label='ที่อยู่ร้าน'>
            {address}
            {mapHref && (
              <>
                {' '}
                <Box
                  component='a'
                  href={mapHref}
                  target='_blank'
                  rel='noopener noreferrer'
                  sx={{ color: 'primary.main', fontWeight: 600, textDecoration: 'none', whiteSpace: 'nowrap' }}
                >
                  เปิดแผนที่
                </Box>
              </>
            )}
          </Row>
        )}

        {/* ที่อยู่ไม่มีแต่ปักพิกัดไว้ — ยังเปิดแผนที่ได้ ไม่ต้องรอให้กรอกที่อยู่ก่อน */}
        {!address && mapHref && (
          <Row icon='tabler-map-pin' label='ตำแหน่งร้าน'>
            <Box
              component='a'
              href={mapHref}
              target='_blank'
              rel='noopener noreferrer'
              sx={{ color: 'primary.main', fontWeight: 600, textDecoration: 'none' }}
            >
              เปิดแผนที่
            </Box>
          </Row>
        )}

        {location && !address && (
          <Row icon='tabler-building-community' label='พื้นที่ให้บริการ'>
            {location}
          </Row>
        )}
      </Box>
    </Box>
  )
}

export default AboutOverview
