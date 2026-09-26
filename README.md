# 表象 / representation

パブリックドメインの自由詩、俳句、短歌、定型を読むアプリである。自由詩と定型は日本語と英語を交互に出し、俳句と短歌は日本語だけを出す。今日の一首に好き、嫌い、理由を残し、次の一首へ進める。

製品の決定は [PLAN.md](PLAN.md)、見た目と動きは [design.md](design.md)、実装の範囲は [AGENTS.md](AGENTS.md) を正とする。

## 必要なもの

- Node.js 22.13 以降、または 24.3 以降
- npm

## 起動

```bash
npm install
npm run web
```

ブラウザで `http://localhost:8081` が開く。今日、好み、読んだ詩の三画面がある。

### スマホで確認する

Expo Go から接続する。ブラウザの `npm run web` とは別の起動である。

1. スマホに Expo Go を入れる。App Store か Google Play で、SDK 57 に対応した版にする。
2. PC とスマホを同じ Wi-Fi にする。
3. `npm run web` が 8081 を使っているときは、先に止める。
4. 同じディレクトリで起動する。

```bash
npm start
```

5. ターミナルの QR を読む。Android は Expo Go の Scan QR code。iPhone はカメラで QR を読み、Expo Go で開く。

WSL2 では、通常の QR がスマホから届かないことがある。そのときはトンネルで起動し、出た QR を同じように読む。初回はトンネル用の取得でネットワークが要る。

```bash
npx expo start --tunnel
```

反応と読んだ位置は、その端末の中に残る。ブラウザで付けた好きやコメントは、スマホには出ない。詩の本文は `data/poems.json` に同梱してあり、起動のたびに取りにいかない。

## テスト

次の一首の選択を確認する。

```bash
npm test
```

## 詩の同梱

本文は青空文庫か Project Gutenberg のファイルから切り出す。再生成はネットワークが要る。

```bash
node scripts/extract-poems.mjs
```
