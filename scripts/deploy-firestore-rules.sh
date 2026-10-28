#!/usr/bin/env bash
# Firestore rules のデプロイ入口。先にゲートを実行し、失敗したら firebase deploy を呼ばない。
#
#   bash scripts/deploy-firestore-rules.sh --dry-run
#       ゲートだけ実行する。firebase deploy は呼ばない。
#   bash scripts/deploy-firestore-rules.sh
#       ゲートが成功したときだけ
#       firebase deploy --only firestore:rules --project cc-dev-ps7
#       を実行する。firebase.json の predeploy がゲートをもう一度実行する。
#
# `firebase deploy --only storage` も firebase.json の storage.predeploy で
# 同じゲートを実行する。CI は資格情報を環境に入れる前にゲートを一度走らせ、
# deploy 中の predeploy がもう一度走ってテストプロセスから資格情報を外す。
set -u

DRY=0
GATE_ARGS=()

while [ $# -gt 0 ]; do
  case "$1" in
    --dry-run)
      DRY=1
      shift
      ;;
    --root)
      if [ $# -lt 2 ] || [ -z "${2:-}" ]; then
        echo "deploy-firestore-rules: --root にはディレクトリが必要です" >&2
        exit 2
      fi
      GATE_ARGS+=(--root "$2")
      shift 2
      ;;
    *)
      echo "deploy-firestore-rules: 不明な引数: $1" >&2
      exit 2
      ;;
  esac
done

SCRIPT_DIR=$(cd "$(dirname "$0")" && pwd)

if ! bash "$SCRIPT_DIR/firestore-rules-gate.sh" ${GATE_ARGS[@]+"${GATE_ARGS[@]}"}; then
  echo "deploy-firestore-rules: 中止。ゲートが失敗したため firebase deploy は開始していません。"
  exit 1
fi

if [ "$DRY" -eq 1 ]; then
  echo "deploy-firestore-rules: ゲートは通過しました。dry-run のため firebase deploy は呼び出していません。"
  exit 0
fi

echo "deploy-firestore-rules: firebase deploy --only firestore:rules --project cc-dev-ps7"
cd "$SCRIPT_DIR/.." || exit 1
exec npx --yes firebase-tools@15.23.0 deploy --only firestore:rules --project cc-dev-ps7 --non-interactive
