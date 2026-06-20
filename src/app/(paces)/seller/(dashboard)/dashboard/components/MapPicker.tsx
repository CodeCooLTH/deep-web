/**
 * MapPicker — feature 00001 onboarding step 3
 *
 * Custom Leaflet map สำหรับปักพิกัดร้าน ไม่มี Paces primitive สำหรับ map widget
 * parent (OnboardingModal) จะครอบด้วย Paces .card เอง
 *
 * ⚠️ ต้อง import แบบ dynamic ssr:false จาก parent เพราะ Leaflet ใช้ window:
 *   const MapPicker = dynamic(() => import('./MapPicker'), { ssr: false })
 *
 * Base: N/A — custom Leaflet widget (ไม่มี Paces theme equivalent)
 */

'use client'

import 'leaflet/dist/leaflet.css'

import { useEffect, useRef } from 'react'
import type { Map as LeafletMap, Marker as LeafletMarker, LeafletMouseEvent } from 'leaflet'

export interface MapPickerProps {
  initialLat?: number | null
  initialLng?: number | null
  onLocationChange: (lat: number, lng: number) => void
}

// พิกัด default ตรงกลางประเทศไทย
const THAILAND_CENTER: [number, number] = [13.0, 101.0]
const DEFAULT_ZOOM = 6
const SELECTED_ZOOM = 13

// CDN URLs สำหรับ Leaflet default marker icon
// ต้องใช้ CDN เพราะ bundler (Webpack/Turbopack) ทำให้ path ใน node_modules เพี้ยน
const ICON_URL = 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png'
const ICON_2X_URL = 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png'
const SHADOW_URL = 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png'

export default function MapPicker({ initialLat, initialLng, onLocationChange }: MapPickerProps) {
  // ref สำหรับ container div ที่ Leaflet จะ mount เข้า
  const mapRef = useRef<HTMLDivElement>(null)
  // เก็บ instance ไว้เพื่อ cleanup ใน return
  const mapInstanceRef = useRef<LeafletMap | null>(null)
  const markerRef = useRef<LeafletMarker | null>(null)

  useEffect(() => {
    if (!mapRef.current) return
    // กัน double-mount (React StrictMode / HMR)
    if (mapInstanceRef.current) return

    // dynamic import ภายใน effect — parent dynamic ssr:false รับประกันว่า
    // code นี้รันเฉพาะ client เท่านั้น จึง import ตรงได้อย่างปลอดภัย
    import('leaflet').then((L) => {
      if (!mapRef.current) return

      // แก้ Leaflet default marker icon bug ใน bundler:
      // Leaflet detect path จาก <script> tag ซึ่งไม่มีใน bundler environment
      // แก้ด้วย override mergeOptions ของ Icon.Default ให้ชี้ CDN โดยตรง
      L.Icon.Default.mergeOptions({
        iconUrl: ICON_URL,
        iconRetinaUrl: ICON_2X_URL,
        shadowUrl: SHADOW_URL,
      })

      const hasInitial = initialLat != null && initialLng != null
      const center: [number, number] = hasInitial
        ? [initialLat as number, initialLng as number]
        : THAILAND_CENTER
      const zoom = hasInitial ? SELECTED_ZOOM : DEFAULT_ZOOM

      const map = L.map(mapRef.current, {
        center,
        zoom,
      })

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors',
        maxZoom: 19,
      }).addTo(map)

      // วาง marker เริ่มต้นถ้ามีพิกัด
      if (hasInitial) {
        const m = L.marker([initialLat as number, initialLng as number], { draggable: true })
        m.addTo(map)

        // ลาก marker → อัปเดตตำแหน่ง
        m.on('dragend', () => {
          const pos = m.getLatLng()
          onLocationChange(pos.lat, pos.lng)
        })

        markerRef.current = m
      }

      // คลิกบนแผนที่ → ย้าย marker (หรือสร้างใหม่ถ้ายังไม่มี) + callback
      map.on('click', (e: LeafletMouseEvent) => {
        const { lat, lng } = e.latlng

        if (markerRef.current) {
          markerRef.current.setLatLng([lat, lng])
        } else {
          const m = L.marker([lat, lng], { draggable: true })
          m.addTo(map)

          m.on('dragend', () => {
            const pos = m.getLatLng()
            onLocationChange(pos.lat, pos.lng)
          })

          markerRef.current = m
        }

        onLocationChange(lat, lng)
      })

      mapInstanceRef.current = map
    })

    return () => {
      // cleanup เมื่อ component unmount — สำคัญ: ถ้าไม่ remove จะ leak instance
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove()
        mapInstanceRef.current = null
        markerRef.current = null
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    // intentionally omit deps — effect รันครั้งเดียวตอน mount; initialLat/Lng
    // เป็น "initial" ตามชื่อ prop (controlled โดย parent ส่ง onLocationChange)
  }, [])

  return (
    // height ใช้ inline style เพราะ Leaflet ต้องการ explicit pixel height
    // (CSS height:auto หรือ % บน container ที่ไม่มี explicit parent height = map แสดงขนาด 0)
    <div ref={mapRef} style={{ height: '300px' }} className="w-full rounded-lg overflow-hidden" />
  )
}
