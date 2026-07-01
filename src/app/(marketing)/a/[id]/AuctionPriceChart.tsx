'use client'

/**
 * AuctionPriceChart — sparkline แนวโน้มราคา (feature 00004)
 *
 * 🛑 PII guard: รับ prop เดียวคือ `bidHistory` (BidDTO[]) เท่านั้น — ห้ามรับ/แสดง
 * reservePrice/expectedPrice/gauge/เส้นเป้าใด ๆ (Controller OQ sign-off 2026-07-01)
 *
 * Base: theme/vuexy/typescript-version/full-version/src/views/pages/widget-examples/statistics/LineAreaDailySalesChart.tsx
 *   - dynamic import AppReactApexCharts + sparkline:true + gradient area fill (ตัด CardHeader/CardContent
 *     เนื้อหาเดิมออก เหลือแค่โครง chart + heading เล็ก ๆ)
 * ผ่าน wrapper: src/libs/styles/AppReactApexCharts.tsx + src/libs/ApexCharts.tsx (ตาม theme mapping — ไม่ import react-apexcharts ตรง)
 */
import dynamic from 'next/dynamic'

import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import { useTheme } from '@mui/material/styles'

import type { ApexOptions } from 'apexcharts'

import type { BidDTO } from '@/services/auction.service'

const AppReactApexCharts = dynamic(() => import('@/libs/styles/AppReactApexCharts'), { ssr: false })

type Props = {
  bidHistory: BidDTO[]
}

export default function AuctionPriceChart({ bidHistory }: Props) {
  const theme = useTheme()

  // bidHistory มาจาก service เรียง createdAt desc (ล่าสุดก่อน) — กลับเป็น ascending สำหรับ sparkline
  const ascending = [...bidHistory].reverse()

  if (ascending.length === 0) {
    return (
      <Box
        sx={{
          borderRadius: '12px',
          boxShadow: '0 1px 2px rgba(15,23,42,.06)',
          bgcolor: '#fff',
          px: '16px',
          py: '20px',
          textAlign: 'center',
        }}
      >
        <Typography sx={{ fontSize: 12.5, color: '#94A3B8' }}>ยังไม่มีข้อมูลราคา — รอผู้เสนอราคาคนแรก</Typography>
      </Box>
    )
  }

  const series = [{ data: ascending.map((b) => b.amount) }]

  const options: ApexOptions = {
    chart: {
      parentHeightOffset: 0,
      toolbar: { show: false },
      sparkline: { enabled: true },
    },
    tooltip: {
      enabled: true,
      y: { formatter: (val: number) => `฿${val.toLocaleString()}` },
    },
    dataLabels: { enabled: false },
    stroke: { width: 2, curve: 'smooth' },
    grid: { show: false, padding: { bottom: 10 } },
    fill: {
      type: 'gradient',
      gradient: {
        opacityTo: 0,
        opacityFrom: 0.4,
        shadeIntensity: 1,
        stops: [0, 100],
        colorStops: [
          [
            { offset: 0, opacity: 0.4, color: theme.palette.primary.main },
            { opacity: 0, offset: 100, color: 'var(--mui-palette-background-paper)' },
          ],
        ],
      },
    },
    theme: {
      monochrome: { enabled: true, shadeTo: 'light', shadeIntensity: 1, color: theme.palette.primary.main },
    },
    xaxis: { labels: { show: false }, axisTicks: { show: false }, axisBorder: { show: false } },
    yaxis: { show: false },
  }

  return (
    <Box sx={{ borderRadius: '12px', boxShadow: '0 1px 2px rgba(15,23,42,.06)', bgcolor: '#fff', px: '16px', pt: '14px' }}>
      <Typography sx={{ fontSize: 10, letterSpacing: '0.13em', textTransform: 'uppercase', color: '#94A3B8' }}>
        แนวโน้มราคา
      </Typography>
      <AppReactApexCharts type='area' height={80} width='100%' series={series} options={options} />
    </Box>
  )
}
