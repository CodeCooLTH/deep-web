/**
 * UserCard — header card แสดงชื่อร้านค้า + trust score + วันที่/เวลา
 *
 * Base: theme/paces/Admin/TS/src/app/(admin)/dashboard/ecommerce/components/UserCard.tsx
 *
 * เปลี่ยนจาก META_DATA.username → รับ shopName + trustScore จาก server component
 * เพื่อแสดงข้อมูลจริงของร้านค้า SafePay
 */
'use client'
import email from '@/assets/images/svg/email-campaign.svg'
import Icon from '@/components/wrappers/Icon'

import Image from 'next/image'
import { useEffect, useState } from 'react'
import { formatDate } from '@/lib/format-date'

type UserCardProps = {
  shopName?: string
  trustScore?: number
}

const UserCard = ({ shopName = 'ร้านค้าของคุณ', trustScore = 0 }: UserCardProps) => {
  const [currentTime, setCurrentTime] = useState('')
  // currentDate guard เดียวกับ currentTime — ป้องกัน hydration mismatch
  // (new Date() ที่ server vs client อาจ diff; ต้องรอ mount ก่อน)
  const [currentDate, setCurrentDate] = useState('')

  useEffect(() => {
    const updateTime = () => {
      const now = new Date()
      setCurrentTime(
        now.toLocaleTimeString('th-TH', {
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
          hour12: false,
        })
      )
    }

    // set วันที่ครั้งแรก (ไม่ต้อง interval — วันไม่เปลี่ยนระหว่าง session ส่วนใหญ่)
    // นาฬิกา live (currentTime) คงเป็นเวลาล้วน; วันที่วันนี้ใช้ format มาตรฐาน
    setCurrentDate(formatDate(new Date()))

    updateTime()
    const timer = setInterval(updateTime, 1000)

    return () => clearInterval(timer)
  }, [])

  return (
    <div className="card h-full">
      <div className="card-body pb-0">
        <div className="flex justify-between items-center">
          <div className="overflow-hidden">
            <h3 className="font-normal text-xl mb-2">
              <span className="text-default-400 text-sm uppercase font-medium">ยินดีต้อนรับ,</span>
              <br />
              <b>{shopName}</b>
            </h3>
            <p className="text-default-400 text-xs mt-1">
              Trust Score: <span className="font-semibold text-primary">{trustScore}/100</span>
            </p>
          </div>
          <div className="text-end">
            <Image className="xl:block hidden" src={email} width={110} alt="ภาพประกอบร้านค้า" />
          </div>
        </div>
      </div>
      <div className="card-body p-2.5 flex items-center bg-light/50 overflow-hidden">
        <p className="flex items-center justify-between w-full">
          <span className="flex items-center gap-1.25">
            <Icon icon="calendar" className="align-middle text-md" />
            <span className="ms-1">
              {currentDate}
            </span>
          </span>
          <span className="flex items-center gap-1.25">
            <Icon icon="clock" className="align-middle text-md" />
            <span className="font-semibold" id="clock-widget">
              {currentTime}
            </span>
          </span>
        </p>
      </div>
    </div>
  )
}

export default UserCard
