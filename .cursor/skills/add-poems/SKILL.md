---
name: add-poems
description: >-
  Adds about twenty-four public-domain poems to representation by extending
  scripts/extract-poems.mjs and regenerating data/poems.json from Aozora Bunko
  or Project Gutenberg files. Use when the user asks to add poems, expand the
  corpus, run the poem batch, 詩を足す, 詩を追加, 同梱を増やす, or continue the extract.
---

# 詩を二十四首足す

一回の実行で、いま入っている詩に約二十四首を足す。二百四十首をこの回で埋めない。数日に一回、同じ速さで繰り返す想定である。

製品の線は [PLAN.md](../../../PLAN.md) と [AGENTS.md](../../../AGENTS.md)。本文はモデルの記憶から書かない。`data/poems.json` は手で編集しない。

## 手順

```text
- [ ] 不足を数える
- [ ] 足す一首を、ファイルとカードで決める
- [ ] 切り出しをスクリプトの末尾に足す
- [ ] スクリプトを実行する
- [ ] 既存の本文が変わっていないことを見る
- [ ] 件数、見送り、残りの不足を報告する
```

### 不足を数える

`scripts/extract-poems.mjs` の既存 `id` と、`data/poems.json` の `form` と `lang` を数える。目標は、自由詩の日本語四十、英語四十、俳句の日本語四十、短歌の日本語四十、定型の日本語四十、英語四十。この回は、足りない型へ寄せて約二十四首で止める。

収録する詩人は PLAN.md の一覧を正とする。未収録を優先し、既収録でもその型が四十に届いていなければ数首まで足してよい。一覧に無い詩人は、作者不明の古典で、青空文庫に底本がある場合だけ。

一詩人から数首にする。詩集をまとめて入れない。その型として読める一首だけを取る。散文詩は捨てる。俳句と短歌は `ja` のみ。ソネットは `fixed` のままにする。

### ファイルとカードで決める

日本語は青空文庫の作品ファイルだけ、英語は Project Gutenberg のプレーンテキストだけを取得する。対訳集、Poetry Foundation、poets.org からは取らない。

作品ごとに図書カードかヘッダを開く。日本の保護期間は没後七十年で、その翌年の一月一日に切れる。実行日の時点で切れていない詩人は入れない。英語も、アメリカのパブリックドメインとは別に没年を確認する。カードやヘッダに許諾で公開とある作品は除く。底本の詩集名と刊行年、ファイルの URL を記録する。

切り方が分からないファイルは見送る。本文を記憶で補わない。

確認のために落とした HTML とテキストは `scripts/work/` にだけ置く。リポジトリのルート、`data/`、`app/` には書かない。このディレクトリは同梱しない。

### スクリプトの末尾に足す

既存の `add({...})` の順は変えない。新しい一首は、検証ループの直前に足す。`order` は `add` が付ける。

ファイルの形が既存の関数と合うときはそれを使う。`headingPoems`、`gutenbergSlice`、`sonnet`、`blakePoem`、`betweenTitles`、`takuboku`、`akikoLines`、`hosaiLines`、`shikiLines`。合わないときだけ、近くに小さい切り出し関数を足す。取得は既存の `fetchText` に URL を足す。

一首の形は次のとおり。

```js
add({
  id: "free-take",
  poet: "萩原朔太郎",
  source: "現代詩文庫　1009　萩原朔太郎",
  sourceYear: 1975,
  origin: "https://www.aozora.gr.jp/cards/000067/files/859_21656.html",
  deathYear: 1942,
  form: "free",
  lang: "ja",
  title: "竹",
  body: pick(hagiwara, "竹"),
  see: ["plant", "morning", "sky", "light", "scenery"],
  say: ["stops"],
});
```

`id` は `{form}-{短いラテン名}`。題の語が他の詩とぶつかりそうなときは、`haiku-shiki-usuyo` のように詩人の印を入れる。既存の `id` は変えない。同じ文字列を別の詩に付けない。反応の保存先がこの `id` である。

`body` は切り出し関数の戻り値だけにする。旧字旧仮名、改行、行の幅はファイルのまま残す。対訳しない。

`see` と `say` は、切り出した本文を読んで、次の語だけから複数付ける。`rhyme` と `shichigo` は定型だけに付ける。

| 見ること `see` | 言うこと `say` |
|---|---|
| `light` `water` `indoor` `street` `plant` `food` `sky` | `short_line` 行が短い |
| `morning` `day` `evening` `night` | `names_feeling` 気持ちをそのまま言う |
| `person` `object` | `one_leap` 具体から一行だけずらす |
| `ordinary` `scenery` | `stops` 余韻が残る |
| | `explains` 説明を残す |
| | `rhyme` 脚韻、`shichigo` 七五 |

`source` と `body` に Project Gutenberg の名称とライセンス文を入れない。取得元の URL は `origin` に残してよい。

### 実行して確認する

ネットワークが要る。

```bash
node scripts/extract-poems.mjs
```

スクリプトは、重複した `id`、八字未満の本文、本文中の `project gutenberg` で止まる。止まったら切り出しを直し、本文を記憶で埋めない。

通ったあと、実行前からある `id` の `body`、`title`、`poet`、`origin`、`order` が同じであることを見る。新しいオブジェクトは末尾に増えていることだけを確認する。数首は、取得したファイルの該当箇所と本文が一致することも見る。

### 報告

日本語で、足した `id`、型ごとの本数、見送った作品とその理由、目標までの残りを書く。コミットは、頼まれたときだけ作る。
