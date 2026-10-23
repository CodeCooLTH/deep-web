import { describe, expect, it } from "vitest";
import { isFlashTrackingSettled, describeMarker, mapFlashState, normalizeBatchRoutes, normalizeRoutes, parseFlashTime, readFlashPrice, readFlashWeight, FLASH_PICKUP_STATE, FLASH_MARKER_FALLBACK } from "../status";

describe("mapFlashState", () => {
  it.each([[1, "picked_up"], [2, "in_transit"], [3, "progress"], [4, "issue"], [5, "delivered"], [6, "issue"], [7, "return"], [8, "close"], [9, "cancelled"], ["5", "delivered"]])(
    "%s -> %s", (s, c) => expect(mapFlashState(s)).toBe(c));
  it.each([0, 10, -1, 1.5, "", "abc", "05x", null, undefined, {}, [], NaN, true])("ไม่รู้จัก %j -> null", (s) => expect(mapFlashState(s)).toBeNull());
  it("property: ไม่มีอินพุตใดให้ payment_success", () => {
    const seen = new Set<string>();
    const pool: unknown[] = [...Array(200).keys(), ...Array(200).keys()].map((n, i) => (i % 2 ? String(n - 50) : n - 50));
    pool.push("payment_success", "PAYMENT_SUCCESS", "12", 12, 99, "99", "delivered", null, undefined, {}, [], 1e9, "1e1", " 5 ", "0x5");
    for (let i = 0; i < 5000; i++) pool.push(Math.random() * 40 - 10, String(Math.floor(Math.random() * 1000)), Math.random().toString(36));
    for (const x of pool) { const r = mapFlashState(x); if (r) seen.add(r); }
    expect(seen.has("payment_success")).toBe(false);
    expect([...seen].sort()).toEqual(["cancelled", "close", "delivered", "in_transit", "issue", "picked_up", "progress", "return"]);
  });
});

describe("isFlashTrackingSettled / describeMarker / pickup", () => {
  it("Flash COD จบที่ delivered", () => {
    for (const c of ["delivered", "close", "cancelled", "return_success"]) expect(isFlashTrackingSettled(c)).toBe(true);
    for (const c of ["return", "issue", "in_transit", "order_success", "payment_success", null, undefined]) expect(isFlashTrackingSettled(c)).toBe(false);
  });
  it("markerCategory", () => {
    expect(describeMarker("40")).toBe("ไม่อยู่หรือไม่รับสาย");
    expect(describeMarker(17)).toBe("ปฏิเสธรับ");
    expect(describeMarker("999")).toBe(FLASH_MARKER_FALLBACK);
    expect(describeMarker(null)).toBeNull();
    expect(describeMarker("")).toBeNull();
  });
  it("pickup state", () => {
    expect(FLASH_PICKUP_STATE[3]).toBe("ACCEPTED");
    expect(FLASH_PICKUP_STATE[4]).toBe("CANCELLED");
    expect(FLASH_PICKUP_STATE[9]).toBeUndefined();
  });
});

describe("parseFlashTime", () => {
  it("epoch วินาที / สตริง / ทศนิยม", () => {
    expect(parseFlashTime(1612762153)?.toISOString()).toBe("2021-02-08T05:29:13.000Z");
    expect(parseFlashTime("1612762153")?.toISOString()).toBe("2021-02-08T05:29:13.000Z");
    expect(parseFlashTime("1612762153.5")?.getTime()).toBe(1612762153500);
  });
  it("'YYYY-MM-DD HH:mm:ss' = Asia/Bangkok", () => {
    expect(parseFlashTime("2021-02-08 03:46:34")?.toISOString()).toBe("2021-02-07T20:46:34.000Z");
    expect(parseFlashTime("2021-02-08T03:46:34Z")?.toISOString()).toBe("2021-02-08T03:46:34.000Z");
  });
  it.each([null, undefined, "", "abc", "2021-02-30 10:00:00", "2021-13-01 10:00:00", "2021-02-08 25:00:00", 123, 1612762153000, "1612762153000", -5, NaN, {}, "2021-02-08"])(
    "ไม่ได้ %j -> null", (x) => expect(parseFlashTime(x)).toBeNull());
});

describe("readFlashPrice", () => {
  const ok = { freightPrice: "5000", remoteAreaFee: "1000", speedFee: 500, valueInsuranceFee: "0", opdInsureFee: "200", packagingFee: "100", labelFee: "50", codFee: "300", codAmount: "999999", chargableWeight: "1" };
  it("รวมองค์ประกอบเป็นสตางค์ → บาท, codFee แยก, ฟิลด์อื่นไม่รวม", () => {
    expect(readFlashPrice(ok)).toEqual({ carrierPrice: 68.5, codFee: 3 });
  });
  it("แต่ละองค์ประกอบถูกนับ", () => {
    for (const k of ["freightPrice", "remoteAreaFee", "speedFee", "valueInsuranceFee", "opdInsureFee", "packagingFee", "labelFee"]) {
      const a = readFlashPrice({ freightPrice: "1000", ...(k === "freightPrice" ? {} : { [k]: "0" }) });
      const b = readFlashPrice({ freightPrice: "1000", ...(k === "freightPrice" ? {} : { [k]: "100" }) });
      expect(Math.round((b!.carrierPrice! - a!.carrierPrice!) * 100) / 100).toBe(k === "freightPrice" ? 0 : 1);
    }
  });
  it.each([["-100"], ["10.5"], ["abc"], [""], [1.5], [-1]])("องค์ประกอบ %j ผิด -> ทิ้งทั้งก้อน", (bad) => {
    expect(readFlashPrice({ ...ok, labelFee: bad })).toBeNull();
    expect(readFlashPrice({ ...ok, codFee: bad })).toBeNull();
  });
  it("freight ไม่ >0 -> carrierPrice null, codFee ยังได้", () => {
    expect(readFlashPrice({ ...ok, freightPrice: "0" })).toEqual({ carrierPrice: null, codFee: 3 });
    expect(readFlashPrice({ speedFee: "100" })).toBeNull();
  });
  it("เกินเพดาน 10,000 บาท -> ทิ้ง", () => {
    expect(readFlashPrice({ freightPrice: "1000000" })!.carrierPrice).toBe(10000);
    expect(readFlashPrice({ freightPrice: "1000001" })).toBeNull();
    expect(readFlashPrice({ freightPrice: "100", codFee: "1000001" })).toBeNull();
  });
  it("ไม่ใช่ object", () => { expect(readFlashPrice(null)).toBeNull(); expect(readFlashPrice("x")).toBeNull(); });
});

describe("readFlashWeight", () => {
  const decl = { weightKg: 1, width: 10, length: 20, height: 5 };
  it("กรัม → กก. + ธง", () => {
    expect(readFlashWeight({ weight: "1000" }, decl)).toEqual({ actualWeightKg: 1, isOverWeight: false, isOverSize: false });
    expect(readFlashWeight({ weight: "1001" }, decl)!.isOverWeight).toBe(true);
    expect(readFlashWeight({ weight: "1255" }, decl)!.actualWeightKg).toBe(1.26);
  });
  it("ขนาด: เฉพาะมิติที่วัดได้และร้านแจ้ง", () => {
    expect(readFlashWeight({ weight: "500", width: "11" }, decl)!.isOverSize).toBe(true);
    expect(readFlashWeight({ weight: "500", width: "10", length: "20", height: "5" }, decl)!.isOverSize).toBe(false);
    expect(readFlashWeight({ weight: "500", width: "99" }, { weightKg: 1 })!.isOverSize).toBe(false);
  });
  it.each(["0", "100001", "1.5", "-5", "abc", null])("น้ำหนัก %j -> null", (w) => expect(readFlashWeight({ weight: w }, decl)).toBeNull());
  it("ร้านไม่แจ้งน้ำหนัก = ไม่ตั้งธง", () => expect(readFlashWeight({ weight: "9999" }, {})!.isOverWeight).toBe(false));
});

describe("normalizeRoutes / normalizeBatchRoutes", () => {
  const one = { pno: "TH1", state: "5", stateChangeAt: 1612762153, returnedPno: "", routes: [{ routedAt: "1612762153", routeAction: "DELIVERY_CONFIRM", message: "m", state: "5" }, { routedAt: 1612700000, routedAction: "RECEIVED", state: 1 }] };
  it("ทนทั้ง routeAction/routedAction", () => {
    const r = normalizeRoutes(one)!;
    expect(r).toMatchObject({ pno: "TH1", state: 5, returnedPno: null });
    expect(r.stateChangeAt?.getTime()).toBe(1612762153000);
    expect(r.routes.map((x) => x.action)).toEqual(["DELIVERY_CONFIRM", "RECEIVED"]);
  });
  it("routes เป็น map / ขาดไป", () => {
    expect(normalizeRoutes({ ...one, routes: { a: one.routes[0] } })!.routes).toHaveLength(1);
    expect(normalizeRoutes({ pno: "x" })!.routes).toEqual([]);
    expect(normalizeRoutes(null)).toBeNull();
    expect(normalizeRoutes([])).toBeNull();
  });
  it("เวลา parse ไม่ได้ = null ไม่เดา", () => {
    expect(normalizeRoutes({ routes: [{ routedAt: "เมื่อวาน", routeAction: "X" }] })!.routes[0].routedAt).toBeNull();
  });
  it("batch: array / list / map ตาม pno", () => {
    expect([...normalizeBatchRoutes([one, { ...one, pno: "TH2" }]).keys()]).toEqual(["TH1", "TH2"]);
    expect([...normalizeBatchRoutes({ list: [one] }).keys()]).toEqual(["TH1"]);
    const { pno: _p, ...noPno } = one;
    expect(normalizeBatchRoutes({ TH9: noPno }).get("TH9")?.pno).toBe("TH9");
    expect(normalizeBatchRoutes([noPno]).size).toBe(0);
    expect(normalizeBatchRoutes("x").size).toBe(0);
  });
});
