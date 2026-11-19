/* ============================================================================
 * CORE MODULE: UI FEEDBACK (TOAST NOTIFICATIONS & CUSTOM CONFIRM MODAL)
 * ============================================================================ */
(function (global) {
  function showToast(message, type = "info", duration = 3500) {
    const container = document.getElementById("toast-container");
    if (!container) return;
    const toast = document.createElement("div");
    toast.className = `toast ${type}`;
    toast.innerHTML = `<span>${message}</span>`;
    container.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = "0";
      toast.style.transform = "translateX(20px)";
      toast.style.transition = "all 0.3s ease";
      setTimeout(() => toast.remove(), 300);
    }, duration);
  }

  function showConfirmModal({
    title = "Xác nhận thao tác",
    message = "Bạn có chắc chắn muốn thực hiện hành động này?",
    confirmText = "Xác nhận",
    cancelText = "Hủy bỏ",
    type = "danger",
    icon = null
  } = {}) {
    return new Promise((resolve) => {
      const overlay = document.getElementById("custom-confirm-overlay");
      const iconEl = document.getElementById("custom-confirm-icon");
      const titleEl = document.getElementById("custom-confirm-title");
      const msgEl = document.getElementById("custom-confirm-msg");
      const btnCancel = document.getElementById("custom-confirm-cancel");
      const btnOk = document.getElementById("custom-confirm-ok");

      if (!overlay || !btnCancel || !btnOk) {
        resolve(window.confirm(message));
        return;
      }

      const defaultIcons = {
        danger: "fa-trash-can",
        warning: "fa-power-off",
        info: "fa-cloud-arrow-up"
      };
      const faIcon = icon || defaultIcons[type] || "fa-circle-question";

      if (iconEl) {
        iconEl.className = `custom-confirm-icon ${type}`;
        iconEl.innerHTML = `<i class="fa-solid ${faIcon}"></i>`;
      }
      if (titleEl) titleEl.innerText = title;
      if (msgEl) msgEl.innerText = message;
      btnCancel.innerText = cancelText;
      btnOk.innerText = confirmText;
      btnOk.className = `custom-confirm-btn confirm ${type}`;

      let settled = false;
      const cleanup = (result) => {
        if (settled) return;
        settled = true;
        overlay.classList.remove("open");
        overlay.setAttribute("aria-hidden", "true");
        btnCancel.removeEventListener("click", onCancel);
        btnOk.removeEventListener("click", onOk);
        overlay.removeEventListener("click", onBackdrop);
        document.removeEventListener("keydown", onKeyDown);
        resolve(result);
      };

      const onCancel = () => cleanup(false);
      const onOk = () => cleanup(true);
      const onBackdrop = (e) => { if (e.target === overlay) cleanup(false); };
      const onKeyDown = (e) => {
        if (e.key === "Escape") cleanup(false);
        else if (e.key === "Enter") { e.preventDefault(); cleanup(true); }
      };

      btnCancel.addEventListener("click", onCancel);
      btnOk.addEventListener("click", onOk);
      overlay.addEventListener("click", onBackdrop);
      document.addEventListener("keydown", onKeyDown);

      overlay.classList.add("open");
      overlay.setAttribute("aria-hidden", "false");
    });
  }

  global.showToast = showToast;
  global.showConfirmModal = showConfirmModal;
})(window);
