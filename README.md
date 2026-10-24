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

スマートフォン向けのReact + TypeScript + Viteアプリです。現在はモックデータで主要画面と画面遷移を確認できます。

### 必要環境

- Node.js 20以上
- pnpm 11以上

### 起動

~~~bash
pnpm install
pnpm dev
~~~

表示されたURLをブラウザで開いてください。最初はログイン画面が表示されます。

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
- /folders/summer-2026/unlock：写真認証の開始
- /folders/summer-2026/camera：写真認証カメラ
- /folders/summer-2026/photos：写真一覧
- /folders/summer-2026/upload：写真アップロード
- /folders/summer-2026/settings：フォルダ情報・削除

現時点ではGoogleログイン、API通信、実カメラ、MediaPipe、画像アップロードはモックです。各機能は後続の機能ブランチで接続します。
