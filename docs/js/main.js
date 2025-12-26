/**
 * Snowball Blitz - Main Game File
 * Stage 2: Projectile System & Physics
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
let cameraRotationX = 0; // Horizontal rotation (yaw) in radians
let cameraRotationY = Math.PI / 6; // Vertical rotation (pitch) in radians - start slightly down
const minPitch = -Math.PI / 3; // Maximum upward angle
const maxPitch = Math.PI / 3; // Maximum downward angle

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
    
    // Handle window resize
    window.addEventListener('resize', onWindowResize);
    
    // Setup input handlers
    setupInputHandlers();

    // Temporary firing input (until the on-screen fire button stage)
    setupFireInputHandlers();
    
    // Start render loop
    animate();
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
    world.addBody(groundBody);
}

function setupFireInputHandlers() {
    // Keyboard: Space fires a projectile (desktop-friendly for now)
    window.addEventListener('keydown', (event) => {
        if (event.repeat) return;
        if (event.code === 'Space') {
            fireProjectile();
            event.preventDefault();
        }
    });
}

function onWindowResize() {
    // Update camera aspect ratio
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    
    // Update renderer size
    renderer.setSize(window.innerWidth, window.innerHeight);
}

function updateCameraPosition() {
    // Calculate camera position using spherical coordinates
    const x = player.position.x + cameraDistance * Math.sin(cameraRotationX) * Math.cos(cameraRotationY);
    const y = player.position.y + cameraHeight + cameraDistance * Math.sin(cameraRotationY);
    const z = player.position.z + cameraDistance * Math.cos(cameraRotationX) * Math.cos(cameraRotationY);
    
    camera.position.set(x, y, z);
    camera.lookAt(player.position.x, player.position.y + cameraHeight * 0.5, player.position.z);
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
    if (!scene || !world || !camera || !player) return;

    // Direction: camera forward vector
    const dir = new THREE.Vector3();
    camera.getWorldDirection(dir);
    dir.normalize();

    // Spawn position: slightly in front of and above player
    const spawnPos = player.position
        .clone()
        .add(new THREE.Vector3(0, 1.0, 0))
        .add(dir.clone().multiplyScalar(1.0));

    // Three.js mesh
    const geometry = new THREE.SphereGeometry(projectileRadius, 16, 16);
    const material = new THREE.MeshStandardMaterial({
        color: 0xffffff,
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
    body.velocity.set(
        dir.x * projectileSpeed,
        dir.y * projectileSpeed,
        dir.z * projectileSpeed
    );
    body.linearDamping = 0.01;
    world.addBody(body);

    projectiles.push({ mesh, body, age: 0 });
}

function removeProjectile(idx) {
    const p = projectiles[idx];
    if (!p) return;
    scene.remove(p.mesh);
    world.removeBody(p.body);
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

        // Give a short grace period so firing downward doesn't instantly despawn
        if (p.age > 0.15 && p.body.position.y <= projectileRadius * 0.5) {
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
    
    // Rotate camera horizontally (yaw)
    cameraRotationX -= deltaX * rotationSpeed;
    
    // Rotate camera vertically (pitch) with constraints
    cameraRotationY -= deltaY * rotationSpeed;
    cameraRotationY = Math.max(minPitch, Math.min(maxPitch, cameraRotationY));
    
    lastMouseX = event.clientX;
    lastMouseY = event.clientY;
    
    updateCameraPosition();
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
    
    // Rotate camera horizontally (yaw)
    cameraRotationX -= deltaX * rotationSpeed;
    
    // Rotate camera vertically (pitch) with constraints
    cameraRotationY -= deltaY * rotationSpeed;
    cameraRotationY = Math.max(minPitch, Math.min(maxPitch, cameraRotationY));
    
    lastTouchX = event.touches[0].clientX;
    lastTouchY = event.touches[0].clientY;
    
    updateCameraPosition();
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
    
    // Camera position is updated in real-time via input handlers
    // but we ensure it's updated here too for consistency
    updateCameraPosition();
    
    // Render scene
    renderer.render(scene, camera);
}

// Start the game when page loads
window.addEventListener('load', init);
