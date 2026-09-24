"""Render ad.html to a 1080x1920 MP4 with a synthesized soundtrack.

    pip install playwright imageio-ffmpeg numpy
    python build.py            # -> out/energy_ad.mp4
"""
import functools
import http.server
import os
import subprocess
import threading
import wave

import imageio_ffmpeg
import numpy as np
from playwright.sync_api import sync_playwright

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "out")
FPS = 30
SR = 44100
CHROMIUM = os.environ.get("CHROMIUM_PATH", "/opt/pw-browsers/chromium")


# ─── soundtrack ──────────────────────────────────────────────────────────────
def soundtrack(duration):
    n = int(duration * SR)
    t = np.arange(n) / SR
    mix = np.zeros(n)
    rnd = np.random.default_rng(1)

    def add(sig, at):
        i = int(at * SR)
        sig = sig[: max(0, n - i)]
        mix[i : i + len(sig)] += sig

    def env(length, decay):
        tt = np.arange(int(length * SR)) / SR
        return tt, np.exp(-tt * decay)

    def kick():
        tt, e = env(0.45, 9)
        f = 45 + 110 * np.exp(-tt * 30)
        return np.sin(2 * np.pi * np.cumsum(f) / SR) * e * 0.9

    def snare():
        tt, e = env(0.25, 18)
        return (rnd.standard_normal(len(tt)) * 0.5 + np.sin(2 * np.pi * 190 * tt) * 0.4) * e * 0.55

    def hat():
        tt, e = env(0.06, 70)
        x = rnd.standard_normal(len(tt))
        return np.diff(x, prepend=0) * e * 0.12

    def impact(length=2.5):
        tt, e = env(length, 2.2)
        boom = np.sin(2 * np.pi * np.cumsum(38 + 80 * np.exp(-tt * 6)) / SR)
        noise = rnd.standard_normal(len(tt)) * np.exp(-tt * 5)
        return (boom * 1.0 + noise * 0.35) * e

    def fizz(length=0.9):  # can crack + carbonation
        tt, e = env(length, 3.5)
        x = rnd.standard_normal(len(tt))
        x = np.diff(np.diff(x, prepend=0), prepend=0)
        crack = np.zeros(len(tt)); crack[: int(0.02 * SR)] = rnd.standard_normal(int(0.02 * SR)) * 2
        return (x * 0.18 * e) + crack * 0.4

    def riser(length):
        tt = np.arange(int(length * SR)) / SR
        up = (tt / length) ** 2
        tone = np.sin(2 * np.pi * np.cumsum(200 + 1400 * up) / SR)
        return (rnd.standard_normal(len(tt)) * 0.15 + tone * 0.15) * up

    # 0 – 1.9: tension drone, thunder on "CRASHING?", can crack
    drone = np.sin(2 * np.pi * 55 * t) * 0.12 * np.clip(t / 0.8, 0, 1) * (t < 1.9)
    mix += drone
    add(impact(1.5) * 0.9, 0.95)
    add(riser(0.9), 1.0)
    add(fizz(), 1.55)
    # 2.3 – 12.2: 140 BPM beat
    beat = 60 / 140
    start, stop = 2.3, 12.2
    add(impact() * 0.8, start)
    b = 0
    while start + b * beat < stop - 0.05:
        at = start + b * beat
        add(kick(), at)
        if b % 2 == 1:
            add(snare(), at)
        add(hat(), at + beat / 2)
        # sub bass on the off-beat, root changes every bar
        root = [55, 55, 65.4, 49][(b // 4) % 4]
        tt, e = env(beat / 2, 6)
        add(np.tanh(np.sin(2 * np.pi * root * tt) * 3) * e * 0.35, at + beat / 2)
        b += 1
    add(riser(1.2) * 1.2, stop - 1.2)
    # 12.2: logo slam + tail
    add(impact(2.8) * 1.2, stop)
    add(fizz(1.4) * 0.8, stop + 0.1)

    mix = np.tanh(mix * 1.1)
    mix *= np.clip((duration - t) / 0.6, 0, 1)  # fade out
    return (mix / np.max(np.abs(mix)) * 0.9 * 32767).astype(np.int16)


def write_wav(path, samples):
    with wave.open(path, "wb") as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR)
        w.writeframes(samples.tobytes())


# ─── video ───────────────────────────────────────────────────────────────────
def main():
    os.makedirs(OUT, exist_ok=True)
    handler = functools.partial(http.server.SimpleHTTPRequestHandler, directory=HERE)
    handler.log_message = lambda *a: None
    srv = http.server.ThreadingHTTPServer(("127.0.0.1", 0), handler)
    threading.Thread(target=srv.serve_forever, daemon=True).start()

    ffmpeg = imageio_ffmpeg.get_ffmpeg_exe()
    silent = os.path.join(OUT, "_video.mp4")
    audio = os.path.join(OUT, "_audio.wav")
    final = os.path.join(OUT, "energy_ad.mp4")

    with sync_playwright() as p:
        browser = p.chromium.launch(executable_path=CHROMIUM if os.path.exists(CHROMIUM) else None)
        page = browser.new_page(viewport={"width": 1080, "height": 1920})
        page.goto(f"http://127.0.0.1:{srv.server_port}/ad.html")
        page.evaluate("window.ready")
        duration = page.evaluate("window.DURATION")
        frames = int(duration * FPS)

        enc = subprocess.Popen(
            [ffmpeg, "-y", "-loglevel", "error", "-f", "image2pipe", "-framerate", str(FPS), "-i", "-",
             "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "18", "-preset", "medium", silent],
            stdin=subprocess.PIPE)
        for i in range(frames):
            page.evaluate(f"render({i / FPS})")
            enc.stdin.write(page.locator("canvas").screenshot(type="jpeg", quality=95))
            if i % 60 == 0:
                print(f"frame {i}/{frames}")
        enc.stdin.close(); enc.wait()
        for s in (0.6, 3.0, 7.5, 11.0, 14.5):  # preview stills
            page.evaluate(f"render({s})")
            page.locator("canvas").screenshot(path=os.path.join(OUT, f"still_{s:04.1f}s.png"))
        browser.close()
    srv.shutdown()

    write_wav(audio, soundtrack(duration))
    subprocess.run([ffmpeg, "-y", "-loglevel", "error", "-i", silent, "-i", audio,
                    "-c:v", "copy", "-c:a", "aac", "-b:a", "192k", "-shortest",
                    "-movflags", "+faststart", final], check=True)
    os.remove(silent); os.remove(audio)
    print("wrote", final)


if __name__ == "__main__":
    main()
