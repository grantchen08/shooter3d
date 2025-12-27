/**
 * Debug tuning panel (enabled only in debug mode).
 *
 * Features:
 * - Live-edit projectile initial speed + gravity vector
 * - Persist in localStorage
 * - Copy JSON to clipboard / Download game.json
 */

const DEFAULT_STORAGE_KEY = 'snowballblitz:tuning';

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
      .tuning-panel .row {
        display: flex;
        align-items: center;
        gap: 8px;
        margin: 8px 0;
      }
      .tuning-panel h3 {
        margin: 0 0 6px 0;
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
    const panel = document.createElement('div');
    panel.className = 'tuning-panel';
    panel.innerHTML = `
      <h3>Debug tuning</h3>
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
      <div class="btns">
        <button type="button" id="tune-copy">Copy JSON</button>
        <button type="button" id="tune-download" class="secondary">Download game.json</button>
        <button type="button" id="tune-reset-file" class="secondary">Reset to file</button>
        <button type="button" id="tune-reset-defaults" class="secondary">Reset defaults</button>
      </div>
      <textarea class="json" id="tune-json" spellcheck="false" readonly></textarea>
      <div class="status" id="tune-status"></div>
    `;
    container.appendChild(panel);

    const elSpeed = panel.querySelector('#tune-speed');
    const elGx = panel.querySelector('#tune-gx');
    const elGy = panel.querySelector('#tune-gy');
    const elGz = panel.querySelector('#tune-gz');
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
        return {
            projectile: { initialSpeed: speed },
            physics: { gravity: { x: gx, y: gy, z: gz } },
        };
    };

    const render = (cfg) => {
        const speed = cfg?.projectile?.initialSpeed ?? 18;
        const g = cfg?.physics?.gravity ?? { x: 0, y: -9.8, z: 0 };
        elSpeed.value = String(speed);
        elGx.value = String(g.x ?? 0);
        elGy.value = String(g.y ?? -9.8);
        elGz.value = String(g.z ?? 0);
        elJson.value = prettyJSON(cfg);
    };

    const persist = (cfg) => {
        try {
            localStorage.setItem(storageKey, JSON.stringify(cfg));
        } catch {
            // ignore
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

    elSpeed.addEventListener('input', scheduleApply);
    elGx.addEventListener('input', scheduleApply);
    elGy.addEventListener('input', scheduleApply);
    elGz.addEventListener('input', scheduleApply);

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

