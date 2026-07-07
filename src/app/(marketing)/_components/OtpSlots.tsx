'use client'

/**
 * OtpSlots — shared OTP 6-digit input slots
 *
 * ทำไม (D5/Q5, feature 00015): OTP slot markup (input-otp + Slot/FakeCaret + inputOtp.module.css)
 * เดิม duplicate อยู่ 2 จุด (VerifyOtpCard.tsx, PhoneUnlock.tsx) — เมื่อ ClaimOtpPrompt.tsx เป็นจุดที่ 3
 * (Bid Phone-Verify modal เป็นจุดที่ 4 ในอนาคต ตาม UX spec Screen 5) ให้ extract เป็น shared component
 * แทนการ copy ซ้ำ. Logic เดิมทั้งหมด (autoFocus, maxLength=6, render 6 slot) เหมือนต้นฉบับเป๊ะ
 *
 * Base: src/app/(marketing)/auth/verify-otp/VerifyOtpCard.tsx (Slot/FakeCaret/OTPInput เดิม)
 *   + src/libs/styles/inputOtp.module.css
 */
import classnames from 'classnames'
import { OTPInput } from 'input-otp'
import type { SlotProps } from 'input-otp'

import styles from '@/libs/styles/inputOtp.module.css'

const Slot = (props: SlotProps) => (
  <div className={classnames(styles.slot, { [styles.slotActive]: props.isActive })}>
    {props.char !== null && <div>{props.char}</div>}
    {props.hasFakeCaret && <FakeCaret />}
  </div>
)

const FakeCaret = () => (
  <div className={styles.fakeCaret}>
    <div className='w-px h-5 bg-textPrimary' />
  </div>
)

type Props = {
  value: string
  onChange: (value: string) => void
  autoFocus?: boolean
}

export default function OtpSlots({ value, onChange, autoFocus = true }: Props) {
  return (
    <OTPInput
      onChange={onChange}
      value={value}
      maxLength={6}
      autoFocus={autoFocus}
      containerClassName='flex items-center'
      render={({ slots }) => (
        <div className='flex items-center justify-between w-full gap-4'>
          {slots.slice(0, 6).map((slot, idx) => (
            <Slot key={idx} {...slot} />
          ))}
        </div>
      )}
    />
  )
}
