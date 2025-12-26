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
│   │   └── main.js    # Main game logic
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

## Current Status

**Stage 1 Complete:** Player + third-person camera orbit with mouse/touch drag

## Next Steps

See `doc/ImplementationPlan.md` for the complete development roadmap.

## GitHub Pages

This repo is intended to be published via GitHub Pages from `main:/docs`.
