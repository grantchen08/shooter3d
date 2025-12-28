/**
 * Debug tuning panel (enabled only in debug mode).
 *
 * Features:
 * - Live-edit projectile initial speed + gravity vector
 * - Live-edit camera (height/distance/pitch in degrees)
 * - Live-edit target min/max distance (keeps direction/layout fixed)
 * - Persist in localStorage
 * - Copy JSON to clipboard / Download game.json
 */

const DEFAULT_STORAGE_KEY = 'snowballblitz:tuning';
const DEFAULT_PANEL_STORAGE_SUFFIX = ':panel';

function safeParseJSON(text) {
    try {
        return { ok: true, value: JSON.parse(text) };
    } catch (err) {
        return { ok: false, error: err };
    }
}

function clampNumber(n, { min = -Infinity, max = Infinity } = {}) {
    if (!Number.isFinite(n)) return n;
    return Math.max(min, Math.min(max, n));
}

function toNumber(value, fallback) {
    // iOS numeric keyboards and some locales use ',' as the decimal separator.
    // Accept both "0.12" and "0,12" (and trim whitespace).
    if (typeof value === 'string') {
        const normalized = value.trim().replace(',', '.');
        const n = Number(normalized);
        return Number.isFinite(n) ? n : fallback;
    }
    const n = typeof value === 'number' ? value : Number(value);
    return Number.isFinite(n) ? n : fallback;
}

function prettyJSON(obj) {
    return JSON.stringify(obj, null, 2);
}

async function copyToClipboard(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(text);
        return true;
    }

    // Fallback (older browsers): temporary textarea + execCommand
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.left = '-9999px';
    ta.style.top = '0';
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    const ok = document.execCommand && document.execCommand('copy');
    ta.remove();
    if (!ok) throw new Error('Clipboard not available');
    return true;
}

function downloadTextFile({ filename, text, mime = 'application/json' }) {
    const blob = new Blob([text], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
}

function injectStylesOnce() {
    const id = 'tuning-panel-styles';
    if (document.getElementById(id)) return;
    const style = document.createElement('style');
    style.id = id;
    style.textContent = `
      .tuning-panel {
        position: absolute;
        top: max(12px, env(safe-area-inset-top));
        right: max(12px, env(safe-area-inset-right));
        width: min(360px, calc(100% - 24px));
        z-index: 160;
        pointer-events: auto;
        background: rgba(20, 20, 20, 0.92);
        border: 1px solid rgba(255, 255, 255, 0.18);
        border-radius: 12px;
        padding: 10px;
        color: #fff;
        font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif;
        box-shadow: 0 14px 30px rgba(0,0,0,0.45);
      }
      .tuning-panel .header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 10px;
        margin-bottom: 6px;
        cursor: grab;
        user-select: none;
        -webkit-user-select: none;
      }
      .tuning-panel.dragging .header {
        cursor: grabbing;
      }
      .tuning-panel .title {
        display: flex;
        align-items: center;
        gap: 8px;
        min-width: 0;
      }
      .tuning-panel .handle {
        width: 14px;
        height: 14px;
        border-radius: 4px;
        background:
          radial-gradient(circle at 2px 2px, rgba(255,255,255,0.55) 1px, transparent 1.5px) 0 0 / 6px 6px;
        opacity: 0.9;
        flex: 0 0 auto;
      }
      .tuning-panel .row {
        display: flex;
        align-items: center;
        gap: 8px;
        margin: 8px 0;
      }
      .tuning-panel .section-title {
        margin-top: 10px;
        padding-top: 10px;
        border-top: 1px solid rgba(255,255,255,0.12);
      }
      .tuning-panel .grid3 {
        display: grid;
        grid-template-columns: 1fr 1fr 1fr;
        gap: 6px;
        width: 100%;
      }
      .tuning-panel .grid3 input[type="number"] {
        width: 100%;
      }
      .tuning-panel .grid2 {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 6px;
        width: 100%;
      }
      .tuning-panel .grid2 input[type="number"] {
        width: 100%;
      }
      .tuning-panel h3 {
        margin: 0;
        font-size: 14px;
        letter-spacing: 0.2px;
      }
      .tuning-panel label {
        flex: 1;
        font-size: 12px;
        opacity: 0.92;
      }
      .tuning-panel input[type="number"] {
        width: 120px;
        padding: 6px 8px;
        border-radius: 10px;
        border: 1px solid rgba(255, 255, 255, 0.18);
        background: rgba(255, 255, 255, 0.06);
        color: #fff;
        outline: none;
      }
      .tuning-panel input[type="number"]:focus {
        border-color: rgba(255, 255, 255, 0.35);
      }
      .tuning-panel .tuning-body {
        display: block;
        /* If content exceeds viewport, make panel body scrollable */
        max-height: min(70vh, calc(100vh - 120px));
        overflow-x: hidden;
        overflow-y: auto;
        overscroll-behavior: contain;
        -webkit-overflow-scrolling: touch;
      }
      .tuning-panel.collapsed {
        width: min(220px, calc(100% - 24px));
        padding-bottom: 8px;
      }
      .tuning-panel.collapsed .tuning-body {
        display: none;
      }
      .tuning-panel .btns {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
        margin-top: 8px;
      }
      .tuning-panel button {
        appearance: none;
        border: 0;
        border-radius: 10px;
        padding: 8px 10px;
        font-weight: 800;
        font-size: 12px;
        cursor: pointer;
        background: #fff;
        color: #111;
      }
      .tuning-panel button.secondary {
        background: rgba(255,255,255,0.10);
        color: #fff;
        border: 1px solid rgba(255,255,255,0.18);
      }
      .tuning-panel button.icon {
        padding: 6px 8px;
        border-radius: 10px;
        line-height: 1;
      }
      .tuning-panel .json {
        width: 100%;
        height: 160px;
        resize: vertical;
        margin-top: 8px;
        padding: 8px;
        border-radius: 10px;
        border: 1px solid rgba(255, 255, 255, 0.18);
        background: rgba(0, 0, 0, 0.25);
        color: #eaeaea;
        font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
        font-size: 12px;
        line-height: 1.35;
      }
      .tuning-panel .status {
        margin-top: 6px;
        font-size: 12px;
        opacity: 0.85;
        min-height: 16px;
      }
    `;
    document.head.appendChild(style);
}

export function createTuningPanel({
    enabled,
    parent = null,
    getConfig,
    setConfig,
    defaultConfig,
    fileConfig,
    storageKey = DEFAULT_STORAGE_KEY,
    debug = null,
} = {}) {
    if (!enabled) return { destroy: () => {} };
    if (typeof getConfig !== 'function' || typeof setConfig !== 'function') {
        throw new Error('createTuningPanel requires getConfig() and setConfig()');
    }

    injectStylesOnce();

    const log = (message, data) => {
        try {
            if (typeof debug === 'function') debug(message, data);
        } catch {
            // ignore
        }
    };

    const container = parent || document.getElementById('game-container') || document.body;
    const panelStorageKey = `${storageKey}${DEFAULT_PANEL_STORAGE_SUFFIX}`;
    const panel = document.createElement('div');
    panel.className = 'tuning-panel';
    panel.innerHTML = `
      <div class="header" id="tune-header">
        <div class="title">
          <div class="handle" aria-hidden="true"></div>
          <h3>Debug tuning</h3>
        </div>
        <div class="header-actions">
          <button type="button" id="tune-collapse" class="secondary icon" aria-label="Collapse/expand">▾</button>
          <button type="button" id="tune-close" class="secondary icon" aria-label="Close">✕</button>
        </div>
      </div>
      <div class="tuning-body" id="tune-body">
        <h3 class="section-title">Physics</h3>
        <div class="row">
          <label for="tune-speed">Projectile speed</label>
          <input id="tune-speed" type="number" step="0.1" min="0.1" />
        </div>
        <div class="row">
          <label for="tune-gx">Gravity X</label>
          <input id="tune-gx" type="number" step="0.1" />
        </div>
        <div class="row">
          <label for="tune-gy">Gravity Y</label>
          <input id="tune-gy" type="number" step="0.1" />
        </div>
        <div class="row">
          <label for="tune-gz">Gravity Z</label>
          <input id="tune-gz" type="number" step="0.1" />
        </div>

        <h3 class="section-title">Camera</h3>
        <div class="row">
          <label for="tune-cam-distance">Distance</label>
          <input id="tune-cam-distance" type="number" step="0.1" min="0.1" />
        </div>
        <div class="row">
          <label for="tune-cam-height">Height</label>
          <input id="tune-cam-height" type="number" step="0.1" />
        </div>
        <div class="row">
          <label for="tune-cam-pitch">Orbit pitch (deg)</label>
          <input id="tune-cam-pitch" type="number" step="0.1" />
        </div>

        <h3 class="section-title">Targets</h3>
        <div class="grid2">
          <input id="tune-target-min" type="number" step="0.1" min="0.1" aria-label="Target min distance" />
          <input id="tune-target-max" type="number" step="0.1" min="0.1" aria-label="Target max distance" />
        </div>

        <h3 class="section-title">Audio</h3>
        <div class="row">
          <label for="tune-bgm-vol">BGM volume</label>
          <input id="tune-bgm-vol" type="text" inputmode="decimal" autocomplete="off" />
        </div>
        <div class="row">
          <label for="tune-sfx-vol">SFX volume</label>
          <input id="tune-sfx-vol" type="text" inputmode="decimal" autocomplete="off" />
        </div>

        <h3 class="section-title">Sizes</h3>
        <div class="row">
          <label for="tune-player-height">Player height</label>
          <input id="tune-player-height" type="number" step="0.1" min="0.1" />
        </div>
        <div class="row">
          <label for="tune-snowman-height">Snowman height</label>
          <input id="tune-snowman-height" type="number" step="0.1" min="0.1" />
        </div>

        <h3 class="section-title">Trajectory</h3>
        <div class="row">
          <label for="tune-traj-seg">Segment length</label>
          <input id="tune-traj-seg" type="number" step="0.01" min="0.05" />
        </div>
        <div class="row">
          <label for="tune-traj-maxpts">Max points</label>
          <input id="tune-traj-maxpts" type="number" step="1" min="4" />
        </div>

        <div class="btns">
          <button type="button" id="tune-copy">Copy JSON</button>
          <button type="button" id="tune-download" class="secondary">Download game.json</button>
          <button type="button" id="tune-reset-file" class="secondary">Reset to file</button>
          <button type="button" id="tune-reset-defaults" class="secondary">Reset defaults</button>
        </div>
        <textarea class="json" id="tune-json" spellcheck="false" readonly></textarea>
        <div class="status" id="tune-status"></div>
      </div>
    `;
    container.appendChild(panel);

    const header = panel.querySelector('#tune-header');
    const btnCollapse = panel.querySelector('#tune-collapse');
    const btnClose = panel.querySelector('#tune-close');
    const elSpeed = panel.querySelector('#tune-speed');
    const elGx = panel.querySelector('#tune-gx');
    const elGy = panel.querySelector('#tune-gy');
    const elGz = panel.querySelector('#tune-gz');
    const elCamDistance = panel.querySelector('#tune-cam-distance');
    const elCamHeight = panel.querySelector('#tune-cam-height');
    const elCamPitch = panel.querySelector('#tune-cam-pitch');
    const elTargetMin = panel.querySelector('#tune-target-min');
    const elTargetMax = panel.querySelector('#tune-target-max');
    const elBgmVol = panel.querySelector('#tune-bgm-vol');
    const elSfxVol = panel.querySelector('#tune-sfx-vol');
    const elPlayerHeight = panel.querySelector('#tune-player-height');
    const elSnowmanHeight = panel.querySelector('#tune-snowman-height');
    const elTrajSeg = panel.querySelector('#tune-traj-seg');
    const elTrajMaxPts = panel.querySelector('#tune-traj-maxpts');
    const elJson = panel.querySelector('#tune-json');
    const elStatus = panel.querySelector('#tune-status');

    const setStatus = (text) => {
        if (elStatus) elStatus.textContent = text || '';
    };

    const buildFromInputs = () => {
        const speed = clampNumber(toNumber(elSpeed.value, defaultConfig?.projectile?.initialSpeed ?? 18), { min: 0.1 });
        const gx = toNumber(elGx.value, defaultConfig?.physics?.gravity?.x ?? 0);
        const gy = toNumber(elGy.value, defaultConfig?.physics?.gravity?.y ?? -9.8);
        const gz = toNumber(elGz.value, defaultConfig?.physics?.gravity?.z ?? 0);
        const camDistance = clampNumber(toNumber(elCamDistance.value, defaultConfig?.camera?.distance ?? 8), { min: 0.1 });
        const camHeight = toNumber(elCamHeight.value, defaultConfig?.camera?.height ?? 3);
        const camPitch = toNumber(elCamPitch.value, defaultConfig?.camera?.orbitPitchDeg ?? 18);

        const minD = clampNumber(toNumber(elTargetMin.value, defaultConfig?.targets?.minDistance ?? 10), { min: 0.1 });
        const maxD = clampNumber(toNumber(elTargetMax.value, defaultConfig?.targets?.maxDistance ?? 26), { min: 0.1 });

        const bgmVol = clampNumber(toNumber(elBgmVol.value, defaultConfig?.audio?.bgmVolume ?? 0.12), { min: 0, max: 1 });
        const sfxVol = clampNumber(toNumber(elSfxVol.value, defaultConfig?.audio?.sfxVolume ?? 0.55), { min: 0, max: 1 });

        const playerH = clampNumber(toNumber(elPlayerHeight.value, defaultConfig?.player?.height ?? 2), { min: 0.1 });
        const snowmanH = clampNumber(toNumber(elSnowmanHeight.value, defaultConfig?.snowman?.height ?? 1.2), { min: 0.1 });
        const trajSeg = clampNumber(toNumber(elTrajSeg.value, defaultConfig?.trajectory?.segmentLength ?? 0.35), { min: 0.05 });
        const trajMaxPts = clampNumber(toNumber(elTrajMaxPts.value, defaultConfig?.trajectory?.maxPoints ?? 80), { min: 4 });

        return {
            projectile: { initialSpeed: speed },
            physics: { gravity: { x: gx, y: gy, z: gz } },
            camera: { distance: camDistance, height: camHeight, orbitPitchDeg: camPitch },
            targets: { minDistance: minD, maxDistance: maxD },
            audio: { bgmVolume: bgmVol, sfxVolume: sfxVol },
            player: { height: playerH },
            snowman: { height: snowmanH },
            trajectory: { segmentLength: trajSeg, maxPoints: Math.floor(trajMaxPts) },
        };
    };

    const render = (cfg) => {
        const active = document.activeElement;
        const setIfNotFocused = (el, value) => {
            if (!el) return;
            // Avoid breaking text entry on mobile by rewriting the value while typing.
            if (active === el) return;
            el.value = String(value);
        };

        const speed = cfg?.projectile?.initialSpeed ?? 18;
        const g = cfg?.physics?.gravity ?? { x: 0, y: -9.8, z: 0 };
        const cam = cfg?.camera ?? { distance: 8, height: 3, orbitPitchDeg: 18 };
        const tgt = cfg?.targets ?? { minDistance: 10, maxDistance: 26 };
        const aud = cfg?.audio ?? { bgmVolume: 0.12, sfxVolume: 0.55 };
        const playerCfg = cfg?.player ?? { height: 2 };
        const snowmanCfg = cfg?.snowman ?? { height: 1.2 };
        const trajCfg = cfg?.trajectory ?? { segmentLength: 0.35, maxPoints: 80 };
        setIfNotFocused(elSpeed, speed);
        setIfNotFocused(elGx, g.x ?? 0);
        setIfNotFocused(elGy, g.y ?? -9.8);
        setIfNotFocused(elGz, g.z ?? 0);
        setIfNotFocused(elCamDistance, cam.distance ?? 8);
        setIfNotFocused(elCamHeight, cam.height ?? 3);
        setIfNotFocused(elCamPitch, cam.orbitPitchDeg ?? 18);
        setIfNotFocused(elTargetMin, tgt.minDistance ?? 10);
        setIfNotFocused(elTargetMax, tgt.maxDistance ?? 26);
        setIfNotFocused(elBgmVol, aud.bgmVolume ?? 0.12);
        setIfNotFocused(elSfxVol, aud.sfxVolume ?? 0.55);
        setIfNotFocused(elPlayerHeight, playerCfg.height ?? 2);
        setIfNotFocused(elSnowmanHeight, snowmanCfg.height ?? 1.2);
        setIfNotFocused(elTrajSeg, trajCfg.segmentLength ?? 0.35);
        setIfNotFocused(elTrajMaxPts, trajCfg.maxPoints ?? 80);

        elJson.value = prettyJSON(cfg);
    };

    const persist = (cfg) => {
        try {
            localStorage.setItem(storageKey, JSON.stringify(cfg));
        } catch {
            // ignore
        }
    };

    const persistPanelState = (state) => {
        try {
            localStorage.setItem(panelStorageKey, JSON.stringify(state));
        } catch {
            // ignore
        }
    };

    const loadPanelState = () => {
        try {
            const raw = localStorage.getItem(panelStorageKey);
            if (!raw) return null;
            const parsed = safeParseJSON(raw);
            if (!parsed.ok) return null;
            return parsed.value;
        } catch {
            return null;
        }
    };

    const tryLoadPersisted = () => {
        try {
            const raw = localStorage.getItem(storageKey);
            if (!raw) return null;
            const parsed = safeParseJSON(raw);
            if (!parsed.ok) return null;
            return parsed.value;
        } catch {
            return null;
        }
    };

    let raf = 0;
    const scheduleApply = () => {
        if (raf) cancelAnimationFrame(raf);
        raf = requestAnimationFrame(() => {
            raf = 0;
            const cfg = buildFromInputs();
            setConfig(cfg);
            render(getConfig());
            persist(cfg);
            setStatus('Applied (saved locally).');
        });
    };

    // Initial state: current config, then override with persisted (if present).
    const initial = getConfig();
    const persisted = tryLoadPersisted();
    if (persisted) {
        log('[SnowballBlitz] tuning: applying persisted config');
        setConfig(persisted);
    }
    render(getConfig());

    // Panel UI state: collapsed + position (persisted)
    const panelState = loadPanelState();
    const defaultCollapsed = panelState && typeof panelState.collapsed === 'boolean' ? panelState.collapsed : true;
    if (defaultCollapsed) panel.classList.add('collapsed');
    btnCollapse.textContent = panel.classList.contains('collapsed') ? '▸' : '▾';

    if (panelState && panelState.pos && Number.isFinite(panelState.pos.left) && Number.isFinite(panelState.pos.top)) {
        // Convert to container-local coords and clamp.
        const rect = container.getBoundingClientRect();
        const panelRect = panel.getBoundingClientRect();
        const maxLeft = Math.max(0, rect.width - panelRect.width);
        const maxTop = Math.max(0, rect.height - panelRect.height);
        const left = clampNumber(panelState.pos.left, { min: 0, max: maxLeft });
        const top = clampNumber(panelState.pos.top, { min: 0, max: maxTop });
        panel.style.left = `${left}px`;
        panel.style.top = `${top}px`;
        panel.style.right = 'auto';
        panel.style.bottom = 'auto';
    }

    elSpeed.addEventListener('input', scheduleApply);
    elGx.addEventListener('input', scheduleApply);
    elGy.addEventListener('input', scheduleApply);
    elGz.addEventListener('input', scheduleApply);
    elCamDistance.addEventListener('input', scheduleApply);
    elCamHeight.addEventListener('input', scheduleApply);
    elCamPitch.addEventListener('input', scheduleApply);
    elTargetMin.addEventListener('input', scheduleApply);
    elTargetMax.addEventListener('input', scheduleApply);
    elBgmVol.addEventListener('input', scheduleApply);
    elSfxVol.addEventListener('input', scheduleApply);
    elPlayerHeight.addEventListener('input', scheduleApply);
    elSnowmanHeight.addEventListener('input', scheduleApply);
    elTrajSeg.addEventListener('input', scheduleApply);
    elTrajMaxPts.addEventListener('input', scheduleApply);

    const toggleCollapsed = () => {
        panel.classList.toggle('collapsed');
        btnCollapse.textContent = panel.classList.contains('collapsed') ? '▸' : '▾';
        persistPanelState({
            ...(loadPanelState() || {}),
            collapsed: panel.classList.contains('collapsed'),
        });
    };

    btnCollapse.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        toggleCollapsed();
    });

    btnClose.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        panel.remove();
    });

    // Dragging: pointer drag the header (not the buttons).
    let dragging = false;
    let dragOffsetX = 0;
    let dragOffsetY = 0;

    const isClickOnHeaderButton = (event) => {
        const t = event.target;
        return !!(t && (t.closest && t.closest('button')));
    };

    header.addEventListener('pointerdown', (event) => {
        if (isClickOnHeaderButton(event)) return;
        // Left mouse button or touch/pen (buttons===0 in pointer events for touch)
        if (event.pointerType === 'mouse' && event.button !== 0) return;

        event.preventDefault();
        event.stopPropagation();
        dragging = true;
        panel.classList.add('dragging');

        const panelRect = panel.getBoundingClientRect();
        const containerRect = container.getBoundingClientRect();
        dragOffsetX = event.clientX - panelRect.left;
        dragOffsetY = event.clientY - panelRect.top;

        // Switch to left/top positioning if not already.
        panel.style.right = 'auto';
        panel.style.bottom = 'auto';
        panel.style.left = `${panelRect.left - containerRect.left}px`;
        panel.style.top = `${panelRect.top - containerRect.top}px`;

        try {
            header.setPointerCapture(event.pointerId);
        } catch {
            // ignore
        }
    });

    header.addEventListener('pointermove', (event) => {
        if (!dragging) return;
        event.preventDefault();
        event.stopPropagation();

        const containerRect = container.getBoundingClientRect();
        const panelRect = panel.getBoundingClientRect();

        const desiredLeft = event.clientX - containerRect.left - dragOffsetX;
        const desiredTop = event.clientY - containerRect.top - dragOffsetY;

        const maxLeft = Math.max(0, containerRect.width - panelRect.width);
        const maxTop = Math.max(0, containerRect.height - panelRect.height);

        const left = clampNumber(desiredLeft, { min: 0, max: maxLeft });
        const top = clampNumber(desiredTop, { min: 0, max: maxTop });

        panel.style.left = `${left}px`;
        panel.style.top = `${top}px`;
    });

    const endDrag = () => {
        if (!dragging) return;
        dragging = false;
        panel.classList.remove('dragging');

        const left = Number.parseFloat(panel.style.left || '0');
        const top = Number.parseFloat(panel.style.top || '0');
        if (Number.isFinite(left) && Number.isFinite(top)) {
            persistPanelState({
                ...(loadPanelState() || {}),
                pos: { left, top },
                collapsed: panel.classList.contains('collapsed'),
            });
        }
    };

    header.addEventListener('pointerup', endDrag);
    header.addEventListener('pointercancel', endDrag);

    panel.querySelector('#tune-copy').addEventListener('click', async () => {
        const json = prettyJSON(getConfig());
        try {
            await copyToClipboard(json);
            setStatus('Copied JSON to clipboard.');
        } catch (err) {
            setStatus('Copy failed. You can still select/copy from the text area.');
            log('[SnowballBlitz] tuning copy failed', { error: err && err.message ? err.message : String(err) });
        }
    });

    panel.querySelector('#tune-download').addEventListener('click', () => {
        const json = prettyJSON(getConfig());
        downloadTextFile({ filename: 'game.json', text: json, mime: 'application/json' });
        setStatus('Downloaded game.json.');
    });

    panel.querySelector('#tune-reset-defaults').addEventListener('click', () => {
        if (!defaultConfig) return;
        setConfig(defaultConfig);
        render(getConfig());
        persist(getConfig());
        setStatus('Reset to defaults (saved locally).');
    });

    panel.querySelector('#tune-reset-file').addEventListener('click', () => {
        if (!fileConfig) {
            // Fall back to whatever was live at panel creation time.
            setConfig(initial);
            render(getConfig());
            persist(getConfig());
            setStatus('Reset to file (fallback).');
            return;
        }
        setConfig(fileConfig);
        render(getConfig());
        persist(getConfig());
        setStatus('Reset to file config (saved locally).');
    });

    setStatus(persisted ? 'Loaded saved tuning from this browser.' : 'Ready.');

    return {
        destroy() {
            try { if (raf) cancelAnimationFrame(raf); } catch {}
            panel.remove();
        },
    };
}

