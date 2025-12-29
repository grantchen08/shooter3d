# Snowball Blitz - Prototype

A 3D arcade physics shooter game built with Three.js and cannon-es.

## Project Structure

```
shooter3d/
├── docs/              # Web app (GitHub Pages source)
│   ├── index.html     # Main HTML entry point
│   ├── config/
│   │   └── game.json   # Gameplay tuning (gravity, projectile speed)
│   ├── css/
│   │   └── styles.css # Game styles
│   ├── js/
│   │   ├── main.js    # Game entry point / orchestration
│   │   ├── audio.js   # WebAudio SFX helpers (asset-free)
│   │   ├── tuning.js  # Debug tuning panel (live tweak + export JSON)
│   │   └── ui.js      # HUD + overlays + floating text
│   └── assets/        # Game assets (models, textures, etc.)
└── doc/
    ├── GameDesign.md         # Game design document
    └── ImplementationPlan.md # Development roadmap
```

## Running the Game

### Option 1: Simple HTTP Server (Recommended)

Using Python 3:
```bash
python3 -m http.server 8000
```

Then open `http://localhost:8000/docs/` in your browser.

Note: this project uses **ES modules**, so you must run it via an HTTP server (not `file://`).

### Option 2: Node.js HTTP Server

Using `http-server`:
```bash
npx http-server -p 8000
```

### Option 3: VS Code Live Server

If using VS Code, install the "Live Server" extension and right-click `index.html` → "Open with Live Server"

## Requirements

- Modern web browser with WebGL support (Chrome, Firefox, Safari, Edge)
- Landscape orientation (game is designed for horizontal screens)
- Fullscreen supported (use the ⛶ button or press `F`). Note: **iPhone/iPad browsers often don’t support fullscreen for canvas**; use **Share → Add to Home Screen** for fullscreen-like “app mode”.

## Configuration

Gameplay tuning lives in `docs/config/game.json`:

- `projectile.initialSpeed`: initial projectile speed
- `physics.gravity`: gravity vector `{x,y,z}` (also used for trajectory prediction)
- `camera.distance`: camera distance from shooter
- `camera.height`: camera height offset above shooter
- `camera.orbitPitchDeg`: camera orbit pitch in **degrees**
- `audio.bgmVolume`: background music volume (0..1)
- `audio.sfxVolume`: sound effects volume (0..1)
- `player.height`: shooter (player) height (visual)
- `snowman.height`: target snowman height (visual + collider)
- `trajectory.segmentLength`: spacing between predicted-arc points (smaller = smoother)
- `trajectory.maxPoints`: max number of points used to draw the arc
- `targets.minDistance`: nearest target/platform distance from shooter
- `targets.maxDistance`: farthest target/platform distance from shooter

## Testing notes

- **GitHub Pages caching**: if you don’t see the latest changes, do a hard refresh (`Ctrl+Shift+R`) or use a private window.
- **Debug mode**: open the game with `?debug=1` to enable extra logs and the on-screen debug line.
- **Debug tuning panel** (only in `?debug=1`): live-edit projectile speed, gravity, camera (height/distance/pitch), and target min/max distance, then use **Copy JSON** / **Download game.json** to export the current values. Values are saved in your browser via `localStorage`.
- **Audio**: browsers require a user gesture to start WebAudio; sound effects will begin after your first interaction (tap/click/drag/key press).
- **BGM**: background music tracks live in `docs/assets/music/` and will start after your first interaction as well.
- **Mute**: use the on-screen **M** (music) and **SFX** buttons to mute/unmute.
- **iPhone tip**: if you hear BGM but not SFX, check the **silent switch / ringer mode** (iOS can mute WebAudio sound effects depending on device settings).
- **Targeting**: The trajectory line now shows a glowing ball where the projectile will hit the ground or targets.
- **Visuals**: Projectiles now have a trailing effect, and the trajectory line is thicker for better visibility.
- **Camera**: The camera now rotates with the player's aim, keeping the "gun" centered horizontally while aiming.

## WebGL issues
  - Chrome/Chromium: check `chrome://gpu` and ensure hardware acceleration is enabled
  - Try Firefox if Chromium fails to create a WebGL context on Linux

## Current Status

Prototype includes: aim drag, projectile physics + trajectory, targets + scoring, timer/win/lose, basic effects, and WebAudio SFX (shoot + snow explosion).

## Next Steps

See `doc/ImplementationPlan.md` for the complete development roadmap.

## GitHub Pages

This repo is intended to be published via GitHub Pages from `main:/docs`.
