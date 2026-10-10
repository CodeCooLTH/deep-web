#!/usr/bin/env bash
# ติดตั้ง Impeccable skill ให้ cloud session (Claude Code on the web) — Hard Rule 8
#
# ทำไมต้องมี: บนเครื่อง dev Impeccable เป็น "ปลั๊กอิน" (~/.claude/plugins/cache/impeccable) ที่มี hook ของตัวเอง
# แต่ container ของ cloud session เริ่มใหม่ทุกครั้งและไม่มีปลั๊กอินนั้น ⇒ /impeccable critique/audit/detect
# รันไม่ได้ แล้ว gate ของ Hard Rule 8 ถูกข้ามเงียบ ๆ. container ต่อ npm registry ไม่ได้ (npx impeccable install ล้ม)
# แต่ต่อ GitHub ได้ จึงดึงจาก git แทน
#
# ขอบเขต: รันเฉพาะ cloud (CLAUDE_CODE_REMOTE=true) และเฉพาะเมื่อยังไม่มี skill/ปลั๊กอิน — เครื่อง dev ไม่ถูกแตะ
# และไม่ติด hook ของ Impeccable ซ้ำ (README ของ Impeccable เตือนเรื่องติดตั้งซ้ำ)
# ปักหมุด commit ไว้ — อัปเดตเวอร์ชันด้วยการแก้ IMPECCABLE_REF ที่นี่ ไม่ดึง HEAD ลอย ๆ
# ล้มเหลวแบบไหนก็ exit 0 เสมอ — session ต้องเปิดได้ แต่ agent ต้องรายงานว่า Impeccable ใช้ไม่ได้ (Hard Rule 8)

set -u

[ "${CLAUDE_CODE_REMOTE:-}" = "true" ] || exit 0

IMPECCABLE_REPO="https://github.com/pbakaus/impeccable"
IMPECCABLE_REF="d631a8827f99414d2b6daba4ef08b7f8701751d7" # skill v0.1.14 (2026-10-10)
DEST="$HOME/.claude/skills/impeccable"

[ -x "$DEST/scripts/impeccable" ] && exit 0
[ -d "$HOME/.claude/plugins/cache/impeccable" ] && exit 0

tmp=$(mktemp -d) || exit 0
trap 'rm -rf "$tmp"' EXIT

if git -C "$tmp" init -q \
  && git -C "$tmp" fetch -q --depth 1 "$IMPECCABLE_REPO" "$IMPECCABLE_REF" \
  && git -C "$tmp" checkout -q FETCH_HEAD \
  && [ -f "$tmp/plugin/skills/impeccable/SKILL.md" ]; then
  mkdir -p "$HOME/.claude/skills"
  rm -rf "$DEST"
  cp -r "$tmp/plugin/skills/impeccable" "$DEST"
  echo "Impeccable skill ติดตั้งแล้วที่ $DEST"
else
  echo "Impeccable ติดตั้งไม่สำเร็จ — /impeccable ใช้ไม่ได้ใน session นี้ ต้องแจ้ง user (Hard Rule 8)"
fi
exit 0
