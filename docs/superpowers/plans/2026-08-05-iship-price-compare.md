# เปรียบเทียบราคาขนส่ง iShip — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ปุ่มเดียวใน modal สร้างพัสดุ iShip เห็นราคาทุกขนส่งของร้านเทียบกัน เรียงถูก→แพง แล้วเลือกขนส่งจากราคาได้เลย

**Architecture:** endpoint ใหม่ `POST /api/seller/iship/price/compare` ยิงครั้งเดียว → service fan-out `checkPrice` ทุกขนส่งด้วย `Promise.allSettled` (ตัวที่พังเข้า `failed[]` ไม่ล้มทั้งชุด) → UI เป็น "view swap" ภายใน modal เดิม (ไม่ใช่ portal/overlay ใหม่ — กันปัญหา transform/z-index ใน Chat Rail และ Preline-in-hidden-modal)

**Tech Stack:** Next.js 16 App Router, Valibot, Vitest, Paces (Preline+Tailwind 4), `@iconify/react`

**Spec:** `docs/superpowers/specs/2026-08-05-iship-price-compare-design.md` + mockup `.html` คู่กัน (user อนุมัติแล้ว)

## Global Constraints

- Hard Rule 7: `(paces)/**` + component ที่ใช้ในนั้น ห้าม arbitrary Tailwind value (`text-[..]`/`bg-[rgba..]`/hex)
- Hard Rule 8: ก่อนแตะ UI ต้องผ่าน `safepay-ux` Design Spec ก่อน (Task 6) และหลัง build รัน `/impeccable critique` + `/impeccable clarify`
- Hard Rule 9: toast ใน component นี้ = `pacesToast` เท่านั้น (แผนนี้ไม่ใช้ toast — error แสดงใน sheet)
- Hard Rule 12: ห้าม emoji — icon ผ่าน `@iconify/react` tabler เท่านั้น
- BR-ISHIP-31: ตำบล → ช่อง `district`, อำเภอ → ช่อง `amphure` (กลับหัวกับชื่อ field ของ iShip) — mapping อยู่ที่เดียวใน `mapping.ts`
- convention `external-payload-schema`: field จาก iShip เป็น optional ทั้งหมด ยกเว้น field ที่ตัดสินความหมาย (`total_price`)
- ห้าม `prisma db pull` / migrate ใด ๆ (งานนี้ไม่มี schema change)
- commit แตะ UI ต้องมี `Base:` line (UI ใหม่ยึดโครงจาก `ShipmentCreateForm.tsx` เดิมซึ่งมี Base จาก theme แล้ว + mockup ที่อนุมัติ)
- ทดสอบ: `node node_modules/vitest/vitest.mjs run <file>` และ tsc ด้วย `node node_modules/typescript/lib/tsc.js --noEmit`
- เวิร์กทรีนี้แชร์กับอีก session — commit เฉพาะไฟล์ของงานนี้ ห้าม `git add -A`, ห้าม push

---

### Task 1: Smoke test check-price กับบัญชีจริง — lock response schema

**Files:**
- Modify (ถ้าจำเป็น): `src/lib/iship/client.ts:64-74` (`IShipPrice`)

**Interfaces:**
- Produces: รายการ field จริงของ response `check-price` — ตัดสินว่าการ์ดมีคอลัมน์ "ค่าขนส่ง(ปริมาตร)" / "พื้นที่ท่องเที่ยว" ไหม

- [ ] **Step 1: หา token จริงจาก dev DB (อ่านอย่างเดียว)**

```bash
# dev DB = Docker localhost:5434 (แยกจาก prod แล้ว) — SELECT เท่านั้น
psql "postgresql://postgres:postgres@localhost:5434/safepay" -c \
  "SELECT \"shopId\", \"baseUrl\", left(token, 8) || '…' AS tok, \"tokenInvalidAt\" FROM \"ShopShippingAccount\" WHERE token IS NOT NULL LIMIT 5;"
```

ถ้าไม่มีแถวเลย → ข้าม Step 2-3, บันทึกใน progress ว่า smoke test เป็น carry (ต้องทำก่อน merge) แล้วทำ Task ถัดไปด้วย 3 คอลัมน์ตาม mockup

- [ ] **Step 2: ยิง check-price ตรง 1 ครั้งด้วย token นั้น** (check-price ฟรี ไม่ก่อค่าใช้จ่าย)

```bash
TOKEN=$(psql "postgresql://postgres:postgres@localhost:5434/safepay" -tA -c \
  "SELECT token FROM \"ShopShippingAccount\" WHERE token IS NOT NULL AND \"tokenInvalidAt\" IS NULL LIMIT 1;")
curl -sS "https://app.iship.cloud/api/v2/check-price" \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"courier_code":"FlashExpressA","src_zipcode":"10220","src_province":"กรุงเทพ","src_amphure":"สายไหม","src_district":"สายไหม","dst_zipcode":"58140","dst_province":"แม่ฮ่องสอน","dst_amphure":"ขุนยวม","dst_district":"ขุนยวม","weight":"1","width":"14","length":"20","height":"6"}' | python3 -m json.tool
```

- [ ] **Step 3: บันทึกรายการ field ทั้งหมดที่ได้** — ถ้ามี field ปริมาตร/พื้นที่ท่องเที่ยว (ชื่อจริงตามที่ตอบมา) → เพิ่มใน `IShipPrice` เป็น `?: number` optional + คอลัมน์ในการ์ด (Task 7); ถ้าไม่มี → จบที่ 3 คอลัมน์

- [ ] **Step 4: Commit (เฉพาะเมื่อแก้ `client.ts`)**

```bash
git add src/lib/iship/client.ts
git commit -m "chore(00022-ext): เติม field response ของ check-price ตามที่ smoke test บัญชีจริงยืนยัน"
```

---

### Task 2: `buildCheckPricePayload` ใน mapping.ts + refactor `estimateShippingPrice`

**Files:**
- Modify: `src/lib/iship/mapping.ts` (วางถัดจาก `buildCreateOrderPayload`)
- Modify: `src/lib/iship/mapping.test.ts`
- Modify: `src/services/iship.service.ts:1668-1735` (`estimateShippingPrice`)

**Interfaces:**
- Consumes: `SenderAddress`, `normalizeProvince` (มีอยู่แล้วใน mapping.ts)
- Produces:
  ```ts
  export interface CheckPriceDims { weight: number; width: number; length: number; height: number }
  export function buildCheckPricePayload(
    sender: SenderAddress,
    receiver: { subdistrict?: string | null; district?: string | null; province?: string | null; postcode?: string | null },
    dims: CheckPriceDims,
  ): Omit<Parameters<typeof import("./client").checkPrice>[1], "courier_code">
  ```

- [ ] **Step 1: เขียนเทส (fail ก่อน) ใน `mapping.test.ts`** — ชุด "ตำบล/อำเภอ ต้องต่างกันเสมอ" ตามธรรมเนียมไฟล์นี้

```ts
describe("buildCheckPricePayload — คู่ตำบล/อำเภอ (BR-ISHIP-31)", () => {
  const sender = {
    name: "ร้าน", phone: "0812345678", line1: "1/1",
    subdistrict: "ออเงิน", district: "สายไหม", province: "กรุงเทพมหานคร", postcode: "10220",
  };
  const receiver = { subdistrict: "ควนรู", district: "รัตภูมิ", province: "สงขลา", postcode: "90220" };
  const dims = { weight: 1.25, width: 14, length: 20, height: 6 };

  it("ตำบลเข้า district และอำเภอเข้า amphure ทั้งขา src และ dst — ไม่สลับ", () => {
    const p = buildCheckPricePayload(sender, receiver, dims);
    expect(p.src_district).toBe("ออเงิน");
    expect(p.src_amphure).toBe("สายไหม");
    expect(p.dst_district).toBe("ควนรู");
    expect(p.dst_amphure).toBe("รัตภูมิ");
  });

  it("จังหวัดผ่าน normalizeProvince (กรุงเทพมหานคร → กรุงเทพ)", () => {
    const p = buildCheckPricePayload(sender, receiver, dims);
    expect(p.src_province).toBe("กรุงเทพ");
    expect(p.dst_province).toBe("สงขลา");
  });

  it("ค่าว่าง/null กลายเป็นสตริงว่าง ไม่ใช่ 'null'", () => {
    const p = buildCheckPricePayload(sender, { ...receiver, subdistrict: null }, dims);
    expect(p.dst_district).toBe("");
  });

  it("ขนาด/น้ำหนักส่งผ่านตามตัวเลขเดิม", () => {
    const p = buildCheckPricePayload(sender, receiver, dims);
    expect(p.weight).toBe(1.25);
    expect(p.width).toBe(14);
    expect(p.length).toBe(20);
    expect(p.height).toBe(6);
  });
});
```

- [ ] **Step 2: รันให้เห็น fail** — `node node_modules/vitest/vitest.mjs run src/lib/iship/mapping.test.ts` → FAIL (ยังไม่มีฟังก์ชัน)

- [ ] **Step 3: implement ใน `mapping.ts`**

```ts
export interface CheckPriceDims {
  weight: number;
  width: number;
  length: number;
  height: number;
}

/**
 * payload ของ check-price (ไม่รวม courier_code — ผู้เรียกเติมเองต่อขนส่ง)
 *
 * BR-ISHIP-31: ตำบล → district, อำเภอ → amphure (กลับหัวกับชื่อช่องของ iShip) —
 * เดิม mapping ชุดนี้เขียนซ้ำใน estimateShippingPrice; ย้ายมารวมที่นี่ให้
 * compare กับ estimate ใช้ตัวเดียวกัน
 */
export function buildCheckPricePayload(
  sender: SenderAddress,
  receiver: {
    subdistrict?: string | null;
    district?: string | null;
    province?: string | null;
    postcode?: string | null;
  },
  dims: CheckPriceDims,
) {
  return {
    src_zipcode: sender.postcode ?? "",
    src_province: normalizeProvince(sender.province),
    src_amphure: sender.district ?? "",
    src_district: sender.subdistrict ?? "",
    dst_zipcode: receiver.postcode ?? "",
    dst_province: normalizeProvince(receiver.province),
    dst_amphure: receiver.district ?? "",
    dst_district: receiver.subdistrict ?? "",
    weight: dims.weight,
    width: dims.width,
    length: dims.length,
    height: dims.height,
  };
}
```

- [ ] **Step 4: รันเทสให้ผ่าน** — ไฟล์เดิมทั้งไฟล์ต้องเขียวด้วย

- [ ] **Step 5: refactor `estimateShippingPrice` ให้เรียก `buildCheckPricePayload`** — แทนก้อน object ใน `iship.checkPrice(token, {...})` ด้วย:

```ts
const price = await withTokenGuard(shopId, () =>
  iship.checkPrice(token, {
    courier_code: input.courierCode,
    ...buildCheckPricePayload(sender, r, {
      weight: input.weight,
      width: input.width,
      length: input.length,
      height: input.height,
    }),
  }),
);
```

(เพิ่ม `buildCheckPricePayload` เข้า import block จาก `@/lib/iship/mapping` ที่หัวไฟล์ service — มี import จากไฟล์นี้อยู่แล้วบรรทัด 37-39)

- [ ] **Step 6: tsc + เทสทั้งชุด iship**

```bash
node node_modules/typescript/lib/tsc.js --noEmit
node node_modules/vitest/vitest.mjs run src/lib/iship/
```

- [ ] **Step 7: Commit**

```bash
git add src/lib/iship/mapping.ts src/lib/iship/mapping.test.ts src/services/iship.service.ts
git commit -m "refactor(00022-ext): รวม mapping payload ของ check-price ไว้ที่เดียว (buildCheckPricePayload)

BR-ISHIP-31 เดิมเขียนซ้ำใน estimateShippingPrice — compare ที่กำลังจะมาต้องใช้ชุดเดียวกัน"
```

---

### Task 3: `assembleCompareResult` — pure logic รวม/เรียงผลเทียบราคา

**Files:**
- Create: `src/lib/iship/compare.ts`
- Create: `src/lib/iship/compare.test.ts`

**Interfaces:**
- Consumes: `IShipCourier`, `IShipPrice` จาก `./client`
- Produces:
  ```ts
  export interface CompareRow {
    courierCode: string; courierName: string;
    totalPrice: number;
    basePrice: number | null; fuelFee: number | null; remoteFee: number | null;
    estimateDays: number | null;
  }
  export interface CompareResult {
    rows: CompareRow[];                                      // เรียง totalPrice น้อย→มาก (stable)
    failed: { courierCode: string; courierName: string }[];
  }
  export function assembleCompareResult(
    couriers: IShipCourier[],
    settled: PromiseSettledResult<IShipPrice>[],
  ): CompareResult
  ```

- [ ] **Step 1: เขียนเทส `compare.test.ts` (fail ก่อน)**

```ts
// ส่วนขยาย feature 00022 — unit test ของการรวมผลเทียบราคาหลายขนส่ง
import { describe, expect, it } from "vitest";
import { assembleCompareResult } from "./compare";
import type { IShipPrice } from "./client";

const price = (over: Partial<IShipPrice>): IShipPrice => ({
  courier_code: "X", weight: 1000, weight_unit: "g",
  remote_area: "0", price: 10, total_price: 10, ...over,
});
const ok = (v: IShipPrice) => ({ status: "fulfilled", value: v }) as const;
const bad = (m: string) => ({ status: "rejected", reason: new Error(m) }) as const;
const couriers = [
  { code: "A", name: "Flash Thunder" },
  { code: "B", name: "SPX Express" },
  { code: "C", name: "KEX Express" },
];

describe("assembleCompareResult", () => {
  it("เรียงราคารวมถูก→แพง และตัวที่ reject เข้า failed พร้อมชื่อ", () => {
    const r = assembleCompareResult(couriers, [
      ok(price({ total_price: 89 })),
      bad("timeout"),
      ok(price({ total_price: 71 })),
    ]);
    expect(r.rows.map((x) => x.courierCode)).toEqual(["C", "A"]);
    expect(r.failed).toEqual([{ courierCode: "B", courierName: "SPX Express" }]);
  });

  it("ราคาเท่ากันคงลำดับตามรายการขนส่งเดิม (stable)", () => {
    const r = assembleCompareResult(couriers, [
      ok(price({ total_price: 50 })),
      ok(price({ total_price: 50 })),
      ok(price({ total_price: 40 })),
    ]);
    expect(r.rows.map((x) => x.courierCode)).toEqual(["C", "A", "B"]);
  });

  it("total_price ไม่ใช่เลข = ถือว่า fail ไม่ใช่การ์ดราคา 0", () => {
    const r = assembleCompareResult(couriers.slice(0, 1), [
      ok(price({ total_price: Number.NaN })),
    ]);
    expect(r.rows).toEqual([]);
    expect(r.failed).toEqual([{ courierCode: "A", courierName: "Flash Thunder" }]);
  });

  it("field ประกอบราคา: ไม่ส่ง/ศูนย์ → null (ช่องแสดง '—'), ส่งมา → ตัวเลข", () => {
    const r = assembleCompareResult(couriers.slice(0, 2), [
      ok(price({ total_price: 71, price: 19, fuel_surcharge_fee: 2, remote_area: "50", estimate_shipping_date: "3" })),
      ok(price({ total_price: 30, price: 30, remote_area: 0 })),
    ]);
    const flash = r.rows.find((x) => x.courierCode === "A")!;
    expect(flash).toMatchObject({ basePrice: 19, fuelFee: 2, remoteFee: 50, estimateDays: 3 });
    const spx = r.rows.find((x) => x.courierCode === "B")!;
    expect(spx).toMatchObject({ basePrice: 30, fuelFee: null, remoteFee: null, estimateDays: null });
  });
});
```

- [ ] **Step 2: รันให้ fail** — `node node_modules/vitest/vitest.mjs run src/lib/iship/compare.test.ts`

- [ ] **Step 3: implement `compare.ts`**

```ts
// ส่วนขยาย feature 00022 — รวมผล check-price หลายขนส่งเป็นรายการเปรียบเทียบ
//
// pure function แยกจาก service เพื่อเทสได้โดยไม่ต้อง mock prisma/client
// (pattern เดียวกับ unlinked.ts) — service เป็นแค่ orchestration บาง ๆ
import type { IShipCourier, IShipPrice } from "./client";

export interface CompareRow {
  courierCode: string;
  courierName: string;
  totalPrice: number;
  /** ค่าส่งพื้นฐาน (ช่อง price) — null = ขนส่งไม่แจกแจง แสดง "—" */
  basePrice: number | null;
  fuelFee: number | null;
  /** ค่าเพิ่มพื้นที่ห่างไกล — null เมื่อ 0/ไม่ส่ง (ไม่ต้องโชว์ ฿0) */
  remoteFee: number | null;
  estimateDays: number | null;
}

export interface CompareResult {
  rows: CompareRow[];
  failed: { courierCode: string; courierName: string }[];
}

const num = (v: unknown): number | null => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
};

/**
 * จับคู่ settled ผลลัพธ์กับรายชื่อขนส่ง (index ตรงกัน) → เรียงราคารวมถูก→แพง
 * ตัวที่ reject หรือราคารวมไม่ใช่เลข = failed — บอกชื่อไว้ให้หน้าจอสรุป ไม่หายเงียบ
 */
export function assembleCompareResult(
  couriers: IShipCourier[],
  settled: PromiseSettledResult<IShipPrice>[],
): CompareResult {
  const rows: CompareRow[] = [];
  const failed: CompareResult["failed"] = [];
  couriers.forEach((c, i) => {
    const s = settled[i];
    const total = s?.status === "fulfilled" ? Number(s.value.total_price) : Number.NaN;
    if (s?.status !== "fulfilled" || !Number.isFinite(total)) {
      failed.push({ courierCode: c.code, courierName: c.name });
      return;
    }
    rows.push({
      courierCode: c.code,
      courierName: c.name,
      totalPrice: total,
      basePrice: num(s.value.price),
      fuelFee: num(s.value.fuel_surcharge_fee),
      remoteFee: num(s.value.remote_area),
      estimateDays: num(s.value.estimate_shipping_date),
    });
  });
  rows.sort((a, b) => a.totalPrice - b.totalPrice); // Array.sort เป็น stable ตามสเปก ES2019
  return { rows, failed };
}
```

- [ ] **Step 4: รันเทสให้ผ่าน + tsc**

- [ ] **Step 5: Commit**

```bash
git add src/lib/iship/compare.ts src/lib/iship/compare.test.ts
git commit -m "feat(00022-ext): assembleCompareResult — รวม/เรียงผลเทียบราคาหลายขนส่ง (pure + tests)"
```

---

### Task 4: Valibot schema + service `compareShippingPrices`

**Files:**
- Modify: `src/lib/validations.ts:1240` (ถัดจาก `IShipPriceQuoteSchema`)
- Modify: `src/services/iship.service.ts` (ถัดจาก `estimateShippingPrice`)

**Interfaces:**
- Consumes: `assembleCompareResult` (Task 3), `buildCheckPricePayload` (Task 2), `loadAccount`/`senderOf`/`findMissingSenderFields`/`withTokenGuard`/`IShipServiceError` (มีอยู่แล้วใน service)
- Produces:
  ```ts
  export const IShipPriceCompareSchema: /* IShipPriceQuoteSchema ตัด courierCode */
  export async function compareShippingPrices(
    shopId: string,
    input: v.InferOutput<typeof IShipPriceCompareSchema>,
  ): Promise<CompareResult>
  ```

- [ ] **Step 1: schema ใน `validations.ts`**

```ts
/** เทียบราคาทุกขนส่ง — input เดียวกับ quote รายตัวแต่ไม่ระบุขนส่ง (server ไล่เอง) */
export const IShipPriceCompareSchema = v.omit(IShipPriceQuoteSchema, ["courierCode"]);
```

- [ ] **Step 2: service `compareShippingPrices` ใน `iship.service.ts`** (วางใต้ `estimateShippingPrice`)

```ts
/**
 * compareShippingPrices — ถามราคา "ทุกขนส่งของร้าน" ในคำขอเดียว (ปุ่มเทียบราคา)
 *
 * ทำไม fan-out ฝั่ง server: ให้ client วนยิง /price ทีละขนส่ง 17 ครั้งจะชน rate-limit
 * ของเราเอง (authenticated 30 req/นาที) — ฝั่งนี้รวมเป็น 1 คำขอ แล้วยิง iShip ขนาน
 * ด้วย allSettled: ขนส่งที่ไม่ตอบถูกตัดเข้า failed[] ไม่ล้มทั้งชุด (check-price ฟรี)
 */
export async function compareShippingPrices(
  shopId: string,
  input: {
    receiver: {
      subdistrict?: string | null;
      district?: string | null;
      province?: string | null;
      postcode?: string | null;
    };
    weight: number;
    width: number;
    length: number;
    height: number;
  },
): Promise<CompareResult> {
  const { account, token } = await loadAccount(shopId);
  const sender = senderOf(account);

  const missingSender = findMissingSenderFields(sender);
  if (missingSender.length > 0) {
    throw new IShipServiceError(
      "INCOMPLETE_DATA",
      `ยังตั้งที่อยู่ผู้ส่งไม่ครบ — ขาด ${missingSender.join(", ")}`,
      missingSender,
    );
  }

  const r = input.receiver;
  if (!r.subdistrict || !r.district || !r.province || !r.postcode) {
    throw new IShipServiceError(
      "INCOMPLETE_DATA",
      "ยังกรอกที่อยู่ปลายทางไม่ครบ จึงประเมินค่าส่งไม่ได้",
    );
  }

  const base = buildCheckPricePayload(sender, r, {
    weight: input.weight,
    width: input.width,
    length: input.length,
    height: input.height,
  });

  return withTokenGuard(shopId, async () => {
    const couriers = await iship.listCouriers(token);
    if (couriers.length === 0) return { rows: [], failed: [] };
    const settled = await Promise.allSettled(
      couriers.map((c) => iship.checkPrice(token, { courier_code: c.code, ...base })),
    );
    const result = assembleCompareResult(couriers, settled);
    if (result.rows.length === 0) {
      // ทุกขนส่งพัง = โครงสร้างพัง (token/เครือข่าย) ไม่ใช่ "ราคาไม่มี" — rethrow เหตุแรก
      // ที่ reject: เป็น IShipError จากชั้น client ซึ่ง mapIShipError จับเป็น 502/504 อยู่แล้ว
      // (ตรวจแล้ว 2026-08-05: ServiceErrorCode ไม่มีค่า upstream — ไม่เพิ่ม code ใหม่
      //  เพื่อไม่ต้องเพิ่ม route-catch ใหม่; เหตุ NaN ล้วนโดยไม่มี rejection แทบเป็นไปไม่ได้
      //  แต่กันไว้ด้วย error ธรรมดา → mapIShipError ตอบ 500 ข้อความกลาง)
      const firstReject = settled.find(
        (s): s is PromiseRejectedResult => s.status === "rejected",
      );
      throw firstReject?.reason ?? new Error("compare: all NaN");
    }
    return result;
  });
}
```

หมายเหตุ implement:
- import เพิ่ม: `assembleCompareResult, type CompareResult` จาก `@/lib/iship/compare`
- ห้ามเพิ่ม `ServiceErrorCode` ใหม่ในงานนี้ — ทุก error ที่โยนต้องเป็นชนิดที่ `mapIShipError` จับอยู่แล้ว (memory: error ใหม่ต้องมี route-catch ครบทุกตัว)
- ⚠️ ข้อแตกต่างจาก allSettled ปกติ: `withTokenGuard` ครอบทั้งก้อน — ถ้า `listCouriers` โดน 401 token invalid จะ mark ให้เหมือน flow อื่น แต่ error รายขนส่งใน allSettled ถูกกลืนเป็น failed[] จึงไม่ trigger mark (ยอมรับได้: ถ้า token พังจริง listCouriers จะพังก่อนถึง fan-out)

- [ ] **Step 3: tsc**

```bash
node node_modules/typescript/lib/tsc.js --noEmit
```

- [ ] **Step 4: Commit**

```bash
git add src/lib/validations.ts src/services/iship.service.ts
git commit -m "feat(00022-ext): compareShippingPrices — fan-out check-price ทุกขนส่งของร้านในคำขอเดียว"
```

---

### Task 5: Route `POST /api/seller/iship/price/compare`

**Files:**
- Create: `src/app/api/seller/iship/price/compare/route.ts`

**Interfaces:**
- Consumes: `compareShippingPrices` (Task 4), `IShipPriceCompareSchema` (Task 4), `requireGeneralShop`, `ishipError/ishipJson/mapIShipError/readJson`
- Produces: `POST` คืน `CompareResult` เป็น JSON — client (Task 7) fetch เส้นนี้

- [ ] **Step 1: เขียน route** — โครงเดียวกับพี่น้อง `price/route.ts` ทุกบรรทัด (sibling parity) ต่างแค่ schema/service:

```ts
// ส่วนขยาย feature 00022 — เทียบราคาทุกขนส่งในคำขอเดียว (ปุ่ม "เทียบราคา")
//
// แยกจาก POST /price (รายตัว): ตัวนี้ server เป็นคน fan-out ไปทุกขนส่งของร้าน
// เพื่อไม่ให้ client ต้องยิง 17 ครั้งจนชน rate-limit ของเราเอง — iShip ฝั่งโน้น
// check-price ฟรี ไม่ก่อค่าใช้จ่าย
//
// ที่อยู่ผู้ส่งไม่รับจาก body — service อ่านจากการตั้งค่าร้านเสมอ (เหตุผลเดียวกับ /price)

import type { NextRequest } from "next/server";
import * as v from "valibot";
import { requireGeneralShop } from "@/lib/shop-api-guard";
import { IShipPriceCompareSchema } from "@/lib/validations";
import { ishipError, ishipJson, mapIShipError, readJson } from "@/lib/iship/route-helpers";
import { compareShippingPrices } from "@/services/iship.service";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const guard = await requireGeneralShop();
  if ("error" in guard) return guard.error;

  const parsed = v.safeParse(IShipPriceCompareSchema, await readJson(request));
  if (!parsed.success) {
    return ishipError(
      "INVALID_INPUT",
      parsed.issues[0]?.message ?? "ข้อมูลไม่ถูกต้อง",
      400,
    );
  }

  try {
    return ishipJson(await compareShippingPrices(guard.shopId, parsed.output));
  } catch (err) {
    return mapIShipError(err);
  }
}
```

- [ ] **Step 2: ตรวจ `mapIShipError` ครอบ error code ที่ service โยน** — เปิด `src/lib/iship/route-helpers.ts` ยืนยันว่า code ที่ใช้ (INCOMPLETE_DATA + ตัวที่เลือกใน Task 4) มี mapping เป็น HTTP status; ถ้าเพิ่ม code ใหม่ต้องเพิ่มที่นี่ในคอมมิตเดียวกัน

- [ ] **Step 3: tsc + smoke ด้วย curl** (ต้องมี dev server ที่ user รันไว้ port 4000 — ถ้าไม่ได้รันให้ข้าม บันทึกเป็น browser-QA carry)

```bash
node node_modules/typescript/lib/tsc.js --noEmit
```

- [ ] **Step 4: Commit**

```bash
git add "src/app/api/seller/iship/price/compare/route.ts"
git commit -m "feat(00022-ext): POST /api/seller/iship/price/compare — endpoint เทียบราคาทุกขนส่ง"
```

---

### Task 6: `safepay-ux` gate (Hard Rule 8 — ก่อนแตะ UI)

**Files:** ไม่มีการแก้ไฟล์ — ได้ Design Spec เป็น text

- [ ] **Step 1: invoke subagent `safepay-ux`** (read-only, spawn แบบไม่ตั้งชื่อ + sync) — prompt ต้องระบุ:
  - อ่าน `DESIGN.md` + `PRODUCT.md` + `.impeccable/design.json` ก่อน (ux Hard Rule 9) + playbook `~/.claude/skills/impeccable/reference/shape.md` + `operate.md`
  - อ่าน mockup `docs/superpowers/specs/2026-08-05-iship-price-compare-mockup.html` + spec `.md` — **mockup คือคำตอบที่ user อนุมัติแล้ว ห้าม redesign** งานของ ux คือแปลงเป็น Design Spec ระดับ component: Theme Source Mapping (class Paces จริง), spacing/token, สถานะครบ (disabled/loading/error/empty/failed-partial), a11y (focus trap ใน view swap, `aria-live` ตอนผลมา), หัวข้อ `### Impeccable compliance` + `Mode:`
  - บริบท integration: view swap ภายใน `ShipmentCreateForm` (ไม่ใช่ portal), 2 ทางเข้า (ShipmentEntryModal + ShipmentDraftPanel ในแชทที่ซ่อนด้วย `hidden` — ห้าม Preline JS)
- [ ] **Step 2: เก็บ Design Spec ไว้ใช้ใน Task 7** (แนบเข้า prompt ของงาน UI)

---

### Task 7: UI — `PriceCompareSheet` + ปุ่มเทียบราคาใน `ShipmentCreateForm`

**Files:**
- Create: `src/components/safepay/iship/PriceCompareSheet.tsx`
- Modify: `src/components/safepay/iship/ShipmentCreateForm.tsx` (บล็อก dropdown ขนส่ง ~บรรทัด 563-585 + state + view swap ที่ root)

**Interfaces:**
- Consumes: `POST /api/seller/iship/price/compare` (Task 5), `courierLogoUrl`/`courierInitials` จาก `@/lib/iship/courier`, type `CompareRow/CompareResult` จาก `@/lib/iship/compare`
- Produces:
  ```tsx
  interface PriceCompareSheetProps {
    input: { receiver: { subdistrict: string; district: string; province: string; postcode: string };
             weight: number; width: number; length: number; height: number }
    destinationLabel: string      // "ต.ขุนยวม อ.ขุนยวม แม่ฮ่องสอน 58140"
    parcelLabel: string           // "1.0 กก. · 20×14×6 ซม."
    onPick: (courierCode: string) => void
    onClose: () => void
  }
  export default function PriceCompareSheet(props: PriceCompareSheetProps): JSX.Element
  ```

- [ ] **Step 1: สร้าง `PriceCompareSheet.tsx` ตาม mockup + Design Spec จาก Task 6** — โครงหลัก:
  - หัว: ปุ่มกลับ (`tabler:chevron-left`, `size-9`, `aria-label="กลับ"`) + "เปรียบเทียบราคาขนส่ง"
  - บรรทัดปลายทาง + คำเตือน `text-warning-ink` (+ ประโยค remote เมื่อ `rows.some(r => r.remoteFee)`)
  - fetch ตอน mount + state `{ loading, error, data }`; ปุ่ม "ลองใหม่" ตอน error; ยิงซ้ำเฉพาะเมื่อ input เปลี่ยน (memo ด้วย key จาก input)
  - รายการ: `rows` จาก API (เรียงมาแล้ว) — ใบแรก `border-primary` + badge `bg-primary text-white` "ถูกที่สุด" + ปุ่ม `btn bg-primary text-white`; ใบอื่น `border-default-300` + `btn border border-primary text-primary`
  - breakdown ต่อใบ: ค่าส่ง `basePrice` / ค่าน้ำมัน `fuelFee` / พื้นที่ห่างไกล `remoteFee` — null แสดง "—" (helper `fmtFee`)
  - `failed.length > 0` → บรรทัดสรุปท้ายรายการ
  - โลโก้: `courierLogoUrl(row.courierCode, row.courierName)` + fallback ตัวย่อ (pattern เดียวกับ OrderCard) — กล่อง `rounded-lg border border-default-200` (โลโก้ Flash พื้นเหลืองเต็มกรอบ ต้องมีขอบ)
  - responsive: mobile การ์ด stack (breakdown grid-cols-3) / `md:` ขึ้นไปแถวแนวนอนตาม mockup desktop
  - **ห้าม arbitrary value ทุกจุด (HR7) · ห้าม emoji (HR12) · ไม่ใช้ Preline JS**
- [ ] **Step 2: ผูกเข้า `ShipmentCreateForm.tsx`**
  - state: `const [compareOpen, setCompareOpen] = useState(false)`
  - ความพร้อม: reuse ตัวแปร `ready` เดิมของ quote effect (แยกเป็น `const quoteReady = ...` ให้ปุ่มกับ effect ใช้ร่วม — ตัวเลข/เงื่อนไขเดียวกันต้องมาจาก symbol เดียว)
  - ปุ่มข้าง select: `btn border border-primary text-primary shrink-0` + `tabler:arrows-sort`; ตอนไม่พร้อม = `border-default-300 text-default-500` + `disabled` + `<p>` อธิบายใต้ช่อง
  - view swap: `compareOpen` จริง → render `<PriceCompareSheet …/>` และห่อเนื้อฟอร์มเดิมด้วย `hidden` (คง state ฟอร์ม); `onPick` → `setCourierCode(code); setCompareOpen(false)` (quote เดิม refetch เองผ่าน `quoteKey`)
  - `destinationLabel`/`parcelLabel` ประกอบจาก `form` + ค่า `weight/width/length/height` ปัจจุบัน
- [ ] **Step 3: gate ก่อน commit**

```bash
node node_modules/typescript/lib/tsc.js --noEmit
# HR9: ต้อง match รูป import เท่านั้น
rg "from ['\"]react-toastify" src/components/safepay/iship/ && echo VIOLATION || echo OK
# HR12 emoji gate
grep -rnP '[\x{1F000}-\x{1FAFF}\x{2600}-\x{27BF}\x{2B00}-\x{2BFF}]' src/components/safepay/iship/PriceCompareSheet.tsx src/components/safepay/iship/ShipmentCreateForm.tsx || echo OK
# HR7 arbitrary value
rg '\[(\d+px|#|rgba)' src/components/safepay/iship/PriceCompareSheet.tsx && echo CHECK-MANUALLY || echo OK
```

- [ ] **Step 4: Commit**

```bash
git add src/components/safepay/iship/PriceCompareSheet.tsx src/components/safepay/iship/ShipmentCreateForm.tsx
git commit -m "feat(00022-ext): PriceCompareSheet + ปุ่มเทียบราคาใน ShipmentCreateForm

view swap ในโมดัลเดิม (ไม่ใช้ portal/Preline — โมดัลแชทซ่อนด้วย hidden ไม่ unmount)
Base: mockup docs/superpowers/specs/2026-08-05-iship-price-compare-mockup.html (Paces classes ตาม ShipmentCreateForm เดิม)"
```

---

### Task 8: Review + QA gates

- [ ] **Step 1: `safepay-reviewer` subagent** — 8-gate check ทุกไฟล์ที่แตะ (spawn ไม่ตั้งชื่อ + sync, read-only)
- [ ] **Step 2: Impeccable CLI (HR8):** `/impeccable critique` + `/impeccable clarify` บนงาน UI — แก้ finding จริงให้จบ
- [ ] **Step 3: Vitest ทั้งชุดที่เกี่ยว + tsc รอบสุดท้าย**

```bash
node node_modules/vitest/vitest.mjs run src/lib/iship/
node node_modules/typescript/lib/tsc.js --noEmit
```

- [ ] **Step 4: Browser QA** — probe `seller.deepth.local:4000` ก่อน (user รัน dev เอง — ห้าม start เอง, ห้าม build ทับ .next):
  - เปิด order detail ที่มี order SHIPPED-able → modal สร้างพัสดุ → แท็บสร้างพัสดุ iShip
  - ปุ่ม disabled → กรอกครบ → enabled → กด → เห็นรายการเรียงราคา → เลือก → dropdown เปลี่ยน + quote เดิมอัปเดต
  - จอ 375px + เดสก์ท็อป; เช็กจากแชท (ShipmentDraftPanel) ด้วย
  - port ไม่เปิด → บันทึก carry แจ้ง user
- [ ] **Step 5: แก้ทุกอย่างที่เจอ → commit ตามก้อนงาน**

---

### Task 9: อัปเดตเอกสาร 00022 (HR11)

**Files:**
- Modify: `docs/20 - Features/00022 - iShip Shipping Integration/PRD.md`, `BRD.md` (safepay-product)
- Modify: `.../SRS.md`, `API.md` (safepay-planner)
- Modify: `.../TestCase.md` (safepay-qa)

- [ ] **Step 1: spawn subagent ตาม ownership** — แต่ละตัวได้ spec + แผนนี้ + รายการไฟล์โค้ดจริงเป็น input; เขียน **จากโค้ดจริง ไม่ใช่ความจำ** (เปิด route/service อ่านก่อนเขียน)
  - PRD/BRD: requirement "เปรียบเทียบราคาก่อนเปิดพัสดุ" + business rule ราคาเป็นประมาณการ
  - SRS/API: endpoint, request/response shape จริง, error mapping
  - TestCase: เคสตาม spec §6 + ผล browser QA
- [ ] **Step 2: Controller ตรวจ diff บนดิสก์ (`git diff`) แล้ว commit**

```bash
git add "docs/20 - Features/00022 - iShip Shipping Integration/"
git commit -m "docs(00022-ext): เอกสารเปรียบเทียบราคาขนส่ง — PRD/BRD/SRS/API/TestCase"
```

- [ ] **Step 3: สรุปสถานะรวม + carry ที่เหลือให้ user** (ห้าม push — เวิร์กทรีแชร์ ให้ user/session หลักเป็นคนรวม)
