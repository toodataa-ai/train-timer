"""集めた文から四国めたん(ノーマル, style 2)の音声を作る。既にある音声は作り直さない。
使い方: python3 scripts/build-voice.py 文.json ONNXRuntimeのso 辞書フォルダ 0.vvm
準備は HANDOFF.md を参照。
読みの誤り（例: ハチノヘ→ハチノエ）は該当の m4a を消し、create_audio_query_from_kana で直した読みから作る。クレジット「VOICEVOX:四国めたん」の画面表示が必須。
"""
import hashlib, json, pathlib, subprocess, sys, tempfile
from voicevox_core.blocking import Onnxruntime, OpenJtalk, Synthesizer, VoiceModelFile
texts_path, ort_path, dict_dir, vvm = sys.argv[1:5]
out = pathlib.Path(__file__).resolve().parent.parent / 'assets/voice/metan'
manifest_path = out / 'manifest.json'
manifest = json.loads(manifest_path.read_text(encoding='utf-8'))
syn = Synthesizer(Onnxruntime.load_once(filename=ort_path), OpenJtalk(dict_dir))
with VoiceModelFile.open(vvm) as model:
    syn.load_voice_model(model)
by_route = json.load(open(texts_path, encoding='utf-8'))
texts = dict.fromkeys(t for v in by_route.values() for t in v)
made = 0
with tempfile.TemporaryDirectory() as tmp:
    wav = pathlib.Path(tmp) / 'v.wav'
    for text in texts:
        name = hashlib.sha1(text.encode()).hexdigest()[:12] + '.m4a'
        if not (out / name).exists():
            query = syn.create_audio_query(text, 2)
            print(text, '|', query.kana)  # 読みの確認用
            wav.write_bytes(syn.synthesis(query, 2))
            subprocess.run(['ffmpeg', '-loglevel', 'error', '-y', '-i', str(wav), '-af', 'loudnorm=I=-13:TP=-1:LRA=7',
                            '-ar', '44100', '-ac', '1', '-c:a', 'aac', '-b:a', '64k', '-movflags', '+faststart',
                            str(out / name)], check=True)
            made += 1
        manifest['clips'][text] = name
# 路線ごとの文の一覧（画面は選んだ路線の分だけ読み込む）
manifest.setdefault('routes', {}).update(by_route)
manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=0), encoding='utf-8')
print('made', made, 'total', len(manifest['clips']))
