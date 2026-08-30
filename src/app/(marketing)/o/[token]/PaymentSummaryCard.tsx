'use client'

/**
 * PaymentSummaryCard — "จ่ายไปเท่าไร ค้างเท่าไร" บนหน้าออเดอร์ของลูกค้า (feature 00050 · AC-SQ-06)
 *
 * ## ปัญหาที่แก้
 *
 * หน้านี้บอกได้แค่ **ยอดรวม** มาตลอด ลูกค้าร้านบริการที่โอนมัดจำไปแล้วจึงไม่มีทางรู้จากหน้าจอ
 * ว่าร้านได้รับหรือยัง และเหลือต้องจ่ายอีกเท่าไร — ต้องทักไปถามร้านทุกครั้ง ซึ่งเป็นงานที่
 * ฟีเจอร์นี้ถูกสร้างมาเพื่อตัดทิ้ง
 *
 * ## 🛑 คำบนจอ: "ร้านยืนยันรับแล้ว" ไม่ใช่ "จ่ายแล้ว"
 *
 * BR-SQ-12: **การมีสลิป ≠ ได้รับเงิน** — ลูกค้าแนบสลิปที่หน้านี้ได้ แต่ยอดจะยังไม่ขยับจนกว่า
 * ร้านจะกดยืนยัน ถ้าเขียนว่า "จ่ายแล้ว 0 บาท" คนที่เพิ่งแนบสลิปไปเมื่อกี้จะอ่านว่าระบบไม่รับ
 * สลิปของเขา แล้วแนบซ้ำหรือโอนซ้ำ — คำที่ตรงคือ "ร้านยืนยันรับแล้ว" ซึ่งบอกทั้งตัวเลข
 * และบอกว่า *ใครเป็นคนทำให้ตัวเลขนี้ขยับ*
 *
 * รายการที่ร้านยกเลิกเพราะกรอกผิด **ไม่ถูกส่งมาถึงที่นี่เลย** (กรองที่ query) — เงินโผล่แล้วหาย
 * บนหน้าของลูกค้าคือสิ่งที่อธิบายไม่ได้
 *
 * Base: ./OrderDetailMobile.tsx การ์ด "รีวิวของคุณ" (`<Card>` + `Box px/py` + `overline` label)
 *   ซึ่ง chase ต่อไปที่ theme/vuexy/.../orders/details/OrderDetailsCard.tsx
 */

import Card from '@mui/material/Card'
import CircularProgress from '@mui/material/CircularProgress'
import Box from '@mui/material/Box'
import Divider from '@mui/material/Divider'
import Typography from '@mui/material/Typography'

import { formatDateTimeTH } from '@/lib/format-date'
import { formatBaht } from '@/lib/format-money'
import TrustPill, { VERIFIED_INK } from './TrustPill'
import { ORDER_PAYMENT_KIND_LABEL, ORDER_PAYMENT_METHOD_LABEL } from '@/lib/order-payment'
import { isCODPayment, PAYMENT_STATE_LABEL } from '@/lib/order-display'
import { Icon } from '@iconify/react'

import CustomAvatar from '@core/components/mui/Avatar'
import type { OrderPaymentKind, OrderPaymentMethod } from '@/lib/order-payment'

export interface PublicOrderMoney {
  totalAmount: number
  depositAgreed: number
  totalReceived: number
  outstanding: number
  fullyPaid: boolean
  hasDeposit: boolean
  entries: { kind: string; amount: number; method: string; receivedAtIso: string }[]
}

/**
 * 🛑 ใช้ `formatBaht` จาก SSOT — ห้ามเขียนตัวจัดรูปแบบเงินของตัวเอง
 *
 * เดิมไฟล์นี้บังคับทศนิยม 2 ตำแหน่งเสมอ (`฿1,500.00`) ขณะที่การ์ดรายการที่อยู่ห่างไปหนึ่งบล็อก
 * บังคับ 0 ตำแหน่ง (`฿1,500`) ⇒ **เงินก้อนเดียวกันแสดงคนละรูปแบบบนจอเดียว** (HR16)
 *
 * `formatBaht` ตัดสินจากค่าจริง: มีสตางค์ค่อยโชว์สตางค์ — ตอบทั้งสองบริบทด้วยกฎเดียว
 */
const baht = formatBaht

/**
 * สัดส่วนที่ร้านยืนยันรับแล้ว (%) — ฟังก์ชันบริสุทธิ์เพื่อให้เทสจับได้
 *
 * 🛑 **ยอดบิล 0 ต้องได้ 0% ไม่ใช่ 100%** — บิลเปล่าที่ยังไม่ใส่รายการจะขึ้นวงแหวนเต็มสีเขียว
 * = อ้างว่ามีธุรกรรมเกิดขึ้นทั้งที่ไม่มี (กติกาเดียวกับที่ป้ายสถานะห้ามขึ้น "ชำระเงินแล้ว"
 * กับบิลยอด 0 — ดู `resolveServiceOrderBadge`)
 *
 * 🛑 clamp 0–100: ร้านบันทึกรับเกินยอดได้จริง (ลูกค้าโอนเกิน/ปัดเศษ) วงแหวนที่เกิน 100
 * จะวาดทับตัวเองจนอ่านไม่ออก — ตัวเลขบาทข้าง ๆ ยังบอกความจริงเต็ม ๆ อยู่แล้ว
 */
export function paidPercentOf(money: Pick<PublicOrderMoney, 'totalAmount' | 'totalReceived'>): number {
  if (!(money.totalAmount > 0)) return 0
  return Math.min(100, Math.max(0, Math.round((money.totalReceived / money.totalAmount) * 100)))
}

export default function PaymentSummaryCard({
  money,
  paymentMethod = null,
}: {
  money: PublicOrderMoney
  /**
   * ช่องทางที่ตกลงจะจ่าย — เดิมเป็น **การ์ดแยกอีกใบ** ต่อท้ายรายการสินค้า
   *
   * 🛑 เรื่องเงินของออเดอร์เดียวกันเคยกระจายอยู่ 3 การ์ด (ยอด · สลิป · ช่องทาง)
   * โดยมีการ์ด "รายการบริการ" มาคั่นกลางบนมือถือ ⇒ ผู้ซื้อต้องเลื่อนขึ้นลงเทียบเอง
   * ว่าจะโอนเท่าไร เข้าช่องทางไหน — สองอย่างที่ต้องอ่านคู่กันเสมอ
   *
   * `null` = ร้านยังไม่ระบุ ⇒ ไม่ต้องขึ้นแถวนี้
   * (กติกาเดียวกับบล็อกอื่นบนหน้านี้: ไม่มีอะไรจะบอก = ไม่ต้องแสดง)
   */
  paymentMethod?: string | null
}) {
  const paidPercent = paidPercentOf(money)

  return (
    <Card>
      <Box sx={{ px: 1.75, py: 1.75 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.25 }}>
          <Typography variant='overline' color='text.secondary' sx={{ lineHeight: 1 }}>
            การชำระเงิน
          </Typography>
          {/**
           * ป้ายสรุปสถานะ — ค้างอยู่ใช้ warning ไม่ใช่ error: ยังไม่ถึงกำหนดก็ค้างได้เป็นปกติ
           * ของร้านที่เก็บมัดจำ การใช้สีแดงจะอ่านเป็น "คุณผิดนัดชำระ" ซึ่งไม่จริง
           *
           * 🛑 **ไม่มีตัวเลขในชิป** — เดิมเขียน `ค้าง ฿600` ซึ่งเป็นเลขเดียวกับแถว "คงเหลือ"
           * ที่อยู่ห่างลงไปไม่กี่บรรทัดและเห็นพร้อมกันได้ · ค่าเดียวกันสองที่บนจอเดียว
           * คือรูปแบบที่เคยทำให้ตัวเลขไม่ตรงกันมาแล้ว (`sibling-surface-parity.md`)
           * และเป็นเหตุผลเดียวกับที่ตัดช่อง "สถานะ"/"วันที่" ของ mockup ออกจากการ์ดนัดหมาย
           *
           * ชิปตอบว่า *"จบหรือยัง"* · แถวตอบว่า *"เท่าไร"* — คนละคำถาม อย่างละที่
           */}
          {/* 🛑 `TrustPill` ไม่ใช่ MUI `Chip variant='tonal'` — `TrustPill.tsx` เขียนเหตุผลไว้เองว่า
              tonal ของธีมนี้ให้ text = `{semantic}.main` บนพื้นจาง ซึ่ง **วัดได้ 1.82–1.94:1
              ทุกสี = ตก AA ทั้งชุด** และมันถูกสร้างมาเพื่อลบแพตเทิร์นนั้นทิ้ง
              ป้ายนี้แบก "จบหรือยัง" ของเรื่องเงิน — อ่านไม่ออกคือเสียหน้าที่ทั้งใบ
              (หน้านี้ใช้ `TrustPill` อยู่แล้ว 3 ที่ ⇒ ชิป tonal ยังทำให้จอเดียวมี "ป้าย" 2 หน้าตา) */}
          <Box sx={{ ml: 'auto' }}>
            {/* 🛑 คำต้องมาจาก `PAYMENT_STATE_LABEL` (SSOT) ไม่ใช่พิมพ์เอง —
                ป้ายสถานะบนสุดของร้านบริการ derive จาก **เงินก้อนเดียวกันนี้**
                เดิมจึงได้ "ชำระเงินแล้ว" ข้างบน กับ "ชำระครบแล้ว" ข้างล่าง
                = ข้อเท็จจริงเดียวกันสองคำบนจอเดียว (Hard Rule 16) */}
            <TrustPill
              tone={money.fullyPaid ? 'green' : 'gold'}
              label={money.fullyPaid ? PAYMENT_STATE_LABEL.paid : PAYMENT_STATE_LABEL.outstanding}
            />
          </Box>
        </Box>

        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          {/**
           * วงแหวนสัดส่วนที่ร้านยืนยันรับแล้ว (mockup 2026-08-28 `ring`)
           *
           * 🛑 เป็น **ตัวช่วยอ่าน ไม่ใช่ตัวบอกข้อมูล** — ตัวเลขบาททั้ง 3 แถวข้าง ๆ คือของจริง
           * วงแหวนแค่ทำให้ "ใกล้ครบหรือยัง" อ่านออกในแวบเดียว จึงมี `aria-hidden`
           * และไม่มีข้อมูลไหนอยู่ในวงแหวนที่เดียว (คนใช้ screen reader ได้ครบจากแถวตัวเลข)
           *
           * 🛑 ยอดบิล 0 → หารด้วยศูนย์ · บังคับเป็น 0% ไม่ใช่ 100%
           * บิลเปล่าที่ยังไม่ใส่รายการ ขึ้นวงแหวนเต็มสีเขียว = อ้างว่ามีธุรกรรมเกิดขึ้นทั้งที่ไม่มี
           * (กติกาเดียวกับที่ป้ายสถานะห้ามขึ้น "ชำระเงินแล้ว" กับบิลยอด 0)
           */}
          <Box sx={{ position: 'relative', display: 'grid', placeItems: 'center', flexShrink: 0 }} aria-hidden='true'>
            <CircularProgress
              variant='determinate'
              value={100}
              size={72}
              thickness={4}
              sx={{ color: 'action.hover' }}
            />
            <CircularProgress
              variant='determinate'
              value={paidPercent}
              size={72}
              thickness={4}
              color={money.fullyPaid ? 'success' : 'warning'}
              sx={{ position: 'absolute', left: 0 }}
            />
            <Box sx={{ position: 'absolute', textAlign: 'center', lineHeight: 1.15 }}>
              <Typography sx={{ fontSize: '1rem', fontWeight: 700 }}>{paidPercent}%</Typography>
              <Typography sx={{ fontSize: '0.5625rem', color: 'text.secondary' }}>ยืนยันแล้ว</Typography>
            </Box>
          </Box>

          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.75, gap: 1 }}>
              <Typography variant='body2' color='text.secondary'>
                ยอดรวม
              </Typography>
              <Typography variant='body2' sx={{ fontWeight: 600 }}>
                {baht(money.totalAmount)}
              </Typography>
            </Box>

            {money.hasDeposit && (
          /* 🛑 "มัดจำที่ตกลงไว้" ไม่ใช่ "มัดจำ" เฉย ๆ — คำหลังอ่านได้ทั้ง "เก็บแล้ว" และ
             "ต้องเก็บ" และเมื่อวางใต้ยอดรวมซึ่งเป็นข้อเท็จจริง น้ำหนักจะเอนไปทาง "เก็บแล้ว"
             ซึ่งเป็นคนละเรื่องกับยอดที่ตกลงไว้ (BR-SQ-02 — คำชุดเดียวกับฝั่งร้าน) */
              <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.75, gap: 1 }}>
                <Typography variant='body2' color='text.secondary'>
                  มัดจำที่ตกลงไว้
                </Typography>
                <Typography variant='body2' color='text.secondary'>
                  {baht(money.depositAgreed)}
                </Typography>
              </Box>
            )}

            <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.75, gap: 1 }}>
              {/* คำที่ตรงกับความจริง: ตัวเลขนี้ขยับเมื่อ **ร้านกดยืนยัน** ไม่ใช่เมื่อลูกค้าโอน */}
              <Typography variant='body2' color='text.secondary'>
                ร้านยืนยันรับแล้ว
              </Typography>
              <Typography variant='body2' sx={{ fontWeight: 600, color: VERIFIED_INK }}>
                {baht(money.totalReceived)}
              </Typography>
            </Box>

            {/**
             * แถว "คงเหลือ" (mockup 2026-08-28) — 🛑 เดิมยอดค้างอยู่ใน **ชิปเล็ก ๆ บนหัวการ์ด**
             * ที่เดียว ทั้งที่เป็นตัวเลขที่ผู้ซื้อเปิดหน้านี้มาเพื่อดู · ชิปมีไว้สรุปสถานะ
             * ไม่ใช่ที่อยู่ของตัวเลขหลัก
             *
             * เน้นด้วย **น้ำหนักตัวอักษร** ไม่ใช่สีแดง — ค้างอยู่เป็นเรื่องปกติของร้านที่เก็บมัดจำ
             * สีแดงจะอ่านว่า "คุณผิดนัดชำระ" ซึ่งไม่จริง (เหตุผลเดียวกับชิปที่ใช้ warning)
             */}
            <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 1 }}>
              <Typography variant='body2' sx={{ fontWeight: 600 }}>
                คงเหลือ
              </Typography>
              {/* 🛑 จ่ายครบแล้วให้ *ลดน้ำหนัก* ได้ แต่ห้ามลดจนอ่านไม่ออก — `text.disabled`
                  วัดได้ 2.30:1 บนพื้นขาว (ตก AA ไปไกล) และนี่คือ **ตัวเลขเงิน**
                  ที่ผู้ซื้อเปิดหน้านี้มาดู · `text.secondary` = 5.22:1 ผ่าน AA และยังจางกว่าหมึกหลัก */}
              <Typography
                variant='body2'
                sx={{ fontWeight: 700, color: money.fullyPaid ? 'text.secondary' : 'text.primary' }}
              >
                {baht(money.outstanding)}
              </Typography>
            </Box>
          </Box>
        </Box>

        {money.entries.length > 0 && (
          <>
            <Divider sx={{ my: 1.5 }} />
            {/* หัวข้อ (mockup 2026-08-28) — เดิมรายการเงินลอยมาใต้เส้นเฉย ๆ อ่านไม่ออกว่า
                เป็น "ประวัติ" ⇒ แถวเดียวถูกอ่านเป็นยอดอีกก้อนที่ต่อจากสรุปข้างบน */}
            <Typography variant='caption' sx={{ display: 'block', fontWeight: 600, mb: 1 }}>
              ประวัติการชำระเงิน
            </Typography>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
              {money.entries.map((e, i) => (
                <Box key={i} sx={{ display: 'flex', alignItems: 'baseline', gap: 1 }}>
                  <Typography variant='body2' sx={{ fontWeight: 600 }}>
                    {baht(e.amount)}
                  </Typography>
                  <Typography variant='caption' color='text.secondary'>
                    {ORDER_PAYMENT_KIND_LABEL[e.kind as OrderPaymentKind] ?? e.kind}
                    {' · '}
                    {ORDER_PAYMENT_METHOD_LABEL[e.method as OrderPaymentMethod] ?? e.method}
                  </Typography>
                  {/* 🛑 ทุกแถวในประวัติคือรายการที่ **ร้านยืนยันแล้ว** เท่านั้น (รายการที่ร้าน
                      ยกเลิกถูกกรองออกตั้งแต่ query) — เวลาที่แสดงคือเวลาที่ร้านกดรับ
                      ไม่ใช่เวลาที่ลูกค้าโอน คำกำกับจึงต้องไม่ปล่อยให้เดา */}
                  {/* 🛑 `text.secondary` ไม่ใช่ `text.disabled` — ตัวหลังคือหมึกที่ opacity 0.4
                      = **2.30:1 บนพื้นขาว ตก AA** (`SectionTitle.tsx` คำนวณไว้เองแล้ว)
                      นี่คือ *เวลาที่ร้านยืนยันรับเงิน* ซึ่งเป็นหลักฐานของธุรกรรม ไม่ใช่ของประดับ */}
                  <Typography variant='caption' color='text.secondary' sx={{ ml: 'auto', textAlign: 'right', lineHeight: 1.4 }}>
                    {formatDateTimeTH(e.receivedAtIso)}
                  </Typography>
                </Box>
              ))}
            </Box>
          </>
        )}

        {/**
         * บรรทัดอธิบาย — โผล่เฉพาะตอน **ยังไม่มีรายการเลย** ซึ่งเป็นตอนที่ผู้ใช้สับสนที่สุด
         * (แนบสลิปไปแล้วแต่ยอดยังเป็น 0) ตอนมีรายการแล้วไม่ต้องอธิบาย ตัวเลขพูดแทนหมด
         */}
        {/* ── ช่องทางที่ตกลงจะจ่าย — ยุบมาจากการ์ดแยกใบ (ลดบล็อกบนมือถือ) ── */}
        {paymentMethod !== null && (
          <Box
            sx={{
              mt: 1.75,
              pt: 1.5,
              borderTop: '1px solid',
              borderColor: 'divider',
              display: 'flex',
              gap: 1.25,
              alignItems: 'center',
            }}
          >
            {/* D4: icon tonal info=โอนเงิน / warning=COD (ไม่ใช่ success — เขียวสงวนไว้กับ verified) */}
            <CustomAvatar
              skin='light'
              variant='rounded'
              color={isCODPayment(paymentMethod) ? 'warning' : 'info'}
              size={34}
            >
              <Icon icon={isCODPayment(paymentMethod) ? 'tabler-coin' : 'tabler-credit-card'} fontSize={16} />
            </CustomAvatar>
            <Box sx={{ minWidth: 0 }}>
              <Typography variant='caption' color='text.secondary' sx={{ display: 'block' }}>
                {isCODPayment(paymentMethod) ? 'ชำระเมื่อได้รับสินค้า' : 'โอนเข้าบัญชี'}
              </Typography>
              <Typography variant='body2' sx={{ fontWeight: 700 }}>
                {paymentMethod}
              </Typography>
            </Box>
          </Box>
        )}

        {money.entries.length === 0 && (
          <Typography variant='caption' color='text.secondary' sx={{ display: 'block', mt: 1.25, lineHeight: 1.6 }}>
            ยอดนี้จะอัปเดตเมื่อร้านกดยืนยันว่าได้รับเงินแล้ว — แนบสลิปไว้ได้เลย ร้านจะเห็นทันที
          </Typography>
        )}
      </Box>
    </Card>
  )
}
