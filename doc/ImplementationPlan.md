# Implementation Plan: Snowball Blitz Prototype

## Overview
This document outlines a staged approach to implementing the Snowball Blitz prototype using Three.js and HTML/JavaScript.

## Technology Stack
- **3D Engine:** Three.js
- **Physics:** Cannon.js (or Ammo.js)
- **UI:** HTML5/CSS3 overlay
- **Build Tool:** (Optional) Vite or similar for development

---

## Stage 0: Project Setup & Foundation
**Goal:** Set up project structure and basic Three.js scene

### Tasks:
1. Initialize project structure
   - Create HTML entry point
   - Set up basic file structure (js/, css/, assets/)
   - Configure landscape orientation (viewport meta tag)

2. Install dependencies
   - Three.js (via CDN or npm)
   - Cannon.js for physics
   - (Optional) Vite for development server

3. Create basic Three.js scene
   - Scene, camera, renderer setup
   - Configure renderer for landscape aspect ratio
   - Basic lighting (ambient + directional)
   - Render loop setup

4. Create basic environment
   - Ground plane (simple plane geometry)
   - Background/sky (gradient or color)
   - Basic camera positioning

**Deliverable:** Empty 3D scene rendering in browser with landscape orientation

**Estimated Time:** 2-4 hours

---

## Stage 1: Player & Camera System
**Goal:** Implement player character and third-person camera controls

### Tasks:
1. Create player character
   - Basic cylinder geometry (placeholder)
   - Position at center of scene
   - Add to scene

2. Implement camera system
   - Third-person camera setup
   - Camera follows player position
   - Camera rotation around player (horizontal and vertical)

3. Input handling - Camera rotation
   - **Desktop:** Mouse drag detection
     - Track mouse down/move/up events
     - Calculate rotation delta from mouse movement
   - **Mobile:** Touch drag detection
     - Track touch start/move/end events
     - Calculate rotation delta from touch movement
   - Apply rotation to camera (smooth or direct)

4. Camera constraints
   - Limit vertical rotation (pitch) to prevent flipping
   - Smooth rotation interpolation (optional)

**Deliverable:** Player character visible, camera rotates around player via mouse/touch drag

**Estimated Time:** 4-6 hours

---

## Stage 2: Projectile System & Physics
**Goal:** Implement projectile firing with gravity-based physics

### Tasks:
1. Set up physics world
   - Initialize Cannon.js world
   - Set gravity (0, -9.8, 0)
   - Create ground physics body

2. Create projectile
   - Sphere geometry (visual)
   - Sphere physics body
   - Material setup

3. Implement firing mechanism
   - Calculate launch direction from camera forward vector
   - Set initial velocity (fixed magnitude)
   - Spawn projectile at player position (or slightly forward)
   - Add to both Three.js scene and physics world

4. Projectile physics simulation
   - Update physics world each frame
   - Sync visual position with physics body
   - Handle projectile lifetime (destroy after X seconds or on ground hit)

5. Ground collision detection
   - Detect when projectile hits ground
   - Remove projectile from scene and physics world

**Deliverable:** Can fire projectiles that follow gravity-based trajectory

**Estimated Time:** 6-8 hours

---

## Stage 3: Trajectory Visualization
**Goal:** Show predicted projectile path as visual arc

### Tasks:
1. Trajectory calculation
   - Implement kinematic equation: `P(t) = P_0 + V_0*t + 0.5*g*t²`
   - Calculate points along trajectory path
   - Determine ground intersection point

2. Visual arc rendering
   - Create line geometry from trajectory points
   - Use dotted/dashed line style (or points)
   - Update arc in real-time as camera rotates
   - Color/style the arc (e.g., white/blue gradient)

3. Arc visibility
   - Show arc only when aiming (always visible during gameplay)
   - Update arc when camera pitch changes
   - Limit arc length (e.g., until ground hit or max distance)

**Deliverable:** Visual trajectory arc shows predicted path in real-time

**Estimated Time:** 4-6 hours

---

## Stage 4: Fire Button UI
**Goal:** Implement on-screen fire button with input handling

### Tasks:
1. Create fire button HTML/CSS
   - Position in lower right corner
   - Styled button (circular or rounded rectangle)
   - Responsive sizing for mobile/desktop
   - Visual styling (colors, shadows)

2. Button interaction
   - Click/tap detection
   - Visual feedback (scale animation, color change on press)
   - Prevent default touch behaviors (e.g., scrolling)

3. Integrate with projectile system
   - Connect button click to fire function
   - Ensure button doesn't interfere with camera drag
   - Handle simultaneous drag and button press

**Deliverable:** On-screen fire button works on desktop and mobile

**Estimated Time:** 2-3 hours

---

## Stage 5: Targets (Snowmen) System
**Goal:** Create and place static snowman targets

### Tasks:
1. Create snowman model
   - Stacked spheres (body + head)
   - Basic white material
   - Group geometry for easy manipulation

2. Target placement system
   - Create multiple snowmen
   - Arrange in rows/clusters
   - Place on tiered platforms at varying heights/depths
   - Store targets in array for collision detection

3. Create tiered platforms
   - Multiple platform levels (staircase effect)
   - Position snowmen on platforms
   - Visual distinction between platforms

4. Target physics bodies
   - Create physics bodies for each target
   - Static bodies (don't move)
   - Proper collision shapes

**Deliverable:** Multiple snowmen targets visible on tiered platforms

**Estimated Time:** 4-6 hours

---

## Stage 6: Collision Detection & Piercing Logic
**Goal:** Implement projectile-target collision with piercing behavior

### Tasks:
1. Collision detection setup
   - Set up collision events in Cannon.js
   - Detect projectile-target collisions
   - Detect projectile-ground collisions

2. Target destruction
   - On collision, mark target as destroyed
   - Remove target visual from scene
   - Remove target physics body
   - Play destruction effect (particle system - basic)

3. Piercing logic
   - Projectile continues after hitting target
   - Don't destroy projectile on first target hit
   - Track hit targets to prevent double-counting
   - Destroy projectile only on ground hit

4. Collision filtering
   - Ensure projectile doesn't collide with player
   - Handle multiple collisions in same frame

**Deliverable:** Projectiles pierce through targets, destroying multiple snowmen

**Estimated Time:** 6-8 hours

---

## Stage 7: Scoring System
**Goal:** Implement scoring and floating combat text

### Tasks:
1. Score tracking
   - Initialize score counter
   - Add points when target destroyed (+50 base)
   - Track combo/piercing bonus (optional for MVP)

2. Floating combat text
   - Create text sprite or HTML overlay
   - Spawn at target destruction location
   - Animate upward and fade out
   - Display points earned (+50, +100, etc.)

3. Score UI
   - Display score counter (top left)
   - Update in real-time
   - Style appropriately

**Deliverable:** Score increases when targets destroyed, floating text shows points

**Estimated Time:** 3-4 hours

---

## Stage 8: Timer & Game Loop
**Goal:** Implement 60-second timer and game state management

### Tasks:
1. Timer system
   - 60-second countdown
   - Update timer display (top center, mm:ss format)
   - Handle timer reaching zero

2. Game states
   - **Start:** Initial state, show start screen (optional)
   - **Playing:** Active gameplay state
   - **End:** Game over state, show final score

3. Game loop implementation
   - Start game (begin timer)
   - During play: update timer, handle input, update physics
   - End game: stop timer, disable input, show end screen

4. Timer UI
   - Display countdown (top center)
   - Format as mm:ss
   - Visual feedback when time running low (optional)

**Deliverable:** 60-second timer counts down, game ends when timer reaches zero

**Estimated Time:** 4-5 hours

---

## Stage 9: Polish & Effects
**Goal:** Add visual polish and feedback effects

### Tasks:
1. Particle effects
   - Snow explosion on target destruction
   - Use Three.js Points or particle system library
   - Simple white particles expanding outward

2. Visual feedback
   - Improve fire button animations
   - Camera shake on fire (optional)
   - Projectile trail effect (optional)

3. UI polish
   - Improve HUD styling
   - Add game over screen
   - Add start screen (optional)
   - Responsive design improvements

4. Performance optimization
   - Optimize render calls
   - Clean up destroyed objects properly
   - Limit particle count

**Deliverable:** Polished game with visual effects and smooth gameplay

**Estimated Time:** 6-8 hours

---

## Stage 10: Testing & Refinement
**Goal:** Test across devices and refine gameplay

### Tasks:
1. Cross-platform testing
   - Test on desktop browsers (Chrome, Firefox, Safari)
   - Test on mobile devices (iOS Safari, Android Chrome)
   - Verify touch controls work correctly
   - Check landscape orientation handling

2. Gameplay balancing
   - Adjust projectile velocity if needed
   - Adjust camera sensitivity
   - Fine-tune target placement
   - Test difficulty curve

3. Bug fixes
   - Fix any collision detection issues
   - Fix input handling edge cases
   - Fix UI responsiveness issues

4. Final polish
   - Code cleanup
   - Add comments
   - Optimize performance
   - Final visual tweaks

**Deliverable:** Fully functional, tested prototype ready for demo

**Estimated Time:** 4-6 hours

---

## Total Estimated Time
**MVP (Stages 0-8):** ~35-50 hours
**Full Prototype (Stages 0-10):** ~45-64 hours

---

## Dependencies Between Stages

```
Stage 0 (Setup)
    ↓
Stage 1 (Player/Camera)
    ↓
Stage 2 (Projectiles)
    ↓
Stage 3 (Trajectory) ← depends on Stage 2
    ↓
Stage 4 (Fire Button) ← depends on Stage 2
    ↓
Stage 5 (Targets)
    ↓
Stage 6 (Collisions) ← depends on Stage 2 & 5
    ↓
Stage 7 (Scoring) ← depends on Stage 6
    ↓
Stage 8 (Timer/Game Loop) ← depends on Stage 7
    ↓
Stage 9 (Polish) ← depends on all previous
    ↓
Stage 10 (Testing)
```

---

## Notes
- Stages can be worked on in parallel where dependencies allow
- MVP can be achieved with Stages 0-8
- Stages 9-10 are for polish and can be iterative
- Consider creating separate branches for each stage
- Test frequently after each stage completion
