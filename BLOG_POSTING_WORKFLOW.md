# SERIE W Blog Posting Workflow

今後のChatGPTチャットからのブログ投稿は、原則として以下の手順で処理する。

1. チャットに添付された画像をWeb用JPEGへ最適化する（長辺目安 1200px以下、JPEG品質 70〜85程度）。
2. 画像は GitHub の `images/blog/` 配下へ保存する。
3. 記事HTMLを `blog/<slug>/index.html` に作成・更新する。
4. 記事本文に画像を `loading="lazy"` 付きで配置する。
5. `blog/index.html` の最新記事カードを更新する。
6. `sitemap.xml` に記事URLを追加する。
7. 可能な場合は記事画像をOG画像にも設定する。

## 画像命名規則

`images/blog/<slug>-01.jpg`

複数画像は `-02`, `-03` と連番にする。

## 運用方針

通常の単発ブログ投稿はチャットで完結させる。大量画像処理、サイト全体の大規模改修、長時間の一括作業のみWorkを使う。
