#!/usr/bin/env bash
# Firestore rules をリリースする前のゲート。このスクリプト自体はデプロイしない。
#
# 1. リポジトリにある Firestore ルールのエミュレータテストを実行する。
#    特定のパスは決め打ちしない（並行PRが tests/firestore/ を足しても、
#    既存の tests/firestore-rules.test.mjs でも、見つかったものを実行する）。
#    テストファイルがまだ1つも無い場合は、その段は通過する（並行PR待ち）。
#    見つかったテストが1つでも失敗したら中止する。
# 2. 既存の cost_guard を実行する。
#    - scripts/cost_guard.py --root <root> --check（PR #3 のデプロイゲート）
#    - scripts/cost-guard-check.js（別ブランチの静的チェック）
#    ファイルがあるものはすべて実行し、1つでも失敗したら中止する。
#    どちらも無い場合は中止する（チェックを省略してデプロイしない）。
#
# 終了コード 0 は「実行したチェックがすべて成功」。firebase deploy は呼ばない。
# firebase.json の firestore.predeploy と scripts/deploy-firestore-rules.sh から使う。
set -u

SCRIPT_DIR=$(cd "$(dirname "$0")" && pwd)
ROOT=$(cd "$SCRIPT_DIR/.." && pwd)
FIREBASE_TOOLS_PKG="firebase-tools@15.23.0"

while [ $# -gt 0 ]; do
  case "$1" in
    --dry-run)
      # このスクリプトは常にデプロイしない。フラグは呼び出し側の明示用。
      shift
      ;;
    --root)
      if [ $# -lt 2 ] || [ -z "${2:-}" ]; then
        echo "gate: --root にはディレクトリが必要です" >&2
        exit 2
      fi
      ROOT=$(cd "$2" && pwd)
      shift 2
      ;;
    *)
      echo "gate: 不明な引数: $1" >&2
      exit 2
      ;;
  esac
done

cd "$ROOT" || exit 1

echo "gate: root=$ROOT"
echo "gate: Firestore ルールテストと cost_guard を実行します。このスクリプトはデプロイしません。"

abort() {
  echo "gate: 中止 — $1"
  echo "gate: firebase deploy は開始していません"
  exit 1
}

have_java() {
  command -v java >/dev/null 2>&1
}

ensure_npm_deps() {
  prefix="$1"
  if [ ! -f "$prefix/package.json" ]; then
    return 0
  fi
  if [ -d "$prefix/node_modules/@firebase/rules-unit-testing" ]; then
    return 0
  fi
    echo "gate: npm dependencies ($prefix)"
    if [ -f "$prefix/package-lock.json" ]; then
      npm ci --ignore-scripts --no-audit --no-fund --prefix "$prefix"
    else
      npm install --ignore-scripts --no-audit --no-fund --prefix "$prefix"
    fi
}

# ---------------------------------------------------------------------------
# ルールテストの発見
# ---------------------------------------------------------------------------
run_package=0
if [ -f "$ROOT/tests/firestore/package.json" ]; then
  if python3 -c 'import json,sys
p=json.load(open(sys.argv[1], encoding="utf-8"))
scripts=p.get("scripts")
sys.exit(0 if isinstance(scripts, dict) and scripts.get("test") else 1)' \
    "$ROOT/tests/firestore/package.json"; then
    run_package=1
  fi
fi

LIST=$(mktemp)
trap 'rm -f "$LIST"' EXIT
: >"$LIST"

if [ -d "$ROOT/tests" ]; then
  if [ "$run_package" -eq 1 ]; then
    find "$ROOT/tests" -type f \
      \( -name '*rules*.test.mjs' -o -name '*rules*.test.js' -o -name '*rules*.test.cjs' \
         -o -name '*firestore*.test.mjs' -o -name '*firestore*.test.js' -o -name '*firestore*.test.cjs' \) \
      -not -path '*/node_modules/*' \
      -not -path "$ROOT/tests/firestore/*" \
      -print >>"$LIST"
  else
    find "$ROOT/tests" -type f \
      \( -name '*rules*.test.mjs' -o -name '*rules*.test.js' -o -name '*rules*.test.cjs' \
         -o -name '*firestore*.test.mjs' -o -name '*firestore*.test.js' -o -name '*firestore*.test.cjs' \) \
      -not -path '*/node_modules/*' \
      -print >>"$LIST"
    if [ -d "$ROOT/tests/firestore" ]; then
      find "$ROOT/tests/firestore" -type f \
        \( -name '*.test.mjs' -o -name '*.test.js' -o -name '*.test.cjs' \) \
        -not -path '*/node_modules/*' \
        -print >>"$LIST"
    fi
  fi
fi

if [ -d "$ROOT/tests/firestore-rules" ]; then
  find "$ROOT/tests/firestore-rules" -type f \
    \( -name '*.mjs' -o -name '*.js' -o -name '*.cjs' \) \
    -not -path '*/node_modules/*' \
    -print >>"$LIST"
fi

STANDALONE=$(mktemp)
trap 'rm -f "$LIST" "$STANDALONE"' EXIT
sort -u "$LIST" >"$STANDALONE"

standalone_count=0
if [ -s "$STANDALONE" ]; then
  standalone_count=$(wc -l <"$STANDALONE" | tr -d ' ')
fi

if [ "$run_package" -eq 0 ] && [ "$standalone_count" -eq 0 ]; then
  echo "gate: ルールテストは見つかりませんでした。並行して追加されるテストがまだ無いので、この段は通過します。"
else
  if ! have_java; then
    abort "Firestore エミュレータには Java が必要です（java コマンドがありません）"
  fi

  if [ "$run_package" -eq 1 ]; then
    echo "gate: rules suite: npm --prefix tests/firestore test"
    ensure_npm_deps "$ROOT/tests/firestore" || abort "tests/firestore の依存関係を入れられませんでした"
    only="firestore"
    project="demo-cc-dev"
    config_args=""
    if [ -f "$ROOT/firebase.rules-test.json" ]; then
      only="auth,firestore,storage"
      project="demo-cc-dev-cost"
      config_args="--config firebase.rules-test.json"
    else
      echo "gate: firebase.rules-test.json が無いので Firestore エミュレータだけで tests/firestore を実行します"
    fi
    # shellcheck disable=SC2086
    if ! npx --yes "$FIREBASE_TOOLS_PKG" emulators:exec --only "$only" --project "$project" $config_args \
      "npm --prefix tests/firestore test"; then
      abort "tests/firestore のルールテストが失敗しました"
    fi
  fi

  if [ "$standalone_count" -gt 0 ]; then
    if [ -f "$ROOT/tests/package.json" ]; then
      ensure_npm_deps "$ROOT/tests" || abort "tests の依存関係を入れられませんでした"
    fi
    inner=""
    while IFS= read -r file; do
      [ -n "$file" ] || continue
      echo "gate: rules test: $file"
      # emulators:exec は /bin/sh でコマンドを実行する。bash の %q は使わない。
      escaped=$(printf '%s' "$file" | sed "s/'/'\\\\''/g")
      if [ -z "$inner" ]; then
        inner="node '$escaped'"
      else
        inner="$inner && node '$escaped'"
      fi
    done <"$STANDALONE"
    if ! npx --yes "$FIREBASE_TOOLS_PKG" emulators:exec --only firestore --project demo-cc-dev "$inner"; then
      abort "Firestore ルールテストが失敗しました"
    fi
  fi
  echo "gate: ルールテストは成功しました"
fi

# ---------------------------------------------------------------------------
# cost_guard
# ---------------------------------------------------------------------------
ran_cost_guard=0

if [ -f "$ROOT/scripts/cost_guard.py" ]; then
  ran_cost_guard=1
  echo "gate: cost_guard: python3 scripts/cost_guard.py --root . --check"
  if ! python3 "$ROOT/scripts/cost_guard.py" --root "$ROOT" --check; then
    abort "scripts/cost_guard.py --check が失敗しました"
  fi
fi

if [ -f "$ROOT/scripts/cost-guard-check.js" ]; then
  ran_cost_guard=1
  echo "gate: cost_guard: node scripts/cost-guard-check.js"
  if ! node "$ROOT/scripts/cost-guard-check.js"; then
    abort "scripts/cost-guard-check.js が失敗しました"
  fi
fi

if [ "$ran_cost_guard" -eq 0 ]; then
  abort "cost_guard がリポジトリにありません（scripts/cost_guard.py または scripts/cost-guard-check.js）。チェックを省略してデプロイはしません"
fi

echo "gate: 成功 — 実行したルールテストと cost_guard はすべて通過しました"
echo "gate: firebase deploy は開始していません"
exit 0
