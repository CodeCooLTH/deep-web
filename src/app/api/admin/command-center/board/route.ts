import { NextResponse } from "next/server"
import { requireAdmin } from "@/lib/auth"
import { listBoard } from "@/services/command-center.service"
import { mapCommandCenterError } from "../_shared"

// GET /api/admin/command-center/board — บอร์ด 7 คอลัมน์ (TFR-CC-13)

export async function GET() {
  // 🛑 TD-005: เช็คเอง ไม่พึ่ง (dashboard)/layout.tsx — layout ครอบเฉพาะ RSC page
  //    API route เป็นคนละ request pipeline ไม่ผ่าน layout tree เลย
  const admin = await requireAdmin()
  if (!admin) return NextResponse.json({ error: "ไม่มีสิทธิ์เข้าถึง" }, { status: 403 })

  try {
    const board = await listBoard()
    // โควตาหมดแต่มี cache → 200 + degraded:true (ไม่ใช่ error HTTP) — service จับให้แล้ว
    return NextResponse.json(board, {
      // ข้อมูลนี้เปลี่ยนทุกไม่กี่วินาที และผูกกับ session — ห้ามให้ใครแคชแทน
      headers: { "cache-control": "no-store" },
    })
  } catch (err) {
    return mapCommandCenterError(err, "GET")
  }
}
