"""ride-preview.html から全アナウンス文を集めて JSON に出す。
使い方: python3 scripts/collect-voice-texts.py 出力先.json [路線番号...]  (省略時は全9路線)
駅名（漢字）と読みの一覧も 出力先.stations.json に出す（fix-voice-reading.py がアクセントに使う）
必要: pip install playwright && playwright install chromium
"""
import asyncio, json, subprocess, sys, time, pathlib
from playwright.async_api import async_playwright
ROOT = pathlib.Path(__file__).resolve().parent.parent
JS = """routes => { const out = {};
  for (const r of routes) { const set = new Set();
    for (let slot = 0; slot < 2; slot++) {
      selectRoute(r);
      if (DIR_ORDER[r] && routeDir[r] !== DIR_ORDER[r][slot]) selectDirection(slot);
      set.add(toSpeechText(STATIONS[0].name + 'を発車しました。次は' + STATIONS[1].name + 'です！'));
      const keep = speakText; speakText = t => set.add(toSpeechText(t)); announceOn = true;
      for (let i = 1; i < N; i++) onStationReached(i);
      speakText = keep;
      for (const m of STEPS) if (m) set.add(toSpeechText(tripEndText(m)));
    }
    out[r] = [...set];
  }
  return out; }"""
async def main():
    routes = [int(a) for a in sys.argv[2:]] or list(range(9))
    server = subprocess.Popen([sys.executable, '-m', 'http.server', '8815'], cwd=ROOT,
                              stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    try:
        time.sleep(1)
        async with async_playwright() as p:
            browser = await p.chromium.launch()
            page = await browser.new_page()
            await page.goto('http://localhost:8815/ride-preview.html')
            await page.wait_for_timeout(500)
            result = await page.evaluate(JS, routes)
            stations = await page.evaluate('() => { const m = {}; ROUTES.forEach(R => R.stations.forEach(s => m[s.name] = s.ruby)); return m; }')
            await browser.close()
    finally:
        server.kill()
    json.dump(result, open(sys.argv[1], 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    json.dump(stations, open(sys.argv[1].removesuffix('.json') + '.stations.json', 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    print({k: len(v) for k, v in result.items()}, 'unique:', len({t for v in result.values() for t in v}))
asyncio.run(main())
