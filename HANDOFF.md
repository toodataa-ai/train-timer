# 引継ぎ書：あそびタイマー🚃（2026-11-27 時点）

## 利用者と進め方
- 日本語で報告する。利用者はスマホのみ（PCなし）。時刻は日本時間。
- 改修の依頼はテストページに反映してよい（毎回の確認は不要）。**本番反映は利用者の承認（例「本番OK」）が必要**。承認はチャットで受ける。
- 報告は「何件完了、何件未完了、未完了の理由」を件数で書く。URLは単独の行に置く（直後に日本語が続くと404になったことがある）。
- 外部AIのAPI連携は不要。

## サイト
- リポジトリ: toodataa-ai/train-timer（main を GitHub Pages で公開。push 先は main）
- 本番: https://toodataa-ai.github.io/train-timer/ ＝ `index.html`（**v15 の内容**）
- テスト: https://toodataa-ai.github.io/train-timer/ride-preview.html?v=24 ＝ `ride-preview.html`（v24）
- 1ファイル構成（CSS/JSは埋め込み）。子ども向けの電車テーマの遊びタイマーで、操作は大人。

## 次の作業：全路線を同じ声にする（利用者の希望）
現状は山手線（路線6）だけ録音音声。残り8路線は端末の読み上げで、読み上げが終わる瞬間に画面が引っかかる（実機で確認）。
山手線の試作は利用者が実機で「良かった」と確認済み。

手順:
1. `python3 scripts/collect-voice-texts.py /tmp/texts.json` … 全路線・両方向の文（ユニーク348文。作成済み77、残り約271）
2. VOICEVOX を準備（下記）し、`python3 scripts/build-voice.py /tmp/texts.json <ONNX Runtimeのso> <辞書フォルダ> <0.vvm>`
3. 出力される読み（カナ）を確認し、駅名の誤読がないか見る。直す場合は該当の m4a を消して作り直す
4. `ride-preview.html` の `VOICE_ROUTES` を全路線にする。**今の `loadVoicePack()` は manifest の全音声を一度に取得するので、選んだ路線の分だけ読み込むように直す**
5. 画面の「【試作】山手線のアナウンス音声：VOICEVOX:四国めたん」の文言を直す（クレジット表示は必須）。テスト版の表示番号を上げる
6. テスト、push、Actions と公開ページを確認

注意: `speakText` は文が manifest と一字一句一致するときだけ録音を流し、なければ端末の読み上げになる。アナウンス文や駅名を変えたら音声の作り直しが必要。

### VOICEVOX の準備（前回の実績。作業環境が変わると消える）
- ダウンロードと実行は、**そのセッションで利用者の許可と規約同意を得てから**行う（前回は安全チェックで一度拒否され、利用者の明示の許可後に実行した）
- voicevox_core 0.16.4 の Python wheel（manylinux_2_34_x86_64、GitHub Releases）
- ONNX Runtime: VOICEVOX/onnxruntime-builder の `voicevox_onnxruntime-1.17.3`（linux-x64 の tgz を直接取得。公式 downloader は API の回数制限で失敗した）
- 辞書: `apt-get install open-jtalk-mecab-naist-jdic`
- 音声モデル: VOICEVOX/voicevox_vvm のタグ `0.16.4` の `vvms/0.vvm`（最新の0.17系は使わない）。ダウンロード物はリポジトリの外に置き、コミットしない
- 声: 四国めたん ノーマル（style 2）
- 規約: 同梱の TERMS.txt と https://zunko.jp/con_ongen_kiyaku.html 。クレジット必須。政治・宗教活動などは禁止

## テスト
- `node --test tests/*.test.cjs`（20件。**index.html を読む**）
- テストページを試すとき:
```
rm -rf /tmp/pv && mkdir -p /tmp/pv/tests && cp -r assets /tmp/pv/ && cp ride-preview.html /tmp/pv/index.html
cp tests/train-timer.test.cjs /tmp/pv/tests/
sed -i "s/assert.equal(routes\[5\].n, 24);/assert.equal(routes[5].n, 10);/; s/assert.equal(routes\[4\].n, 23);/assert.equal(routes[4].n, 26);/; s/\['東京','新青森'\]/['東京','新函館北斗']/; s/bgmer-train-timer-v2/bgmer-train-timer-v3/g; s/assert.equal(mediaElements\[0\].volume, 0.10);/assert.equal(mediaElements[0].volume, 0.75);/" /tmp/pv/tests/train-timer.test.cjs
cd /tmp/pv && node --test tests/train-timer.test.cjs   # 17件
```

## テスト版にあって本番にない変更（v16〜v24）
- 発車音はドアの「プシュー」だけ／iPhoneの音声設定（audioSession）
- ボタンを小型化、北陸新幹線→かがやき、はやぶさ終点を新函館北斗
- 電車の窓が消える不具合の修正（**本番には残っている**）
- BGM を小さくした v3（`assets/music/bgmer-train-timer-v3.*`）。アナウンス中の音量切り替えは廃止（BGMは常に同じ音量）
- 描画を軽くした（景色は画像化、車輪の回転は停止）／画面ロック防止の取り直しと状態表示
- 山手線の録音アナウンス

## 未確認・未決
- iPhone実機: 引っかかりは録音の声（山手線）で良くなったとの回答。画面ロック防止の効きは回答なし（低電力モードでは効かない可能性）
- アナウンス中だけBGMを下げるか: 「同じ音量か」と質問があり現状を説明済み。希望は未回答
- はやぶさ／こまちは実際の停車駅ではなく全駅表示。所要時間は概算

## 本番反映の手順（承認後のみ）
1. `ride-preview.html` を `index.html` にコピー（テスト版の表示を消し、title を `あそびタイマー🚃` に）
2. `voice-balance-preview.html` を同期（index.html との差は title の「｜音量調整テスト版」と、🎶 の audio-hint の前の `<div class="audio-hint">【音量調整テスト版】アナウンス中のBGMを10%に変更（通常時75%）</div>` の1行のみ、というテストがある。音量切り替え廃止に合わせて文言とテストを見直す）
3. tests（路線の駅数・行き先・BGMファイル名・音量）、`scripts/build-bgmer-bgm.cjs`、docs を更新
4. 全テスト、push、公開ページ確認

## BGM
BGMer の曲。規約でボットや自動・一括ダウンロードは禁止。曲を差し替えるときは利用者が公式から手動で取得して添付する。
