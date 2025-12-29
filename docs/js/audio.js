/**
 * WebAudio SFX helpers (asset-free).
 *
 * Notes:
 * - Browsers require a user gesture to start audio; call `unlock()` from input handlers.
 * - This module is intentionally dependency-free (no Three.js required).
 */

export function createSfx({ enabled = true, masterVolume = 0.55, debug = null } = {}) {
    let audioCtx = null;
    let audioMasterGain = null;
    let audioUnlocked = false;
    let muted = false;
    let pendingShootRetry = false;

    const log = (message, data) => {
        try {
            if (typeof debug === 'function') debug(message, data);
        } catch {
            // ignore
        }
    };

    const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

    const getAudioContext = () => {
        if (audioCtx) return audioCtx;
        const Ctx = window.AudioContext || window.webkitAudioContext;
        if (!Ctx) return null;

        audioCtx = new Ctx();
        audioMasterGain = audioCtx.createGain();
        audioMasterGain.gain.value = muted ? 0 : masterVolume;
        audioMasterGain.connect(audioCtx.destination);
        return audioCtx;
    };

    const setEnabled = (on) => {
        enabled = !!on;
    };

    const setMuted = (on) => {
        muted = !!on;
        if (audioMasterGain) audioMasterGain.gain.value = muted ? 0 : masterVolume;
    };

    const setMasterVolume = (v) => {
        masterVolume = clamp(Number(v), 0, 1);
        if (audioMasterGain) audioMasterGain.gain.value = muted ? 0 : masterVolume;
    };

    const makeSfxOut = (worldPos) => {
        // Optional stereo panning (cheap spatial cue).
        const ctx = getAudioContext();
        if (!ctx || !audioMasterGain) return { out: null, cleanup: () => {} };

        let out = audioMasterGain;
        let cleanup = () => {};
        try {
            if (typeof StereoPannerNode !== 'undefined') {
                const p = ctx.createStereoPanner();
                const pan = worldPos && typeof worldPos.x === 'number' ? clamp(worldPos.x / 10, -1, 1) : 0;
                p.pan.value = pan;
                p.connect(audioMasterGain);
                out = p;
                cleanup = () => {
                    try { p.disconnect(); } catch {}
                };
            }
        } catch {
            out = audioMasterGain;
        }
        return { out, cleanup };
    };

    const unlock = async ({ force = false } = {}) => {
        // Even if muted/disabled, unlocking the AudioContext early makes SFX more reliable on iOS.
        if ((!enabled && !force) || audioUnlocked) return;
        const ctx = getAudioContext();
        if (!ctx) return;
        try {
            if (ctx.state !== 'running') await ctx.resume();
            audioUnlocked = ctx.state === 'running';
            if (audioUnlocked) log('[SnowballBlitz] audio unlocked');
        } catch {
            // Ignore: might not qualify as a gesture in some browsers.
        }
    };

    const playShoot = () => {
        if (!enabled || muted) return;
        const ctx = getAudioContext();
        if (!ctx || !audioMasterGain) return;
        if (ctx.state !== 'running') {
            // If called from a gesture and the context isn't running yet, try to resume and retry once.
            if (!pendingShootRetry) {
                pendingShootRetry = true;
                unlock({ force: true }).finally(() => {
                    pendingShootRetry = false;
                    try {
                        if (ctx.state === 'running') playShoot();
                    } catch {
                        // ignore
                    }
                });
            }
            return;
        }

        const now = ctx.currentTime;
        const { out, cleanup: cleanupOut } = makeSfxOut(null);
        const target = out || audioMasterGain;

        // Short "pop" with a quick pitch drop
        const osc = ctx.createOscillator();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(520, now);
        osc.frequency.exponentialRampToValueAtTime(220, now + 0.09);

        const gain = ctx.createGain();
        gain.gain.setValueAtTime(0.0001, now);
        gain.gain.exponentialRampToValueAtTime(0.35, now + 0.006);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.12);

        // Tiny noise click for crispness
        const noiseDur = 0.02;
        const noiseBuf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * noiseDur), ctx.sampleRate);
        const data = noiseBuf.getChannelData(0);
        for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
        const noise = ctx.createBufferSource();
        noise.buffer = noiseBuf;
        const noiseGain = ctx.createGain();
        noiseGain.gain.setValueAtTime(0.18, now);
        noiseGain.gain.exponentialRampToValueAtTime(0.0001, now + noiseDur);

        osc.connect(gain);
        gain.connect(target);
        noise.connect(noiseGain);
        noiseGain.connect(target);

        osc.start(now);
        osc.stop(now + 0.13);
        noise.start(now);
        noise.stop(now + noiseDur + 0.01);

        osc.onended = () => {
            try { osc.disconnect(); } catch {}
            try { gain.disconnect(); } catch {}
            try { noise.disconnect(); } catch {}
            try { noiseGain.disconnect(); } catch {}
            cleanupOut();
        };
    };

    const playExplosion = (worldPos) => {
        if (!enabled || muted) return;
        const ctx = getAudioContext();
        if (!ctx || !audioMasterGain || ctx.state !== 'running') return;

        const now = ctx.currentTime;
        const { out, cleanup: cleanupOut } = makeSfxOut(worldPos);
        const target = out || audioMasterGain;

        // Noise burst shaped through a bandpass + envelope
        const dur = 0.28;
        const buf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * dur), ctx.sampleRate);
        const d = buf.getChannelData(0);
        for (let i = 0; i < d.length; i++) {
            const t = i / d.length;
            d[i] = (Math.random() * 2 - 1) * (1 - t) * 0.9;
        }
        const src = ctx.createBufferSource();
        src.buffer = buf;

        const bp = ctx.createBiquadFilter();
        bp.type = 'bandpass';
        bp.frequency.setValueAtTime(900, now);
        bp.Q.setValueAtTime(0.9, now);

        const gain = ctx.createGain();
        gain.gain.setValueAtTime(0.0001, now);
        gain.gain.exponentialRampToValueAtTime(0.55, now + 0.01);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + dur);

        // Low "thump" layer
        const osc = ctx.createOscillator();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(120, now);
        osc.frequency.exponentialRampToValueAtTime(55, now + 0.18);
        const thumpGain = ctx.createGain();
        thumpGain.gain.setValueAtTime(0.0001, now);
        thumpGain.gain.exponentialRampToValueAtTime(0.25, now + 0.008);
        thumpGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.22);

        src.connect(bp);
        bp.connect(gain);
        gain.connect(target);
        osc.connect(thumpGain);
        thumpGain.connect(target);

        src.start(now);
        src.stop(now + dur + 0.02);
        osc.start(now);
        osc.stop(now + 0.24);

        src.onended = () => {
            try { src.disconnect(); } catch {}
            try { bp.disconnect(); } catch {}
            try { gain.disconnect(); } catch {}
            try { osc.disconnect(); } catch {}
            try { thumpGain.disconnect(); } catch {}
            cleanupOut();
        };
    };

    return {
        unlock,
        playShoot,
        playExplosion,
        setEnabled,
        setMuted,
        setMasterVolume,
        get enabled() { return enabled; },
        get muted() { return muted; },
        get masterVolume() { return masterVolume; },
    };
}

/**
 * Background music (BGM) helper using HTMLAudioElement (mp3/ogg/etc).
 *
 * Why HTMLAudio (vs WebAudio):
 * - Simple, robust for streaming mp3
 * - Still respects autoplay restrictions (must call unlock() from a gesture)
 *
 * Update: On iOS, HTMLAudioElement.volume is read-only (1.0).
 * To support volume control, we route audio through a Web Audio GainNode if possible.
 */
export function createBgm({
    enabled = true,
    volume = 0.25,
    tracks = [],
    shuffle = true,
    debug = null,
} = {}) {
    const log = (message, data) => {
        try {
            if (typeof debug === 'function') debug(message, data);
        } catch {
            // ignore
        }
    };

    const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

    const list = Array.isArray(tracks) ? tracks.filter(Boolean) : [];
    let audio = null;
    let unlocked = false;
    let idx = 0;

    // Web Audio vars for iOS volume control
    let audioCtx = null;
    let gainNode = null;
    let sourceNode = null;

    const pickStartIndex = () => {
        if (!list.length) return 0;
        if (!shuffle) return 0;
        return Math.floor(Math.random() * list.length);
    };

    const getAudioContext = () => {
        if (audioCtx) return audioCtx;
        const Ctx = window.AudioContext || window.webkitAudioContext;
        if (!Ctx) return null;

        audioCtx = new Ctx();
        gainNode = audioCtx.createGain();
        gainNode.gain.value = volume;
        gainNode.connect(audioCtx.destination);
        return audioCtx;
    };

    const ensureAudio = () => {
        if (audio) return audio;
        if (!list.length) return null;

        idx = pickStartIndex();
        audio = new Audio(list[idx]);
        audio.preload = 'auto';
        audio.loop = false; // we handle looping/playlist manually

        // iOS Volume workaround: Route through Web Audio GainNode
        try {
            const ctx = getAudioContext();
            if (ctx) {
                sourceNode = ctx.createMediaElementSource(audio);
                sourceNode.connect(gainNode);
                // When routed, the element volume acts as input gain. Keep it full.
                audio.volume = 1.0;
            } else {
                audio.volume = clamp(volume, 0, 1);
            }
        } catch (e) {
            log('[SnowballBlitz] bgm: Web Audio route failed, falling back to element volume', e);
            audio.volume = clamp(volume, 0, 1);
        }

        audio.addEventListener('ended', () => {
            // Advance playlist
            if (!enabled || !unlocked || !audio || !list.length) return;
            idx = (idx + 1) % list.length;
            audio.src = list[idx];
            audio.currentTime = 0;
            const p = audio.play();
            if (p && typeof p.catch === 'function') {
                p.catch(() => {
                    // ignore (autoplay restrictions can re-trigger on src swap in some browsers)
                });
            }
        });

        return audio;
    };

    const setVolume = (v) => {
        volume = clamp(Number(v), 0, 1);
        
        // Update GainNode (primary volume control on iOS)
        if (gainNode) {
            gainNode.gain.value = volume;
        }

        // Update Element
        // If routed, keep element at 1.0. If not routed (fallback), update element.
        if (audio) {
            if (sourceNode) {
                audio.volume = 1.0;
            } else {
                audio.volume = volume;
            }
        }
    };

    const setEnabled = (on) => {
        enabled = !!on;
        if (!audio) return;
        if (!enabled) {
            try { audio.pause(); } catch {}
        } else if (unlocked) {
            const p = audio.play();
            if (p && typeof p.catch === 'function') p.catch(() => {});
        }
    };

    const unlock = async () => {
        // Resume Web Audio context if exists (crucial for iOS)
        if (audioCtx && audioCtx.state !== 'running') {
            try { await audioCtx.resume(); } catch {}
        }

        if (!enabled || unlocked) return;
        const a = ensureAudio();
        if (!a) return;
        try {
            const p = a.play();
            if (p && typeof p.then === 'function') await p;
            unlocked = !a.paused;
            if (unlocked) log('[SnowballBlitz] bgm unlocked', { track: a.currentSrc || a.src });
        } catch {
            // ignore
        }
    };

    const stop = () => {
        if (!audio) return;
        try { audio.pause(); } catch {}
        try { audio.currentTime = 0; } catch {}
    };

    return {
        unlock,
        stop,
        setEnabled,
        setVolume,
        get enabled() { return enabled; },
        get volume() { return volume; },
        get currentTrack() { return audio ? (audio.currentSrc || audio.src) : null; },
    };
}
