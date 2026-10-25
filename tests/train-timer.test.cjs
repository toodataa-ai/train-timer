'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const match = html.match(/<script>([\s\S]*?)<\/script>/);
assert.ok(match, 'inline application script exists');
const appCode = match[1];

// HTML内スクリプトの構文もチェック（追加ビルドツール不要）
test('HTML embedded JavaScript has valid syntax', () => {
  assert.doesNotThrow(() => new vm.Script(appCode));
});

class FakeClassList {
  constructor() { this.values = new Set(); }
  add(...values) { values.forEach(v => this.values.add(v)); }
  remove(...values) { values.forEach(v => this.values.delete(v)); }
  toggle(value, force) {
    const enabled = force === undefined ? !this.values.has(value) : !!force;
    if (enabled) this.values.add(value);
    else this.values.delete(value);
    return enabled;
  }
  contains(value) { return this.values.has(value); }
}
class FakeElement {
  constructor() {
    this.classList = new FakeClassList();
    this.style = {};
    this.attributes = {};
    this.innerHTML = '';
    this.textContent = '';
    this.value = '0';
    this.scrollTop = 0;
    this.hidden = false;
    this.children = [];
    this.listeners = new Map();
  }
  addEventListener(type, callback) {
    if (!this.listeners.has(type)) this.listeners.set(type, []);
    this.listeners.get(type).push(callback);
  }
  dispatchEvent(event) {
    for (const fn of this.listeners.get(event.type) || []) fn(event);
  }
  get innerHTML() { return this._html || ''; }
  set innerHTML(value) { this._html = value; if (value === '') this.children = []; }
  setAttribute(key, value) { this.attributes[key] = value; }
  appendChild(el) { this.children.push(el); }
  scrollIntoView() {}
}
function makeApp({wakeLockRequest,fetchResponder} = {}) {
  const elements = new Map();
  const el = id => {
    if (!elements.has(id)) elements.set(id, new FakeElement());
    return elements.get(id);
  };
  const buttons = Array.from({length: 7}, () => new FakeElement());
  const mediaElements = [], audioBlobs = [];
  let clock = 1_700_000_000_000;
  let nextTimerId = 1;
  const timers = new Map();
  class Clock extends Date { static now() { return clock; } }
  const eventTarget = () => {
    const listeners = new Map();
    return {
      addEventListener(type, callback) {
        if (!listeners.has(type)) listeners.set(type, []);
        listeners.get(type).push(callback);
      },
      dispatchEvent(event) {
        for (const callback of listeners.get(event.type) || []) callback(event);
      }
    };
  };
  const document = {
    ...eventTarget(),
    visibilityState: 'visible',
    body: new FakeElement(),
    getElementById: el,
    createElement(tag) {
      if (tag !== 'audio') return new FakeElement();
      const a = new FakeElement();
      a.paused = true;
      a.playCount = 0;
      a.pauseCount = 0;
      a.play = () => { a.paused = false; a.playCount++; return Promise.resolve(); };
      a.pause = () => { a.paused = true; a.pauseCount++; };
      mediaElements.push(a);
      return a;
    },
    querySelectorAll: selector => selector === '.route-btn' ? buttons : []
  };
  const ctx = vm.createContext({
    window: eventTarget(), document, navigator: wakeLockRequest ? {wakeLock: {request: wakeLockRequest}} : {},
    fetch: fetchResponder,
    Date: Clock, console, Blob,
    URL: {
      createObjectURL(blob) {
        audioBlobs.push(blob);
        return 'blob:mock/' + audioBlobs.length;
      }
    },
    setInterval(fn, ms) { const id = nextTimerId++; timers.set(id, fn); return id; },
    clearInterval(id) { timers.delete(id); },
    setTimeout(fn, ms) { const id = nextTimerId++; timers.set(id, fn); return id; },
    clearTimeout(id) { timers.delete(id); }
  });
  vm.runInContext(appCode, ctx, {timeout: 5000});
  const run = code => vm.runInContext(code, ctx, {timeout: 5000});
  return {run, el, advance: ms => { clock += ms; }, buttons, mediaElements, audioBlobs};
}

test('seven routes include a full Tokyo-to-Tokyo Yamanote outer loop', () => {
  const {run,el,buttons} = makeApp();
  const routes = run('ROUTES.map(r => ({from:r.from,to:r.to,n:r.stations.length}))');
  assert.deepEqual(Array.from(routes, r => [r.from,r.to]), [
    ['三鷹','千葉'], ['博多','東京'], ['高尾','東京'],
    ['松本','新宿'], ['東京','新青森'], ['東京','敦賀'], ['東京','東京']
  ]);
  assert.equal(routes[4].n, 23);
  assert.equal(routes[5].n, 24);
  assert.equal(routes[6].n, 31, '30 distinct Yamanote stations plus Tokyo again');
  assert.equal(buttons.length, 7);
  for (let i = 0; i < routes.length; i++) {
    run('selectRoute('+i+')');
    assert.equal(el('labelFrom').textContent, routes[i].from);
    assert.equal(el('labelTo').textContent, routes[i].to);
    assert.equal(el('stationsScroll').children.length, routes[i].n);
    assert.ok(buttons[i].classList.contains('active'));
  }
  assert.equal(el('routeNote').hidden, false);
  assert.deepEqual(Array.from(run('ROUTES[6].stations.map(s => s.name)')), [
    '東京','有楽町','新橋','浜松町','田町','高輪ゲートウェイ','品川','大崎',
    '五反田','目黒','恵比寿','渋谷','原宿','代々木','新宿','新大久保',
    '高田馬場','目白','池袋','大塚','巣鴨','駒込','田端','西日暮里',
    '日暮里','鶯谷','上野','御徒町','秋葉原','神田','東京'
  ]);
  assert.equal(run('ROUTES[6].stations[0].num'), 'JY01');
  assert.equal(run('ROUTES[6].stations.at(-1).num'), 'JY01');
});

test('station progress only reaches the terminus when the timer expires', () => {
  const {run,el,advance} = makeApp();
  run('selectRoute(5)');
  run('handleStart()');
  assert.equal(run('running'),true);
  advance(240000);
  run('tick()');
  assert.notEqual(el('currentStation').textContent,'📍 敦賀');
  advance(60000);
  run('tick()');
  assert.equal(el('currentStation').textContent,'📍 敦賀');
  assert.equal(run('running'), false);
  assert.ok(el('overlay').classList.contains('show'));
});

test('pause, resume, sound toggles, and reset preserve user preferences', () => {
  const {run,el,advance} = makeApp();
  run('selectRoute(4)');
  run('handleMusic()');
  assert.equal(run('musicOn'), false);
  assert.equal(el('musicBtn').attributes['aria-pressed'], 'false');
  run('handleAnnounce()');
  assert.equal(run('announceOn'), false);
  run('handleStart()');
  advance(30000);
  run('tick()');
  const remaining = run('remainMs');
  run('handleStart()'); // pause
  assert.equal(run('running'), false);
  advance(90000);
  run('handleStart()'); // resume
  advance(1000);
  run('tick()');
  assert.equal(run('running'), true);
  assert.ok(run('remainMs') <= remaining - 900);
  assert.ok(run('remainMs') >= remaining - 1100);
  run('handleReset()');
  assert.equal(run('running'),false);
  assert.equal(run('musicOn'),false);
  assert.equal(run('announceOn'),false);
  assert.equal(run('remainMs'),300000);
  assert.equal(el('st0time').textContent,'5:00');
  run('handleMusic()');
  assert.equal(run('musicOn'),true);
  assert.equal(el('musicBtn').attributes['aria-pressed'], 'true');
});


test('generated BGM is a genuinely audible PCM WAV playable via normal HTML audio', async () => {
  const {run,el,mediaElements,audioBlobs} = makeApp();
  assert.equal(audioBlobs.length, 0, 'audio is prepared lazily for iPhone');
  run('testMusic()');
  assert.equal(mediaElements.length, 1, 'created exactly one HTML audio element');
  assert.equal(mediaElements[0].playCount, 1, 'direct tap starts a media element');
  assert.equal(mediaElements[0].loop, true);
  assert.equal(mediaElements[0].paused, false);
  assert.equal(audioBlobs.length, 1);
  assert.equal(audioBlobs[0].type,'audio/wav');
  assert.ok(el('testMusicBtn').textContent.includes('とめる'));

  const dv = new DataView(await audioBlobs[0].arrayBuffer());
  const ascii = (at,n) => String.fromCharCode(...Array.from({length:n},(_,i)=>dv.getUint8(at+i)));
  assert.equal(ascii(0,4),'RIFF');
  assert.equal(ascii(8,4),'WAVE');
  assert.equal(ascii(36,4),'data');
  assert.equal(dv.getUint16(20,true),1, 'uncompressed PCM');
  assert.equal(dv.getUint16(22,true),1, 'mono');
  assert.equal(dv.getUint32(24,true),22050);
  assert.ok(dv.byteLength > 350000, 'several seconds of audio');
  let sq=0, max=0, count=0;
  for (let p=44;p<dv.byteLength;p+=32) {
    const amplitude=dv.getInt16(p,true)/32768;
    sq+=amplitude*amplitude;
    max=Math.max(max,Math.abs(amplitude));
    count++;
  }
  const rms=Math.sqrt(sq/count);
  assert.ok(rms > 0.065, 'RMS sound level is meaningfully audible: ' + rms);
  assert.ok(max > 0.18, 'sound peaks are not near silent: ' + max);
  await Promise.resolve();
  assert.ok(el('musicStatus').textContent.includes('再生中'));

  run('testMusic()'); // stop preview
  assert.equal(mediaElements[0].paused,true);
  run('testMusic()'); // restart without regenerating large WAV file
  assert.equal(mediaElements[0].playCount,2);
  assert.equal(audioBlobs.length,1);
});

test('BGM starts, stops and resumes alongside timer, even after a silent-mode opt-out', () => {
  const {run,mediaElements} = makeApp();
  run('handleMusic()'); // BGM off
  run('handleStart()');
  assert.equal(mediaElements.length,0);
  run('handleMusic()'); // turn BGM on while timer runs
  assert.equal(mediaElements.length,1);
  assert.equal(mediaElements[0].playCount,1);
  run('duckMusic(true)');
  assert.equal(mediaElements[0].volume, 0.32);
  run('duckMusic(false)');
  assert.equal(mediaElements[0].volume, 0.75);
  run('handleStart()'); // pause
  assert.equal(mediaElements[0].paused,true);
  run('handleStart()'); // resume
  assert.equal(mediaElements[0].playCount,2);
  run('selectRoute(5)'); // route switch cancels sound
  assert.equal(mediaElements[0].paused,true);
});


test('calm 90 BPM theme changes to a different 150 BPM song at halfway and speeds up at 20%', async () => {
  const {run,el,advance,mediaElements,audioBlobs} = makeApp();
  run('selectRoute(6)');
  run('handleStart()');
  const audio = mediaElements[0];
  assert.equal(audio.playbackRate,1);
  assert.ok(el('musicPace').textContent.includes('90 BPM'));
  assert.equal(el('musicPace').attributes['data-phase'],'0');
  assert.equal(audio.playCount,1);
  const src = audio.src;
  const calmSeconds = Number(run('MUSIC_CALM_SECONDS'));
  const fastSeconds = Number(run('MUSIC_FAST_SECONDS'));
  assert.ok(calmSeconds > 10);
  assert.ok(fastSeconds > 8);
  const wav = new DataView(await audioBlobs[0].arrayBuffer());
  // Both segments must have genuinely different PCM content.
  const sampleAt = t => wav.getInt16(44+Math.floor(t*22050)*2,true);
  assert.notEqual(sampleAt(2.2), sampleAt(calmSeconds+2.2));
  audio.currentTime = calmSeconds - 0.012;
  run('keepMusicInCurrentTheme()');
  assert.equal(audio.currentTime,0, 'calm song loops within its own section');

  advance(149999); run('tick()');
  assert.equal(audio.playbackRate,1);
  advance(1); run('tick()');
  assert.equal(audio.playbackRate,1.34);
  assert.ok(el('musicPace').textContent.includes('150 BPM'));
  assert.equal(el('musicPace').attributes['data-phase'],'1');
  assert.equal(audio.currentTime,calmSeconds, 'jumps to a different melody, not just new speed');
  assert.equal(audio.src,src,'one WAV and one iPhone audio player');
  assert.equal(audio.playCount,1,'no additional play request when switching songs');
  audio.currentTime=calmSeconds+fastSeconds-0.01;
  audio.dispatchEvent({type:'timeupdate'});
  assert.equal(audio.currentTime,calmSeconds, 'fast song loops within its own section');

  advance(89999); run('tick()');
  assert.equal(audio.playbackRate,1.34);
  advance(1); run('tick()');
  assert.equal(audio.playbackRate,1.65);
  assert.ok(el('musicPace').textContent.includes('185 BPM'));
  assert.equal(el('musicPace').attributes['data-phase'],'2');
  assert.equal(audio.src,src);
  assert.equal(audio.playCount,1);
  assert.equal(audioBlobs.length,1);

  run('handleStart()'); // pause
  assert.equal(audio.paused,true);
  run('handleStart()'); // resume
  assert.equal(audio.playbackRate,1.65);
  assert.equal(audio.currentTime,calmSeconds,'resume returns to the fast theme');
  assert.equal(audio.playCount,2);
  run('handleReset()');
  assert.equal(audio.paused,true);
  assert.equal(audio.playbackRate,1);
  assert.equal(el('musicPace').textContent,'🎵 出発準備中');
  assert.equal(el('musicPace').attributes['data-phase'],'0');
});

test('music preview starts at calm melody while preserving the fast melody data', () => {
  const {run,el,mediaElements,audioBlobs} = makeApp();
  assert.equal(Array.from(run('MUSIC_MELODY')).length,32);
  assert.equal(Array.from(run('MUSIC_CALM_MELODY')).length,16);
  assert.ok(Array.from(run('MUSIC_MELODY')).includes(1318.51));
  assert.equal(Number(run('MUSIC_RATES[2]')),1.65);
  run('testMusic()');
  assert.equal(mediaElements[0].playbackRate,1);
  assert.equal(mediaElements[0].currentTime,0);
  assert.equal(audioBlobs.length,1);
  assert.ok(el('testMusicBtn').textContent.includes('とめる'));
  run('testMusic()');
  assert.equal(mediaElements[0].paused,true);
});

function fakeWakeSentinel() {
  const listeners = [];
  return {
    released: false, releaseCount: 0,
    addEventListener(type, fn) { if (type === 'release') listeners.push(fn); },
    release() {
      this.released = true;
      this.releaseCount++;
      listeners.forEach(fn => fn());
      return Promise.resolve();
    }
  };
}
const flushMicrotasks = () => new Promise(resolve => setImmediate(resolve));

test('screen stays awake after departure and during pause; reset/finish/route switch release it', async () => {
  const types = [], sentinels = [];
  const {run} = makeApp({wakeLockRequest(type) {
    types.push(type);
    const lock = fakeWakeSentinel();
    sentinels.push(lock);
    return Promise.resolve(lock);
  }});
  assert.equal(run('screenWakeDesired'), false, 'initial display uses the normal auto-lock');
  run('handleStart()');
  await flushMicrotasks();
  assert.deepEqual(types, ['screen']);
  assert.equal(run('screenWakeLock !== null'), true);
  run('handleStart()'); // pause
  assert.equal(run('screenWakeDesired'), true, 'pause keeps the screen awake');
  assert.equal(sentinels[0].releaseCount, 0);
  run('handleStart()'); // resume
  await flushMicrotasks();
  assert.equal(types.length, 1, 'do not create redundant wake-lock requests');
  run('handleReset()');
  assert.equal(sentinels[0].releaseCount, 1);
  assert.equal(run('screenWakeDesired'), false);

  run('handleStart()');
  await flushMicrotasks();
  run('finish()');
  assert.equal(sentinels[1].releaseCount, 1, 'arrival releases the lock');

  run('handleReset()');
  run('handleStart()');
  await flushMicrotasks();
  run('selectRoute(5)');
  assert.equal(sentinels[2].releaseCount, 1, 'route change releases the lock');
});

test('backgrounding releases the wake lock and foregrounding reacquires it, even while paused', async () => {
  const locks = [];
  const {run} = makeApp({wakeLockRequest() {
    const lock = fakeWakeSentinel();
    locks.push(lock);
    return Promise.resolve(lock);
  }});
  run('handleStart()');
  await flushMicrotasks();
  run('handleStart()'); // pause
  run("document.visibilityState = 'hidden'; document.dispatchEvent({type:'visibilitychange'})");
  assert.equal(locks[0].releaseCount, 1);
  assert.equal(run('screenWakeDesired'), true);
  run("document.visibilityState = 'visible'; document.dispatchEvent({type:'visibilitychange'})");
  await flushMicrotasks();
  assert.equal(locks.length, 2);
  assert.equal(run('screenWakeLock !== null'), true);
  run("window.dispatchEvent({type:'pagehide'})");
  assert.equal(locks[1].releaseCount, 1);
  run("window.dispatchEvent({type:'pageshow'})");
  await flushMicrotasks();
  assert.equal(locks.length, 3);
  run('handleReset()');
});

test('pending wake-lock requests cannot leave a lock after reset or background switch', async () => {
  const resolvers = [];
  const {run} = makeApp({wakeLockRequest() {
    return new Promise(resolve => resolvers.push(resolve));
  }});
  run('handleStart()');
  assert.equal(resolvers.length, 1);
  run('handleReset()');
  const stale = fakeWakeSentinel();
  resolvers[0](stale);
  await flushMicrotasks();
  assert.equal(stale.releaseCount, 1, 'late completion must be immediately released');
  assert.equal(resolvers.length, 1, 'reset must not retry');

  run('handleStart()');
  run("document.visibilityState = 'hidden'; document.dispatchEvent({type:'visibilitychange'})");
  run("document.visibilityState = 'visible'; document.dispatchEvent({type:'visibilitychange'})");
  const backgrounded = fakeWakeSentinel();
  resolvers[1](backgrounded);
  await flushMicrotasks();
  assert.equal(backgrounded.releaseCount, 1);
  assert.equal(resolvers.length, 3, 'foreground is retried after previous request settles');
  run('handleReset()');
  const latest = fakeWakeSentinel();
  resolvers[2](latest);
  await flushMicrotasks();
  assert.equal(latest.releaseCount, 1);
});

test('unsupported or rejected wake lock never breaks existing timer controls', async () => {
  const noSupport = makeApp();
  noSupport.run('handleStart()');
  assert.equal(noSupport.run('running'), true);
  noSupport.run('handleReset()');

  const rejected = makeApp({wakeLockRequest: () => Promise.reject(new Error('battery saver'))});
  rejected.run('handleStart()');
  await flushMicrotasks();
  assert.equal(rejected.run('running'), true);
  rejected.run('handleReset()');
});

test('wake-lock diagnostic reports supported/active/failed/unsupported states and offers safe manual retry', async () => {
  const noSupport=makeApp();
  noSupport.run('handleStart()');
  assert.equal(noSupport.el('wakePanel').hidden,false);
  assert.equal(noSupport.el('wakeStatus').attributes['data-state'],'unsupported');
  assert.equal(noSupport.el('wakeRetry').hidden,true);
  noSupport.run('handleReset()');
  assert.equal(noSupport.el('wakePanel').hidden,true);

  let shouldFail=true;
  const app=makeApp({wakeLockRequest() {
    if (shouldFail) return Promise.reject(Object.assign(new Error('denied'),{name:'NotAllowedError'}));
    return Promise.resolve(fakeWakeSentinel());
  }});
  app.run('handleStart()');
  await flushMicrotasks();
  assert.equal(app.el('wakeStatus').attributes['data-state'],'failed');
  assert.equal(app.el('wakeRetry').hidden,false);
  assert.ok(app.el('wakeStatus').textContent.includes('NotAllowedError'));
  shouldFail=false;
  app.run('retryScreenWakeLock()');
  await flushMicrotasks();
  assert.equal(app.el('wakeStatus').attributes['data-state'],'active');
  assert.equal(app.el('wakeRetry').hidden,true);
  app.run('handleReset()');
  assert.equal(app.el('wakePanel').hidden,true);
});

test('Yamanote loop reaches Tokyo only at timer end and retains correct station code', () => {
  const {run,el,advance}=makeApp();
  run('selectRoute(6)');
  run('handleStart()');
  advance(240000); run('tick()');
  assert.notEqual(el('currentStation').textContent,'📍 東京');
  advance(60000); run('tick()');
  assert.equal(el('currentStation').textContent,'📍 東京');
  assert.equal(run('running'),false);
  assert.ok(el('overlayTitle').textContent.includes('一周'));
});

test('BGMer bundle activates only after valid manifest and media file are confirmed', async () => {
  const hits=[];
  const data = {
    version:1,file:'bgmer-train-timer.m4a',
    tracks:[
      {title:'並走ハピネス',start:0,end:100},
      {title:'グルーヴコースター',start:100,end:192},
      {title:'爆発寸前！',start:192,end:281}
    ]
  };
  const {run,el,mediaElements,audioBlobs,advance}=makeApp({fetchResponder: async(url,opts)=>{
    hits.push([url,opts && opts.method]);
    if (String(url).endsWith('.json')) return {ok:true,json:async()=>data};
    if (String(url).endsWith('.m4a')) return {ok:true};
    throw Error('unexpected request: '+url);
  }});
  await flushMicrotasks();
  assert.equal(run('bgmerBundle !== null'),true,'the bundle is verified');
  assert.equal(el('bgmerAvailability').textContent.includes('準備OK'),true);
  assert.deepEqual(hits.map(i=>i[1]),[undefined,'HEAD']);
  run('handleStart()');
  assert.equal(mediaElements.length,1);
  const a=mediaElements[0];
  assert.equal(a.src,'assets/music/bgmer-train-timer.m4a');
  assert.equal(a.playCount,1);
  assert.equal(a.playbackRate,1, 'use each original song at natural tempo');
  assert.equal(audioBlobs.length,0, 'no synthetic WAV needed');
  assert.ok(el('musicPace').textContent.includes('並走ハピネス'));
  advance(150000);run('tick()');
  assert.equal(a.currentTime,100,'halfway seeks into the groove song');
  assert.equal(a.playCount,1);
  assert.equal(a.src,'assets/music/bgmer-train-timer.m4a');
  assert.ok(el('musicPace').textContent.includes('グルーヴコースター'));
  assert.ok(el('musicStatus').textContent.includes('グルーヴコースター'));
  a.currentTime=191.8;
  a.dispatchEvent({type:'timeupdate'});
  assert.equal(a.currentTime,100,'same player repeats within second song');
  advance(90000);run('tick()');
  assert.equal(a.currentTime,192,'last fifth switches to the final song');
  assert.equal(a.playCount,1);
  assert.ok(el('musicPace').textContent.includes('爆発寸前！'));
  run('handleStart()'); // pause
  assert.equal(a.paused,true);
  run('handleStart()'); // resume
  assert.equal(a.currentTime,192);
  assert.equal(a.playCount,2, 'resume still works with the single media player');
  run('handleReset()');
  assert.equal(a.paused,true);
});

test('invalid BGMer manifest or missing media keeps existing audio functional', async () => {
  const cases=[
    {payload:{version:1,file:'https://otherhost/music.m4a',tracks:[]},exists:true},
    {payload:{version:1,file:'bgmer-train-timer.m4a',tracks:[
      {title:'並走ハピネス',start:0,end:100},
      {title:'グルーヴコースター',start:100,end:180},
      {title:'爆発寸前！',start:180,end:270}
    ]},exists:false}
  ];
  for (const c of cases) {
    const {run,mediaElements,audioBlobs,el}=makeApp({fetchResponder:async(url)=>{
      return String(url).endsWith('.json') ?
        {ok:true,json:async()=>c.payload} : {ok:c.exists};
    }});
    await flushMicrotasks();
    assert.equal(run('bgmerBundle === null'),true);
    assert.ok(el('bgmerAvailability').textContent.includes('未配置'));
    run('handleStart()');
    assert.equal(mediaElements.length,1);
    assert.equal(audioBlobs.length,1);
    assert.ok(mediaElements[0].src.startsWith('blob:'));
    run('handleReset()');
  }
});

test('BGMer assets arriving after timer start are activated only after stop', async () => {
  let respond;
  const pending = new Promise(resolve=>respond=resolve);
  const {run,mediaElements}=makeApp({fetchResponder:async(url,options)=>{
    if (options && options.method==='HEAD')return {ok:true};
    return pending;
  }});
  run('handleStart()');
  assert.ok(mediaElements[0].src.startsWith('blob:'));
  respond({ok:true,json:async()=>({
    version:1,file:'bgmer-train-timer.m4a',tracks:[
      {title:'並走ハピネス',start:0,end:90},
      {title:'グルーヴコースター',start:90,end:180},
      {title:'爆発寸前！',start:180,end:270}
    ]})});
  await flushMicrotasks();
  assert.equal(run('bgmerBundle !== null'),true);
  assert.equal(mediaElements[0].playCount,1);
  run('handleStart()'); // pause unlocks new audio for next play
  run('handleStart()'); // resume
  assert.equal(mediaElements.length,2);
  assert.equal(mediaElements[1].src,'assets/music/bgmer-train-timer.m4a');
  run('handleReset()');
});
