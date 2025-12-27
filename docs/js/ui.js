/**
 * UI/HUD helpers:
 * - score + timer HUD
 * - end overlay (restart)
 * - floating combat text
 */

export function createUI({ debug = null } = {}) {
    const log = (message, data) => {
        try {
            if (typeof debug === 'function') debug(message, data);
        } catch {
            // ignore
        }
    };

    // DOM refs
    let scoreValueEl = null;
    let timerEl = null;
    let timerValueEl = null;
    let overlayEl = null;

    // End overlay refs
    let endOverlayEl = null;
    let endTitleEl = null;
    let endScoreEl = null;

    // State
    let score = 0;
    let camera = null;

    // Floating combat text state
    const floatingTexts = []; // { el: HTMLElement, worldPos: {x,y,z}, age: number, duration: number }

    const formatTimeMMSS = (seconds) => {
        const s = Math.max(0, Math.ceil(seconds));
        const mm = Math.floor(s / 60);
        const ss = s % 60;
        return `${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`;
    };

    const worldToScreen = (posWorld) => {
        // Returns pixel coords relative to viewport
        if (!camera || !posWorld) return { x: -9999, y: -9999, z: 2 };
        // Expecting a THREE.Vector3-like object with clone()/project() support.
        const v = posWorld.clone().project(camera);
        const x = (v.x * 0.5 + 0.5) * window.innerWidth;
        const y = (-v.y * 0.5 + 0.5) * window.innerHeight;
        return { x, y, z: v.z };
    };

    const ensureEndOverlay = (onRestart) => {
        if (!overlayEl) overlayEl = document.getElementById('ui-overlay');
        if (!overlayEl) return;
        if (endOverlayEl) return;

        endOverlayEl = document.createElement('div');
        endOverlayEl.className = 'end-overlay';
        endOverlayEl.innerHTML = `
            <div class="panel">
                <h2 id="end-title">Time’s up!</h2>
                <div class="final-score">Score: <span id="end-score">0</span></div>
                <button type="button" id="restart-button">Restart</button>
            </div>
        `;
        overlayEl.appendChild(endOverlayEl);
        endTitleEl = endOverlayEl.querySelector('#end-title');
        endScoreEl = endOverlayEl.querySelector('#end-score');
        const restartBtn = endOverlayEl.querySelector('#restart-button');
        restartBtn.addEventListener('click', (e) => {
            e.preventDefault();
            if (typeof onRestart === 'function') onRestart();
        });
    };

    return {
        setCamera(nextCamera) {
            camera = nextCamera;
        },

        getScore() {
            return score;
        },

        init({ timeLimitSec = 60, onRestart } = {}) {
            scoreValueEl = document.getElementById('hud-score-value');
            timerEl = document.getElementById('hud-timer');
            timerValueEl = document.getElementById('hud-timer-value');
            overlayEl = document.getElementById('ui-overlay');

            log('[SnowballBlitz] ui.init()', {
                foundScoreEl: !!scoreValueEl,
                foundTimerEl: !!timerEl,
                foundTimerValueEl: !!timerValueEl,
                foundOverlayEl: !!overlayEl,
            });

            this.setScore(0);
            this.updateTimer(timeLimitSec, 'playing');
            ensureEndOverlay(onRestart);
            this.hideEnd();
        },

        setScore(value) {
            score = value;
            if (!scoreValueEl) scoreValueEl = document.getElementById('hud-score-value');
            if (scoreValueEl) scoreValueEl.textContent = String(score);
            else log('[SnowballBlitz] WARN: score element missing');
        },

        addScore(delta) {
            this.setScore(score + delta);
        },

        updateTimer(seconds, gameState) {
            if (!timerValueEl) timerValueEl = document.getElementById('hud-timer-value');
            if (timerValueEl) timerValueEl.textContent = formatTimeMMSS(seconds);

            if (!timerEl) timerEl = document.getElementById('hud-timer');
            if (timerEl) {
                const low = seconds <= 10 && gameState === 'playing';
                if (low) timerEl.classList.add('hud-timer-low');
                else timerEl.classList.remove('hud-timer-low');
            }
        },

        showEnd({ reason = 'timeout', finalScore = score } = {}) {
            ensureEndOverlay(null);
            if (!endOverlayEl) return;
            if (endTitleEl) endTitleEl.textContent = reason === 'win' ? 'You win!' : 'Time’s up!';
            if (endScoreEl) endScoreEl.textContent = String(finalScore);
            endOverlayEl.style.display = 'flex';
        },

        hideEnd() {
            if (endOverlayEl) endOverlayEl.style.display = 'none';
        },

        spawnFloatingText(text, worldPos) {
            if (!overlayEl) overlayEl = document.getElementById('ui-overlay');
            if (!overlayEl) return;

            const el = document.createElement('div');
            el.className = 'floating-text';
            el.textContent = text;
            overlayEl.appendChild(el);

            floatingTexts.push({
                el,
                worldPos,
                age: 0,
                duration: 0.9,
            });
        },

        updateFloatingTexts(dt) {
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
        },
    };
}

