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
function makeApp() {
  const elements = new Map();
  const el = id => {
    if (!elements.has(id)) elements.set(id, new FakeElement());
    return elements.get(id);
  };
  const buttons = Array.from({length: 6}, () => new FakeElement());
  let clock = 1_700_000_000_000;
  let nextTimerId = 1;
  const timers = new Map();
  class Clock extends Date { static now() { return clock; } }
  const document = {
    body: new FakeElement(),
    getElementById: el,
    createElement: () => new FakeElement(),
    querySelectorAll: selector => selector === '.route-btn' ? buttons : []
  };
  const ctx = vm.createContext({
    window: {}, document, Date: Clock, console,
    setInterval(fn, ms) { const id = nextTimerId++; timers.set(id, fn); return id; },
    clearInterval(id) { timers.delete(id); },
    setTimeout(fn, ms) { const id = nextTimerId++; timers.set(id, fn); return id; },
    clearTimeout(id) { timers.delete(id); }
  });
  vm.runInContext(appCode, ctx, {timeout: 5000});
  const run = code => vm.runInContext(code, ctx, {timeout: 5000});
  return {run, el, advance: ms => { clock += ms; }, buttons};
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
