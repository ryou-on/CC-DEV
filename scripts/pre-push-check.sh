#!/bin/bash
# CC-DEV pre-push チェック
# push対象のコミット範囲に対して運用ルール（AGENTS.md / CLAUDE.md）を機械検証する
#
# チェック内容:
#   1. 禁止ファイル混入（.DS_Store / *.wav / *.bak）→ ブロック
#   2. Flight_Strip index.html 変更時に RELEASE_NOTES 未更新 → ブロック
#   3. その他 public/<app>/index.html 変更時にバージョン表記らしき更新がない → 警告のみ
#
# 手動実行: scripts/pre-push-check.sh --manual  （origin/main..HEAD を検査）
set -u

REPO_ROOT="$(git rev-parse --show-toplevel)"
cd "$REPO_ROOT" || exit 1

Z40=0000000000000000000000000000000000000000
FAIL=0
WARN=0

check_range() {
  local range="$1"
  local changed
  changed="$(git diff --name-only --diff-filter=ACMR "$range" 2>/dev/null)" || return 0
  [ -z "$changed" ] && return 0

  # 1. 禁止ファイル（.DS_Store / 録音wav / バックアップ）
  local bad
  bad="$(grep -E '(^|/)\.DS_Store$|\.wav$|\.bak$' <<< "$changed" || true)"
  if [ -n "$bad" ]; then
    echo "❌ 禁止ファイルがコミットに含まれています:"
    sed 's/^/     /' <<< "$bad"
    echo "   → git rm --cached <ファイル> で除外してからコミットし直してください"
    FAIL=1
  fi

  # 2. Flight_Strip: index.html 変更時は同一push内で RELEASE_NOTES 更新必須
  local f
  for f in "public/Flight_Strip_TODO/index.html" "public/Flight_Strip_TODO_dev/index.html"; do
    if grep -qxF "$f" <<< "$changed"; then
      if ! git diff "$range" -- "$f" | grep -qE '^\+.*(version:|date:|changes)'; then
        echo "❌ $f が変更されていますが RELEASE_NOTES が更新されていません"
        echo "   → RELEASE_NOTES 配列を更新して同じ push に含めてください（デプロイルール）"
        FAIL=1
      fi
    fi
  done

  # 3. その他アプリ: バージョン表記の更新が見当たらなければ警告（ブロックしない）
  while IFS= read -r f; do
    [ -z "$f" ] && continue
    case "$f" in public/Flight_Strip_TODO*/index.html) continue ;; esac
    if ! git diff "$range" -- "$f" | grep -qE '^\+.*v?[0-9]+\.[0-9]+\.[0-9]+'; then
      echo "⚠️  $f: バージョン表記の更新が見つかりません（アプリ内バージョンの同時更新ルール）"
      WARN=1
    fi
  done < <(grep -E '^public/[^/]+/index\.html$' <<< "$changed" || true)
}

if [ "${1:-}" = "--manual" ]; then
  # 手動実行モード: upstream（なければ origin/main）との差分を検査
  base="$(git rev-parse --abbrev-ref --symbolic-full-name '@{u}' 2>/dev/null || echo origin/main)"
  echo "🔍 検査範囲: $base..HEAD"
  check_range "$base..HEAD"
else
  # git pre-push hook モード: stdin から <local_ref> <local_sha> <remote_ref> <remote_sha>
  while read -r local_ref local_sha remote_ref remote_sha; do
    [ "$local_sha" = "$Z40" ] && continue  # ブランチ削除はスキップ
    if [ "$remote_sha" = "$Z40" ]; then
      # 新規ブランチ: origin/main との分岐点から検査
      base="$(git merge-base origin/main "$local_sha" 2>/dev/null || echo "")"
      [ -z "$base" ] && continue
      check_range "$base..$local_sha"
    else
      check_range "$remote_sha..$local_sha"
    fi
  done
fi

if [ "$FAIL" -ne 0 ]; then
  echo ""
  echo "🚫 pre-push チェック失敗。push を中止しました。"
  echo "   （緊急時のみ git push --no-verify で回避可能）"
  exit 1
fi

if [ "$WARN" -ne 0 ]; then
  echo ""
  echo "⚠️  警告あり（push は続行されます）"
fi

exit 0
