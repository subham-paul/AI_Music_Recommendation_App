// static/js/voice.js
// Robust WebAudio voice emotion detector + optional TF.js model support.
// - Calibrates quiet baseline to avoid false "tired/sad" on quiet mics
// - Uses RMS, pitch (autocorrelation) and spectral centroid as features
// - Optional TF.js model: set window.VOICE_MODEL_URL to a tfjs model.json that
//   accepts a 2D input [ [rms, pitch, centroid] ] and outputs softmax over classes.
// - Exposes: initVoiceCapture(), stopVoice(), getVoiceMood(), VOICE_CALIBRATE_NOW()
// - Configure labels via window.VOICE_MODEL_LABELS (array of class names)
// - Toggle verbose debug via window.VOICE_DEBUG = true

(() => {
  const CONF = {
    smoothingAlpha: 0.18,          // smoothing factor for features (0..1)
    updateIntervalMs: 140,         // processing interval
    rmsExcitedThreshold: 0.06,     // heuristic threshold (will be adjusted by calibration)
    rmsSadThreshold: 0.015,
    pitchHighThreshold: 230,       // Hz
    pitchLowThreshold: 120,        // Hz
    spectralCentroidExcited: 2600,
    minConfidenceToPublish: 0.52,  // for TF model decisions
    fallbackConfidence: 0.62       // heuristics: require stronger signal to change
  };

  // runtime state
  let audioCtx = null;
  let analyser = null;
  let source = null;
  let micStream = null;
  let running = false;
  let rafTimer = null;

  // smoothing state
  let smoothState = { rms: 0, pitch: 0, centroid: 0 };

  // baseline calibration for RMS/pitch/centroid (helps with quiet mics)
  let calib = { collecting: false, start: 0, count: 0, sum: {}, sumsq: {} };
  let BASE = window.VOICE_BASELINE || null;
  window.VOICE_BASELINE = BASE;

  // tf model
  let tfModel = null;
  let tfReady = false;

  // mood state
  let currentLabel = 'idle';
  window.VOICE_DEBUG = window.VOICE_DEBUG || false;

  // user configurable labels (for TF model mapping)
  // default order: neutral, happy, sad, angry, excited, tired, stressed
  window.VOICE_MODEL_LABELS = window.VOICE_MODEL_LABELS || ['neutral','happy','sad','angry','excited','tired','stressed'];

  function dbg(...a){ if (window.VOICE_DEBUG) console.log('[voice.js]', ...a); }

  // ---------- math helpers ----------
  function smooth(key, value){
    const a = window.VOICE_SMOOTH_ALPHA || CONF.smoothingAlpha;
    smoothState[key] = (smoothState[key] !== undefined) ? (smoothState[key] * (1 - a) + value * a) : value;
    return smoothState[key];
  }

  function computeRMS(buf){
    // digit-by-digit sum for correctness
    let s = 0;
    for (let i=0;i<buf.length;i++){
      const v = buf[i];
      s += v * v;
    }
    return Math.sqrt(s / buf.length);
  }

  // robust autocorrelation pitch detection (returns Hz or -1)
  function autoCorrelate(buf, sampleRate){
    // from classic pitch detection (C. Wilson) adapted
    const SIZE = buf.length;
    let rms = 0;
    for (let i=0;i<SIZE;i++){ const v = buf[i]; rms += v*v; }
    rms = Math.sqrt(rms / SIZE);
    if (rms < 0.01) return -1;

    let r1=0, r2=SIZE-1, thres=0.2;
    for (let i=0;i<SIZE/2;i++){
      if (Math.abs(buf[i]) < thres){ r1=i; break; }
    }
    for (let i=1;i<SIZE/2;i++){
      if (Math.abs(buf[SIZE - i]) < thres){ r2 = SIZE - i; break; }
    }
    buf = buf.slice(r1, r2);
    const newSize = buf.length;
    const c = new Array(newSize).fill(0);
    for (let i=0;i<newSize;i++){
      for (let j=0;j<newSize - i;j++){
        c[i] += buf[j] * buf[j+i];
      }
    }
    let d = 0;
    while (c[d] > c[d+1]) d++;
    let maxval=-1, maxpos=-1;
    for (let i=d;i<newSize;i++){
      if (c[i] > maxval){ maxval = c[i]; maxpos = i; }
    }
    let T0 = maxpos;
    if (!T0) return -1;
    const x1 = c[T0-1], x2=c[T0], x3=c[T0+1];
    const a = (x1 + x3 - 2*x2)/2;
    const b = (x3 - x1)/2;
    if (a) T0 = T0 - b/(2*a);
    return sampleRate / T0;
  }

  function calcSpectralCentroid(freqData, sampleRate){
    let num=0, den=0;
    const N = freqData.length;
    for (let i=0;i<N;i++){
      const mag = freqData[i];
      const freq = (i / N) * (sampleRate / 2);
      num += freq * mag;
      den += mag;
    }
    return den ? (num/den) : 0;
  }

  // ---------- calibration ----------
  function beginCalibration(){
    calib = { collecting:true, start: Date.now(), count:0, sum:{}, sumsq:{} };
    dbg('voice calibration started for 2s');
    setTimeout(()=> finalizeCalibration(), 2000 + 40);
  }

  function accumulateCalibration(metrics){
    if (!calib.collecting) return;
    calib.count = (calib.count || 0) + 1;
    for (const k in metrics){
      const v = metrics[k] === undefined ? 0 : metrics[k];
      calib.sum[k] = (calib.sum[k] || 0) + v;
      calib.sumsq[k] = (calib.sumsq[k] || 0) + v*v;
    }
  }

  function finalizeCalibration(){
    if (!calib.collecting) return;
    if (!calib.count){ calib.collecting = false; dbg('calib: no samples'); return; }
    const mean = {}, std = {};
    for (const k in calib.sum){
      const n = calib.count;
      mean[k] = calib.sum[k] / n;
      const variance = Math.max(0, (calib.sumsq[k] / n) - (mean[k] * mean[k]));
      std[k] = Math.sqrt(variance);
    }
    BASE = { mean, std, ts: Date.now() };
    window.VOICE_BASELINE = BASE;
    calib.collecting = false;
    dbg('voice calibration done', BASE);
    // adjust heuristic thresholds based on baseline (helps adapt to mic sensitivity)
    if (BASE.mean && BASE.mean.rms !== undefined){
      const baseRms = BASE.mean.rms;
      CONF.rmsExcitedThreshold = Math.max(0.02, baseRms * 2.5);
      CONF.rmsSadThreshold = Math.max(0.007, baseRms * 0.6);
      dbg('adjusted rms thresholds', CONF.rmsExcitedThreshold, CONF.rmsSadThreshold);
    }
  }

  window.VOICE_CALIBRATE_NOW = () => { beginCalibration(); };

  // ---------- TF model loader ----------
  async function tryLoadTfModel(url){
    if (!url) return null;
    try {
      if (typeof tf === 'undefined'){
        await new Promise((res,rej)=>{
          const s = document.createElement('script');
          s.src = 'https://cdn.jsdelivr.net/npm/@tensorflow/tfjs@4.10.0/dist/tf.min.js';
          s.onload = res; s.onerror = rej; document.head.appendChild(s);
        });
      }
      dbg('loading TF model from', url);
      const model = await tf.loadLayersModel(url);
      dbg('TF model loaded');
      return model;
    } catch (e){
      console.warn('Failed to load TF model', e);
      return null;
    }
  }

  // ---------- main capture & processing ----------
  async function initVoiceCapture(){
    if (running) return;
    try {
      // attempt load model if provided
      if (window.VOICE_MODEL_URL && !tfModel){
        tfModel = await tryLoadTfModel(window.VOICE_MODEL_URL).catch(()=>null);
        if (tfModel) tfReady = true;
      }

      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      analyser = audioCtx.createAnalyser();
      analyser.fftSize = 2048;
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      micStream = stream;
      source = audioCtx.createMediaStreamSource(stream);
      source.connect(analyser);

      // prepare buffers
      const timeBuf = new Float32Array(analyser.fftSize);
      const freqBuf = new Uint8Array(analyser.frequencyBinCount);
      const sampleRate = audioCtx.sampleRate;

      running = true;
      // start calibration automatically for 2 seconds to learn quiet baseline
      beginCalibration();

      // processing loop using setTimeout (not heavy)
      async function step(){
        if (!running) return;
        analyser.getFloatTimeDomainData(timeBuf);
        analyser.getByteFrequencyData(freqBuf);

        const rmsRaw = computeRMS(timeBuf);
        const pitchRaw = autoCorrelate(timeBuf, sampleRate);
        const centroidRaw = calcSpectralCentroid(freqBuf, sampleRate);

        const rms = smooth('rms', rmsRaw);
        const pitch = smooth('pitch', (pitchRaw > 0 ? pitchRaw : 0));
        const centroid = smooth('centroid', centroidRaw);

        // accumulate for calibration if active
        accumulateCalibration({ rms, pitch, centroid });

        // default label via heuristics
        let label = classifyVoiceHeuristic(rms, pitch, centroid);

        // if TF model exists, use it for a more reliable prediction
        if (tfModel && tfReady){
          try {
            // model expects [ [rms, pitch, centroid] ] as input (2D tensor)
            // IMPORTANT: exported TF model must have been trained to accept this feature vector.
            const inputTensor = tf.tensor2d([[rms, pitch || 0, centroid || 0]]);
            let out = tfModel.predict(inputTensor);
            // try to read probabilities (handle various shapes)
            let probs;
            if (Array.isArray(out)) out = out[0];
            if (out.arraySync) {
              probs = out.arraySync();
            } else if (out.dataSync) {
              probs = Array.from(out.dataSync());
            } else {
              probs = null;
            }
            inputTensor.dispose();
            if (probs && probs.length){
              // if model output shape is [1, N], flatten
              if (probs.length === 1 && Array.isArray(probs[0])) probs = probs[0];
              // pick best index
              let maxIdx = 0, maxVal = -Infinity;
              for (let i=0;i<probs.length;i++){
                if (probs[i] > maxVal){ maxVal = probs[i]; maxIdx = i; }
              }
              const labels = window.VOICE_MODEL_LABELS || ['neutral','happy','sad','angry','excited','tired','stressed'];
              const predicted = (labels[maxIdx] || 'neutral').toLowerCase();
              // require minimum probability to accept TF prediction
              if (maxVal >= (CONF.minConfidenceToPublish || 0.52)){
                label = predicted;
              } else {
                // otherwise, keep heuristic label but increase confidence requirement for switching
                dbg('TF low confidence', maxVal.toFixed(3), 'keeping heuristic:', label);
              }
            }
          } catch (e){
            console.warn('TF inference failed:', e);
          }
        }

        publishVoiceMood(label, { rms, pitch, centroid });

        // draw waveform handled elsewhere (UI)
        rafTimer = setTimeout(step, CONF.updateIntervalMs);
      }

      step();
    } catch (err){
      console.error('initVoiceCapture error', err);
      running = false;
      stopVoice(); // cleanup
    }
  }

  function stopVoice(){
    running = false;
    if (rafTimer) { clearTimeout(rafTimer); rafTimer = null; }
    try {
      if (micStream){
        micStream.getTracks().forEach(t => t.stop());
        micStream = null;
      }
      if (audioCtx){
        audioCtx.close();
        audioCtx = null;
        analyser = null;
        source = null;
      }
    } catch (e){ console.warn('stopVoice cleanup failed', e); }
    currentLabel = 'stopped';
    const el = document.getElementById('voiceMood');
    if (el) el.innerText = 'stopped';
    if (typeof window.updateVoiceMood === 'function') window.updateVoiceMood('stopped');
  }

  // heuristic classifier (improved)
  function classifyVoiceHeuristic(rms, pitch, centroid){
    // normalized features relative to baseline if available
    const base = BASE && BASE.mean ? BASE.mean : null;
    const rmsAdj = base ? (rms - (base.rms || 0)) : rms;
    const pitchAdj = pitch; // pitch baseline less useful
    const centroidAdj = base ? (centroid - (base.centroid || 0)) : centroid;

    // rules (conservative)
    // excited: RMS significantly above baseline OR pitch high
    if ((rmsAdj > Math.max(CONF.rmsExcitedThreshold, (base ? base.rms * 1.8 : CONF.rmsExcitedThreshold))) && pitchAdj > CONF.pitchHighThreshold) return 'excited';
    if ((rmsAdj > (CONF.rmsExcitedThreshold * 1.25)) && centroidAdj > CONF.spectralCentroidExcited) return 'angry';
    // sad/tired: low RMS relative to baseline and low pitch
    if ((rmsAdj < Math.min(CONF.rmsSadThreshold, (base ? base.rms * 0.7 : CONF.rmsSadThreshold))) && pitchAdj > 0 && pitchAdj < CONF.pitchLowThreshold && centroidAdj < 1200) return 'sad';
    if ((rmsAdj < Math.min(CONF.rmsSadThreshold, (base ? base.rms * 0.7 : CONF.rmsSadThreshold))) && pitchAdj > 0 && pitchAdj < CONF.pitchLowThreshold) return 'tired';
    if (rmsAdj > CONF.rmsExcitedThreshold) return 'happy';
    return 'neutral';
  }

  // publish mood to UI and backend (debounced via internal state)
  let lastPublished = { label: null, ts: 0 };
  function publishVoiceMood(label, features){
    const now = Date.now();
    // require change and some time gap, or forced update
    const different = label !== currentLabel;
    // Heuristic: if using heuristics and label is not neutral require stronger gate
    const gateOk = true; // we already guard via thresholds and TF confidence

    if (different && gateOk){
      // small debounce to prevent flapping
      if (now - lastPublished.ts < 350) {
        // fast updates suppressed
      } else {
        currentLabel = label;
        lastPublished = { label, ts: now };
        const el = document.getElementById('voiceMood');
        if (el) el.innerText = label;
        if (typeof window.updateVoiceMood === 'function') window.updateVoiceMood(label);

        // send to backend (non-blocking)
        fetch('/api/mood', {
          method: 'POST',
          headers: {'Content-Type': 'application/json'},
          body: JSON.stringify({ mood: label, source: 'voice' })
        }).catch(()=>{});
      }
    } else {
      // even if same label, update UI values if needed
      const el = document.getElementById('voiceLevel');
      if (el) el.innerText = (features && features.rms) ? features.rms.toFixed(3) : '—';
    }
  }

  function getVoiceMood(){
    return currentLabel;
  }

  // Expose public functions
  window.initVoiceCapture = initVoiceCapture;
  window.stopVoice = stopVoice;
  window.getVoiceMood = getVoiceMood;
  window.VOICE_CALIBRATE_NOW = () => beginCalibration();

})();
