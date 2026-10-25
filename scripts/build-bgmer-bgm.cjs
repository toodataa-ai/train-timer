'use strict';

// BGMerの利用規約に従い、音源は公式サイトから人が手動で入手すること。
// このスクリプトはローカルの3ファイルのみ処理し、サイトへのアクセスは一切行わない。
const fs = require('node:fs');
const path = require('node:path');
const {spawnSync} = require('node:child_process');

const root = path.resolve(__dirname, '..');
const directory = path.join(root, 'assets', 'music');
const sources = path.join(directory, 'source');
const outputFile = path.join(directory, 'bgmer-train-timer.m4a');
const manifestFile = path.join(directory, 'bgmer-train-timer.json');
const tracks = [
  {file:'01-happiness.mp3',title:'並走ハピネス',url:'https://bgmer.net/music/277/'},
  {file:'02-groove-coaster.mp3',title:'グルーヴコースター',url:'https://bgmer.net/music/251/'},
  {file:'03-explosion.mp3',title:'爆発寸前！',url:'https://bgmer.net/music/148/'}
];

function command(executable, args) {
  const proc = spawnSync(executable,args,{encoding:'utf8',maxBuffer:16*1024*1024});
  if (proc.error) throw new Error(executable+' が使えません: '+proc.error.message);
  if (proc.status !== 0) throw new Error(executable+' 失敗:\n'+(proc.stderr||proc.stdout));
  return proc.stdout;
}
function probe(file) {
  const out=command('ffprobe',['-v','error','-show_entries','format=duration',
    '-of','default=noprint_wrappers=1:nokey=1',file]);
  const duration=Number(out.trim());
  if (!Number.isFinite(duration) || duration < 15 || duration > 900) {
    throw new Error('音源の長さが不正です: '+path.basename(file)+' '+duration);
  }
  return duration;
}
function makeManifest(durations) {
  let cursor=0;
  const parts=tracks.map((track,i)=>{
    const start=Number(cursor.toFixed(3));
    cursor+=durations[i];
    const end=Number(cursor.toFixed(3));
    return {title:track.title,source_url:track.url,start,end};
  });
  return {
    version:1,file:path.basename(outputFile),provider:'BGMer',provider_url:'https://bgmer.net/',
    license_url:'https://bgmer.net/terms/',source_method:'official-site-manual-download',
    tracks:parts
  };
}
function main() {
  const inputs=tracks.map(track=>path.join(sources,track.file));
  for(let i=0;i<inputs.length;i++) {
    if(!fs.existsSync(inputs[i])) throw new Error(
      '未配置: '+inputs[i]+'\n公式サイトからSHORT版を手動ダウンロードして配置してください。');
  }
  const durations=inputs.map(probe);
  const target=outputFile+'.partial.m4a';
  fs.mkdirSync(directory,{recursive:true});
  // 音量差を抑えるため個別にコンプレッション。切り替え直前のクリック防止にフェード。
  const filters=durations.map((dur,i)=>
    '['+i+':a:0]aresample=44100,aformat=channel_layouts=stereo,'+
    'asetpts=PTS-STARTPTS,acompressor=threshold=-17dB:ratio=2:attack=10:release=150,'+
    'afade=t=in:st=0:d=0.10,afade=t=out:st='+
    Math.max(0,dur-0.20).toFixed(3)+':d=0.18[a'+i+']');
  filters.push(tracks.map((_,i)=>'[a'+i+']').join('')+'concat=n=3:v=0:a=1[all]');
  try {
    command('ffmpeg',['-hide_banner','-loglevel','error','-y',
      ...inputs.flatMap(input=>['-i',input]),
      '-filter_complex',filters.join(';'),'-map','[all]','-vn','-ar','44100',
      '-c:a','aac','-b:a','128k','-movflags','+faststart',target]);
    const outputDuration=probe(target);
    const expected=durations.reduce((a,b)=>a+b,0);
    if (Math.abs(outputDuration-expected)>0.30) {
      throw new Error('結合後の長さが一致しません: '+outputDuration+' vs '+expected);
    }
    fs.renameSync(target,outputFile);
    fs.writeFileSync(manifestFile,JSON.stringify(makeManifest(durations),null,2)+'\n','utf8');
    console.log('音源作成: '+outputFile);
    console.log('区間定義: '+manifestFile);
    console.log('出典: 音楽 BGMer https://bgmer.net/');
  } finally {
    if(fs.existsSync(target))fs.unlinkSync(target);
  }
}
if(require.main===module) {
  try {main();} catch(e) {console.error(e.message);process.exitCode=1;}
}
module.exports={makeManifest,tracks};
