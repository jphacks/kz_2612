#!/usr/bin/env bash
# 標準入力から受け取ったファイル名（1行1ファイル）のうち、1MB を超えるものがあれば表示して失敗する。
# docs/screenshots/ の下は許可する。
#
#   git ls-files | bash scripts/check_large_files.sh
set -euo pipefail

limit=$((1024 * 1024))
failed=0

while IFS= read -r file; do
  file=${file%$'\r'} # Windows の改行が混ざっても動くように
  [ -n "$file" ] || continue
  case "$file" in docs/screenshots/*) continue ;; esac
  [ -f "$file" ] || continue # 削除されたファイルは見ない
  size=$(wc -c <"$file")
  if [ "$size" -gt "$limit" ]; then
    echo "1MB を超えている: $file（${size} バイト）"
    failed=1
  fi
done

if [ "$failed" -ne 0 ]; then
  echo "大きいファイルは git の履歴に残り続けて重くなる。コミットから外すか、.gitignore に入れる。画像なら docs/screenshots/ に置く。"
  exit 1
fi
echo "OK: 1MB を超えるファイルはない"
