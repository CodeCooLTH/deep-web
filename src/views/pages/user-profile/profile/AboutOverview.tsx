'use client'

// MUI Imports
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'

// Icon Imports
import { Icon } from '@iconify/react'

// Base: theme/vuexy/typescript-version/full-version/src/views/pages/user-profile/profile/AboutOverview.tsx
// (Card+CardContent icon-row pattern) — revive (Desktop layout redesign, IG-style + trust data)
// เดิม type AboutOverviewData ({about,overview,shopInfo}) ไม่ตรง data shape จริงของหน้านี้เลย — ProfileTabData
// ไม่มี field about/overview/shopInfo จึงเขียน type ใหม่ AboutData รับ bio/location/memberSince/chatResponse* ตรง ๆ
// ตัด "uppercase" eyebrow ของ theme เดิมทิ้ง (ขัด Hard Rule impeccable — ห้าม textTransform:uppercase, ไทยไม่มี case)
// ใช้ CardHeader title แทน (sync กับ VerificationBadges.tsx/TrustScoreCard.tsx ที่อยู่ใน TrustDetailSection เดียวกัน)
// เนื้อหา + formatResponseTime ย้ายมาจาก ProfileLeftContent เดิมใน profile/index.tsx (ยุบทิ้งแล้ว)

export type AboutData = {
  bio?: string | null
  location?: string | null
  /** "มิ.ย. 2568" — formatMonthYearTH() ผลลัพธ์ */
  memberSince: string
  chatResponseRate?: number | null
  chatMedianResponseSec?: number | null
  chatResponseSampleSize?: number | null
}

const AboutOverview = ({ data }: { data: AboutData }) => {
  const { bio, location, memberSince } = data

  // 🛑 อัตราการตอบแชทเคยอยู่ตรงนี้ ย้ายขึ้นไปบนโปรไฟล์แล้ว (user 2026-08-10 "ต้องอยู่บน Profile
  // ห้ามเอาไปไว้ใน About") — ProfileHero เป็นเจ้าของการแสดงผลนี้ที่เดียว ห้ามเอากลับมาแสดงซ้ำ
  // ที่นี่ ไม่งั้นตัวเลขเดียวกันจะโผล่ 2 ที่บนหน้าเดียว ซึ่งเป็นคลาสของบั๊กที่เคยทำให้จอเดียว
  // ขึ้น "ยังไม่ตอบ 7" กับ "8" พร้อมกัน (docs/conventions/sibling-surface-parity.md)
  // field chatResponse* ยังอยู่ใน type เพราะ ProfileTabData ส่งชุดเดียวกันลงมาทั้งก้อน

  // ถอด Card/CardHeader/CardContent ออก (user รายงาน padding ไม่เท่ากันระหว่างแท็บ 2026-07-30)
  // นี่เป็นการ์ดใบเดียวในหน้า พอห่อการ์ด ตัวหนังสือถูกดันเข้าไป 44px จาก padding ของ CardContent
  // ขณะที่แท็บอื่นอยู่ที่ 20px สลับแท็บแล้วบรรทัดกระโดด
  // หัวข้อ "เกี่ยวกับร้าน" ตัดออกด้วย — ชื่อแท็บบอกอยู่แล้วว่าอยู่ส่วนไหน พูดซ้ำสองที่ในจอเดียว
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
      {bio && (
        <Typography component='p' sx={{ m: 0, fontSize: '15px', color: 'text.primary', lineHeight: 1.5 }}>
          {bio}
        </Typography>
      )}

      <Box sx={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '13px', color: 'text.secondary' }}>
        {location && (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Icon icon='tabler-map-pin' fontSize={16} />
            {location}
          </Box>
        )}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {/* 🛑 "เปิดร้านตั้งแต่" ไม่ใช่ "เข้าร่วม" — ค่านี้คือ `memberSince` **ตัวเดียวกันเป๊ะ**
              กับที่บรรทัดเมตาใต้ชื่อร้านใน ProfileHero แสดงอยู่ ใช้คนละคำบนหน้าเดียวกันทำให้อ่าน
              เหมือนเป็นข้อมูลคนละตัว และ "เข้าร่วม" ยังฟังเหมือนสมัครสมาชิก ไม่ใช่วันเปิดร้าน */}
          <Icon icon='tabler-calendar' fontSize={16} />
          เปิดร้านตั้งแต่ {memberSince}
        </Box>
      </Box>
    </Box>
  )
}

export default AboutOverview
