# SERIE W Blog Posting Workflow

ChatGPTからのブログ投稿は、画像をCloudinaryへ保存し、GitHubにはCloudinaryの公開URLだけを記録する。

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

## ChatGPTからの自動投稿

1. ユーザーがChatGPTに画像と記事内容を渡す。
2. ChatGPTが `publish_seriewa_blog` の投稿データを送る。
3. GitHub Actionsが `scripts/upload-images-to-cloudinary.mjs` を実行する。
4. CloudinaryのUnsigned Upload APIが画像を受け取り、`secure_url` を返す。
5. `scripts/publish-blog-from-chatgpt.mjs` が記事HTMLを生成する。
6. 先頭画像を記事画像とOG画像に設定し、ブログ一覧・TOPICS・sitemapを更新する。
7. 検証後、mainへ反映する。

## 画像入力

`client_payload.image_sources` に1〜8枚指定できる。GitHub内の画像パスまたはHTTPS URLを利用できる。

```json
{
  "image_sources": [
    {
      "source": "images/blog/example.jpg",
      "alt": "泉佐野市オークアリーナでフットサルを楽しむ参加者",
      "caption": "SERIE Wの活動風景"
    }
  ]
}
```

画像がない記事は従来どおり投稿できる。画像付き記事ではCloudinaryのURLを自動生成し、先頭画像は優先読み込み、2枚目以降は遅延読み込みにする。表示URLには `f_auto,q_auto,c_limit,w_1200`、OG画像には `f_jpg,q_auto,c_fill,g_auto,w_1200,h_630` を適用する。

## 運用ルール

- 元画像の権利・掲載許可を確認する。
- 人物写真では、顔出し可否を投稿前に確認する。
- altは「写真に何が写っているか」を具体的に書く。
- 同じ画像の再投稿を避ける。
- Cloudinaryの使用量と不審なアップロードを月1回確認する。
- 不正利用が疑われる場合は、presetを無効化して新しい名前で作り直し、GitHub Actions secretを更新する。
- Unsigned Uploadだけでは削除できない。削除が必要な画像はCloudinary Consoleから削除する。
- API Secretはチャット、GitHub、HTML、JavaScriptへ貼らない。
