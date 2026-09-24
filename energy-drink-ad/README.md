# Energy Drink Ad (15s, 9:16)

A vertical video ad for TikTok, Reels and Shorts, rendered entirely from code, soundtrack included. The finished file is `out/energy_ad.mp4`.

| Time | Scene |
|---|---|
| 0.0–1.9s | "3:00 PM / CRASHING?" hook with a lightning strike and a can-crack sound |
| 1.9–5.0s | The can slams in with a shockwave and electric arcs: **WAKE UP.** |
| 5.0–9.6s | Kinetic claims synced to the 140 BPM beat |
| 9.6–12.2s | Three-flavor lineup: **PICK YOUR POWER** |
| 12.2–15.0s | **Trademark end card**: logo, brand name™, slogan™ and the legal trademark line |

## Use your own brand

1. Put your logo in `brand/logo.png`. A transparent PNG works best, ideally square and at least 1000px. If there's no file, a neon bolt logo is drawn instead.
2. Open `ad.html` and edit the `BRAND` block at the top: name, company, tagline, colors, flavors and claims.
3. Rebuild:
   ```bash
   pip install playwright imageio-ffmpeg numpy
   python build.py          # set CHROMIUM_PATH if Chromium isn't at /opt/pw-browsers/chromium
   ```
4. To preview live, serve the folder (`python -m http.server`) and open `ad.html`.

> ™ vs ®: use **™** for any mark you claim. Only use **®** once the mark is actually registered with the USPTO. Also make sure the claims (caffeine amount, sugar) match your product label.
