# Buster social ad (15s, vertical)

- `buster_ad_1080x1920.mp4` — 1080×1920, 30 fps, H.264 + AAC, 15 s. Fits TikTok, Instagram Reels, YouTube Shorts, and Facebook/Instagram Stories.
- `buster_ad_cover.png` — cover/thumbnail frame (price end card).

Key text stays inside the center safe zone (clear of the top tabs and the bottom caption/button overlay).

## Re-render
Requirements: Node + `playwright`, `@fontsource/press-start-2p`, Python 3 + `numpy`, `imageio-ffmpeg`.

```sh
cd source
npm i playwright @fontsource/press-start-2p
pip install numpy imageio-ffmpeg
FF=$(python3 -c "import imageio_ffmpeg as f;print(f.get_ffmpeg_exe())")
FF=$FF node cap.js video          # renders frames -> video_only.mp4, writes events.json
python3 synth.py                  # chiptune soundtrack synced to events.json -> music.wav
$FF -i video_only.mp4 -i music.wav -c:v copy -c:a aac -b:a 192k -shortest -movflags +faststart buster_ad_1080x1920.mp4
```
In `cap.js`, set `executablePath` to your Chromium path or remove it. Edit copy and timing in `scene.html` (`render(t)`), and edit music in `synth.py`.
