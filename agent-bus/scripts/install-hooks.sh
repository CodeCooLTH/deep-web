#!/usr/bin/env bash
#
# ติดตั้ง agent-bus secret-guard hook เข้า repo ปัจจุบัน
# ใช้: bash agent-bus/scripts/install-hooks.sh
#
set -eu

# หา root ของ git repo
if ! git rev-parse --git-dir >/dev/null 2>&1; then
  echo "✗ ไม่ได้อยู่ใน git repo — cd เข้า repo ก่อนแล้วค่อยรัน"
  exit 1
fi

repo_root=$(git rev-parse --show-toplevel)
hook_src="$repo_root/agent-bus/hooks/pre-commit"
git_dir=$(git rev-parse --git-dir)          # รองรับ worktree / .git แบบ file
hook_dst="$git_dir/hooks/pre-commit"

if [ ! -f "$hook_src" ]; then
  echo "✗ ไม่พบ $hook_src — วางโฟลเดอร์ agent-bus/ ใน repo ให้ครบก่อน"
  exit 1
fi

mkdir -p "$git_dir/hooks"

# ถ้ามี pre-commit เดิมอยู่ ให้ chain ต่อ ไม่ทับทิ้ง
if [ -f "$hook_dst" ] && ! grep -q 'agent-bus secret guard' "$hook_dst" 2>/dev/null; then
  echo "! พบ pre-commit เดิม — สำรองเป็น pre-commit.local แล้วเรียกต่อจาก hook ใหม่"
  mv "$hook_dst" "$git_dir/hooks/pre-commit.local"
  cp "$hook_src" "$hook_dst"
  printf '\n# chain hook เดิม\n"$(git rev-parse --git-dir)/hooks/pre-commit.local" || exit $?\n' >> "$hook_dst"
else
  cp "$hook_src" "$hook_dst"
fi

chmod +x "$hook_dst"
echo "✓ ติดตั้ง secret-guard hook แล้ว: $hook_dst"
echo "  ลองทดสอบ: echo 'token=abcd1234567890abcd' >> agent-bus/to-coder.md && git add -A && git commit -m test"
