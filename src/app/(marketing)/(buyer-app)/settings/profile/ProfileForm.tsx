'use client'

// Base: theme/vuexy/typescript-version/full-version/src/views/pages/user-profile/profile/AboutOverview.tsx
// (primary — Card + CardContent flex flex-col gap-6, renderList row pattern icon + label + value)
// + theme/vuexy/typescript-version/full-version/src/views/pages/account-settings/account/AccountDetails.tsx
// (kept avatar upload Upload/Reset row from R6 implementation)
//
// Adapted: owner-facing edit surface — "ข้อมูลส่วนตัว" (about) + "สรุป" (overview) sections.
// Page-level edit toggle (choice A, MVP): top "แก้ไข" flips about rows into inputs; "บันทึก"/"ยกเลิก"
// appear at bottom while editing. Only displayName is editable — username/phone/email are read-only
// (email shows "เร็วๆ นี้" chip).
// Dropped: Grid/CustomTextField layout from the old AccountDetails-based form.

import { useState } from 'react'

import { useRouter } from 'next/navigation'
import { useSession } from 'next-auth/react'

import Button from '@mui/material/Button'
import Card from '@mui/material/Card'
import CardContent from '@mui/material/CardContent'
import Chip from '@mui/material/Chip'
import Typography from '@mui/material/Typography'

import { yupResolver } from '@hookform/resolvers/yup'
import { useForm } from 'react-hook-form'
import { toast } from 'react-toastify'
import * as Yup from 'yup'

import CustomTextField from '@core/components/mui/TextField'

type Props = {
  user: {
    id: string
    displayName: string
    username: string
    avatar: string | null
    phone: string | null
    email: string | null
  }
  summary: {
    trustScore: number
    trustLevel: string
    memberSince: string
    badgeCount: number
  }
}

const schema = Yup.object({
  displayName: Yup.string()
    .trim()
    .min(2, 'อย่างน้อย 2 ตัวอักษร')
    .max(50, 'ไม่เกิน 50 ตัวอักษร')
    .required('กรุณากรอกชื่อที่แสดง'),
})

type FormValues = Yup.InferType<typeof schema>

const ProfileForm = ({ user, summary }: Props) => {
  const router = useRouter()
  // update() = สั่ง NextAuth re-fetch session (session callback อ่าน avatar สดจาก DB)
  // → Sidebar/navbar ที่ใช้ useSession อัปเดตรูปทันที ไม่ต้องรีเฟรชหน้า
  const { update } = useSession()

  // Page-level edit toggle (choice A)
  const [isEditing, setIsEditing] = useState<boolean>(false)

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting, isDirty },
  } = useForm<FormValues>({
    resolver: yupResolver(schema),
    defaultValues: { displayName: user.displayName },
  })

  const onSubmit = async (values: FormValues) => {
    try {
      const res = await fetch('/api/users/me', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ displayName: values.displayName.trim() }),
      })
      if (!res.ok) {
        toast.error('บันทึกไม่สำเร็จ')
        return
      }
      toast.success('บันทึกโปรไฟล์แล้ว')
      reset({ displayName: values.displayName.trim() })
      setIsEditing(false)
      await update()
      router.refresh()
    } catch {
      toast.error('บันทึกไม่สำเร็จ')
    }
  }

  const handleCancelEdit = () => {
    reset({ displayName: user.displayName })
    setIsEditing(false)
  }

  // Read-only "about" rows — renderList pattern from AboutOverview
  const aboutRows: Array<{ property: string; value: string; icon: string }> = [
    { property: 'ชื่อที่แสดง', value: user.displayName, icon: 'tabler-user' },
    { property: 'ชื่อผู้ใช้', value: `@${user.username}`, icon: 'tabler-at' },
    { property: 'เบอร์โทร', value: user.phone ?? '-', icon: 'tabler-phone' },
    { property: 'อีเมล', value: user.email ?? '-', icon: 'tabler-mail' },
  ]

  const overviewRows: Array<{ property: string; value: string; icon: string }> = [
    {
      property: 'Trust Score',
      value: `${summary.trustScore} (ระดับ ${summary.trustLevel})`,
      icon: 'tabler-shield-check',
    },
    { property: 'สมาชิกตั้งแต่', value: summary.memberSince, icon: 'tabler-calendar' },
    { property: 'Badge', value: `${summary.badgeCount} รายการ`, icon: 'tabler-award' },
  ]

  const renderReadonlyRow = (item: { property: string; value: string; icon: string }) => (
    <div key={item.property} className='flex items-center gap-2'>
      <i className={item.icon} />
      <div className='flex items-center flex-wrap gap-2'>
        <Typography className='font-medium'>{`${item.property}:`}</Typography>
        <Typography>{item.value}</Typography>
      </div>
    </div>
  )

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className='flex flex-col gap-6'>
      {/* About + Overview card (AboutOverview shape) — การ์ดเปลี่ยนรูปย้ายไป AccountSidebar (คลิก avatar) */}
      <Card>
        <CardContent className='flex flex-col gap-6'>
          {/* About section */}
          <div className='flex flex-col gap-4'>
            <div className='flex items-center justify-between gap-2 flex-wrap'>
              <Typography variant='subtitle2' className='font-medium' color='text.primary'>
                ข้อมูลส่วนตัว
              </Typography>
              {!isEditing && (
                <Button
                  size='small'
                  variant='tonal'
                  startIcon={<i className='tabler-pencil' />}
                  onClick={() => setIsEditing(true)}
                >
                  แก้ไข
                </Button>
              )}
            </div>

            {isEditing ? (
              <div className='flex flex-col gap-4'>
                {/* Editable: displayName */}
                <div className='flex items-start gap-2'>
                  <i className='tabler-user mt-3' />
                  <div className='grow'>
                    <CustomTextField
                      fullWidth
                      label='ชื่อที่แสดง'
                      placeholder='ชื่อ-นามสกุล หรือชื่อเล่น'
                      error={!!errors.displayName}
                      helperText={errors.displayName?.message}
                      {...register('displayName')}
                    />
                  </div>
                </div>

                {/* Read-only rows (during edit, still shown as static) */}
                <div className='flex items-center gap-2'>
                  <i className='tabler-at' />
                  <div className='flex items-center flex-wrap gap-2'>
                    <Typography className='font-medium'>ชื่อผู้ใช้:</Typography>
                    <Typography>@{user.username}</Typography>
                    <Typography color='text.secondary' className='text-xs'>
                      (ไม่สามารถแก้ไขได้)
                    </Typography>
                  </div>
                </div>
                <div className='flex items-center gap-2'>
                  <i className='tabler-phone' />
                  <div className='flex items-center flex-wrap gap-2'>
                    <Typography className='font-medium'>เบอร์โทร:</Typography>
                    <Typography>{user.phone ?? '-'}</Typography>
                    <Typography color='text.secondary' className='text-xs'>
                      (ยืนยันแล้ว)
                    </Typography>
                  </div>
                </div>
                <div className='flex items-center gap-2'>
                  <i className='tabler-mail' />
                  <div className='flex items-center flex-wrap gap-2'>
                    <Typography className='font-medium'>อีเมล:</Typography>
                    <Typography>{user.email ?? '-'}</Typography>
                    <Chip size='small' label='เร็วๆ นี้' variant='tonal' color='warning' />
                  </div>
                </div>

                {/* Action row */}
                <div className='flex gap-4 flex-wrap pt-2'>
                  <Button
                    variant='contained'
                    type='submit'
                    disabled={isSubmitting || !isDirty}
                  >
                    {isSubmitting ? 'กำลังบันทึก…' : 'บันทึก'}
                  </Button>
                  <Button
                    variant='tonal'
                    type='button'
                    color='secondary'
                    onClick={handleCancelEdit}
                    disabled={isSubmitting}
                  >
                    ยกเลิก
                  </Button>
                </div>
              </div>
            ) : (
              aboutRows.map(renderReadonlyRow)
            )}
          </div>

          {/* Overview section */}
          <div className='flex flex-col gap-4'>
            <Typography variant='subtitle2' className='font-medium' color='text.primary'>
              สรุป
            </Typography>
            {overviewRows.map(renderReadonlyRow)}
          </div>
        </CardContent>
      </Card>
    </form>
  )
}

export default ProfileForm
