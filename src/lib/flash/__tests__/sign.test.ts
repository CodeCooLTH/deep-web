import { describe, expect, it } from "vitest";
import { buildFormBody, isBlankValue, newNonce, signParams, signingString, verifyWebhookSign } from "../sign";

// expectedSign คำนวณด้วย `printf '%s' <signingString> | openssl dgst -sha256` (ไม่ได้มาจากโค้ดเรา)
// key/mchId ปลอมเท่านั้น (BR-FLASH-62)
const K = "K1";
const BASE = { mchId: "M1", nonceStr: "n1" };
const HASH_BASE = "CA85D685976CB89A20C80A96E9FE294EBF4B10D158974AC02AE48E308A8D82FE";

const vectors: { id: string; params: Record<string, string | number>; str: string; sign: string }[] = [
  { id: "V1", params: { nonceStr: "n1", mchId: "M1", body: "test" }, str: "body=test&mchId=M1&nonceStr=n1&key=K1", sign: "056EC9EEBE87AD671F64644733AA1EB9BCC30C43A672F04A1E29A25A8B4E01C3" },
  { id: "V2", params: { b1: "w", A1: "z", mchId: "M1", a1: "x", B1: "y", nonceStr: "n1" }, str: "A1=z&B1=y&a1=x&b1=w&mchId=M1&nonceStr=n1&key=K1", sign: "8499C3FE29B12D17AA498BB82D5854802133282FADDB44BA580F418C340AF058" },
  { id: "V3", params: { ...BASE, remark: "   ", memo: "\t", x: "\u001F", e: "" }, str: "mchId=M1&nonceStr=n1&key=K1", sign: HASH_BASE },
  { id: "V4", params: { ...BASE, remark: " a b " }, str: "mchId=M1&nonceStr=n1&remark= a b &key=K1", sign: "561A61581FCC5BE68D26737BF451E74756C35AE1F9B43EFB6CBE87542218B7D2" },
  { id: "V5", params: { ...BASE, dstName: "สมชาย ใจดี" }, str: "dstName=สมชาย ใจดี&mchId=M1&nonceStr=n1&key=K1", sign: "5DBAC11D9D704033C7431ED3C2967F5A804BB7F327CD95A3F5A3C00672FC8BA5" },
  { id: "V6", params: { ...BASE, subItemTypes: JSON.stringify([{ itemName: "เสื้อ", itemQuantity: 2 }]) }, str: 'mchId=M1&nonceStr=n1&subItemTypes=[{"itemName":"เสื้อ","itemQuantity":2}]&key=K1', sign: "9CBEB0B9034CD32581D0B0CA8026C4D3B141BACF3F4198D553381AC5615A9992" },
  { id: "V7", params: { ...BASE, address: "a&b=c+d%20e" }, str: "address=a&b=c+d%20e&mchId=M1&nonceStr=n1&key=K1", sign: "8E89EDBAD76B16C346DC311BC0B1D3C7CE7483A4C45E42535C570C15201F705B" },
  { id: "V8", params: { ...BASE, codEnabled: 0, weight: 1500 }, str: "codEnabled=0&mchId=M1&nonceStr=n1&weight=1500&key=K1", sign: "32BE72F48BEF20A6FCEF40423BD3936C06DB01C0D6681945DD99B787C50ED142" },
];

describe("signParams vectors", () => {
  for (const v of vectors) {
    it(`${v.id}`, () => {
      expect(signingString(v.params, K)).toBe(v.str);
      expect(signParams(v.params, K)).toBe(v.sign);
    });
  }

  it("V3 body ยังส่งค่าว่างครบ 4 ฟิลด์ และมี sign", () => {
    const body = buildFormBody(vectors[2].params, K);
    for (const f of ["remark=%20%20%20", "memo=%09", "x=%1F", "e="]) expect(body).toContain(f);
    expect(body).toContain(`sign=${HASH_BASE}`);
  });

  it("V7 body urlencode ค่าดิบ", () => {
    expect(buildFormBody(vectors[6].params, K)).toContain("address=a%26b%3Dc%2Bd%2520e");
  });

  it("V9 คีย์ sign ที่ปนมาถูกทิ้ง และไม่ซ้ำใน body", () => {
    const p = { ...BASE, sign: "X" };
    expect(signingString(p, K)).toBe("mchId=M1&nonceStr=n1&key=K1");
    expect(signParams(p, K)).toBe(HASH_BASE);
    expect(buildFormBody(p, K).match(/sign=/g)).toHaveLength(1);
  });

  it("undefined/null ไม่ส่งและไม่เซ็น; NaN/Infinity/object = throw", () => {
    expect(signParams({ ...BASE, a: undefined, b: null }, K)).toBe(HASH_BASE);
    expect(buildFormBody({ ...BASE, a: undefined }, K)).not.toContain("a=");
    expect(() => signParams({ ...BASE, a: NaN }, K)).toThrow();
    expect(() => signParams({ ...BASE, a: Infinity }, K)).toThrow();
    expect(() => signParams({ ...BASE, a: {} as never }, K)).toThrow();
  });

  it("ค่า '0' และ 0 ไม่ใช่ค่าว่าง", () => {
    expect(isBlankValue("0")).toBe(false);
    expect(isBlankValue("")).toBe(true);
    expect(isBlankValue(" \t\n\v\f\r\u001C")).toBe(true);
    expect(signingString({ ...BASE, z: "0" }, K)).toContain("z=0");
  });
});

describe("verifyWebhookSign (V10)", () => {
  it("ผ่านเมื่อตรง และพิมพ์เล็กก็ผ่าน", () => {
    expect(verifyWebhookSign({ ...BASE, sign: HASH_BASE }, K)).toBe(true);
    expect(verifyWebhookSign({ ...BASE, sign: HASH_BASE.toLowerCase() }, K)).toBe(true);
  });
  it("ไม่ผ่านเมื่อ key/mchId ผิด และความยาวผิดไม่ throw", () => {
    expect(verifyWebhookSign({ ...BASE, sign: HASH_BASE }, "K2")).toBe(false);
    expect(verifyWebhookSign({ mchId: "M2", nonceStr: "n1", sign: HASH_BASE }, K)).toBe(false);
    expect(verifyWebhookSign({ ...BASE, sign: "ABC" }, K)).toBe(false);
    expect(verifyWebhookSign({ ...BASE, sign: undefined as never }, K)).toBe(false);
  });
});

it("newNonce = hex 32 ตัว ไม่ซ้ำ", () => {
  const a = newNonce();
  expect(a).toMatch(/^[0-9a-f]{32}$/);
  expect(newNonce()).not.toBe(a);
});
