// geo/reverse — server-side Nominatim reverse-geocode proxy (feature 00001 step 3)
// กัน CORS + ใส่ User-Agent ตาม OSM policy + cache (globalThis) + timeout 5s + degrade
// คืน 200 { province: null } เสมอเมื่อ Nominatim ล่ม (ให้ client degrade gracefully)
// Trace: SRS TFR-010 / API.md §4.4 / OD-1, OD-2
import { NextRequest, NextResponse } from "next/server";
import * as v from "valibot";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { GeoReverseSchema } from "@/lib/validations";

// in-process cache (per serverless instance — best-effort; Redis = Phase 2)
// key = lat,lng round 3 ทศนิยม (~111m); TTL ยาว (geo data stable)
const g = globalThis as unknown as { __geoCache?: Map<string, string | null> };
const geoCache = (g.__geoCache ??= new Map<string, string | null>());

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const parsed = v.safeParse(GeoReverseSchema, await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "ข้อมูลไม่ถูกต้อง" }, { status: 400 });
  const { lat, lng } = parsed.output;

  const key = `${lat.toFixed(3)},${lng.toFixed(3)}`;
  if (geoCache.has(key)) return NextResponse.json({ province: geoCache.get(key) ?? null });

  const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}&accept-language=th`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { "User-Agent": "deep-platform/1.0 shinobu22@outlook.com" },
    });
    if (!res.ok) return NextResponse.json({ province: null, error: "upstream_error" });
    const data = (await res.json()) as { address?: { state?: string; province?: string } };
    const province = data.address?.state ?? data.address?.province ?? null;
    geoCache.set(key, province);
    return NextResponse.json({ province });
  } catch (e) {
    const reason = e instanceof Error && e.name === "AbortError" ? "timeout" : "upstream_error";
    return NextResponse.json({ province: null, error: reason });
  } finally {
    clearTimeout(timeout);
  }
}
