// static/js/face.js
// Teachable Machine (TF.js) Face Emotion Detector
// 100% ML-based, NO heuristics
// You just plug your Teachable Machine model URL and everything works.

(async () => {
  // =========================
  // 1. CONFIGURATION
  // =========================
  window.FACE_DEBUG = false;

  // 🔥 PUT YOUR MODEL URL HERE
  // Example: "https://teachablemachine.withgoogle.com/models/XYZ123/"
  window.TM_MODEL_URL = "https://teachablemachine.withgoogle.com/models/3oLfZn_Aj/";

  if (!window.TM_MODEL_URL) {
    console.error("Teachable Machine model URL missing");
  }

  // =========================
  // 2. GLOBALS
  // =========================
  let model, maxPredictions;
  let webcamStream;
  let animFrame;
  let currentMood = "neutral";
  let ready = false;

  const video = document.getElementById("camPreview");

  function log(...a) {
    if (window.FACE_DEBUG) console.log("[TM-FACE]", ...a);
  }

  // =========================
  // 3. LOAD TF + MODEL
  // =========================
  async function loadModel() {
    const url = window.TM_MODEL_URL;
    const modelURL = url + "model.json";
    const metadataURL = url + "metadata.json";

    model = await tmImage.load(modelURL, metadataURL);
    maxPredictions = model.getTotalClasses();
    ready = true;

    console.log("Teachable Machine model loaded:", maxPredictions, "classes");
  }

  // load TF + tmImage library
  async function loadLibraries() {
    if (!window.tf) {
      await new Promise((resolve, reject) => {
        const s = document.createElement("script");
        s.src = "https://cdn.jsdelivr.net/npm/@tensorflow/tfjs@4.10.0/dist/tf.min.js";
        s.onload = resolve;
        s.onerror = reject;
        document.head.appendChild(s);
      });
    }

    if (!window.tmImage) {
      await new Promise((resolve, reject) => {
        const s = document.createElement("script");
        s.src = "https://cdn.jsdelivr.net/npm/@teachablemachine/image@0.8/dist/teachablemachine-image.min.js";
        s.onload = resolve;
        s.onerror = reject;
        document.head.appendChild(s);
      });
    }

    log("TF.js + TM libraries loaded");
  }

  // =========================
  // 4. START CAMERA
  // =========================
  async function startCamera() {
    await loadLibraries();
    await loadModel();

    webcamStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: "user", width: 640, height: 480 },
      audio: false
    });

    video.srcObject = webcamStream;
    await video.play();

    detectLoop();
  }

  // =========================
  // 5. PREDICT LOOP
  // =========================
  async function detectLoop() {
    animFrame = requestAnimationFrame(detectLoop);

    if (!ready) return;
    if (!model) return;

    const predictions = await model.predict(video);

    let best = { label: "neutral", prob: 0 };

    predictions.forEach(p => {
      if (p.probability > best.prob) {
        best = { label: p.className.toLowerCase(), prob: p.probability };
      }
    });

    updateMood(best.label, best.prob);
  }

  // =========================
  // 6. UPDATE UI + Backend
  // =========================
  function updateMood(label, prob) {
    if (label !== currentMood && prob >= 0.55) {  
      currentMood = label;

      const el = document.getElementById("faceMood");
      if (el) el.innerText = currentMood;

      // update dashboard if defined
      if (typeof window.updateFaceMood === "function") {
        window.updateFaceMood(currentMood);
      }

      // send mood to backend
      fetch("/api/mood", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mood: currentMood, source: "face" })
      });
    }
  }

  // =========================
  // 7. STOP CAMERA
  // =========================
  function stopCamera() {
    cancelAnimationFrame(animFrame);
    if (webcamStream) {
      webcamStream.getTracks().forEach(t => t.stop());
    }
    currentMood = "off";
    const el = document.getElementById("faceMood");
    if (el) el.innerText = "off";
  }

  // =========================
  // 8. EXPOSE PUBLIC API
  // =========================
  window.startCamera = startCamera;
  window.stopCamera = stopCamera;
  window.getFaceMood = () => currentMood;

})();
