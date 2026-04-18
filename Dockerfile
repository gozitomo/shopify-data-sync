# Node.js 軽量イメージ
FROM node:20-slim
WORKDIR /app
COPY package*.json ./

RUN npm install

COPY . .

# Jobsを使用するためポートは不要
# EXPOSE 8080

# 実行コマンドはCloud Run Jobsの設定で上書きする
CMD ["npm", "run", "sync:orders"]