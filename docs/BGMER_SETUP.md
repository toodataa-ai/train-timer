# トレインタイマーのフリーBGM導入手順

## 対象楽曲と使用区間

| タイマー進行 | 曲名（提供元：BGMer） | 公式ページ |
| --- | --- | --- |
| 0～50%（前半） | 並走ハピネス | https://bgmer.net/music/277/ |
| 50～80%（後半） | グルーヴコースター | https://bgmer.net/music/251/ |
| 80～100%（ラスト） | 爆発寸前！ | https://bgmer.net/music/148/ |

- 利用規約：https://bgmer.net/terms/
- 動画、ゲーム等の利用は無料。クレジットは任意ですがアプリ画面に明記しています。
- **BGMerはボット・スクレイピング等による収集、音源の一括自動ダウンロードを禁止しています。**
- このリポジトリには、未取得の音源を勝手に取得する仕組みはありません。

## 手動で音源を取得

1. 公式の各楽曲ページで **SHORT** のMP3を通常のブラウザー操作で1曲ずつダウンロードします。
2. 次のローカルファイル名で配置します。これらのMP3は `.gitignore` 対象です。
   - `assets/music/source/01-happiness.mp3`
   - `assets/music/source/02-groove-coaster.mp3`
   - `assets/music/source/03-explosion.mp3`
3. PC/Macに `ffmpeg` と `ffprobe` がある状態で `node scripts/build-bgmer-bgm.cjs` を実行します。
4. 生成された `assets/music/bgmer-train-timer.m4a` と `assets/music/bgmer-train-timer.json` を同時に本番へ反映します。
5. スマートフォンで各時間帯のBGMとアナウンスの音量・切り替えを実機確認してください。

## 技術方針

iPhoneの制約に配慮して3曲をひとつのM4Aに連結します。ユーザーが「しゅっぱつ！」を押すと1個のHTML audioを再生し、残り50%、20%で同じプレーヤーの再生位置を移動します。曲の切り替え時に追加の音声再生リクエストは不要です。

JSON manifestとM4Aの両方が公開されるまでは、もともとのアプリ内蔵オリジナルBGMを再生します。これは不完全な公開で無音になるのを防止するためのフォールバックであり、**BGMerの3曲が公開済みという意味ではありません**。

音源再配布・自己作品としての偽装・販売等の禁止事項を守り、ライセンスを継続して確認してください。
