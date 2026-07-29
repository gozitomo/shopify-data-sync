# Node.js 軽量イメージ
FROM node:20-slim
WORKDIR /app

COPY package*.json ./

# workspace 依存(@shopify-data-sync/shared)は esbuild で dist にバンドル済みなので、
# Docker では package.json から除外して npm レジストリを見に行かないようにする。
RUN npm pkg delete dependencies.@shopify-data-sync/shared \
 && npm install --omit=dev

# バンドル済みの実行ファイル（deploy 前に npm run build で生成しておく）
COPY dist ./dist

# 既定は注文同期。商品同期ジョブは Cloud Run 側で command/args を上書きする。
CMD ["node", "dist/orders-data-sync.cjs"]
