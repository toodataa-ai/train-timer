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
  }
  get innerHTML() { return this._html || ''; }
  set innerHTML(value) { this._html = value; if (value === '') this.children = []; }
  setAttribute(key, value) { this.attributes[key] = value; }
  appendChild(el) { this.children.push(el); }
  scrollIntoView() {}
}
function makeApp({wakeLockRequest} = {}) {
  const elements = new Map();
  const el = id => {
    if (!elements.has(id)) elements.set(id, new FakeElement());
    return elements.get(id);
  };
  const buttons = Array.from({length: 6}, () => new FakeElement());
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

test('six existing and new routes have the expected Tokyo-origin destinations', () => {
  const {run,el,buttons} = makeApp();
  const routes = run('ROUTES.map(r => ({from:r.from,to:r.to,n:r.stations.length}))');
  assert.deepEqual(Array.from(routes, r => [r.from,r.to]), [
    ['三鷹','千葉'], ['博多','東京'], ['高尾','東京'],
    ['松本','新宿'], ['東京','新青森'], ['東京','敦賀']
  ]);
  assert.equal(routes[4].n, 23);
  assert.equal(routes[5].n, 24);
  assert.equal(buttons.length, 6);
  for (let i = 0; i < routes.length; i++) {
    run('selectRoute('+i+')');
    assert.equal(el('labelFrom').textContent, routes[i].from);
    assert.equal(el('labelTo').textContent, routes[i].to);
    assert.equal(el('stationsScroll').children.length, routes[i].n);
    assert.ok(buttons[i].classList.contains('active'));
  }
  assert.equal(el('routeNote').hidden, false);
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


test('three-stage racing soundtrack accelerates at exactly 50% and 20% remaining', () => {
  const {run,el,advance,mediaElements,audioBlobs} = makeApp();
  run('selectRoute(5)'); // 北陸新幹線、5分
  run('handleStart()');
  assert.equal(mediaElements.length,1);
  const audio=mediaElements[0];
  assert.equal(audio.playbackRate,1.12);
  assert.ok(el('musicPace').textContent.includes('125 BPM'));
  assert.equal(el('musicPace').attributes['data-phase'],'0');
  assert.equal(audio.playCount,1);
  const src=audio.src;

  advance(149999); run('tick()');
  assert.equal(audio.playbackRate,1.12,'must not speed up before halfway');
  advance(1); run('tick()');
  assert.equal(audio.playbackRate,1.34,'accelerates immediately at 50%');
  assert.ok(el('musicPace').textContent.includes('150 BPM'));
  assert.equal(el('musicPace').attributes['data-phase'],'1');
  assert.equal(audio.src,src,'no source swapping');
  assert.equal(audio.playCount,1,'phase change must not invoke another play');

  advance(89999); run('tick()');
  assert.equal(audio.playbackRate,1.34,'second stage lasts through >20%');
  advance(1); run('tick()');
  assert.equal(audio.playbackRate,1.65,'final sprint at <=20%');
  assert.ok(el('musicPace').textContent.includes('185 BPM'));
  assert.equal(el('musicPace').attributes['data-phase'],'2');
  assert.equal(audio.playCount,1,'no iPhone autoplay issues on phase switching');
  assert.equal(audioBlobs.length,1,'all stages use same generated WAV');

  run('handleStart()'); // pause
  assert.equal(audio.paused,true);
  run('handleStart()'); // resume
  assert.equal(audio.playbackRate,1.65,'resume keeps final tempo');
  assert.equal(audio.playCount,2);
  run('handleReset()');
  assert.equal(audio.paused,true);
  assert.equal(audio.playbackRate,1.12,'reset goes back to beginning tempo');
  assert.equal(el('musicPace').textContent,'🎵 出発準備中');
  assert.equal(el('musicPace').attributes['data-phase'],'0');
});

test('new racing song is different from the old sparse melody and previews at normal tempo', () => {
  const {run,el,mediaElements,audioBlobs} = makeApp();
  const m=Array.from(run('MUSIC_MELODY'));
  assert.equal(m.length,32);
  assert.ok(m.every(f=>f>0),'fast eighth-note melody never leaves a beat empty');
  assert.ok(m.includes(1318.51),'includes soaring lead notes');
  assert.equal(Number(run('MUSIC_RATES[2]')),1.65);
  run('testMusic()');
  assert.equal(mediaElements[0].playbackRate,1.12);
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
