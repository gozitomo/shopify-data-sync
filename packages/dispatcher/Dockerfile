FROM node:20-slim
WORKDIR /app

# ルートのpackage.json（workspaces設定）
COPY package*.json ./

# sharedとdispatcherのpackage.jsonをコピー
COPY packages/shared/package.json ./packages/shared/
COPY packages/dispatcher/package.json ./packages/dispatcher/

# workspacesでまとめてinstall
RUN npm install

# ソースコードのコピー
COPY packages/shared ./packages/shared
COPY packages/dispatcher ./packages/dispatcher

# TypeScriptのビルド
RUN npm run build --workspace=packages/shared
RUN npm run build --workspace=packages/dispatcher

CMD ["node", "packages/dispatcher/dist/index.js"]
