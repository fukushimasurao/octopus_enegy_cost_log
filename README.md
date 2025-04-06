# Octopus Energy 電力使用量モニタリングスクリプト

## 概要
このプロジェクトは、Octopus Energyの電力使用量データをGoogle Apps Script（GAS）を使用して自動的に収集し、Google スプレッドシートに記録するとともに、LINEで通知するシステムです。

## 機能
- Octopus Energy APIを使用して前日の電力使用量データを取得
- 1日あたりの総電力使用量（kWh）と推定電気料金を計算
- Google スプレッドシートに使用量データを記録（既存データの更新または新規データの追加）
- 月次集計（23日〜翌月22日）の計算
- LINE通知による日次・月次の電力使用量と料金情報の共有

## セットアップ方法

### 前提条件
- Octopus Energyのアカウント
- LINEのアカウントとLINE Messaging APIのチャネルアクセストークン
- Google アカウント

### インストール手順
1. このリポジトリをクローン
   ```bash
   git clone [リポジトリURL]
   cd octopusenergy
   ```

2. `config.sample.js`を参考に、`config.js`ファイルを作成して必要な情報を入力
   ```javascript
   const CONFIG = {
     OCTOPUS_EMAIL: "your.email@example.com",
     OCTOPUS_PASSWORD: "your_password",
     LINE_CHANNEL_ACCESS_TOKEN: 'your_line_token',
     LINE_USER_ID: 'your_line_user_id',
     SPREADSHEET_ID: 'your_spreadsheet_id',
     SHEET_NAME: 'your_sheet_name'
   };
   ```

3. Google Apps Scriptにプロジェクトをデプロイ
   ```bash
   npx @google/clasp push
   ```

4. GASのエディタでトリガーを設定して、毎日自動実行されるようにする

## ファイル構成
- `code.gs` - メインスクリプト
- `config.js` - 設定ファイル（機密情報を含むため、Gitリポジトリには含まれません）
- `config.sample.js` - 設定ファイルのサンプル
- `.clasp.json` - GASプロジェクトの設定ファイル
- `.gitignore` - Gitの除外設定ファイル

## 開発ワークフロー
1. コードを編集
2. Git commit で変更を記録
3. Git push で変更をGitHubにアップロード（pre-pushフックにより自動的にGASにもpushされます）

## 使用技術
- Google Apps Script (GAS)
- Octopus Energy GraphQL API
- LINE Messaging API
- Google スプレッドシート

## 注意事項
- 機密情報（APIキー、パスワード等）は`config.js`に保存し、Gitリポジトリには含めないでください
- 実際の電気料金は電力会社の請求と異なる場合があります