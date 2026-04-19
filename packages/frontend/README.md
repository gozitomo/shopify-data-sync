# progress-farm Ship Dashboard

- Shopifyマイストアの在庫、受注状況を日次で取得、表示する生産管理用SPA
- QRコードからヤマト伝票番号を読み取りShip&CoのShippingページを別タブ表示

## 使用技術

**Frontend**: React, ReactRouterv7, TailwindCSS, TypeScript
**Infrastracture**: AWS S3, AmazonCloudFront
**Backend Interface**: Amazon Lambda(Function URL)
**CI/CD**: GitHub Actions

## デプロイ構成

このプロジェクトは、GitHubへの`push`をトリガーに自動デプロイされます。

1. Build: GitHub Actions上でビルドを実行
1. Auth: OIDC(OpenID Connect)を使用。アクセスキー不要のAWS認証
1. Deploy:
   - S3バケットへの静的ファイル同期
   - CloudFrontのキャッシュクリア

## ローカル開発用コマンド

```bash
npm install
npm run dev
```
