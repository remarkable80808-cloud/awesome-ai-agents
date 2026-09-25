const { chromium } = require('playwright');
const { spawn } = require('child_process');
const http = require('http'), fs = require('fs'), path = require('path');
const FF = process.env.FF, mode = process.argv[2], PAGE = process.env.PAGE || 'tscene.html', OUT = process.env.OUT || 'traim';
const srv = http.createServer((q, r) => { const f = path.join(__dirname, decodeURIComponent(q.url.split('?')[0]));
  fs.readFile(f, (e, d) => { if (e) { r.writeHead(404); return r.end(); } r.writeHead(200, { 'Content-Type': f.endsWith('.js') ? 'text/javascript' : f.endsWith('.html') ? 'text/html' : f.endsWith('.woff2') ? 'font/woff2' : 'application/octet-stream' }); r.end(d); }); }).listen(8123);
(async () => {
  const br = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const p = await br.newPage({ viewport: { width: 1080, height: 1920 } });
  const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') errs.push(m.text()); });
  await p.goto('http://localhost:8123/' + PAGE); await p.waitForFunction(() => window.READY, null, { timeout: 60000 });
  const grab = async t => Buffer.from((await p.evaluate(t => { render(t); return document.getElementById('c').toDataURL('image/png'); }, t)).split(',')[1], 'base64');
  if (mode === 'stills') {
    for (const t of process.argv.slice(3).map(Number)) { const s = Date.now(); fs.writeFileSync(`${OUT}_still_${t.toFixed(2)}.png`, await grab(t)); console.log(t, Date.now() - s, 'ms'); }
  } else {
    const ff = spawn(FF, ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', '30', '-c:v', 'png', '-i', '-', '-c:v', 'libx264', '-preset', 'slow', '-crf', '18', '-pix_fmt', 'yuv420p', OUT + '_video_only.mp4'], { stdio: ['pipe', 'inherit', 'inherit'] });
    const t0 = Date.now();
    for (let f = 0; f < 450; f++) {
      const buf = await grab(f / 30);
      if (!ff.stdin.write(buf)) await new Promise(r => ff.stdin.once('drain', r));
      if (f === Math.round(14.5 * 30)) fs.writeFileSync(OUT + '_cover.png', buf);
      if (f % 50 === 0) console.log('frame', f, ((Date.now() - t0) / 1000).toFixed(0) + 's');
    }
    ff.stdin.end(); await new Promise(r => ff.on('close', r));
    fs.writeFileSync(OUT + '_events.json', JSON.stringify(await p.evaluate(() => window.EVENTS)));
  }
  console.log('errors', errs.slice(0, 10));
  await br.close(); srv.close();
})();
