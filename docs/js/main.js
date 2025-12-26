/**
 * Snowball Blitz - Main Game File
 * Stage 8: Timer + Game Loop
 */

import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';
import WebGL from 'https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/capabilities/WebGL.js';
import * as CANNON from 'https://cdn.jsdelivr.net/npm/cannon-es@0.20.0/dist/cannon-es.js';

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
const cameraOrbitPitch = Math.PI / 10; // slightly above horizon

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
const projectileSpeed = 18; // fixed launch speed
const projectileMaxAgeSec = 8;

// Platforms & targets
const platforms = []; // { mesh: THREE.Mesh, body: CANNON.Body }
const targets = []; // { mesh: THREE.Group, body: CANNON.Body, alive: boolean }

// Score + HUD
let score = 0;
let scoreValueEl = null;
const SCORE_PER_TARGET = 50;

// Timer + game state
const TIME_LIMIT_SEC = 60;
let timeRemainingSec = TIME_LIMIT_SEC;
let timerValueEl = null;
let timerEl = null;
let fireButtonEl = null;
let gameState = 'playing'; // 'playing' | 'ended'
let endOverlayEl = null;
let endScoreEl = null;
let endTitleEl = null;

// Floating combat text
const floatingTexts = []; // { el: HTMLElement, worldPos: THREE.Vector3, age: number, duration: number }

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
const trajectoryMaxTimeSec = 3.0;
const trajectoryTimeStepSec = 0.08;

// Lightweight debug helper (console + on-screen line)
let debugEl = null;
function debugLog(message, data) {
    // Use console.log (not console.debug) so it shows by default
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
function init() {
    if (!WebGL.isWebGLAvailable()) {
        showErrorOverlay(
            'WebGL not available',
            'This browser/device cannot create a WebGL context, so the game cannot run here.'
        );
        return;
    }

    debugLog('[SnowballBlitz] init() starting');

    // Create Three.js scene
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x87CEEB); // Sky blue
    
    // Create camera (perspective camera for 3D)
    const aspect = window.innerWidth / window.innerHeight;
    camera = new THREE.PerspectiveCamera(75, aspect, 0.1, 1000);
    
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

    // Temporary firing input (until the on-screen fire button stage)
    setupFireInputHandlers();

    // Trajectory line
    setupTrajectoryLine();

    // HUD
    setupHud();

    // On-screen debug line (helps when console is filtered / hidden)
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

    // Fire button UI (desktop + mobile)
    setupFireButton();

    debugLog('[SnowballBlitz] init() complete');
    
    // Start render loop
    animate();
}

function setupHud() {
    scoreValueEl = document.getElementById('hud-score-value');
    debugLog('[SnowballBlitz] setupHud()', { foundScoreEl: !!scoreValueEl });
    setScore(0);

    timerEl = document.getElementById('hud-timer');
    timerValueEl = document.getElementById('hud-timer-value');
    setTimeRemaining(TIME_LIMIT_SEC);

    // Create end overlay UI (hidden until time runs out)
    setupEndOverlay();
}

function setScore(value) {
    score = value;
    // Lazy lookup in case DOM changed / element wasn't found at init time.
    if (!scoreValueEl) scoreValueEl = document.getElementById('hud-score-value');
    if (scoreValueEl) {
        scoreValueEl.textContent = String(score);
    } else {
        debugLog('[SnowballBlitz] WARN: score element missing');
    }
}

function addScore(delta) {
    debugLog('[SnowballBlitz] addScore()', { delta, before: score, after: score + delta });
    setScore(score + delta);
}

function formatTimeMMSS(seconds) {
    const s = Math.max(0, Math.ceil(seconds));
    const mm = Math.floor(s / 60);
    const ss = s % 60;
    return `${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`;
}

function setTimeRemaining(seconds) {
    timeRemainingSec = seconds;
    if (timerValueEl) timerValueEl.textContent = formatTimeMMSS(timeRemainingSec);
    if (timerEl) {
        if (timeRemainingSec <= 10 && gameState === 'playing') timerEl.classList.add('hud-timer-low');
        else timerEl.classList.remove('hud-timer-low');
    }
}

function setupEndOverlay() {
    const overlay = document.getElementById('ui-overlay');
    if (!overlay) return;

    endOverlayEl = document.createElement('div');
    endOverlayEl.className = 'end-overlay';
    endOverlayEl.innerHTML = `
        <div class="panel">
            <h2 id="end-title">Time’s up!</h2>
            <div class="final-score">Score: <span id="end-score">0</span></div>
            <button type="button" id="restart-button">Restart</button>
        </div>
    `;
    overlay.appendChild(endOverlayEl);
    endTitleEl = endOverlayEl.querySelector('#end-title');
    endScoreEl = endOverlayEl.querySelector('#end-score');
    const restartBtn = endOverlayEl.querySelector('#restart-button');
    restartBtn.addEventListener('click', (e) => {
        e.preventDefault();
        resetGame();
    });
}

function endGame(reason) {
    if (gameState === 'ended') return;
    gameState = 'ended';
    setTimeRemaining(0);
    if (fireButtonEl) fireButtonEl.disabled = true;
    if (endTitleEl) endTitleEl.textContent = reason === 'win' ? 'You win!' : 'Time’s up!';
    if (endScoreEl) endScoreEl.textContent = String(score);
    if (endOverlayEl) endOverlayEl.style.display = 'flex';
    debugLog('[SnowballBlitz] game ended', { reason, score });
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
    setScore(0);
    gameState = 'playing';
    setTimeRemaining(TIME_LIMIT_SEC);
    if (fireButtonEl) fireButtonEl.disabled = false;
    if (endOverlayEl) endOverlayEl.style.display = 'none';

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
    const playerGeometry = new THREE.CylinderGeometry(0.5, 0.5, 2, 16);
    const playerMaterial = new THREE.MeshStandardMaterial({ 
        color: 0x4169E1, // Royal blue
        roughness: 0.7,
        metalness: 0.3
    });
    player = new THREE.Mesh(playerGeometry, playerMaterial);
    player.position.set(0, 1, 0); // Position at ground level (height 1 = radius 1)
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
    world.gravity.set(0, -9.8, 0); // Standard gravity
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
    spawnFloatingText(`+${SCORE_PER_TARGET}`, fxPos);
    spawnSnowExplosion(fxPos);
    addScore(SCORE_PER_TARGET);

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
    const g = -9.8;
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

function worldToScreen(posWorld) {
    // Returns pixel coords relative to viewport
    const v = posWorld.clone().project(camera);
    const x = (v.x * 0.5 + 0.5) * window.innerWidth;
    const y = (-v.y * 0.5 + 0.5) * window.innerHeight;
    return { x, y, z: v.z };
}

function spawnFloatingText(text, worldPos) {
    const overlay = document.getElementById('ui-overlay');
    if (!overlay) return;

    const el = document.createElement('div');
    el.className = 'floating-text';
    el.textContent = text;
    overlay.appendChild(el);

    floatingTexts.push({
        el,
        worldPos,
        age: 0,
        duration: 0.9,
    });
}

function updateFloatingTexts(dt) {
    for (let i = floatingTexts.length - 1; i >= 0; i--) {
        const ft = floatingTexts[i];
        ft.age += dt;

        const t = Math.min(ft.age / ft.duration, 1);
        const rise = 28 * t; // pixels
        const fade = 1 - t;

        const { x, y, z } = worldToScreen(ft.worldPos);

        // Hide if behind camera
        if (z > 1) {
            ft.el.style.opacity = '0';
            ft.el.style.transform = 'translate(-9999px, -9999px)';
        } else {
            ft.el.style.opacity = String(fade);
            ft.el.style.transform = `translate(${x}px, ${y - rise}px) translate(-50%, -50%)`;
        }

        if (ft.age >= ft.duration) {
            ft.el.remove();
            floatingTexts.splice(i, 1);
        }
    }
}

function createPlatformsAndTargets() {
    createTieredPlatforms();
    createTargets();
}

function createTieredPlatforms() {
    // Simple tiered "staircase" in front of the player (toward -Z)
    const steps = [
        { w: 12, h: 1.0, d: 6, x: 0, y: 0.5, z: -10 },
        { w: 10, h: 1.0, d: 6, x: 0, y: 1.5, z: -18 },
        { w: 8,  h: 1.0, d: 6, x: 0, y: 2.5, z: -26 },
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

    const snowMat = new THREE.MeshStandardMaterial({
        color: 0xffffff,
        roughness: 0.85,
        metalness: 0.0,
    });

    const body = new THREE.Mesh(new THREE.SphereGeometry(0.45, 16, 16), snowMat);
    body.position.set(0, 0.45, 0);
    group.add(body);

    const head = new THREE.Mesh(new THREE.SphereGeometry(0.28, 16, 16), snowMat);
    head.position.set(0, 0.45 + 0.28 + 0.18, 0);
    group.add(head);

    // Tiny "nose" for orientation
    const nose = new THREE.Mesh(
        new THREE.ConeGeometry(0.06, 0.25, 10),
        new THREE.MeshStandardMaterial({ color: 0xff9500, roughness: 0.6 })
    );
    nose.rotation.x = Math.PI / 2;
    nose.position.set(0, head.position.y, -0.28);
    group.add(nose);

    return group;
}

function createTargets() {
    // Place static targets on platforms in simple rows
    const placements = [
        // step 1 (top surface is y=1.0)
        { x: -3.0, y: 1.0, z: -10 },
        { x:  0.0, y: 1.0, z: -10 },
        { x:  3.0, y: 1.0, z: -10 },
        // step 2 (top surface is y=2.0)
        { x: -2.5, y: 2.0, z: -18 },
        { x:  0.0, y: 2.0, z: -18 },
        { x:  2.5, y: 2.0, z: -18 },
        // step 3 (top surface is y=3.0)
        { x: -2.0, y: 3.0, z: -26 },
        { x:  0.0, y: 3.0, z: -26 },
        { x:  2.0, y: 3.0, z: -26 },
    ];

    for (const p of placements) {
        const mesh = createSnowmanMesh();
        mesh.position.set(p.x, p.y, p.z);
        scene.add(mesh);

        // Physics body (static). Use a single sphere collider for now.
        // Center sits above the platform surface.
        const shape = new CANNON.Sphere(0.55);
        const body = new CANNON.Body({
            mass: 0,
            shape,
            position: new CANNON.Vec3(p.x, p.y + 0.55, p.z),
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
    const g = new THREE.Vector3(0, -9.8, 0);

    // Build points until we hit the ground (y <= projectileRadius) or max time
    trajectoryPoints.length = 0;
    trajectoryPoints.push(p0.clone());

    for (let t = trajectoryTimeStepSec; t <= trajectoryMaxTimeSec; t += trajectoryTimeStepSec) {
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
    updateFloatingTexts(dt);

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
            // Update timer display (smooth)
            if (timerValueEl) timerValueEl.textContent = formatTimeMMSS(timeRemainingSec);
            if (timerEl) {
                if (timeRemainingSec <= 10) timerEl.classList.add('hud-timer-low');
                else timerEl.classList.remove('hud-timer-low');
            }
        }
    }
    
    // Render scene
    renderer.render(scene, camera);
}

// Start the game when page loads
window.addEventListener('load', init);
