'use client'

/**
 * NextActionTransfer — กล่อง "โอนเงิน + แนบสลิป" ในกล่องขั้นถัดไป (00068 TFR-004, D-4, D-5, R-3, R-7)
 *
 * ไม่ตัดสินเองว่าควรขึ้นหรือไม่ — NextActionCard เรียกก็ต่อเมื่อ `resolveBuyerNextAction` ให้ `transfer`
 * (CASH/COD ไม่มีกล่องนี้เพราะฟังก์ชันตัดไว้แล้ว ห้ามเช็คซ้ำที่นี่ — D-5)
 * `noAccount` = ร้านยังไม่ตั้งบัญชี: บอกให้ติดต่อร้าน ไม่วาดบัญชี/QR/ปุ่มแนบสลิป (R-7)
 * ยอด `amountDue` มาจาก `resolveTransferAmount` (ร้านบริการ = ยอดค้าง) — ใช้ทั้งหัวเรื่องและ QR ใน PayoutAccountCard
 *
 * ไม่มีคำว่า "ร้านตรวจแล้ว/ร้านจะ…" — ระบบรู้แค่ว่าแนบแล้ว ไม่ได้รู้ว่าร้านตรวจ
 * ห้ามพิมพ์เลข MB ตรง ๆ — เพดานอ่านจาก `uploadMaxSize('DOCUMENT')` ตัวเดียวกับที่ /api/uploads/commit บังคับ
 *
 * Base: ./NextActionShell.tsx (เปลือกการ์ด) · ./PayoutAccountCard.tsx (แถวบัญชี/QR) · ส่วนแนบสลิปยกจากบล็อกเดิมใน ./OrderDetailMobile.tsx
 */

import Avatar from '@mui/material/Avatar'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Typography from '@mui/material/Typography'

import { Icon } from '@iconify/react'

import { LinkButton } from '@/app/(marketing)/_components/mui-link'
import { buildTransferView, TRANSFER_NO_ACCOUNT_BODY, TRANSFER_NO_ACCOUNT_TITLE } from '@/lib/buyer-next-action'
import type { PaymentBadge } from '@/lib/order-display'
import type { PayoutSnapshot } from '@/lib/shop-payout'
import { uploadMaxSize } from '@/lib/upload-policy'
import CustomAvatar from '@core/components/mui/Avatar'
import NextActionShell from './NextActionShell'
import PayoutAccountCard from './PayoutAccountCard'
import { useSlipUpload } from './useSlipUpload'

type Props = {
  emphasis: 'hero' | 'follow'
  token: string
  shopId: string
  /** `resolveTransferAmount(...)` */
  amountDue: number
  /** ยอดที่ร้านยืนยันรับแล้ว (ร้านบริการ) — ร้านขายของส่ง 0 */
  totalReceived: number
  /** `action.transferNoAccount` */
  noAccount: boolean
  payoutSnapshot: PayoutSnapshot | null
  paymentBadge: PaymentBadge
  status: string
  paymentConfirmedAt: string | null
  initialSlipFileId: string | null
  disputeOpenedAtIso: string | null
}

const SLIP_MAX_MB = Math.floor(uploadMaxSize('DOCUMENT') / (1024 * 1024))

export default function NextActionTransfer({
  emphasis,
  token,
  shopId,
  amountDue,
  totalReceived,
  noAccount,
  payoutSnapshot,
  paymentBadge,
  status,
  paymentConfirmedAt,
  initialSlipFileId,
  disputeOpenedAtIso,
}: Props) {
  // 🛑 destructure — ห้ามเอาค่าที่ hook คืนทั้งก้อนไปใส่ deps (hook-return-identity-in-deps.md)
  const { slipFileId, slipPreview, slipName, uploading, inputRef, upload } = useSlipUpload(token, initialSlipFileId)

  const chatButton = (
    <LinkButton
      href={`/messages/${shopId}`}
      fullWidth
      variant='contained'
      startIcon={<Icon icon='tabler-headset' fontSize={18} />}
      sx={{ minHeight: 48, fontWeight: 500 }}
    >
      ติดต่อร้านค้า
    </LinkButton>
  )

  if (noAccount) {
    return (
      <NextActionShell
        emphasis={emphasis}
        title={TRANSFER_NO_ACCOUNT_TITLE}
        // ไอคอนเตือนสี warning-ink ไม่ใช่แดง — ร้านยังไม่แจ้งบัญชีไม่ใช่ความผิดของผู้ซื้อ และยังไม่ใช่อันตราย
        icon='tabler-alert-triangle'
        disputeOpenedAtIso={disputeOpenedAtIso}
      >
        <Typography color='text.secondary' sx={{ mb: 2.5 }}>
          {TRANSFER_NO_ACCOUNT_BODY}
        </Typography>
        {chatButton}
      </NextActionShell>
    )
  }

  const { title, subtitle } = buildTransferView({ amountDue, totalReceived, slipAttached: slipFileId != null })

  const slipZone = (
    <Box sx={{ mt: 2.5 }}>
      <input
        ref={inputRef}
        type='file'
        accept='image/*,application/pdf'
        style={{ display: 'none' }}
        onChange={e => {
          const file = e.target.files?.[0]

          if (file) upload(file)
        }}
      />

      {slipFileId == null ? (
        <>
          <Button
            fullWidth
            variant='contained'
            disabled={uploading}
            onClick={() => inputRef.current?.click()}
            startIcon={<Icon icon='tabler-upload' fontSize={18} />}
            sx={{ minHeight: 48, fontWeight: 500 }}
          >
            {uploading ? 'กำลังอัปโหลด...' : 'แนบสลิป'}
          </Button>
          <Typography variant='caption' color='text.secondary' sx={{ display: 'block', mt: 1, fontSize: '0.8125rem' }}>
            ไฟล์ภาพหรือ PDF ไม่เกิน {SLIP_MAX_MB}MB
          </Typography>
        </>
      ) : (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          {slipPreview ? (
            <Avatar
              variant='rounded'
              src={slipPreview}
              alt='ตัวอย่างสลิป'
              sx={{ width: 46, height: 62, borderRadius: '8px', flexShrink: 0, border: '1px solid', borderColor: 'divider' }}
            />
          ) : (
            // สีกลาง ไม่ใช่เขียว — การแนบไม่ใช่การยืนยันของใคร (Verified-Means-Green)
            <CustomAvatar skin='light' variant='rounded' color='secondary' sx={{ width: 46, height: 62, borderRadius: '8px', flexShrink: 0 }}>
              <Icon icon='tabler-file-text' fontSize={22} />
            </CustomAvatar>
          )}
          <Typography
            variant='body2'
            sx={{ flex: 1, minWidth: 0, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
          >
            {slipName ?? 'สลิปที่แนบ'}
          </Typography>
          <Button
            variant='outlined'
            color='secondary'
            disabled={uploading}
            onClick={() => inputRef.current?.click()}
            sx={{ flexShrink: 0, minHeight: 44 }}
          >
            {uploading ? 'กำลังอัปโหลด...' : 'เปลี่ยนสลิป'}
          </Button>
        </Box>
      )}
    </Box>
  )

  return (
    <NextActionShell emphasis={emphasis} title={title} disputeOpenedAtIso={disputeOpenedAtIso}>
      <Typography color='text.secondary' sx={{ mb: 1 }}>
        {subtitle}
      </Typography>
      <PayoutAccountCard
        variant='embedded'
        amountDue={amountDue}
        payoutSnapshot={payoutSnapshot}
        paymentBadge={paymentBadge}
        status={status}
        paymentConfirmedAt={paymentConfirmedAt}
        contactShopAction={chatButton}
        afterAccount={slipZone}
      />
    </NextActionShell>
  )
}
