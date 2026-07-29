#!/bin/bash
set -e

# .envから環境変数を読み込む
source .env

IMAGE_NAME="asia-northeast1-docker.pkg.dev/${PROJECT_ID}/${REPO_NAME}/shopify-sync"

echo "=== shared & sync をバンドル（shared をインライン化） ==="
# esbuild は shared の main(dist/index.js) を辿るので、先に shared をビルドしておく。
# 古い出力が混ざらないよう dist を作り直す。
rm -rf packages/sync/dist
npm --prefix packages/shared run build
npm --prefix packages/sync run build

echo "=== syncイメージをビルド & プッシュ ==="
gcloud builds submit packages/sync \
  --tag="${IMAGE_NAME}" \
  --project="${PROJECT_ID}" \
  --default-buckets-behavior=REGIONAL_USER_OWNED_BUCKET

echo "=== Cloud Run Jobs を更新（なければ作成） ==="
for JOB in shopify-orders-sync shopify-products-sync; do
  # ジョブごとに実行するバンドルを切り替える（同一イメージ・command 上書き）。
  case "${JOB}" in
    shopify-orders-sync)   ENTRY="dist/orders-data-sync.cjs" ;;
    shopify-products-sync) ENTRY="dist/products-data-sync.cjs" ;;
  esac

  if gcloud run jobs describe "${JOB}" --region="${REGION}" --project="${PROJECT_ID}" &>/dev/null; then
    gcloud run jobs update "${JOB}" \
      --image="${IMAGE_NAME}" \
      --command="node" \
      --args="${ENTRY}" \
      --region="${REGION}" \
      --project="${PROJECT_ID}"
  else
    gcloud run jobs create "${JOB}" \
      --image="${IMAGE_NAME}" \
      --command="node" \
      --args="${ENTRY}" \
      --region="${REGION}" \
      --project="${PROJECT_ID}"
  fi
done

echo "=== デプロイ完了 ==="
