# Snowball Blitz - Prototype

A 3D arcade physics shooter game built with Three.js and cannon-es.

## Project Structure

```
shooter3d/
├── docs/              # Web app (GitHub Pages source)
│   ├── index.html     # Main HTML entry point
│   ├── css/
│   │   └── styles.css # Game styles
│   ├── js/
│   │   ├── main.js    # Game entry point / orchestration
│   │   ├── audio.js   # WebAudio SFX helpers (asset-free)
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

## Testing notes

- **GitHub Pages caching**: if you don’t see the latest changes, do a hard refresh (`Ctrl+Shift+R`) or use a private window.
- **Debug mode**: open the game with `?debug=1` to enable extra logs and the on-screen debug line.
- **Audio**: browsers require a user gesture to start WebAudio; sound effects will begin after your first interaction (tap/click/drag/key press).
- **WebGL issues**:
  - Chrome/Chromium: check `chrome://gpu` and ensure hardware acceleration is enabled
  - Try Firefox if Chromium fails to create a WebGL context on Linux

## Current Status

Prototype includes: aim drag, projectile physics + trajectory, targets + scoring, timer/win/lose, basic effects, and WebAudio SFX (shoot + snow explosion).

## Next Steps

See `doc/ImplementationPlan.md` for the complete development roadmap.

## GitHub Pages

This repo is intended to be published via GitHub Pages from `main:/docs`.
