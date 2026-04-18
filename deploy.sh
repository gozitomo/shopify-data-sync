# .env ファイルがあれば読み込む
if [ -f .env ]; then
  export $(grep -v '^#' .env | xargs)
fi

IMAGE_URL="${REGION}-docker.pkg.dev/${PROJECT_ID}/${REPO_NAME}/${IMAGE_NAME}"

echo "🚀 1. ビルドを開始します..."
gcloud builds submit --tag ${IMAGE_URL}

echo "🆙 2. ジョブを最新イメージに更新します..."
gcloud run jobs update ${JOB_NAME} --image ${IMAGE_URL} --region ${REGION}

echo "➡️ 3. ジョブを実行します..."
gcloud run jobs execute ${JOB_NAME} --region ${REGION}

echo "✅ 完了！ブラウザまたは以下のコマンドでログを確認してください:"
echo "gcloud alpha run jobs logs tail ${JOB_NAME} --region ${REGION}"