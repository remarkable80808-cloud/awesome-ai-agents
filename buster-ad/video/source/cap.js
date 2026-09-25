const { chromium } = require('playwright');
const { spawn } = require('child_process');
const fs = require('fs');
const FF = process.env.FF, mode = process.argv[2];
(async () => {
  const br = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--allow-file-access-from-files'] });
  const p = await br.newPage({ viewport: { width: 1080, height: 1920 } });
  const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => errs.push('console: ' + m.text()));
  await p.goto('file://' + __dirname + '/scene.html');
  await p.evaluate(() => document.fonts.load('40px PS2P'));
  console.log('font ok:', await p.evaluate(() => document.fonts.check('40px PS2P')));
  const grab = async t => Buffer.from((await p.evaluate(t => { render(t); return document.getElementById('c').toDataURL('image/png'); }, t)).split(',')[1], 'base64');
  if (mode === 'stills') {
    const ts = process.argv.slice(3).map(Number);
    // render sequentially up to each time so the sim is consistent
    let i = 0;
    for (let f = 0; f <= Math.round(Math.max(...ts) * 30); f++) {
      const t = f / 30;
      if (ts.some(x => Math.round(x * 30) === f)) { fs.writeFileSync(`still_${t.toFixed(2)}.png`, await grab(t)); }
      else await p.evaluate(t => render(t), t);
    }
  } else {
    const ff = spawn(FF, ['-y', '-f', 'image2pipe', '-framerate', '30', '-c:v', 'png', '-i', '-', '-c:v', 'libx264', '-preset', 'slow', '-crf', '17', '-pix_fmt', 'yuv420p', 'video_only.mp4'], { stdio: ['pipe', 'ignore', 'inherit'] });
    for (let f = 0; f < 450; f++) {
      const buf = await grab(f / 30);
      if (!ff.stdin.write(buf)) await new Promise(r => ff.stdin.once('drain', r));
      if (f === Math.round(14.5 * 30)) fs.writeFileSync('cover.png', buf);
    }
    ff.stdin.end(); await new Promise(r => ff.on('close', r));
    fs.writeFileSync('events.json', JSON.stringify(await p.evaluate(() => window.EV)));
  }
  console.log('errors', errs);
  await br.close();
})();
