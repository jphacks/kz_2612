# サンプル（プロダクト名）

[![IMAGE ALT TEXT HERE](https://jphacks.com/wp-content/uploads/2026/07/IMG_5316.png)](https://www.youtube.com/watch?v=piaNsc6ilBI)

## 製品概要
### 背景(製品開発のきっかけ、課題等）
### 製品説明（具体的な製品の説明）
### 特長
#### 1. 特長1
#### 2. 特長2
#### 3. 特長3

### 解決出来ること
### 今後の展望
### 注力したこと（こだわり等）
* 
* 

## 開発技術
### 活用した技術
#### API・データ
* 
* 

#### フレームワーク・ライブラリ・モジュール
* 
* 

#### デバイス
* 
* 

### 独自技術
#### ハッカソンで開発した独自機能・技術
* 独自で開発したものの内容をこちらに記載してください
* 特に力を入れた部分をファイルリンク、またはcommit_idを記載してください。

## フロントエンド開発

スマートフォン向けのReact + TypeScript + Viteアプリです。FastAPIバックエンドと接続し、フォルダ一覧・作成・写真認証・写真一覧・追加・削除を操作できます。

### 必要環境

- Node.js 20以上
- pnpm 11以上

### ローカル起動

バックエンドを先に起動します。初回セットアップと姿勢推定モデルの準備は [backend/README.md](backend/README.md) を参照してください。

~~~bash
cd backend
.venv/Scripts/python -m app.dev
~~~

別のターミナルでフロントエンドを起動します。

~~~bash
pnpm install
pnpm dev
~~~

http://localhost:5173 をブラウザで開いてください。APIの既定URLは http://localhost:8000 です。変更する場合は .env.example を .env.local にコピーし、VITE_API_BASE_URL を設定します。

### 確認コマンド

~~~bash
pnpm build
pnpm lint
pnpm test
~~~

### 主な画面

- /login：ログイン
- /folders：参加中フォルダ一覧
- /folders/new：フォルダ作成フロー
- /folders/:folderId/unlock：写真認証の開始
- /folders/:folderId/camera：写真認証カメラ
- /folders/:folderId/photos：写真一覧
- /folders/:folderId/upload：写真アップロード
- /folders/:folderId/settings：フォルダ情報

### 現在の接続範囲

- API認証はCognito導入前のため、.env.local の VITE_DEMO_USER_ID を X-User-Id として送ります。
- 写真認証は端末カメラで撮影し、RTMPoseによる最終判定APIへ送ります。
- 撮影中はMediaPipe Pose LandmarkerをWeb Workerで実行し、最大4人の人数と骨格をガイド表示します。
- MediaPipeのWASMとモデルは初回利用時に外部配信元から読み込みます。読み込みに失敗しても撮影とRTMPose判定は利用できます。
- 解除トークンはタブの sessionStorage に保存し、更新後も最大12時間維持します。
- 画像はブラウザでJPEGへ正規化してから、発行されたアップロードURLへ直接PUTします。
- Googleログインとフォルダ削除は未接続です。
