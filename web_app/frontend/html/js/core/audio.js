/* ============================================================================
 * CORE MODULE: WEB AUDIO CHIME (ÂM THANH CẢNH BÁO HIỆN DIỆN)
 * Không cần file MP3 ngoài, tổng hợp chuông 3 nốt trong trẻo qua Web Audio API
 * ============================================================================ */
(function (global) {
  let presenceAudioCtx = null;

  function isPresenceSoundEnabled() {
    return localStorage.getItem("gate_presence_sound") !== "false";
  }

  function ensurePresenceAudioCtx() {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return null;
    if (!presenceAudioCtx) {
      presenceAudioCtx = new AudioCtx();
    }
    if (presenceAudioCtx.state === "suspended") {
      presenceAudioCtx.resume().catch(() => {});
    }
    return presenceAudioCtx;
  }

  // Mở khóa AudioContext ngay khi người dùng tương tác lần đầu (chính sách Autoplay)
  ["click", "touchstart", "keydown"].forEach(evtName => {
    document.addEventListener(evtName, () => {
      if (isPresenceSoundEnabled()) ensurePresenceAudioCtx();
    }, { once: true, passive: true });
  });

  function playPresenceAlertSound(force = false) {
    if (!force && !isPresenceSoundEnabled()) return;
    try {
      const ctx = ensurePresenceAudioCtx();
      if (!ctx) return;

      const playNotes = () => {
        const now = ctx.currentTime;
        const notes = [
          { freq: 1046.50, start: 0.00, dur: 0.18, vol: 0.24 }, // C6
          { freq: 1318.51, start: 0.13, dur: 0.18, vol: 0.24 }, // E6
          { freq: 1567.98, start: 0.26, dur: 0.38, vol: 0.28 }  // G6
        ];

        notes.forEach(n => {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = "sine";
          osc.frequency.setValueAtTime(n.freq, now + n.start);

          gain.gain.setValueAtTime(0.0001, now + n.start);
          gain.gain.linearRampToValueAtTime(n.vol, now + n.start + 0.015);
          gain.gain.exponentialRampToValueAtTime(0.0001, now + n.start + n.dur);

          osc.connect(gain);
          gain.connect(ctx.destination);
          osc.start(now + n.start);
          osc.stop(now + n.start + n.dur + 0.02);
        });
      };

      if (ctx.state === "suspended") {
        ctx.resume().then(playNotes).catch(() => {});
      } else {
        playNotes();
      }
    } catch (err) {
      console.warn("Không thể phát âm thanh thông báo:", err);
    }
  }

  function updatePresenceSoundButtonUI() {
    const btn = document.getElementById("btn-toggle-presence-sound");
    const icon = document.getElementById("presence-sound-icon");
    if (!btn || !icon) return;
    const enabled = isPresenceSoundEnabled();
    if (enabled) {
      icon.className = "fa-solid fa-volume-high";
      icon.style.color = "#00b06f";
      btn.title = "Âm thanh báo có người: Đang BẬT (Bấm để tắt)";
    } else {
      icon.className = "fa-solid fa-volume-xmark";
      icon.style.color = "#94a3b8";
      btn.title = "Âm thanh báo có người: Đang TẮT (Bấm để bật)";
    }
  }

  document.addEventListener("DOMContentLoaded", () => {
    const btnToggle = document.getElementById("btn-toggle-presence-sound");
    if (!btnToggle) return;
    updatePresenceSoundButtonUI();
    btnToggle.addEventListener("click", () => {
      const next = !isPresenceSoundEnabled();
      localStorage.setItem("gate_presence_sound", next ? "true" : "false");
      updatePresenceSoundButtonUI();
      if (next) {
        playPresenceAlertSound(true);
        if (typeof global.showToast === "function") {
          global.showToast("Đã BẬT âm thanh báo khi có người!", "success", 2500);
        }
      } else if (typeof global.showToast === "function") {
        global.showToast("Đã TẮT âm thanh báo khi có người.", "info", 2500);
      }
    });
  });

  global.isPresenceSoundEnabled = isPresenceSoundEnabled;
  global.playPresenceAlertSound = playPresenceAlertSound;
  global.updatePresenceSoundButtonUI = updatePresenceSoundButtonUI;
})(window);
