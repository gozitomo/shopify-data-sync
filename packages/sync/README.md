# shopify-data-sync

ShopifyのデータをFirestoreへ同期するバッチ処理システム。

## Description

このプロジェクトは、Shopify GraphQL APIを使用して以下の4ステップでデータの同期を行います。

1. **Auth**: Client IDとSecretを使用してShopifyのアクセストークンを自動取得。
2. **Extract**: Shopify GraphQL APIよりOrder（注文）およびProduct（商品）データを抽出（`read_all_orders` スコープによる全期間データ対応）。
3. **Transform**: Shopifyの階層の深いJSONデータを、Firestoreのドキュメント構造に最適化。
4. **Load**: Firestoreへデータを保存（既存ドキュメントは更新）。

## Features

- **自動トークン更新**: 24時間で失効するトークンを実行のたびに自動再発行。
- **ページネーション対応**: 大量の注文データもカーソルベースのページングで漏らさず取得。
- **全件同期**: `read_all_orders` 権限により、過去のすべての注文履歴を同期可能。

## Skill Sets

- **Language**: TypeScript (Node.js / tsx)
- **API**: Shopify GraphQL Admin API
- **Infrastructure**: Google Cloud Platform (GCP)

## GCP Services

- **Cloud Run Jobs**: 同期スクリプトの実行基盤。
- **Cloud Build**: Dockerイメージのビルド・管理。
- **Cloud Scheduler**: 1時間おき / 1日1回などの定期実行スケジュール設定。
- **Firestore**: 同期データの保存先データベース。
- **Artifact Registry**: コンテナイメージの保存。

## Setup / Local Execution

```bash
# 依存関係のインストール
npm install

# 注文データの同期実行
npm run sync:orders

# 商品データの同期実行
npm run sync:products
```
