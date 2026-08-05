'use client'

/**
 * ProvinceSalesMap — การ์ด "ยอดขายตามจังหวัด" (แผนที่ไทยไล่สีตามยอด + อันดับจังหวัด)
 *
 * Base (โครงการ์ด): theme/paces/Admin/TS/src/app/(admin)/dashboard/ecommerce/components/RevenueByLocation.tsx
 *   — .card/.card-header/.card-title + แผนที่ด้านหนึ่ง อันดับพร้อมจุดสีอีกด้าน + กล่องสรุปเส้นประด้านบน
 * Base (แผนที่): theme/paces/Admin/TS/src/app/(admin)/charts/echart/geo-map/components/UsaMap.tsx
 *   — fetch geojson จาก /data → registerMap → <EChart extensions={[MapChart, GeoComponent, ...]}>
 *
 * [ทำไมไฟล์นี้อยู่ใน components/safepay ไม่ใช่ในโฟลเดอร์ route ของแดชบอร์ด]
 * ธีมวาดการ์ดนี้ด้วย jsvectormap แต่ jsvectormap ที่ลงไว้ไม่มีแผนที่ไทย (มีแค่ world/us/canada/
 * iraq/italy/russia/spain) และรับ GeoJSON ตรง ๆ ไม่ได้ ต้องแปลงเป็นฟอร์แมตของตัวเองก่อน
 * user เคาะ 2026-08-05 ให้ใช้ ECharts geo แทน เพราะกิน GeoJSON ตรง ๆ และได้ไล่สีตามยอด (visualMap)
 * กับ tooltip มาในตัว. การ import registerMap ต้องมาจาก 'echarts' ซึ่ง grep gate ของ Hard Rule 10
 * ห้ามไว้ใต้ src/app/(paces)/ — ไฟล์จึงอยู่ที่นี่ (precedent เดียวกับ FilterDropdown) และยังวาดผ่าน
 * wrapper @/components/wrappers/EChart ตามเจตนาของกฎทุกประการ
 *
 * แผนที่: public/data/thailand-provinces.json — 77 จังหวัด, properties.name เป็นชื่อไทยที่สะกดตรงกับ
 * PROVINCES ใน src/lib/parse-order-message.ts จึงจับคู่กับข้อมูลได้โดยไม่ต้องแปลงชื่อตอน runtime
 */

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import EChart from '@/components/wrappers/EChart'
import Icon from '@/components/wrappers/Icon'
import { getColor } from '@/utils/helpers'
import { type EChartsOption, registerMap } from 'echarts'
import { MapChart } from 'echarts/charts'
import { GeoComponent, TooltipComponent, VisualMapComponent } from 'echarts/components'
import { CanvasRenderer } from 'echarts/renderers'
import type { ProvinceSales } from '@/services/dashboard.service'

const MAP_NAME = 'thailand-provinces'

const formatThb = (n: number) =>
  new Intl.NumberFormat('th-TH', { style: 'currency', currency: 'THB', maximumFractionDigits: 0 }).format(n)

type Props = ProvinceSales & {
  /** ช่วงเวลาที่ข้อมูลชุดนี้ครอบ ("วันนี้"/"เดือนนี้") — ตาม filter ระดับหน้าของแดชบอร์ด */
  rangeLabel: string
}

const ProvinceSalesMap = ({ rows, shippedRevenue, provinceCount, unknownCount, rangeLabel }: Props) => {
  const [mapReady, setMapReady] = useState(false)
  const [mapFailed, setMapFailed] = useState(false)

  useEffect(() => {
    let cancelled = false
    fetch('/data/thailand-provinces.json')
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        return res.json()
      })
      .then((geoJson) => {
        if (cancelled) return
        registerMap(MAP_NAME, geoJson)
        setMapReady(true)
      })
      .catch((e) => {
        // ไฟล์แผนที่โหลดไม่ได้ = เสียแค่ภาพ ไม่ใช่เสียข้อมูล → ยังโชว์อันดับจังหวัดต่อได้
        console.error('[ProvinceSalesMap] โหลดไฟล์แผนที่ไม่สำเร็จ', e)
        if (!cancelled) setMapFailed(true)
      })
    return () => {
      cancelled = true
    }
  }, [])

  const maxRevenue = rows.reduce((m, r) => Math.max(m, r.revenue), 0)

  const getOptions = useCallback((): EChartsOption => {
    return {
      tooltip: {
        trigger: 'item',
        padding: [7, 10],
        backgroundColor: getColor('secondary-bg'),
        borderColor: getColor('border-color'),
        borderWidth: 1,
        textStyle: { color: getColor('light-text-emphasis') },
        transitionDuration: 0,
        formatter: (p: unknown) => {
          const { name, value } = p as { name: string; value?: number }
          const row = rows.find((r) => r.province === name)
          if (!row) return `${name}<br/>ยังไม่มีคำสั่งซื้อ`
          return `${name}<br/>${formatThb(typeof value === 'number' && !Number.isNaN(value) ? value : row.revenue)} · ${row.orderCount.toLocaleString('th-TH')} ออเดอร์`
        },
      },
      textStyle: { fontFamily: getComputedStyle(document.body).fontFamily },
      visualMap: {
        min: 0,
        // กันกรณีทุกจังหวัดยอด 0 (มีออเดอร์แต่ยังไม่มีใบไหนนับเป็นยอดขาย) — max ต้องไม่เท่า min
        max: maxRevenue > 0 ? maxRevenue : 1,
        left: 'left',
        bottom: 0,
        orient: 'horizontal',
        itemWidth: 10,
        itemHeight: 70,
        text: ['มาก', 'น้อย'],
        textStyle: { color: getColor('light-text-emphasis'), fontSize: 11 },
        // ไล่ "ความเข้ม" ของสีเดียว ไม่สลับเฉด (docs/conventions/contrast-fix-keeps-hue.md)
        inRange: { color: [getColor('chart-primary', 0.12), getColor('chart-primary')] },
        calculable: false,
        showLabel: false,
        formatter: (v: unknown) => formatThb(Number(v)),
      },
      series: [
        {
          name: 'ยอดขายตามจังหวัด',
          type: 'map',
          map: MAP_NAME,
          roam: false,
          // จังหวัดที่ยังไม่มีออเดอร์ต้องยังเห็นรูปร่างอยู่ ไม่ใช่หายไปเป็นพื้นขาว
          itemStyle: { areaColor: getColor('chart-border'), borderColor: getColor('secondary-bg'), borderWidth: 0.6 },
          emphasis: {
            label: { show: false },
            itemStyle: { areaColor: getColor('chart-alpha') },
          },
          select: { disabled: true },
          data: rows.map((r) => ({ name: r.province, value: r.revenue })),
        },
      ],
    }
  }, [rows, maxRevenue])

  return (
    <div className="card h-full">
      <div className="card-header">
        <h4 className="card-title">ยอดขายตามจังหวัด</h4>
        <span className="badge bg-default-100 text-default-700 text-xs">{rangeLabel}</span>
      </div>

      <div className="card-body">
        <div className="flex flex-wrap gap-6">
          {/* แผนที่ — ประเทศไทยเป็นทรงแนวตั้ง กล่องจึงสูงกว่ากว้าง */}
          <div className="w-full max-w-72 shrink-0 grow sm:w-72">
            {mapFailed ? (
              <div className="flex h-80 flex-col items-center justify-center gap-2 rounded bg-default-100 text-center">
                <Icon icon="map-off" className="text-2xl text-default-400" />
                <p className="text-xs text-default-500">แสดงแผนที่ไม่ได้ในตอนนี้</p>
              </div>
            ) : mapReady ? (
              <EChart
                extensions={[MapChart, GeoComponent, TooltipComponent, VisualMapComponent, CanvasRenderer]}
                getOptions={getOptions}
                style={{ height: '340px' }}
              />
            ) : (
              // ที่ว่างสูงเท่าแผนที่จริง — กันการ์ดกระตุกตอนแผนที่โหลดเสร็จ
              <div className="h-80 animate-pulse rounded bg-default-100" />
            )}
          </div>

          {/* สรุป + อันดับจังหวัด */}
          <div className="min-w-64 grow">
            <div className="mb-4 flex flex-wrap items-center gap-3 rounded border border-dashed border-default-300 p-3">
              <span className="flex size-12 items-center justify-center rounded-full bg-warning/15 text-warning">
                <Icon icon="map-pin" className="text-2xl" />
              </span>
              <div>
                <h5 className="text-sm font-semibold">ส่งไป {provinceCount.toLocaleString('th-TH')} จังหวัดใน{rangeLabel}</h5>
                <p className="text-xs text-default-500">นับเฉพาะคำสั่งซื้อที่มีการจัดส่ง</p>
              </div>
              <div className="ms-auto text-end">
                <h4 className="text-base font-semibold">{formatThb(shippedRevenue)}</h4>
                <span className="text-xs text-default-500">รายได้จากการจัดส่ง</span>
              </div>
            </div>

            {rows.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-2 py-8 text-center">
                <span className="flex size-12 items-center justify-center rounded-full bg-default-100 text-default-400">
                  <Icon icon="truck-delivery" className="text-2xl" />
                </span>
                <p className="text-sm font-semibold">{rangeLabel}ยังไม่มีคำสั่งซื้อที่จัดส่ง</p>
                <p className="text-xs text-default-500">เมื่อมีการจัดส่ง จังหวัดปลายทางจะขึ้นที่นี่</p>
              </div>
            ) : (
              <div>
                {rows.slice(0, 5).map((r) => (
                  <div className="flex items-center gap-2.5 py-2 not-last:border-b not-last:border-dashed not-last:border-default-300" key={r.province}>
                    <span
                      className="inline-block size-2.5 shrink-0 rounded-full"
                      style={{
                        // ความเข้มตามสัดส่วนของจังหวัดอันดับหนึ่ง — จุดสีจึงเล่าเรื่องเดียวกับแผนที่
                        backgroundColor: getColor(
                          'chart-primary',
                          maxRevenue > 0 ? Math.max(0.2, r.revenue / maxRevenue) : 1,
                        ),
                      }}
                      aria-hidden="true"
                    />
                    <span className="truncate text-sm">{r.province}</span>
                    <span className="ms-auto text-end text-sm whitespace-nowrap">
                      <span className="font-semibold">{formatThb(r.revenue)}</span>{' '}
                      <span className="text-xs text-default-500">{r.orderCount.toLocaleString('th-TH')} ออเดอร์</span>
                    </span>
                  </div>
                ))}

                {unknownCount > 0 && (
                  // ต้องบอกตรง ๆ ว่ามีใบที่ยังจับจังหวัดไม่ได้ ไม่งั้นผลรวมบนการ์ดจะไม่ตรงกับที่ร้านนับเอง
                  // แล้วดูเหมือนระบบคำนวณผิด ทั้งที่คือที่อยู่ยังกรอกไม่ครบ
                  <div className="flex items-center gap-2.5 border-t border-dashed border-default-300 py-2">
                    <Icon icon="map-pin-off" className="text-default-400" />
                    <span className="text-xs text-default-500">
                      อีก {unknownCount.toLocaleString('th-TH')} คำสั่งซื้อยังไม่ระบุจังหวัด
                    </span>
                    <Link href="/orders?stage=AWAITING_PARCEL" className="ms-auto text-primary text-xs whitespace-nowrap">
                      เติมที่อยู่ ›
                    </Link>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

export default ProvinceSalesMap
