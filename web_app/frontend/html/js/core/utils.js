/* ============================================================================
 * CORE MODULE: UTILITIES & SVG ICON GENERATORS
 * Các hàm tiện ích dùng chung (HTML escape, format thời gian, ngày tháng & SVG)
 * ============================================================================ */
(function (global) {
  function escapeHtml(str) {
    if (!str) return "";
    return String(str).replace(/[&<>"']/g, function (m) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m];
    });
  }

  function formatUptime(seconds) {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    if (h > 0) return `${h}g ${m}p`;
    return `${m}p ${s}s`;
  }

  function formatTimeAgo(isoString) {
    const diff = Math.floor((Date.now() - new Date(isoString).getTime()) / 1000);
    if (isNaN(diff) || diff < 0) return "Vừa xong";
    if (diff < 60) return "Vừa xong";
    if (diff < 3600) return `${Math.floor(diff / 60)} phút trước`;
    if (diff < 86400) return `${Math.floor(diff / 3600)} giờ trước`;
    return `${Math.floor(diff / 86400)} ngày trước`;
  }

  function updateLiveDate() {
    const el = document.getElementById("live-weather-date");
    if (!el) return;
    const now = new Date();
    const days = ["Chủ Nhật", "Thứ 2", "Thứ 3", "Thứ 4", "Thứ 5", "Thứ 6", "Thứ 7"];
    const d = String(now.getDate()).padStart(2, "0");
    const m = String(now.getMonth() + 1).padStart(2, "0");
    const y = now.getFullYear();
    el.innerText = `${days[now.getDay()]}, ${d}/${m}/${y}`;
  }

  // ── SVG ICONS CHUẨN HUNONIC ─────────────────────────────────────────────────
  function getIrHubHexSvg() {
    return `
      <svg width="38" height="38" viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M20 2.5L35.5 11.45V29.35L20 38.3L4.5 29.35V11.45L20 2.5Z" fill="#383e48"/>
        <circle cx="20" cy="20.4" r="5" fill="#ef4444" opacity="0.95"/>
        <circle cx="20" cy="20.4" r="2.2" fill="#7f1d1d"/>
      </svg>
    `;
  }

  function getGatewayHexSvg() {
    return `
      <svg width="38" height="38" viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M20 2.5L35.5 11.45V29.35L20 38.3L4.5 29.35V11.45L20 2.5Z" fill="#00b06f"/>
        <rect x="14" y="14.4" width="12" height="12" rx="2.5" fill="#ffffff"/>
        <rect x="17" y="17.4" width="6" height="6" rx="1.2" fill="#00b06f"/>
        <line x1="20" y1="10" x2="20" y2="14.4" stroke="#ffffff" stroke-width="1.8" stroke-linecap="round"/>
        <line x1="20" y1="26.4" x2="20" y2="30.8" stroke="#ffffff" stroke-width="1.8" stroke-linecap="round"/>
        <line x1="9.6" y1="20.4" x2="14" y2="20.4" stroke="#ffffff" stroke-width="1.8" stroke-linecap="round"/>
        <line x1="26" y1="20.4" x2="30.4" y2="20.4" stroke="#ffffff" stroke-width="1.8" stroke-linecap="round"/>
      </svg>
    `;
  }

  function getAcUnitSvg(isOnline, isChildOn) {
    const ledColor = (!isOnline) ? "#94a3b8" : (isChildOn ? "#00b06f" : "#94a3b8");
    return `
      <svg width="46" height="26" viewBox="0 0 46 26" fill="none" xmlns="http://www.w3.org/2000/svg" class="ac-indoor-svg">
        <rect x="1" y="2" width="44" height="22" rx="4" fill="#F8FAFC" stroke="#CBD5E1" stroke-width="1.4"/>
        <line x1="5" y1="6" x2="41" y2="6" stroke="#E2E8F0" stroke-width="1"/>
        <rect x="5" y="17" width="36" height="3.5" rx="1.5" fill="#E2E8F0"/>
        <circle cx="39" cy="11.5" r="1.8" fill="${ledColor}"/>
      </svg>
    `;
  }

  function getSensorHexSvg() {
    return `
      <svg width="38" height="38" viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M20 2.5L35.5 11.45V29.35L20 38.3L4.5 29.35V11.45L20 2.5Z" fill="#8b5cf6"/>
        <circle cx="20" cy="20.4" r="4.5" fill="#ffffff"/>
        <path d="M16 16.4C18 14.4 22 14.4 24 16.4M13 13.4C17 9.4 23 9.4 27 13.4" stroke="#ffffff" stroke-width="1.5" stroke-linecap="round"/>
      </svg>
    `;
  }

  function getRelayHexSvg(isOn) {
    const color = isOn ? "#eab308" : "#64748b";
    return `
      <svg width="38" height="38" viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M20 2.5L35.5 11.45V29.35L20 38.3L4.5 29.35V11.45L20 2.5Z" fill="${color}"/>
        <path d="M20 12.4V24.4M15 18.4L20 12.4L25 18.4" stroke="#ffffff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
    `;
  }

  function getPzemHexSvg() {
    return `
      <svg width="38" height="38" viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M20 2.5L35.5 11.45V29.35L20 38.3L4.5 29.35V11.45L20 2.5Z" fill="#f59e0b"/>
        <path d="M21.5 10L13.5 22H19.5L18.5 30L26.5 18H20.5L21.5 10Z" fill="#ffffff" stroke="#ffffff" stroke-width="1.2" stroke-linejoin="round"/>
      </svg>
    `;
  }

  function getWifiHunonicSvg(isOnline) {
    const color = isOnline ? "#00b06f" : "#94a3b8";
    return `
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round" class="wifi-icon-hunonic ${isOnline ? '' : 'offline'}">
        <path d="M5 12.55a11 11 0 0 1 14.08 0"></path>
        <path d="M1.42 9a16 16 0 0 1 21.16 0"></path>
        <path d="M8.53 16.11a6 6 0 0 1 6.95 0"></path>
        <line x1="12" y1="20" x2="12.01" y2="20" stroke-width="3"></line>
        ${!isOnline ? `<line x1="2" y1="2" x2="22" y2="22" stroke="#ef4444" stroke-width="2.5"></line>` : ''}
      </svg>
    `;
  }

  global.escapeHtml = escapeHtml;
  global.formatUptime = formatUptime;
  global.formatTimeAgo = formatTimeAgo;
  global.updateLiveDate = updateLiveDate;
  global.getIrHubHexSvg = getIrHubHexSvg;
  global.getGatewayHexSvg = getGatewayHexSvg;
  global.getAcUnitSvg = getAcUnitSvg;
  global.getSensorHexSvg = getSensorHexSvg;
  global.getRelayHexSvg = getRelayHexSvg;
  global.getPzemHexSvg = getPzemHexSvg;
  global.getWifiHunonicSvg = getWifiHunonicSvg;
})(window);
