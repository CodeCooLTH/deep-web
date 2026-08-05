'use client'
import { type ApexOptions } from 'apexcharts'
import dynamic from 'next/dynamic'
import { useEffect, useMemo } from 'react'

import { useLayoutContext } from '@/context/useLayoutContext'

const ReactApexCharts = dynamic(() => import('react-apexcharts'), {
  ssr: false,
})

type PropsType = {
  type?: NonNullable<ApexOptions['chart']>['type']
  height?: number | string
  width?: number | string
  getOptions: () => ApexOptions
  series?: ApexOptions['series']
  className?: string
}

const ApexChart = ({ type, height, width = '100%', getOptions, series, className }: PropsType) => {
  const { skin, theme } = useLayoutContext()

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const options = useMemo(() => getOptions(), [skin, theme, getOptions])

  /**
   * บังคับให้ ApexCharts วัดกล่องใหม่หลัง mount — กัน "กราฟกลับหัวเฉพาะครั้งแรก"
   *
   * ApexCharts วัดความกว้าง/ความสูงของ container ตอน render ครั้งเดียว ถ้าจังหวะนั้นค่ายังไม่นิ่ง
   * (paint แรกบน iOS Safari หรือฟอนต์ Anuphan ยังโหลดไม่เสร็จ) มันจะคำนวณความสูงแถบป้ายแกน x ผิด
   * จนพื้นที่วาดเหลือใกล้ศูนย์/ติดลบ แล้ววาดแท่งกลับด้าน — เหมือนยอดติดลบทั้งที่ข้อมูลเป็นบวกล้วน
   *
   * ที่รู้ว่าเป็นเรื่องการวัด ไม่ใช่เรื่องข้อมูล: user รายงาน 2026-08-05 (iPhone 14 Pro Max) ว่าเพี้ยน
   * เฉพาะตอนเปิดครั้งแรก พอสลับไปแอปอื่นแล้วกลับมาก็ปกติเอง — เพราะ iOS ยิง resize ตอนกลับมา
   * แล้ว ApexCharts วัดใหม่ ตัว effect นี้คือการยิง resize นั้นให้เองโดยไม่ต้องรอผู้ใช้สลับแอป
   *
   * ยิง 2 จังหวะ: หลัง layout นิ่ง (double rAF) และหลังฟอนต์โหลดจบ (เมตริกตัวอักษรเปลี่ยน
   * โดยขนาดกล่องไม่เปลี่ยน ซึ่ง ResizeObserver จับไม่ได้) — resize ซ้ำเป็น no-op ถ้าค่าถูกอยู่แล้ว
   */
  useEffect(() => {
    let cancelled = false
    const remeasure = () => {
      if (!cancelled) window.dispatchEvent(new Event('resize'))
    }
    const raf = requestAnimationFrame(() => requestAnimationFrame(remeasure))
    document.fonts?.ready.then(remeasure).catch(() => {})
    return () => {
      cancelled = true
      cancelAnimationFrame(raf)
    }
  }, [])

  return <ReactApexCharts type={type ?? options.chart?.type} height={height ?? options.chart?.height} width={width ?? options.chart?.width} options={options} series={series ?? options.series} className={`apex-charts ${className || ''}`} />
}

export default ApexChart
