import { describe, it, expect } from "vitest";
import { safeCallbackUrl, DEFAULT_SELLER_CALLBACK } from "../safe-callback-url";

describe("safeCallbackUrl", () => {
  describe("ผ่าน — path ภายในเว็บเดียวกัน", () => {
    it("คืน path ที่ขึ้นต้นด้วย / ตรง ๆ", () => {
      expect(safeCallbackUrl("/i/aB3xY7kQ9mLp")).toBe("/i/aB3xY7kQ9mLp");
      expect(safeCallbackUrl("/dashboard")).toBe("/dashboard");
    });

    it("คง query string + hash ไว้", () => {
      expect(safeCallbackUrl("/orders?status=PENDING#top")).toBe("/orders?status=PENDING#top");
    });

    it("รับค่าที่ยัง URL-encoded มา (มาจาก encodeURIComponent ฝั่งผู้เรียก)", () => {
      expect(safeCallbackUrl(encodeURIComponent("/i/aB3xY7kQ9mLp"))).toBe("/i/aB3xY7kQ9mLp");
    });
  });

  describe("ไม่ผ่าน — open-redirect vector", () => {
    it("protocol-relative //host → fallback", () => {
      expect(safeCallbackUrl("//evil.com")).toBe(DEFAULT_SELLER_CALLBACK);
      expect(safeCallbackUrl("//evil.com/i/abc")).toBe(DEFAULT_SELLER_CALLBACK);
    });

    it("protocol-relative ที่ encode มา → fallback (decode ก่อนตรวจ)", () => {
      expect(safeCallbackUrl("%2F%2Fevil.com")).toBe(DEFAULT_SELLER_CALLBACK);
    });

    it("backslash variant → fallback", () => {
      expect(safeCallbackUrl("/\\evil.com")).toBe(DEFAULT_SELLER_CALLBACK);
      expect(safeCallbackUrl("\\\\evil.com")).toBe(DEFAULT_SELLER_CALLBACK);
    });

    it("absolute URL แม้เป็นโดเมนเราเอง → fallback", () => {
      expect(safeCallbackUrl("https://deepthailand.app/i/abc")).toBe(DEFAULT_SELLER_CALLBACK);
      expect(safeCallbackUrl("http://evil.com")).toBe(DEFAULT_SELLER_CALLBACK);
    });

    it("scheme อันตราย → fallback", () => {
      expect(safeCallbackUrl("javascript:alert(1)")).toBe(DEFAULT_SELLER_CALLBACK);
      expect(safeCallbackUrl("data:text/html,<script>")).toBe(DEFAULT_SELLER_CALLBACK);
    });

    it("relative path ไม่มี / นำหน้า → fallback", () => {
      expect(safeCallbackUrl("dashboard")).toBe(DEFAULT_SELLER_CALLBACK);
    });

    it("control character → fallback", () => {
      expect(safeCallbackUrl("/i/abc\nSet-Cookie: x=1")).toBe(DEFAULT_SELLER_CALLBACK);
      expect(safeCallbackUrl("/i/abc\r\n")).toBe(DEFAULT_SELLER_CALLBACK);
    });

    it("ค่า encode ที่พังรูป (decodeURIComponent throw) → fallback", () => {
      expect(safeCallbackUrl("/i/%E0%A4%A")).toBe(DEFAULT_SELLER_CALLBACK);
    });
  });

  describe("ค่าว่าง / fallback", () => {
    it("null / undefined / empty → fallback", () => {
      expect(safeCallbackUrl(null)).toBe(DEFAULT_SELLER_CALLBACK);
      expect(safeCallbackUrl(undefined)).toBe(DEFAULT_SELLER_CALLBACK);
      expect(safeCallbackUrl("")).toBe(DEFAULT_SELLER_CALLBACK);
    });

    it("ใช้ fallback ที่ผู้เรียกกำหนดเองได้", () => {
      expect(safeCallbackUrl("//evil.com", "/i/abc")).toBe("/i/abc");
    });
  });
});
