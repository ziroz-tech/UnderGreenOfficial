# Official Page CSV Guide

公式ページ `official/index.html` は以下のCSVから内容を読み込みます。

- `site.csv`: サイト名、メタ説明、フッター、Xリンク。
- `sections.csv`: 各セクションの見出し、本文、画像・動画、ロボットコメント。
- `cards.csv`: GAME LOOP、拠点例、市場、スクリーンショットなどのカード。

画像・動画の差し替え時は `mediaType`, `mediaSrc`, `posterSrc`, `mediaAlt` を編集してください。
`mediaRecommendedSize` は編集時の目安です。実際のHPには表示されません。