/**
 * PickupInfoCard — บล็อก "รับที่ร้าน" บนหน้าออเดอร์ของผู้ซื้อ (feature 00062)
 *
 * 🛑 **เกิดจากช่องโหว่ที่เจอตอนเปิดหน้าจริง 2026-08-29 ไม่ใช่จากสเปก** — UX-Design-Spec มี
 * §A1–A6 (ฝั่งร้าน) และ §B7–B8 (บัญชีรับเงิน/QR) แต่ **ไม่มีหัวข้อไหนบอกผู้ซื้อว่าออเดอร์ใบนี้
 * เป็นนัดรับ หรือต้องไปรับที่ไหน** ⇒ ออเดอร์นัดรับที่ ship ไปแล้วจะขึ้นจอผู้ซื้อเหมือนออเดอร์
 * ธรรมดาทุกประการ (ไม่มีที่อยู่จัดส่ง ไม่มีเลขพัสดุ ไม่มีอะไรอธิบาย) — ซึ่งกินเคสหลักที่ฟีเจอร์นี้
 * ถูกสร้างมาเพื่อแก้พอดี (docs/conventions/known-limitation-vs-unfinished.md: กินเคสหลัก =
 * ฟีเจอร์ยังไม่เสร็จ ไม่ใช่หนี้)
 *
 * ใช้ร่วมทั้งจอ guest (`GuestOrderView.tsx`) และจอหลังล็อกอิน (`OrderDetailMobile.tsx`) —
 * เหตุผลเดียวกับ `PayoutAccountCard` (sibling-surface-parity.md)
 *
 * 🛑 **ห้ามใช้สีเขียว** กับสถานะ "ร้านแจ้งว่ามอบของแล้ว" — เป็นคำบอกเล่าฝั่งเดียวของร้าน
 * ยังไม่มีใครยืนยัน (Verified-Means-Green) ผู้ซื้อยังทักท้วงได้จนกว่าจะครบกำหนด
 *
 * Base: `./PayoutAccountCard.tsx` (โครง `<Card>` + หัวข้อ + แถวข้อมูล ของจอผู้ซื้อ Vuexy/MUI)
 */

import Box from '@mui/material/Box'
import Card from '@mui/material/Card'
import Typography from '@mui/material/Typography'

import { Icon } from '@iconify/react'

import { formatDateTimeTH } from '@/lib/format-date'
import { computeAutoConfirmDeadline } from '@/lib/order-pickup'

type Props = {
  /** ชื่อร้าน — ใช้เป็นหัวจุดนัดรับเสมอ (มีทุกใบ ต่างจากที่อยู่ที่ร้านอาจไม่ได้กรอก) */
  shopName: string
  /** ที่อยู่ร้านตามที่ร้านกรอกใน /shop — `null` ได้ (ไม่บังคับกรอก) */
  shopAddress: string | null
  /** เวลาที่ร้านกด "มอบสินค้าแล้ว" — `null` = ยังไม่ได้มอบ */
  handedOverAt: string | null
  /** ปิดงานไปแล้ว/ยกเลิกแล้ว → ไม่ต้องชวนให้ไปรับของอีก */
  status: string
}

export default function PickupInfoCard({ shopName, shopAddress, handedOverAt, status }: Props) {
  const isClosed = status === 'CONFIRMED' || status === 'CANCELLED'
  const autoConfirmAt = handedOverAt ? computeAutoConfirmDeadline(new Date(handedOverAt)) : null

  return (
    <Card sx={{ mb: 2 }}>
      <Box sx={{ px: 2.5, py: 2 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
          <Icon icon='tabler-building-store' fontSize={18} />
          <Typography sx={{ fontWeight: 700 }}>รับที่ร้าน</Typography>
        </Box>

        <Typography variant='body2' sx={{ fontWeight: 500 }}>
          {shopName}
        </Typography>
        {shopAddress ? (
          <Typography variant='body2' color='text.secondary' sx={{ mt: 0.25 }}>
            {shopAddress}
          </Typography>
        ) : (
          /* ร้านไม่ได้กรอกที่อยู่ (ไม่บังคับใน /shop) — ห้ามปล่อยว่างเฉย ๆ ไม่งั้นผู้ซื้ออ่านว่า
             "ระบบพัง" แทนที่จะรู้ว่าต้องถามร้าน (แพตเทิร์นเดียวกับ fallback ของ §B7) */
          <Typography variant='body2' color='text.secondary' sx={{ mt: 0.25 }}>
            ร้านยังไม่ได้แจ้งที่อยู่ — ทักแชทกับร้านเพื่อนัดจุดรับได้เลย
          </Typography>
        )}

        {!isClosed && (
          <Typography variant='caption' color='text.secondary' sx={{ display: 'block', mt: 1.5 }}>
            {handedOverAt && autoConfirmAt
              ? /* 🛑 ต้องบอกทั้ง "ร้านแจ้งว่าอะไร" และ "แล้วจะเกิดอะไรขึ้นถ้าเราไม่ทำอะไร" —
                   บอกครึ่งเดียวคือปล่อยให้ระบบปิดงานเงียบ ๆ โดยผู้ซื้อไม่รู้ว่ามีนาฬิกาเดินอยู่ */
                `ร้านแจ้งว่ามอบสินค้าให้แล้วเมื่อ ${formatDateTimeTH(handedOverAt)} — ระบบจะปิดงานอัตโนมัติ ${formatDateTimeTH(autoConfirmAt.toISOString())} หากคุณไม่ทักท้วง`
              : 'ติดต่อร้านเพื่อนัดวันและเวลาเข้ารับ — ไม่มีการจัดส่ง'}
          </Typography>
        )}
      </Box>
    </Card>
  )
}
