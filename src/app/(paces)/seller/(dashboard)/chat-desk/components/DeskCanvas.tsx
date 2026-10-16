'use client'

// ทางเข้าเดียวของฉาก 3D — three/R3F อยู่ใน chunk แยก โหลดเฉพาะหน้านี้ (ห้าม import ./scene/* แบบ static: เทส chat-desk-scene-imports)
import dynamic from 'next/dynamic'
import type { DeskCanvasProps } from '@/lib/chat-desk/types'

const DeskScene = dynamic(() => import('./scene/DeskScene'), {
  ssr: false,
  loading: () => <div role="status" className="grid size-full place-items-center text-sm text-default-700">กำลังโหลดฉาก 3D</div>,
})

export default function DeskCanvas(props: DeskCanvasProps) {
  return <DeskScene {...props} />
}
