"""読み・アクセントを直した音声を作り直す（build-voice.py の後に実行）。
使い方: python3 scripts/fix-voice-reading.py ONNXRuntimeのso 辞書フォルダ 0.vvm
- KANA_FIX: VOICEVOX の読み（カナ）を置き換える（例: ハチノヘが「ハチノエ」になる）
- FLAT: 平らなイントネーション（平板）にする駅名（利用者の希望: 三鷹・吉祥寺）
直した音声は読みから決まる新しいファイル名で保存する（端末に古い音声が残らないように）。
"""
import hashlib, json, pathlib, re, subprocess, sys, tempfile
from voicevox_core.blocking import Onnxruntime, OpenJtalk, Synthesizer, VoiceModelFile
ort, dic, vvm = sys.argv[1:4]
out = pathlib.Path(__file__).resolve().parent.parent / 'assets/voice/metan'
manifest_path = out / 'manifest.json'
manifest = json.loads(manifest_path.read_text(encoding='utf-8'))
KANA_FIX = {'ハチノヘ': [("ハチ'/ノ'/エ'", "ハ'チノヘ"), ("ハチノ'/ヘ'", "ハ'チノヘ")],
            'ニノヘ': [("ニ'ノエ", "ニ'ノヘ")], 'シチノヘ': [("シ'チノエ", "シ'チノヘ")]}
FLAT = {'ミタカ': 'ミタカ', 'キチジョウジ': '_キチジョオジ'}  # 文中の表記: VOICEVOXのカナ
def flatten(kana):
    parts = re.split(r'([/、])', kana)
    for i, p in enumerate(parts):
        plain = p.replace("'", '')
        for w in FLAT.values():
            if plain.startswith(w):
                rest = plain[len(w):]
                if rest.startswith('デ_ス'): parts[i] = w + "デ'_ス" + rest[3:]
                elif rest == '': parts[i] = w + "'"
                else: parts[i] = w + rest[0] + "'" + rest[1:]
    return ''.join(parts)
syn = Synthesizer(Onnxruntime.load_once(filename=ort), OpenJtalk(dic))
with VoiceModelFile.open(vvm) as model:
    syn.load_voice_model(model)
with tempfile.TemporaryDirectory() as tmp:
    wav = pathlib.Path(tmp) / 'v.wav'
    for text, old in list(manifest['clips'].items()):
        hits = [w for w in KANA_FIX if w in text]
        if not hits and not any(w in text for w in FLAT): continue
        kana = syn.create_audio_query(text, 2).kana
        for w in hits:
            for a, b in KANA_FIX[w]: kana = kana.replace(a, b)
        kana = flatten(kana)
        name = 'k' + hashlib.sha1(kana.encode()).hexdigest()[:11] + '.m4a'
        print(text, '|', kana, '|', name)
        if name == old and (out / name).exists(): continue
        wav.write_bytes(syn.synthesis(syn.create_audio_query_from_kana(kana, 2), 2))
        subprocess.run(['ffmpeg', '-loglevel', 'error', '-y', '-i', str(wav), '-af', 'loudnorm=I=-13:TP=-1:LRA=7',
                        '-ar', '44100', '-ac', '1', '-c:a', 'aac', '-b:a', '64k', '-movflags', '+faststart',
                        str(out / name)], check=True)
        manifest['clips'][text] = name
        if old != name and old not in manifest['clips'].values(): (out / old).unlink(missing_ok=True)
manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=0), encoding='utf-8')
