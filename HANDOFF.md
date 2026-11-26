# 引継ぎ書：あそびタイマー🚃（2026-11-26 更新）

## 利用者と進め方
- 日本語で報告する。利用者はスマホのみ（PCなし）。時刻は日本時間。
- 改修の依頼はテストページに反映してよい（毎回の確認は不要）。**本番反映は利用者の承認（例「本番OK」）が必要**。承認はチャットで受ける。
- 報告は「何件完了、何件未完了、未完了の理由」を件数で書く。URLは単独の行に置く（直後に日本語が続くと404になったことがある）。
- 外部AIのAPI連携は不要。

## サイト
- リポジトリ: toodataa-ai/train-timer（main を GitHub Pages で公開。push 先は main）
- 本番: https://toodataa-ai.github.io/train-timer/ ＝ `index.html`（**v15 の内容**）
- テスト: https://toodataa-ai.github.io/train-timer/ride-preview.html?v=34 ＝ `ride-preview.html`（v34）
- 1ファイル構成（CSS/JSは埋め込み）。子ども向けの電車テーマの遊びタイマーで、操作は大人。

## 録音アナウンス（v25で全路線に。実機確認待ち）
- 全9路線・両方向の348文を VOICEVOX:四国めたん（ノーマル style 2）で作成済み（`assets/voice/metan/`）
- `manifest.json` の `routes` に路線ごとの文の一覧があり、画面は選んだ路線の分だけ読み込む
- v28 で「アナウンスが消えた」: 端末に古い manifest（max-age 600）が残り、消した旧ファイルを探して失敗。さらに manifest があるだけで端末の読み上げの準備（iOSのアンロック）を省いていたため、代わりの読み上げも鳴らなかった。v29 で manifest を毎回サーバーに確認（no-cache）、ファイルが無ければ一度だけ取り直し、録音が揃うまでは読み上げも準備するように修正
- 音声を作り直すときは古いファイルを消すので、上の仕組みを外さないこと
- 読み・アクセントの直し（`scripts/fix-voice-reading.py`。build-voice.py の後に毎回実行する）
  - 誤読: ハチノヘ・ニノヘ・シチノヘトワダ（「ヘ」が「エ」になっていた）
  - 利用者の希望のイントネーション（3案を聞き比べてもらい選ばれた）: 三鷹・吉祥寺は平ら（平板、v26）、高円寺は最初が高い「コ↓ーエンジ」（頭高、v27）、国立は平ら（v30）、八王子は平ら（v33。西八王子はそのまま）
  - 駅名のアクセントは辞書の標準アクセント（v28）: 文中の駅名を漢字にして VOICEVOX に渡したときのアクセントを使い、読みはカタカナのまま。漢字だと読みが変わる駅（国立・北上・長谷・西千葉・水沢江刺の文中など）は従来のまま
  - 「今回の旅は、N分でした」は「N分」を一つのまとまりで読む（fix-voice-reading.py の fix_minutes、v31）
  - 新しい希望は聞き比べ用の音声（今の読み・平ら・頭高など）を作って送り、選んでもらう
  - 直した音声は新しいファイル名（k〜.m4a）にして、端末に古い音声が残らないようにしている
- 文を変えたら作り直す手順:
  1. `python3 scripts/collect-voice-texts.py /tmp/texts.json`（駅名一覧 /tmp/texts.stations.json も出る）（python の playwright が必要。入っていない環境では `chromium.launch(executable_path='/opt/pw-browsers/chromium')` に変えた複製で動かした）
  2. VOICEVOX を準備（下記）し、`python3 scripts/build-voice.py /tmp/texts.json <ONNX Runtimeのso> <辞書フォルダ> <0.vvm>`
  3. `python3 scripts/fix-voice-reading.py <ONNX Runtimeのso> <辞書フォルダ> <0.vvm> /tmp/texts.stations.json`
  4. 出力される読み（カナ）を確認し、駅名の誤読がないか見る

注意: `speakText` は文が manifest と一字一句一致するときだけ録音を流し、なければ端末の読み上げになる。アナウンス文や駅名を変えたら音声の作り直しが必要。

### VOICEVOX の準備（前回の実績。作業環境が変わると消える）
- ダウンロードと実行は、**そのセッションで利用者の許可と規約同意を得てから**行う（前回は安全チェックで一度拒否され、利用者の明示の許可後に実行した）
- voicevox_core 0.16.4 の Python wheel（manylinux_2_34_x86_64、GitHub Releases）
- ONNX Runtime: VOICEVOX/onnxruntime-builder の `voicevox_onnxruntime-1.17.3`（linux-x64 の tgz を直接取得。公式 downloader は API の回数制限で失敗した）
- 辞書: `apt-get install open-jtalk-mecab-naist-jdic`
- 音声モデル: VOICEVOX/voicevox_vvm のタグ `0.16.4` の `0.vvm`（Releases の添付ファイルを直接取得できた）（最新の0.17系は使わない）。ダウンロード物はリポジトリの外に置き、コミットしない
- 声: 四国めたん ノーマル（style 2）
- 規約: 同梱の TERMS.txt と https://zunko.jp/con_ongen_kiyaku.html 。クレジット必須。政治・宗教活動などは禁止

## テスト
- `node --test tests/*.test.cjs`（20件。**index.html を読む**）
- テストページを試すとき:
```
rm -rf /tmp/pv && mkdir -p /tmp/pv/tests && cp -r assets /tmp/pv/ && cp ride-preview.html /tmp/pv/index.html
cp tests/train-timer.test.cjs /tmp/pv/tests/
sed -i "s/assert.equal(routes\[5\].n, 24);/assert.equal(routes[5].n, 10);/; s/assert.equal(routes\[4\].n, 23);/assert.equal(routes[4].n, 26);/; s/\['東京','新青森'\]/['東京','新函館北斗']/; s/bgmer-train-timer-v2/bgmer-train-timer-v3/g; s/assert.equal(mediaElements\[0\].volume, 0.10);/assert.equal(mediaElements[0].volume, 0.75);/; s/assert.ok(el('overlay').classList.contains('show'));/assert.equal(el('arriveChip').hidden, false); assert.equal(el('overlay').classList.contains('show'), false);/; s/assert.ok(el('overlayTitle').textContent.includes('一周'));/assert.ok(el('arriveTitle').textContent.includes('一周'));/" /tmp/pv/tests/train-timer.test.cjs
cd /tmp/pv && node --test tests/train-timer.test.cjs   # 17件
```

## テスト版にあって本番にない変更（v16〜v34）
- 発車音はドアの「プシュー」だけ／iPhoneの音声設定（audioSession）
- ボタンを小型化、北陸新幹線→かがやき、はやぶさ終点を新函館北斗
- 電車の窓が消える不具合の修正（**本番には残っている**）
- BGM を小さくした v3（`assets/music/bgmer-train-timer-v3.*`）。アナウンス中の音量切り替えは廃止（BGMは常に同じ音量）
- 描画を軽くした（景色は画像化、車輪の回転は停止）／画面ロック防止の取り直しと状態表示（v30から画面上部に浮かせて表示し、数秒で消える。表示が出ても画面がずれない）
- 「半分すぎたよ」「もうすぐ到着」の注意は景色（.scene）の下に浮かせて表示し、出ても画面がずれない。画面ロック防止の表示は再試行ボタンがあっても8秒で消える（画面に触れるたびに自動で取り直すため）（v32）
- のぞみの絵を8両から5両に（長すぎたため。`carCount`）（v34）
- 終点に着いても別画面（overlay）を出さず、電車を終点に止めたまま景色の下に到着の札を出す。開始ボタンは「🔄 もういちど」でリセット。終点の案内は「終点、〇〇に到着しました。」、旅の時間は「今回の旅は、N分でした。よく頑張ったね！」（`tripEndText`）（v31）
- 全路線の録音アナウンス（v24で山手線、v25で全路線、v26〜27で三鷹・吉祥寺・高円寺のイントネーション、v28で全駅名を標準アクセントに）

## 未確認・未決
- iPhone実機: 引っかかりは録音の声（山手線）で良くなったとの回答。全路線版（v25〜）は未確認。画面ロック防止の効きは回答なし（低電力モードでは効かない可能性）
- アナウンス中だけBGMを下げるか: 「同じ音量か」と質問があり現状を説明済み。希望は未回答
- はやぶさ／こまちは実際の停車駅ではなく全駅表示。所要時間は概算

## 本番反映の手順（承認後のみ）
1. `ride-preview.html` を `index.html` にコピー（テスト版の表示を消し、title を `あそびタイマー🚃` に）
2. `voice-balance-preview.html` を同期（index.html との差は title の「｜音量調整テスト版」と、🎶 の audio-hint の前の `<div class="audio-hint">【音量調整テスト版】アナウンス中のBGMを10%に変更（通常時75%）</div>` の1行のみ、というテストがある。音量切り替え廃止に合わせて文言とテストを見直す）
3. tests（路線の駅数・行き先・BGMファイル名・音量・終点の到着表示＝overlay ではなく arriveChip）、`scripts/build-bgmer-bgm.cjs`、docs を更新
4. 全テスト、push、公開ページ確認

## BGM
BGMer の曲。規約でボットや自動・一括ダウンロードは禁止。曲を差し替えるときは利用者が公式から手動で取得して添付する。
