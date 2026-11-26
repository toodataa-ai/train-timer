"""読み・アクセントを直した音声を作り直す（build-voice.py の後に実行）。
使い方: python3 scripts/fix-voice-reading.py ONNXRuntimeのso 辞書フォルダ 0.vvm 文.stations.json
- 駅名のアクセント: 文を駅名の漢字で作ったときのアクセント（辞書の標準アクセント）を使う。
  読みは画面の読み（カタカナ）のまま。漢字だと読みが変わる駅（国立→コクリツ など）はカタカナのアクセントのまま
- KANA_FIX: VOICEVOX の読み（カナ）を置き換える（例: ハチノヘが「ハチノエ」になる）
- ACCENT: イントネーションを指定する駅名（利用者が聞き比べて選んだもの）
  値は (VOICEVOXのカナ, 下がる位置)。位置0は平ら（平板）、1は最初が高い（頭高）
直した音声は読みから決まる新しいファイル名で保存する（端末に古い音声が残らないように）。
"""
import hashlib, json, pathlib, re, subprocess, sys, tempfile
from voicevox_core.blocking import Onnxruntime, OpenJtalk, Synthesizer, VoiceModelFile
ort, dic, vvm, stations_path = sys.argv[1:5]
out = pathlib.Path(__file__).resolve().parent.parent / 'assets/voice/metan'
manifest_path = out / 'manifest.json'
manifest = json.loads(manifest_path.read_text(encoding='utf-8'))
KANA_FIX = {'ハチノヘ': [("ハチ'/ノ'/エ'", "ハ'チノヘ"), ("ハチノ'/ヘ'", "ハ'チノヘ")],
            'ニノヘ': [("ニ'ノエ", "ニ'ノヘ")], 'シチノヘ': [("シ'チノエ", "シ'チノヘ")]}
ACCENT = {'ミタカ': ('ミタカ', 0), 'キチジョウジ': ('_キチジョオジ', 0),  # 平ら（v26）
          'コウエンジ': ('コオエンジ', 1)}  # 最初が高い（v27）
def set_accent(kana):
    parts = re.split(r'([/、])', kana)
    for i, p in enumerate(parts):
        plain = p.replace("'", '')
        for w, pos in ACCENT.values():
            if not plain.startswith(w): continue
            rest = plain[len(w):]
            if pos == 0:  # 平板: 後ろの助詞・「です」の頭に記号を置く
                if rest.startswith('デ_ス'): parts[i] = w + "デ'_ス" + rest[3:]
                elif rest == '': parts[i] = w + "'"
                else: parts[i] = w + rest[0] + "'" + rest[1:]
            else:  # pos 番目の拍のあとで下がる（無声化記号 _ は拍に数えない）
                n = 0
                for j, ch in enumerate(w):
                    if ch != '_' and ch not in 'ャュョァィゥェォ': n += 1
                    if n == pos and (j + 1 == len(w) or w[j + 1] not in 'ャュョァィゥェォ'):
                        parts[i] = w[:j + 1] + "'" + w[j + 1:] + rest; break
    return ''.join(parts)
syn = Synthesizer(Onnxruntime.load_once(filename=ort), OpenJtalk(dic))
with VoiceModelFile.open(vvm) as model:
    syn.load_voice_model(model)
def pron(kana): return re.sub(r"['/_、]", '', kana)
kata = lambda s: ''.join(chr(ord(c) + 0x60) if 'ぁ' <= c <= 'ゖ' else c for c in s)
# 漢字で渡しても読みが変わらない駅だけ、漢字に置き換えてアクセントを辞書に任せる
KANJI, ALL = {}, set()
for name, ruby in json.load(open(stations_path, encoding='utf-8')).items():
    k = kata(ruby)
    ALL.add(k)
    if k in KANA_FIX or k in ACCENT or name == k: continue
    if pron(syn.create_audio_query(name + 'です', 2).kana) == pron(syn.create_audio_query(k + 'です', 2).kana):
        KANJI[k] = name
# 駅名は全駅の中で長い順に照合する（ニシチバの中のチバを置き換えないように）
NAME_RE = re.compile('|'.join(sorted(map(re.escape, ALL), key=len, reverse=True)))
def swap(text, use): return NAME_RE.sub(lambda m: KANJI[m.group()] if m.group() in use else m.group(), text)
def dict_kana(text):
    base = syn.create_audio_query(text, 2).kana
    names = {n for n in NAME_RE.findall(text) if n in KANJI}
    # 漢字にすると文の中で読みが変わる駅（例: 水沢江刺→スイタク）は外す
    use = {n for n in names if pron(syn.create_audio_query(swap(text, {n}), 2).kana) == pron(base)}
    if not use: return base
    k = syn.create_audio_query(swap(text, use), 2).kana
    return k if pron(k) == pron(base) else base
with tempfile.TemporaryDirectory() as tmp:
    wav = pathlib.Path(tmp) / 'v.wav'
    for text, old in list(manifest['clips'].items()):
        hits = [w for w in KANA_FIX if w in text]
        kana = dict_kana(text)
        for w in hits:
            for a, b in KANA_FIX[w]: kana = kana.replace(a, b)
        kana = set_accent(kana)
        name = 'k' + hashlib.sha1(kana.encode()).hexdigest()[:11] + '.m4a'
        if name == old and (out / name).exists(): continue
        print(text, '|', kana, '|', name)
        wav.write_bytes(syn.synthesis(syn.create_audio_query_from_kana(kana, 2), 2))
        subprocess.run(['ffmpeg', '-loglevel', 'error', '-y', '-i', str(wav), '-af', 'loudnorm=I=-13:TP=-1:LRA=7',
                        '-ar', '44100', '-ac', '1', '-c:a', 'aac', '-b:a', '64k', '-movflags', '+faststart',
                        str(out / name)], check=True)
        manifest['clips'][text] = name
        if old != name and old not in manifest['clips'].values(): (out / old).unlink(missing_ok=True)
manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=0), encoding='utf-8')
