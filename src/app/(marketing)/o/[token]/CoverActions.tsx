'use client'

/**
 * CoverActions — ปุ่มมุมขวาบนของปกหน้าออเดอร์ `/o/[token]` (ม็อกอัพ v5 `.cover-actions`)
 *
 * ม็อกอัพวางไว้ 2 ปุ่ม: **ช่วยเหลือ** และ **แชร์คำสั่งซื้อ** — ทั้งคู่เป็นของใหม่ที่หน้านี้ไม่เคยมี
 *
 * ทำไมอยู่บนปก ไม่ใช่ท้ายหน้า: ปกคือพื้นที่ตกแต่งล้วน (ดูกฎที่ `ShopCover`) การเอาปุ่มที่ต้อง
 * "หาให้เจอตอนมีปัญหา" ไปวางบนพื้นที่ว่างนั้น คือการได้ทางออกฉุกเฉินมาฟรีโดยไม่กิน px ของหลักฐาน
 * — ลิงก์ท้ายหน้าที่เคยเป็นทางเดียวอยู่ห่างลงไปทั้งหน้าจอ
 *
 * 🛑 **แชร์ = ส่งต่อ "กุญแจ" ของออเดอร์** ลิงก์นี้คือตัวเข้าถึงเอง ไม่ได้มีรหัสผ่านอีกชั้น
 * รับความเสี่ยงได้เพราะ (1) เจ้าของออเดอร์คัดลอก URL จากแถบที่อยู่ได้อยู่แล้วบนเบราว์เซอร์ปกติ
 * ปุ่มนี้แค่ทำให้ทำได้ **ใน WebView ของแอปซึ่งไม่มีแถบที่อยู่** (2) คนที่เปิดลิงก์โดยไม่ได้
 * ล็อกอินตกไปจอ guest ซึ่งปิดเบอร์และที่อยู่ไว้แล้ว ⇒ สิ่งที่ส่งต่อคือ "สถานะออเดอร์"
 * ไม่ใช่ข้อมูลติดต่อของผู้ซื้อ
 *
 * Base: theme/vuexy/typescript-version/full-version/src/@core/components/mui/Avatar (โทนพิลบนภาพ)
 *   + src/app/(marketing)/o/[token]/BrandHomeLink.tsx (พิลบนปกอีกฝั่ง — ต้องเป็นชุดเดียวกัน)
 */
import { useState } from 'react'

import Box from '@mui/material/Box'
import Snackbar from '@mui/material/Snackbar'
import Tooltip from '@mui/material/Tooltip'

import { Icon } from '@iconify/react'

import { HELP_CENTER_HREF } from '@/lib/public-links'

import CoverPill from './CoverPill'

/** คำบนปุ่มหายที่มือถือตามม็อกอัพ (`.cover-action span{display:none}`) — เหลือไอคอนล้วน
 *  ป้ายยังอยู่ครบใน `aria-label` + tooltip ⇒ เสียเฉพาะ "พื้นที่" ไม่ได้เสีย "ความหมาย" */
const labelSx = { display: 'none', '@media (min-width:600px)': { display: 'inline' } } as const

export default function CoverActions({ orderNo }: { orderNo: string }) {
  const [toast, setToast] = useState<string | null>(null)

  const share = async () => {
    const url = window.location.href
    /* Web Share API มีเฉพาะบนมือถือ/บางเบราว์เซอร์ — ไม่มีก็ตกไปคัดลอกลิงก์
       ผู้ใช้กดยกเลิกแผงแชร์ = `AbortError` ซึ่งไม่ใช่ความล้มเหลว ห้ามขึ้นข้อความอะไร */
    if (navigator.share) {
      try {
        await navigator.share({ title: 'Deep', text: orderNo, url })

        return
      } catch {
        return
      }
    }
    try {
      await navigator.clipboard.writeText(url)
      setToast('คัดลอกลิงก์คำสั่งซื้อแล้ว')
    } catch {
      /* clipboard ถูกปฏิเสธ (iOS ที่ไม่ได้มาจากการแตะโดยตรง / permission) — ต้องบอก
         ไม่ใช่เงียบ ไม่งั้นผู้ใช้กดแล้วไม่มีอะไรเกิดขึ้นแล้วไม่รู้ว่าสำเร็จหรือล้ม */
      setToast('คัดลอกลิงก์ไม่สำเร็จ กรุณาลองใหม่อีกครั้ง')
    }
  }

  return (
    <>
      <Box
        /* 🛑 ไม่วางตัวเองแบบ absolute อีกต่อไป — `ShopCover` มีแถว `.cover-tools` ที่จัด
           ซ้าย/ขวาให้พร้อมกัน ถ้าตัวนี้ยังยึดขอบเอง ขอบบนจะไม่ตรงกับตราแบรนด์ฝั่งซ้าย */
        sx={{ display: 'flex', alignItems: 'center', gap: 1 }}
      >
        <Tooltip title='ศูนย์ช่วยเหลือ' enterTouchDelay={0}>
          <CoverPill
            href={HELP_CENTER_HREF}
            external
            target='_blank'
            rel='noopener noreferrer'
            aria-label='เปิดศูนย์ช่วยเหลือ'
          >
            <Icon icon='tabler-help-circle' fontSize={16} aria-hidden='true' />
            <Box component='span' sx={labelSx}>
              ช่วยเหลือ
            </Box>
          </CoverPill>
        </Tooltip>

        <Tooltip title='แชร์ลิงก์คำสั่งซื้อนี้' enterTouchDelay={0}>
          <CoverPill onClick={share} aria-label='แชร์คำสั่งซื้อ'>
            <Icon icon='tabler-share-2' fontSize={16} aria-hidden='true' />
            <Box component='span' sx={labelSx}>
              แชร์คำสั่งซื้อ
            </Box>
          </CoverPill>
        </Tooltip>
      </Box>

      <Snackbar
        open={toast != null}
        autoHideDuration={2600}
        onClose={() => setToast(null)}
        message={toast}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      />
    </>
  )
}
