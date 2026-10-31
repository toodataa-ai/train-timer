'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const production = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const preview = fs.readFileSync(path.join(root, 'voice-balance-preview.html'), 'utf8');
const label = '<div class="audio-hint">【音量調整テスト版】アナウンス中のBGMを10%に変更（通常時75%）</div>\n';
const originalDucking = 'try { musicAudio.volume = isSpeaking ? 0.32 : 0.75; } catch(e) {}';
const previewDucking = 'try { musicAudio.volume = isSpeaking ? 0.10 : 0.75; } catch(e) {}';

test('preview changes only the BGM ducking volume and test-version labels', () => {
  assert.ok(preview.includes(label));
  assert.ok(preview.includes(previewDucking));
  assert.ok(production.includes(originalDucking), 'production audio balance must stay unchanged');
  assert.equal(
    preview
      .replace('<title>あそびタイマー🚃｜音量調整テスト版</title>', '<title>あそびタイマー🚃</title>')
      .replace(label, '')
      .replace(previewDucking, originalDucking),
    production,
    'no route, speech voice/rate/pitch, playback or UI changes beyond the preview label'
  );
});

test('preview JS parses and restores 75% BGM after narration', () => {
  const script = preview.match(/<script>([\s\S]*?)<\/script>/);
  assert.ok(script, 'inline app script present');
  assert.doesNotThrow(() => new vm.Script(script[1]));
  const duck = script[1].match(/function duckMusic\(isSpeaking\) \{[\s\S]*?\n\}/);
  assert.ok(duck, 'duckMusic function present');
  const musicAudio = { paused: false, volume: 0.75 };
  const context = vm.createContext({ musicAudio });
  vm.runInContext(duck[0] + '\nduckMusic(true);', context);
  assert.equal(musicAudio.volume, 0.10);
  vm.runInContext('duckMusic(false);', context);
  assert.equal(musicAudio.volume, 0.75);
  musicAudio.paused = true;
  vm.runInContext('duckMusic(true);', context);
  assert.equal(musicAudio.volume, 0.75, 'paused audio is not modified');
});
