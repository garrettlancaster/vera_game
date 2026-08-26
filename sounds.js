// ============================================================ procedural sound engine (Web Audio)
// Every SFX is synthesized at runtime from noise + oscillators — no audio files.
const SFX = (() => {
  let ctx = null, master = null, noiseBuf = null;
  let activeCount = 0;
  const MAX_VOICES = 28;

  function ensure() {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.55;
      const comp = ctx.createDynamicsCompressor();   // keeps overlapping SFX from clipping
      comp.threshold.value = -18; comp.ratio.value = 6; comp.knee.value = 12;
      master.connect(comp); comp.connect(ctx.destination);
      noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    return ctx;
  }

  // resume the context from a real user gesture (browser autoplay policy)
  function unlock() { ensure(); }

  // --- primitives ---------------------------------------------------------------
  // filtered noise burst with an attack/decay envelope
  function noise({ dur = 0.15, vol = 0.4, type = 'lowpass', freq = 800, freqEnd = null, q = 0.7, pan = 0, delay = 0 }) {
    if (!ensure() || activeCount >= MAX_VOICES) return;
    const t = ctx.currentTime + delay;
    const src = ctx.createBufferSource();
    src.buffer = noiseBuf;
    src.playbackRate.value = 0.9 + Math.random() * 0.25;
    const f = ctx.createBiquadFilter();
    f.type = type; f.Q.value = q;
    f.frequency.setValueAtTime(Math.max(40, freq), t);
    if (freqEnd) f.frequency.exponentialRampToValueAtTime(Math.max(40, freqEnd), t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    let out = g;
    if (pan) { const p = ctx.createStereoPanner(); p.pan.value = pan; g.connect(p); out = p; }
    src.connect(f); f.connect(g); out.connect(master);
    src.start(t, Math.random() * 1.5, dur + 0.06);
    activeCount++;
    src.onended = () => { activeCount--; };
  }

  // oscillator with a pitch sweep and envelope (thuds, pings, pops)
  function tone({ dur = 0.1, vol = 0.3, freq = 200, freqEnd = null, type = 'sine', pan = 0, delay = 0 }) {
    if (!ensure() || activeCount >= MAX_VOICES) return;
    const t = ctx.currentTime + delay;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(Math.max(30, freq), t);
    if (freqEnd) o.frequency.exponentialRampToValueAtTime(Math.max(30, freqEnd), t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.003);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    let out = g;
    if (pan) { const p = ctx.createStereoPanner(); p.pan.value = pan; g.connect(p); out = p; }
    o.connect(g); out.connect(master);
    o.start(t); o.stop(t + dur + 0.03);
    activeCount++;
    o.onended = () => { activeCount--; };
  }

  const V   = a => a * (0.82 + Math.random() * 0.36);   // per-play volume variation
  const PAN = () => (Math.random() - 0.5) * 0.45;       // slight random stereo spread

  // --- footsteps ------------------------------------------------------------------
  // The "thud" is the foot hitting the ground; the "puff" characterizes the surface.
  function thud(vol = 0.2, freq = 95, pan = PAN()) {
    tone({ dur: 0.07, vol: V(vol), freq, freqEnd: freq * 0.45, type: 'sine', pan });
  }

  function footstep(surface) {
    switch (surface) {
      case 1: // grass — soft dry rustle + light thud
        noise({ dur: 0.09, vol: V(0.22), type: 'bandpass', freq: 2400, q: 0.8 });
        tone({ dur: 0.05, vol: V(0.07), freq: 1300 + Math.random() * 600, freqEnd: 700, type: 'triangle' });
        thud(0.14, 90);
        break;
      case 2: // dirt — muffled puff + solid thud
        noise({ dur: 0.1, vol: V(0.3), type: 'lowpass', freq: 650 });
        thud(0.24, 85);
        break;
      case 3: // stone — hard click + deeper thud
        noise({ dur: 0.045, vol: V(0.2), type: 'highpass', freq: 1900 });
        tone({ dur: 0.04, vol: V(0.1), freq: 3200 + Math.random() * 800, freqEnd: 1500, type: 'triangle' });
        thud(0.26, 78);
        break;
      case 4: // wood — hollow knock
        noise({ dur: 0.05, vol: V(0.14), type: 'bandpass', freq: 900, q: 2 });
        tone({ dur: 0.07, vol: V(0.2), freq: 210 + Math.random() * 60, freqEnd: 120, type: 'triangle' });
        thud(0.16, 80);
        break;
      case 5: // leaves — airy rustle, almost no thud
        noise({ dur: 0.14, vol: V(0.2), type: 'highpass', freq: 3200, q: 0.6 });
        noise({ dur: 0.1, vol: V(0.1), type: 'bandpass', freq: 5200, q: 0.7, delay: 0.03 });
        thud(0.07, 95);
        break;
      case 6: // sand — soft shushy swish
        noise({ dur: 0.16, vol: V(0.2), type: 'lowpass', freq: 850 });
        thud(0.1, 70);
        break;
      case 9: // cactus — dry rustle with a prickly tick
        noise({ dur: 0.08, vol: V(0.16), type: 'highpass', freq: 2400 });
        thud(0.08, 110);
        break;
      default:
        thud(0.2, 85);
    }
  }

  // --- block breaking -------------------------------------------------------------
  function gravel(vol = 0.12) {   // a few tiny high-frequency debris ticks
    for (let i = 0; i < 3; i++)
      noise({ dur: 0.03, vol: V(vol * 0.6), type: 'highpass', freq: 3500 + Math.random() * 2500, delay: 0.02 + i * (0.02 + Math.random() * 0.04) });
  }

  function breakBlock(id) {
    switch (id) {
      case 1: // grass — dirt burst with a grassy top
        noise({ dur: 0.2, vol: V(0.5), type: 'lowpass', freq: 900, freqEnd: 300 });
        noise({ dur: 0.1, vol: V(0.16), type: 'bandpass', freq: 2600, q: 0.8, delay: 0.01 });
        thud(0.35, 95); gravel();
        break;
      case 2: // dirt — big soft muffled burst
        noise({ dur: 0.24, vol: V(0.6), type: 'lowpass', freq: 700, freqEnd: 250 });
        thud(0.4, 80); gravel(0.1);
        break;
      case 3: { // stone — hard clink with metallic pings + dust
        noise({ dur: 0.09, vol: V(0.42), type: 'highpass', freq: 2600 });
        noise({ dur: 0.16, vol: V(0.3), type: 'bandpass', freq: 1100, q: 1.5, delay: 0.01 });
        const base = 900 + Math.random() * 500;
        tone({ dur: 0.12, vol: V(0.16), freq: base * 3.1, freqEnd: base * 2.4, type: 'sine' });
        tone({ dur: 0.18, vol: V(0.12), freq: base * 5.7, freqEnd: base * 4.2, type: 'sine', delay: 0.015 });
        thud(0.3, 70); gravel(0.16);
        break;
      }
      case 4: // wood — a couple of staggered cracks + knock
        noise({ dur: 0.05, vol: V(0.4), type: 'bandpass', freq: 520, q: 3 });
        noise({ dur: 0.06, vol: V(0.32), type: 'bandpass', freq: 380, q: 3, delay: 0.05 + Math.random() * 0.04 });
        tone({ dur: 0.1, vol: V(0.26), freq: 170 + Math.random() * 50, freqEnd: 90, type: 'triangle', delay: 0.01 });
        thud(0.28, 85);
        break;
      case 5: // leaves — light swishy rustle, no weight
        noise({ dur: 0.22, vol: V(0.3), type: 'highpass', freq: 2800 });
        noise({ dur: 0.16, vol: V(0.18), type: 'bandpass', freq: 5500, q: 0.6, delay: 0.04 });
        break;
      case 6: // sand — airy puff that settles
        noise({ dur: 0.32, vol: V(0.38), type: 'lowpass', freq: 750, freqEnd: 350 });
        thud(0.14, 65);
        break;
      case 9: // cactus — dry swishy crackle of bending spines
        noise({ dur: 0.12, vol: V(0.3), type: 'highpass', freq: 3400 });
        noise({ dur: 0.14, vol: V(0.22), type: 'bandpass', freq: 900, q: 3, delay: 0.03 });
        thud(0.18, 100); gravel();
        break;
      case 10: // tall grass - light dry swish (it snaps instantly, no weight)
        noise({ dur: 0.09, vol: V(0.26), type: 'highpass', freq: 2400 });
        break;
      default:
        noise({ dur: 0.2, vol: V(0.4), type: 'lowpass', freq: 800 });
        thud(0.3, 85);
    }
  }

  // --- block placing ----------------------------------------------------------------
  function place(id) {
    const pan = PAN();
    // the "thock": a short pitched knock that drops fast
    tone({ dur: 0.07, vol: V(0.4), freq: id === 3 ? 150 : 190 + Math.random() * 40, freqEnd: 80, type: 'sine', pan });
    noise({ dur: 0.05, vol: V(0.22), type: 'lowpass', freq: id === 3 ? 1600 : 900, pan });
    if (id === 3) tone({ dur: 0.08, vol: V(0.1), freq: 2400 + Math.random() * 600, freqEnd: 1600, type: 'sine', delay: 0.01, pan }); // stone clink
    if (id === 5) noise({ dur: 0.1, vol: V(0.14), type: 'highpass', freq: 3000, delay: 0.01, pan });                              // leaves swish
  }

  // --- movement ----------------------------------------------------------------------
  function jump() {
    noise({ dur: 0.12, vol: V(0.1), type: 'bandpass', freq: 500, freqEnd: 1400, q: 1 });   // soft whoosh up
  }

  // strength 0..1 (how hard you hit the ground)
  function land(strength) {
    const s = Math.max(0, Math.min(1, strength));
    thud(0.3 + 0.5 * s, 82 - 25 * s);
    noise({ dur: 0.1 + 0.15 * s, vol: V(0.25 + 0.45 * s), type: 'lowpass', freq: 600, freqEnd: 220 }); // dust kick-up
    if (s > 0.45) gravel(0.1 + 0.15 * s);
  }

  // --- mining ticks --------------------------------------------------------------------
  // short click per crack stage; gets sharper/louder as the block nears breaking
  function mineTick(id, stage, stages) {
    const p = stage / Math.max(1, stages - 1);
    if (id === 3) { // stone — metallic tap
      tone({ dur: 0.04, vol: V(0.08 + 0.12 * p), freq: 1600 + p * 1800 + Math.random() * 400, freqEnd: 900, type: 'sine' });
      noise({ dur: 0.03, vol: V(0.08 + 0.1 * p), type: 'highpass', freq: 3200 });
    } else if (id === 5) { // leaves — rustle tick
      noise({ dur: 0.05, vol: V(0.07 + 0.1 * p), type: 'highpass', freq: 2800 });
    } else { // soft material — dull tap
      tone({ dur: 0.04, vol: V(0.07 + 0.13 * p), freq: 260 + p * 120 + Math.random() * 50, freqEnd: 130, type: 'triangle' });
      noise({ dur: 0.035, vol: V(0.06 + 0.1 * p), type: 'bandpass', freq: id === 4 ? 700 : 1200, q: 2 });
    }
  }

  // --- UI -----------------------------------------------------------------------------
  function click() {   // hotbar slot select
    tone({ dur: 0.05, vol: V(0.16), freq: 850 + Math.random() * 150, freqEnd: 520, type: 'triangle' });
    noise({ dur: 0.025, vol: V(0.07), type: 'highpass', freq: 4000 });
  }

  // --- mob hits ------------------------------------------------------------------
  // each species yelps differently when smacked
  function cowHurt() {   // low, heavy mooing grunt + a puff of breath
    const f = 150 + Math.random() * 40;
    tone({ dur: 0.32, vol: V(0.3), freq: f, freqEnd: f * 0.55, type: 'sawtooth' });
    tone({ dur: 0.26, vol: V(0.1), freq: f * 2, freqEnd: f * 1.1, type: 'triangle', delay: 0.03 });
    noise({ dur: 0.14, vol: V(0.15), type: 'lowpass', freq: 500 });
  }
  function sheepHurt() {   // short "baa-baa": an up-blip then a falling tone
    const f = 270 + Math.random() * 60;
    tone({ dur: 0.14, vol: V(0.28), freq: f, freqEnd: f * 1.5, type: 'triangle' });
    tone({ dur: 0.2, vol: V(0.2), freq: f * 1.7, freqEnd: f * 0.95, type: 'sine', delay: 0.12 });
  }
  function chickenHurt() {   // sharp "cluck-cluck!"
    tone({ dur: 0.06, vol: V(0.24), freq: 880 + Math.random() * 250, freqEnd: 520, type: 'square' });
    noise({ dur: 0.035, vol: V(0.12), type: 'highpass', freq: 3600, delay: 0.045 });
  }
  function mobHurt(type) { if (type === 'cow') cowHurt(); else if (type === 'sheep') sheepHurt(); else chickenHurt(); }

    // cactus spines poking you - a sharp raspy burst + tickle of high frequencies
    function cactusHurt() {
      noise({ dur: 0.14, vol: V(0.35), type: 'highpass', freq: 2800, q: 1 });
      noise({ dur: 0.08, vol: V(0.2), type: 'bandpass', freq: 6200, q: 2, delay: 0.03 });
    }

    // --- player hurt ---------------------------------------------------------------
    function hurt() {   // a low "oof" grunt when the player takes damage (drowning, falls...)
      const f = 300 + Math.random() * 70;
      tone({ dur: 0.18, vol: V(0.3), freq: f, freqEnd: f * 0.5, type: 'sawtooth' });
      tone({ dur: 0.12, vol: V(0.12), freq: f * 0.6, freqEnd: f * 0.4, type: 'square', delay: 0.02 });
    }

    // --- eating -------------------------------------------------------------------
    function eat() {   // loud, unmistakable chewing: a deep "munch" thump per chew + bright crunchy snaps on top
      const chews = 5;
      for (let i = 0; i < chews; i++) {
        const d = i * 0.12;                                   // stagger the chews across ~600ms so they read as separate bites
        tone({ dur: 0.1, vol: V(0.5), freq: 340 + Math.random() * 80 - i * 20, freqEnd: 170, type: 'triangle' });   // wet low chew body
        noise({ dur: 0.05, vol: V(0.6), type: 'highpass', freq: 3200 + Math.random() * 900, q: 0.8, delay: d });    // the crunchy snap (meat fibres snapping)
        noise({ dur: 0.07, vol: V(0.45), type: 'bandpass', freq: 1300 + Math.random() * 500, q: 1.4, delay: d });   // mid-range chewy crunch
      }
    }

      // one single chewing bite - fired repeatedly while the player holds food in their mouth (see updateEat)
      function chew() {
        const f = 300 + Math.random() * 120;
        tone({ dur: 0.08, vol: V(0.5), freq: f, freqEnd: f * 0.45, type: 'triangle' });          // low wet munch
        noise({ dur: 0.05, vol: V(0.6), type: 'highpass', freq: 3000 + Math.random() * 1000, q: 0.9 });   // bright crunch snap
      }

  return { unlock, footstep, breakBlock, place, jump, land, mineTick, click, mobHurt, cactusHurt, hurt, eat, chew };
})();
export default SFX;
