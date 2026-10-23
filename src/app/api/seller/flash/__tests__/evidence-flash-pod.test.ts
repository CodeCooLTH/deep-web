// feature 00084 §4.21 — shipment-evidence: flash_pod ถูกปั้นด้วย whitelist · แถวอื่นไม่เปลี่ยนและไม่รั่ว parcel
import { describe, it, expect, vi } from "vitest";
import { NextRequest } from "next/server";

const { findMany } = vi.hoisted(() => ({ findMany: vi.fn() }));
vi.mock("next-auth", () => ({ getServerSession: async () => ({ user: { id: "u1" } }) }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/session-user", () => ({ sessionUserId: () => "u1" }));
vi.mock("@/lib/shop-capability", () => ({ canAccessShopWith: async () => true }));
vi.mock("@/lib/prisma", () => ({
  prisma: { order: { findUnique: async () => ({ id: "o1", shopId: "sh1" }) }, shipmentEvidence: { findMany } },
}));

import { GET } from "@/app/api/orders/[token]/shipment-evidence/route";

const base = { capturedAt: new Date("2026-10-20T00:00:00Z"), error: null };

describe("shipment-evidence flash_pod", () => {
  it("flash_pod → reasonText Flash · traces [] · pod เฉพาะ whitelist (ช่องแปลกปลอมใน parcel ไม่หลุด)", async () => {
    findMany.mockResolvedValue([
      { ...base, id: "e1", reason: "flash_pod", traceCount: 0, traces: null,
        parcel: { kind: "FLASH_POD", signer: "สมชาย", signerTypeText: "ผู้รับ", podUrl: "https://p/x.png", photos: ["https://p/1.jpg", 5],
          lat: 13.7, lng: 100.5, stateDate: "2026-10-19", receiverPhone: "0812345678", secret: "x" } },
      { ...base, id: "e2", reason: "delivered", traceCount: 1, traces: [{ status: "a", timestamp: 1 }], parcel: { receiverPhone: "0812345678" } },
    ]);
    const res = await GET(new NextRequest("http://x.test/e"), { params: Promise.resolve({ token: "tok" }) });
    const { evidence } = await res.json();
    expect(evidence[0]).toMatchObject({ reason: "flash_pod", reasonText: "หลักฐานการส่ง (Flash)", traces: [] });
    expect(evidence[0].pod).toEqual({
      signer: "สมชาย", signerTypeText: "ผู้รับ", podUrl: "https://p/x.png", photos: ["https://p/1.jpg"],
      lat: 13.7, lng: 100.5, deliveredAt: "2026-10-19",
    });
    expect(JSON.stringify(evidence)).not.toContain("0812345678");
    expect(evidence[1]).not.toHaveProperty("pod");
    expect(evidence[1].traces).toHaveLength(1);
    expect(findMany.mock.calls[0][0].select.parcel).toBe(true);
  });
  it("L2: podUrl/photos ที่ไม่ใช่ https ถูกตัด (javascript:/data:/http)", async () => {
    findMany.mockResolvedValue([
      { ...base, id: "e4", reason: "flash_pod", traceCount: 0, traces: null,
        parcel: { podUrl: "javascript:alert(1)", photos: ["http://p/1.jpg", "data:text/html,x", "https://p/ok.jpg"] } },
    ]);
    const { evidence } = await (await GET(new NextRequest("http://x.test/e"), { params: Promise.resolve({ token: "t" }) })).json();
    expect(evidence[0].pod.podUrl).toBeNull();
    expect(evidence[0].pod.photos).toEqual(["https://p/ok.jpg"]);
  });
  it("flash_pod ที่ parcel ว่าง (แถว error) → pod ช่องเป็น null/[] ไม่ throw", async () => {
    findMany.mockResolvedValue([{ ...base, id: "e3", reason: "flash_pod", traceCount: 0, traces: null, parcel: null, error: "x" }]);
    const { evidence } = await (await GET(new NextRequest("http://x.test/e"), { params: Promise.resolve({ token: "t" }) })).json();
    expect(evidence[0].pod).toMatchObject({ signer: null, photos: [], lat: null });
  });
});
