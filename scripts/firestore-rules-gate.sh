#!/usr/bin/env bash
# Firestore / Storage rules をリリースする前のゲート。このスクリプト自体はデプロイしない。
#
# 1. ルールテストを1件以上、エミュレータ上のデモプロジェクトだけで実行する。
#    テストが0件なら失敗（ファイル名が変わって見つからなくなってもデプロイしない）。
#    見つかったものはすべて実行する（tests/firestore の npm test、
#    tests/**/*rules*.test.*、tests/**/*firestore*.test.*、tests/firestore-rules/**）。
# 2. テストプロセスからは本番の資格情報を外す。
#    GOOGLE_APPLICATION_CREDENTIALS / FIREBASE_TOKEN / FIREBASE_SA などが見えていたら
#    テスト用プロセスから外し、外しきれなければテストを開始しない。
#    エミュレータの --project は demo- のみ。子プロセスが demo- と
#    FIRESTORE_EMULATOR_HOST を見ていなければ失敗。
# 3. 既存の cost_guard を実行する。
#    - scripts/cost_guard.py --root <root> --check（PR #3 と同じコマンド）
#    - scripts/cost-guard-check.js（別ブランチの静的チェック）
#    ファイルがあるものはすべて実行し、1つでも失敗したら中止する。
#    どちらも無い場合は中止する。
#
# PR #3 との統合:
#   このスクリプトが cost_guard.py --check を呼ぶので、firebase.json の
#   firestore と storage の predeploy はこの1行だけにする。
#   #3 側の `python3 "$PROJECT_DIR/scripts/cost_guard.py" --check` は
#   リベース時に削除する（残すと二重実行になる）。
#   functions の predeploy は #3 の cost_guard.py --check のままにする
#   （関数デプロイではルールのエミュレータテストを要求しない）。
#
# 終了コード 0 は「テストが1件以上成功し、実行した cost_guard も成功」。
# firebase deploy は呼ばない。
set -u

SCRIPT_DIR=$(cd "$(dirname "$0")" && pwd)
ROOT=$(cd "$SCRIPT_DIR/.." && pwd)
FIREBASE_TOOLS_PKG="firebase-tools@15.23.0"

# 値は表示しない。テスト用プロセスから外す名前。
# FIREBASE_CONFIG は親から外す（本番プロジェクトの設定が残るため）。
# エミュレータが demo- の FIREBASE_CONFIG を子に作り直すのは許可する。
CRED_NAMES="GOOGLE_APPLICATION_CREDENTIALS GOOGLE_APPLICATION_CREDENTIALS_JSON GOOGLE_CREDENTIALS GOOGLE_OAUTH_ACCESS_TOKEN GOOGLE_GHA_CREDS_PATH FIREBASE_TOKEN FIREBASE_SA FIREBASE_SERVICE_ACCOUNT GCLOUD_SERVICE_KEY CLOUDSDK_AUTH_CREDENTIAL_FILE_OVERRIDE CLOUDSDK_AUTH_ACCESS_TOKEN FIREBASE_CONFIG GOOGLE_CLOUD_PROJECT"

while [ $# -gt 0 ]; do
  case "$1" in
    --dry-run)
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
echo "gate: ルールテストと cost_guard を実行します。このスクリプトはデプロイしません。"

abort() {
  echo "gate: 中止 — $1"
  echo "gate: firebase deploy は開始していません"
  exit 1
}

have_java() {
  command -v java >/dev/null 2>&1
}

# このシェル（テストを起動するプロセス）から資格情報を外す。失敗したら 1。
strip_credentials() {
  name=""
  val=""
  for name in $CRED_NAMES; do
    eval "val=\${$name-}"
    if [ -n "$val" ]; then
      echo "gate: テスト実行前に環境変数を外します: $name"
      unset "$name" || return 1
    fi
  done
  for name in $CRED_NAMES; do
    eval "val=\${$name-}"
    if [ -n "$val" ]; then
      echo "gate: 環境変数 $name を外せませんでした" >&2
      return 1
    fi
  done
  return 0
}

require_demo_project() {
  case "$1" in
    demo-*)
      return 0
      ;;
    *)
      echo "gate: エミュレータのプロジェクトは demo- で始める必要があります ($1)" >&2
      return 1
      ;;
  esac
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

write_env_check() {
  if [ -n "${ENV_CHECK:-}" ]; then
    rm -f "$ENV_CHECK"
  fi
  ENV_CHECK=$(mktemp)
  {
    echo "const banned = ["
    for name in $CRED_NAMES; do
      case "$name" in
        FIREBASE_CONFIG) ;;
        *) printf "  '%s',\n" "$name" ;;
      esac
    done
    echo "];"
    cat << 'EOF'
const present = banned.filter((key) => process.env[key]);
if (present.length) {
  console.error('gate: テストプロセスに本番資格情報が残っています: ' + present.join(','));
  process.exit(2);
}
const project = process.env.GCLOUD_PROJECT || '';
if (!project.startsWith('demo-')) {
  console.error('gate: デモプロジェクト以外ではテストしません: ' + (project || '(empty)'));
  process.exit(2);
}
const cloudProject = process.env.GOOGLE_CLOUD_PROJECT || '';
if (cloudProject && !cloudProject.startsWith('demo-')) {
  console.error('gate: GOOGLE_CLOUD_PROJECT がデモプロジェクトではありません: ' + cloudProject);
  process.exit(2);
}
if (process.env.FIREBASE_CONFIG) {
  let cfg = null;
  try { cfg = JSON.parse(process.env.FIREBASE_CONFIG); } catch (e) { cfg = null; }
  const id = cfg && cfg.projectId;
  if (!id || String(id).indexOf('demo-') !== 0 || cfg.private_key || cfg.client_email || cfg.type === 'service_account') {
    console.error('gate: FIREBASE_CONFIG がデモプロジェクトのクライアント設定ではありません');
    process.exit(2);
  }
}
const only = String(process.env.GATE_EMULATOR_ONLY || '').split(',').filter(Boolean);
function need(flag, envName) {
  if (only.indexOf(flag) !== -1 && !process.env[envName]) {
    console.error('gate: ' + envName + ' が無いのでテストしません');
    process.exit(2);
  }
}
need('firestore', 'FIRESTORE_EMULATOR_HOST');
need('storage', 'FIREBASE_STORAGE_EMULATOR_HOST');
need('auth', 'FIREBASE_AUTH_EMULATOR_HOST');
const hosts = ['FIRESTORE_EMULATOR_HOST', 'FIREBASE_STORAGE_EMULATOR_HOST', 'FIREBASE_AUTH_EMULATOR_HOST']
  .filter((key) => process.env[key])
  .map((key) => key + '=' + process.env[key])
  .join(' ');
console.log('gate: test process credentials=none project=' + project + ' ' + hosts);
EOF
  } >"$ENV_CHECK"
}

# 資格情報を外した子シェルでエミュレータテストを走らせる。
# 追加引数は emulators:exec のオプション（--config など）。最後の引数はテストコマンド。
run_emulator() {
  only="$1"
  project="$2"
  shift 2
  require_demo_project "$project" || return 1
  (
    strip_credentials || exit 1
    echo "gate: emulator --only $only --project $project"
    # shellcheck disable=SC2086
    env GATE_EMULATOR_ONLY="$only" npx --yes "$FIREBASE_TOOLS_PKG" emulators:exec \
      --only "$only" --project "$project" "$@"
  )
}

sh_quote() {
  printf '%s' "$1" | sed "s/'/'\\\\''/g"
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
STANDALONE=$(mktemp)
ENV_CHECK=""
trap 'rm -f "$LIST" "$STANDALONE" "$ENV_CHECK"' EXIT
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

sort -u "$LIST" >"$STANDALONE"

standalone_count=0
if [ -s "$STANDALONE" ]; then
  standalone_count=$(grep -c . "$STANDALONE" || true)
fi

package_count=0
if [ "$run_package" -eq 1 ] && [ -d "$ROOT/tests/firestore" ]; then
  package_count=$(find "$ROOT/tests/firestore" -type f \
    \( -name '*.test.mjs' -o -name '*.test.js' -o -name '*.test.cjs' \) \
    -not -path '*/node_modules/*' | grep -c . || true)
fi

test_count=$((package_count + standalone_count))
if [ "$test_count" -eq 0 ]; then
  abort "ルールテストが1件もありません。テストファイルが無い状態ではデプロイしません"
fi

if ! have_java; then
  abort "ルールエミュレータには Java が必要です（java コマンドがありません）"
fi

if [ "$run_package" -eq 1 ]; then
  echo "gate: rules suite: npm --prefix tests/firestore test ($package_count files)"
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
  if ! (
    strip_credentials || exit 1
    ensure_npm_deps "$ROOT/tests/firestore"
  ); then
    abort "tests/firestore の依存関係を入れられませんでした"
  fi
  write_env_check
  inner="node '$(sh_quote "$ENV_CHECK")' && npm --prefix tests/firestore test"
  # shellcheck disable=SC2086
  if ! run_emulator "$only" "$project" $config_args "$inner"; then
    abort "tests/firestore のルールテストが失敗しました"
  fi
fi

if [ "$standalone_count" -gt 0 ]; then
  if ! (
    strip_credentials || exit 1
    if [ -f "$ROOT/tests/package.json" ]; then
      ensure_npm_deps "$ROOT/tests"
    fi
  ); then
    abort "tests の依存関係を入れられませんでした"
  fi
  write_env_check
  inner="node '$(sh_quote "$ENV_CHECK")'"
  while IFS= read -r file; do
    [ -n "$file" ] || continue
    echo "gate: rules test: $file"
    inner="$inner && node '$(sh_quote "$file")'"
  done <"$STANDALONE"
  if ! run_emulator firestore demo-cc-dev "$inner"; then
    abort "Firestore ルールテストが失敗しました"
  fi
fi

echo "gate: ルールテストは成功しました"

# ---------------------------------------------------------------------------
# cost_guard（PR #3 の predeploy と同じ --check。オフライン）
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

echo "gate: 成功 — ルールテストと cost_guard はすべて通過しました"
echo "gate: firebase deploy は開始していません"
exit 0
