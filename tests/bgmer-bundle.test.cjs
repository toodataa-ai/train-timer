'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {makeManifest,tracks}=require('../scripts/build-bgmer-bgm.cjs');

test('bundled track order, licensing sources, and boundaries are deterministic',()=>{
  const manifest=makeManifest([101,92.5,89]);
  assert.equal(manifest.version,1);
  assert.equal(manifest.file,'bgmer-train-timer.m4a');
  assert.equal(manifest.source_method,'official-site-manual-download');
  assert.equal(manifest.tracks.length,3);
  assert.deepEqual(manifest.tracks.map(t=>t.title),[
    '並走ハピネス','グルーヴコースター','爆発寸前！'
  ]);
  assert.deepEqual(manifest.tracks.map(t=>[t.start,t.end]),[
    [0,101],[101,193.5],[193.5,282.5]
  ]);
  for(const [i,t] of manifest.tracks.entries()){
    assert.equal(t.source_url,tracks[i].url);
    assert.ok(t.end>t.start);
  }
});
