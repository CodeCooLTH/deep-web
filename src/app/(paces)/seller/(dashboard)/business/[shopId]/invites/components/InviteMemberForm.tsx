'use client'

/**
 * InviteMemberForm — ฟอร์มเชิญผู้ดูแล (admin) เข้า Business shop ผ่านเบอร์โทร/อีเมล
 *
 * Base: theme/paces/Admin/TS/src/app/auth/split/sign-up/components/SignUpForm.tsx
 *   (input-icon-group markup: <Icon className="input-icon" /> + input class="form-input")
 * chase ผ่าน src/app/(paces)/seller/(dashboard)/business/create/components/CreateBusinessForm.tsx
 *   (RHF+Yup single-card form shell: card>card-header+card-body+card-footer, form-select native บังคับ RHF bind — HR6)
 * phone regex มาตรฐานเดียวกับ src/app/(paces)/seller/auth/sign-up/components/SignUpForm.tsx (/^0[0-9]{9}$/)
 *
 * Yup schema mirror InviteShopMemberSchema (Valibot, src/lib/validations.ts) — backend รับแค่ non-empty +
 * picklist(PHONE/EMAIL); ฝั่ง frontend เข้มกว่าเพื่อ UX (เบอร์ 10 หลัก / อีเมลถูกรูปแบบ) ตาม convention
 * "Backend Valibot loose, Frontend Yup strict for UX" ของโปรเจกต์
 */

import { yupResolver } from '@hookform/resolvers/yup'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import * as Yup from 'yup'
import Icon from '@/components/wrappers/Icon'
import { pacesToast } from '@/lib/paces-toast'

const schema = Yup.object({
  contactType: Yup.string().oneOf(['PHONE', 'EMAIL'] as const).required(),
  contact: Yup.string()
    .required('กรุณากรอกเบอร์โทรหรืออีเมล')
    .when('contactType', {
      is: 'PHONE',
      then: (s) => s.matches(/^0[0-9]{9}$/, 'เบอร์ต้องขึ้นต้นด้วย 0 และมี 10 หลัก'),
      otherwise: (s) => s.email('รูปแบบอีเมลไม่ถูกต้อง'),
    }),
})

type FormValues = Yup.InferType<typeof schema>

// error code จาก API.md §4.10 → ข้อความไทย
const ERROR_MESSAGE: Record<string, string> = {
  NOT_OWNER: 'คุณไม่มีสิทธิ์เชิญผู้ดูแลร้านนี้',
  NO_ACTIVE_PACKAGE: 'ไม่มีแพ็กเกจที่ใช้งานอยู่',
  SHOP_LOCKED: 'ธุรกิจนี้ถูกล็อกอยู่',
  ADMIN_QUOTA_EXCEEDED: 'ครบโควตาผู้ดูแลของแพ็กเกจนี้แล้ว',
  INVITE_ALREADY_PENDING: 'มีคำเชิญที่รออยู่แล้วสำหรับผู้ติดต่อนี้',
  VALIDATION_ERROR: 'ข้อมูลไม่ถูกต้อง กรุณาตรวจสอบอีกครั้ง',
}

interface InviteMemberFormProps {
  shopId: string
  /** true = ปิดใช้งานฟอร์มทั้งหมด (locked / เต็มโควตา / ไม่ใช่เจ้าของ / ไม่มีแพ็กเกจ) */
  disabled: boolean
  /** ข้อความอธิบายเหตุผลที่ฟอร์มถูกปิด — null ถ้าใช้งานได้ปกติ */
  disabledReason: string | null
  /** "X/Y ใช้แล้ว" — คำนวณจาก page.tsx (server) */
  quotaLabel: string
}

export default function InviteMemberForm({ shopId, disabled, disabledReason, quotaLabel }: InviteMemberFormProps) {
  const router = useRouter()
  const {
    register,
    handleSubmit,
    watch,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: yupResolver(schema),
    defaultValues: { contactType: 'PHONE', contact: '' },
  })

  const contactType = watch('contactType')

  const onSubmit = async (values: FormValues) => {
    try {
      const res = await fetch(`/api/business/shops/${shopId}/invites`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contact: values.contact, contactType: values.contactType }),
      })

      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        pacesToast.error(ERROR_MESSAGE[data?.error as string] ?? 'ส่งคำเชิญไม่สำเร็จ กรุณาลองใหม่')
        return
      }

      pacesToast.success('ส่งคำเชิญสำเร็จ')
      reset({ contactType: values.contactType, contact: '' })
      router.refresh()
    } catch {
      pacesToast.error('เกิดข้อผิดพลาด กรุณาลองใหม่')
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate>
      <div className="card">
        <div className="card-header flex flex-wrap items-center justify-between gap-2">
          <h4 className="card-title">เชิญผู้ดูแลร้าน</h4>
          <span className="badge bg-default-100 text-default-600 text-2xs">{quotaLabel}</span>
        </div>
        <div className="card-body">
          {disabledReason && (
            <div className="border-warning/20 bg-warning/10 text-warning mb-4 flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium">
              <Icon icon="info-circle" className="size-4 shrink-0" aria-hidden="true" />
              {disabledReason}
            </div>
          )}
          <div className="gap-base grid grid-cols-1 sm:grid-cols-[8rem_1fr]">
            {/* ประเภทผู้ติดต่อ — HR6 form-select native (bind RHF) ไม่ใช่ hs-dropdown */}
            <div>
              <label className="form-label">ประเภท</label>
              <select className="form-select" disabled={disabled} {...register('contactType')}>
                <option value="PHONE">เบอร์โทร</option>
                <option value="EMAIL">อีเมล</option>
              </select>
            </div>

            {/* เบอร์โทร/อีเมล — icon สลับตาม contactType ที่เลือก */}
            <div>
              <label className="form-label">เบอร์โทรหรืออีเมล</label>
              <div className="input-icon-group">
                <Icon icon={contactType === 'EMAIL' ? 'mail' : 'phone'} className="input-icon" aria-hidden="true" />
                <input
                  type="text"
                  className="form-input"
                  placeholder={contactType === 'EMAIL' ? 'admin@example.com' : '0812345678'}
                  disabled={disabled}
                  {...register('contact')}
                />
              </div>
              {errors.contact && <p className="text-danger mt-1 text-sm">{errors.contact.message}</p>}
            </div>
          </div>
        </div>
        <div className="card-footer flex justify-end">
          <button
            type="submit"
            disabled={disabled || isSubmitting}
            className="btn bg-primary text-white hover:bg-primary-hover inline-flex items-center gap-1.5 disabled:opacity-60"
          >
            {isSubmitting ? (
              <>
                <Icon icon="refresh" className="animate-spin" aria-hidden="true" />
                กำลังส่ง...
              </>
            ) : (
              <>
                <Icon icon="user-plus" aria-hidden="true" />
                ส่งคำเชิญ
              </>
            )}
          </button>
        </div>
      </div>
    </form>
  )
}
