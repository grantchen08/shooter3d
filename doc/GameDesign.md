# Game Design Document: Project "Snowball Blitz" (Prototype)

## 1. Overview
**Project Name:** Snowball Blitz (Prototype)
**Genre:** 3D Arcade Physics Shooter
**Core Loop:** The player acts as a stationary turret, aiming and launching projectiles at waves of static targets (Snowmen) to achieve a high score within a time limit.
**Screen Orientation:** Landscape (horizontal) only.

## 2. Core Mechanics

### 2.1 Character Controller (The Player)
* **Movement:** Restricted. The player is rooted to a central platform (or has very limited strafing within a small zone).
* **Camera:** Third-person, over-the-shoulder view. The camera rotates around the player character to aim.
* **Input:**
    * **Desktop (Computer):**
        * **Mouse Drag:** Rotates camera (Aiming). Click and drag to rotate the camera around the player.
        * **On-Screen Fire Button:** Located in the lower right corner of the screen. Click to fire projectile.
    * **Mobile (Touch Devices):**
        * **Touch Drag:** Rotates camera (Aiming). Touch and drag to rotate the camera around the player.
        * **On-Screen Fire Button:** Located in the lower right corner of the screen. Tap to fire projectile.

### 2.2 Shooting Mechanic (The "Flying Jade")
* **Projectile Type:** Physics-based object affected by gravity.
* **Trajectory Guide:** A visual arc (dotted line) renders in real-time, showing the player exactly where the projectile will land based on the current camera pitch.
* **Velocity:** Fixed launch velocity (to simplify the prototype), or optional "hold-to-charge" for variable distance.
* **Collision Rule - "Piercing":** * The projectile does **not** get destroyed upon hitting the first target.
    * It continues its trajectory, allowing the player to destroy multiple targets lined up in a row (Multi-Kill).
    * The projectile is destroyed upon hitting the ground or "World" geometry.

### 2.3 Targets (Snowmen)
* **State:** Static (non-moving).
* **Placement:** Arranged in rows or clusters at varying heights and depths on tiered platforms.
* **Health:** 1 Hit Point (Instant destruction upon collision).
* **Feedback:** When hit, the target vanishes with a particle effect (snow explosion) and a floating score text appears.

## 3. Game Rules & Scoring

### 3.1 Session Constraints
* **Time Limit:** 60 Seconds (adjustable).
* **Ammo:** Infinite.

### 3.2 Scoring System
* **Base Score:** +50 Points per standard Snowman destroyed.
* **Combo/Piercing Bonus:** (Optional for MVP) If one projectile hits multiple snowmen, the score multiplier increases (e.g., +50 for 1st, +100 for 2nd).

## 4. UI / HUD Requirements
1.  **Countdown Timer:** Top center (mm:ss).
2.  **Score Counter:** Top left (accumulated total).
3.  **Aiming Reticle/Arc:** A 3D world-space line renderer showing the parabolic path.
4.  **Floating Combat Text:** Spawns at the location of a destroyed target showing points earned.
5.  **On-Screen Fire Button:** Lower right corner of the screen. Visible on both desktop and mobile platforms. Provides visual feedback when pressed (e.g., scale animation, color change).

## 5. Technical Implementation Specs (MVP)

### 5.1 Physics Math (The Arc)
To render the trajectory line, use the standard kinematic equation for position at time $t$:

$$P(t) = P_0 + V_0t + \frac{1}{2}gt^2$$

* $P_0$: Origin point (Player's hand/wand).
* $V_0$: Initial velocity vector (Forward direction * Force).
* $g$: Gravity vector (usually -9.8 on Y axis).

### 5.2 Asset Requirements (Placeholders)
* **Player:** Capsule collider or basic cylinder.
* **Projectile:** Sphere.
* **Target:** Cylinder or stacked spheres (Snowman).
* **Environment:** A tiered staircase geometry (ProBuilder or basic Cubes).

## 6. Development Roadmap
1.  **Phase 1:** Set up player rotation and projectile firing with gravity.
2.  **Phase 2:** Implement the Trajectory Line Renderer (visual prediction).
3.  **Phase 3:** Create targets and implement the "Piercing" collision logic.
4.  **Phase 4:** Add UI (Timer/Score) and Game Loop (Start -> Play -> End).