'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const production = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const preview = fs.readFileSync(path.join(root, 'voice-balance-preview.html'), 'utf8');
const label = '<div class="audio-hint">【音量調整テスト版】BGMはアナウンス中も下げずに常に75%</div>\n';
const steadyVolume = 'try { if (musicAudio.volume !== 0.75) musicAudio.volume = 0.75; } catch(e) {}';

test('preview differs from production only by its test-version labels', () => {
  assert.ok(preview.includes(label));
  assert.ok(preview.includes(steadyVolume));
  assert.ok(production.includes(steadyVolume), 'production keeps BGM at a steady 75% during announcements');
  assert.equal(
    preview
      .replace('<title>あそびタイマー🚃｜音量調整テスト版</title>', '<title>あそびタイマー🚃</title>')
      .replace(label, ''),
    production,
    'no route, speech voice/rate/pitch, playback or UI changes beyond the preview label'
  );
});

test('preview JS parses and keeps BGM at 75% around narration', () => {
  const script = preview.match(/<script>([\s\S]*?)<\/script>/);
  assert.ok(script, 'inline app script present');
  assert.doesNotThrow(() => new vm.Script(script[1]));
  const duck = script[1].match(/function duckMusic\(isSpeaking\) \{[\s\S]*?\n\}/);
  assert.ok(duck, 'duckMusic function present');
  const musicAudio = { paused: false, volume: 0.75 };
  const context = vm.createContext({ musicAudio });
  vm.runInContext(duck[0] + '\nduckMusic(true);', context);
  assert.equal(musicAudio.volume, 0.75);
  vm.runInContext('duckMusic(false);', context);
  assert.equal(musicAudio.volume, 0.75);
  musicAudio.paused = true; musicAudio.volume = 0.5;
  vm.runInContext('duckMusic(true);', context);
  assert.equal(musicAudio.volume, 0.5, 'paused audio is not modified');
});
