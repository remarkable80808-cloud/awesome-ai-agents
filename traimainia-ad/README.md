# Traimainia social ad (15s, vertical)

- `traimainia_ad_1080x1920.mp4`: 1080×1920, 30 fps, H.264 + AAC stereo, 15 s.
- `traimainia_ad_cover.png`: cover frame (end card).
- `source/`: the three.js scene (`tscene.html`), the frame capture script (`tcap.js`) and the soundtrack synth (`tsynth.py`). Re-render the same way as `buster-ad/video` (`npm i playwright three @fontsource/teko @fontsource/rajdhani`, then `node tcap.js video`, then `python3 tsynth.py`, then mux with ffmpeg).
