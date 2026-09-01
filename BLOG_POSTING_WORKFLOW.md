# SERIE W Blog Posting Workflow

ChatGPTからのブログ投稿・既存記事画像更新は、画像をCloudinaryへ保存し、GitHubにはCloudinaryの公開URLだけを記録する。

既存記事の本文・見出し・メタ情報・一覧・CTA・画像を差分更新するときは、通常ChatGPTコネクターの `update_seriewa_blog` を使う。新しい添付画像は先に `upload_seriewa_blog_image` でCloudinaryへ保存し、返された `secure_url` だけを更新要求へ渡す。

## 公開前確認ルール（必須）

新規ブログ記事は、画像あり・画像なしを問わず、必ず以下の2段階で扱う。

1. ChatGPTが記事の完成版プレビューを作成し、ユーザーへ提示する。
2. ユーザーがその完成版に対して明示的にOKした後だけ、本番公開Actionを実行する。

最初の「ブログを書いて」「投稿して」「この写真で記事にして」といった依頼だけでは公開承認とみなさない。

プレビューにはタイトル、本文、画像を使う場合は使用画像・配置・altなど、公開内容を判断できる情報を含める。修正依頼を受けた場合は修正版プレビューを再提示し、その修正版への承認を得るまで公開しない。

承認前は `publish_seriewa_blog`、repository dispatch、GitHub Actionsその他の本番公開処理を実行してはならない。

## 初回設定（1回のみ）

Cloudinary Consoleの Upload Presets でブログ専用プリセットを作る。

- Signing mode: Unsigned
- Asset folder: `seriewa/blog`
- Allowed formats: `jpg,jpeg,png,webp`
- Maximum file size: 10 MB
- Disallow public ID: ON
- Unique filename: ON
- Overwrite: OFF
- Incoming transformation: 長辺1600px以内を目安に制限

GitHubリポジトリの Actions secrets に以下を登録する。

- `CLOUDINARY_CLOUD_NAME`
- `CLOUDINARY_UPLOAD_PRESET`

API Secretは登録・使用しない。Unsigned preset名はクライアントから利用できる値だが、不正アップロード対策のため公開HTMLや記事本文には書かず、GitHub Actions secretとして扱う。

## 専用GPTのAction設定

Actionスキーマの正本は `.seriewa/chatgpt-action-openapi.yaml`。

- Server: `https://api.github.com`
- Authentication: API Key / Bearer
- GitHub側の認証情報は専用GPTのAction認証欄へ設定し、スキーマ本文やGPTの指示文には書かない。
- トークンは `nishinomasashi84-svg/seriewa-site` のみに対象を限定したFine-grained PATを使い、必要最小限の権限にする。
- ActionのGPT指示文は `.seriewa/SERIE_W_GPT_INSTRUCTIONS.md` を正本とする。
- GPT Editorでスキーマと指示を更新した後、Previewで実画像を使って確認する。

## 新規記事投稿

1. ユーザーがChatGPTに記事内容と必要に応じて画像を渡す。
2. ChatGPTがタイトル・本文・使用画像などを含む完成版プレビューを提示する。この時点では公開しない。
3. ユーザーが完成版に対して明示的にOKする。
4. 承認後に専用GPTが `publish_seriewa_blog` をrepository dispatchする。
5. GitHub Actionsが `scripts/upload-images-to-cloudinary.mjs` を実行する。
6. CloudinaryのUnsigned Upload APIが画像を受け取り、`secure_url` を返す。
7. `scripts/publish-blog-from-chatgpt.mjs` が新規記事HTMLを生成する。
8. 先頭画像を記事画像とOG/Twitter画像に設定し、ブログ一覧・TOPICS・sitemapを更新する。
9. Organization、WebSite、BlogPosting、BreadcrumbListのJSON-LDを自動生成・更新する。
10. 検証後、mainへ反映する。

画像なし記事でも1〜4の確認フローは同じ。画像がない場合はCloudinaryアップロードを行わず、そのまま画像なし記事として生成する。

新規記事モードは既存slugを上書きしない。

## 既存記事の画像差し替え

ユーザーが写真を1枚添付し、`この写真で blog/futsal-tournament/ の画像を差し替えて` のように指示する。

1. 専用GPTが `update_seriewa_blog_image` をrepository dispatchする。
2. ChatGPTの添付画像参照 `openaiFileIdRefs` から一時ダウンロードURLを受け取る。
3. GitHub Actionsが画像を一時的に取得し、CloudinaryのUnsigned Upload APIへ直接アップロードする。
4. `scripts/replace-blog-image-from-chatgpt.mjs` が指定された `blog/<slug>/index.html` の主画像だけを差し替える。
5. 同じCloudinary画像を元に、本文画像は `f_auto,q_auto,c_limit,w_1200`、`og:image` と `twitter:image` は `f_jpg,q_auto,c_fill,g_auto,w_1200,h_630` を使用する。
6. 更新モードでは変更ファイルが指定記事HTMLの1ファイルだけであることをGitHub Actionsが検証する。ブログ一覧、TOPICS、sitemap、他の記事本文は変更しない。
7. mainへpush後、`scripts/verify-seriewa-blog-live.mjs` が `seriew.com` の公開HTMLを確認する。
8. 対象記事のJSON-LDを更新し、`dateModified`、見出し、説明、画像を現在の内容と同期する。
9. 本文画像、`og:image`、`twitter:image` の3点が一致して確認できた場合だけ `.seriewa/blog-results/<request_id>.json` に `live_verified` の結果を記録する。

指定記事に差し替え対象となる主画像が存在しない場合は、画像を勝手に挿入せず処理を失敗させる。

## 既存記事の差分更新

1. `slug` からmain上の `blog/<slug>/index.html` を取得し、現在の `<title>` を確認する。
2. `update_seriewa_blog` は現在タイトルを確認値として `update_seriewa_blog` のrepository dispatchへ含める。
3. GitHub Actionsは更新直前に同じタイトルを再確認する。タイトルが変わっていれば古い確認に基づく上書きを拒否する。
4. 未指定フィールドは既存HTMLを維持し、指定されたメタ情報、intro、lead、headline、tags、指定section、参考リンク、listing、CTA、画像だけを変更する。
5. sectionは0始まりのindexまたは現在の見出し文字列で指定する。
6. 画像は1〜8枚に対応し、`article_start`、`before_section`、`after_section`、`article_end`を指定できる。section前後ではindexまたは見出しを併用する。
7. 追加画像の先頭（または `use_for_social: true`）を `og:image` と `twitter:image` に使う。
8. 変更可能ファイルは対象記事、対象カードを含む `blog/index.html`、対象TOPICSを含む `index.html` に限定する。sitemapや無関係な記事は変更しない。
9. 対象記事のJSON-LDを更新し、`dateModified`、見出し、説明、画像を現在の内容と同期する。
10. main反映後、本文画像すべて、`og:image`、`twitter:image` をseriew.comで確認し、成功時だけ `live_verified` を記録する。

slugが存在しない、現在タイトルが一致しない、section指定が一意に決まらない、更新差分が空の場合は処理を失敗させる。

## 画像入力

新規記事では `client_payload.image_sources` または専用GPTの `client_payload.openaiFileIdRefs` を利用できる。既存記事画像差し替えでは、添付画像を1枚だけ使用する。

従来の直接指定例:

```json
{
  "image_sources": [
    {
      "source": "https://example.invalid/example.jpg",
      "alt": "泉佐野市オークアリーナでフットサルを楽しむ参加者",
      "caption": "SERIE Wの活動風景"
    }
  ]
}
```

画像はJPEG、PNG、WebP、1枚10MB以下とする。GitHub Actions内で取得した添付画像のバイト列はリポジトリへcommitしない。

## 更新時の安全策

- 新規投稿 `publish_seriewa_blog` と既存画像更新 `update_seriewa_blog_image` を別イベントにする。
- 既存記事の差分更新は `update_seriewa_blog` としてさらに分離する。
- 新規投稿は、完成版プレビューへのユーザー承認がある場合だけ実行する。
- 既存画像更新の対象パスは `blog/<slug>/` または `blog/<slug>/index.html` のみ許可する。
- 既存画像更新はアップロード画像1枚のみ許可する。
- 既存画像更新で変更可能なGit差分は指定記事HTMLの1ファイルだけに限定する。
- 本文の文章、見出し、リンク、一覧順、TOPICS、sitemapを更新しない。
- `secure_url` が `https://res.cloudinary.com/` で始まることを検証する。
- main反映後に公開サイト側でも本文・OG・Twitter画像を確認する。
- 公開確認が終わるまでは成功結果を記録しない。

## ChatGPT添付ファイルに関する注意

専用GPTのActionは `openaiFileIdRefs` を使ってユーザー添付画像を外部処理へ渡す。この機能はOpenAI側のAction実行環境に依存するため、GPT EditorのPreviewで実画像を使ったE2Eテストを必ず行う。

一時URLが外部から取得できない場合はCloudinaryアップロード前に失敗し、記事ファイルは変更されない。ファイル参照が取得できない状態で成功扱いにはしない。

## 運用ルール

- 元画像の権利・掲載許可を確認する。
- 人物写真では、顔出し可否を投稿前に確認する。
- altは「写真に何が写っているか」を具体的に書く。
- 同じ画像の再投稿を避ける。
- Cloudinaryの使用量と不審なアップロードを月1回確認する。
- 不正利用が疑われる場合は、presetを無効化して新しい名前で作り直し、GitHub Actions secretを更新する。
- Unsigned Uploadだけでは削除できない。削除が必要な画像はCloudinary Consoleから削除する。
- API Secretはチャット、GitHub、HTML、JavaScriptへ貼らない。
