# UNDER GREEN 公式サイト 公開データ

GitHub Pages でそのまま公開できる構成です。PHP・データベース・ビルド処理は不要で、ファイルをリポジトリに置けば反映されます。

## ページの構成（上から順）

1. 読み込み画面 … 光るレタスが育ちながら 000%→100%（2回目以降の訪問は短縮）
2. トップ … ブラウザ栽培デモ（`official-demo.html`）が背景で動いている。「栽培をはじめる」かデモ部分のクリックで全画面で遊べる。「サイトを見る」か Esc で戻る
3. プロローグ … スクロールに合わせて文章が復元されていく
4. STORY … 世界観（背景は Godot 版の街の映像。プロローグと同じ文は重ねて出さない）
5. GAME … 機能紹介。右の一覧（人物レコードと同じ切り替え式）で選ぶ。画像が複数ある項目は、画面下のサムネイル・矢印・画面のクリックで切り替えられる
6. CHARACTERS … 人物（Godot 版の立ち絵）
7. PLAY / MEDIA … 開発情報・出展履歴・リンク、掲載情報
8. TRAILER … PV「求人案内動画編」
9. CREDITS … クレジット（`credits.csv`）
10. CONTACT … 公式X と、3D のサポートロボット（Godot 版のモデル。クリックで反応）

メニューの並びは `site-content.csv` の `header,nav` の `order` 列の順で、見出しの番号（01〜07）もその順に自動で振られます。

### 栽培デモのモデル

栽培デモのサポートロボット・栽培ポッド・レタスは Godot 版（本編）のモデルです（`godot-models.js`、`site/models/`）。本編の anime_tv の見た目（光と影の2段・紺色の輪郭線）に寄せ、ロボットは本編のクリップ（待機・歩き・作業・喜び）、ポッドは起動・浮遊・停止、レタスは本編と同じ成長の形キーで育ちます。読み込めなかったときは、以前の仮モデルのまま動きます。

便利な URL:

- `…/UnderGreenOfficial/#play` … 開いてすぐ栽培デモを全画面で始める
- `…/UnderGreenOfficial/?skipIntro` … 読み込み画面を省く
- `…/UnderGreenOfficial/#characters` など … 各セクションへ直接移動

## 中身の差し替え（site-content.csv）

文章・画像・動画はほぼすべて `site-content.csv` で変えられます。列は `section,key,type,order,text,subtext,body,note,src,alt,href,mediaType,meta` です。

- 見出しの2行目（緑色の部分）は `subtext` 列
- 画像を複数並べるときは `src` を `|` で区切る（例：`a.mp4|b.webp|c.webp`）。動画と画像は混ぜてよい
- 動画（.mp4）は、同じ場所に同じ名前の `.jpg` があれば読み込み中の表紙に使われる（例：`site/media/grow.mp4` と `site/media/grow.jpg`）
- `note` 列は機能紹介では画像ごとのキャプション（`|` 区切り）

主なキー:

| section,key | 内容 |
| --- | --- |
| `hero.*` | トップのキャッチ（`tagline`・`taglineEn`）、ジャンル、ボタンの文言 |
| `trailer.video` | PV。`src` に「動画|表紙画像」。行を消すと TRAILER セクションごと非表示 |
| `system.feature01`〜 | 機能紹介。`meta` はカメラ表示（例：CULTIVATION） |
| `world.paragraph` / `world.fact` / `world.background` | 世界観の本文、数字の囲み、背景動画 |
| `characters.<id>` | 人物。`src` は `site/img/people/` の立ち絵（背景を抜いた画像） |
| `play.event` | 出展履歴。`meta` に年（空欄なら上の行と同じ年） |
| `play.link` | 「遊ぶ・応援する」の欄。**`href` に URL を入れると「OPEN ↗」のリンクになる**。空欄の間は `note` の文言（COMING SOON） |
| `media.*` | 掲載情報の切り抜き |
| `credits.image` | クレジット上の水彩画 |
| `contact.channel` | 公式X の URL（ページ内の X リンクはすべてここから） |
| `contact.visitorLine` | 一番下のロボットのセリフ（訪問者の番号）。`{n}` に番号が入る。ページを開くたびに数が 1 つ増える。総数は https://ug-visitors.ziroz-tech.workers.dev/ で見られる（開いても増えない） |
| `contact.visitorCounter` | 訪問者カウンターの数え係（Cloudflare Workers）の URL。消すとカウンターは止まり、いつものひとことに戻る。数の確認・書き換えは `visitor-counter/README.md` |

### 旧HTML版を公開したら

`site-content.csv` の次の行の `href` 列（右から3番目）に URL を入れるだけで、PLAY 欄にリンクが出ます。

```
play,link,link,70,旧HTML版 UNDER GREEN,FREE / BROWSER,ブラウザ向けに開発していた旧バージョンを、無料で公開する予定です。,COMING SOON,,,https://（公開先のURL）,,HTML
```

Steam のストアページができたら、`play,link,…,80,Steam ストアページ,…` の行に同じように URL を入れてください。

## ファイル

- `index.html` … 公式サイト（入口）
- `site/site.css`・`site/site.js` … サイトの見た目と動き
- `site/robot.js` … CONTACT の 3D サポートロボット
- `godot-models.js`・`site/models/` … Godot 版のモデル（ロボット・ポッド・レタス。Web 用に軽くしたもの）。サイトとデモで共用
- `site/vendor/` … 外部ライブラリ（Lenis：なめらかなスクロール／three.js r160 の GLTF 読み込み・スキンの複製）
- `site/img/` … ロゴ・立ち絵・画面写真・共有用画像（`og.jpg`）
- `site/media/` … Godot 版のゲーム映像（720p・無音）と PV
- `site/audio/` … SOUND ボタンで流す環境音
- `official-demo.html` ほか（`game.js`・`farm3d.js`・`styles.css` など）… ブラウザ栽培デモ本体
- `site-content.csv`・`credits.csv` … サイトの中身

ブラウザの自動再生制限のため、音はヘッダーの SOUND ボタンを押すまで鳴りません。栽培デモを始めるとデモの音も一緒に鳴ります（SOUND を OFF にすると止まります）。

## 手元での確認

CSV を読み込むため、ファイルを直接開く（`file://`）のではなくローカルサーバー経由で開いてください。

```
python -m http.server 8777
```

を実行して `http://127.0.0.1:8777/` を開きます。
