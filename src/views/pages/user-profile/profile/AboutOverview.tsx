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

/**
 * ชิ้นส่วนของแท็บ "เกี่ยวกับร้าน" — ยกจากไฟล์อ้างอิงชุดที่ 2 ที่ user ส่ง
 * (`deep_business_profile_dual_system.html` · `.about-card` / `.detail-row` / `.verify-modern`)
 *
 * 🛑 ไอคอนใช้ `@iconify` ไม่ใช่อักขระอย่าง `▤ ◇ ◷ 🛡` ที่ไฟล์อ้างอิงฝังไว้ —
 * Hard Rule 12 ห้าม emoji ใน UI และ dingbat พวกนี้เรนเดอร์ไม่เหมือนกันข้ามเครื่อง
 */
const AboutCard = ({
  title,
  subtitle,
  icon,
  children,
}: {
  title: string
  subtitle: string
  icon: string
  children: React.ReactNode
}) => (
  <Box
    sx={{
      border: '1px solid #ececf2',
      borderRadius: '20px',
      background: 'var(--mui-palette-background-paper)',
      boxShadow: '0 8px 24px rgba(29,24,62,.06)',
      padding: { xs: '16px', sm: '20px' },
    }}
  >
    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px', marginBlockEnd: '18px' }}>
      <Box sx={{ minInlineSize: 0 }}>
        <Typography component='h3' sx={{ m: 0, fontSize: '17px', lineHeight: 1.25, fontWeight: 700 }} color='text.primary'>
          {title}
        </Typography>
        <Typography sx={{ m: 0, marginBlockStart: '5px', fontSize: '11px', lineHeight: 1.55 }} color='text.secondary'>
          {subtitle}
        </Typography>
      </Box>
      <Box
        aria-hidden
        sx={{
          inlineSize: 38,
          blockSize: 38,
          borderRadius: '13px',
          display: 'grid',
          placeItems: 'center',
          background: '#f3f0ff',
          color: 'primary.main',
          flex: '0 0 auto',
        }}
      >
        <Icon icon={icon} fontSize={19} />
      </Box>
    </Box>
    {children}
  </Box>
)

/** `.detail-row` — กล่องย่อยมีไอคอน + ป้ายเล็ก + ค่า */
const DetailRow = ({ icon, label, children }: { icon: string; label: string; children: React.ReactNode }) => (
  <Box
    sx={{
      display: 'grid',
      gridTemplateColumns: '36px 1fr',
      gap: '11px',
      alignItems: 'start',
      padding: '14px',
      borderRadius: '14px',
      background: '#fafafe',
      border: '1px solid #eff0f5',
      /* ไล่สีขอบตอนชี้ — บอกว่าแถวเป็น "ก้อนข้อมูลหนึ่งชิ้น" ไม่ใช่พื้นหลังเฉย ๆ
         `transition` สั้น 150ms พอให้รู้สึกตอบสนองโดยไม่หน่วงสายตา */
      transition: 'border-color .15s ease, background .15s ease',
      '&:hover': { borderColor: '#e0dcf7', background: '#f7f5ff' },
    }}
  >
    <Box
      aria-hidden
      sx={{
        inlineSize: 32,
        blockSize: 32,
        borderRadius: '10px',
        display: 'grid',
        placeItems: 'center',
        background: '#fff',
        color: '#6a50ee',
        border: '1px solid #ebe7ff',
      }}
    >
      <Icon icon={icon} fontSize={16} />
    </Box>
    <Box sx={{ minInlineSize: 0 }}>
      <Box component='small' sx={{ display: 'block', fontSize: '10px', marginBlockEnd: '3px' }} color='text.secondary'>
        {label}
      </Box>
      <Box component='b' sx={{ display: 'block', fontSize: '12px', lineHeight: 1.55, color: '#484755' }}>
        {children}
      </Box>
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

  const verifySteps = ([1, 2, 3] as const).map((level) => ({
    level,
    done: verifiedLevels.includes(level),
    badge: resolveVerifyBadge(level)!,
  }))
  const doneCount = verifySteps.filter((v) => v.done).length
  const progress = Math.round((doneCount / verifySteps.length) * 100)

  /** แถวข้อมูล — สร้างจากค่าที่ "มีจริง" เท่านั้น ไม่ยัดแถวว่างให้ครบตามไฟล์อ้างอิง */
  const detailRows: { icon: string; label: string; value: string }[] = [
    ...(bio ? [{ icon: 'tabler-align-left', label: 'รายละเอียดร้าน', value: bio }] : []),
    ...(categoryLabel ? [{ icon: 'tabler-category-2', label: 'หมวดหมู่ร้าน', value: categoryLabel }] : []),
    { icon: 'tabler-clock-hour-3', label: 'เปิดร้านตั้งแต่', value: memberSince },
    ...(location ? [{ icon: 'tabler-map-2', label: 'พื้นที่ให้บริการ', value: location }] : []),
    ...(address ? [{ icon: 'tabler-map-pin', label: 'ที่อยู่ร้าน', value: address }] : []),
  ]

  /**
   * 🛑 การ์ดแผนที่ถูกตัดออกตามที่ user สั่งให้เหลือ 2 การ์ด — แต่ **ลิงก์เปิดแผนที่ต้องไม่หายไปด้วย**
   * มันคือความสามารถที่มีอยู่ก่อน (ร้านปักพิกัดไว้แล้วลูกค้ากดไปดูได้) การตัด UI ทิ้งแล้วพา
   * ความสามารถหายไปเงียบ ๆ คือคนละเรื่องกับการจัดหน้าใหม่ ⇒ ย้ายมาเป็นแถวข้อมูลแทน
   */
  const mapRow = mapHref ? { icon: 'tabler-map-2', label: 'ตำแหน่งร้าน', href: mapHref } : null

  return (
    /**
     * `.about-grid` ของไฟล์อ้างอิงชุดที่ 2 — `.9fr 1.1fr` (คอลัมน์ขวากว้างกว่าเพราะมีแถบความคืบหน้า
     * กับรายการ 3 ระดับ) ยุบเหลือคอลัมน์เดียวที่ ≤900px
     *
     * 🛑 ไฟล์อ้างอิงมีแถบ `.about-intro` (ชื่อร้าน + คำอธิบาย + ชิปสรุป) อยู่เหนือกริดด้วย
     * แต่ user สั่งชัดว่า **"เอา 2 card นี้นะ"** ⇒ ไม่ใส่ · และของพวกนั้นซ้ำกับปกด้านบนอยู่แล้ว
     */
    <Box
      sx={{
        display: 'grid',
        gridTemplateColumns: { xs: '1fr', md: '.9fr 1.1fr' },
        gap: '16px',
        /* 🛑 เคยตั้ง `stretch` เพื่อให้สูงเท่ากัน แล้วกลายเป็นปัญหาที่แย่กว่าเดิม — ใบซ้ายมีแถวน้อย
           กว่า พอถูกยืดจึงได้ "แถวอัดกันอยู่ข้างบน + ช่องว่างขาวก้อนใหญ่ข้างล่าง" (user ทัก
           2026-08-21 ว่าช่องในการ์ดติดกันหมด) · การ์ดสูงไม่เท่ากันเป็นเรื่องปกติของกริดที่เนื้อหา
           ไม่เท่ากัน — ที่ต้องแก้จริงคือ "ระยะหายใจระหว่างแถว" ไม่ใช่ความสูงของกล่อง */
        alignItems: 'start',
      }}
    >
      <AboutCard title='รายละเอียดร้าน' subtitle='ข้อมูลพื้นฐานที่ร้านใช้แสดงกับลูกค้า' icon='tabler-list-details'>
        {/* `alignContent: start` + gap คงที่ — แถวไม่ยืดตัวเองให้สูงผิดสัดส่วนเมื่อการ์ดถูกยืด
            (ถ้าปล่อยให้ยืด แถว "เปิดร้านตั้งแต่" ที่มีข้อความบรรทัดเดียวจะสูงเท่าแถวคำอธิบายยาว ๆ
            ซึ่งอ่านเป็นช่องว่างในกล่อง ไม่ใช่การจัดวาง) */}
        {/* gap 12 ไม่ใช่ 10 ของไฟล์อ้างอิง — ไฟล์นั้นมี 5 แถว ระยะ 10 จึงพอดี แต่ของจริงร้านนี้
            มี 3 แถวในกล่องที่กว้างกว่า ทำให้ 10 อ่านเป็น "อัดกัน" (user ทัก 2026-08-21)
            ตัวเลขในไฟล์อ้างอิงคาลิเบรตกับข้อมูลของร้านตัวอย่าง ไม่ใช่กฎตายตัว */}
        <Box sx={{ display: 'grid', gap: '12px' }}>
          {detailRows.map((r) => (
            <DetailRow key={r.label} icon={r.icon} label={r.label}>
              {r.value}
            </DetailRow>
          ))}
          {mapRow && (
            <DetailRow icon={mapRow.icon} label={mapRow.label}>
              <Box
                component='a'
                href={mapRow.href}
                target='_blank'
                rel='noopener noreferrer'
                sx={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '5px',
                  minBlockSize: 24,
                  color: 'primary.main',
                  fontWeight: 700,
                  textDecoration: 'none',
                }}
              >
                เปิดแผนที่
                <Icon icon='tabler-external-link' fontSize={13} aria-hidden />
              </Box>
            </DetailRow>
          )}
        </Box>
      </AboutCard>

      <AboutCard
        title='การยืนยันตัวตน'
        subtitle='ยิ่งยืนยันครบมาก ลูกค้ายิ่งมั่นใจในการติดต่อและใช้บริการ'
        icon='tabler-shield-check'
      >
        {/* `.verify-summary` — แถบความคืบหน้า + พิลบอกจำนวนระดับ */}
        <Box
          sx={{
            padding: '14px',
            borderRadius: '16px',
            background: 'linear-gradient(135deg,#f7f4ff,#fffaf2)',
            border: '1px solid #ece7ff',
            marginBlockEnd: '16px',
          }}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', marginBlockEnd: '10px' }}>
            <Box component='b' sx={{ fontSize: '14px' }} color='text.primary'>
              ความคืบหน้าการยืนยัน
            </Box>
            <Box
              sx={{
                padding: '6px 9px',
                borderRadius: '999px',
                background: '#fff',
                color: 'primary.main',
                border: '1px solid #e4ddff',
                fontSize: '11px',
                fontWeight: 900,
                whiteSpace: 'nowrap',
              }}
              className='tabular-nums'
            >
              {`${doneCount}/${verifySteps.length} ระดับ`}
            </Box>
          </Box>
          {/* แถบใช้ `role="img"` + ชื่อ ไม่ใช่ progressbar — มันคือ "สรุปสถานะ" ไม่ใช่งานที่กำลังเดิน */}
          <Box
            role='img'
            aria-label={`ยืนยันแล้ว ${doneCount} จาก ${verifySteps.length} ระดับ`}
            sx={{ blockSize: 8, borderRadius: '999px', background: '#ececf3', overflow: 'hidden' }}
          >
            <Box
              sx={{
                blockSize: '100%',
                inlineSize: `${progress}%`,
                borderRadius: '999px',
                background: 'linear-gradient(90deg,#6d52ff,#9a86ff)',
              }}
            />
          </Box>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: '12px', marginBlockStart: '7px', fontSize: '10px' }} color='text.secondary'>
            <span>เริ่มต้น</span>
            <span>ยืนยันครบทุกระดับ</span>
          </Box>
        </Box>

        {/* `.verify-modern-list` — 3 ระดับเป็นกล่องแยกใบ ใบที่ผ่านย้อมเขียวอ่อน
            🛑 เช็คทีละระดับด้วย `verifiedLevels.includes()` ห้ามใช้ `maxLevel >= level`
            เพราะฐานข้อมูลไม่มี constraint บังคับว่าต้องผ่านตามลำดับ (approve แยกรายคำขอ)
            🛑 render ครบ 3 ใบเสมอ — ที่นี่คือ checklist หลักฐาน คนที่ไม่เห็นแถวจะแยกไม่ออกว่า
            "ร้านนี้ยังไม่ยืนยัน" หรือ "หน้านี้ไม่แสดงเรื่องนี้" */}
        <Box sx={{ display: 'grid', gap: '10px' }}>
          {verifySteps.map(({ level, done, badge }) => (
            <Box
              key={level}
              sx={{
                display: 'grid',
                gridTemplateColumns: { xs: '32px 1fr', sm: '34px 1fr auto' },
                gap: '10px',
                alignItems: 'center',
                padding: '14px',
                borderRadius: '14px',
                border: `1px solid ${done ? '#dcefe8' : '#eff0f5'}`,
                background: done ? 'linear-gradient(135deg,#f6fffb,#fff)' : '#fff',
              }}
            >
              <Box
                aria-hidden
                sx={{
                  inlineSize: 32,
                  blockSize: 32,
                  borderRadius: '50%',
                  display: 'grid',
                  placeItems: 'center',
                  fontSize: '12px',
                  fontWeight: 900,
                  ...(done ? { background: '#e4f8ef', color: '#15966c' } : { background: '#f0f1f5', color: '#9694a0' }),
                }}
              >
                {done ? <Icon icon='tabler-check' fontSize={15} /> : level}
              </Box>
              <Box sx={{ minInlineSize: 0 }}>
                <Box component='b' sx={{ display: 'block', fontSize: '12px', lineHeight: 1.4 }} color='text.primary'>
                  {`ระดับ ${level} · ${VERIFY_LEVEL_TITLES[level]}`}
                </Box>
                <Box component='small' sx={{ display: 'block', marginBlockStart: '3px', fontSize: '10px', lineHeight: 1.45 }} color='text.secondary'>
                  {done ? badge.label : VERIFY_LEVEL_NOT_YET_LABEL}
                </Box>
              </Box>
              <Box
                sx={{
                  fontSize: '10px',
                  fontWeight: 900,
                  whiteSpace: 'nowrap',
                  color: done ? '#15966c' : '#a2a0aa',
                  gridColumn: { xs: 2, sm: 'auto' },
                }}
              >
                {done ? 'ยืนยันแล้ว' : 'ยังไม่ยืนยัน'}
              </Box>
            </Box>
          ))}
        </Box>

        {/* `.about-note` — บรรทัดที่กันการตีความเกินจริง ซึ่งสำคัญกับหน้าที่คนใช้ตัดสินใจโอนเงิน */}
        <Box
          sx={{
            /* `.about-note` — ค่าจากไฟล์อ้างอิงตรง ๆ (เดิมผมใช้ `action-hover` ซึ่งเป็นเทากลาง ๆ
               ทำให้กล่องนี้ดูเป็น "พื้นที่ปิดใช้งาน" แทนที่จะเป็นหมายเหตุที่กลมกลืนกับการ์ด) */
            display: 'flex',
            gap: '10px',
            alignItems: 'flex-start',
            marginBlockStart: '14px',
            padding: '12px 14px',
            borderRadius: '14px',
            background: '#fafafe',
            border: '1px solid #eff0f5',
            color: '#767482',
            fontSize: '11px',
            lineHeight: 1.6,
          }}
        >
          {/* ไอคอนใช้สีม่วงตาม `.about-note span:first-child` — ทำให้บรรทัดนี้อ่านเป็น "ข้อควรรู้"
              ไม่ใช่ "ข้อความจาง ๆ ที่ข้ามได้" ซึ่งสำคัญเพราะมันคือบรรทัดกันการตีความเกินจริง */}
          <Icon icon='tabler-info-circle' fontSize={16} style={{ flexShrink: 0, marginBlockStart: 1, color: 'var(--mui-palette-primary-main)' }} aria-hidden />
          <span>
            สถานะการยืนยันช่วยบอกระดับข้อมูลที่ร้านยืนยันกับ Deep เท่านั้น ไม่ได้แทนการรับประกันสินค้า
            หรือคุณภาพบริการของร้าน
          </span>
        </Box>
      </AboutCard>
    </Box>
  )

}

export default AboutOverview
