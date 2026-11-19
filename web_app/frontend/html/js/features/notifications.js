/* ============================================================================
 * FEATURE MODULE: NOTIFICATION CENTER & ALERTS ENGINE
 * Quản lý lịch sử thông báo, bộ lọc loại cảnh báo và huy hiệu chưa đọc
 * ============================================================================ */
(function (global) {
  document.addEventListener("DOMContentLoaded", () => {
  // ==============================================================================
  // TRUNG TÂM THÔNG BÁO & CẢNH BÁO (NOTIFICATION CENTER ENGINE)
  // ==============================================================================
  const viewNotifications = document.getElementById("view-notifications");
  const navNotifsBtn = document.getElementById("nav-notifs");
  const btnTopbarNotifs = document.getElementById("btn-topbar-notifs");
  const btnNotifsBack = document.getElementById("btn-notifs-back");
  const btnMarkAllRead = document.getElementById("btn-mark-all-read");
  const btnClearAllNotifs = document.getElementById("btn-clear-all-notifs");
  const notifFilterTabs = document.getElementById("notif-filter-tabs");
  const notifCardsList = document.getElementById("notif-cards-list");
  const sidebarNotifBadge = document.getElementById("sidebar-notif-badge");
  const topbarNotifBadge = document.getElementById("topbar-notif-badge");

  const NOTIF_STORAGE_KEY = "gate_system_notifications";
  let currentNotifFilter = "all";

  const DEFAULT_NOTIFICATIONS = [];

  function getStoredNotifications() {
    try {
      if (localStorage.getItem("gate_notifs_v3") !== "true") {
        localStorage.setItem("gate_notifs_v3", "true");
        let stored = localStorage.getItem(NOTIF_STORAGE_KEY);
        if (stored) {
          let list = JSON.parse(stored);
          if (Array.isArray(list)) {
            list = list.filter(n => n.id && !n.id.startsWith("notif_default_"));
            localStorage.setItem(NOTIF_STORAGE_KEY, JSON.stringify(list));
            return list;
          }
        }
        localStorage.setItem(NOTIF_STORAGE_KEY, "[]");
        return [];
      }
      const stored = localStorage.getItem(NOTIF_STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed)) {
          return parsed.filter(n => n.id && !n.id.startsWith("notif_default_"));
        }
      }
    } catch (e) {}
    return [];
  }

  function saveStoredNotifications(list) {
    localStorage.setItem(NOTIF_STORAGE_KEY, JSON.stringify(list));
    updateNotificationBadges();
  }

  function addSystemNotification(notif) {
    const list = getStoredNotifications();
    const newEntry = {
      id: "notif_" + Date.now() + "_" + Math.random().toString(36).substr(2, 4),
      type: notif.type || "info",
      title: notif.title || "Thông báo hệ thống",
      message: notif.message || "",
      time: notif.time || new Date().toISOString(),
      read: false,
      badge: notif.badge || "Thông báo"
    };

    list.unshift(newEntry);
    if (list.length > 50) list.pop();
    saveStoredNotifications(list);

    if (viewNotifications && viewNotifications.style.display !== "none") {
      renderNotificationsList();
    }
  }


  function updateNotificationBadges() {
    const list = getStoredNotifications();
    const unreadCount = list.filter(n => !n.read).length;

    // Sidebar badge
    if (sidebarNotifBadge) {
      if (unreadCount > 0) {
        sidebarNotifBadge.innerText = unreadCount > 9 ? "9+" : unreadCount;
        sidebarNotifBadge.classList.remove("hidden");
      } else {
        sidebarNotifBadge.classList.add("hidden");
      }
    }

    // Topbar badge
    if (topbarNotifBadge) {
      if (unreadCount > 0) {
        topbarNotifBadge.innerText = unreadCount > 9 ? "9+" : unreadCount;
        topbarNotifBadge.classList.remove("hidden");
      } else {
        topbarNotifBadge.classList.add("hidden");
      }
    }

    // Summary text
    const unreadNumEl = document.getElementById("notif-unread-num");
    if (unreadNumEl) unreadNumEl.innerText = unreadCount;

    // Tab counts
    const countAllEl = document.getElementById("count-tab-all");
    const countAlertEl = document.getElementById("count-tab-alert");
    const countPresenceEl = document.getElementById("count-tab-presence");
    const countAutoEl = document.getElementById("count-tab-auto");
    const countDeviceEl = document.getElementById("count-tab-device");

    if (countAllEl) countAllEl.innerText = list.length;
    if (countAlertEl) countAlertEl.innerText = list.filter(n => n.type === "alert").length;
    if (countPresenceEl) countPresenceEl.innerText = list.filter(n => n.type === "presence").length;
    if (countAutoEl) countAutoEl.innerText = list.filter(n => n.type === "automation").length;
    if (countDeviceEl) countDeviceEl.innerText = list.filter(n => n.type === "device").length;
  }

  function renderNotificationsList() {
    if (!notifCardsList) return;
    updateNotificationBadges();

    const list = getStoredNotifications();
    const filtered = list.filter(n => {
      if (currentNotifFilter === "all") return true;
      return n.type === currentNotifFilter;
    });

    if (filtered.length === 0) {
      notifCardsList.innerHTML = `
        <div class="notif-empty-state">
          <div class="empty-icon"><i class="fa-regular fa-bell-slash"></i></div>
          <h3>Không có thông báo nào</h3>
          <p>Hiện không có cảnh báo hoặc nhật ký nào trong danh mục này. Hệ thống đang hoạt động an toàn và ổn định.</p>
        </div>
      `;
      return;
    }

    let html = "";
    filtered.forEach(item => {
      let iconClass = "fa-info";
      let tagClass = "tag-info";
      if (item.type === "alert") {
        iconClass = "fa-triangle-exclamation";
        tagClass = "tag-alert";
      } else if (item.type === "presence") {
        iconClass = "fa-person-walking";
        tagClass = "tag-presence";
      } else if (item.type === "automation") {
        iconClass = "fa-bolt";
        tagClass = "tag-automation";
      } else if (item.type === "device") {
        iconClass = "fa-microchip";
        tagClass = "tag-device";
      }

      html += `
        <div class="notif-card notif-type-${item.type} ${item.read ? '' : 'unread'}" data-notif-id="${escapeHtml(item.id)}">
          <div class="notif-icon">
            <i class="fa-solid ${iconClass}"></i>
          </div>
          <div class="notif-content">
            <div class="notif-top-row">
              <h4 class="notif-title">${escapeHtml(item.title)}</h4>
              <span class="notif-tag ${tagClass}">${escapeHtml(item.badge || 'Thông báo')}</span>
              <span class="notif-time">
                <i class="fa-regular fa-clock"></i> ${formatTimeAgo(item.time)}
              </span>
            </div>
            <p class="notif-msg">${escapeHtml(item.message)}</p>
          </div>
          <div class="notif-actions">
            <button type="button" class="btn-notif-item-action btn-toggle-notif-read" data-id="${escapeHtml(item.id)}" title="${item.read ? 'Đánh dấu chưa đọc' : 'Đánh dấu đã đọc'}">
              <i class="fa-solid ${item.read ? 'fa-envelope' : 'fa-envelope-open'}"></i>
            </button>
            <button type="button" class="btn-notif-item-action btn-del-notif" data-id="${escapeHtml(item.id)}" title="Xóa thông báo này">
              <i class="fa-solid fa-trash-can"></i>
            </button>
          </div>
        </div>
      `;
    });

    notifCardsList.innerHTML = html;

    // Gán sự kiện cho từng thẻ thông báo
    notifCardsList.querySelectorAll(".btn-toggle-notif-read").forEach(btn => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const id = btn.getAttribute("data-id");
        const list = getStoredNotifications();
        const target = list.find(n => n.id === id);
        if (target) {
          target.read = !target.read;
          saveStoredNotifications(list);
          renderNotificationsList();
        }
      });
    });

    notifCardsList.querySelectorAll(".btn-del-notif").forEach(btn => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const id = btn.getAttribute("data-id");
        let list = getStoredNotifications();
        list = list.filter(n => n.id !== id);
        saveStoredNotifications(list);
        renderNotificationsList();
      });
    });

    notifCardsList.querySelectorAll(".notif-card").forEach(card => {
      card.addEventListener("click", () => {
        const id = card.getAttribute("data-notif-id");
        const list = getStoredNotifications();
        const target = list.find(n => n.id === id);
        if (target && !target.read) {
          target.read = true;
          saveStoredNotifications(list);
          renderNotificationsList();
        }
      });
    });
  }

  function openNotificationsView() {
    if (global.SmartHome && global.SmartHome.setCurrentHubView) global.SmartHome.setCurrentHubView(null);
    const homeDash = document.getElementById("view-home-dashboard");
    const subView = document.getElementById("view-device-hub");
    const autoView = document.getElementById("view-automations");
    const otaView = document.getElementById("view-firmware-update");
    const roomView = document.getElementById("view-room-mgmt");

    if (homeDash) homeDash.style.display = "none";
    if (subView) subView.style.display = "none";
    if (autoView) autoView.style.display = "none";
    if (otaView) otaView.style.display = "none";
    if (roomView) roomView.style.display = "none";
    if (viewNotifications) viewNotifications.style.display = "block";

    if (global.SmartHome && global.SmartHome.updateSidebarActive) global.SmartHome.updateSidebarActive("nav-notifs");
    renderNotificationsList();
    window.location.hash = "notifications";
  }

  if (navNotifsBtn) {
    navNotifsBtn.addEventListener("click", (e) => {
      e.preventDefault();
      openNotificationsView();
    });
  }

  if (btnTopbarNotifs) {
    btnTopbarNotifs.addEventListener("click", (e) => {
      e.preventDefault();
      openNotificationsView();
    });
  }

  if (btnNotifsBack) {
    btnNotifsBack.addEventListener("click", () => {
      if (global.SmartHome && global.SmartHome.closeHubSubView) global.SmartHome.closeHubSubView(true);
      window.location.hash = "";
    });
  }

  if (btnMarkAllRead) {
    btnMarkAllRead.addEventListener("click", () => {
      const list = getStoredNotifications();
      list.forEach(n => n.read = true);
      saveStoredNotifications(list);
      renderNotificationsList();
      showToast("Đã đánh dấu đã đọc tất cả thông báo!", "success");
    });
  }

  if (btnClearAllNotifs) {
    btnClearAllNotifs.addEventListener("click", async () => {
      const ok = await showConfirmModal({
        title: "Xóa lịch sử thông báo?",
        message: "Bạn có chắc chắn muốn xóa toàn bộ lịch sử thông báo?",
        confirmText: "Xóa tất cả",
        type: "danger"
      });
      if (!ok) return;
      saveStoredNotifications([]);
      renderNotificationsList();
      showToast("Đã xóa toàn bộ thông báo!", "info");
    });
  }

  if (notifFilterTabs) {
    notifFilterTabs.querySelectorAll(".notif-tab").forEach(tab => {
      tab.addEventListener("click", () => {
        notifFilterTabs.querySelectorAll(".notif-tab").forEach(t => t.classList.remove("active"));
        tab.classList.add("active");
        currentNotifFilter = tab.getAttribute("data-filter") || "all";
        renderNotificationsList();
      });
    });
  }


    global.getStoredNotifications = getStoredNotifications;
    global.saveStoredNotifications = saveStoredNotifications;
    global.updateNotificationBadges = updateNotificationBadges;
    global.addSystemNotification = addSystemNotification;
    global.renderNotificationsList = renderNotificationsList;
    global.openNotificationsView = openNotificationsView;
    updateNotificationBadges();
  });
})(window);
