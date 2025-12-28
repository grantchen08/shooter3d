/**
 * Snowball Blitz - Main Game File
 * Stage 8: Timer + Game Loop
 */

import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';
import WebGL from 'https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/capabilities/WebGL.js';
import * as CANNON from 'https://cdn.jsdelivr.net/npm/cannon-es@0.20.0/dist/cannon-es.js';
import { createBgm, createSfx } from './audio.js';
import { createUI } from './ui.js';
import { createTuningPanel } from './tuning.js';

// Scene setup
let scene, camera, renderer;
let world; // Cannon.js physics world
let ground; // Ground plane
let player; // Player character

// Timing (for physics + lifetimes)
const clock = new THREE.Clock();

// Camera control variables
let cameraDistance = 8; // Distance from player
let cameraHeight = 3; // Height offset from player

// Camera orbit is fixed (3rd-person view). Drag/swipe controls AIM, not camera orbit.
const cameraOrbitYaw = 0; // radians
let cameraOrbitPitch = Math.PI / 10; // radians; configurable via camera.orbitPitchDeg

// Aim control variables (projectile orientation)
let aimYaw = 0; // Horizontal aim (yaw) in radians
let aimPitch = Math.PI / 6; // Vertical aim (pitch) in radians; +pitch aims down with our convention
const minAimPitch = -Math.PI / 3; // aim up limit
const maxAimPitch = Math.PI / 3; // aim down limit

// Input state
let isDragging = false;
let lastMouseX = 0;
let lastMouseY = 0;
let lastTouchX = 0;
let lastTouchY = 0;
const rotationSpeed = 0.005; // Sensitivity for camera rotation

// Projectiles
const projectiles = []; // { mesh: THREE.Mesh, body: CANNON.Body, age: number }
const projectileRadius = 0.15;
let projectileSpeed = 18; // configurable (see docs/config/game.json)
const projectileMaxAgeSec = 8;

// Platforms & targets
const platforms = []; // { mesh: THREE.Mesh, body: CANNON.Body }
const targets = []; // { mesh: THREE.Group, body: CANNON.Body, alive: boolean }

// UI
const SCORE_PER_TARGET = 50;

// Timer + game state
const TIME_LIMIT_SEC = 60;
let timeRemainingSec = TIME_LIMIT_SEC;
let fireButtonEl = null;
let gameState = 'playing'; // 'playing' | 'ended'

// Particle bursts (snow explosion)
const particleBursts = []; // { points, geom, positions, velocities, age, duration, material }

// Collision groups
const CG_PROJECTILE = 1;
const CG_TARGET = 2;
const CG_WORLD = 4;

// Body lookup tables (by cannon body id)
const projectileByBodyId = new Map(); // id -> projectile record
const targetByBodyId = new Map(); // id -> target record
const worldBodyIds = new Set(); // ids of ground/platform bodies

// Collision-driven projectile removal
const projectilesToRemove = new Set(); // body.id values

// Trajectory visualization
let trajectoryLine = null;
const trajectoryPoints = []; // array of THREE.Vector3 reused each update
let trajectoryMaxTimeSec = 3.0;
let trajectorySegmentLength = 0.35; // desired spacing between arc points (world units)
let trajectoryMaxPoints = 80;

// Audio SFX (asset-free)
const sfx = createSfx({ masterVolume: 0.55, debug: (m, d) => debugLog(m, d) });
const bgm = createBgm({
    volume: 0.12,
    tracks: ['assets/music/bgm01.mp3', 'assets/music/bgm02.mp3'],
    shuffle: true,
    debug: (m, d) => debugLog(m, d),
});

function setupGlobalAudioUnlock() {
    // iOS Safari can be picky about which gesture resumes WebAudio.
    // Ensure we attempt unlock from a guaranteed user gesture on the document.
    let done = false;
    const tryUnlock = (event) => {
        if (done) return;
        done = true;
        try { sfx.unlock({ force: true }); } catch {}
        try { bgm.unlock(); } catch {}
        // Remove listeners after first attempt.
        document.removeEventListener('pointerdown', tryUnlock, true);
        document.removeEventListener('touchend', tryUnlock, true);
        document.removeEventListener('click', tryUnlock, true);
        document.removeEventListener('keydown', tryUnlock, true);
    };

    document.addEventListener('pointerdown', tryUnlock, true);
    document.addEventListener('touchend', tryUnlock, true);
    document.addEventListener('click', tryUnlock, true);
    document.addEventListener('keydown', tryUnlock, true);
}

// UI/HUD
const ui = createUI({ debug: (m, d) => debugLog(m, d) });

// Config (loaded from docs/config/game.json)
const DEFAULT_GAME_CONFIG = {
    projectile: { initialSpeed: 18 },
    physics: { gravity: { x: 0, y: -9.8, z: 0 } },
    camera: { distance: 8, height: 3, orbitPitchDeg: 18 },
    audio: { bgmVolume: 0.12, sfxVolume: 0.55 },
    player: { height: 2.0 },
    snowman: { height: 1.2 },
    trajectory: { maxTimeSec: 3.0, segmentLength: 0.35, maxPoints: 80 },
    targets: { minDistance: 10, maxDistance: 26 },
};
let gameConfig = DEFAULT_GAME_CONFIG;
let gravity = new CANNON.Vec3(0, -9.8, 0); // configurable
const shooterPosition = new THREE.Vector3(0, 0, 0); // fixed on ground (XZ)
let targetMinDistance = DEFAULT_GAME_CONFIG.targets.minDistance;
let targetMaxDistance = DEFAULT_GAME_CONFIG.targets.maxDistance;
let playerHeight = DEFAULT_GAME_CONFIG.player.height;
let snowmanHeight = DEFAULT_GAME_CONFIG.snowman.height;

function isFiniteNumber(n) {
    return typeof n === 'number' && Number.isFinite(n);
}

function toFiniteNumber(value, fallback) {
    const n = typeof value === 'number' ? value : Number(value);
    return Number.isFinite(n) ? n : fallback;
}

function clampNumber(n, { min = -Infinity, max = Infinity } = {}) {
    if (!Number.isFinite(n)) return n;
    return Math.max(min, Math.min(max, n));
}

function toRadians(deg) {
    return (deg * Math.PI) / 180;
}

function getTargetStepDistances() {
    // Preserve the "3 steps" feel from the original layout.
    const minD = Math.max(0.1, Math.min(targetMinDistance, targetMaxDistance));
    const maxD = Math.max(minD, targetMaxDistance);
    return [minD, minD + 0.5 * (maxD - minD), maxD];
}

function rebuildPlayerMesh() {
    if (!player) return;
    const h = clampNumber(toFiniteNumber(playerHeight, 2.0), { min: 0.2, max: 50 });
    const r = clampNumber(h * 0.25, { min: 0.05, max: 5 }); // keep the same silhouette ratio as before (2.0 -> 0.5)

    if (player.geometry) player.geometry.dispose();
    player.geometry = new THREE.CylinderGeometry(r, r, h, 16);

    // Keep feet on the ground at shooterPosition
    player.position.set(shooterPosition.x, h * 0.5, shooterPosition.z);

    // Camera follows player
    if (camera) updateCameraPosition();
}

function getSnowmanDims(h) {
    // Original snowman height is ~1.19 units:
    // - body radius 0.45 (body bottom at y=0, top at y=0.9)
    // - head center at y=0.91, head radius 0.28 (top at y=1.19)
    const baseH = 1.19;
    const scale = h / baseH;
    const bodyR = 0.45 * scale;
    const headR = 0.28 * scale;
    const gap = 0.18 * scale;
    const noseR = 0.06 * scale;
    const noseL = 0.25 * scale;
    const colliderR = 0.55 * scale;
    return { bodyR, headR, gap, noseR, noseL, colliderR };
}

function applyGameConfig(cfg) {
    const next = cfg || DEFAULT_GAME_CONFIG;

    const speed = next?.projectile?.initialSpeed;
    if (isFiniteNumber(speed) && speed > 0) projectileSpeed = speed;

    const gx = next?.physics?.gravity?.x;
    const gy = next?.physics?.gravity?.y;
    const gz = next?.physics?.gravity?.z;
    if (isFiniteNumber(gx) && isFiniteNumber(gy) && isFiniteNumber(gz)) {
        gravity = new CANNON.Vec3(gx, gy, gz);
    }

    // Audio volumes (0..1)
    const bgmVol = next?.audio?.bgmVolume;
    const sfxVol = next?.audio?.sfxVolume;
    if (isFiniteNumber(bgmVol)) {
        try { bgm.setVolume(clampNumber(bgmVol, { min: 0, max: 1 })); } catch {}
    }
    if (isFiniteNumber(sfxVol)) {
        try { sfx.setMasterVolume(clampNumber(sfxVol, { min: 0, max: 1 })); } catch {}
    }

    // Trajectory sampling quality (adaptive step based on desired segment length)
    const tMax = next?.trajectory?.maxTimeSec;
    const segLen = next?.trajectory?.segmentLength;
    const maxPts = next?.trajectory?.maxPoints;
    if (isFiniteNumber(tMax) && tMax > 0) trajectoryMaxTimeSec = tMax;
    if (isFiniteNumber(segLen) && segLen > 0) trajectorySegmentLength = segLen;
    if (isFiniteNumber(maxPts) && maxPts >= 4) trajectoryMaxPoints = Math.floor(maxPts);

    // Player height (visual)
    const nextPlayerH = next?.player?.height;
    if (isFiniteNumber(nextPlayerH) && nextPlayerH > 0) {
        const prev = playerHeight;
        playerHeight = nextPlayerH;
        if (player && prev !== playerHeight) rebuildPlayerMesh();
    }

    // Snowman height (visual + collider)
    const nextSnowmanH = next?.snowman?.height;
    let snowmanChanged = false;
    if (isFiniteNumber(nextSnowmanH) && nextSnowmanH > 0) {
        const prev = snowmanHeight;
        snowmanHeight = nextSnowmanH;
        snowmanChanged = prev !== snowmanHeight;
    }

    // Camera tuning (pitch is configured in degrees)
    const camDistance = next?.camera?.distance;
    const camHeight = next?.camera?.height;
    const camPitchDeg = next?.camera?.orbitPitchDeg;
    if (isFiniteNumber(camDistance) && camDistance > 0) cameraDistance = camDistance;
    if (isFiniteNumber(camHeight)) cameraHeight = camHeight;
    if (isFiniteNumber(camPitchDeg)) cameraOrbitPitch = toRadians(camPitchDeg);
    cameraOrbitPitch = clampNumber(cameraOrbitPitch, { min: -Math.PI / 2 + 0.01, max: Math.PI / 2 - 0.01 });
    if (camera && player) updateCameraPosition();

    // Targets distance range (keeps target direction/layout pattern fixed)
    // Supports both new shape: targets:{minDistance,maxDistance} and legacy array form (derive distances).
    let nextMinD = toFiniteNumber(next?.targets?.minDistance, targetMinDistance);
    let nextMaxD = toFiniteNumber(next?.targets?.maxDistance, targetMaxDistance);
    if (Array.isArray(next?.targets) && next.targets.length) {
        // Legacy: infer distances from provided points (distance in XZ plane from shooter).
        const ds = next.targets
            .map((t) => {
                const x = toFiniteNumber(t?.x, NaN);
                const z = toFiniteNumber(t?.z, NaN);
                if (!Number.isFinite(x) || !Number.isFinite(z)) return NaN;
                const dx = x - shooterPosition.x;
                const dz = z - shooterPosition.z;
                return Math.sqrt(dx * dx + dz * dz);
            })
            .filter((d) => Number.isFinite(d));
        if (ds.length) {
            nextMinD = Math.min(...ds);
            nextMaxD = Math.max(...ds);
        }
    }
    if (isFiniteNumber(nextMinD) && isFiniteNumber(nextMaxD)) {
        targetMinDistance = Math.max(0.1, nextMinD);
        targetMaxDistance = Math.max(targetMinDistance, nextMaxD);
        if (world) replacePlatformsAndTargets();
    }

    // If snowman size changed, respawn targets so mesh/collider match.
    if (snowmanChanged && world) {
        clearTargets();
        createTargets();
    }

    // If physics world already exists, apply live.
    if (world) {
        world.gravity.set(gravity.x, gravity.y, gravity.z);
    }

    debugLog('[SnowballBlitz] config applied', {
        projectileSpeed,
        gravity: { x: gravity.x, y: gravity.y, z: gravity.z },
        camera: {
            distance: cameraDistance,
            height: cameraHeight,
            orbitPitchDeg: (cameraOrbitPitch * 180) / Math.PI,
        },
        audio: {
            bgmVolume: bgm.volume,
            sfxVolume: sfx.masterVolume,
        },
        player: { height: playerHeight },
        snowman: { height: snowmanHeight },
        trajectory: {
            maxTimeSec: trajectoryMaxTimeSec,
            segmentLength: trajectorySegmentLength,
            maxPoints: trajectoryMaxPoints,
        },
        targets: { minDistance: targetMinDistance, maxDistance: targetMaxDistance },
    });
}

function getLiveGameConfig() {
    return {
        projectile: { initialSpeed: projectileSpeed },
        physics: { gravity: { x: gravity.x, y: gravity.y, z: gravity.z } },
        camera: {
            distance: cameraDistance,
            height: cameraHeight,
            orbitPitchDeg: Math.round(((cameraOrbitPitch * 180) / Math.PI) * 100) / 100,
        },
        audio: {
            bgmVolume: Math.round(bgm.volume * 100) / 100,
            sfxVolume: Math.round(sfx.masterVolume * 100) / 100,
        },
        player: { height: playerHeight },
        snowman: { height: snowmanHeight },
        trajectory: {
            maxTimeSec: trajectoryMaxTimeSec,
            segmentLength: trajectorySegmentLength,
            maxPoints: trajectoryMaxPoints,
        },
        targets: { minDistance: targetMinDistance, maxDistance: targetMaxDistance },
    };
}

function setLiveGameConfig(cfg) {
    applyGameConfig(cfg);
}

async function loadGameConfig() {
    // Fetch is relative to docs/index.html (base URL), so this works on GitHub Pages too.
    const url = 'config/game.json';
    try {
        const res = await fetch(url, { cache: 'no-store' });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json();
        gameConfig = json;
        applyGameConfig(gameConfig);
        return gameConfig;
    } catch (err) {
        debugLog('[SnowballBlitz] WARN: failed to load config, using defaults', {
            url,
            error: err && err.message ? err.message : String(err),
        });
        gameConfig = DEFAULT_GAME_CONFIG;
        applyGameConfig(gameConfig);
        return gameConfig;
    }
}

// Lightweight debug helper (console + on-screen line)
let debugEl = null;
const DEBUG =
    new URLSearchParams(window.location.search).has('debug') ||
    window.location.hash.includes('debug');
function debugLog(message, data) {
    if (!DEBUG) return;
    if (data !== undefined) console.log(message, data);
    else console.log(message);

    if (!debugEl) return;
    const suffix = data !== undefined ? ` ${JSON.stringify(data)}` : '';
    debugEl.textContent = `${message}${suffix}`;
}

function showErrorOverlay(title, details) {
    const container = document.getElementById('game-container');
    let overlay = document.getElementById('error-overlay');
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = 'error-overlay';
        overlay.innerHTML = `
            <div class="panel">
                <h2></h2>
                <p class="details"></p>
                <p>
                    If you’re on Linux/Chrome, check <code>chrome://gpu</code> and ensure WebGL is enabled and hardware acceleration is on.
                    Try another browser (Firefox), or disable problematic flags/extensions.
                </p>
            </div>
        `;
        container.appendChild(overlay);
    }
    overlay.querySelector('h2').textContent = title;
    overlay.querySelector('.details').textContent = details || '';
    overlay.style.display = 'flex';
}

// Initialize the game
async function init() {
    if (!WebGL.isWebGLAvailable()) {
        showErrorOverlay(
            'WebGL not available',
            'This browser/device cannot create a WebGL context, so the game cannot run here.'
        );
        return;
    }

    debugLog('[SnowballBlitz] init() starting');

    // Load config early so physics + trajectory match.
    await loadGameConfig();

    // Create Three.js scene
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x87CEEB); // Sky blue
    
    // Create camera (perspective camera for 3D)
    const aspect = window.innerWidth / window.innerHeight;
    camera = new THREE.PerspectiveCamera(75, aspect, 0.1, 1000);
    ui.setCamera(camera);
    
    // Create player character
    createPlayer();
    
    // Setup camera to follow player
    updateCameraPosition();
    
    // Create renderer
    const canvas = document.getElementById('game-canvas');
    try {
        renderer = new THREE.WebGLRenderer({
            canvas: canvas,
            antialias: true,
            powerPreference: 'high-performance',
        });
    } catch (err) {
        showErrorOverlay(
            'Failed to create WebGL renderer',
            err && err.message ? err.message : String(err)
        );
        return;
    }
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    
    // Setup lighting
    setupLighting();
    
    // Create environment
    createEnvironment();
    
    // Setup physics world
    setupPhysics();

    // Collision handlers
    setupCollisionHandlers();

    // Build tiered platforms + static targets
    createPlatformsAndTargets();
    
    // Handle window resize
    window.addEventListener('resize', onWindowResize);
    
    // Setup input handlers
    setupInputHandlers();
    setupGlobalAudioUnlock();

    // Temporary firing input (until the on-screen fire button stage)
    setupFireInputHandlers();

    // Trajectory line
    setupTrajectoryLine();

    // HUD + overlay
    ui.init({ timeLimitSec: TIME_LIMIT_SEC, onRestart: resetGame });

    // On-screen debug line (only with ?debug=1)
    if (DEBUG) {
        const uiOverlay = document.getElementById('ui-overlay');
        debugEl = document.createElement('div');
        debugEl.style.position = 'absolute';
        debugEl.style.left = '8px';
        debugEl.style.bottom = '8px';
        debugEl.style.padding = '6px 8px';
        debugEl.style.background = 'rgba(0,0,0,0.55)';
        debugEl.style.color = '#fff';
        debugEl.style.fontSize = '12px';
        debugEl.style.borderRadius = '6px';
        debugEl.style.pointerEvents = 'none';
        debugEl.textContent = 'Debug: ready';
        uiOverlay.appendChild(debugEl);
    }

    // Debug tuning panel (only with ?debug=1)
    if (DEBUG) {
        createTuningPanel({
            enabled: true,
            getConfig: getLiveGameConfig,
            setConfig: setLiveGameConfig,
            defaultConfig: DEFAULT_GAME_CONFIG,
            fileConfig: gameConfig,
            debug: (m, d) => debugLog(m, d),
        });
    }

    // Fire button UI (desktop + mobile)
    setupFireButton();
    setupFullscreenButton();
    setupAudioMuteButtons();

    debugLog('[SnowballBlitz] init() complete');
    
    // Start render loop
    animate();
}

function endGame(reason) {
    if (gameState === 'ended') return;
    gameState = 'ended';
    timeRemainingSec = 0;
    ui.updateTimer(0, gameState);
    if (fireButtonEl) fireButtonEl.disabled = true;
    ui.showEnd({ reason, finalScore: ui.getScore() });
    debugLog('[SnowballBlitz] game ended', { reason, score: ui.getScore() });
}

function resetGame() {
    // Remove projectiles
    for (let i = projectiles.length - 1; i >= 0; i--) removeProjectile(i);

    // Remove remaining targets
    for (const t of targets) {
        if (!t.alive) continue;
        scene.remove(t.mesh);
        world.removeBody(t.body);
        t.alive = false;
    }
    targetByBodyId.clear();
    targets.length = 0;

    // Respawn targets on existing platforms
    createTargets();

    // Reset score/time/state
    ui.setScore(0);
    gameState = 'playing';
    timeRemainingSec = TIME_LIMIT_SEC;
    ui.updateTimer(timeRemainingSec, gameState);
    if (fireButtonEl) fireButtonEl.disabled = false;
    ui.hideEnd();

    debugLog('[SnowballBlitz] game reset');
}

function setupLighting() {
    // Ambient light (soft overall illumination)
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambientLight);
    
    // Directional light (sun-like)
    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(10, 10, 5);
    directionalLight.castShadow = true;
    scene.add(directionalLight);
}

function createPlayer() {
    // Create player character as a cylinder (placeholder)
    const playerGeometry = new THREE.CylinderGeometry(0.5, 0.5, playerHeight, 16);
    const playerMaterial = new THREE.MeshStandardMaterial({ 
        color: 0x4169E1, // Royal blue
        roughness: 0.7,
        metalness: 0.3
    });
    player = new THREE.Mesh(playerGeometry, playerMaterial);
    // Keep feet on the ground at shooterPosition
    player.position.set(shooterPosition.x, playerHeight * 0.5, shooterPosition.z);
    player.castShadow = true;
    scene.add(player);
}

function createEnvironment() {
    // Create ground plane
    const groundGeometry = new THREE.PlaneGeometry(50, 50);
    const groundMaterial = new THREE.MeshStandardMaterial({ 
        color: 0x90EE90, // Light green
        roughness: 0.8,
        metalness: 0.2
    });
    ground = new THREE.Mesh(groundGeometry, groundMaterial);
    ground.rotation.x = -Math.PI / 2; // Rotate to be horizontal
    ground.position.y = 0;
    ground.receiveShadow = true;
    scene.add(ground);
    
    // Add some basic reference objects (will be replaced later)
    const helper = new THREE.GridHelper(50, 50, 0x888888, 0x444444);
    scene.add(helper);
}

function setupPhysics() {
    // Create cannon-es physics world
    world = new CANNON.World();
    world.gravity.set(gravity.x, gravity.y, gravity.z);
    world.allowSleep = true;
    
    // Create ground physics body
    const groundShape = new CANNON.Plane();
    const groundBody = new CANNON.Body({ mass: 0 }); // Static body
    groundBody.addShape(groundShape);
    groundBody.quaternion.setFromAxisAngle(new CANNON.Vec3(1, 0, 0), -Math.PI / 2);
    groundBody.collisionFilterGroup = CG_WORLD;
    groundBody.collisionFilterMask = CG_PROJECTILE;
    world.addBody(groundBody);
    worldBodyIds.add(groundBody.id);
}

function setupCollisionHandlers() {
    // Note: cannon-es emits beginContact when two bodies start touching.
    world.addEventListener('beginContact', (event) => {
        const bodyA = event.bodyA;
        const bodyB = event.bodyB;
        if (!bodyA || !bodyB) return;

        const projA = projectileByBodyId.get(bodyA.id);
        const projB = projectileByBodyId.get(bodyB.id);

        // Debug: log only when a projectile is involved
        if (projA || projB) {
            debugLog('[SnowballBlitz] beginContact', {
                a: { id: bodyA.id, group: bodyA.collisionFilterGroup },
                b: { id: bodyB.id, group: bodyB.collisionFilterGroup },
                projA: !!projA,
                projB: !!projB,
                isTargetA: targetByBodyId.has(bodyA.id),
                isTargetB: targetByBodyId.has(bodyB.id),
                isWorldA: worldBodyIds.has(bodyA.id),
                isWorldB: worldBodyIds.has(bodyB.id),
            });
        }

        if (projA) handleProjectileContact(projA, bodyB);
        if (projB) handleProjectileContact(projB, bodyA);
    });

    // Disable collision response for projectile<->target (piercing) while still allowing
    // projectile<->world to collide normally.
    world.addEventListener('preSolve', (event) => {
        const eqs = event.contactEquations || event.contactEquation || event.contacts;
        if (!Array.isArray(eqs)) return;

        for (const eq of eqs) {
            const bi = eq.bi || eq.bodyA;
            const bj = eq.bj || eq.bodyB;
            if (!bi || !bj) continue;

            const projI = projectileByBodyId.has(bi.id);
            const projJ = projectileByBodyId.has(bj.id);
            if (!projI && !projJ) continue;

            const isTargetI = targetByBodyId.has(bi.id);
            const isTargetJ = targetByBodyId.has(bj.id);

            // If projectile is contacting a target, disable the contact equation so it won't bounce.
            if ((projI && isTargetJ) || (projJ && isTargetI)) {
                eq.enabled = false;
            }
        }
    });
}

function handleProjectileContact(projectile, otherBody) {
    // Projectile vs target: destroy target, keep projectile (piercing)
    const target = targetByBodyId.get(otherBody.id);
    if (target && target.alive) {
        debugLog('[SnowballBlitz] projectile hit target', { projectileId: projectile.body.id, targetId: otherBody.id });
        destroyTarget(target);
        return;
    }

    // Projectile vs world: mark projectile for removal
    if (worldBodyIds.has(otherBody.id)) {
        debugLog('[SnowballBlitz] projectile hit world', { projectileId: projectile.body.id, worldId: otherBody.id });
        projectilesToRemove.add(projectile.body.id);
    }
}

function destroyTarget(target) {
    target.alive = false;

    // Spawn floating score text at target position (use mesh position; it's at platform surface)
    const fxPos = target.mesh.position.clone().add(new THREE.Vector3(0, 1.0, 0));
    ui.spawnFloatingText(`+${SCORE_PER_TARGET}`, fxPos);
    spawnSnowExplosion(fxPos);
    ui.addScore(SCORE_PER_TARGET);

    scene.remove(target.mesh);
    world.removeBody(target.body);
    targetByBodyId.delete(target.body.id);

    const remainingAlive = targets.reduce((n, t) => n + (t.alive ? 1 : 0), 0);
    debugLog('[SnowballBlitz] target destroyed', { remaining: remainingAlive });

    // Win condition: all targets destroyed before time runs out
    if (gameState === 'playing' && remainingAlive === 0) {
        debugLog('[SnowballBlitz] win condition met (all targets destroyed)');
        endGame('win');
    }
}

function spawnSnowExplosion(worldPos) {
    // SFX (explosion)
    sfx.playExplosion(worldPos);

    // Small, cheap particle burst (no textures)
    const count = 60;
    const positions = new Float32Array(count * 3);
    const velocities = new Float32Array(count * 3);

    for (let i = 0; i < count; i++) {
        const idx = i * 3;
        // Start near the hit point
        positions[idx + 0] = worldPos.x + (Math.random() - 0.5) * 0.15;
        positions[idx + 1] = worldPos.y + (Math.random() - 0.5) * 0.15;
        positions[idx + 2] = worldPos.z + (Math.random() - 0.5) * 0.15;

        // Random velocity with slight upward bias
        const vx = (Math.random() - 0.5) * 3.0;
        const vy = Math.random() * 3.5 + 1.0;
        const vz = (Math.random() - 0.5) * 3.0;
        velocities[idx + 0] = vx;
        velocities[idx + 1] = vy;
        velocities[idx + 2] = vz;
    }

    const geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.BufferAttribute(positions, 3));

    const material = new THREE.PointsMaterial({
        color: 0xffffff,
        size: 0.09,
        transparent: true,
        opacity: 0.9,
        depthWrite: false,
    });

    const points = new THREE.Points(geom, material);
    points.frustumCulled = false;
    scene.add(points);

    particleBursts.push({
        points,
        geom,
        positions,
        velocities,
        age: 0,
        duration: 0.7,
        material,
    });
}

function updateParticleBursts(dt) {
    const g = gravity.y;
    for (let i = particleBursts.length - 1; i >= 0; i--) {
        const b = particleBursts[i];
        b.age += dt;

        const t = Math.min(b.age / b.duration, 1);
        b.material.opacity = 0.9 * (1 - t);

        const pos = b.positions;
        const vel = b.velocities;
        for (let j = 0; j < pos.length; j += 3) {
            vel[j + 1] += g * dt * 0.35; // light gravity so it feels "snowy"

            pos[j + 0] += vel[j + 0] * dt;
            pos[j + 1] += vel[j + 1] * dt;
            pos[j + 2] += vel[j + 2] * dt;
        }

        const attr = b.geom.getAttribute('position');
        attr.needsUpdate = true;

        if (b.age >= b.duration) {
            scene.remove(b.points);
            b.geom.dispose();
            b.material.dispose();
            particleBursts.splice(i, 1);
        }
    }
}

function createPlatformsAndTargets() {
    createTieredPlatforms();
    createTargets();
}

function createTieredPlatforms() {
    // Simple tiered "staircase" in front of the player (toward -Z).
    // Z positions are derived from target distance range.
    const [d1, d2, d3] = getTargetStepDistances();
    const steps = [
        { w: 12, h: 1.0, d: 6, x: shooterPosition.x, y: 0.5, z: shooterPosition.z - d1 },
        { w: 10, h: 1.0, d: 6, x: shooterPosition.x, y: 1.5, z: shooterPosition.z - d2 },
        { w: 8,  h: 1.0, d: 6, x: shooterPosition.x, y: 2.5, z: shooterPosition.z - d3 },
    ];

    const mat = new THREE.MeshStandardMaterial({
        color: 0xb9c2cc,
        roughness: 0.9,
        metalness: 0.05,
    });

    for (const s of steps) {
        const geom = new THREE.BoxGeometry(s.w, s.h, s.d);
        const mesh = new THREE.Mesh(geom, mat);
        mesh.position.set(s.x, s.y, s.z);
        mesh.receiveShadow = true;
        scene.add(mesh);

        const shape = new CANNON.Box(new CANNON.Vec3(s.w / 2, s.h / 2, s.d / 2));
        const body = new CANNON.Body({
            mass: 0,
            shape,
            position: new CANNON.Vec3(s.x, s.y, s.z),
        });
        body.collisionFilterGroup = CG_WORLD;
        body.collisionFilterMask = CG_PROJECTILE;
        world.addBody(body);
        worldBodyIds.add(body.id);

        platforms.push({ mesh, body });
    }
}

function createSnowmanMesh() {
    const group = new THREE.Group();

    const h = clampNumber(toFiniteNumber(snowmanHeight, DEFAULT_GAME_CONFIG.snowman.height), { min: 0.2, max: 50 });
    const { bodyR, headR, gap, noseR, noseL } = getSnowmanDims(h);

    const snowMat = new THREE.MeshStandardMaterial({
        color: 0xffffff,
        roughness: 0.85,
        metalness: 0.0,
    });

    const body = new THREE.Mesh(new THREE.SphereGeometry(bodyR, 16, 16), snowMat);
    body.position.set(0, bodyR, 0);
    group.add(body);

    const head = new THREE.Mesh(new THREE.SphereGeometry(headR, 16, 16), snowMat);
    head.position.set(0, bodyR + headR + gap, 0);
    group.add(head);

    // Tiny "nose" for orientation
    const nose = new THREE.Mesh(
        new THREE.ConeGeometry(noseR, noseL, 10),
        new THREE.MeshStandardMaterial({ color: 0xff9500, roughness: 0.6 })
    );
    nose.rotation.x = Math.PI / 2;
    nose.position.set(0, head.position.y, -headR);
    group.add(nose);

    return group;
}

function createTargets() {
    // Keep target direction/layout fixed; only distances change via config.
    const [d1, d2, d3] = getTargetStepDistances();
    const placements = [
        // step 1 (top surface is y=1.0)
        { x: shooterPosition.x - 3.0, y: 1.0, z: shooterPosition.z - d1 },
        { x: shooterPosition.x + 0.0, y: 1.0, z: shooterPosition.z - d1 },
        { x: shooterPosition.x + 3.0, y: 1.0, z: shooterPosition.z - d1 },
        // step 2 (top surface is y=2.0)
        { x: shooterPosition.x - 2.5, y: 2.0, z: shooterPosition.z - d2 },
        { x: shooterPosition.x + 0.0, y: 2.0, z: shooterPosition.z - d2 },
        { x: shooterPosition.x + 2.5, y: 2.0, z: shooterPosition.z - d2 },
        // step 3 (top surface is y=3.0)
        { x: shooterPosition.x - 2.0, y: 3.0, z: shooterPosition.z - d3 },
        { x: shooterPosition.x + 0.0, y: 3.0, z: shooterPosition.z - d3 },
        { x: shooterPosition.x + 2.0, y: 3.0, z: shooterPosition.z - d3 },
    ];

    for (const p of placements) {
        const mesh = createSnowmanMesh();
        mesh.position.set(p.x, p.y, p.z);
        scene.add(mesh);

        // Physics body (static). Use a single sphere collider for now.
        // Center sits above the platform surface.
        const h = clampNumber(toFiniteNumber(snowmanHeight, DEFAULT_GAME_CONFIG.snowman.height), { min: 0.2, max: 50 });
        const { colliderR } = getSnowmanDims(h);
        const shape = new CANNON.Sphere(colliderR);
        const body = new CANNON.Body({
            mass: 0,
            shape,
            position: new CANNON.Vec3(p.x, p.y + colliderR, p.z),
        });
        // Targets should not deflect the projectile (piercing), but should still report contacts.
        body.collisionResponse = false;
        body.collisionFilterGroup = CG_TARGET;
        body.collisionFilterMask = CG_PROJECTILE;
        world.addBody(body);

        const rec = { mesh, body, alive: true };
        targets.push(rec);
        targetByBodyId.set(body.id, rec);
    }

    debugLog('[SnowballBlitz] targets created', { count: targets.length });
}

function clearTargets() {
    if (!world || !scene) return;
    for (const t of targets) {
        try {
            scene.remove(t.mesh);
        } catch {}
        try {
            world.removeBody(t.body);
        } catch {}
    }
    targets.length = 0;
    targetByBodyId.clear();
}

function clearPlatforms() {
    if (!world || !scene) return;
    for (const p of platforms) {
        try {
            scene.remove(p.mesh);
        } catch {}
        try {
            world.removeBody(p.body);
        } catch {}
        try {
            worldBodyIds.delete(p.body.id);
        } catch {}
    }
    platforms.length = 0;
}

function replacePlatformsAndTargets() {
    clearTargets();
    clearPlatforms();
    createTieredPlatforms();
    createTargets();
}

function setupFireButton() {
    const button = document.getElementById('fire-button');
    if (!button) {
        debugLog('[SnowballBlitz] fire button not found');
        return;
    }
    fireButtonEl = button;

    const press = (event) => {
        // Avoid triggering canvas drag/scroll; make firing feel instant.
        event.preventDefault();
        event.stopPropagation();
        sfx.unlock();
        bgm.unlock();
        button.classList.add('pressed');
        debugLog('[SnowballBlitz] fire button -> fireProjectile()');
        fireProjectile();
    };

    const release = () => {
        button.classList.remove('pressed');
    };

    // Pointer events cover mouse + touch
    button.addEventListener('pointerdown', press);
    button.addEventListener('pointerup', release);
    button.addEventListener('pointercancel', release);
    button.addEventListener('pointerleave', release);

    // Keep focus off the button during rapid tapping
    button.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
    });
}

function getFullscreenElement() {
    return document.fullscreenElement || document.webkitFullscreenElement || null;
}

function isIOSBrowser() {
    const ua = navigator.userAgent || '';
    // iPadOS 13+ reports as Mac; include touch heuristic.
    const isAppleMobile = /iPad|iPhone|iPod/.test(ua);
    const isIpadOS = /Macintosh/.test(ua) && navigator.maxTouchPoints && navigator.maxTouchPoints > 1;
    return isAppleMobile || isIpadOS;
}

function isStandaloneDisplayMode() {
    // iOS Safari uses navigator.standalone; other browsers expose display-mode media query.
    return (
        (typeof navigator !== 'undefined' && navigator.standalone === true) ||
        (typeof window !== 'undefined' &&
            window.matchMedia &&
            window.matchMedia('(display-mode: standalone)').matches)
    );
}

function canUseFullscreenAPI(el) {
    if (!el) return false;
    const req = el.requestFullscreen || el.webkitRequestFullscreen;
    const exit = document.exitFullscreen || document.webkitExitFullscreen;
    return !!(req && exit);
}

async function requestFullscreen(el) {
    if (!el) return false;
    const fn = el.requestFullscreen || el.webkitRequestFullscreen;
    if (!fn) return false;
    try {
        // Some browsers accept an options object; others ignore it.
        const res = fn.call(el, { navigationUI: 'hide' });
        if (res && typeof res.then === 'function') await res;
        return true;
    } catch {
        return false;
    }
}

async function exitFullscreen() {
    const fn = document.exitFullscreen || document.webkitExitFullscreen;
    if (!fn) return false;
    try {
        const res = fn.call(document);
        if (res && typeof res.then === 'function') await res;
        return true;
    } catch {
        return false;
    }
}

function setupFullscreenButton() {
    const btn = document.getElementById('fullscreen-button');
    const container = document.getElementById('game-container') || document.documentElement;
    if (!btn || !container) return;

    const showUnsupportedHintOnce = () => {
        const key = 'snowballblitz:fsHintShown';
        try {
            if (sessionStorage.getItem(key) === '1') return;
            sessionStorage.setItem(key, '1');
        } catch {
            // ignore
        }
        // iOS Safari commonly does not support fullscreen for canvas; suggest PWA install.
        const ios = isIOSBrowser();
        const msg = ios
            ? 'Fullscreen is not supported for web games on iPhone Safari.\n\nTip: use Share → "Add to Home Screen" to run it fullscreen-like.'
            : 'Fullscreen is not supported in this browser.';
        // Keep it simple; alerts work reliably on mobile.
        try { alert(msg); } catch {}
    };

    const sync = () => {
        const fs = !!getFullscreenElement();
        btn.classList.toggle('pressed', fs);
        btn.setAttribute('aria-pressed', fs ? 'true' : 'false');
        if (canUseFullscreenAPI(container)) {
            btn.disabled = false;
            btn.title = fs ? 'Exit fullscreen (F)' : 'Fullscreen (F)';
        } else if (isStandaloneDisplayMode()) {
            // Already fullscreen-like; button is not useful.
            btn.disabled = true;
            btn.title = 'Already in app mode';
        } else {
            btn.disabled = false; // keep clickable so we can show a hint
            btn.title = isIOSBrowser() ? 'Fullscreen not supported on iPhone Safari' : 'Fullscreen not supported';
        }
    };

    const toggle = async (event) => {
        if (event) {
            event.preventDefault();
            event.stopPropagation();
        }

        // Also unlock audio on gesture
        try { sfx.unlock(); } catch {}
        try { bgm.unlock(); } catch {}

        if (!canUseFullscreenAPI(container)) {
            showUnsupportedHintOnce();
            sync();
            return;
        }

        if (getFullscreenElement()) {
            await exitFullscreen();
        } else {
            await requestFullscreen(container);
        }
        sync();
    };

    btn.addEventListener('click', toggle);
    document.addEventListener('fullscreenchange', sync);
    // WebKit fallback event name (older Safari)
    document.addEventListener('webkitfullscreenchange', sync);

    // Keyboard shortcut: F toggles fullscreen
    document.addEventListener('keydown', (event) => {
        if (event.repeat) return;
        if (event.code === 'KeyF') {
            toggle(event);
        }
    }, { capture: true });

    sync();
}

function setupAudioMuteButtons() {
    const btnMusic = document.getElementById('music-mute-button');
    const btnSfx = document.getElementById('sfx-mute-button');
    if (!btnMusic || !btnSfx) return;

    const key = 'snowballblitz:audioPrefs';
    const load = () => {
        try {
            const raw = localStorage.getItem(key);
            if (!raw) return { musicMuted: false, sfxMuted: false };
            const parsed = JSON.parse(raw);
            return {
                musicMuted: !!parsed.musicMuted,
                sfxMuted: !!parsed.sfxMuted,
            };
        } catch {
            return { musicMuted: false, sfxMuted: false };
        }
    };
    const save = (prefs) => {
        try {
            localStorage.setItem(key, JSON.stringify(prefs));
        } catch {
            // ignore
        }
    };

    let prefs = load();

    const apply = () => {
        // BGM
        try { bgm.setEnabled(!prefs.musicMuted); } catch {}

        // SFX (WebAudio): keep enabled, mute via gain so unlock/resume still works reliably on iOS.
        try { sfx.setEnabled(true); } catch {}
        try { sfx.setMuted(!!prefs.sfxMuted); } catch {}

        btnMusic.classList.toggle('muted', prefs.musicMuted);
        btnMusic.setAttribute('aria-pressed', prefs.musicMuted ? 'true' : 'false');
        btnMusic.title = prefs.musicMuted ? 'Music: muted' : 'Music: on';

        btnSfx.classList.toggle('muted', prefs.sfxMuted);
        btnSfx.setAttribute('aria-pressed', prefs.sfxMuted ? 'true' : 'false');
        btnSfx.title = prefs.sfxMuted ? 'SFX: muted' : 'SFX: on';
    };

    const toggleMusic = async (event) => {
        event.preventDefault();
        event.stopPropagation();
        prefs.musicMuted = !prefs.musicMuted;
        save(prefs);
        apply();
        // If unmuting, try to start music from this gesture.
        if (!prefs.musicMuted) {
            try { bgm.unlock(); } catch {}
        }
    };

    const toggleSfx = async (event) => {
        event.preventDefault();
        event.stopPropagation();
        prefs.sfxMuted = !prefs.sfxMuted;
        save(prefs);
        apply();
        // If unmuting, try to unlock WebAudio from this gesture.
        if (!prefs.sfxMuted) {
            try { sfx.unlock({ force: true }); } catch {}
        }
    };

    btnMusic.addEventListener('click', toggleMusic);
    btnSfx.addEventListener('click', toggleSfx);

    apply();
}

function setupTrajectoryLine() {
    const material = new THREE.LineDashedMaterial({
        color: 0xffffff,
        dashSize: 0.25,
        gapSize: 0.18,
        linewidth: 1, // ignored on most platforms, but harmless
        transparent: true,
        opacity: 0.95,
    });

    // Initialize with a tiny geometry; we replace positions each update
    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(3 * 2); // 2 points minimum
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));

    trajectoryLine = new THREE.Line(geometry, material);
    trajectoryLine.frustumCulled = false;
    scene.add(trajectoryLine);
}

function setupFireInputHandlers() {
    debugLog('[SnowballBlitz] setupFireInputHandlers()');

    // Keyboard: Space fires a projectile (desktop-friendly for now)
    document.addEventListener('keydown', (event) => {
        sfx.unlock();
        bgm.unlock();

        // QoL: restart hotkey
        if (!event.repeat && event.code === 'KeyR') {
            resetGame();
            event.preventDefault();
            return;
        }

        debugLog('[SnowballBlitz] keydown', {
            code: event.code,
            key: event.key,
            repeat: event.repeat,
            target: event.target && event.target.tagName ? event.target.tagName : event.target,
        });
        if (event.repeat) return;
        if (event.code === 'Space') {
            debugLog('[SnowballBlitz] Space pressed -> fireProjectile()');
            fireProjectile();
            event.preventDefault();
        }
    }, { capture: true });
}

function onWindowResize() {
    // Update camera aspect ratio
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    
    // Update renderer size
    renderer.setSize(window.innerWidth, window.innerHeight);
}

function updateCameraPosition() {
    // Vector from player -> camera (fixed orbit direction)
    const toCamera = new THREE.Vector3(
        Math.sin(cameraOrbitYaw) * Math.cos(cameraOrbitPitch),
        Math.sin(cameraOrbitPitch),
        Math.cos(cameraOrbitYaw) * Math.cos(cameraOrbitPitch)
    ).normalize();

    // Place camera at a fixed offset from the player (plus height)
    const camPos = player.position.clone()
        .add(new THREE.Vector3(0, cameraHeight, 0))
        .add(toCamera.clone().multiplyScalar(cameraDistance));
    camera.position.copy(camPos);

    // Keep camera orientation fixed: always look at the player (not at the aim direction)
    camera.lookAt(
        player.position.x,
        player.position.y + cameraHeight * 0.5,
        player.position.z
    );
}

function getAimDirection() {
    // Aim direction controlled by drag/swipe (projectile orientation)
    return new THREE.Vector3(
        -Math.sin(aimYaw) * Math.cos(aimPitch),
        -Math.sin(aimPitch),
        -Math.cos(aimYaw) * Math.cos(aimPitch)
    ).normalize();
}

function getProjectileSpawnPosition(dir) {
    return player.position
        .clone()
        .add(new THREE.Vector3(0, 1.0, 0))
        .add(dir.clone().multiplyScalar(1.0));
}

function updateTrajectoryLine() {
    if (!trajectoryLine || !player) return;

    const dir = getAimDirection();
    const p0 = getProjectileSpawnPosition(dir);
    const v0 = dir.clone().multiplyScalar(projectileSpeed);
    const g = new THREE.Vector3(gravity.x, gravity.y, gravity.z);

    // Build points until we hit the ground (y <= projectileRadius) or max time
    trajectoryPoints.length = 0;
    trajectoryPoints.push(p0.clone());

    // Adaptive time step: choose dt so spatial distance between samples is ~trajectorySegmentLength.
    // This keeps the curve smooth across different projectile speeds/gravity.
    const maxT = Math.max(0.05, trajectoryMaxTimeSec);
    const desiredSeg = Math.max(0.05, trajectorySegmentLength);
    const maxPts = Math.max(4, trajectoryMaxPoints | 0);

    let t = 0;
    for (let i = 1; i < maxPts && t < maxT; i++) {
        // Approx current speed magnitude under constant acceleration.
        const vt = v0.clone().add(g.clone().multiplyScalar(t));
        const speedNow = Math.max(0.001, vt.length());
        const dt = clampNumber(desiredSeg / speedNow, { min: 0.01, max: 0.12 });
        t += dt;

        const pt = p0
            .clone()
            .add(v0.clone().multiplyScalar(t))
            .add(g.clone().multiplyScalar(0.5 * t * t));

        trajectoryPoints.push(pt);
        if (pt.y <= projectileRadius * 0.5) break;
    }

    // Update geometry positions
    const needed = Math.max(trajectoryPoints.length, 2);
    const geom = trajectoryLine.geometry;
    const attr = geom.getAttribute('position');
    if (!attr || attr.count !== needed) {
        const positions = new Float32Array(needed * 3);
        geom.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    }

    const posAttr = geom.getAttribute('position');
    for (let i = 0; i < needed; i++) {
        const p = trajectoryPoints[Math.min(i, trajectoryPoints.length - 1)];
        posAttr.setXYZ(i, p.x, p.y, p.z);
    }
    posAttr.needsUpdate = true;
    geom.setDrawRange(0, needed);
    geom.computeBoundingSphere();

    // Required for dashed lines
    trajectoryLine.computeLineDistances();
}

function setupInputHandlers() {
    const canvas = document.getElementById('game-canvas');
    
    // Desktop: Mouse controls
    canvas.addEventListener('mousedown', onMouseDown);
    canvas.addEventListener('mousemove', onMouseMove);
    canvas.addEventListener('mouseup', onMouseUp);
    canvas.addEventListener('mouseleave', onMouseUp); // Stop dragging if mouse leaves canvas
    
    // Mobile: Touch controls
    canvas.addEventListener('touchstart', onTouchStart, { passive: false });
    canvas.addEventListener('touchmove', onTouchMove, { passive: false });
    canvas.addEventListener('touchend', onTouchEnd);
    canvas.addEventListener('touchcancel', onTouchEnd);
}

function fireProjectile() {
    if (gameState !== 'playing') return;
    if (!scene || !world || !camera || !player) {
        debugLog('[SnowballBlitz] fireProjectile() blocked - missing refs', {
            scene: !!scene,
            world: !!world,
            camera: !!camera,
            player: !!player,
        });
        return;
    }

    // SFX (only when a shot actually fires)
    sfx.playShoot();

    // Direction: aim forward (from player outward)
    const dir = getAimDirection();

    // Spawn position: slightly in front of and above player
    const spawnPos = getProjectileSpawnPosition(dir);

    // Three.js mesh
    const geometry = new THREE.SphereGeometry(projectileRadius, 16, 16);
    const material = new THREE.MeshStandardMaterial({
        color: 0xff3b30, // bright red for visibility while prototyping
        roughness: 0.35,
        metalness: 0.05,
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.copy(spawnPos);
    scene.add(mesh);

    // Physics body
    const shape = new CANNON.Sphere(projectileRadius);
    const body = new CANNON.Body({
        mass: 0.25,
        shape,
        position: new CANNON.Vec3(spawnPos.x, spawnPos.y, spawnPos.z),
    });
    body.collisionFilterGroup = CG_PROJECTILE;
    body.collisionFilterMask = CG_WORLD | CG_TARGET;
    body.velocity.set(
        dir.x * projectileSpeed,
        dir.y * projectileSpeed,
        dir.z * projectileSpeed
    );
    body.linearDamping = 0.01;
    world.addBody(body);

    const rec = { mesh, body, age: 0 };
    projectiles.push(rec);
    projectileByBodyId.set(body.id, rec);

    debugLog('[SnowballBlitz] projectile spawned', {
        spawn: { x: spawnPos.x, y: spawnPos.y, z: spawnPos.z },
        dir: { x: dir.x, y: dir.y, z: dir.z },
        speed: projectileSpeed,
        count: projectiles.length,
    });
}

function removeProjectile(idx) {
    const p = projectiles[idx];
    if (!p) return;
    scene.remove(p.mesh);
    world.removeBody(p.body);
    projectileByBodyId.delete(p.body.id);
    projectilesToRemove.delete(p.body.id);
    projectiles.splice(idx, 1);
}

function updateProjectiles(dt) {
    for (let i = projectiles.length - 1; i >= 0; i--) {
        const p = projectiles[i];
        p.age += dt;

        // Sync mesh from physics body
        p.mesh.position.set(p.body.position.x, p.body.position.y, p.body.position.z);
        p.mesh.quaternion.set(
            p.body.quaternion.x,
            p.body.quaternion.y,
            p.body.quaternion.z,
            p.body.quaternion.w
        );

        // Cleanup rules: lifetime or hit ground (y <= 0)
        if (p.age > projectileMaxAgeSec) {
            removeProjectile(i);
            continue;
        }

        // Removal driven by collision with world geometry
        if (projectilesToRemove.has(p.body.id)) {
            removeProjectile(i);
            continue;
        }

        // Failsafe: if it somehow falls far below world, remove it
        if (p.body.position.y < -10) {
            removeProjectile(i);
        }
    }
}

function onMouseDown(event) {
    sfx.unlock();
    bgm.unlock();
    isDragging = true;
    lastMouseX = event.clientX;
    lastMouseY = event.clientY;
    event.preventDefault();
}

function onMouseMove(event) {
    if (!isDragging) return;
    
    const deltaX = event.clientX - lastMouseX;
    const deltaY = event.clientY - lastMouseY;
    
    // Adjust aim horizontally (yaw)
    aimYaw -= deltaX * rotationSpeed;
    
    // Adjust aim vertically (pitch) with constraints
    aimPitch -= deltaY * rotationSpeed;
    aimPitch = Math.max(minAimPitch, Math.min(maxAimPitch, aimPitch));
    
    lastMouseX = event.clientX;
    lastMouseY = event.clientY;
    event.preventDefault();
}

function onMouseUp(event) {
    isDragging = false;
}

function onTouchStart(event) {
    if (event.touches.length === 1) {
        sfx.unlock();
        bgm.unlock();
        isDragging = true;
        lastTouchX = event.touches[0].clientX;
        lastTouchY = event.touches[0].clientY;
        event.preventDefault();
    }
}

function onTouchMove(event) {
    if (!isDragging || event.touches.length !== 1) return;
    
    const deltaX = event.touches[0].clientX - lastTouchX;
    const deltaY = event.touches[0].clientY - lastTouchY;
    
    // Adjust aim horizontally (yaw)
    aimYaw -= deltaX * rotationSpeed;
    
    // Adjust aim vertically (pitch) with constraints
    aimPitch -= deltaY * rotationSpeed;
    aimPitch = Math.max(minAimPitch, Math.min(maxAimPitch, aimPitch));
    
    lastTouchX = event.touches[0].clientX;
    lastTouchY = event.touches[0].clientY;
    event.preventDefault();
}

function onTouchEnd(event) {
    isDragging = false;
}

function animate() {
    requestAnimationFrame(animate);

    const dt = Math.min(clock.getDelta(), 0.05); // cap for tab switching / hiccups

    // Update physics world with variable delta (internally sub-stepped)
    world.step(1 / 60, dt, 5);

    // Sync physics -> visuals
    updateProjectiles(dt);

    // Update predicted trajectory each frame (cheap at these point counts)
    updateTrajectoryLine();

    // Update floating combat text
    ui.updateFloatingTexts(dt);

    // Update particle effects
    updateParticleBursts(dt);

    // Timer/game loop
    if (gameState === 'playing') {
        // Also check win condition here (in case anything removes targets outside destroyTarget)
        const remainingAlive = targets.reduce((n, t) => n + (t.alive ? 1 : 0), 0);
        if (remainingAlive === 0) {
            debugLog('[SnowballBlitz] win condition met (loop check)');
            endGame('win');
        }

        timeRemainingSec -= dt;
        if (timeRemainingSec <= 0) {
            endGame('timeout');
        } else {
            // Update timer display (smooth-ish: rounded)
            ui.updateTimer(timeRemainingSec, gameState);
        }
    }
    
    // Render scene
    renderer.render(scene, camera);
}

// Start the game when page loads
window.addEventListener('load', () => {
    init().catch((err) => {
        console.error(err);
        showErrorOverlay(
            'Failed to initialize',
            err && err.message ? err.message : String(err)
        );
    });
});
