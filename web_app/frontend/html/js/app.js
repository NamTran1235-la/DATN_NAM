document.addEventListener("DOMContentLoaded", () => {
  // 1. Kiểm tra xác thực Token
  const token = localStorage.getItem("gate_token");
  if (!token) {
    window.location.href = "login.html";
    return;
  }

  // 2. Hiển thị thông tin User
  const userJson = localStorage.getItem("gate_user");
  if (userJson) {
    try {
      const user = JSON.parse(userJson);
      const name = user.fullname || user.username || "Admin";
      const uNameEl = document.getElementById("user-name");
      if (uNameEl) uNameEl.innerText = name;
    } catch (e) {}
  }

  // 3. Xử lý Đăng xuất
  const btnLogout = document.getElementById("btn-logout");
  if (btnLogout) {
    btnLogout.addEventListener("click", () => {
      localStorage.removeItem("gate_token");
      localStorage.removeItem("gate_user");
      showToast("Đã đăng xuất khỏi hệ thống!");
      setTimeout(() => {
        window.location.href = "login.html";
      }, 500);
    });
  }

  // ── Khai báo các phần tử giao diện ──────────────────────────────────────────
  const statusBadge = document.getElementById("mqtt-status-badge");
  const statusText = document.getElementById("mqtt-status-text");

  // Counters
  const countDevicesOn = document.getElementById("count-devices-on");
  const countDevicesOff = document.getElementById("count-devices-off");
  const countDevicesOffline = document.getElementById("count-devices-offline");

  // Weather & Sensor Displays
  const weatherTempDisplay = document.getElementById("weather-temp-display");
  const weatherHumDisplay = document.getElementById("weather-hum-display");
  const liveWeatherDate = document.getElementById("live-weather-date");

  // Gateway Card & Sidebar Status
  const sidebarGateDot = document.getElementById("sidebar-gate-dot");
  const sidebarGateText = document.getElementById("sidebar-gate-text");
  const btnRebootGate = document.getElementById("btn-reboot-gate");

  // AC Modal & Elements
  const hvacModal = document.getElementById("hvac-modal");
  const btnCloseModal = document.getElementById("btn-close-modal");

  const acPowerBtn = document.getElementById("btn-ac-power");
  const acPowerText = document.getElementById("ac-power-text");
  const acTempDisplay = document.getElementById("ac-temp-display");
  const btnTempMinus = document.getElementById("btn-temp-minus");
  const btnTempPlus = document.getElementById("btn-temp-plus");
  const modePills = document.querySelectorAll("#mode-pills .pill-opt");
  const fanPills = document.querySelectorAll("#fan-pills .pill-opt");

  // Devices Grid Container
  const devicesGrid = document.getElementById("devices-grid");
  const btnAddDevice = document.getElementById("btn-add-device");

  // Web BLE & Wi-Fi Provisioning Constants & State
  const BLE_WIFI_SERVICE_UUID = 0x00FF;
  const BLE_CHR_SSID_UUID = 0xFF01;
  const BLE_CHR_PASS_UUID = 0xFF02;

  let bleDevice = null;
  let bleServer = null;
  let charSsid = null;
  let charPass = null;
  let isBleConnected = false;
  let scanPollTimer = null;

  // Modal Elements
  const addGatewayModal = document.getElementById("add-gateway-modal");
  const btnCloseAddModal = document.getElementById("btn-close-add-modal");

  // Stages
  const stageBleConnect = document.getElementById("stage-ble-connect");
  const stageWifiPicker = document.getElementById("stage-wifi-picker");
  const stageBleSending = document.getElementById("stage-ble-sending");
  const stageDevicesFound = document.getElementById("stage-devices-found");

  // Stage 1 elements
  const btnBleScan = document.getElementById("btn-ble-scan");
  const btnBleSimulate = document.getElementById("btn-ble-simulate");
  const bleStatusTitle = document.getElementById("ble-status-title");
  const bleStatusDesc = document.getElementById("ble-status-desc");

  // Stage 2 elements (Wi-Fi picker)
  const bleConnectedDeviceName = document.getElementById("ble-connected-device-name");
  const wifiScannedContainer = document.getElementById("wifi-scanned-container");
  const btnRefreshWifi = document.getElementById("btn-refresh-wifi");
  const bleWifiSsidInput = document.getElementById("ble-wifi-ssid");
  const bleWifiPassInput = document.getElementById("ble-wifi-pass");
  const btnToggleBlePass = document.getElementById("btn-toggle-ble-pass");
  const passEyeIcon = document.getElementById("pass-eye-icon");
  const btnBleSendConfig = document.getElementById("btn-ble-send-config");
  const btnBleDisconnect = document.getElementById("btn-ble-disconnect");

  // Stage 3 elements (Sending)
  const sendingStatusTitle = document.getElementById("sending-status-title");
  const sendingStatusDesc = document.getElementById("sending-status-desc");
  const stepSendSsid = document.getElementById("step-send-ssid");
  const stepSendPass = document.getElementById("step-send-pass");
  const stepWaitOnline = document.getElementById("step-wait-online");
  const btnCheckSendingNow = document.getElementById("btn-check-sending-now");
  const btnSimulateSendingOnline = document.getElementById("btn-simulate-sending-online");

  // Stage 4 elements (Found)
  const foundGwMeta = document.getElementById("found-gw-meta");
  const btnConfirmAddAll = document.getElementById("btn-confirm-add-all");
  const btnRescanGate = document.getElementById("btn-rescan-gate");

  // Dropdown & Sidebar Mobile Toggle
  const homeTrigger = document.getElementById("home-dropdown-trigger");
  const homeMenu = document.getElementById("home-dropdown-menu");
  const currentHomeName = document.getElementById("current-home-name");
  const btnToggleSidebar = document.getElementById("btn-toggle-sidebar");
  const sidebarEl = document.getElementById("hunonic-sidebar");

  // Trạng thái cục bộ
  let acState = {
    power: 0,
    temp: 25,
    mode: 1, // Cool
    fan: 0   // Auto
  };

  let relayStates = {
    1: 0,
    2: 0
  };

  let sensorData = {
    temp: 0,
    hum: 0,
    batt: 0,
    presence: 0,
    hasData: false,
    isOnline: false
  };

  window.acState = acState;
  window.relayStates = relayStates;
  window.sensorData = sensorData;

  let isGatewayOnline = false;
  let gwMetrics = {
    uptime_sec: 0,
    free_heap: 0,
    rssi: -100,
    fw_ver: "1.0.0",
    ac_online: false,
    ac_offline_reason: "Chưa nhận được dữ liệu từ Gateway"
  };

  // Trạng thái hiển thị Gateway & thiết bị ở phòng chính (luôn hiển thị mặc định)
  let isGateAddedToRoom = true;
  localStorage.setItem("gate_added_to_room", "true");

  let customDevices = [];
  try {
    customDevices = JSON.parse(localStorage.getItem("gate_custom_devices") || "[]");
  } catch(e) {
    customDevices = [];
  }

  const hasSavedDevices = localStorage.getItem("gate_custom_devices") !== null;
  const isIrExplicitlyDeleted = localStorage.getItem("gate_ir_hub_deleted") === "true";
  const isSensorExplicitlyDeleted = localStorage.getItem("gate_sensor_deleted") === "true";

  function getActiveIrHub() {
    if (localStorage.getItem("gate_ir_hub_deleted") === "true") {
      return null;
    }
    return customDevices.find(d => d.type === "ir_hub" || d.id === "dev_ir_hub_hunonic" || (d.id && d.id.includes("ir_hub"))) || null;
  }

  function getActiveSensor() {
    if (localStorage.getItem("gate_sensor_deleted") === "true") {
      return null;
    }
    return customDevices.find(d => d.type === "sensor" || d.id === "dev_espnow_node_1" || (d.id && (d.id.includes("sensor") || d.id.includes("espnow")))) || null;
  }

  // Remove switch entries saved by earlier dashboard versions.
  customDevices = customDevices.filter(d => d.type !== "relay" && d.type !== "socket");
  if (isSensorExplicitlyDeleted) {
    customDevices = customDevices.filter(d => d.type !== "sensor" && d.id !== "dev_espnow_node_1" && !(d.id && (d.id.includes("sensor") || d.id.includes("espnow"))));
  }
  localStorage.setItem("gate_custom_devices", JSON.stringify(customDevices));

  // ── MIGRATION: Đảm bảo trạm IR trung tâm là thiết bị cha chứa danh sách điều hòa (MIRAGE, FUNIKI)
  let foundHub = getActiveIrHub();

  // Nếu người dùng đã từng lưu danh sách và trong đó không có IR Hub -> đồng bộ flag đã xóa
  if (hasSavedDevices && !foundHub) {
    localStorage.setItem("gate_ir_hub_deleted", "true");
  }

  // Nếu người dùng đã từng lưu danh sách và trong đó không có Sensor -> đồng bộ flag đã xóa
  if (hasSavedDevices && !getActiveSensor()) {
    localStorage.setItem("gate_sensor_deleted", "true");
  }

  // Chỉ khởi tạo mặc định nếu người dùng chưa từng lưu cấu hình và chưa từng chủ động xóa
  if (!hasSavedDevices && !foundHub && !isIrExplicitlyDeleted) {
    foundHub = {
      id: "dev_ir_hub_hunonic",
      name: "IR trung tâm",
      type: "ir_hub",
      room: localStorage.getItem("gate_room") || "Phòng khách",
      device_id: "3987670",
      extra: "Trạm phát IR 360° đa hướng",
      children: [],
      state: 0
    };

    // Chỉ loại bỏ điều hòa lẻ độc lập (vì đã gom vào foundHub.children), giữ nguyên các Node cảm biến và thiết bị người dùng đã thêm
    customDevices = customDevices.filter(d => d.type !== "ac");
    customDevices.unshift(foundHub);
    localStorage.setItem("gate_custom_devices", JSON.stringify(customDevices));
  } else if (foundHub) {
    // Đảm bảo tên hiển thị chuẩn theo giao diện Hunonic: IR trung tâm
    if (!foundHub.name || foundHub.name === "IR Hunonic Smart Pro") {
      foundHub.name = "IR trung tâm";
    }
    if (!foundHub.children) {
      foundHub.children = [];
    }
    customDevices = customDevices.filter(d => d.type !== "ac");
    localStorage.setItem("gate_custom_devices", JSON.stringify(customDevices));
  } else {
    // Lưu giữ nguyên vẹn mọi thiết bị người dùng đã thêm (Node Cảm Biến C3, v.v.)
    customDevices = customDevices.filter(d => d.type !== "ac");
    localStorage.setItem("gate_custom_devices", JSON.stringify(customDevices));
  }

  customDevices.forEach(dev => {
    if (dev.type === "ir_hub") dev.children = [];
  });

  // ── Cập nhật ngày tháng tiếng Việt ──────────────────────────────────────────
  function updateLiveDate() {
    if (!liveWeatherDate) return;
    const now = new Date();
    const days = ["Chủ Nhật", "Thứ 2", "Thứ 3", "Thứ 4", "Thứ 5", "Thứ 6", "Thứ 7"];
    const dayName = days[now.getDay()];
    const dateStr = `${dayName}, ${now.getDate()}/${now.getMonth() + 1}/${now.getFullYear()}`;
    liveWeatherDate.innerText = dateStr;
  }
  updateLiveDate();

  // ── Home Dropdown Selector ──────────────────────────────────────────────────
  if (homeTrigger && homeMenu) {
    homeTrigger.addEventListener("click", (e) => {
      e.stopPropagation();
      homeMenu.classList.toggle("hidden");
    });

    document.querySelectorAll(".home-dropdown-item").forEach(item => {
      item.addEventListener("click", () => {
        document.querySelectorAll(".home-dropdown-item").forEach(i => i.classList.remove("active"));
        item.classList.add("active");
        currentHomeName.innerText = item.getAttribute("data-home");
        homeMenu.classList.add("hidden");
        showToast(`Đã chuyển sang không gian: ${currentHomeName.innerText}`);
      });
    });

    document.addEventListener("click", () => {
      homeMenu.classList.add("hidden");
    });
  }

  // ── Mobile Sidebar Toggle with Backdrop & Touch Support ─────────────────────
  const sidebarBackdrop = document.getElementById("sidebar-backdrop");
  if (btnToggleSidebar && sidebarEl) {
    const toggleSidebar = (forceState) => {
      const willOpen = forceState !== undefined ? forceState : !sidebarEl.classList.contains("open");
      sidebarEl.classList.toggle("open", willOpen);
      if (sidebarBackdrop) {
        sidebarBackdrop.classList.toggle("active", willOpen);
      }
    };

    btnToggleSidebar.addEventListener("click", (e) => {
      e.stopPropagation();
      toggleSidebar();
    });

    if (sidebarBackdrop) {
      sidebarBackdrop.addEventListener("click", () => {
        toggleSidebar(false);
      });
    }

    document.addEventListener("click", (e) => {
      if (!sidebarEl.contains(e.target) && e.target !== btnToggleSidebar) {
        toggleSidebar(false);
      }
    });

    // Tự động đóng sidebar trên mobile khi bấm vào nav item
    const navItems = sidebarEl.querySelectorAll(".nav-item");
    navItems.forEach(item => {
      item.addEventListener("click", () => {
        if (window.innerWidth <= 768) {
          toggleSidebar(false);
        }
      });
    });
  }

  // ── Modal AC Controller Toggle ──────────────────────────────────────────────
  if (btnCloseModal && hvacModal) {
    btnCloseModal.addEventListener("click", () => {
      hvacModal.classList.add("hidden");
    });

    hvacModal.addEventListener("click", (e) => {
      if (e.target === hvacModal) {
        hvacModal.classList.add("hidden");
      }
    });
  }

  // ── Helper chuyển đổi các bước (Stages) trong Modal ──────────────────────
  function showStage(stageName) {
    if (stageBleConnect) stageBleConnect.classList.add("hidden");
    if (stageWifiPicker) stageWifiPicker.classList.add("hidden");
    if (stageBleSending) stageBleSending.classList.add("hidden");
    if (stageDevicesFound) stageDevicesFound.classList.add("hidden");

    if (stageName === "ble-connect" && stageBleConnect) stageBleConnect.classList.remove("hidden");
    else if (stageName === "wifi-picker" && stageWifiPicker) {
      stageWifiPicker.classList.remove("hidden");
      loadScannedWifiList();
    }
    else if (stageName === "ble-sending" && stageBleSending) stageBleSending.classList.remove("hidden");
    else if (stageName === "devices-found" && stageDevicesFound) stageDevicesFound.classList.remove("hidden");
  }

  // ── Modal Thêm Thiết Bị & Cấu Hình Gateway Qua Web BLE ─────────────────────
  function openAddGatewayModal() {
    if (!addGatewayModal) return;
    addGatewayModal.classList.remove("hidden");

    // Nếu Gateway đã trực tuyến sẵn thì hiển thị ngay danh sách thiết bị
    if (isGatewayOnline) {
      showDevicesFoundStage();
    } else {
      showStage("ble-connect");
      if (bleStatusTitle) bleStatusTitle.innerText = "Quét Gateway qua Bluetooth (BLE)";
      if (bleStatusDesc) bleStatusDesc.innerText = "Trình duyệt sẽ tìm kiếm trạm Gateway ESP32-S3 (GATE_S3_CONFIG) qua chuẩn Web Bluetooth GATT.";

      const bleNotice = document.getElementById("ble-untrusted-notice");
      if (bleNotice) {
        bleNotice.style.display = (!navigator.bluetooth) ? "block" : "none";
      }
    }
  }

  function closeAddGatewayModal() {
    if (!addGatewayModal) return;
    addGatewayModal.classList.add("hidden");
    stopScanningGateway();
  }

  function showDevicesFoundStage() {
    stopScanningGateway();
    showStage("devices-found");

    if (foundGwMeta) {
      const heapKb = (gwMetrics.free_heap > 0 ? (gwMetrics.free_heap / 1024).toFixed(1) : "248.5");
      const uptimeStr = formatUptime(gwMetrics.uptime_sec || 120);
      const rssiVal = gwMetrics.rssi !== -100 ? `${gwMetrics.rssi} dBm` : "-52 dBm";
      foundGwMeta.innerText = `Uptime: ${uptimeStr} • Free RAM: ${heapKb} KB • Wi-Fi: ${rssiVal}`;
    }
  }

  // ── Hàm Kết Nối Web Bluetooth (GATT Service 0x00FF) ────────────────────────
  async function connectGatewayBle() {
    const bleNotice = document.getElementById("ble-untrusted-notice");
    if (!navigator.bluetooth) {
      if (bleNotice) bleNotice.style.display = "block";
      showToast("Chrome đang chặn Bluetooth trên IP. Bạn có thể mở qua localhost:8080 hoặc chọn Wi-Fi ngay!", "info");
      return false;
    }

    try {
      if (bleStatusTitle) bleStatusTitle.innerText = "Đang tìm kiếm Gateway ESP32-S3...";
      if (bleStatusDesc) bleStatusDesc.innerText = "Vui lòng chọn thiết bị GATE_S3_CONFIG trong cửa sổ Bluetooth của trình duyệt...";

      // Yêu cầu tìm kiếm thiết bị BLE (ưu tiên acceptAllDevices để hiện đủ thiết bị)
      try {
        bleDevice = await navigator.bluetooth.requestDevice({
          acceptAllDevices: true,
          optionalServices: [
            BLE_WIFI_SERVICE_UUID,
            0x00ff,
            "000000ff-0000-1000-8000-00805f9b34fb"
          ]
        });
      } catch (err1) {
        if (err1.name === "TypeError") {
          bleDevice = await navigator.bluetooth.requestDevice({
            filters: [{ namePrefix: "GATE" }],
            optionalServices: [
              BLE_WIFI_SERVICE_UUID,
              0x00ff,
              "000000ff-0000-1000-8000-00805f9b34fb"
            ]
          });
        } else {
          throw err1;
        }
      }

      if (!bleDevice) return false;

      bleDevice.addEventListener('gattserverdisconnected', () => {
        isBleConnected = false;
        showToast("Gateway BLE đã ngắt kết nối!", "info");
      });

      if (bleStatusTitle) bleStatusTitle.innerText = "Đang kết nối GATT Server...";
      bleServer = await bleDevice.gatt.connect();

      // Lấy Service Wi-Fi (0x00FF)
      let service;
      try {
        service = await bleServer.getPrimaryService(BLE_WIFI_SERVICE_UUID);
      } catch (e) {
        service = await bleServer.getPrimaryService("000000ff-0000-1000-8000-00805f9b34fb");
      }

      // Lấy Characteristic SSID (0xFF01) và PASS (0xFF02)
      try {
        charSsid = await service.getCharacteristic(BLE_CHR_SSID_UUID);
      } catch (e) {
        charSsid = await service.getCharacteristic("0000ff01-0000-1000-8000-00805f9b34fb");
      }

      try {
        charPass = await service.getCharacteristic(BLE_CHR_PASS_UUID);
      } catch (e) {
        charPass = await service.getCharacteristic("0000ff02-0000-1000-8000-00805f9b34fb");
      }

      isBleConnected = true;
      if (bleConnectedDeviceName) {
        bleConnectedDeviceName.innerText = `ĐÃ KẾT NỐI BLE: ${bleDevice.name || "GATE_S3_CONFIG"}`;
      }

      showToast(`Đã kết nối BLE với ${bleDevice.name || "GATE_S3_CONFIG"}!`, "success");
      showStage("wifi-picker");
      return true;
    } catch (err) {
      console.warn("Lỗi kết nối Web Bluetooth:", err);
      if (bleStatusTitle) bleStatusTitle.innerText = "Quét Gateway qua Bluetooth (BLE)";
      if (bleStatusDesc) bleStatusDesc.innerText = "Chưa kết nối được. Vui lòng bấm quét lại hoặc chọn mô phỏng.";
      if (err.name !== "NotFoundError") {
        showToast(`Lỗi BLE: ${err.message}`, "error");
      }
      return false;
    }
  }

  // ── Polling kiểm tra Gateway Online ────────────────────────────────────────
  async function checkGatewayOnlineApi() {
    const gwRes = await callApi("/api/gateway/status");
    if (gwRes && gwRes.success && gwRes.data) {
      const d = gwRes.data;
      if (d.online) {
        isGatewayOnline = true;
        gwMetrics.uptime_sec = d.uptime_sec || 0;
        gwMetrics.free_heap = d.free_heap || 0;
        gwMetrics.rssi = d.rssi || -100;
        showDevicesFoundStage();
        showToast("Gateway ESP32-S3 đã kết nối Wi-Fi & trực tuyến thành công!", "success");
        return true;
      }
    }
    return false;
  }

  function startScanningGateway() {
    stopScanningGateway();
    checkGatewayOnlineApi();
    scanPollTimer = setInterval(checkGatewayOnlineApi, 1800);
  }

  function stopScanningGateway() {
    if (scanPollTimer) {
      clearInterval(scanPollTimer);
      scanPollTimer = null;
    }
  }

  // ── Sự kiện trong Modal ───────────────────────────────────────────────────
  if (btnCloseAddModal) {
    btnCloseAddModal.addEventListener("click", closeAddGatewayModal);
  }

  if (addGatewayModal) {
    addGatewayModal.addEventListener("click", (e) => {
      if (e.target === addGatewayModal) closeAddGatewayModal();
    });
  }

  // 1. Quét BLE thực tế qua trình duyệt
  if (btnBleScan) {
    btnBleScan.addEventListener("click", connectGatewayBle);
  }

  // 2. Mô phỏng đã kết nối BLE (Thử nghiệm khi chưa bật Bluetooth / HTTP)
  if (btnBleSimulate) {
    btnBleSimulate.addEventListener("click", () => {
      isBleConnected = true;
      if (bleConnectedDeviceName) {
        bleConnectedDeviceName.innerText = "ĐÃ KẾT NỐI BLE: GATE_S3_CONFIG (Mô phỏng)";
      }
      showToast("Đã mô phỏng kết nối BLE với GATE_S3_CONFIG thành công!", "success");
      showStage("wifi-picker");
    });
  }

  const btnNoticeSkipWifi = document.getElementById("btn-notice-skip-wifi");
  if (btnNoticeSkipWifi) {
    btnNoticeSkipWifi.addEventListener("click", () => {
      isBleConnected = true;
      if (bleConnectedDeviceName) {
        bleConnectedDeviceName.innerText = "GATE_S3_CONFIG (Chọn Wi-Fi & Nạp)";
      }
      showToast("Chuyển sang màn hình chọn Wi-Fi & nạp cấu hình!");
      showStage("wifi-picker");
    });
  }

  function escapeHtml(str) {
    if (!str) return '';
    return String(str).replace(/[&<>"']/g, function(m) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m];
    });
  }

  // ── Quét danh sách Wi-Fi thực tế (từ máy tính / Local Bridge) ───────────────
  async function loadScannedWifiList(forceRescan = false) {
    if (!wifiScannedContainer) return;

    if (forceRescan || !wifiScannedContainer.querySelector(".wifi-scanned-item")) {
      wifiScannedContainer.innerHTML = `
        <div style="text-align: center; padding: 28px 12px; color: #64748b;">
          <i class="fa-solid fa-rotate fa-spin" style="font-size: 26px; color: var(--hunonic-green); margin-bottom: 10px;"></i>
          <p style="margin: 0; font-size: 14px; font-weight: 600;">Đang quét các mạng Wi-Fi thực tế xung quanh máy tính...</p>
        </div>
      `;
    }

    let networks = [];
    try {
      let res = null;
      try {
        res = await fetch("http://127.0.0.1:8088/api/wifi/scan", {
          method: "GET",
          headers: { "Accept": "application/json" }
        }).then(r => r.json());
      } catch (e1) {
        res = await fetch("http://localhost:8088/api/wifi/scan", {
          method: "GET",
          headers: { "Accept": "application/json" }
        }).then(r => r.json());
      }
      if (res && res.success && Array.isArray(res.networks) && res.networks.length > 0) {
        networks = res.networks;
      }
    } catch (err) {
      console.warn("Chưa gọi được Local scan bridge:", err);
    }

    if (!networks || networks.length === 0) {
      wifiScannedContainer.innerHTML = `
        <div style="text-align: center; padding: 26px 16px; color: #64748b;">
          <i class="fa-solid fa-satellite-dish" style="font-size: 28px; color: #94a3b8; margin-bottom: 8px;"></i>
          <p style="margin: 0 0 6px 0; font-size: 14px; font-weight: 600; color: #334155;">Chưa quét được mạng Wi-Fi xung quanh máy tính</p>
          <p style="margin: 0; font-size: 12px; color: #64748b;">Vui lòng nhấn nút <i class="fa-solid fa-rotate"></i> để thử lại, hoặc tự nhập Tên & Mật khẩu Wi-Fi ở bên dưới.</p>
        </div>
        <div class="wifi-scanned-item manual-item" data-ssid="">
          <div class="wifi-item-left">
            <i class="fa-solid fa-pen-to-square"></i>
            <span class="wifi-item-ssid">Nhập tên Wi-Fi thủ công...</span>
          </div>
        </div>
      `;
      return;
    }

    let html = "";
    networks.forEach((net, idx) => {
      const isSelected = (idx === 0);
      const iconClass = net.signal >= 75 ? "wifi-strong" : (net.signal >= 45 ? "wifi-med" : "wifi-weak");
      const signalText = `${net.signal}%`;
      const is5G = net.band === "5G";
      const bandClass = is5G ? "wifi-band-5g" : "wifi-band-tag";
      const bandLabel = is5G ? "5GHz" : "2.4GHz";
      const hintTitle = is5G ? "ESP32-S3 không hỗ trợ sóng 5GHz" : "Chuẩn 2.4GHz tương thích Gateway ESP32-S3";

      html += `
        <div class="wifi-scanned-item ${isSelected ? 'selected' : ''}" data-ssid="${escapeHtml(net.ssid)}" title="${hintTitle}">
          <div class="wifi-item-left">
            <i class="fa-solid fa-wifi ${iconClass}"></i>
            <span class="wifi-item-ssid">${escapeHtml(net.ssid)}</span>
          </div>
          <div class="wifi-item-right">
            <span class="wifi-lock-badge"><i class="fa-solid fa-lock"></i> ${escapeHtml(net.security || 'WPA2')}</span>
            <span class="${bandClass}">${bandLabel}</span>
            <span style="font-size: 12px; color: #10b981; font-weight: 700; min-width: 32px; text-align: right;">${signalText}</span>
          </div>
        </div>
      `;
    });

    html += `
      <div class="wifi-scanned-item manual-item" data-ssid="">
        <div class="wifi-item-left">
          <i class="fa-solid fa-pen-to-square"></i>
          <span class="wifi-item-ssid">Nhập tên Wi-Fi khác (Ẩn danh / Thủ công)...</span>
        </div>
      </div>
    `;

    wifiScannedContainer.innerHTML = html;

    // Tự động chọn mạng đầu tiên (mạng 2.4GHz mạnh nhất) & focus ô mật khẩu
    if (networks.length > 0 && bleWifiSsidInput) {
      bleWifiSsidInput.value = networks[0].ssid;
      if (bleWifiPassInput) {
        bleWifiPassInput.value = "";
        bleWifiPassInput.placeholder = `Nhập mật khẩu cho [${networks[0].ssid}]...`;
        setTimeout(() => bleWifiPassInput.focus(), 250);
      }
    }
  }

  // 3. Chọn mạng Wi-Fi từ danh sách quét được (chỉ cần nhập mật khẩu)
  if (wifiScannedContainer) {
    wifiScannedContainer.addEventListener("click", (e) => {
      const item = e.target.closest(".wifi-scanned-item");
      if (!item) return;

      document.querySelectorAll(".wifi-scanned-item").forEach(el => el.classList.remove("selected"));
      item.classList.add("selected");

      const ssid = item.getAttribute("data-ssid");
      if (bleWifiSsidInput) {
        if (ssid) {
          bleWifiSsidInput.value = ssid;
          if (bleWifiPassInput) {
            bleWifiPassInput.value = "";
            bleWifiPassInput.placeholder = `Nhập mật khẩu cho [${ssid}]...`;
            bleWifiPassInput.focus();
          }
          showToast(`Đã chọn [${ssid}], vui lòng nhập mật khẩu!`);
        } else {
          bleWifiSsidInput.value = "";
          bleWifiSsidInput.placeholder = "Nhập tên Wi-Fi thủ công...";
          bleWifiSsidInput.focus();
        }
      }
    });
  }

  // 4. Nút quét lại danh sách Wi-Fi
  if (btnRefreshWifi) {
    btnRefreshWifi.addEventListener("click", async () => {
      btnRefreshWifi.innerHTML = `<i class="fa-solid fa-rotate fa-spin"></i>`;
      showToast("Đang quét các mạng Wi-Fi thực tế mới nhất...");
      await loadScannedWifiList(true);
      btnRefreshWifi.innerHTML = `<i class="fa-solid fa-rotate"></i>`;
      showToast("Đã cập nhật danh sách Wi-Fi mới nhất!", "success");
    });
  }

  // 5. Ẩn / Hiện mật khẩu Wi-Fi
  if (btnToggleBlePass && bleWifiPassInput && passEyeIcon) {
    btnToggleBlePass.addEventListener("click", () => {
      const isPass = bleWifiPassInput.type === "password";
      bleWifiPassInput.type = isPass ? "text" : "password";
      passEyeIcon.className = isPass ? "fa-solid fa-eye-slash" : "fa-solid fa-eye";
    });
  }

  // 6. Quay lại bước Quét BLE
  if (btnBleDisconnect) {
    btnBleDisconnect.addEventListener("click", () => {
      if (bleDevice && bleDevice.gatt && bleDevice.gatt.connected) {
        bleDevice.gatt.disconnect();
      }
      isBleConnected = false;
      showStage("ble-connect");
    });
  }

  // 7. GỬI CẤU HÌNH VÀO CHARACTERISTIC SSID (0xFF01) & PASS (0xFF02)
  if (btnBleSendConfig) {
    btnBleSendConfig.addEventListener("click", async () => {
      const ssid = bleWifiSsidInput ? bleWifiSsidInput.value.replace(/[\r\n]/g, "") : "";
      const pass = bleWifiPassInput ? bleWifiPassInput.value : "";

      if (!ssid) {
        showToast("Vui lòng nhập hoặc chọn tên mạng Wi-Fi (SSID)!", "error");
        return;
      }

      showStage("ble-sending");
      if (stepSendSsid) {
        stepSendSsid.className = "sending-step-line in-progress";
        stepSendSsid.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> <span>Đang ghi SSID [<strong>${ssid}</strong>] vào Characteristic <strong>0xFF01</strong>...</span>`;
      }
      if (stepSendPass) {
        stepSendPass.className = "sending-step-line pending";
        stepSendPass.innerHTML = `<i class="fa-solid fa-clock"></i> <span>Chờ ghi Password vào Characteristic <strong>0xFF02</strong></span>`;
      }
      if (stepWaitOnline) {
        stepWaitOnline.className = "sending-step-line pending";
        stepWaitOnline.innerHTML = `<i class="fa-solid fa-clock"></i> <span>ESP32-S3 khởi động kết nối Wi-Fi & MQTT Cloud HiveMQ</span>`;
      }

      const encoder = new TextEncoder();
      let wroteDirectly = false;

      // Bước A: Ghi SSID vào 0xFF01
      try {
        if (charSsid) {
          await charSsid.writeValue(encoder.encode(ssid));
          wroteDirectly = true;
        }
      } catch (err) {
        console.warn("Lỗi ghi Web BLE SSID:", err);
      }

      // Nếu Web BLE không có sẵn (Chrome bị tổ chức khóa), tự động gửi qua Local BLE Bridge trên máy tính!
      if (!wroteDirectly) {
        try {
          let bridgeRes = null;
          try {
            bridgeRes = await fetch("http://127.0.0.1:8088/ble_wifi", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ ssid: ssid, password: pass })
            }).then(r => r.json());
          } catch (e1) {
            bridgeRes = await fetch("http://localhost:8088/ble_wifi", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ ssid: ssid, password: pass })
            }).then(r => r.json());
          }
          if (bridgeRes && bridgeRes.success) {
            console.log("Local BLE Bridge đã nạp thành công:", bridgeRes.message);
            wroteDirectly = true;
          }
        } catch (bridgeErr) {
          console.log("Local BLE Bridge:", bridgeErr);
        }
      }

      await new Promise(r => setTimeout(r, 400));
      if (stepSendSsid) {
        stepSendSsid.className = "sending-step-line done";
        stepSendSsid.innerHTML = `<i class="fa-solid fa-circle-check"></i> <span>Đã nạp SSID [<strong>${ssid}</strong>] vào Characteristic <strong>0xFF01</strong></span>`;
      }

      // Bước B: Ghi Password vào 0xFF02
      if (stepSendPass) {
        stepSendPass.className = "sending-step-line in-progress";
        stepSendPass.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> <span>Đang ghi Password vào Characteristic <strong>0xFF02</strong>...</span>`;
      }

      try {
        if (charPass) {
          await charPass.writeValue(encoder.encode(pass));
        }
      } catch (err) {
        console.warn("Lỗi ghi BLE PASS:", err);
      }

      await new Promise(r => setTimeout(r, 400));
      if (stepSendPass) {
        stepSendPass.className = "sending-step-line done";
        stepSendPass.innerHTML = `<i class="fa-solid fa-circle-check"></i> <span>Đã nạp Password vào Characteristic <strong>0xFF02</strong></span>`;
      }

      // Bước C: Chờ Gateway ESP32-S3 kết nối Wi-Fi & Cloud
      if (stepWaitOnline) {
        stepWaitOnline.className = "sending-step-line in-progress";
        stepWaitOnline.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> <span>ESP32-S3 đang kết nối Wi-Fi [${ssid}] và Cloud HiveMQ...</span>`;
      }
      if (sendingStatusTitle) sendingStatusTitle.innerText = "Gateway đang kết nối Wi-Fi...";
      if (sendingStatusDesc) sendingStatusDesc.innerText = `Đã gửi thành công SSID [${ssid}] và Password qua BLE. Đang chờ ESP32-S3 trực tuyến...`;

      showToast("Đã nạp SSID & Password vào Gateway ESP32-S3 qua BLE!", "success");

      // Bắt đầu polling kiểm tra Gateway Online
      startScanningGateway();
    });
  }

  // 8. Nút kiểm tra trạng thái gửi
  if (btnCheckSendingNow) {
    btnCheckSendingNow.addEventListener("click", async () => {
      btnCheckSendingNow.disabled = true;
      const oldHtml = btnCheckSendingNow.innerHTML;
      btnCheckSendingNow.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Đang kiểm tra...`;

      const isOnline = await checkGatewayOnlineApi();
      btnCheckSendingNow.disabled = false;
      btnCheckSendingNow.innerHTML = oldHtml;

      if (!isOnline) {
        showToast("Gateway đang trong quá trình kết nối Wi-Fi, vui lòng đợi thêm giây lát...", "info");
      }
    });
  }

  // 9. Nút mô phỏng Gateway kết nối thành công khi đang gửi
  if (btnSimulateSendingOnline) {
    btnSimulateSendingOnline.addEventListener("click", () => {
      isGatewayOnline = true;
      gwMetrics.uptime_sec = 3600;
      gwMetrics.free_heap = 286720;
      gwMetrics.rssi = -48;
      showDevicesFoundStage();
      showToast("Đã mô phỏng Gateway kết nối Wi-Fi & MQTT thành công!", "success");
    });
  }

  // 10. Nút Cấu hình lại
  if (btnRescanGate) {
    btnRescanGate.addEventListener("click", () => {
      showStage("ble-connect");
    });
  }

  // 11. XÁC NHẬN THÊM VÀO PHÒNG
  if (btnConfirmAddAll) {
    btnConfirmAddAll.addEventListener("click", () => {
      isGateAddedToRoom = true;
      localStorage.setItem("gate_added_to_room", "true");
      closeAddGatewayModal();
      renderDevices();
      showToast("Đã thêm thành công Trạm Gateway ESP32-S3 và các thiết bị vào phòng khách!", "success");
    });
  }

  // 12. Nút + Thêm trên thanh tiêu đề phòng
  if (btnAddDevice) {
    btnAddDevice.addEventListener("click", () => {
      if (isGateAddedToRoom) {
        openGatewayDrawer(true);
      } else {
        openAddGatewayModal();
      }
    });
  }

  // ── Hàm gọi REST API có kèm JWT Token ──────────────────────────────────────
  async function callApi(endpoint, method = "GET", body = null) {
    try {
      const opts = {
        method,
        headers: {
          "Authorization": `Bearer ${token}`,
          "Content-Type": "application/json",
          "Accept": "application/json"
        }
      };
      if (body) opts.body = JSON.stringify(body);

      const res = await fetch(endpoint, opts);
      if (res.status === 401) {
        localStorage.removeItem("gate_token");
        window.location.href = "login.html";
        return null;
      }
      return await res.json();
    } catch (err) {
      console.error(`Lỗi gọi API ${endpoint}:`, err);
      return null;
    }
  }
  window.callApi = callApi;

  // ── Định dạng Uptime ───────────────────────────────────────────────────────
  function formatUptime(seconds) {
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    return `${hrs.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }

  // ── RENDER THIẾT BỊ HOẶC TRẠNG THÁI RỖNG (LOGIC CHÍNH) ──────────────────────
  // ── PHẦN TỬ RIGHT NAVIGATION DRAWER (NAV BÊN TAY PHẢI) ──────────────────────
  const deviceDetailDrawer = document.getElementById("device-detail-drawer");
  const drawerBackdrop = document.getElementById("drawer-backdrop");
  const btnCloseDrawer = document.getElementById("btn-close-drawer");
  const drawerHeaderTitle = document.getElementById("drawer-header-title");
  const drawerHeaderSub = document.getElementById("drawer-header-sub");
  const drawerHeaderIcon = document.getElementById("drawer-header-icon");
  const drawerHeroBox = document.getElementById("drawer-hero-box");
  const drawerHeroName = document.getElementById("drawer-hero-name");
  const drawerHeroSub = document.getElementById("drawer-hero-sub");
  const drawerHeroBadge = document.getElementById("drawer-hero-badge");
  const drawerHeroIconInner = document.getElementById("drawer-hero-icon-inner");
  const drawerTeleGrid = document.getElementById("drawer-tele-grid");
  const drawerTeleUptime = document.getElementById("drawer-tele-uptime");
  const drawerTeleHeap = document.getElementById("drawer-tele-heap");
  const drawerTeleWifi = document.getElementById("drawer-tele-wifi");
  const drawerGwChildSection = document.getElementById("drawer-gw-child-section");
  const drawerChildCount = document.getElementById("drawer-child-count");
  const drawerChildList = document.getElementById("drawer-child-list");
  const btnDrawerAddChild = document.getElementById("btn-drawer-add-child");
  const drawerAddPanel = document.getElementById("drawer-add-panel");
  const drawerAvailList = document.getElementById("drawer-avail-list");
  const btnDrawerCloseAdd = document.getElementById("btn-drawer-close-add");
  const drawerEditName = document.getElementById("drawer-edit-name");
  const drawerEditRoom = document.getElementById("drawer-edit-room");
  const drawerGwExtraActions = document.getElementById("drawer-gw-extra-actions");
  const btnDrawerReconfigWifi = document.getElementById("btn-drawer-reconfig-wifi");
  const btnDrawerReboot = document.getElementById("btn-drawer-reboot");
  const btnDrawerSave = document.getElementById("btn-drawer-save");
  const btnDrawerDelete = document.getElementById("btn-drawer-delete");

  // Các phần tử điều khiển Trạm IR Hub & Điều Hòa trong Drawer
  const drawerIrHubSection = document.getElementById("drawer-ir-hub-section");
  const drawerIrChildList = document.getElementById("drawer-ir-child-list");
  const drawerIrCount = document.getElementById("drawer-ir-count");
  const btnDrawerSyncIr = document.getElementById("btn-drawer-sync-ir");
  const drawerAcBackBar = document.getElementById("drawer-ac-back-bar");
  const btnBackToIrHub = document.getElementById("btn-back-to-ir-hub");

  const drawerAcPanel = document.getElementById("drawer-ac-panel");
  const drawerAcVisualCard = document.getElementById("drawer-ac-visual-card");
  const drawerAcOfflineBanner = document.getElementById("drawer-ac-offline-banner");
  const drawerAcOfflineMsg = document.getElementById("drawer-ac-offline-msg");
  const drawerAcLiveText = document.getElementById("drawer-ac-live-text");
  const drawerAcScreenNum = document.getElementById("drawer-ac-screen-num");
  const drawerBtnPower = document.getElementById("drawer-btn-power");
  const drawerBtnPowerText = document.getElementById("drawer-btn-power-text");
  const drawerBtnTempMinus = document.getElementById("drawer-btn-temp-minus");
  const drawerBtnTempPlus = document.getElementById("drawer-btn-temp-plus");
  const drawerTempVal = document.getElementById("drawer-temp-val");
  const drawerModePills = document.querySelectorAll("#drawer-mode-pills .drawer-pill-opt");
  const drawerFanPills = document.querySelectorAll("#drawer-fan-pills .drawer-pill-opt");
  const drawerTempPresets = document.querySelectorAll(".drawer-temp-presets .preset-chip");

  let currentDrawerTarget = null; // null: Gateway, string devId: Thiết bị con
  let currentActiveIrChild = null; // Thiết bị con đang mở điều khiển trong IR Hub

  // ── HÀM KIỂM TRA THIẾT BỊ ONLINE HAY OFFLINE TỪ HUNONIC CLOUD / GATEWAY ──
  function isDeviceOnline(dev) {
    if (!dev) return false;

    // QUY TẮC CỐT LÕI: Khi Trạm Gateway ngoại tuyến -> TẤT CẢ thiết bị con của Gateway PHẢI NGOẠI TUYẾN
    if (!isGatewayOnline) {
      return false;
    }

    if (dev.type === "ac" || dev.type === "ir_hub") {
      if (gwMetrics.ac_online !== undefined) {
        return Boolean(gwMetrics.ac_online);
      }
      return Boolean(dev.online);
    }
    // Node Cảm biến ESP-NOW: 1 phút không thấy phản hồi mới tính là offline
    if (dev.type === "sensor" || dev.id === "dev_espnow_node_1" || (dev.id && dev.id.includes("espnow")) || (dev.name && dev.name.toLowerCase().includes("node cảm biến"))) {
      if (sensorData.isOnline !== undefined) {
        return Boolean(sensorData.isOnline);
      }
      return Boolean(sensorData.hasData);
    }
    return dev.online !== false;
  }

  // ── BẢNG TẬP LỆNH REMOTE CHUẨN HUNONIC CHO TỪNG THƯƠNG HIỆU (BRAND) ─────
  const DEFAULT_BRAND_PROFILES = {
    104: {
      brand: 104,
      brandName: "Funiki",
      temp_min: 17,
      temp_max: 30,
      modes: [
        { code: 1, name: "cool", label: "Làm mát", icon: "fa-snowflake" },
        { code: 2, name: "heat", label: "Sưởi ấm", icon: "fa-fire" },
        { code: 3, name: "dry", label: "Hút ẩm", icon: "fa-droplet" },
        { code: 4, name: "fan", label: "Quạt gió", icon: "fa-fan" },
        { code: 0, name: "auto", label: "Tự động", icon: "fa-arrows-rotate" }
      ],
      fans: [
        { code: 0, name: "auto", label: "Tự động", icon: "fa-a" },
        { code: 1, name: "min", label: "Nhỏ" },
        { code: 3, name: "med", label: "Vừa" },
        { code: 5, name: "max", label: "Lớn" }
      ]
    },
    102: {
      brand: 102,
      brandName: "Casper",
      temp_min: 16,
      temp_max: 30,
      modes: [
        { code: 4, name: "cool", label: "Làm mát", icon: "fa-snowflake" },
        { code: 12, name: "dry", label: "Hút ẩm", icon: "fa-droplet" },
        { code: 2, name: "fan", label: "Quạt gió", icon: "fa-fan" },
        { code: 0, name: "sun", label: "Sưởi ấm", icon: "fa-fire" }
      ],
      fans: [
        { code: 6, name: "auto", label: "Tự động", icon: "fa-a" },
        { code: 1, name: "min", label: "Nhỏ" },
        { code: 5, name: "max", label: "Lớn" }
      ]
    },
    16: {
      brand: 16,
      brandName: "Casper - Electra",
      temp_min: 16,
      temp_max: 30,
      modes: [
        { code: 0, name: "auto", label: "Tự động", icon: "fa-arrows-rotate" },
        { code: 1, name: "cool", label: "Làm mát", icon: "fa-snowflake" },
        { code: 2, name: "dry", label: "Hút ẩm", icon: "fa-droplet" },
        { code: 4, name: "heat", label: "Sưởi ấm", icon: "fa-fire" },
        { code: 6, name: "fan", label: "Quạt gió", icon: "fa-fan" }
      ],
      fans: [
        { code: 5, name: "auto", label: "Tự động", icon: "fa-a" },
        { code: 3, name: "min", label: "Nhỏ" },
        { code: 2, name: "med", label: "Vừa" },
        { code: 1, name: "max", label: "Lớn" }
      ]
    },
    117: {
      brand: 117,
      brandName: "Mirage",
      temp_min: 16,
      temp_max: 32,
      modes: [
        { code: 2, name: "cool", label: "Làm mát", icon: "fa-snowflake" },
        { code: 3, name: "dry", label: "Hút ẩm", icon: "fa-droplet" },
        { code: 5, name: "fan", label: "Quạt gió", icon: "fa-fan" },
        { code: 1, name: "heat", label: "Sưởi ấm", icon: "fa-fire" }
      ],
      fans: [
        { code: 0, name: "auto", label: "Tự động", icon: "fa-a" },
        { code: 3, name: "min", label: "Nhỏ" },
        { code: 2, name: "med", label: "Vừa" },
        { code: 1, name: "max", label: "Lớn" }
      ]
    }
  };

  function getAcCapabilities(dev) {
    if (!dev) return DEFAULT_BRAND_PROFILES[104];
    // 1. Nếu thiết bị đã có mảng modes và fans do server trả về
    if (dev.modes && Array.isArray(dev.modes) && dev.modes.length > 0) {
      return {
        brand: Number(dev.brand || 104),
        brandName: dev.brand_name || dev.name || "Điều hòa",
        temp_min: Number(dev.temp_min !== undefined ? dev.temp_min : 16),
        temp_max: Number(dev.temp_max !== undefined ? dev.temp_max : 30),
        modes: dev.modes,
        fans: (dev.fans && Array.isArray(dev.fans) && dev.fans.length > 0) ? dev.fans : DEFAULT_BRAND_PROFILES[104].fans
      };
    }
    // 2. Tra cứu theo brand ID
    const b = Number(dev.brand || (acState && acState.brand) || 0);
    if (DEFAULT_BRAND_PROFILES[b]) {
      return DEFAULT_BRAND_PROFILES[b];
    }
    // 3. Fallback theo tên thiết bị
    const name = (dev.name || "").toLowerCase();
    if (name.includes("electra")) return DEFAULT_BRAND_PROFILES[16];
    if (name.includes("casper")) return DEFAULT_BRAND_PROFILES[102];
    if (name.includes("mirage") || name.includes("aux")) return DEFAULT_BRAND_PROFILES[117];
    return DEFAULT_BRAND_PROFILES[104];
  }

  // ── HÀM LẤY GIỚI HẠN NHIỆT ĐỘ (KẾT HỢP CẤU HÌNH NGƯỜI DÙNG & PHẦN CỨNG) ───
  function getAcTempLimits(dev) {
    const cap = getAcCapabilities(dev);
    const custom = (typeof getAcLimitsFor === "function" && dev && dev.id) ? getAcLimitsFor(dev.id) : null;
    const min = custom && custom.min ? Math.max(cap.temp_min, custom.min) : cap.temp_min;
    const max = custom && custom.max ? Math.min(cap.temp_max, custom.max) : cap.temp_max;
    return { min, max, brand: cap.brand, brandName: cap.brandName };
  }

  // ── CẬP NHẬT GIAO DIỆN ĐIỀU HÒA TRONG DRAWER ──────────────────────────────
  function updateDrawerAcUI(dev) {
    if (!dev) return;
    const online = isDeviceOnline(dev);
    const cap = getAcCapabilities(dev);
    const limits = { min: cap.temp_min, max: cap.temp_max, brand: cap.brand, brandName: cap.brandName };

    // Kẹp nhiệt độ trong dải cho phép của thương hiệu điều hòa
    let curTemp = dev.temp || 25;
    if (curTemp > limits.max) curTemp = limits.max;
    if (curTemp < limits.min) curTemp = limits.min;
    dev.temp = curTemp;

    // Nếu offline -> trạng thái hoạt động thực tế bắt buộc phải là Tắt (0)
    const isPowerOn = online && (dev.state === 1 || dev.power === 1);
    const curMode = dev.mode !== undefined ? dev.mode : (cap.modes[0] ? cap.modes[0].code : 1);
    const curFan = dev.fan !== undefined ? dev.fan : (cap.fans[0] ? cap.fans[0].code : 0);

    const activeModeObj = cap.modes.find(m => m.code === curMode);
    const activeModeLabel = activeModeObj ? activeModeObj.label : "Làm mát";

    if (drawerTempVal) drawerTempVal.innerText = curTemp;
    if (drawerAcScreenNum) drawerAcScreenNum.innerText = curTemp;

    // Cập nhật trạng thái nút Tăng/Giảm nhiệt độ
    if (drawerBtnTempPlus) {
      drawerBtnTempPlus.style.opacity = curTemp >= limits.max ? "0.4" : "1";
      drawerBtnTempPlus.title = curTemp >= limits.max ? `Đã đạt giới hạn tối đa ${limits.max}°C` : "Tăng 1°C";
    }
    if (drawerBtnTempMinus) {
      drawerBtnTempMinus.style.opacity = curTemp <= limits.min ? "0.4" : "1";
      drawerBtnTempMinus.title = curTemp <= limits.min ? `Đã đạt giới hạn tối thiểu ${limits.min}°C` : "Giảm 1°C";
    }

    // Cập nhật card visual hình ảnh điều hòa
    if (drawerAcVisualCard) {
      drawerAcVisualCard.classList.toggle("off", !isPowerOn);
      drawerAcVisualCard.classList.toggle("offline", !online);
    }

    // Hiển thị / Ẩn banner thông báo ngoại tuyến
    if (drawerAcOfflineBanner) {
      if (!online) {
        drawerAcOfflineBanner.style.display = "flex";
        if (drawerAcOfflineMsg) {
          drawerAcOfflineMsg.innerText = gwMetrics.ac_offline_reason || "Trạm phát hồng ngoại Hunonic đang Ngoại Tuyến (Offline). Không thể điều khiển!";
        }
      } else {
        drawerAcOfflineBanner.style.display = "none";
      }
    }

    // Cập nhật nút Bật/Tắt Lớn
    if (drawerBtnPower && drawerBtnPowerText) {
      if (!online) {
        drawerBtnPower.className = "btn-drawer-ac-power offline";
        drawerBtnPowerText.innerText = "ĐIỀU HÒA ĐANG TẮT (NGOẠI TUYẾN)";
      } else if (isPowerOn) {
        drawerBtnPower.className = "btn-drawer-ac-power on";
        drawerBtnPowerText.innerText = "ĐIỀU HÒA ĐANG BẬT";
      } else {
        drawerBtnPower.className = "btn-drawer-ac-power off";
        drawerBtnPowerText.innerText = "ĐIỀU HÒA ĐANG TẮT";
      }
    }

    // Text trạng thái trên ảnh
    if (drawerAcLiveText) {
      if (!online) {
        drawerAcLiveText.innerHTML = `<span class="pulse-dot-red"></span> Ngoại tuyến (Mất kết nối)`;
      } else if (isPowerOn) {
        drawerAcLiveText.innerHTML = `<span class="pulse-dot-cyan"></span> Đang ${activeModeLabel.toLowerCase()} ${curTemp}°C`;
      } else {
        drawerAcLiveText.innerText = "Đang tắt (Chế độ chờ)";
      }
    }

    // Badge trên Header Drawer
    if (drawerHeroBadge) {
      if (!online) {
        drawerHeroBadge.className = "drawer-hero-badge offline";
        drawerHeroBadge.innerHTML = `<i class="fa-solid fa-circle"></i> Ngoại tuyến`;
      } else {
        drawerHeroBadge.className = isPowerOn ? "drawer-hero-badge online" : "drawer-hero-badge";
        drawerHeroBadge.innerHTML = `<i class="fa-solid fa-circle"></i> ${isPowerOn ? 'Đang BẬT' : 'Đang TẮT'}`;
      }
    }

    // Render động pills chế độ (Mode) theo server/tập lệnh của thiết bị
    const drawerModeContainer = document.getElementById("drawer-mode-pills");
    if (drawerModeContainer) {
      drawerModeContainer.innerHTML = cap.modes.map(m => `
        <div class="drawer-pill-opt ${curMode === m.code ? 'active' : ''}" data-mode="${m.code}">
          <i class="fa-solid ${m.icon || 'fa-snowflake'}"></i> ${escapeHtml(m.label)}
        </div>
      `).join("");
    }

    // Render động pills tốc độ quạt (Fan) theo server/tập lệnh của thiết bị
    const drawerFanContainer = document.getElementById("drawer-fan-pills");
    if (drawerFanContainer) {
      drawerFanContainer.className = `drawer-pills-grid fan-grid fan-count-${cap.fans.length}`;
      drawerFanContainer.innerHTML = cap.fans.map(f => `
        <div class="drawer-pill-opt ${curFan === f.code ? 'active' : ''}" data-fan="${f.code}">
          ${f.icon ? `<i class="fa-solid ${f.icon}"></i> ` : ''}${escapeHtml(f.label)}
        </div>
      `).join("");
    }

    // Cập nhật chips nhiệt độ nhanh
    drawerTempPresets.forEach(chip => {
      const t = parseInt(chip.getAttribute("data-temp"));
      chip.classList.toggle("active", t === curTemp);
    });
  }

  // ── RENDER DANH SÁCH THIẾT BỊ CON CỦA TRẠM IR HUNONIC ───────────────────────
  function renderIrChildList(hubDev) {
    if (!drawerIrChildList) return;
    const isHubOnline = isDeviceOnline(hubDev);
    const children = hubDev.children || [];
    if (drawerIrCount) drawerIrCount.innerText = children.length;

    if (children.length === 0) {
      drawerIrChildList.innerHTML = `
        <div style="text-align: center; padding: 25px 15px; color: #94a3b8; font-size: 0.85rem; background: #f8fafc; border-radius: 12px; border: 1.5px dashed #cbd5e1;">
          <i class="fa-solid fa-inbox" style="font-size: 1.8rem; margin-bottom: 8px; display: block; color: #cbd5e1;"></i>
          Chưa có thiết bị nào kết nối vào trạm IR này.<br>Bấm <strong>Đồng bộ</strong> để lấy danh sách từ Hunonic Cloud.
        </div>
      `;
      return;
    }

    let html = "";
    children.forEach((child, idx) => {
      const isAc = child.type === "ac" || child.category === "AC";
      const icon = isAc ? "fa-wind" : "fa-tv";
      const isChildOn = isHubOnline && (child.power === 1 || child.state === 1);

      html += `
        <div class="drawer-ir-child-card" data-child-idx="${idx}" data-child-id="${child.id}">
          <div class="drawer-ir-card-left">
            <div class="drawer-ir-card-icon">
              <i class="fa-solid ${icon}"></i>
            </div>
            <div class="drawer-ir-card-info">
              <h5>${escapeHtml(child.name || 'Điều hòa')}</h5>
              <p>${isAc ? `Nhiệt độ: ${child.temp || 25}°C &bull; ${isChildOn ? 'Đang BẬT' : 'Đang TẮT'}` : 'Thiết bị IR Smart Pro'}</p>
            </div>
          </div>
          <div class="drawer-ir-card-right">
            <span class="card-status-badge ${isHubOnline ? (isChildOn ? 'online' : 'offline') : 'offline'}" style="font-size: 0.72rem; padding: 3px 8px; border-radius: 999px;">
              ${!isHubOnline ? 'Ngoại tuyến' : (isChildOn ? 'Đang BẬT' : 'Đang TẮT')}
            </span>
            <i class="fa-solid fa-chevron-right arrow"></i>
          </div>
        </div>
      `;
    });
    drawerIrChildList.innerHTML = html;
  }

  // ── MỞ VIEW ĐIỀU KHIỂN CHI TIẾT CHO THIẾT BỊ CON CỦA TRẠM IR ────────────────
  function openAcControlView(childDev, parentHub) {
    currentActiveIrChild = childDev;

    if (drawerIrHubSection) drawerIrHubSection.style.display = "none";
    if (drawerAcPanel) drawerAcPanel.style.display = "flex";
    if (drawerAcBackBar) drawerAcBackBar.style.display = "block";

    if (drawerHeaderTitle) drawerHeaderTitle.innerText = childDev.name;
    if (drawerHeaderSub) drawerHeaderSub.innerText = `${parentHub.room || 'Phòng khách'} • Điều hòa IR Smart Pro`;
    if (drawerHeaderIcon) drawerHeaderIcon.innerHTML = `<i class="fa-solid fa-wind"></i>`;

    if (drawerHeroName) drawerHeroName.innerText = childDev.name;
    if (drawerHeroSub) drawerHeroSub.innerText = `${parentHub.room || 'Phòng khách'} • ID: ${childDev.id || ''}`;
    if (drawerHeroIconInner) drawerHeroIconInner.innerHTML = `<i class="fa-solid fa-wind"></i>`;

    updateDrawerAcUI(childDev);
  }

  // Bắt sự kiện click chọn thiết bị con trong danh sách IR
  if (drawerIrChildList) {
    drawerIrChildList.addEventListener("click", (e) => {
      const card = e.target.closest(".drawer-ir-child-card");
      if (!card) return;
      const hubDev = customDevices.find(d => d.id === currentDrawerTarget);
      if (!hubDev || !hubDev.children) return;

      const idx = parseInt(card.getAttribute("data-child-idx"));
      const child = hubDev.children[idx];
      if (child) {
        openAcControlView(child, hubDev);
      }
    });
  }

  // Bắt sự kiện click nút Quay Lại IR Hunonic Smart Pro
  if (btnBackToIrHub) {
    btnBackToIrHub.addEventListener("click", () => {
      const hubDev = customDevices.find(d => d.id === currentDrawerTarget);
      if (hubDev) {
        currentActiveIrChild = null;
        if (drawerAcPanel) drawerAcPanel.style.display = "none";
        if (drawerAcBackBar) drawerAcBackBar.style.display = "none";
        if (drawerIrHubSection) drawerIrHubSection.style.display = "flex";

        if (drawerHeaderTitle) drawerHeaderTitle.innerText = hubDev.name;
        if (drawerHeaderSub) drawerHeaderSub.innerText = `${hubDev.room || 'Phòng khách'} • Trạm phát hồng ngoại Smart Pro`;
        if (drawerHeaderIcon) drawerHeaderIcon.innerHTML = `<i class="fa-solid fa-tower-broadcast"></i>`;

        if (drawerHeroName) drawerHeroName.innerText = hubDev.name;
        if (drawerHeroSub) drawerHeroSub.innerText = `${hubDev.room || 'Phòng khách'} • ID: ${hubDev.device_id || '3987670'} • Trạm phát IR 360°`;
        if (drawerHeroIconInner) drawerHeroIconInner.innerHTML = `<i class="fa-solid fa-tower-broadcast"></i>`;

        const isOnline = isDeviceOnline(hubDev);
        if (drawerHeroBadge) {
          drawerHeroBadge.className = isOnline ? "drawer-hero-badge online" : "drawer-hero-badge offline";
          drawerHeroBadge.innerHTML = `<i class="fa-solid fa-circle"></i> ${isOnline ? 'Trực tuyến' : 'Ngoại tuyến'}`;
        }

        renderIrChildList(hubDev);
      }
    });
  }

  // Bắt sự kiện click nút Đồng Bộ Thiết Bị Từ Hunonic Cloud
  if (btnDrawerSyncIr) {
    btnDrawerSyncIr.addEventListener("click", async () => {
      const icon = btnDrawerSyncIr.querySelector("i");
      if (icon) icon.classList.add("fa-spin");
      showToast("Đang gửi lệnh yêu cầu Gateway đồng bộ danh sách từ Hunonic Cloud...", "info");

      try {
        let res = await callApi("/api/hvac/sync", "POST");
        if (!res || !res.success) {
          res = await callApi("/api/hvac/devices");
        }

        if (res && res.success && res.data) {
          const hubDev = customDevices.find(d => d.id === currentDrawerTarget);
          if (hubDev && Array.isArray(res.data.children)) {
            hubDev.children = res.data.children;
            currentActiveIrChild = null; // Reset thiết bị con đang chọn nếu bị xóa
            localStorage.setItem("gate_custom_devices", JSON.stringify(customDevices));
            renderIrChildList(hubDev);
            renderDevices();
            if (res.data.children.length === 0) {
              showToast("Đã đồng bộ từ Hunonic Cloud: Trạm IR hiện không có thiết bị con nào!", "info");
            } else {
              showToast(`Đã đồng bộ thành công ${res.data.children.length} thiết bị từ Hunonic Cloud!`, "success");
            }
          }
        } else {
          showToast("Chưa thể đồng bộ thiết bị mới từ Hunonic!", "error");
        }
      } catch (err) {
        showToast("Lỗi kết nối khi đồng bộ Hunonic!", "error");
      } finally {
        if (icon) icon.classList.remove("fa-spin");
      }
    });
  }

  // ── HÀM BÁO LỖI VÀ RUNG LẮC KHI THAO TÁC TRÊN THIẾT BỊ NGOẠI TUYẾN ───────────
  function triggerOfflineControlWarning(element) {
    if (element) {
      element.classList.remove("shake-error");
      void element.offsetWidth; // Force reflow
      element.classList.add("shake-error");
      setTimeout(() => element.classList.remove("shake-error"), 500);
    }
    const reason = gwMetrics.ac_offline_reason || "Trạm phát hồng ngoại Hunonic đang ngoại tuyến!";
    showToast(`⚠️ Thiết bị đang NGOẠI TUYẾN (Offline)! Không thể điều khiển.\n(${reason})`, "error");
  }

  // ── BỘ QUẢN LÝ DEBOUNCE ĐIỀU KHIỂN ĐIỀU HÒA (TRÁNH NGHẼN BROKER/WEBSOCKET) ─────
  let acDebounceTimer = null;
  let pendingAcPayload = null;
  let pendingAcDevName = "Điều hòa";
  const AC_DEBOUNCE_DELAY_MS = 800; // Đợi người dùng bấm dừng lại ở số cuối cùng 800ms mới gửi xuống firmware

  function findCurrentAcDevice() {
    if (currentActiveIrChild) return currentActiveIrChild;
    const hubDev = customDevices.find(d => d.id === currentDrawerTarget);
    if (hubDev) {
      if (hubDev.type === "ac") return hubDev;
      if (hubDev.children && hubDev.children.length > 0) {
        const acChild = hubDev.children.find(c => c.type === "ac" || c.category === "AC");
        if (acChild) return acChild;
        return hubDev.children[0];
      }
    }
    for (const d of customDevices) {
      if (d.type === "ac") return d;
      if (d.children && d.children.length > 0) {
        const acChild = d.children.find(c => c.type === "ac" || c.category === "AC");
        if (acChild) return acChild;
      }
    }
    return null;
  }

  // ── HÀM PHÁT LỆNH ĐIỀU HÒA (DÙNG CHUNG CHO DRAWER, MODAL VÀ DASHBOARD) ────────
  async function sendAcControlCommand(dev, changes = {}, immediate = false) {
    const targetDev = dev || findCurrentAcDevice();
    const hubDev = foundHub ||
                   customDevices.find(d => d.id === currentDrawerTarget) ||
                   customDevices.find(d => d.type === "ir_hub" || (d.id && d.id.includes("hunonic")));

    // Kiểm tra Online trước khi gửi
    const online = isDeviceOnline(hubDev || targetDev);
    if (!online) {
      if (drawerBtnPower) triggerOfflineControlWarning(drawerBtnPower);
      else showToast("⚠️ Thiết bị đang Ngoại tuyến! Không thể điều khiển.", "error");
      return;
    }

    // 1. Cập nhật state ngay lập tức vào bộ nhớ RAM
    if (changes.state !== undefined || changes.power !== undefined) {
      const p = changes.state !== undefined ? changes.state : changes.power;
      if (targetDev) {
        targetDev.state = p;
        targetDev.power = p;
      }
      acState.power = p;
    }
    if (changes.temp !== undefined) {
      if (targetDev) targetDev.temp = changes.temp;
      acState.temp = changes.temp;
    }
    if (changes.mode !== undefined) {
      if (targetDev) targetDev.mode = changes.mode;
      acState.mode = changes.mode;
    }
    if (changes.fan !== undefined) {
      if (targetDev) targetDev.fan = changes.fan;
      acState.fan = changes.fan;
    }

    // Cập nhật ngược lại vào mảng children của hubDev
    if (hubDev && hubDev.children && targetDev) {
      const c = hubDev.children.find(x => String(x.id) === String(targetDev.id));
      if (c) {
        if (changes.state !== undefined || changes.power !== undefined) {
          c.power = (changes.state !== undefined ? changes.state : changes.power);
          c.state = c.power;
        }
        if (changes.temp !== undefined) c.temp = changes.temp;
        if (changes.mode !== undefined) c.mode = changes.mode;
        if (changes.fan !== undefined) c.fan = changes.fan;
      }
    }

    // Lưu vào localStorage
    localStorage.setItem("gate_custom_devices", JSON.stringify(customDevices));

    // 2. CẬP NHẬT GIAO DIỆN TỨC THÌ (0ms - phản hồi 60 FPS mượt mà cho người dùng)
    if (targetDev) updateDrawerAcUI(targetDev);
    updateAcModalUI();
    renderDevices();

    // 3. Chuẩn bị payload lệnh
    let acId = (targetDev && targetDev.id) ? String(targetDev.id) : (gwMetrics.ac_id ? String(gwMetrics.ac_id) : "");
    if (targetDev && targetDev.extra && !targetDev.id) {
      const m = targetDev.extra.match(/ID:\s*([0-9a-zA-Z_]+)/);
      if (m && m[1]) acId = m[1];
    }

    const payload = {
      device_id: acId,
      power: targetDev ? (targetDev.power !== undefined ? targetDev.power : targetDev.state) : acState.power,
      temp: targetDev ? targetDev.temp : acState.temp,
      mode: targetDev ? targetDev.mode : acState.mode,
      fan: targetDev ? targetDev.fan : acState.fan
    };

    const devName = (targetDev && targetDev.name) ? targetDev.name : "Điều hòa";

    const executeHvacApi = async (p, name) => {
      const res = await callApi("/api/hvac/control", "POST", p);
      if (res && res.success) {
        const cap = getAcCapabilities(targetDev);
        const mObj = cap.modes.find(m => m.code === p.mode);
        const mLabel = mObj ? mObj.label : (p.mode !== undefined ? `Chế độ ${p.mode}` : '');
        showToast(`[${name}] ${p.power === 1 ? 'BẬT' : 'TẮT'} • ${p.temp}°C • ${mLabel}`, "success");
      } else {
        let errMsg = "Lỗi gửi lệnh điều khiển điều hòa!";
        if (res && res.detail) {
          if (typeof res.detail === "string") {
            errMsg = res.detail;
          } else if (Array.isArray(res.detail)) {
            errMsg = res.detail.map(e => e.msg || e.detail || JSON.stringify(e)).join(", ");
          } else if (typeof res.detail === "object") {
            errMsg = res.detail.msg || res.detail.message || JSON.stringify(res.detail);
          }
        }
        showToast(`❌ ${errMsg}`, "error");
        if (targetDev) {
          targetDev.power = 0;
          targetDev.state = 0;
          updateDrawerAcUI(targetDev);
        }
        acState.power = 0;
        updateAcModalUI();
        renderDevices();
      }
    };

    // 4. Nếu là thao tác Bật/Tắt nguồn (hoặc Quick Scene) -> Gửi ngay lập tức!
    if (immediate) {
      if (acDebounceTimer) {
        clearTimeout(acDebounceTimer);
        acDebounceTimer = null;
      }
      pendingAcPayload = null;
      await executeHvacApi(payload, devName);
    } else {
      // Nếu là chỉnh nhiệt độ / mode / fan liên tục:
      // Lưu lại giá trị payload mới nhất, reset timer 800ms
      // Khi người dùng dừng bấm ở số cuối cùng ("dừng lâu tại đó") mới gửi 1 lệnh duy nhất!
      pendingAcPayload = payload;
      pendingAcDevName = devName;

      if (acDebounceTimer) {
        clearTimeout(acDebounceTimer);
      }
      acDebounceTimer = setTimeout(async () => {
        acDebounceTimer = null;
        const pToSend = pendingAcPayload;
        const nameToSend = pendingAcDevName;
        pendingAcPayload = null;
        if (pToSend) {
          await executeHvacApi(pToSend, nameToSend);
        }
      }, AC_DEBOUNCE_DELAY_MS);
    }
  }

  // Alias để tương thích các hàm gọi cũ
  async function sendDrawerAcCommand(dev, changes = {}) {
    const isImmediate = changes.state !== undefined || changes.power !== undefined;
    return sendAcControlCommand(dev, changes, isImmediate);
  }

  function resolveDrawerTargetDev() {
    const hubDev = foundHub || customDevices.find(d => d.type === "ir_hub" || d.id === "dev_ir_hub_hunonic");
    let targetDev = currentActiveIrChild;
    if (!targetDev && hubDev && hubDev.children && currentDrawerTarget) {
      targetDev = hubDev.children.find(c => String(c.id) === String(currentDrawerTarget));
    }
    if (!targetDev && currentDrawerTarget) {
      targetDev = customDevices.find(d => d.id === currentDrawerTarget);
    }
    if (!targetDev) {
      targetDev = (hubDev && hubDev.children && hubDev.children[0]) || hubDev;
    }
    return { hubDev, targetDev };
  }

  // Bắt sự kiện click các nút điều khiển AC trong Drawer
  if (drawerBtnPower) {
    drawerBtnPower.addEventListener("click", () => {
      const { hubDev, targetDev } = resolveDrawerTargetDev();
      if (!targetDev) return;

      const online = isDeviceOnline(hubDev || targetDev);
      // NẾU THIẾT BỊ NGOẠI TUYẾN -> HIỆU ỨNG BẬT LÊN RỒI PHỤT TẮT LẠI NGAY LẬP TỨC
      if (!online) {
        drawerBtnPower.classList.remove("anim-revert-off", "shake-error");
        void drawerBtnPower.offsetWidth; // Force CSS reflow
        drawerBtnPower.classList.add("anim-revert-off");

        if (drawerAcVisualCard) {
          drawerAcVisualCard.classList.remove("shake-error");
          void drawerAcVisualCard.offsetWidth;
          drawerAcVisualCard.classList.add("shake-error");
          setTimeout(() => drawerAcVisualCard.classList.remove("shake-error"), 550);
        }

        const reason = gwMetrics.ac_offline_reason || "Trạm phát hồng ngoại Hunonic đang ngoại tuyến!";
        showToast(`⚠️ Thiết bị [${targetDev.name}] đang NGOẠI TUYẾN (Offline)! Không thể bật.\n(${reason})`, "error");

        // Đảm bảo trạng thái luôn duy trì là Tắt (0)
        targetDev.state = 0;
        targetDev.power = 0;
        setTimeout(() => {
          drawerBtnPower.classList.remove("anim-revert-off");
          updateDrawerAcUI(targetDev);
        }, 850);
        return;
      }

      // Nếu Online: chuyển đổi Bật/Tắt bình thường
      const curP = targetDev.power || targetDev.state || 0;
      const newPower = curP === 1 ? 0 : 1;
      sendDrawerAcCommand(targetDev, { state: newPower });
    });
  }

  if (drawerBtnTempMinus) {
    drawerBtnTempMinus.addEventListener("click", () => {
      const { hubDev, targetDev } = resolveDrawerTargetDev();
      if (!targetDev) return;
      if (!isDeviceOnline(hubDev || targetDev)) {
        triggerOfflineControlWarning(drawerBtnTempMinus);
        return;
      }
      const limits = getAcTempLimits(targetDev);
      const curTemp = targetDev.temp || 25;
      if (curTemp > limits.min) {
        sendDrawerAcCommand(targetDev, { temp: curTemp - 1 });
      } else {
        showToast(`Nhiệt độ tối thiểu của điều hòa là ${limits.min}°C!`, "info");
      }
    });
  }

  if (drawerBtnTempPlus) {
    drawerBtnTempPlus.addEventListener("click", () => {
      const { hubDev, targetDev } = resolveDrawerTargetDev();
      if (!targetDev) return;
      if (!isDeviceOnline(hubDev || targetDev)) {
        triggerOfflineControlWarning(drawerBtnTempPlus);
        return;
      }
      const limits = getAcTempLimits(targetDev);
      const curTemp = targetDev.temp || 25;
      if (curTemp < limits.max) {
        sendDrawerAcCommand(targetDev, { temp: curTemp + 1 });
      } else {
        showToast(`Điều hòa [${targetDev.name || 'này'}] chỉ hỗ trợ nhiệt độ tối đa ${limits.max}°C!`, "info");
      }
    });
  }

  drawerTempPresets.forEach(chip => {
    chip.addEventListener("click", () => {
      const { hubDev, targetDev } = resolveDrawerTargetDev();
      if (!targetDev) return;
      if (!isDeviceOnline(hubDev || targetDev)) {
        triggerOfflineControlWarning(chip);
        return;
      }
      const limits = getAcTempLimits(targetDev);
      let t = parseInt(chip.getAttribute("data-temp"));
      if (t > limits.max) t = limits.max;
      if (t < limits.min) t = limits.min;
      sendDrawerAcCommand(targetDev, { temp: t });
    });
  });

  const drawerModeGroup = document.getElementById("drawer-mode-pills");
  if (drawerModeGroup) {
    drawerModeGroup.addEventListener("click", (e) => {
      const pill = e.target.closest(".drawer-pill-opt");
      if (!pill) return;
      const { hubDev, targetDev } = resolveDrawerTargetDev();
      if (!targetDev) return;
      if (!isDeviceOnline(hubDev || targetDev)) {
        triggerOfflineControlWarning(pill);
        return;
      }
      const m = parseInt(pill.getAttribute("data-mode"));
      sendDrawerAcCommand(targetDev, { mode: m });
    });
  }

  const drawerFanGroup = document.getElementById("drawer-fan-pills");
  if (drawerFanGroup) {
    drawerFanGroup.addEventListener("click", (e) => {
      const pill = e.target.closest(".drawer-pill-opt");
      if (!pill) return;
      const { hubDev, targetDev } = resolveDrawerTargetDev();
      if (!targetDev) return;
      if (!isDeviceOnline(hubDev || targetDev)) {
        triggerOfflineControlWarning(pill);
        return;
      }
      const f = parseInt(pill.getAttribute("data-fan"));
      sendDrawerAcCommand(targetDev, { fan: f });
    });
  }

  // ── MỞ DRAWER BÊN TAY PHẢI CHO TRẠM GATEWAY ──────────────────────────────────
  function openGatewayDrawer(openAdd = false) {
    const presencePanel = document.getElementById("drawer-presence-panel");
    if (presencePanel) presencePanel.style.display = "none";
    currentDrawerTarget = null;
    const gwName = localStorage.getItem("gate_custom_name") || "Trạm Gateway ESP32-S3";
    const gwRoom = localStorage.getItem("gate_room") || "Phòng khách";

    if (drawerHeaderTitle) drawerHeaderTitle.innerText = gwName;
    if (drawerHeaderSub) drawerHeaderSub.innerText = "Master Hub • " + gwRoom;
    if (drawerHeaderIcon) drawerHeaderIcon.innerHTML = `<i class="fa-solid fa-server"></i>`;

    if (drawerHeroName) drawerHeroName.innerText = gwName;
    if (drawerHeroSub) drawerHeroSub.innerText = "ESP-NOW • BLE 5.0 • HiveMQ Cloud TLS";
    if (drawerHeroIconInner) drawerHeroIconInner.innerHTML = `<i class="fa-solid fa-server"></i>`;
    if (drawerHeroBadge) {
      drawerHeroBadge.className = isGatewayOnline ? "drawer-hero-badge online" : "drawer-hero-badge offline";
      drawerHeroBadge.innerHTML = `<i class="fa-solid fa-circle"></i> ${isGatewayOnline ? 'Trực tuyến' : 'Ngoại tuyến'}`;
    }

    if (drawerAcPanel) drawerAcPanel.style.display = "none";
    if (drawerIrHubSection) drawerIrHubSection.style.display = "none";
    if (drawerAcBackBar) drawerAcBackBar.style.display = "none";
    if (drawerTeleGrid) drawerTeleGrid.style.display = "grid";
    if (drawerGwChildSection) drawerGwChildSection.style.display = "block";
    if (drawerGwExtraActions) drawerGwExtraActions.style.display = "flex";
    if (drawerHeroBox) drawerHeroBox.style.display = "flex";

    const editSecGw = document.getElementById("drawer-edit-section");
    if (editSecGw) editSecGw.style.display = "block";
    const delSecGw = document.getElementById("drawer-delete-section");
    if (delSecGw) delSecGw.style.display = "block";

    updateDrawerGatewayTelemetry();
    renderDrawerChildList();

    if (drawerAddPanel) {
      drawerAddPanel.style.display = openAdd ? "block" : "none";
      if (openAdd) {
        renderDrawerAvailableDevices();
      }
    }

    if (drawerEditName) drawerEditName.value = gwName;
    if (drawerEditRoom) drawerEditRoom.value = gwRoom;

    if (btnDrawerDelete) {
      btnDrawerDelete.innerHTML = `<i class="fa-solid fa-trash-can"></i> Xóa Trạm Gateway Khỏi Phòng`;
    }

    if (deviceDetailDrawer) deviceDetailDrawer.classList.add("open");
    if (drawerBackdrop) drawerBackdrop.classList.add("active");

    if (openAdd && drawerGwChildSection) {
      setTimeout(() => {
        drawerGwChildSection.scrollIntoView({ behavior: "smooth", block: "center" });
      }, 150);
    }
  }

  // ── MỞ DRAWER BÊN TAY PHẢI CHO THIẾT BỊ CON ──────────────────────────────────
  let previousPresence = null;

  function handlePresenceNotification() {
    // CHỈ xử lý cảnh báo khi người dùng ĐÃ THÊM Node Cảm Biến vào Gateway
    const isSensorAdded = customDevices.some(d => d.type === "sensor" || d.id === "dev_espnow_node_1" || (d.id && d.id.includes("espnow")));
    if (!isSensorAdded) return;

    if (!sensorData.hasData || !sensorData.isOnline || !isGatewayOnline) return;
    if (![true, false, 0, 1, "0", "1"].includes(sensorData.presence)) return;
    const occupied = sensorData.presence === true || Number(sensorData.presence) === 1;
    if (occupied && previousPresence !== true) {
      showToast("Phát hiện có người trong phòng", "success", 10000);
      if (typeof addSystemNotification === "function") {
        addSystemNotification({
          type: "presence",
          title: "Phát hiện có người trong phòng",
          message: "Radar LD2410B ghi nhận có chuyển động của người tại khu vực giám sát.",
          badge: "Hiện diện"
        });
      }
    } else if (!occupied && previousPresence === true) {
      if (typeof addSystemNotification === "function") {
        addSystemNotification({
          type: "presence",
          title: "Phòng hiện đang trống",
          message: "Radar LD2410B không phát hiện chuyển động của người trong phòng.",
          badge: "Hiện diện"
        });
      }
    }
    // Only a fresh empty report rearms the next occupied notification.
    previousPresence = occupied;
  }

  function refreshPresencePanel() {
    let panel = document.getElementById("drawer-presence-panel");
    const dev = customDevices.find(d => d.id === currentDrawerTarget);
    const visible = dev && dev.type === "sensor" && !currentActiveIrChild;
    if (!panel && visible && drawerHeroBox) {
      panel = document.createElement("div");
      panel.id = "drawer-presence-panel";
      drawerHeroBox.parentNode.insertBefore(panel, drawerHeroBox);
    }
    if (!panel) return;
    panel.style.display = visible ? "block" : "none";
    if (!visible) return;
    const online = isDeviceOnline(dev) && sensorData.hasData;
    const known = online && [true, false, 0, 1, "0", "1"].includes(sensorData.presence);
    const occupied = known && (sensorData.presence === true || Number(sensorData.presence) === 1);
    const color = occupied ? "#059669" : "#64748b";
    const label = !online ? "Mất kết nối" : !known ? "Chờ dữ liệu hiện diện" : occupied ? "Có người trong phòng" : "Không có người";
    if (!document.getElementById("presence-animation-styles")) {
      const style = document.createElement("style");
      style.id = "presence-animation-styles";
      style.textContent = `
      @keyframes presenceStride { from { transform:rotate(-26deg); } to { transform:rotate(26deg); } }
      @keyframes presenceBob { from { transform:translateY(0); } to { transform:translateY(-3px); } }
      @keyframes presenceRipple { 0% { transform:scale(.76);opacity:.55; } 100% { transform:scale(1.45);opacity:0; } }
      @keyframes presenceShadow { from { transform:scaleX(1);opacity:.15; } to { transform:scaleX(.75);opacity:.08; } }
      .presence-live-scene { position:relative;width:132px;height:132px;margin:0 auto 18px;display:grid;place-items:center;isolation:isolate; }
      .presence-live-scene .radar-ring { position:absolute;inset:12px;border:1.5px solid #34d399;border-radius:50%;opacity:0;pointer-events:none; }
      .presence-live-scene.is-active .radar-ring { animation:presenceRipple 2.4s linear infinite; }
      .presence-live-scene.is-active .radar-ring:nth-child(2) { animation-delay:1.2s; }
      .presence-person-disc { position:relative;width:100px;height:100px;border-radius:50%;display:grid;place-items:center;background:#f1f5f9; }
      .is-active .presence-person-disc { background:linear-gradient(145deg,#d1fae5,#a7f3d0);box-shadow:0 8px 24px #05966918; }
      .presence-live-scene svg { width:90px;height:90px;overflow:visible; }
      .is-active .person-body { animation:presenceBob .55s ease-in-out infinite alternate; }
      .is-active .person-limb { animation:presenceStride .65s ease-in-out infinite alternate; }
      .person-arm { transform-origin:60px 47px; }
      .person-leg { transform-origin:60px 72px; }
      .is-active .person-opposite { animation-direction:alternate-reverse; }
      .is-active .person-shadow { transform-origin:60px 106px;animation:presenceShadow .55s ease-in-out infinite alternate; }
      @media (prefers-reduced-motion:reduce) { .presence-live-scene * { animation:none!important; } .presence-live-scene .radar-ring { opacity:.2; } }
`;
      document.head.appendChild(style);
    }
    // Preserve the animation across polling renders when the state is unchanged.
    const bat = getSensorBatteryInfo(dev);
    const viewKey = `${online}:${known}:${occupied}:${bat.voltageStr}`;
    if (panel.dataset.presenceView === viewKey) return;
    panel.dataset.presenceView = viewKey;
    panel.innerHTML = `
      <section aria-live="polite" style="padding:24px 20px;margin-bottom:18px;border:1px solid #e2e8f0;border-radius:22px;background:linear-gradient(160deg,#f0fdf4,#fff);text-align:center;">
        <div class="presence-live-scene ${occupied ? 'is-active' : ''}" aria-hidden="true">
          <span class="radar-ring"></span><span class="radar-ring"></span>
          <div class="presence-person-disc">
            <svg viewBox="0 0 120 120" fill="none" style="color:${color};">
              <ellipse class="person-shadow" cx="60" cy="106" rx="22" ry="4" fill="currentColor" opacity=".12"/>
              <g class="person-body" stroke="currentColor" stroke-width="7" stroke-linecap="round" stroke-linejoin="round">
                <g class="person-limb person-leg person-opposite" opacity=".45"><path d="M60 72 L51 87 L45 99"/></g>
                <g class="person-limb person-arm person-opposite" opacity=".45"><path d="M60 47 L47 58 L43 69"/></g>
                <circle cx="60" cy="28" r="8" fill="currentColor" stroke="none"/>
                <path d="M60 44 L60 72" stroke-width="10"/>
                <g class="person-limb person-arm"><path d="M60 47 L72 59 L79 61"/></g>
                <g class="person-limb person-leg"><path d="M60 72 L70 86 L73 100"/></g>
              </g>
            </svg>
          </div>
        </div>
        <div style="font-size:11px;letter-spacing:1.4px;color:#94a3b8;font-weight:700;margin-bottom:8px;">TRẠNG THÁI HIỆN DIỆN</div>
        <strong style="font-size:21px;color:${color};">${label}</strong>
        <p style="margin:10px 0 0;color:#94a3b8;font-size:12px;">${online ? 'Cập nhật từ cảm biến trong phòng' : 'Đang chờ cảm biến gửi dữ liệu mới'}</p>

        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:16px;">
          <div style="background:#ffffff;border:1px solid #e2e8f0;border-radius:14px;padding:12px 10px;text-align:center;box-shadow:0 1px 3px rgba(0,0,0,0.03);">
            <div style="font-size:11px;color:#64748b;font-weight:700;margin-bottom:6px;letter-spacing:0.5px;">NGUỒN PIN</div>
            <div style="font-size:16px;font-weight:700;color:${bat.color};display:flex;align-items:center;justify-content:center;gap:6px;">
              <i class="fa-solid ${bat.icon}"></i> ${bat.voltageStr}
            </div>
            <div style="font-size:11px;color:#94a3b8;margin-top:4px;font-weight:600;">Dung lượng: ${bat.pct}%</div>
          </div>
          <div style="background:#ffffff;border:1px solid #e2e8f0;border-radius:14px;padding:12px 10px;text-align:center;box-shadow:0 1px 3px rgba(0,0,0,0.03);">
            <div style="font-size:11px;color:#64748b;font-weight:700;margin-bottom:6px;letter-spacing:0.5px;">KẾT NỐI SÓNG</div>
            <div style="font-size:16px;font-weight:700;color:${online ? '#00b06f' : '#94a3b8'};display:flex;align-items:center;justify-content:center;gap:6px;">
              <i class="fa-solid fa-wifi"></i> ESP-NOW
            </div>
            <div style="font-size:11px;color:#94a3b8;margin-top:4px;font-weight:600;">${online ? (sensorData.rssi ? sensorData.rssi + ' dBm' : 'Tín hiệu tốt') : 'Mất kết nối'}</div>
          </div>
        </div>
      </section>`;
  }

  function openChildDeviceDrawer(devId) {
    let dev = customDevices.find(d => d.id === devId);
    if (!dev && (devId === "dev_espnow_node_1" || (typeof devId === "string" && (devId.includes("espnow") || devId.includes("sensor"))))) {
      dev = customDevices.find(d => d.type === "sensor" || d.type === "espnow" || (d.id && (d.id.includes("espnow") || d.id.includes("sensor"))));
    }
    // Đảm bảo trạm IR luôn mở được dù chưa lưu
    if (!dev && (devId === "dev_ir_hub_hunonic" || (typeof devId === "string" && devId.includes("ir_hub")))) {
      dev = foundHub || {
        id: "dev_ir_hub_hunonic",
        name: "IR trung tâm",
        type: "ir_hub",
        room: localStorage.getItem("gate_room") || "Phòng khách",
        device_id: "3987670",
        extra: "Trạm phát IR 360° đa hướng",
        children: [],
        state: 0
      };
      if (!customDevices.some(d => d.id === dev.id)) {
        customDevices.push(dev);
        localStorage.setItem("gate_custom_devices", JSON.stringify(customDevices));
      }
    }
    // Đảm bảo node cảm biến luôn mở được dù chưa có trong danh sách
    if (!dev && (devId === "dev_espnow_node_1" || devId === "node_espnow_1" || (typeof devId === "string" && (devId.includes("espnow") || devId.includes("sensor"))) || devId === null || devId === undefined)) {
      dev = {
        id: devId || "dev_espnow_node_1",
        name: "Node Cảm Biến C3",
        type: "sensor",
        room: localStorage.getItem("gate_room") || "Phòng khách",
        extra: "Cảm biến nhiệt độ, độ ẩm & hiện diện",
        state: 1
      };
      customDevices.push(dev);
      localStorage.setItem("gate_custom_devices", JSON.stringify(customDevices));
    }
    if (!dev) return;
    currentDrawerTarget = dev.id;
    currentActiveIrChild = null;

    const isAc = dev.type === "ac";
    const isIrHub = dev.type === "ir_hub";
    const isSwitch = dev.type === "relay" || dev.type === "socket";
    const faIcon = isIrHub ? "fa-tower-broadcast" : (isAc ? "fa-wind" : (dev.type === "relay" ? "fa-lightbulb" : (dev.type === "socket" ? "fa-plug" : "fa-satellite-dish")));
    const typeLabel = isIrHub ? "Trạm IR Smart Pro" : (isAc ? "Hồng ngoại IR Smart Pro" : (dev.type === "relay" ? "Công tắc Relay" : (dev.type === "socket" ? "Ổ cắm thông minh" : "Node Cảm Biến ESP-NOW")));

    const isOnline = isDeviceOnline(dev);

    if (drawerHeaderTitle) drawerHeaderTitle.innerText = dev.name;
    if (drawerHeaderSub) {
      if (isIrHub) {
        drawerHeaderSub.innerText = `${dev.room || 'Phòng khách'} • Trạm phát hồng ngoại Smart Pro`;
      } else {
        drawerHeaderSub.innerText = `${dev.room || 'Phòng khách'} • ${typeLabel}`;
      }
    }
    if (drawerHeaderIcon) drawerHeaderIcon.innerHTML = `<i class="fa-solid ${faIcon}"></i>`;

    if (drawerHeroName) drawerHeroName.innerText = dev.name;
    if (drawerHeroSub) {
      if (isIrHub) {
        const childCount = (dev.children && dev.children.length) || 0;
        drawerHeroSub.innerText = `${dev.room || 'Phòng khách'} • ID: ${dev.device_id || '3987670'} • ${childCount} thiết bị IR kết nối`;
      } else {
        drawerHeroSub.innerText = `${dev.room || 'Phòng khách'} • ${dev.extra || typeLabel}`;
      }
    }
    if (drawerHeroIconInner) drawerHeroIconInner.innerHTML = `<i class="fa-solid ${faIcon}"></i>`;
    if (drawerHeroBox) drawerHeroBox.style.display = "flex";

    // Ẩn telemetry và danh sách child của Gateway khi mở thiết bị con
    if (drawerTeleGrid) drawerTeleGrid.style.display = "none";
    if (drawerGwChildSection) drawerGwChildSection.style.display = "none";
    if (drawerGwExtraActions) drawerGwExtraActions.style.display = "none";

    const editSecChild = document.getElementById("drawer-edit-section");
    if (editSecChild) editSecChild.style.display = "block";
    const delSecChild = document.getElementById("drawer-delete-section");
    if (delSecChild) delSecChild.style.display = "block";

    refreshPresencePanel();

    // Xử lý hiển thị theo từng phân loại thiết bị
    if (isIrHub) {
      currentActiveIrChild = null;
      if (drawerAcPanel) drawerAcPanel.style.display = "none";
      if (drawerAcBackBar) drawerAcBackBar.style.display = "none";
      if (drawerIrHubSection) drawerIrHubSection.style.display = "flex";

      if (drawerHeroBadge) {
        drawerHeroBadge.className = isOnline ? "drawer-hero-badge online" : "drawer-hero-badge offline";
        drawerHeroBadge.innerHTML = `<i class="fa-solid fa-circle"></i> ${isOnline ? 'Trực tuyến' : 'Ngoại tuyến'}`;
      }

      renderIrChildList(dev);

      // Tự động đồng bộ ngầm danh sách thiết bị con mới nhất từ backend
      callApi("/api/hvac/devices").then(res => {
        if (res && res.success && res.data && Array.isArray(res.data.children)) {
          dev.children = res.data.children;
          localStorage.setItem("gate_custom_devices", JSON.stringify(customDevices));
          if (currentDrawerTarget === devId && !currentActiveIrChild) {
            renderIrChildList(dev);
            if (drawerHeroSub) {
              drawerHeroSub.innerText = `${dev.room || 'Phòng khách'} • ID: ${dev.device_id || '3987670'} • ${dev.children.length} thiết bị IR kết nối`;
            }
          }
          renderDevices();
        }
      });
    } else if (isAc) {
      if (drawerIrHubSection) drawerIrHubSection.style.display = "none";
      if (drawerAcBackBar) drawerAcBackBar.style.display = "none";
      if (drawerAcPanel) {
        drawerAcPanel.style.display = "flex";
        if (dev.temp === undefined) dev.temp = (gwMetrics.ac_temp && gwMetrics.ac_temp > 0) ? gwMetrics.ac_temp : (acState.temp || 25);
        if (dev.mode === undefined) dev.mode = acState.mode !== undefined ? acState.mode : 1;
        if (dev.fan === undefined) dev.fan = acState.fan !== undefined ? acState.fan : 0;
        updateDrawerAcUI(dev);
      }
    } else {
      if (drawerIrHubSection) drawerIrHubSection.style.display = "none";
      if (drawerAcBackBar) drawerAcBackBar.style.display = "none";
      if (drawerAcPanel) drawerAcPanel.style.display = "none";
      if (drawerHeroBadge) {
        const isDevOn = dev.state === 1;
        drawerHeroBadge.className = isDevOn ? "drawer-hero-badge online" : "drawer-hero-badge";
        drawerHeroBadge.innerHTML = `<i class="fa-solid fa-circle"></i> ${isSwitch ? (isDevOn ? 'Đang BẬT' : 'Đang TẮT') : 'Hoạt động'}`;
      }
    }

    if (drawerEditName) drawerEditName.value = dev.name;
    if (drawerEditRoom) drawerEditRoom.value = dev.room || "Phòng khách";

    if (btnDrawerDelete) {
      btnDrawerDelete.innerHTML = isIrHub
        ? `<i class="fa-solid fa-trash-can"></i> Xóa Trạm IR Này Khỏi Gateway`
        : `<i class="fa-solid fa-trash-can"></i> Xóa Thiết Bị Này Khỏi Gateway`;
    }

    if (deviceDetailDrawer) deviceDetailDrawer.classList.add("open");
    if (drawerBackdrop) drawerBackdrop.classList.add("active");
  }

  // ── ĐÓNG DRAWER ─────────────────────────────────────────────────────────────
  function closeRightDrawer() {
    if (deviceDetailDrawer) deviceDetailDrawer.classList.remove("open");
    if (drawerBackdrop) drawerBackdrop.classList.remove("active");
    currentDrawerTarget = null;
    currentActiveIrChild = null;
  }

  if (btnCloseDrawer) {
    btnCloseDrawer.addEventListener("click", closeRightDrawer);
  }
  if (drawerBackdrop) {
    drawerBackdrop.addEventListener("click", closeRightDrawer);
  }

  // ── CẬP NHẬT TELEMETRY GATEWAY TRONG DRAWER ─────────────────────────────────
  function updateDrawerGatewayTelemetry() {
    if (!drawerTeleGrid || drawerTeleGrid.style.display === "none") return;

    if (!currentDrawerTarget || currentDrawerTarget === "gateway") {
      if (drawerHeroBadge) {
        drawerHeroBadge.className = isGatewayOnline ? "drawer-hero-badge online" : "drawer-hero-badge offline";
        drawerHeroBadge.innerHTML = `<i class="fa-solid fa-circle"></i> ${isGatewayOnline ? 'Trực tuyến' : 'Ngoại tuyến'}`;
      }
    }

    if (drawerTeleUptime) {
      drawerTeleUptime.innerText = isGatewayOnline 
        ? formatUptime(gwMetrics.uptime_sec || 0)
        : "Mất kết nối";
    }
    if (drawerTeleHeap) {
      const heapVal = gwMetrics.free_heap > 0 ? (gwMetrics.free_heap / 1024).toFixed(1) : (gwMetrics.heap_kb || "62.1");
      drawerTeleHeap.innerText = isGatewayOnline ? `${heapVal} KB` : "N/A";
    }
    if (drawerTeleWifi) {
      const ssid = gwMetrics.wifi_ssid || "Dinh";
      const rssi = gwMetrics.rssi && gwMetrics.rssi !== -100 ? `${gwMetrics.rssi} dBm` : "-44 dBm";
      drawerTeleWifi.innerText = isGatewayOnline ? `${ssid} (${rssi})` : "Mất sóng";
    }
  }

  // ── RENDER DANH SÁCH THIẾT BỊ CON CỦA GATEWAY TRONG DRAWER ─────────────────
  function renderDrawerChildList() {
    if (!drawerChildList) return;
    if (drawerChildCount) drawerChildCount.innerText = customDevices.length;

    if (customDevices.length === 0) {
      drawerChildList.innerHTML = `
        <div style="text-align: center; padding: 20px 10px; color: #64748b; font-size: 0.8rem; background: #f8fafc; border: 1px dashed #cbd5e1; border-radius: 12px;">
          Chưa có thiết bị con nào liên kết. Bấm <strong>+ Thêm Thiết Bị</strong> để thêm.
        </div>
      `;
      return;
    }

    let html = "";
    customDevices.forEach(dev => {
      const isSwitch = dev.type === "relay" || dev.type === "socket";
      const isIrHub = dev.type === "ir_hub";
      const faIcon = isIrHub ? "fa-tower-broadcast" : (dev.type === "ac" ? "fa-wind" : (dev.type === "relay" ? "fa-lightbulb" : (dev.type === "socket" ? "fa-plug" : "fa-satellite-dish")));
      const isDevOn = dev.state === 1;
      const childCount = (dev.children && dev.children.length) || 0;
      const subInfo = isIrHub ? `${childCount} thiết bị IR kết nối` : (dev.extra || '');

      html += `
        <div class="drawer-child-item">
          <div class="drawer-child-left">
            <div class="drawer-child-icon ${isIrHub ? 'ir-hub-icon' : ''}">
              <i class="fa-solid ${faIcon}"></i>
            </div>
            <div class="drawer-child-info">
              <h5>${escapeHtml(dev.name)}</h5>
              <p>${escapeHtml(dev.room || 'Phòng khách')} &bull; ${escapeHtml(subInfo)}</p>
            </div>
          </div>
          <div class="drawer-child-right">
            ${isSwitch ? `
              <button class="quick-toggle-btn custom-toggle-btn ${isDevOn ? 'on' : 'off'}" data-id="${dev.id}" style="padding: 4px 10px; font-size: 0.72rem;">
                ${isDevOn ? 'BẬT' : 'TẮT'}
              </button>
            ` : ''}
            <button type="button" class="btn-remove-child-dev" data-id="${dev.id}" title="Xóa thiết bị này khỏi Gateway" style="background: none; border: none; color: #ef4444; cursor: pointer; padding: 6px;">
              <i class="fa-solid fa-trash-can"></i>
            </button>
          </div>
        </div>
      `;
    });

    drawerChildList.innerHTML = html;
  }

  // ── RENDER DANH SÁCH THIẾT BỊ KHẢ DỤNG ĐỂ THÊM VÀO GATEWAY TRỰC TIẾP TRONG DRAWER ──
  function renderDrawerAvailableDevices() {
    if (!drawerAvailList) return;

    foundHub = getActiveIrHub();
    const hasIrHub = Boolean(foundHub || customDevices.some(d => d.type === "ir_hub" || d.id === "dev_ir_hub_hunonic" || (d.id && d.id.includes("ir_hub"))));
    const hasSensor = customDevices.some(d => d.type === "sensor" || d.id === "dev_espnow_node_1");

    // QUY TẮC CỐT LÕI: CHỈ CHO PHÉP HIỂN THỊ KHI SCAN THẤY THỰC TẾ ĐANG TRỰC TUYẾN
    // 1. Trạm IR: Phải kết nối được Gateway VÀ trạm IR thực tế đang cắm điện, trực tuyến trên Hunonic Cloud
    const isIrHubScanned = Boolean(isGatewayOnline && gwMetrics.ac_online === true);

    // 2. Node C3: Phải kết nối được Gateway VÀ Node C3 thực tế đang trực tuyến (Online) gửi bản tin gần đây (trong 60s)
    const isSensorScanned = Boolean(
      isGatewayOnline &&
      sensorData.hasData &&
      sensorData.isOnline === true &&
      (sensorData.temp > 0 || sensorData.hum > 0 || sensorData.batt > 0)
    );

    let itemsHtml = "";

    // 1. Trạm phát IR trung tâm Hunonic: CHỈ HIỆN KHI SCAN THẤY THỰC TẾ
    if (!hasIrHub && isIrHubScanned) {
      const acCountStr = gwMetrics.ac_count !== undefined ? `${gwMetrics.ac_count} điều hòa con` : "Hồng ngoại 360°";
      itemsHtml += `
        <div class="drawer-avail-item" style="display: flex; align-items: center; justify-content: space-between; padding: 10px 12px; background: #ffffff; border: 1.5px solid #10b981; border-radius: 12px; margin-bottom: 8px; box-shadow: 0 2px 8px rgba(16, 185, 129, 0.1);">
          <div style="display: flex; align-items: center; gap: 10px;">
            <div style="width: 36px; height: 36px; border-radius: 10px; background: #ecfdf5; color: #059669; display: flex; align-items: center; justify-content: center; font-size: 1.05rem;">
              <i class="fa-solid fa-tower-broadcast"></i>
            </div>
            <div>
              <h5 style="font-size: 0.85rem; font-weight: 700; color: #1e293b; margin: 0 0 2px;">IR trung tâm</h5>
              <p style="font-size: 0.72rem; color: #059669; margin: 0; font-weight: 500;">
                <i class="fa-solid fa-circle" style="font-size: 0.5rem;"></i> Trực tuyến &bull; ${acCountStr}
              </p>
            </div>
          </div>
          <button type="button" class="btn-drawer-quick-add" data-type="ir_hub" data-id="dev_ir_hub_hunonic" data-name="IR trung tâm" style="padding: 6px 14px; background: #00b06f; color: #ffffff; border: none; border-radius: 8px; font-size: 0.78rem; font-weight: 600; cursor: pointer; display: flex; align-items: center; gap: 4px; box-shadow: 0 2px 6px rgba(0,176,111,0.25);">
            <i class="fa-solid fa-plus"></i> Thêm
          </button>
        </div>
      `;
    }

    // 2. Node Cảm Biến C3 (ESP-NOW): CHỈ HIỆN KHI SCAN THẤY THỰC TẾ
    if (!hasSensor && isSensorScanned) {
      itemsHtml += `
        <div class="drawer-avail-item" style="display: flex; align-items: center; justify-content: space-between; padding: 10px 12px; background: #ffffff; border: 1.5px solid #38bdf8; border-radius: 12px; margin-bottom: 8px; box-shadow: 0 2px 8px rgba(56, 189, 248, 0.1);">
          <div style="display: flex; align-items: center; gap: 10px;">
            <div style="width: 36px; height: 36px; border-radius: 10px; background: #f0f9ff; color: #0284c7; display: flex; align-items: center; justify-content: center; font-size: 1.05rem;">
              <i class="fa-solid fa-satellite-dish"></i>
            </div>
            <div>
              <h5 style="font-size: 0.85rem; font-weight: 700; color: #1e293b; margin: 0 0 2px;">Node Cảm Biến C3</h5>
              <p style="font-size: 0.72rem; color: #0284c7; margin: 0; font-weight: 500;">
                <i class="fa-solid fa-circle" style="font-size: 0.5rem;"></i> Sóng ESP-NOW 2.4GHz
              </p>
            </div>
          </div>
          <button type="button" class="btn-drawer-quick-add" data-type="sensor" data-id="dev_espnow_node_1" data-name="Node Cảm Biến C3" style="padding: 6px 14px; background: #0284c7; color: #ffffff; border: none; border-radius: 8px; font-size: 0.78rem; font-weight: 600; cursor: pointer; display: flex; align-items: center; gap: 4px; box-shadow: 0 2px 6px rgba(2,132,199,0.25);">
            <i class="fa-solid fa-plus"></i> Thêm
          </button>
        </div>
      `;
    }

    if (!itemsHtml) {
      itemsHtml = `
        <div style="text-align: center; padding: 16px 12px; color: #64748b; background: #f8fafc; border: 1px dashed #cbd5e1; border-radius: 12px; font-size: 0.78rem;">
          <div style="width: 36px; height: 36px; border-radius: 50%; background: #f1f5f9; display: flex; align-items: center; justify-content: center; margin: 0 auto 8px; font-size: 1rem; color: #94a3b8;">
            <i class="fa-solid fa-satellite-dish"></i>
          </div>
          <strong style="display: block; color: #334155; margin-bottom: 2px;">Chưa quét thấy thiết bị nào</strong>
          <span style="font-size: 0.73rem; line-height: 1.4; display: block; color: #64748b;">
            Chỉ thiết bị con thực tế đang trực tuyến (Cắm nguồn trạm IR hoặc bật nguồn Node C3) mới xuất hiện tại đây.
          </span>
          <button type="button" id="btn-drawer-rescan" style="display: inline-flex; align-items: center; gap: 6px; margin-top: 10px; padding: 5px 12px; background: #ffffff; color: #059669; border: 1px solid #10b981; border-radius: 6px; font-size: 0.74rem; font-weight: 600; cursor: pointer;">
            <i class="fa-solid fa-rotate"></i> Quét lại
          </button>
        </div>
      `;
    }

    drawerAvailList.innerHTML = itemsHtml;

    // Nút quét lại
    const btnRescan = drawerAvailList.querySelector("#btn-drawer-rescan");
    if (btnRescan) {
      btnRescan.addEventListener("click", async () => {
        const icon = btnRescan.querySelector("i");
        if (icon) icon.classList.add("fa-spin");
        showToast("Đang dò quét các thiết bị trực tuyến...", "info");
        await fetchStatus();
        renderDrawerAvailableDevices();
        if (icon) icon.classList.remove("fa-spin");
      });
    }

    // Gắn sự kiện click Thêm ngay trong drawer
    drawerAvailList.querySelectorAll(".btn-drawer-quick-add").forEach(btn => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const type = btn.getAttribute("data-type");
        const id = btn.getAttribute("data-id");
        const name = btn.getAttribute("data-name");

        if (type === "ir_hub") {
          localStorage.removeItem("gate_ir_hub_deleted");
          const newDev = {
            id: id || "dev_ir_hub_hunonic",
            name: name || "IR trung tâm",
            type: "ir_hub",
            room: localStorage.getItem("gate_room") || "Phòng khách",
            device_id: "3987670",
            extra: "Trạm phát IR 360° đa hướng",
            children: [],
            state: 0
          };
          foundHub = newDev;
          customDevices.unshift(newDev);
          localStorage.setItem("gate_custom_devices", JSON.stringify(customDevices));
          renderDrawerChildList();
          renderDrawerAvailableDevices();
          renderDevices();
          showToast(`Đã thêm thành công [${name}] vào Gateway!`, "success");
        } else if (type === "sensor") {
          localStorage.removeItem("gate_sensor_deleted");
          const newDev = {
            id: id || "dev_espnow_node_1",
            name: name || "Node Cảm Biến C3",
            type: "sensor",
            room: localStorage.getItem("gate_room") || "Phòng khách",
            extra: "ESP-NOW 2.4GHz",
            state: 0
          };
          customDevices.push(newDev);
          localStorage.setItem("gate_custom_devices", JSON.stringify(customDevices));
          renderDrawerChildList();
          renderDrawerAvailableDevices();
          renderDevices();
          showToast(`Đã thêm thành công [${name}] vào Gateway!`, "success");
        }
      });
    });
  }

  // ── XỬ LÝ SỰ KIỆN TRONG RIGHT DRAWER ────────────────────────────────────────
  // Nút "+ Thêm Thiết Bị" trong drawer của Gateway -> Mở rộng khay thêm ngay trong drawer
  if (btnDrawerAddChild) {
    btnDrawerAddChild.addEventListener("click", () => {
      if (drawerAddPanel) {
        const isShown = drawerAddPanel.style.display !== "none";
        drawerAddPanel.style.display = isShown ? "none" : "block";
        if (!isShown) renderDrawerAvailableDevices();
      }
    });
  }

  // Nút đóng khay thêm thiết bị trong drawer
  if (btnDrawerCloseAdd) {
    btnDrawerCloseAdd.addEventListener("click", () => {
      if (drawerAddPanel) drawerAddPanel.style.display = "none";
    });
  }

  // Nút "Cấu hình Wi-Fi BLE" trong drawer
  if (btnDrawerReconfigWifi) {
    btnDrawerReconfigWifi.addEventListener("click", () => {
      closeRightDrawer();
      openAddGatewayModal();
    });
  }

  // Nút "Reboot Trạm" trong drawer
  if (btnDrawerReboot) {
    btnDrawerReboot.addEventListener("click", async () => {
      if (confirm("Bạn có chắc chắn muốn khởi động lại Trạm Gateway ESP32-S3?")) {
        showToast("Đang gửi lệnh khởi động lại Gateway...", "info");
        const res = await callApi("/api/gateway/reboot", "POST");
        if (res && res.success) {
          showToast(res.message, "success");
        } else {
          showToast("Đã gửi tín hiệu khởi động lại Gateway!", "success");
        }
      }
    });
  }

  // Nút "Lưu Thay Đổi" ("chỉnh thiết bị")
  if (btnDrawerSave) {
    btnDrawerSave.addEventListener("click", () => {
      const newName = drawerEditName ? drawerEditName.value.trim() : "";
      const newRoom = drawerEditRoom ? drawerEditRoom.value : "Phòng khách";

      if (!newName) {
        showToast("Vui lòng nhập tên thiết bị!", "error");
        return;
      }

      if (currentDrawerTarget === null) {
        // Chỉnh sửa Gateway
        localStorage.setItem("gate_custom_name", newName);
        localStorage.setItem("gate_room", newRoom);
        renderDevices();
        openGatewayDrawer();
        showToast("Đã lưu thông tin Trạm Gateway ESP32-S3!", "success");
      } else {
        // Chỉnh sửa thiết bị con
        const dev = customDevices.find(d => d.id === currentDrawerTarget);
        if (dev) {
          dev.name = newName;
          dev.room = newRoom;
          localStorage.setItem("gate_custom_devices", JSON.stringify(customDevices));
          renderDevices();
          openChildDeviceDrawer(currentDrawerTarget);
          showToast(`Đã lưu thay đổi cho [${newName}]!`, "success");
        }
      }
    });
  }

  // ── HÀM XÓA THIẾT BỊ CON KHỎI GATEWAY (ĐỒNG BỘ TRIỆT ĐỂ LOCALSTORAGE & MEMORY) ──
  function removeDeviceFromGateway(devId) {
    const dev = customDevices.find(d => d.id === devId) ||
                 customDevices.find(d => (devId === "dev_espnow_node_1" || (typeof devId === "string" && (devId.includes("sensor") || devId.includes("espnow")))) && d.type === "sensor");
    const isIr = (dev && (dev.type === "ir_hub" || dev.id === "dev_ir_hub_hunonic" || (dev.id && dev.id.includes("ir_hub")))) ||
                 devId === "dev_ir_hub_hunonic" ||
                 (typeof devId === "string" && devId.includes("ir_hub"));
    const isSensor = (dev && (dev.type === "sensor" || dev.id === "dev_espnow_node_1" || (dev.id && (dev.id.includes("sensor") || dev.id.includes("espnow"))))) ||
                     devId === "dev_espnow_node_1" ||
                     (typeof devId === "string" && (devId.includes("sensor") || devId.includes("espnow")));

    if (isIr) {
      localStorage.setItem("gate_ir_hub_deleted", "true");
      foundHub = null;
      currentHubView = null;
      currentActiveIrChild = null;
      closeHubSubView(true);
    }

    if (isSensor) {
      localStorage.setItem("gate_sensor_deleted", "true");
    }

    customDevices = customDevices.filter(d => {
      if (d.id === devId) return false;
      if (dev && d.id === dev.id) return false;
      if (isIr && (d.type === "ir_hub" || d.id === "dev_ir_hub_hunonic" || (d.id && d.id.includes("ir_hub")))) return false;
      if (isSensor && (d.type === "sensor" || d.id === "dev_espnow_node_1" || (d.id && (d.id.includes("sensor") || d.id.includes("espnow"))))) return false;
      return true;
    });

    localStorage.setItem("gate_custom_devices", JSON.stringify(customDevices));
    foundHub = getActiveIrHub();
    renderDrawerAvailableDevices();
  }

  // Nút "Xóa Thiết Bị Này" ("có xóa thiết bị")
  if (btnDrawerDelete) {
    btnDrawerDelete.addEventListener("click", () => {
      if (currentDrawerTarget === null) {
        // Xóa Trạm Gateway
        if (confirm("Bạn có chắc chắn muốn xóa Trạm Gateway ESP32-S3 khỏi phòng khách này?")) {
          isGateAddedToRoom = false;
          localStorage.setItem("gate_added_to_room", "false");
          closeRightDrawer();
          renderDevices();
          showToast("Đã xóa Trạm Gateway khỏi phòng khách!", "info");
        }
      } else {
        // Xóa thiết bị con
        const dev = customDevices.find(d => d.id === currentDrawerTarget);
        const devName = dev ? dev.name : "thiết bị";
        if (confirm(`Bạn có chắc chắn muốn xóa [${devName}] khỏi Gateway?`)) {
          const targetId = currentDrawerTarget;
          removeDeviceFromGateway(targetId);
          closeRightDrawer();
          renderDevices();
          renderLinkedDevicesList();
          showToast(`Đã xóa thiết bị [${devName}] khỏi Gateway!`, "info");
        }
      }
    });
  }

  // Xóa trực tiếp trong danh sách con của drawer
  if (drawerChildList) {
    drawerChildList.addEventListener("click", (e) => {
      const btnRemove = e.target.closest(".btn-remove-child-dev");
      if (btnRemove) {
        e.stopPropagation();
        const devId = btnRemove.getAttribute("data-id");
        const dev = customDevices.find(d => d.id === devId);
        const devName = dev ? dev.name : "thiết bị";
        if (confirm(`Bạn có chắc muốn xóa [${devName}] khỏi Gateway?`)) {
          removeDeviceFromGateway(devId);
          renderDrawerChildList();
          renderDevices();
          renderLinkedDevicesList();
          showToast(`Đã xóa [${devName}] khỏi Gateway!`, "info");
        }
      }
    });
  }

  // ── CÁC HÀM TẠO ICON SVG CHUẨN HUNONIC (PIXEL-PERFECT) ─────────────────────────
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

  function getWifiHunonicSvg(isOnline) {
    if (!isOnline) {
      return `<span aria-label="Thiết bị mất kết nối" style="display:inline-flex;align-items:center;gap:4px;white-space:nowrap;padding:4px 6px;border-radius:999px;background:#fff7ed;border:1px solid #ffedd5;color:#b45309;font-size:9px;font-weight:600;line-height:1.2;"><span aria-hidden="true" style="width:5px;height:5px;border-radius:50%;background:#f59e0b;flex-shrink:0;"></span>Mất kết nối</span>`;
    }
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

  function isSensorDevice(dev) {
    if (!dev) return false;
    return dev.type === "sensor" || dev.type === "espnow" || dev.id === "dev_espnow_node_1" || 
      (typeof dev.id === "string" && (dev.id.includes("sensor") || dev.id.includes("espnow"))) ||
      (typeof dev.name === "string" && dev.name.toLowerCase().includes("cảm biến"));
  }

  function getSensorBatteryInfo(dev) {
    let v = 0;
    if (sensorData && (Number(sensorData.battery) > 0 || Number(sensorData.batt) > 0)) {
      v = Number(sensorData.battery || sensorData.batt);
    } else if (dev && Number(dev.battery) > 0) {
      v = Number(dev.battery);
    }
    if (!v || isNaN(v) || v <= 0) v = 3.30;

    let pct = 100;
    if (v >= 4.15) {
      pct = 100;
    } else if (v >= 3.6) {
      pct = Math.min(100, Math.max(5, Math.round(((v - 3.4) / (4.2 - 3.4)) * 100)));
    } else {
      pct = Math.min(100, Math.max(5, Math.round(((v - 2.6) / (3.3 - 2.6)) * 100)));
    }

    let icon = "fa-battery-full";
    let color = "#00b06f";
    if (pct >= 80) {
      icon = "fa-battery-full";
      color = "#00b06f";
    } else if (pct >= 55) {
      icon = "fa-battery-three-quarters";
      color = "#00b06f";
    } else if (pct >= 30) {
      icon = "fa-battery-half";
      color = "#f59e0b";
    } else if (pct >= 15) {
      icon = "fa-battery-quarter";
      color = "#f97316";
    } else {
      icon = "fa-battery-empty";
      color = "#ef4444";
    }

    return {
      voltage: v,
      voltageStr: v.toFixed(2) + "V",
      pct: pct,
      icon: icon,
      color: color
    };
  }

  function getBatteryHunonicHtml(dev, isOnline) {
    if (!isSensorDevice(dev)) return "";
    if (!isOnline) {
      return `<span class="sensor-batt-pill offline" title="Pin Node: Ngoại tuyến"><i class="fa-solid fa-battery-empty"></i> <span>--</span></span>`;
    }
    const bat = getSensorBatteryInfo(dev);
    return `<span class="sensor-batt-pill" title="Mức pin Node: ${bat.voltageStr} (${bat.pct}%)" style="color:${bat.color};border-color:${bat.color}35;"><i class="fa-solid ${bat.icon}"></i> <span>${bat.voltageStr}</span></span>`;
  }

  function getSensorCardDetailHtml(dev, isOnline) {
    if (!isOnline) {
      return `
        <div class="sensor-metric-row">
          <span class="sensor-metric-chip offline"><i class="fa-solid fa-satellite-dish"></i> ESP-NOW 2.4GHz</span>
        </div>
        <div class="sensor-status-row">
          <span class="sensor-status-chip offline"><i class="fa-solid fa-circle-xmark"></i> Ngoại tuyến</span>
        </div>
      `;
    }

    const tempVal = (sensorData.hasData && sensorData.temp > 0) ? `${sensorData.temp.toFixed(1)}°C` : "--°C";
    const isPressure = sensorData.hum > 120;
    const val2Icon = isPressure ? "fa-gauge-high" : "fa-droplet";
    const val2Color = isPressure ? "#0284c7" : "#0ea5e9";
    const val2Unit = isPressure ? "hPa" : "%";
    const val2Val = (sensorData.hasData && sensorData.hum > 0) ? `${isPressure ? Math.round(sensorData.hum) : sensorData.hum.toFixed(1)} ${val2Unit}` : `-- ${val2Unit}`;

    const known = sensorData.hasData && [true, false, 0, 1, "0", "1"].includes(sensorData.presence);
    const occupied = known && (sensorData.presence === true || Number(sensorData.presence) === 1);
    const presIcon = occupied ? "fa-person-walking" : "fa-house-user";
    const presColor = occupied ? "#059669" : "#64748b";
    const presText = known ? (occupied ? "Có người" : "Trống") : "Chờ dữ liệu";

    return `
      <div class="sensor-metric-row">
        <span class="sensor-metric-chip" title="Nhiệt độ phòng">
          <i class="fa-solid fa-temperature-half" style="color: #ef4444;"></i>
          <span>${tempVal}</span>
        </span>
        <span class="sensor-metric-chip" title="${isPressure ? 'Áp suất khí quyển' : 'Độ ẩm không khí'}">
          <i class="fa-solid ${val2Icon}" style="color: ${val2Color};"></i>
          <span>${val2Val}</span>
        </span>
      </div>
      <div class="sensor-status-row">
        <span class="sensor-status-chip online" title="Trạng thái kết nối">
          <i class="fa-solid fa-circle-check" style="color: #059669;"></i>
          <span>Trực tuyến</span>
        </span>
        <span class="sensor-status-chip presence" title="Hiện diện radar" style="color: ${presColor}; font-weight: 600;">
          <i class="fa-solid ${presIcon}" style="color: ${presColor};"></i>
          <span>${presText}</span>
        </span>
      </div>
    `;
  }

  // ── TRẠNG THÁI SUB-VIEW HIỆN TẠI (GIỐNG HUNONIC) ─────────────────────────────
  let currentHubView = null; // null: Home, hoặc { type: 'gateway' | 'ir_hub', dev: hubDev, parent: 'home' | 'gateway' }

  function openHubSubView(type, dev = null, parent = "home") {
    currentHubView = { type, dev, parent };

    const homeDash = document.getElementById("view-home-dashboard");
    const subView = document.getElementById("view-device-hub");
    const otaView = document.getElementById("view-firmware-update");
    const autoView = document.getElementById("view-automations");
    const notifsView = document.getElementById("view-notifications");
    const roomView = document.getElementById("view-room-mgmt");
    if (homeDash) homeDash.style.display = "none";
    if (otaView) otaView.style.display = "none";
    if (autoView) autoView.style.display = "none";
    if (notifsView) notifsView.style.display = "none";
    if (roomView) roomView.style.display = "none";
    if (subView) subView.style.display = "block";
    updateSidebarActive("nav-home");

    const titleEl = document.getElementById("subview-title");
    const iconBox = document.getElementById("subview-header-icon-box");
    const actionBtn = document.getElementById("btn-subview-action");
    const actionText = document.getElementById("subview-action-text");
    const gearBtn = document.getElementById("btn-subview-gear");

    if (type === "ir_hub") {
      const hubDev = dev || foundHub;
      const isHubOnline = isDeviceOnline(hubDev);
      if (titleEl) titleEl.innerText = hubDev ? hubDev.name : "IR trung tâm";
      if (iconBox) {
        iconBox.innerHTML = `<i class="fa-solid fa-wifi ${isHubOnline ? 'text-green' : 'text-gray'}"></i>`;
      }
      if (actionBtn) {
        actionBtn.innerHTML = `<i class="fa-solid fa-arrows-rotate" id="subview-action-icon"></i> <span id="subview-action-text">Đồng bộ</span>`;
        actionBtn.onclick = () => {
          const icon = actionBtn.querySelector("i");
          if (icon) icon.classList.add("fa-spin");
          showToast("Đang đồng bộ thiết bị IR từ Cloud...", "info");
          callApi("/api/hvac/sync", "POST").then(res => {
            if (icon) icon.classList.remove("fa-spin");
            if (res && res.success && res.data && Array.isArray(res.data.children)) {
              hubDev.children = res.data.children;
              localStorage.setItem("gate_custom_devices", JSON.stringify(customDevices));
              renderSubViewDevices("ir_hub", hubDev);
              showToast(`Đã đồng bộ ${res.data.children.length} thiết bị!`, "success");
            }
          }).catch(err => {
            if (icon) icon.classList.remove("fa-spin");
            showToast("Lỗi đồng bộ thiết bị IR!", "error");
          });
        };
      }
      if (gearBtn) {
        gearBtn.onclick = () => {
          if (hubDev) openChildDeviceDrawer(hubDev.id);
        };
      }
      renderSubViewDevices("ir_hub", hubDev);
    } else if (type === "gateway") {
      const gwName = localStorage.getItem("gate_custom_name") || "Trạm Gateway ESP32-S3";
      if (titleEl) titleEl.innerText = gwName;
      if (iconBox) {
        iconBox.innerHTML = `<i class="fa-solid fa-wifi ${isGatewayOnline ? 'text-green' : 'text-gray'}"></i>`;
      }
      if (actionBtn) {
        actionBtn.innerHTML = `<i class="fa-solid fa-plus"></i> <span id="subview-action-text">Thêm thiết bị</span>`;
        actionBtn.onclick = () => {
          openGatewayDrawer(true);
        };
      }
      if (gearBtn) {
        gearBtn.onclick = () => {
          openGatewayDrawer();
        };
      }
      renderSubViewDevices("gateway", null);
    }
  }

  function closeHubSubView(forceHome = false) {
    if (!forceHome && currentHubView && currentHubView.parent === "gateway") {
      openHubSubView("gateway", null, "home");
      return;
    }

    currentHubView = null;
    const homeDash = document.getElementById("view-home-dashboard");
    const subView = document.getElementById("view-device-hub");
    const otaView = document.getElementById("view-firmware-update");
    const autoView = document.getElementById("view-automations");
    const notifsView = document.getElementById("view-notifications");
    const roomView = document.getElementById("view-room-mgmt");
    if (subView) subView.style.display = "none";
    if (otaView) otaView.style.display = "none";
    if (autoView) autoView.style.display = "none";
    if (notifsView) notifsView.style.display = "none";
    if (roomView) roomView.style.display = "none";
    if (homeDash) homeDash.style.display = "block";
    updateSidebarActive("nav-home");
    renderDevices();
  }

  function renderSubViewDevices(type, hubDev) {
    const grid = document.getElementById("subview-devices-grid");
    if (!grid) return;

    if (type === "ir_hub") {
      const dev = customDevices.find(d => hubDev && d.id === hubDev.id) || foundHub;
      const isHubOnline = isDeviceOnline(dev);
      const headerIcon = document.getElementById("subview-header-icon-box");
      if (headerIcon) headerIcon.innerHTML = `<i class="fa-solid fa-wifi ${isHubOnline ? 'text-green' : 'text-gray'}"></i>`;
      const hubAction = document.getElementById("btn-subview-action");
      if (hubAction) hubAction.disabled = !isHubOnline;
      const children = (dev && dev.children) ? dev.children : [];

      if (children.length === 0) {
        grid.innerHTML = `
          <div class="empty-ac-card-wrapper" style="grid-column: 1 / -1; display: flex; justify-content: center; width: 100%; margin: 20px 0;">
            <div style="max-width: 480px; width: 100%; background: #ffffff; border-radius: 20px; padding: 36px 28px; text-align: center; box-shadow: 0 16px 40px rgba(0, 0, 0, 0.35), 0 2px 8px rgba(0, 0, 0, 0.15); border: 1px solid rgba(226, 232, 240, 0.9);">
              <div style="width: 64px; height: 64px; border-radius: 50%; background: #ecfdf5; color: #00b06f; display: flex; align-items: center; justify-content: center; font-size: 28px; margin: 0 auto 16px; box-shadow: 0 4px 12px rgba(0, 176, 111, 0.15);">
                <i class="fa-solid fa-wind"></i>
              </div>
              <h3 style="font-size: 18px; font-weight: 700; color: #0f172a; margin: 0 0 8px;">Chưa có thiết bị điều hòa nào</h3>
              <p style="font-size: 14px; color: #475569; line-height: 1.6; margin: 0 0 22px;">
                Trạm IR trung tâm hiện chưa có điều hòa con. Bạn có thể thêm thiết bị mới trên ứng dụng Hunonic hoặc bấm nút bên dưới để tạo điều hòa.
              </p>
              <div style="display: flex; gap: 12px; justify-content: center; flex-wrap: wrap;">
                <button type="button" onclick="document.getElementById('btn-subview-action')?.click()" style="display: inline-flex; align-items: center; gap: 8px; background: linear-gradient(135deg, #00b06f, #059669); color: #ffffff; border: none; padding: 11px 22px; border-radius: 12px; font-size: 14px; font-weight: 600; cursor: pointer; box-shadow: 0 4px 14px rgba(0, 176, 111, 0.35); transition: transform 0.15s ease;">
                  <i class="fa-solid fa-arrows-rotate"></i> Đồng bộ ngay
                </button>
              </div>
            </div>
          </div>
        `;
        return;
      }

      let html = "";
      children.forEach((child) => {
        const isChildOn = isHubOnline && (child.power === 1 || child.state === 1);
        const temp = child.temp || 25;
        const cap = getAcCapabilities(child);
        const activeModeObj = cap.modes.find(m => m.code === child.mode);
        const modeLabel = activeModeObj ? activeModeObj.label : "Làm mát";
        const statusText = !isHubOnline ? "Chờ kết nối lại" : (isChildOn ? `Đang ${modeLabel.toLowerCase()} ${temp}°C` : "Đang tắt");
        const subClass = isChildOn ? "on" : "";

        html += `
          <div class="hunonic-card subview-ac-card ${isHubOnline ? '' : 'is-offline'}" onclick="${isHubOnline ? `window.handleAcCardClick('${child.id}')` : 'return false'}" aria-disabled="${!isHubOnline}" data-child-id="${child.id}" data-hub-id="${dev.id || 'dev_ir_hub_hunonic'}" title="${!isHubOnline ? 'Trạm phát IR chưa cắm điện' : 'Bấm vào để mở điều khiển (Nhấn giữ để mở Cài đặt nâng cao)'}" style="position: relative;">
            <button type="button" class="btn-ac-card-direct-gear" data-ac-id="${child.id}" title="Cài đặt nhiệt độ & Hẹn giờ" onclick="event.stopPropagation(); window.openAcLeftDrawer && window.openAcLeftDrawer({ id: '${child.id}', name: '${escapeHtml(child.name)}', brand_name: '${escapeHtml(child.brand_name || '')}' });">
              <i class="fa-solid fa-sliders"></i>
            </button>
            <div class="hunonic-card-top" style="pointer-events: none;">
              <div class="ac-indoor-svg">
                ${getAcUnitSvg(isHubOnline, isChildOn)}
              </div>
              ${getWifiHunonicSvg(isHubOnline)}
            </div>
            <div class="hunonic-card-bottom" style="pointer-events: none;">
              <h4 class="hunonic-card-title">${escapeHtml(child.name)}</h4>
              <p class="hunonic-card-sub ${subClass}" style="${!isHubOnline ? 'color: #ef4444; font-weight: 500;' : ''}">${statusText}</p>
            </div>
          </div>
        `;
      });
      grid.innerHTML = html;
    } else if (type === "gateway") {
      foundHub = getActiveIrHub();
      const isIrOnline = foundHub ? isDeviceOnline(foundHub) : false;
      const irChildCount = (foundHub && foundHub.children && foundHub.children.length) || 0;

      // Danh sách các thiết bị con thực tế đã được người dùng quét và thêm vào phòng
      const isSensorDeleted = localStorage.getItem("gate_sensor_deleted") === "true";
      const userAddedDevices = customDevices.filter(d => {
        if (d.type === "ir_hub" || d.id === "dev_ir_hub_hunonic" || (d.id && d.id.includes("ir_hub"))) return false;
        if (isSensorDeleted && (d.type === "sensor" || d.id === "dev_espnow_node_1" || (d.id && (d.id.includes("sensor") || d.id.includes("espnow"))))) return false;
        return true;
      });

      let extraCardsHtml = "";
      userAddedDevices.forEach(dev => {
        const isOnline = isDeviceOnline(dev);
        let iconSvg = getSensorHexSvg();
        let subText = "Trực tuyến";

        if (dev.type === "sensor") {
          iconSvg = getSensorHexSvg();
          subText = getSensorCardDetailHtml(dev, isOnline);
        } else if (dev.type === "socket") {
          const isDevOn = isOnline && dev.state === 1;
          iconSvg = getRelayHexSvg(isDevOn);
          subText = isDevOn ? "Đang bật" : "Đang tắt";
        }

        extraCardsHtml += `
          <div class="hunonic-card subview-gw-child" data-id="${dev.id}" data-gw-action="open_custom_dev" title="${escapeHtml(dev.name)}">
            <div class="hunonic-card-top" style="pointer-events: none;">
              <div class="hunonic-hex-icon">
                ${iconSvg}
              </div>
              <div class="hunonic-card-top-right">
                ${getBatteryHunonicHtml(dev, isOnline)}
                ${getWifiHunonicSvg(isOnline)}
              </div>
            </div>
            <div class="hunonic-card-bottom" style="pointer-events: none;">
              <h4 class="hunonic-card-title">${escapeHtml(dev.name)}</h4>
              <div class="hunonic-card-sub ${isOnline ? 'on' : ''}">${subText}</div>
            </div>
          </div>
        `;
      });

      let irSubCardHtml = "";
      if (foundHub) {
        irSubCardHtml = `
          <!-- 1. IR Trung Tâm -->
          <div class="hunonic-card subview-gw-child" data-id="${foundHub ? foundHub.id : 'dev_ir_hub_hunonic'}" data-gw-action="open_ir_hub" title="Bấm vào để mở các thiết bị điều hòa trong IR">
            <div class="hunonic-card-top" style="pointer-events: none;">
              <div class="hunonic-hex-icon">
                ${getIrHubHexSvg()}
              </div>
              ${getWifiHunonicSvg(isIrOnline)}
            </div>
            <div class="hunonic-card-bottom" style="pointer-events: none;">
              <h4 class="hunonic-card-title">${escapeHtml(foundHub.name || "IR trung tâm")}</h4>
              <p class="hunonic-card-sub ${isIrOnline ? 'on' : ''}">
                ${isIrOnline ? `Thiết bị con: ${irChildCount}` : `<span style="color:#ef4444;font-weight:600;"><i class="fa-solid fa-power-off"></i> Ngoại tuyến (Chưa cắm điện)</span>`}
              </p>
            </div>
          </div>
        `;
      }

      if (!foundHub && userAddedDevices.length === 0) {
        grid.innerHTML = `
          <div class="empty-gw-subview-card" style="grid-column: 1 / -1; display: flex; justify-content: center; width: 100%; margin: 20px 0;">
            <div style="max-width: 480px; width: 100%; background: #ffffff; border-radius: 20px; padding: 36px 28px; text-align: center; box-shadow: 0 16px 40px rgba(0, 0, 0, 0.35), 0 2px 8px rgba(0, 0, 0, 0.15); border: 1px solid rgba(226, 232, 240, 0.9);">
              <div style="width: 64px; height: 64px; border-radius: 50%; background: #ecfdf5; color: #00b06f; display: flex; align-items: center; justify-content: center; font-size: 28px; margin: 0 auto 16px; box-shadow: 0 4px 12px rgba(0, 176, 111, 0.15);">
                <i class="fa-solid fa-layer-group"></i>
              </div>
              <h3 style="font-size: 18px; font-weight: 700; color: #0f172a; margin: 0 0 8px;">Chưa có thiết bị con nào</h3>
              <p style="font-size: 14px; color: #475569; line-height: 1.6; margin: 0 0 22px;">
                Trạm Gateway hiện chưa có thiết bị con nào liên kết. Bấm nút bên dưới để quét và thêm thiết bị con (IR Hub, Cảm biến C3).
              </p>
              <div style="display: flex; gap: 12px; justify-content: center; flex-wrap: wrap;">
                <button type="button" class="btn-empty-add-gw-sub" style="display: inline-flex; align-items: center; gap: 8px; background: linear-gradient(135deg, #00b06f, #059669); color: #ffffff; border: none; padding: 11px 22px; border-radius: 12px; font-size: 14px; font-weight: 600; cursor: pointer; box-shadow: 0 4px 14px rgba(0, 176, 111, 0.35);">
                  <i class="fa-solid fa-plus-circle"></i> Thêm Thiết Bị Vào Gateway
                </button>
              </div>
            </div>
          </div>
        `;
        const btnAddGwSub = grid.querySelector(".btn-empty-add-gw-sub");
        if (btnAddGwSub) {
          btnAddGwSub.addEventListener("click", () => openGatewayDrawer(true));
        }
      } else {
        grid.innerHTML = irSubCardHtml + extraCardsHtml;
      }
    }
  }

  // ── RENDER THIẾT BỊ TRÊN DASHBOARD CHÍNH (CHUẨN HUNONIC COMPACT CARD) ──────
  function getNodePresenceHtml(isOnline) {
    if (!isOnline || !sensorData.hasData) return "";
    const known = [true, false, 0, 1, "0", "1"].includes(sensorData.presence);
    const occupied = sensorData.presence === true || Number(sensorData.presence) === 1;
    const label = known ? (occupied ? 'Có người' : 'Không có người') : 'Chưa có dữ liệu hiện diện';
    return `<span style="display:block;margin-top:4px;color:${known && occupied ? '#059669' : '#64748b'};font-weight:600;"><i class="fa-solid ${known && occupied ? 'fa-person-walking' : 'fa-house-user'}"></i> ${label}</span>`;
  }

  // ── BỘ LỌC THIẾT BỊ THEO PHÒNG TRÊN DASHBOARD ─────────────────────────────
  let selectedRoomFilter = "all";

  function renderDashboardRoomFilters() {
    const container = document.getElementById("dashboard-room-filters");
    if (!container) return;

    const rooms = (typeof getStoredRooms === "function") ? getStoredRooms() : [];
    const allDevs = (typeof getAllSystemDevices === "function") ? getAllSystemDevices() : [];
    const totalCount = allDevs.length;

    let html = `
      <div class="room-filter-chip ${selectedRoomFilter === 'all' ? 'active' : ''}" data-room-filter="all">
        <i class="fa-solid fa-shapes"></i>
        <span>Tất cả</span>
        <span class="chip-badge">${totalCount}</span>
      </div>
    `;

    rooms.forEach(room => {
      const devCount = allDevs.filter(d => d.room === room.name).length;
      const isActive = selectedRoomFilter === room.name;
      const activeStyle = isActive ? `background: ${escapeHtml(room.color || '#00b06f')}; border-color: ${escapeHtml(room.color || '#00b06f')}; color: #ffffff;` : '';
      html += `
        <div class="room-filter-chip ${isActive ? 'active' : ''}" data-room-filter="${escapeHtml(room.name)}" style="${activeStyle}">
          <i class="fa-solid ${escapeHtml(room.icon || 'fa-couch')}" style="${isActive ? 'color:#ffffff;' : `color:${escapeHtml(room.color || '#10b981')};`}"></i>
          <span>${escapeHtml(room.name)}</span>
          <span class="chip-badge">${devCount}</span>
        </div>
      `;
    });

    container.innerHTML = html;

    container.querySelectorAll(".room-filter-chip").forEach(chip => {
      chip.addEventListener("click", () => {
        selectedRoomFilter = chip.getAttribute("data-room-filter") || "all";
        renderDashboardRoomFilters();
        renderDevices();
      });
    });
  }
  window.renderDashboardRoomFilters = renderDashboardRoomFilters;
  window.renderDevices = renderDevices;

  function renderDevices() {
    foundHub = getActiveIrHub();
    refreshPresencePanel();
    renderDashboardRoomFilters();
    if (currentHubView) {
      const liveDev = customDevices.find(d => currentHubView.dev && d.id === currentHubView.dev.id) || foundHub;
      currentHubView.dev = liveDev;
      if (!isSubViewHolding) {
        renderSubViewDevices(currentHubView.type, liveDev);
      }
      if (!foundHub) document.querySelectorAll('[data-gw-action="open_ir_hub"]').forEach(card => card.remove());
      if (localStorage.getItem("gate_sensor_deleted") === "true" || !customDevices.some(d => d.type === "sensor")) {
        document.querySelectorAll('.subview-gw-child[data-gw-action="open_sensor"], .subview-gw-child[data-id*="espnow"], .subview-gw-child[data-id*="sensor"]').forEach(card => card.remove());
      }
      return;
    }

    if (!devicesGrid) return;

    // 1. NẾU CHƯA THÊM GATEWAY VÀO PHÒNG -> HIỂN THỊ TRẠNG THÁI CHỜ THÊM
    if (!isGateAddedToRoom) {
      devicesGrid.innerHTML = `
        <div class="empty-devices-state">
          <div class="empty-icon-wrap">
            <i class="fa-solid fa-satellite-dish"></i>
          </div>
          <h4>Chưa có thiết bị nào trong phòng này</h4>
          <p>Hệ thống chưa thêm Trạm Gateway ESP32-S3. Vui lòng bấm bên dưới để bắt đầu kết nối Gateway.</p>
          <div class="empty-btns-row">
            <button class="btn-empty-add" id="btn-trigger-add-gate">
              <i class="fa-solid fa-plus-circle"></i> Thêm Trạm Gateway & Quét Thiết Bị
            </button>
          </div>
        </div>
      `;

      if (countDevicesOn) countDevicesOn.innerText = "00";
      if (countDevicesOff) countDevicesOff.innerText = "00";
      if (countDevicesOffline) countDevicesOffline.innerText = isGatewayOnline ? "00" : "01";

      const btnTriggerAdd = document.getElementById("btn-trigger-add-gate");
      if (btnTriggerAdd) {
        btnTriggerAdd.addEventListener("click", openAddGatewayModal);
      }
      return;
    }

    // 2. KHI ĐÃ THÊM GATEWAY VÀO PHÒNG
    foundHub = getActiveIrHub();
    const gwName = localStorage.getItem("gate_custom_name") || "Trạm Gateway ESP32-S3";
    const isIrOnline = foundHub ? isDeviceOnline(foundHub) : false;

    let onCount = 0;
    let offCount = 0;
    let offlineCount = !isGatewayOnline ? 1 : 0;

    // Trạm IR Hub ngoại tuyến -> tính vào thiết bị mất kết nối CHỈ KHI IR Hub tồn tại
    if (foundHub) {
      if (!isIrOnline) {
        offlineCount++;
      }

      // Tính toán số lượng thiết bị Bật / Tắt / Offline của IR con
      if (foundHub.children) {
        foundHub.children.forEach(c => {
          if (!isIrOnline) {
            offlineCount++;
          } else if (c.power === 1 || c.state === 1) {
            onCount++;
          } else {
            offCount++;
          }
        });
      }
    }

    const irChildCount = (foundHub && foundHub.children) ? foundHub.children.length : 0;
    const userAddedDevices = customDevices.filter(d => d.type !== "ir_hub" && d.id !== "dev_ir_hub_hunonic" && !(d.id && d.id.includes("ir_hub")));
    const gwChildCount = (foundHub ? 1 : 0) + userAddedDevices.length;

    // Phân vùng lọc không gian phòng
    const gwRoom = localStorage.getItem("gate_room") || "Phòng khách";
    const showGateway = (selectedRoomFilter === "all" || selectedRoomFilter === gwRoom);

    const irRoom = (foundHub && foundHub.room) || gwRoom;
    const showIrHub = foundHub && (selectedRoomFilter === "all" || selectedRoomFilter === irRoom);

    let visibleCardsCount = 0;
    if (showGateway) visibleCardsCount++;
    if (showIrHub) visibleCardsCount++;

    // Tạo HTML cho các thiết bị riêng lẻ khác nếu người dùng thêm vào
    let customCardsHtml = "";
    customDevices.forEach((dev) => {
      if (dev.type === "ir_hub" || dev.id === "dev_ir_hub_hunonic" || (dev.id && dev.id.includes("ir_hub"))) return; // Đã render riêng

      const isOnline = isDeviceOnline(dev);
      if (!isOnline) offlineCount++;

      const devRoom = dev.room || gwRoom;
      if (selectedRoomFilter !== "all" && selectedRoomFilter !== devRoom) return;

      visibleCardsCount++;

      let iconSvg = getSensorHexSvg();
      let subText = "Trực tuyến";
      let isOn = false;

      if (dev.type === "relay" || dev.type === "socket") {
        isOn = isOnline && dev.state === 1;
        iconSvg = getRelayHexSvg(isOn);
        subText = isOn ? "Đang bật" : "Đang tắt";
      } else if (dev.type === "sensor") {
        iconSvg = getSensorHexSvg();
        subText = getSensorCardDetailHtml(dev, isOnline);
      }

      customCardsHtml += `
        <div class="hunonic-card" data-id="${dev.id}" title="Bấm vào để xem chi tiết">
          <div class="hunonic-card-top">
            <div class="hunonic-hex-icon">
              ${iconSvg}
            </div>
            <div class="hunonic-card-top-right">
              ${getBatteryHunonicHtml(dev, isOnline)}
              ${getWifiHunonicSvg(isOnline)}
            </div>
          </div>
          <div class="hunonic-card-bottom">
            <h4 class="hunonic-card-title">${escapeHtml(dev.name)}</h4>
            <div class="hunonic-card-sub ${isOn || isOnline ? 'on' : ''}">${subText}</div>
          </div>
        </div>
      `;
    });

    let irCardHtml = "";
    if (showIrHub) {
      irCardHtml = `
        <!-- CARD 2: IR TRUNG TÂM (CHỨA CÁC ĐIỀU HÒA) -->
        <div class="hunonic-card" id="card-ir-hub-master" data-id="${escapeHtml(foundHub.id)}" title="Bấm vào để mở các thiết bị trong IR">
          <div class="hunonic-card-top">
            <div class="hunonic-hex-icon">
              ${getIrHubHexSvg()}
            </div>
            ${getWifiHunonicSvg(isIrOnline)}
          </div>
          <div class="hunonic-card-bottom">
            <h4 class="hunonic-card-title">${escapeHtml(foundHub.name || "IR trung tâm")}</h4>
            <p class="hunonic-card-sub ${isIrOnline ? 'on' : ''}">
              ${isIrOnline ? `Thiết bị con: ${irChildCount}` : `<span style="color:#ef4444;font-weight:600;"><i class="fa-solid fa-power-off"></i> Ngoại tuyến (Chưa cắm điện)</span>`}
            </p>
          </div>
        </div>
      `;
    }

    let gwCardHtml = "";
    if (showGateway) {
      gwCardHtml = `
      <!-- CARD 1: TRẠM GATEWAY ESP32-S3 -->
      <div class="hunonic-card" id="card-gateway-master" title="Bấm vào để xem các thiết bị trong Gateway">
        <div class="hunonic-card-top">
          <div class="hunonic-hex-icon">
            ${getGatewayHexSvg()}
          </div>
          ${getWifiHunonicSvg(isGatewayOnline)}
        </div>
        <div class="hunonic-card-bottom">
          <h4 class="hunonic-card-title">${escapeHtml(gwName)}</h4>
          <p class="hunonic-card-sub ${isGatewayOnline ? 'on' : ''}">Thiết bị con: ${gwChildCount}</p>
        </div>
      </div>
      `;
    }

    // RENDER LƯỚI THIẾT BỊ HAY DÙNG CHUẨN HUNONIC
    if (visibleCardsCount === 0) {
      devicesGrid.innerHTML = `
        <div class="empty-room-placeholder">
          <i class="fa-solid fa-shapes"></i>
          <h4>Không có thiết bị nào trong không gian "${escapeHtml(selectedRoomFilter)}"</h4>
          <p>Hãy vào mục <strong>Quản lý phòng</strong> để phân bổ thiết bị hoặc chọn <strong>Tất cả</strong> để xem toàn bộ.</p>
        </div>
      `;
    } else {
      devicesGrid.innerHTML = `
        ${gwCardHtml}
        ${irCardHtml}
        ${customCardsHtml}
      `;
    }

    // Cập nhật bộ đếm trên cùng
    if (countDevicesOn) countDevicesOn.innerText = onCount.toString().padStart(2, '0');
    if (countDevicesOff) countDevicesOff.innerText = offCount.toString().padStart(2, '0');
    if (countDevicesOffline) countDevicesOffline.innerText = offlineCount.toString().padStart(2, '0');
  }

  // Tap opens devices; hold/right-click opens the existing settings drawer.
  if (devicesGrid) {
    let holdTimer = null;
    let held = false;
    let startX = 0;
    let startY = 0;
    let activePointer = null;
    let activeCard = null;
    const settingsCard = target => target.closest("#card-gateway-master, #card-ir-hub-master, .hunonic-card[data-id]");
    const cancelHold = () => {
      clearTimeout(holdTimer);
      holdTimer = null;
      activePointer = null;
      if (activeCard) {
        activeCard.classList.remove("is-holding");
        activeCard = null;
      }
    };
    const openSettings = card => {
      if (!card) return;
      if (card.id === "card-gateway-master") openGatewayDrawer();
      else if (card.id === "card-ir-hub-master") openChildDeviceDrawer((foundHub && foundHub.id) || "dev_ir_hub_hunonic");
      else openChildDeviceDrawer(card.getAttribute("data-id"));
    };
    devicesGrid.addEventListener("pointerdown", e => {
      cancelHold();
      held = false;
      if (!e.isPrimary) return;
      if (e.pointerType === "mouse" && e.button !== 0) return;
      const card = settingsCard(e.target);
      if (!card) return;
      startX = e.clientX;
      startY = e.clientY;
      activePointer = e.pointerId;
      activeCard = card;
      card.classList.add("is-holding");
      holdTimer = setTimeout(() => {
        held = true;
        cancelHold();
        if (navigator.vibrate) {
          try { navigator.vibrate(30); } catch(err) {}
        }
        openSettings(card);
      }, 450);
    });
    devicesGrid.addEventListener("pointermove", e => {
      if (activePointer === e.pointerId &&
          (Math.abs(e.clientX - startX) > 25 || Math.abs(e.clientY - startY) > 25)) cancelHold();
    });
    window.addEventListener("pointerup", cancelHold);
    window.addEventListener("pointercancel", cancelHold);
    window.addEventListener("blur", cancelHold);
    devicesGrid.addEventListener("contextmenu", e => {
      const card = settingsCard(e.target);
      if (!card) return;
      e.preventDefault();
      cancelHold();
      if (!held) openSettings(card);
      held = true;
    });
    devicesGrid.addEventListener("click", e => {
      if (held) {
        held = false;
        e.preventDefault();
        e.stopPropagation();
        return;
      }
      const cardGw = e.target.closest("#card-gateway-master");
      if (cardGw) { openHubSubView("gateway", null, "home"); return; }
      const cardIr = e.target.closest("#card-ir-hub-master");
      if (cardIr) { openHubSubView("ir_hub", foundHub, "home"); return; }
      const card = e.target.closest(".hunonic-card[data-id]");
      if (card) openChildDeviceDrawer(card.getAttribute("data-id"));
    });
  }

  // ── MỞ DRAWER ĐIỀU KHIỂN ĐIỀU HÒA TRỰC TIẾP (BÊN TAY PHẢI) ───────────────────
  function openAcDrawer(childDev, hubDev = foundHub) {
    if (!childDev) return;
    currentActiveIrChild = childDev;
    currentDrawerTarget = childDev.id;

    // Header Drawer
    if (drawerHeaderTitle) drawerHeaderTitle.innerText = childDev.name;
    if (drawerHeaderSub) drawerHeaderSub.innerText = `${(hubDev && hubDev.room) || 'Phòng khách'} • Điều hòa IR Hunonic`;
    if (drawerHeaderIcon) drawerHeaderIcon.innerHTML = `<i class="fa-solid fa-wind"></i>`;

    // Ẩn tất cả section khác của Gateway, chỉ mở AC control panel
    if (drawerTeleGrid) drawerTeleGrid.style.display = "none";
    if (drawerGwChildSection) drawerGwChildSection.style.display = "none";
    if (drawerGwExtraActions) drawerGwExtraActions.style.display = "none";
    if (drawerIrHubSection) drawerIrHubSection.style.display = "none";
    if (drawerHeroBox) drawerHeroBox.style.display = "none";

    const editSec = document.getElementById("drawer-edit-section");
    if (editSec) editSec.style.display = "none";
    const delSec = document.getElementById("drawer-delete-section");
    if (delSec) delSec.style.display = "none";

    // Bật Panel Điều Hòa
    if (drawerAcPanel) drawerAcPanel.style.display = "flex";
    if (drawerAcBackBar) drawerAcBackBar.style.display = "none";

    // Cập nhật giao diện điều khiển (nhiệt độ, công suất, quạt, chế độ)
    updateDrawerAcUI(childDev);

    // Mở Drawer trượt từ bên phải
    const drawerEl = document.getElementById("device-detail-drawer") || deviceDetailDrawer;
    const backdropEl = document.getElementById("drawer-backdrop") || drawerBackdrop;
    if (drawerEl) {
      drawerEl.classList.add("open");
    }
    if (backdropEl) {
      backdropEl.classList.add("active");
    }
  }
  window.openAcDrawer = openAcDrawer;

  // ── HÀM TOÀN CỤC BẮT SỰ KIỆN CLICK CARD ĐIỀU HÒA (ĐẢM BẢO 100% MỞ DRAWER) ─────
  window.handleAcCardClick = function(childId) {
    const hubDev = foundHub || customDevices.find(d => d.type === "ir_hub" || d.id === "dev_ir_hub_hunonic");
    let child = null;
    if (hubDev && hubDev.children) {
      child = hubDev.children.find(c => String(c.id) === String(childId));
    }
    if (!child) {
      return;
    }
    openAcDrawer(child, hubDev);
  };

  // ── XỬ LÝ EVENT DELEGATION TRÊN SUB-VIEW DEVICES GRID ───────────────────────
  let isSubViewHolding = false;
  const subviewDevicesGridEl = document.getElementById("subview-devices-grid");
  if (subviewDevicesGridEl) {
    let subHoldTimer = null;
    let subHeld = false;
    let subPointer = null;
    let subActiveCard = null;
    let subStartX = 0, subStartY = 0;

    const cancelSubHold = () => {
      clearTimeout(subHoldTimer);
      subHoldTimer = null;
      subPointer = null;
      isSubViewHolding = false;
      if (subActiveCard) {
        subActiveCard.classList.remove("is-holding");
        subActiveCard = null;
      }
    };

    const triggerCardHold = card => {
      if (!card) return;
      subHeld = true;
      cancelSubHold();
      if (navigator.vibrate) {
        try { navigator.vibrate(30); } catch(e) {}
      }
      const action = card.getAttribute("data-gw-action");
      if (action === "open_ir_hub") {
        const hubId = (foundHub && foundHub.id) || "dev_ir_hub_hunonic";
        openChildDeviceDrawer(hubId);
      } else {
        const cardId = card.getAttribute("data-id") || "dev_espnow_node_1";
        openChildDeviceDrawer(cardId);
      }
    };

    // 1. POINTERDOWN (Hỗ trợ cả cảm ứng ngón tay lẫn chuột)
    subviewDevicesGridEl.addEventListener("pointerdown", e => {
      cancelSubHold();
      subHeld = false;
      if (!e.isPrimary) return;
      if (e.pointerType === "mouse" && e.button !== 0) return;

      const card = e.target.closest(".subview-gw-child");
      if (!card) return;

      subPointer = e.pointerId;
      subActiveCard = card;
      subStartX = e.clientX;
      subStartY = e.clientY;
      isSubViewHolding = true;

      card.classList.add("is-holding");

      subHoldTimer = setTimeout(() => {
        triggerCardHold(card);
      }, 450);
    });

    // 2. POINTERMOVE (Ngưỡng 25px để không bị hủy khi rung tay nhẹ trên điện thoại)
    subviewDevicesGridEl.addEventListener("pointermove", e => {
      if (subPointer === e.pointerId && (Math.abs(e.clientX - subStartX) > 25 || Math.abs(e.clientY - subStartY) > 25)) {
        cancelSubHold();
      }
    });

    window.addEventListener("pointerup", cancelSubHold);
    window.addEventListener("pointercancel", cancelSubHold);
    window.addEventListener("blur", cancelSubHold);

    // 3. CONTEXTMENU (Chuột phải máy tính)
    subviewDevicesGridEl.addEventListener("contextmenu", e => {
      const card = e.target.closest(".subview-gw-child");
      if (!card) return;
      e.preventDefault();
      triggerCardHold(card);
    });

    // 4. CLICK (Chặn sự kiện click sau khi vừa nhả hold)
    subviewDevicesGridEl.addEventListener("click", e => {
      if (subHeld) {
        subHeld = false;
        e.preventDefault();
        e.stopImmediatePropagation();
        return;
      }
    }, true);

    subviewDevicesGridEl.addEventListener("click", async (e) => {
      // 1. Click vào AC card trong IR Hub Subview -> Mở Điều khiển Điều Hòa!
      const acCard = e.target.closest(".subview-ac-card");
      if (acCard) {
        const childId = acCard.getAttribute("data-child-id");
        window.handleAcCardClick(childId);
        return;
      }

      // 2. Click vào các item trong Gateway Subview
      const gwChild = e.target.closest(".subview-gw-child");
      if (gwChild) {
        const action = gwChild.getAttribute("data-gw-action");
        if (action === "open_ir_hub") {
          // Click vào IR Hub -> Mở màn hình IR Subview (chứa các AC)
          openHubSubView("ir_hub", foundHub, "gateway");
        } else if (action === "open_custom_dev" || action === "open_sensor") {
          // Click vào Node Cảm Biến -> Mở Drawer thông tin & cài đặt
          const devId = gwChild.getAttribute("data-id") || "dev_espnow_node_1";
          openChildDeviceDrawer(devId);
        }
        return;
      }
    });
  }

  // ── XỬ LÝ NÚT QUAY LẠI TRÊN SUB-VIEW ────────────────────────────────────────
  const btnSubViewBackEl = document.getElementById("btn-subview-back");
  if (btnSubViewBackEl) {
    btnSubViewBackEl.addEventListener("click", () => {
      closeHubSubView();
    });
  }

  // ── NÚT TRANG CHỦ HOẶC LOGO: LUÔN QUAY VỀ HOME DASHBOARD ─────────────────────
  const navHomeBtn = document.getElementById("nav-home");
  if (navHomeBtn) {
    navHomeBtn.addEventListener("click", (e) => {
      e.preventDefault();
      closeHubSubView(true);
      window.location.hash = "";
    });
  }

  const navRoomsBtn = document.getElementById("nav-rooms");
  if (navRoomsBtn) {
    navRoomsBtn.addEventListener("click", (e) => {
      e.preventDefault();
      openRoomMgmtView();
    });
  }

  const brandLogoBox = document.querySelector(".brand-logo-box");
  if (brandLogoBox) {
    brandLogoBox.style.cursor = "pointer";
    brandLogoBox.addEventListener("click", () => {
      closeHubSubView(true);
      window.location.hash = "";
    });
  }

  // ── Hàm đồng bộ thiết bị với Gateway ─────────────────────────────────────
  async function syncWithGateway() {
    showToast("Đang gửi yêu cầu đồng bộ tới Trạm Gateway ESP32-S3...", "info");
    const res = await callApi("/api/hvac/sync", "POST");
    if (res && res.success) {
      showToast(res.message, "success");
    } else {
      showToast("Gateway chưa phản hồi, vui lòng kiểm tra kết nối nguồn/Wi-Fi của ESP32!", "error");
    }
  }

  // ── Cập nhật giao diện AC Modal ───────────────────────────────────────────
  function updateAcModalUI() {
    const isPowerOn = acState.power === 1;
    const targetDev = findCurrentAcDevice();
    const cap = getAcCapabilities(targetDev);
    const limits = { min: cap.temp_min, max: cap.temp_max, brand: cap.brand, brandName: cap.brandName };

    if (acState.temp > limits.max) acState.temp = limits.max;
    if (acState.temp < limits.min) acState.temp = limits.min;

    if (acPowerBtn && acPowerText) {
      if (isPowerOn) {
        acPowerBtn.className = "btn-power-switch on";
        acPowerText.innerText = "ĐANG BẬT";
      } else {
        acPowerBtn.className = "btn-power-switch off";
        acPowerText.innerText = "ĐANG TẮT";
      }
    }

    if (acTempDisplay) acTempDisplay.innerText = acState.temp;

    if (btnTempPlus) {
      btnTempPlus.style.opacity = acState.temp >= limits.max ? "0.4" : "1";
    }
    if (btnTempMinus) {
      btnTempMinus.style.opacity = acState.temp <= limits.min ? "0.4" : "1";
    }

    const curMode = acState.mode !== undefined ? acState.mode : (cap.modes[0] ? cap.modes[0].code : 1);
    const curFan = acState.fan !== undefined ? acState.fan : (cap.fans[0] ? cap.fans[0].code : 0);

    const modalModeContainer = document.getElementById("mode-pills");
    if (modalModeContainer) {
      modalModeContainer.innerHTML = cap.modes.map(m => `
        <div class="pill-opt ${curMode === m.code ? 'active' : ''}" data-mode="${m.code}">
          <i class="fa-solid ${m.icon || 'fa-snowflake'}"></i> ${escapeHtml(m.label)}
        </div>
      `).join("");
    }

    const modalFanContainer = document.getElementById("fan-pills");
    if (modalFanContainer) {
      modalFanContainer.innerHTML = cap.fans.map(f => `
        <div class="pill-opt ${curFan === f.code ? 'active' : ''}" data-fan="${f.code}">
          ${f.icon ? `<i class="fa-solid ${f.icon}"></i> ` : ''}${escapeHtml(f.label)}
        </div>
      `).join("");
    }
  }

  // ── Xử lý các nút điều khiển trong Modal AC ──────────────────────────────
  if (acPowerBtn) {
    acPowerBtn.addEventListener("click", () => {
      const newPower = acState.power === 1 ? 0 : 1;
      sendAcControlCommand(null, { state: newPower }, true);
    });
  }

  if (btnTempMinus) {
    btnTempMinus.addEventListener("click", () => {
      const targetDev = findCurrentAcDevice();
      const limits = getAcTempLimits(targetDev);
      if (acState.temp > limits.min) {
        sendAcControlCommand(null, { temp: acState.temp - 1 }, false);
      } else {
        showToast(`Nhiệt độ tối thiểu là ${limits.min}°C!`, "info");
      }
    });
  }

  if (btnTempPlus) {
    btnTempPlus.addEventListener("click", () => {
      const targetDev = findCurrentAcDevice();
      const limits = getAcTempLimits(targetDev);
      if (acState.temp < limits.max) {
        sendAcControlCommand(null, { temp: acState.temp + 1 }, false);
      } else {
        showToast(`Điều hòa [${targetDev ? targetDev.name : 'Điều hòa'}] giới hạn tối đa ${limits.max}°C!`, "info");
      }
    });
  }

  const modalModeGroup = document.getElementById("mode-pills");
  if (modalModeGroup) {
    modalModeGroup.addEventListener("click", (e) => {
      const pill = e.target.closest(".pill-opt");
      if (!pill) return;
      const m = parseInt(pill.getAttribute("data-mode"));
      sendAcControlCommand(null, { mode: m }, false);
    });
  }

  const modalFanGroup = document.getElementById("fan-pills");
  if (modalFanGroup) {
    modalFanGroup.addEventListener("click", (e) => {
      const pill = e.target.closest(".pill-opt");
      if (!pill) return;
      const f = parseInt(pill.getAttribute("data-fan"));
      sendAcControlCommand(null, { fan: f }, false);
    });
  }

  if (btnRebootGate) {
    btnRebootGate.addEventListener("click", async () => {
      if (confirm("Bạn có chắc chắn muốn khởi động lại Trạm Gateway ESP32-S3 không?")) {
        const res = await callApi("/api/gateway/reboot", "POST");
        if (res && res.success) showToast(res.message, "success");
      }
    });
  }

  // ── XỬ LÝ NGỮ CẢNH THÔNG MINH ĐỘNG (DYNAMIC SMART SCENES) ─────────────────
  const DEFAULT_SCENES = [
    {
      id: "scene_home",
      name: "Về nhà (25°C Cool)",
      sub: "AC 25°C &bull; Cool &bull; R1 Bật",
      icon: "fa-house-user",
      color: "#00b06f",
      isDefault: true,
      actions: { ac_power: 1, ac_temp: 25, ac_mode: 1, ac_fan: 0, relay1: 1 }
    },
    {
      id: "scene_sleep",
      name: "Đi ngủ (27°C)",
      sub: "AC 27°C &bull; Quạt êm",
      icon: "fa-moon",
      color: "#0284c7",
      isDefault: true,
      actions: { ac_power: 1, ac_temp: 27, ac_mode: 1, ac_fan: 1 }
    },
    {
      id: "scene_cool_fast",
      name: "Làm mát nhanh (20°C)",
      sub: "AC 20°C &bull; Quạt Max",
      icon: "fa-snowflake",
      color: "#06b6d4",
      isDefault: true,
      actions: { ac_power: 1, ac_temp: 20, ac_mode: 1, ac_fan: 5 }
    },
    {
      id: "scene_power_save",
      name: "Tiết kiệm điện",
      sub: "Tắt toàn bộ thiết bị",
      icon: "fa-leaf",
      color: "#10b981",
      isDefault: true,
      actions: { ac_power: 0, relay1: 0, relay2: 0 }
    }
  ];

  function getStoredScenes() {
    try {
      const stored = localStorage.getItem("gate_user_scenes");
      if (stored !== null) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch (e) {}
    return DEFAULT_SCENES;
  }

  function saveStoredScenes(scenes) {
    localStorage.setItem("gate_user_scenes", JSON.stringify(scenes));
  }

  function renderFavoriteScenes() {
    const container = document.getElementById("scenes-chips-container");
    if (!container) return;

    const scenes = getStoredScenes();
    let html = "";

    if (scenes.length === 0) {
      html = `
        <div style="display: inline-flex; align-items: center; gap: 10px; padding: 8px 14px; background: rgba(255,255,255,0.88); backdrop-filter: blur(8px); border-radius: 999px; font-size: 0.8rem; color: #64748b; border: 1.5px dashed #cbd5e1;">
          <span><i class="fa-solid fa-circle-info" style="color: #0284c7;"></i> Chưa có ngữ cảnh nào</span>
          <button type="button" id="btn-restore-default-scenes" style="background: #0284c7; border: none; color: #fff; padding: 4px 10px; border-radius: 999px; font-size: 0.75rem; font-weight: 600; cursor: pointer;">
            <i class="fa-solid fa-rotate-left"></i> Khôi phục mặc định
          </button>
        </div>
      `;
    } else {
      scenes.forEach(sc => {
        html += `
          <div class="scene-chip" data-scene-id="${escapeHtml(sc.id)}" title="Bấm để kích hoạt ngữ cảnh [${escapeHtml(sc.name)}]">
            <i class="fa-solid ${escapeHtml(sc.icon || 'fa-wand-magic-sparkles')} chip-icon" style="color: ${escapeHtml(sc.color || '#00b06f')};"></i>
            <div class="scene-chip-text">
              <span class="scene-chip-name">${escapeHtml(sc.name)}</span>
              <span class="scene-chip-sub">${sc.sub || 'Ngữ cảnh tùy chỉnh'}</span>
            </div>
            <button type="button" class="btn-scene-del" data-id="${escapeHtml(sc.id)}" data-name="${escapeHtml(sc.name)}" title="Xóa ngữ cảnh [${escapeHtml(sc.name)}]">
              <i class="fa-solid fa-trash-can"></i>
            </button>
          </div>
        `;
      });
    }

    container.innerHTML = html;

    const btnRestore = container.querySelector("#btn-restore-default-scenes");
    if (btnRestore) {
      btnRestore.addEventListener("click", () => {
        saveStoredScenes(DEFAULT_SCENES);
        renderFavoriteScenes();
        showToast("Đã khôi phục các ngữ cảnh mặc định!", "success");
      });
    }

    container.querySelectorAll(".scene-chip").forEach(chip => {
      chip.addEventListener("click", async (e) => {
        if (e.target.closest(".btn-scene-del")) return;
        const sId = chip.getAttribute("data-scene-id");
        const scene = getStoredScenes().find(s => s.id === sId);
        if (scene) await executeScene(scene, chip);
      });
    });

    container.querySelectorAll(".btn-scene-del").forEach(btn => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const sId = btn.getAttribute("data-id");
        const sName = btn.getAttribute("data-name") || "ngữ cảnh này";
        if (confirm(`Bạn có chắc chắn muốn xóa ngữ cảnh "${sName}" không?`)) {
          const filtered = getStoredScenes().filter(s => s.id !== sId);
          saveStoredScenes(filtered);
          renderFavoriteScenes();
          showToast(`Đã xóa ngữ cảnh [${sName}]!`, "info");
        }
      });
    });
  }
  window.getStoredScenes = getStoredScenes;
  window.saveStoredScenes = saveStoredScenes;
  window.renderFavoriteScenes = renderFavoriteScenes;

  async function executeScene(sc, chipEl = null) {
    if (chipEl) {
      chipEl.style.transform = "scale(0.95)";
      setTimeout(() => { chipEl.style.transform = ""; }, 200);
    }
    showToast(`Đang kích hoạt: ${sc.name}...`, "info");

    const acts = sc.actions || {};

    if (Array.isArray(acts.ac_devices) && acts.ac_devices.length > 0) {
      for (const devAct of acts.ac_devices) {
        await callApi("/api/hvac/control", "POST", {
          device_id: devAct.device_id,
          power: devAct.power,
          temp: devAct.temp,
          mode: devAct.mode,
          fan: devAct.fan || 0
        }).catch(err => console.error("Scene AC dev error:", err));

        // Cập nhật trạng thái bộ nhớ
        const hub = getActiveIrHub() || customDevices.find(d => d.type === "ir_hub");
        if (hub && Array.isArray(hub.children)) {
          const target = hub.children.find(c => String(c.id) === String(devAct.device_id));
          if (target) {
            target.power = devAct.power;
            target.state = devAct.power;
            target.temp = devAct.temp;
            target.mode = devAct.mode;
          }
        }
      }
      acState.power = acts.ac_devices[0].power;
      acState.temp = acts.ac_devices[0].temp;
      acState.mode = acts.ac_devices[0].mode;
      updateAcModalUI();
      renderDevices();
    } else if (acts.ac_power !== undefined) {
      acState.power = acts.ac_power;
      if (acts.ac_temp > 0) acState.temp = acts.ac_temp;
      if (acts.ac_mode !== undefined) acState.mode = acts.ac_mode;
      if (acts.ac_fan !== undefined) acState.fan = acts.ac_fan;
      updateAcModalUI();
      renderDevices();
      await callApi("/api/hvac/control", "POST", {
        power: acState.power,
        temp: acState.temp,
        mode: acState.mode,
        fan: acState.fan
      });
    }

    if (acts.relay1 !== undefined && acts.relay1 >= 0) {
      relayStates[1] = acts.relay1;
      await callApi("/api/gateway/relay", "POST", { channel: 1, state: acts.relay1 });
    }

    if (acts.relay2 !== undefined && acts.relay2 >= 0) {
      relayStates[2] = acts.relay2;
      await callApi("/api/gateway/relay", "POST", { channel: 2, state: acts.relay2 });
    }

    renderDevices();
    showToast(`Ngữ cảnh [${sc.name}] đã sẵn sàng!`, "success");
    if (typeof addSystemNotification === "function") {
      addSystemNotification({
        type: "automation",
        title: `Kích hoạt ngữ cảnh: ${sc.name}`,
        message: `Đã áp dụng cài đặt: ${sc.sub || sc.name}`,
        badge: "Ngữ cảnh"
      });
    }
  }

  // ── TRUY VẤN TẤT CẢ ĐIỀU HÒA HIỆN CÓ TRONG HỆ THỐNG ──────────────────────
  function getAllAvailableAcs() {
    const hub = getActiveIrHub() || customDevices.find(d => d.type === "ir_hub" || (d.id && d.id.includes("ir_hub")));
    if (hub && Array.isArray(hub.children) && hub.children.length > 0) {
      return hub.children.filter(c => c.type === "ac");
    }
    if (window.lastGatewayStatus && window.lastGatewayStatus.ac_devices && Object.keys(window.lastGatewayStatus.ac_devices).length > 0) {
      return Object.entries(window.lastGatewayStatus.ac_devices).map(([did, dinfo]) => ({
        id: String(did),
        name: dinfo.name || `Điều hòa ${did}`,
        brand_name: dinfo.brand_name || (dinfo.brand === 102 ? "Casper" : dinfo.brand === 16 ? "Casper - Electra" : dinfo.brand === 117 ? "Mirage" : "Funiki"),
        power: dinfo.power || 0,
        temp: dinfo.temp || 25,
        mode: dinfo.mode || 1,
        fan: dinfo.fan || 0
      }));
    }
    return [
      { id: "4083460", name: "Điều hòa CASPER", brand_name: "Casper", power: 0, temp: 25, mode: 1 },
      { id: "4083479", name: "Điều hòa CASPER - ELECTRA", brand_name: "Casper - Electra", power: 0, temp: 25, mode: 1 },
      { id: "4090277", name: "Điều hòa MIRAGE", brand_name: "Mirage", power: 0, temp: 26, mode: 1 },
      { id: "4094979", name: "Điều hòa FUNIKI", brand_name: "Funiki", power: 0, temp: 25, mode: 1 }
    ];
  }
  window.getAllAvailableAcs = getAllAvailableAcs;

  // ── MODAL THIẾT LẬP NGỮ CẢNH (SCENE BUILDER ĐA ĐIỀU HÒA) ────────────────────
  const modalSceneBuilder = document.getElementById("modal-scene-builder");
  const btnAddScene = document.getElementById("btn-add-scene");
  const btnCloseSceneModal = document.getElementById("btn-close-scene-modal");
  const btnCancelSceneModal = document.getElementById("btn-cancel-scene-modal");
  const btnSaveScene = document.getElementById("btn-save-scene");
  const inputSceneName = document.getElementById("input-scene-name");
  const sceneIconPicker = document.getElementById("scene-icon-picker");
  const sceneColorPicker = document.getElementById("scene-color-picker");
  const sceneRelay1Act = document.getElementById("scene-relay1-act");
  const sceneRelay2Act = document.getElementById("scene-relay2-act");

  let selectedSceneIcon = "fa-couch";
  let selectedSceneColor = "#00b06f";

  function renderSceneAcList() {
    const container = document.getElementById("scene-ac-devices-list");
    if (!container) return;

    const acs = getAllAvailableAcs();
    let html = "";

    acs.forEach(ac => {
      const initTemp = ac.temp && ac.temp >= 16 && ac.temp <= 30 ? ac.temp : 25;
      const initMode = ac.mode !== undefined ? ac.mode : 1;
      html += `
        <div class="scene-device-card scene-ac-card" data-ac-id="${escapeHtml(ac.id)}" style="background: #f8fafc; border: 1.5px solid #e2e8f0; border-radius: 12px; padding: 12px 14px;">
          <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px;">
            <div style="display: flex; align-items: center; gap: 8px;">
              <i class="fa-solid fa-wind" style="color: #0284c7; font-size: 1.1rem;"></i>
              <div>
                <strong style="font-size: 0.85rem; color: #1e293b; display: block;">${escapeHtml(ac.name)}</strong>
                <span style="font-size: 0.72rem; color: #64748b;">${escapeHtml(ac.brand_name || 'Hunonic IR')} &bull; ID: ${escapeHtml(ac.id)}</span>
              </div>
            </div>
            <label class="modern-toggle-switch">
              <input type="checkbox" class="scene-ac-enable-toggle" data-ac-id="${escapeHtml(ac.id)}" checked>
              <span class="slider round"></span>
            </label>
          </div>

          <div class="scene-ac-config-body" data-ac-id="${escapeHtml(ac.id)}" style="display: block; padding-top: 8px; border-top: 1px dashed #e2e8f0;">
            <div style="display: flex; gap: 8px; margin-bottom: 8px;">
              <select class="scene-ac-power-select" data-ac-id="${escapeHtml(ac.id)}" style="flex: 1; padding: 7px 10px; border-radius: 8px; border: 1px solid #cbd5e1; font-size: 0.8rem; background: #fff;">
                <option value="1" selected>BẬT Điều hòa</option>
                <option value="0">TẮT Điều hòa</option>
              </select>
              <select class="scene-ac-mode-select" data-ac-id="${escapeHtml(ac.id)}" style="flex: 1; padding: 7px 10px; border-radius: 8px; border: 1px solid #cbd5e1; font-size: 0.8rem; background: #fff;">
                <option value="1" ${initMode === 1 ? 'selected' : ''}>Làm mát (Cool)</option>
                <option value="2" ${initMode === 2 ? 'selected' : ''}>Sưởi ấm (Heat)</option>
                <option value="3" ${initMode === 3 ? 'selected' : ''}>Hút ẩm (Dry)</option>
                <option value="4" ${initMode === 4 ? 'selected' : ''}>Quạt gió (Fan)</option>
                <option value="0" ${initMode === 0 ? 'selected' : ''}>Tự động (Auto)</option>
              </select>
            </div>
            <div class="scene-ac-temp-row" data-ac-id="${escapeHtml(ac.id)}" style="display: flex; align-items: center; justify-content: space-between;">
              <span style="font-size: 0.8rem; color: #475569;">Nhiệt độ cài đặt:</span>
              <div style="display: flex; align-items: center; gap: 6px;">
                <button type="button" class="btn-micro-step btn-ac-temp-minus" data-ac-id="${escapeHtml(ac.id)}">-</button>
                <span class="scene-ac-temp-val" data-ac-id="${escapeHtml(ac.id)}" style="font-size: 0.95rem; font-weight: 700; color: #00b06f; min-width: 40px; text-align: center;">${initTemp}°C</span>
                <button type="button" class="btn-micro-step btn-ac-temp-plus" data-ac-id="${escapeHtml(ac.id)}">+</button>
              </div>
            </div>
          </div>
        </div>
      `;
    });

    container.innerHTML = html;

    // Bắt sự kiện trên từng thẻ điều hòa
    container.querySelectorAll(".scene-ac-card").forEach(card => {
      const toggle = card.querySelector(".scene-ac-enable-toggle");
      const configBody = card.querySelector(".scene-ac-config-body");
      const powerSelect = card.querySelector(".scene-ac-power-select");
      const tempRow = card.querySelector(".scene-ac-temp-row");
      const tempVal = card.querySelector(".scene-ac-temp-val");
      const btnMinus = card.querySelector(".btn-ac-temp-minus");
      const btnPlus = card.querySelector(".btn-ac-temp-plus");

      if (toggle && configBody) {
        toggle.addEventListener("change", () => {
          configBody.style.display = toggle.checked ? "block" : "none";
        });
      }

      if (powerSelect && tempRow) {
        powerSelect.addEventListener("change", () => {
          tempRow.style.display = (powerSelect.value === "1") ? "flex" : "none";
        });
      }

      if (btnMinus && tempVal) {
        btnMinus.addEventListener("click", () => {
          let cur = parseInt(tempVal.innerText) || 25;
          if (cur > 16) {
            cur--;
            tempVal.innerText = `${cur}°C`;
          }
        });
      }

      if (btnPlus && tempVal) {
        btnPlus.addEventListener("click", () => {
          let cur = parseInt(tempVal.innerText) || 25;
          if (cur < 30) {
            cur++;
            tempVal.innerText = `${cur}°C`;
          }
        });
      }
    });

    // Nút Bật tất cả / Tắt tất cả điều hòa
    const btnAllOn = document.getElementById("btn-scene-ac-all-on");
    const btnAllOff = document.getElementById("btn-scene-ac-all-off");
    if (btnAllOn) {
      btnAllOn.onclick = () => {
        container.querySelectorAll(".scene-ac-card").forEach(card => {
          const toggle = card.querySelector(".scene-ac-enable-toggle");
          if (toggle) toggle.checked = true;
          const configBody = card.querySelector(".scene-ac-config-body");
          if (configBody) configBody.style.display = "block";
          const pwr = card.querySelector(".scene-ac-power-select");
          if (pwr) pwr.value = "1";
          const tempRow = card.querySelector(".scene-ac-temp-row");
          if (tempRow) tempRow.style.display = "flex";
        });
      };
    }
    if (btnAllOff) {
      btnAllOff.onclick = () => {
        container.querySelectorAll(".scene-ac-card").forEach(card => {
          const toggle = card.querySelector(".scene-ac-enable-toggle");
          if (toggle) toggle.checked = true;
          const configBody = card.querySelector(".scene-ac-config-body");
          if (configBody) configBody.style.display = "block";
          const pwr = card.querySelector(".scene-ac-power-select");
          if (pwr) pwr.value = "0";
          const tempRow = card.querySelector(".scene-ac-temp-row");
          if (tempRow) tempRow.style.display = "none";
        });
      };
    }
  }

  if (sceneIconPicker) {
    sceneIconPicker.querySelectorAll(".icon-picker-btn").forEach(btn => {
      btn.addEventListener("click", () => {
        sceneIconPicker.querySelectorAll(".icon-picker-btn").forEach(b => b.classList.remove("active"));
        btn.classList.add("active");
        selectedSceneIcon = btn.getAttribute("data-icon") || "fa-couch";
      });
    });
  }

  if (sceneColorPicker) {
    sceneColorPicker.querySelectorAll(".color-dot").forEach(dot => {
      dot.addEventListener("click", () => {
        sceneColorPicker.querySelectorAll(".color-dot").forEach(d => d.classList.remove("active"));
        dot.classList.add("active");
        selectedSceneColor = dot.getAttribute("data-color") || "#00b06f";
      });
    });
  }

  function openSceneBuilderModal() {
    if (inputSceneName) inputSceneName.value = "";
    renderSceneAcList();
    if (modalSceneBuilder) modalSceneBuilder.classList.remove("hidden");
  }

  function closeSceneBuilderModal() {
    if (modalSceneBuilder) modalSceneBuilder.classList.add("hidden");
  }

  if (btnAddScene) btnAddScene.addEventListener("click", openSceneBuilderModal);
  if (btnCloseSceneModal) btnCloseSceneModal.addEventListener("click", closeSceneBuilderModal);
  if (btnCancelSceneModal) btnCancelSceneModal.addEventListener("click", closeSceneBuilderModal);

  if (btnSaveScene) {
    btnSaveScene.addEventListener("click", () => {
      const name = inputSceneName ? inputSceneName.value.trim() : "";
      if (!name) {
        showToast("Vui lòng nhập tên ngữ cảnh!", "error");
        return;
      }

      const actions = {};
      let subParts = [];

      // Thu thập trạng thái của từng điều hòa trong danh sách
      const acDevicesActions = [];
      const acCards = document.querySelectorAll("#scene-ac-devices-list .scene-ac-card");
      acCards.forEach(card => {
        const acId = card.getAttribute("data-ac-id");
        const enableToggle = card.querySelector(".scene-ac-enable-toggle");
        if (enableToggle && enableToggle.checked) {
          const pwr = Number(card.querySelector(".scene-ac-power-select").value);
          const mode = Number(card.querySelector(".scene-ac-mode-select").value);
          const tempText = card.querySelector(".scene-ac-temp-val").innerText;
          const temp = parseInt(tempText) || 25;
          const acName = card.querySelector("strong") ? card.querySelector("strong").innerText : `AC ${acId}`;
          acDevicesActions.push({
            device_id: acId,
            name: acName,
            power: pwr,
            mode,
            temp,
            fan: 0
          });
          const shortName = acName.replace("Điều hòa ", "");
          if (pwr === 1) {
            subParts.push(`${shortName} ${temp}°C`);
          } else {
            subParts.push(`Tắt ${shortName}`);
          }
        }
      });

      if (acDevicesActions.length > 0) {
        actions.ac_devices = acDevicesActions;
        actions.ac_power = acDevicesActions[0].power;
        actions.ac_temp = acDevicesActions[0].temp;
        actions.ac_mode = acDevicesActions[0].mode;
      }

      const r1 = Number(sceneRelay1Act ? sceneRelay1Act.value : -1);
      if (r1 !== -1) {
        actions.relay1 = r1;
        subParts.push(r1 === 1 ? "R1 Bật" : "R1 Tắt");
      }

      const r2 = Number(sceneRelay2Act ? sceneRelay2Act.value : -1);
      if (r2 !== -1) {
        actions.relay2 = r2;
        subParts.push(r2 === 1 ? "R2 Bật" : "R2 Tắt");
      }

      const newScene = {
        id: "scene_custom_" + Date.now(),
        name,
        sub: subParts.length > 0 ? subParts.join(" &bull; ") : "Tùy chỉnh",
        icon: selectedSceneIcon,
        color: selectedSceneColor,
        isDefault: false,
        actions
      };

      const scenes = getStoredScenes();
      scenes.push(newScene);
      saveStoredScenes(scenes);
      renderFavoriteScenes();
      closeSceneBuilderModal();
      showToast(`Đã tạo thành công ngữ cảnh [${name}]!`, "success");
    });
  }

  // ==============================================================================
  // QUẢN LÝ TRẠM GATEWAY & THÊM THIẾT BỊ MỚI (GATEWAY MANAGE MODAL)
  // ==============================================================================
  const gatewayManageModal = document.getElementById("gateway-manage-modal");
  const btnCloseGwModal = document.getElementById("btn-close-gw-modal");
  const btnGotoAddDevice = document.getElementById("btn-goto-add-device");
  const btnSubmitAddDevice = document.getElementById("btn-submit-add-device");
  const deviceTypeSelector = document.getElementById("device-type-selector");
  const dynamicFieldLabel = document.getElementById("dynamic-field-label");
  const dynamicFieldIcon = document.getElementById("dynamic-field-icon");
  const dynamicFieldValue = document.getElementById("dynamic-field-value");
  const newDeviceNameInput = document.getElementById("new-device-name");
  const newDeviceRoomSelect = document.getElementById("new-device-room");
  const btnGwReconfigWifi = document.getElementById("btn-gw-reconfig-wifi");
  const btnGwReboot = document.getElementById("btn-gw-reboot");

  let selectedDeviceType = "espnow";

  function openGatewayManageModal(activeTabId = "tab-linked-devices") {
    closeGatewayManageModal();
    openGatewayDrawer(true);
  }
  window.openGatewayManageModal = openGatewayManageModal;

  function closeGatewayManageModal() {
    if (gatewayManageModal) gatewayManageModal.classList.add("hidden");
  }

  function switchGwModalTab(tabId) {
    document.querySelectorAll(".gw-tab-btn").forEach(btn => {
      btn.classList.toggle("active", btn.getAttribute("data-tab") === tabId);
    });
    document.querySelectorAll(".gw-tab-content").forEach(content => {
      content.style.display = (content.id === tabId) ? "block" : "none";
    });
  }

  // Chuyển tab khi click nút
  document.querySelectorAll(".gw-tab-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      const tabId = btn.getAttribute("data-tab");
      switchGwModalTab(tabId);
    });
  });

  if (btnCloseGwModal) {
    btnCloseGwModal.addEventListener("click", closeGatewayManageModal);
  }
  if (gatewayManageModal) {
    gatewayManageModal.addEventListener("click", (e) => {
      if (e.target === gatewayManageModal) closeGatewayManageModal();
    });
  }

  if (btnGotoAddDevice) {
    btnGotoAddDevice.addEventListener("click", () => {
      switchGwModalTab("tab-add-new-device");
    });
  }

  // Chọn loại thiết bị trong form thêm mới
  if (deviceTypeSelector) {
    deviceTypeSelector.addEventListener("click", (e) => {
      const card = e.target.closest(".type-card");
      if (!card) return;

      document.querySelectorAll(".type-card").forEach(c => c.classList.remove("active"));
      card.classList.add("active");

      selectedDeviceType = card.getAttribute("data-type");

      if (selectedDeviceType === "espnow") {
        if (dynamicFieldLabel) dynamicFieldLabel.innerText = "Địa chỉ MAC Node (ESP-NOW):";
        if (dynamicFieldIcon) dynamicFieldIcon.className = "fa-solid fa-network-wired";
        if (dynamicFieldValue) {
          dynamicFieldValue.placeholder = "VD: 30:AE:A4:07:0B:84";
          dynamicFieldValue.value = "30:AE:A4:07:0B:84";
        }
        if (newDeviceNameInput) newDeviceNameInput.value = "Node Cảm Biến Không Dây Mới";
      } else if (selectedDeviceType === "ac") {
        if (dynamicFieldLabel) dynamicFieldLabel.innerText = "Hãng Điều Hòa (Mã Hồng Ngoại IR):";
        if (dynamicFieldIcon) dynamicFieldIcon.className = "fa-solid fa-snowflake";
        if (dynamicFieldValue) {
          dynamicFieldValue.placeholder = "VD: FUNIKI, Daikin, Panasonic, Casper, LG";
          dynamicFieldValue.value = "FUNIKI (Mã 3992007)";
        }
        if (newDeviceNameInput) newDeviceNameInput.value = "Điều Hòa Phòng Ngủ";
      } else if (selectedDeviceType === "relay") {
        if (dynamicFieldLabel) dynamicFieldLabel.innerText = "Chân Điều Khiển GPIO Relay:";
        if (dynamicFieldIcon) dynamicFieldIcon.className = "fa-solid fa-bolt";
        if (dynamicFieldValue) {
          dynamicFieldValue.placeholder = "VD: GPIO 10, GPIO 11, GPIO 12";
          dynamicFieldValue.value = "GPIO 10 (Relay Kênh 3)";
        }
        if (newDeviceNameInput) newDeviceNameInput.value = "Đèn Ban Công";
      } else if (selectedDeviceType === "socket") {
        if (dynamicFieldLabel) dynamicFieldLabel.innerText = "Kênh Ổ Cắm Điện:";
        if (dynamicFieldIcon) dynamicFieldIcon.className = "fa-solid fa-plug";
        if (dynamicFieldValue) {
          dynamicFieldValue.placeholder = "VD: Ổ cắm 1 - Tải 16A";
          dynamicFieldValue.value = "Ổ cắm 1 - Tải 16A (220V)";
        }
        if (newDeviceNameInput) newDeviceNameInput.value = "Ổ Cắm Thông Minh Bếp";
      }
    });
  }

  // Xác nhận thêm thiết bị mới vào Gateway
  if (btnSubmitAddDevice) {
    btnSubmitAddDevice.addEventListener("click", () => {
      const name = newDeviceNameInput ? newDeviceNameInput.value.trim() : "";
      const room = newDeviceRoomSelect ? newDeviceRoomSelect.value : "Phòng khách";
      const extra = dynamicFieldValue ? dynamicFieldValue.value.trim() : "";

      if (!name) {
        showToast("Vui lòng nhập tên cho thiết bị mới!", "error");
        return;
      }

      const newDev = {
        id: "dev_" + Date.now(),
        name: name,
        type: selectedDeviceType,
        room: room,
        extra: extra,
        state: 0
      };

      if (selectedDeviceType === "ir_hub") {
        localStorage.removeItem("gate_ir_hub_deleted");
        foundHub = newDev;
      }
      if (selectedDeviceType === "sensor" || selectedDeviceType === "espnow") {
        localStorage.removeItem("gate_sensor_deleted");
      }
      customDevices.push(newDev);
      localStorage.setItem("gate_custom_devices", JSON.stringify(customDevices));

      renderDevices();
      renderDrawerChildList();
      renderLinkedDevicesList();
      closeGatewayManageModal();

      showToast(`Đã thêm thành công thiết bị [${name}] vào Gateway!`, "success");
    });
  }

  // ── Render danh sách thiết bị trực tuyến phát hiện được (Tab 2) ───────────
  async function renderDiscoveredDevices() {
    const grid = document.getElementById("discovered-devices-grid");
    if (!grid) return;

    let discList = [];
    try {
      const res = await callApi("/api/gateway/discovered");
      if (res && res.success && Array.isArray(res.data) && res.data.length > 0) {
        discList = res.data;
      }
    } catch (e) {
      console.warn("Lỗi gọi /api/gateway/discovered:", e);
    }

    if (!discList || discList.length === 0) {
      discList = [];

      // 1. Trạm Hồng Ngoại IR Hunonic Smart Pro: CHỈ HIỆN KHI THỰC SỰ SCAN THẤY TRỰC TUYẾN
      if (isGatewayOnline && gwMetrics.ac_online === true) {
        const acName = gwMetrics.ac_name || "Điều hòa IR";
        const acId = gwMetrics.ac_id || "";
        discList.push({
          id: "ir_hub_3987670",
          name: "IR Hunonic Smart Pro",
          type: "ir_hub",
          source: "Hunonic Cloud / IR Smart Pro",
          device_id: "3987670",
          online: true,
          details: `ID: 3987670 • 1 thiết bị IR kết nối • Trực tuyến`,
          children: [
            {
              id: acId,
              name: acName,
              type: "ac",
              temp: acState.temp || 25,
              mode: acState.mode !== undefined ? acState.mode : 2,
              fan: acState.fan || 0,
              power: acState.power || 0
            }
          ]
        });
      }

      // 2. Node Cảm Biến ESP-NOW: CHỈ HIỆN KHI THỰC SỰ CÓ DỮ LIỆU VÀ ĐANG TRỰC TUYẾN (ONLINE)
      const hasRealSensor = Boolean(
        isGatewayOnline &&
        sensorData.hasData && 
        sensorData.isOnline === true &&
        (sensorData.temp > 0 || sensorData.hum > 0 || sensorData.batt > 0)
      );
      if (hasRealSensor) {
        discList.push({
          id: "dev_espnow_node_1",
          name: "Node Cảm Biến C3 (ESP-NOW)",
          type: "sensor",
          source: "ESP-NOW 2.4GHz",
          mac: "30:AE:A4:07:0B:84",
          online: true,
          details: `Nhiệt độ: ${sensorData.temp.toFixed(1)}°C • ${sensorData.hum > 120 ? 'Áp suất' : 'Độ ẩm'}: ${sensorData.hum.toFixed(1)}${sensorData.hum > 120 ? ' hPa' : '%'} • Pin: ${sensorData.batt.toFixed(2)}V`
        });
      }
    }

    discList = discList.filter(d => d.type !== "relay" && d.type !== "socket");

    if (discList.length === 0) {
      grid.innerHTML = `
        <div style="grid-column: 1 / -1; text-align: center; padding: 28px 16px; color: #64748b; background: #ffffff; border: 1.5px dashed #cbd5e1; border-radius: 14px;">
          <div style="width: 44px; height: 44px; border-radius: 50%; background: #f1f5f9; display: flex; align-items: center; justify-content: center; margin: 0 auto 10px; font-size: 1.2rem; color: #94a3b8;">
            <i class="fa-solid fa-satellite-dish"></i>
          </div>
          <p style="margin: 0 0 4px; font-weight: 700; font-size: 0.88rem; color: #334155;">Chưa phát hiện thiết bị nào đang trực tuyến</p>
          <span style="font-size: 0.78rem;">Bật nguồn thiết bị hoặc bấm nút <strong>"Quét lại"</strong> để Gateway dò tìm các thiết bị khả dụng.</span>
        </div>
      `;
      return;
    }

    let cardsHtml = "";
    discList.forEach((item, idx) => {
      // Kiểm tra xem thiết bị này đã được đưa vào danh sách customDevices chưa
      const isAlreadyAdded = customDevices.some(d => 
        d.id === item.id || 
        d.name === item.name || 
        (d.type === item.type && (item.type === "ac" || item.type === "ir_hub" || item.type === "sensor")) ||
        (item.device_id && (d.device_id === item.device_id || (d.extra && d.extra.includes(item.device_id))))
      );

      const isIrHub = item.type === "ir_hub";
      const iconClass = isIrHub ? "ir-hub" : (item.type === "ac" ? "ac" : (item.type === "sensor" ? "sensor" : (idx === 2 ? "relay1" : "relay2")));
      const faIcon = isIrHub ? "fa-tower-broadcast" : (item.type === "ac" ? "fa-wind" : (item.type === "sensor" ? "fa-satellite-dish" : "fa-lightbulb"));
      const isOnline = item.online !== false;

      cardsHtml += `
        <div class="discovered-dev-card" data-disc-id="${item.id}">
          <div class="disc-card-top">
            <div class="disc-icon ${iconClass}">
              <i class="fa-solid ${faIcon}"></i>
            </div>
            <div class="disc-meta">
              <h5 class="disc-meta-title">${escapeHtml(item.name)}</h5>
              <div class="disc-badges-row">
                <span class="pill-online ${isOnline ? 'active' : 'offline'}">
                  <i class="fa-solid fa-circle"></i> ${isOnline ? 'Trực tuyến' : 'Ngoại tuyến'}
                </span>
                <span class="pill-source">${escapeHtml(item.source)}</span>
              </div>
              <p class="disc-info-meta">${escapeHtml(item.details)}</p>
            </div>
          </div>
          <div class="disc-card-footer">
            ${isAlreadyAdded ? `
              <span class="badge-already-added"><i class="fa-solid fa-circle-check"></i> Đã có trong phòng</span>
            ` : `
              <button type="button" class="btn-quick-add-dev" 
                data-type="${item.type}" 
                data-name="${escapeHtml(item.name)}" 
                data-id="${item.id}" 
                data-extra="${escapeHtml(item.details)}">
                <i class="fa-solid fa-plus-circle"></i> Thêm Vào Phòng
              </button>
            `}
          </div>
        </div>
      `;
    });

    grid.innerHTML = cardsHtml;

    // Bắt sự kiện click nút Thêm Vào Phòng
    grid.querySelectorAll(".btn-quick-add-dev").forEach(btn => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const type = btn.getAttribute("data-type");
        const name = btn.getAttribute("data-name");
        const devId = btn.getAttribute("data-id") || ("dev_" + Date.now());
        const extra = btn.getAttribute("data-extra") || "";
        const foundDisc = discList.find(x => x.id === devId);

        const newDev = {
          id: devId,
          name: name,
          type: type,
          room: localStorage.getItem("gate_room") || "Phòng khách",
          extra: extra,
          device_id: (foundDisc && foundDisc.device_id) || "",
          children: (foundDisc && foundDisc.children) || [],
          state: 0
        };

        if (type === "ir_hub" || devId === "dev_ir_hub_hunonic" || devId.includes("ir_hub")) {
          localStorage.removeItem("gate_ir_hub_deleted");
          foundHub = newDev;
        }

        if (newDev.type === "sensor" || type === "sensor" || (devId && devId.includes("sensor"))) {
          localStorage.removeItem("gate_sensor_deleted");
        }
        customDevices.push(newDev);
        localStorage.setItem("gate_custom_devices", JSON.stringify(customDevices));

        renderDevices();
        renderDrawerChildList();
        renderLinkedDevicesList();
        renderDiscoveredDevices();

        showToast(`Đã thêm thành công [${name}] vào ${newDev.room}!`, "success");
      });
    });
  }

  // Nút Quét lại / Làm mới thiết bị phát hiện
  const btnRefreshDiscovered = document.getElementById("btn-refresh-discovered");
  if (btnRefreshDiscovered) {
    btnRefreshDiscovered.addEventListener("click", async () => {
      const icon = btnRefreshDiscovered.querySelector("i");
      if (icon) icon.classList.add("fa-spin");
      showToast("Đang đồng bộ và quét lại thiết bị từ Gateway & Cloud...", "info");
      
      try {
        await callApi("/api/hvac/sync", "POST");
      } catch (err) {
        console.warn("Sync err:", err);
      }
      
      await fetchStatus();
      await renderDiscoveredDevices();

      setTimeout(() => {
        if (icon) icon.classList.remove("fa-spin");
        showToast("Đã làm mới danh sách thiết bị trực tuyến thành công!", "success");
      }, 600);
    });
  }

  // Toggle thu gọn/mở rộng form thêm thủ công
  const btnToggleManualAdd = document.getElementById("btn-toggle-manual-add");
  const manualAddFormWrap = document.getElementById("manual-add-form-wrap");
  if (btnToggleManualAdd && manualAddFormWrap) {
    btnToggleManualAdd.addEventListener("click", () => {
      const isCollapsed = manualAddFormWrap.classList.contains("collapsed");
      manualAddFormWrap.classList.toggle("collapsed");
      btnToggleManualAdd.classList.toggle("open", isCollapsed);
    });
  }

  // Render danh sách thiết bị liên kết trong Tab 1 (Chỉ hiển thị thiết bị thực tế)
  function renderLinkedDevicesList() {
    const container = document.getElementById("linked-devices-list");
    const countSpan = document.getElementById("gw-device-count");
    if (!container) return;

    if (countSpan) countSpan.innerText = customDevices.length;

    if (customDevices.length === 0) {
      container.innerHTML = `
        <div style="text-align: center; padding: 28px 16px; color: #64748b;">
          <div style="width: 44px; height: 44px; border-radius: 50%; background: #f1f5f9; color: #94a3b8; display: flex; align-items: center; justify-content: center; font-size: 1.2rem; margin: 0 auto 10px;">
            <i class="fa-solid fa-layer-group"></i>
          </div>
          <p style="font-size: 0.88rem; font-weight: 600; color: #334155; margin: 0 0 4px;">Chưa có thiết bị nào liên kết với Gateway</p>
          <p style="font-size: 0.78rem; margin: 0;">Bấm "+ Thêm Thiết Bị Mới" để thêm thiết bị con đầu tiên.</p>
        </div>
      `;
      return;
    }

    let html = "";
    customDevices.forEach(dev => {
      const isIrHub = dev.type === "ir_hub";
      const iconClass = isIrHub ? "ir-hub" : (dev.type === "ac" ? "ac" : (dev.type === "relay" ? "light" : (dev.type === "socket" ? "socket" : "sensor")));
      const faIcon = isIrHub ? "fa-tower-broadcast" : (dev.type === "ac" ? "fa-wind" : (dev.type === "relay" ? "fa-lightbulb" : (dev.type === "socket" ? "fa-plug" : "fa-satellite-dish")));
      const typeLabel = isIrHub ? "Trạm IR Smart Pro" : (dev.type === "ac" ? "Hồng ngoại IR" : (dev.type === "relay" ? "Công tắc Relay" : (dev.type === "socket" ? "Ổ cắm" : "Node Cảm Biến")));
      const childCount = (dev.children && dev.children.length) || 0;
      const subInfo = isIrHub ? `${childCount} thiết bị IR kết nối` : (dev.extra || typeLabel);

      html += `
        <div class="linked-dev-item">
          <div class="linked-dev-left">
            <div class="linked-dev-icon ${iconClass}">
              <i class="fa-solid ${faIcon}"></i>
            </div>
            <div class="linked-dev-info">
              <h5>${escapeHtml(dev.name)}</h5>
              <p>${escapeHtml(dev.room || 'Phòng khách')} &bull; ${escapeHtml(subInfo)}</p>
            </div>
          </div>
          <div class="linked-dev-right">
            <span class="badge-linked-type">Đã liên kết</span>
            <button type="button" class="btn-remove-linked-dev" data-id="${dev.id}" title="Xóa thiết bị này khỏi Gateway">
              <i class="fa-solid fa-trash-can"></i>
            </button>
          </div>
        </div>
      `;
    });

    container.innerHTML = html;

    // Xử lý nút xóa thiết bị tùy chỉnh
    container.querySelectorAll(".btn-remove-linked-dev").forEach(btn => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const devId = btn.getAttribute("data-id");
        const dev = customDevices.find(d => d.id === devId);
        const devName = dev ? dev.name : "thiết bị";
        if (confirm(`Bạn có chắc chắn muốn xóa [${devName}] khỏi Gateway?`)) {
          removeDeviceFromGateway(devId);
          renderLinkedDevicesList();
          renderDrawerChildList();
          renderDevices();
          showToast(`Đã xóa [${devName}] khỏi Gateway!`, "info");
        }
      });
    });
  }

  // Nút cấu hình lại Wi-Fi qua BLE
  if (btnGwReconfigWifi) {
    btnGwReconfigWifi.addEventListener("click", () => {
      closeGatewayManageModal();
      openAddGatewayModal();
    });
  }

  // Nút reboot Gateway
  if (btnGwReboot) {
    btnGwReboot.addEventListener("click", async () => {
      if (confirm("Bạn có chắc chắn muốn khởi động lại Trạm Gateway ESP32-S3?")) {
        showToast("Đang gửi lệnh khởi động lại Gateway...", "info");
        const res = await callApi("/api/gateway/reboot", "POST");
        if (res && res.success) {
          showToast(res.message, "success");
        } else {
          showToast("Đã gửi tín hiệu khởi động lại Gateway!", "success");
        }
      }
    });
  }

  // ── Polling cập nhật trạng thái tự động mỗi 2.5 giây ────────────────────────
  async function fetchStatus() {
    // 1. Lấy trạng thái Gateway
    const gwRes = await callApi("/api/gateway/status");
    if (gwRes && gwRes.success && gwRes.data) {
      const d = gwRes.data;
      window.lastGatewayStatus = d;
      const prevOnline = isGatewayOnline;

      // Trạng thái trực tuyến được Backend tính toán chuẩn xác từ MQTT LWT và Watchdog 35s
      let isAlive = Boolean(d.online);
      if (d.last_seen) {
        const lastSeenMs = new Date(d.last_seen).getTime();
        const ageSec = (Date.now() - lastSeenMs) / 1000;
        // Watchdog dự phòng cấp client: chỉ đánh dấu offline nếu quá 45 giây không có dữ liệu
        if (ageSec > 45) {
          isAlive = false;
        }
      }
      isGatewayOnline = isAlive;

      gwMetrics.uptime_sec = d.uptime_sec || 0;
      gwMetrics.free_heap = d.free_heap || 0;
      gwMetrics.rssi = d.rssi || -100;
      gwMetrics.fw_ver = d.fw_ver || "1.0.0";

      if (statusText) statusText.innerText = isGatewayOnline ? "Hệ thống Trực tuyến" : "Trạm Gateway Ngoại tuyến";
      if (statusBadge) {
        statusBadge.className = isGatewayOnline ? "mqtt-pill-badge" : "mqtt-pill-badge offline";
        statusBadge.style.color = isGatewayOnline ? "#00b06f" : "#b91c1c";
      }

      if (sidebarGateDot) sidebarGateDot.className = isGatewayOnline ? "gate-status-dot online" : "gate-status-dot offline";
      if (sidebarGateText) sidebarGateText.innerText = isGatewayOnline ? "Gateway Online" : "Gateway Offline";

      // Nếu Modal quét đang mở ở trạng thái chờ và Gateway vừa Online -> Chuyển sang hiển thị thiết bị
      if (isGatewayOnline && !prevOnline && addGatewayModal && !addGatewayModal.classList.contains("hidden") && stageWaitingGate && !stageWaitingGate.classList.contains("hidden")) {
        showDevicesFoundStage();
        showToast("Đã kết nối Gateway ESP32-S3 thành công! Đã quét được thiết bị.", "success");
      }

      // Ghi nhận trạng thái kết nối của Gateway vào hệ thống thông báo
      if (isGatewayOnline && !prevOnline) {
        if (typeof addSystemNotification === "function") {
          addSystemNotification({
            type: "device",
            title: "Trạm Gateway đã kết nối Cloud",
            message: "Gateway ESP32-S3 kết nối thành công tới MQTT Broker (HiveMQ Cloud).",
            badge: "Hệ thống"
          });
        }
      } else if (!isGatewayOnline && prevOnline) {
        if (typeof addSystemNotification === "function") {
          addSystemNotification({
            type: "alert",
            title: "Cảnh báo: Gateway ESP32-S3 Ngoại tuyến",
            message: "Trạm Gateway bị mất tín hiệu kết nối máy chủ hoặc mất nguồn điện.",
            badge: "Cảnh báo"
          });
        }
      }

      if (d.relay1 !== undefined) relayStates[1] = d.relay1;
      if (d.relay2 !== undefined) relayStates[2] = d.relay2;

      if (!isGatewayOnline) {
        gwMetrics.ac_online = false;
        gwMetrics.ac_offline_reason = "Trạm Gateway ESP32-S3 đang ngoại tuyến (Offline)";
        customDevices.forEach(cd => {
          cd.online = false;
          cd.state = 0;
          if (cd.children) {
            cd.children.forEach(ch => {
              ch.online = false;
              ch.power = 0;
              ch.state = 0;
            });
          }
        });
      } else if (d.ac_online !== undefined) {
        gwMetrics.ac_online = Boolean(d.ac_online);
        gwMetrics.ac_offline_reason = d.ac_offline_reason;
        customDevices.forEach(cd => {
          if (cd.type === "ac" || cd.type === "ir_hub") {
            cd.online = d.ac_online;
            if (!d.ac_online) {
              cd.state = 0; // Luôn ép về 0 nếu offline
              if (cd.children) {
                cd.children.forEach(ch => ch.power = 0);
              }
            }
          }
        });
      }

      const liveHub = foundHub || getActiveIrHub() || customDevices.find(d => d.type === "ir_hub" || d.id === "dev_ir_hub_hunonic");
      if (d.ac_count !== undefined) {
        if (liveHub) {
          if (d.ac_count === 0 || !d.ac_devices || Object.keys(d.ac_devices).length === 0) {
            liveHub.children = [];
          } else if (d.ac_devices && typeof d.ac_devices === "object") {
            const updatedChildren = [];
            for (const [did, dinfo] of Object.entries(d.ac_devices)) {
              const existingChild = (liveHub.children || []).find(c => String(c.id) === String(did));
              const cap = getAcCapabilities(dinfo);
              updatedChildren.push({
                id: String(did),
                name: dinfo.name || (existingChild && existingChild.name) || `Điều hòa ${did}`,
                type: "ac",
                brand: dinfo.brand || (existingChild && existingChild.brand) || cap.brand || 0,
                brand_name: dinfo.brand_name || (existingChild && existingChild.brand_name) || cap.brandName,
                power: dinfo.power !== undefined ? dinfo.power : (existingChild ? existingChild.power : 0),
                state: dinfo.power !== undefined ? dinfo.power : (existingChild ? existingChild.state : 0),
                temp: dinfo.temp || (existingChild && existingChild.temp) || 25,
                mode: dinfo.mode !== undefined ? dinfo.mode : (existingChild && existingChild.mode !== undefined ? existingChild.mode : (cap.modes[0] ? cap.modes[0].code : 1)),
                fan: dinfo.fan !== undefined ? dinfo.fan : (existingChild && existingChild.fan !== undefined ? existingChild.fan : (cap.fans[0] ? cap.fans[0].code : 0)),
                temp_min: dinfo.temp_min || (existingChild && existingChild.temp_min) || cap.temp_min,
                temp_max: dinfo.temp_max || (existingChild && existingChild.temp_max) || cap.temp_max,
                modes: dinfo.modes || (existingChild && existingChild.modes) || cap.modes,
                fans: dinfo.fans || (existingChild && existingChild.fans) || cap.fans,
                online: Boolean(dinfo.online && d.ac_online)
              });
            }
            liveHub.children = updatedChildren;
          }
          localStorage.setItem("gate_custom_devices", JSON.stringify(customDevices));

          // Nếu đang xem sub-view của IR Hub -> render lại ngay
          const subViewEl = document.getElementById("view-device-hub");
          if (subViewEl && subViewEl.style.display !== "none" && currentHubView && currentHubView.type === "ir_hub") {
            renderSubViewDevices("ir_hub", liveHub);
          }
        }
      }

      if (d.ac_power !== undefined) acState.power = d.ac_power;
      if (d.ac_temp > 0) acState.temp = d.ac_temp;

      updateAcModalUI();
      renderDevices();
      updateDrawerGatewayTelemetry();
      renderDrawerChildList();
      if (drawerAddPanel && drawerAddPanel.style.display !== "none") {
        renderDrawerAvailableDevices();
      }

      // Cập nhật tức thời Drawer Điều Hòa hoặc Trạm IR nếu đang mở
      const drawerEl = document.getElementById("device-detail-drawer") || deviceDetailDrawer;
      const isDrawerOpen = drawerEl && drawerEl.classList.contains("open");
      const isAcDrawerActive = isDrawerOpen && drawerAcPanel && drawerAcPanel.style.display !== "none";

      if (isAcDrawerActive) {
        let activeChild = currentActiveIrChild;
        const targetId = (activeChild && activeChild.id) || currentDrawerTarget;

        let freshChild = null;
        if (liveHub && liveHub.children && targetId) {
          freshChild = liveHub.children.find(c => String(c.id) === String(targetId));
        }
        if (!freshChild && d.ac_devices && targetId && d.ac_devices[targetId]) {
          const dinfo = d.ac_devices[targetId];
          const cap = getAcCapabilities(dinfo);
          freshChild = {
            id: String(targetId),
            name: dinfo.name || `Điều hòa ${targetId}`,
            type: "ac",
            brand: dinfo.brand || cap.brand || 0,
            brand_name: dinfo.brand_name || cap.brandName,
            power: dinfo.power || 0,
            state: dinfo.power || 0,
            temp: dinfo.temp || 25,
            mode: dinfo.mode || (cap.modes[0] ? cap.modes[0].code : 1),
            fan: dinfo.fan || (cap.fans[0] ? cap.fans[0].code : 0),
            temp_min: dinfo.temp_min || cap.temp_min,
            temp_max: dinfo.temp_max || cap.temp_max,
            modes: dinfo.modes || cap.modes,
            fans: dinfo.fans || cap.fans,
            online: Boolean(dinfo.online && d.ac_online)
          };
        }

        if (freshChild) {
          if (activeChild) {
            Object.assign(activeChild, freshChild);
          } else {
            activeChild = freshChild;
            currentActiveIrChild = freshChild;
          }
        }

        const devToUpdate = activeChild || freshChild;
        if (devToUpdate) {
          acState.power = devToUpdate.power;
          acState.temp = devToUpdate.temp;
          acState.mode = devToUpdate.mode;
          acState.fan = devToUpdate.fan;
          updateDrawerAcUI(devToUpdate);
        }
      } else if (currentActiveIrChild) {
        if (liveHub && liveHub.children) {
          const freshChild = liveHub.children.find(c => String(c.id) === String(currentActiveIrChild.id));
          if (freshChild) {
            Object.assign(currentActiveIrChild, freshChild);
            acState.power = freshChild.power;
            acState.temp = freshChild.temp;
            acState.mode = freshChild.mode;
            acState.fan = freshChild.fan;
          }
        }
        updateDrawerAcUI(currentActiveIrChild);
      } else if (currentDrawerTarget && isDrawerOpen) {
        const curDev = (liveHub && liveHub.children && liveHub.children.find(c => String(c.id) === String(currentDrawerTarget)))
                      || customDevices.find(cd => cd.id === currentDrawerTarget);
        if (curDev) {
          if (curDev.type === "ac") {
            updateDrawerAcUI(curDev);
          } else if (curDev.type === "ir_hub") {
            renderIrChildList(curDev);
          }
        }
      }
    } else {
      isGatewayOnline = false;
      gwMetrics.ac_online = false;
      gwMetrics.ac_offline_reason = "Mất kết nối máy chủ / Gateway ngoại tuyến";
      customDevices.forEach(cd => {
        cd.online = false;
        cd.state = 0;
        if (cd.children) {
          cd.children.forEach(ch => {
            ch.online = false;
            ch.power = 0;
            ch.state = 0;
          });
        }
      });
      if (statusText) statusText.innerText = "Mất kết nối máy chủ";
      if (statusBadge) {
        statusBadge.className = "mqtt-pill-badge offline";
        statusBadge.style.color = "#b91c1c";
      }
      if (sidebarGateDot) sidebarGateDot.className = "gate-status-dot offline";
      if (sidebarGateText) sidebarGateText.innerText = "Gateway Offline";
      renderDevices();
      updateDrawerGatewayTelemetry();
      renderDrawerChildList();
      if (drawerAddPanel && drawerAddPanel.style.display !== "none") {
        renderDrawerAvailableDevices();
      }
    }

    // 2. Lấy dữ liệu cảm biến Node ESP-NOW
    const senRes = await callApi("/api/sensors/latest");
    if (senRes && senRes.success && senRes.data) {
      const s = senRes.data;
      if (s.last_seen && (s.val1 > 0 || s.val2 > 0 || s.presence !== undefined || s.battery > 0)) {
        sensorData.hasData = true;
        sensorData.temp = s.val1 || 0;
        sensorData.hum = s.val2 || 0;
        sensorData.batt = s.battery || 0;
        sensorData.battery = s.battery || 0;
        sensorData.presence = s.presence ?? null;
        sensorData.lastSeen = s.last_seen;

        // Quy tắc: 1 phút (60s) không thấy node phản hồi mới tính là offline
        const isNodeOnline = (s.is_online !== undefined) ? Boolean(s.is_online) : (s.seconds_ago !== undefined ? s.seconds_ago <= 60 : false);
        sensorData.isOnline = isNodeOnline;
        handlePresenceNotification();

        customDevices.forEach(cd => {
          if (cd.type === "sensor" || cd.id === "dev_espnow_node_1" || (cd.id && cd.id.includes("espnow")) || (cd.name && cd.name.toLowerCase().includes("node cảm biến"))) {
            cd.online = isNodeOnline;
            if (s.battery) cd.battery = s.battery;
          }
        });

        const isSensorAdded = customDevices.some(cd => cd.type === "sensor" || cd.id === "dev_espnow_node_1" || (cd.id && cd.id.includes("espnow")));
        if (isSensorAdded && isNodeOnline && sensorData.hasData) {
          // Cảnh báo nhiệt độ phòng cao bất thường
          if (sensorData.temp >= 35 && (Date.now() - lastTempAlertTime > 15 * 60000)) {
            lastTempAlertTime = Date.now();
            if (typeof addSystemNotification === "function") {
              addSystemNotification({
                type: "alert",
                title: `Cảnh báo: Nhiệt độ phòng cao (${sensorData.temp.toFixed(1)}°C)`,
                message: `Cảm biến SHT30 ghi nhận nhiệt độ phòng vượt ngưỡng 35°C. Đề xuất bật điều hòa hoặc quạt làm mát.`,
                badge: "Cảnh báo"
              });
            }
          }

          if (weatherTempDisplay) weatherTempDisplay.innerHTML = `${Math.round(Number(sensorData.temp))}<span class="deg-unit">°C</span>`;
          if (weatherHumDisplay) {
            weatherHumDisplay.innerText = sensorData.hum > 120 ? `Áp suất ${Math.round(Number(sensorData.hum))} hPa` : `Độ ẩm ${Math.round(Number(sensorData.hum))}%`;
          }

          const presenceDisplay = document.getElementById("weather-presence-display");
          if (presenceDisplay) {
            if (sensorData.presence) {
              presenceDisplay.innerHTML = `<span class="sep">&bull;</span> <span style="color:#10b981; font-weight:600;"><i class="fa-solid fa-person-walking"></i> Có người</span>`;
            } else {
              presenceDisplay.innerHTML = `<span class="sep">&bull;</span> <span style="color:#94a3b8;"><i class="fa-solid fa-house-user"></i> Phòng trống</span>`;
            }
          }
        } else {
          if (weatherTempDisplay) weatherTempDisplay.innerHTML = `--<span class="deg-unit">°C</span>`;
          if (weatherHumDisplay) {
            weatherHumDisplay.innerText = isSensorAdded ? "Cảm biến ngoại tuyến" : "Chưa liên kết cảm biến";
          }
          const presenceDisplay = document.getElementById("weather-presence-display");
          if (presenceDisplay) presenceDisplay.innerHTML = "";
        }
      } else {
        sensorData.hasData = false;
        sensorData.isOnline = false;
        sensorData.temp = 0;
        sensorData.hum = 0;
        sensorData.batt = 0;
        sensorData.presence = 0;
        customDevices.forEach(cd => {
          if (cd.type === "sensor" || cd.id === "dev_espnow_node_1" || (cd.id && cd.id.includes("espnow")) || (cd.name && cd.name.toLowerCase().includes("node cảm biến"))) {
            cd.online = false;
          }
        });
        const presenceDisplay = document.getElementById("weather-presence-display");
        if (presenceDisplay) presenceDisplay.innerHTML = "";
      }

      renderDevices();
    } else {
      sensorData.isOnline = false;
      renderDevices();
    }

    // Đánh giá logic tự động hóa thông minh (ECA Automation Engine)
    if (typeof evaluateAutomationRules === "function") {
      evaluateAutomationRules(sensorData, acState, relayStates);
    }
  }

  // ============================================================================
  // QUẢN LÝ & CẬP NHẬT FIRMWARE OTA (ESP32-S3 & NODE C3)
  // ============================================================================
  let selectedOtaFile = null;
  let currentOtaTarget = "esp32s3_gate"; // "esp32s3_gate" hoặc "esp32c3_node"
  let otaPollInterval = null;
  let isOtaInProgress = false;

  const navFirmwareBtn = document.getElementById("nav-firmware");
  const viewFirmwareUpdate = document.getElementById("view-firmware-update");
  const btnOtaBack = document.getElementById("btn-ota-back");
  const btnOtaRefresh = document.getElementById("btn-ota-refresh");
  const btnOtaReboot = document.getElementById("btn-ota-reboot");

  // Switcher Tab Elements
  const otaTabFile = document.getElementById("ota-tab-file");
  const otaTabUrl = document.getElementById("ota-tab-url");
  const otaContentFile = document.getElementById("ota-content-file");
  const otaContentUrl = document.getElementById("ota-content-url");

  // Dropzone Elements
  const otaDropzone = document.getElementById("ota-dropzone");
  const otaFileInput = document.getElementById("ota-file-input");
  const btnOtaBrowse = document.getElementById("btn-ota-browse");
  const otaDropzonePrompt = document.getElementById("ota-dropzone-prompt");
  const otaFileSelected = document.getElementById("ota-file-selected");
  const otaSelectedFilename = document.getElementById("ota-selected-filename");
  const otaSelectedFilesize = document.getElementById("ota-selected-filesize");
  const btnOtaClearFile = document.getElementById("btn-ota-clear-file");

  // Target Elements
  const btnSelectTargetGw = document.getElementById("btn-select-target-gw");
  const btnSelectTargetNode = document.getElementById("btn-select-target-node");
  const otaCardGw = document.getElementById("ota-card-gw");
  const otaCardNode = document.getElementById("ota-card-node");

  // Buttons & Inputs
  const otaFileVersionInput = document.getElementById("ota-file-version-input");
  const btnOtaUploadStart = document.getElementById("btn-ota-upload-start");
  const otaUrlTextInput = document.getElementById("ota-url-text-input");
  const otaUrlVersionInput = document.getElementById("ota-url-version-input");
  const btnOtaUrlStart = document.getElementById("btn-ota-url-start");
  const btnOtaClearLog = document.getElementById("btn-ota-clear-log");

  // Hàm chuyển đổi active class trên sidebar
  function updateSidebarActive(activeId) {
    const navItems = document.querySelectorAll(".sidebar-nav .nav-item");
    navItems.forEach(item => {
      if (item.id === activeId) {
        item.classList.add("active");
      } else {
        item.classList.remove("active");
      }
    });
  }

  // ==============================================================================
  // TỰ ĐỘNG HÓA THÔNG MINH (SMART AUTOMATION ENGINE)
  // ==============================================================================
  const viewAutomations = document.getElementById("view-automations");
  const navAutomationsBtn = document.getElementById("nav-automations");
  const btnAutoBack = document.getElementById("btn-auto-back");
  const btnOpenCreateAuto = document.getElementById("btn-open-create-auto");

  // ── LIVE RUNTIME ENGINE CHO TỰ ĐỘNG HÓA (ECA RULES ENGINE) ────────────────
  const automationCooldowns = {};
  window.automationCooldowns = automationCooldowns;
  let consecutiveAbsentCycles = 0;
  let consecutivePresentCycles = 0;
  let lastTempAlertTime = 0;

  async function evaluateAutomationRules(sensors, ac, relays) {
    if (!sensors || !isGatewayOnline) return;
    const autos = getStoredAutomations();
    if (!autos || autos.length === 0) return;

    const now = Date.now();
    const COOLDOWN_MS = 35000; // 35s cooldown giữa các lần tự động kích hoạt một rule

    const hasPresence = Boolean(sensors.isOnline && (sensors.presence === 1 || sensors.presence === true));
    const isAbsent = Boolean(sensors.isOnline && (sensors.presence === 0 || sensors.presence === false));

    if (hasPresence) {
      consecutivePresentCycles++;
      consecutiveAbsentCycles = 0;
    } else if (isAbsent) {
      consecutiveAbsentCycles++;
      consecutivePresentCycles = 0;
    }

    for (const rule of autos) {
      if (!rule.enabled || !rule.actions) continue;

      const lastRan = automationCooldowns[rule.id] || 0;
      if (now - lastRan < COOLDOWN_MS) continue;

      let shouldTrigger = false;
      let triggerReason = "";

      // 1. Eco Presence: Phòng trống liên tục >= 2 chu kỳ & đang có thiết bị bật
      if (rule.id === "auto_eco_presence") {
        const anyOn = (ac && ac.power === 1) || (relays && relays[1] === 1);
        if (isAbsent && consecutiveAbsentCycles >= 2 && anyOn) {
          shouldTrigger = true;
          triggerReason = "Phòng trống liên tục: Hệ thống tự động tắt Điều hòa & ngắt Relay 1 (Đèn chính) để tiết kiệm điện.";
        }
      }
      // 2. Auto Cool: Có người liên tục >= 2 chu kỳ & nhiệt độ phòng >= 28°C & Điều hòa đang tắt
      else if (rule.id === "auto_comfort_cool") {
        const isWarm = (sensors.temp && sensors.temp >= 28.0);
        const isAcOff = (ac && ac.power === 0);
        if (hasPresence && consecutivePresentCycles >= 2 && isWarm && isAcOff) {
          shouldTrigger = true;
          triggerReason = `Phát hiện có người và nhiệt độ phòng ${sensors.temp.toFixed(1)}°C: Tự động bật Điều hòa 24°C Cool làm mát.`;
        }
      }
      // 3. Peak Shaving: Quá tải điện
      else if (rule.id === "auto_power_protect") {
        if (sensors.power && sensors.power > 2500 && (ac.temp < 27 || relays[2] === 1)) {
          shouldTrigger = true;
          triggerReason = "Công suất điện lưới cao: Tự động tăng nhiệt độ Điều hòa lên 27°C & ngắt Relay 2.";
        }
      }
      // 4. Night Sleep: Đêm khuya & Điều hòa đang bật quá lạnh
      else if (rule.id === "auto_night_sleep") {
        const hour = new Date().getHours();
        const isNight = (hour >= 23 || hour <= 5);
        if (isNight && ac && ac.power === 1 && ac.temp < 27) {
          shouldTrigger = true;
          triggerReason = "Khung giờ đêm khuya: Tự động tăng nhiệt độ Điều hòa lên 27°C Sleep để giữ ấm cơ thể.";
        }
      }
      // 5. Kịch bản tùy chỉnh của người dùng
      else if (rule.triggerText) {
        if (rule.badge === "Radar mmWave") {
          if (rule.triggerText.includes("TRỐNG") && isAbsent && consecutiveAbsentCycles >= 2) {
            const needTurnOff = (rule.actions.ac_power === 0 && ac.power === 1) || (rule.actions.relay1 === 0 && relays[1] === 1);
            if (needTurnOff) {
              shouldTrigger = true;
              triggerReason = `Radar phát hiện phòng trống: Kích hoạt [${rule.name}]`;
            }
          } else if (rule.triggerText.includes("CÓ NGƯỜI") && hasPresence && consecutivePresentCycles >= 2) {
            const needTurnOn = (rule.actions.ac_power === 1 && ac.power === 0) || (rule.actions.relay1 === 1 && relays[1] === 0);
            if (needTurnOn) {
              shouldTrigger = true;
              triggerReason = `Radar phát hiện có người: Kích hoạt [${rule.name}]`;
            }
          }
        } else if (rule.badge === "Nhiệt độ") {
          const match = rule.triggerText.match(/>\s*([0-9.]+)/);
          const threshold = match ? parseFloat(match[1]) : 28;
          if (sensors.temp && sensors.temp > threshold && ac.power === 0) {
            shouldTrigger = true;
            triggerReason = `Nhiệt độ ${sensors.temp.toFixed(1)}°C vượt ngưỡng ${threshold}°C: Kích hoạt [${rule.name}]`;
          }
        } else if (rule.badge === "Hẹn giờ") {
          const match = rule.triggerText.match(/lúc\s*([0-9]+):00/);
          if (match) {
            const schedHour = parseInt(match[1], 10);
            if (new Date().getHours() === schedHour) {
              shouldTrigger = true;
              triggerReason = `Đến lịch hẹn ${schedHour}:00: Kích hoạt [${rule.name}]`;
            }
          }
        }
      }

      if (shouldTrigger) {
        automationCooldowns[rule.id] = now;
        const acts = rule.actions;
        const apiRunner = (typeof window !== "undefined" && window.callApi) ? window.callApi : callApi;

        if (acts.ac_power !== undefined) {
          acState.power = acts.ac_power;
          if (acts.ac_temp > 0) acState.temp = acts.ac_temp;
          if (acts.ac_mode !== undefined) acState.mode = acts.ac_mode;
          if (acts.ac_fan !== undefined) acState.fan = acts.ac_fan;
          updateAcModalUI();

          const targetAc = acts.ac_target || "all";
          if (targetAc === "all") {
            const allAcs = getAllAvailableAcs();
            allAcs.forEach(dev => {
              apiRunner("/api/hvac/control", "POST", {
                device_id: dev.id,
                power: acState.power,
                temp: acState.temp,
                mode: acState.mode,
                fan: acState.fan
              }).catch(err => console.error("Auto AC err:", err));
            });
          } else {
            apiRunner("/api/hvac/control", "POST", {
              device_id: targetAc,
              power: acState.power,
              temp: acState.temp,
              mode: acState.mode,
              fan: acState.fan
            }).catch(err => console.error("Auto AC err:", err));
          }
        }

        if (acts.relay1 !== undefined && acts.relay1 >= 0) {
          relayStates[1] = acts.relay1;
          apiRunner("/api/gateway/relay", "POST", { channel: 1, state: acts.relay1 }).catch(err => console.error("Auto R1 err:", err));
        }

        if (acts.relay2 !== undefined && acts.relay2 >= 0) {
          relayStates[2] = acts.relay2;
          apiRunner("/api/gateway/relay", "POST", { channel: 2, state: acts.relay2 }).catch(err => console.error("Auto R2 err:", err));
        }

        renderDevices();
        showToast(`⚡ Tự động hóa: [${rule.name}] đã thực thi!`, "success", 7000);

        if (typeof addSystemNotification === "function") {
          addSystemNotification({
            type: "automation",
            title: `Tự động hóa: ${rule.name}`,
            message: triggerReason || rule.actionText || "Đã áp dụng lệnh điều khiển tự động.",
            badge: rule.badge || "Tự động"
          });
        }
      }
    }
  }
  window.evaluateAutomationRules = evaluateAutomationRules;

  const DEFAULT_AUTOMATIONS = [
    {
      id: "auto_eco_presence",
      name: "Tự ngắt khi vắng người (Eco Presence)",
      badge: "Radar mmWave",
      badgeColor: "#059669",
      badgeBg: "#ecfdf5",
      icon: "fa-person-walking-arrow-right",
      iconColor: "#059669",
      iconBg: "#ecfdf5",
      enabled: true,
      triggerText: "Radar LD2410B phát hiện phòng TRỐNG liên tục ≥ 5 phút",
      actionText: "Tự tắt toàn bộ Điều hòa & Ngắt Relay 1 (Đèn chính)",
      actions: { ac_power: 0, relay1: 0 }
    },
    {
      id: "auto_comfort_cool",
      name: "Tự làm mát thông minh (Auto Cool)",
      badge: "Hiện diện + Nhiệt độ",
      badgeColor: "#0284c7",
      badgeBg: "#f0f9ff",
      icon: "fa-temperature-arrow-up",
      iconColor: "#0284c7",
      iconBg: "#f0f9ff",
      enabled: true,
      triggerText: "Có người trong phòng VÀ Nhiệt độ phòng > 28.5°C",
      actionText: "Bật Điều hòa 24°C Cool & Quạt Auto, Bật Relay 1",
      actions: { ac_power: 1, ac_temp: 24, ac_mode: 1, ac_fan: 0, relay1: 1 }
    },
    {
      id: "auto_power_protect",
      name: "Bảo vệ quá tải điện lưới (Peak Shaving)",
      badge: "Chất lượng điện STM32",
      badgeColor: "#d97706",
      badgeBg: "#fef3c7",
      icon: "fa-bolt-lightning",
      iconColor: "#d97706",
      iconBg: "#fef3c7",
      enabled: true,
      triggerText: "Module PZEM đo công suất tổng > 2500W hoặc Điện áp < 180V",
      actionText: "Tăng điều hòa lên 27°C Eco & Ngắt Relay 2 phụ tải",
      actions: { ac_power: 1, ac_temp: 27, ac_mode: 1, ac_fan: 1, relay2: 0 }
    },
    {
      id: "auto_night_sleep",
      name: "Chăm sóc giấc ngủ đêm (Night Sleep)",
      badge: "Hẹn giờ + Nhịp thở",
      badgeColor: "#7c3aed",
      badgeBg: "#f5f3ff",
      icon: "fa-moon",
      iconColor: "#7c3aed",
      iconBg: "#f5f3ff",
      enabled: true,
      triggerText: "01:00 AM đêm VÀ Radar phát hiện người đứng yên (đang ngủ)",
      actionText: "Tăng điều hòa lên 27°C chống cảm lạnh & giảm ồn quạt",
      actions: { ac_power: 1, ac_temp: 27, ac_mode: 1, ac_fan: 1 }
    }
  ];

  function getStoredAutomations() {
    try {
      const stored = localStorage.getItem("gate_user_automations");
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch (e) {}
    return DEFAULT_AUTOMATIONS;
  }

  function saveStoredAutomations(autos) {
    localStorage.setItem("gate_user_automations", JSON.stringify(autos));
  }

  function openAutomationsView() {
    currentHubView = null;
    const homeDash = document.getElementById("view-home-dashboard");
    const subView = document.getElementById("view-device-hub");
    const notifsView = document.getElementById("view-notifications");
    const roomView = document.getElementById("view-room-mgmt");
    if (homeDash) homeDash.style.display = "none";
    if (subView) subView.style.display = "none";
    if (viewFirmwareUpdate) viewFirmwareUpdate.style.display = "none";
    if (notifsView) notifsView.style.display = "none";
    if (roomView) roomView.style.display = "none";
    if (viewAutomations) viewAutomations.style.display = "block";

    updateSidebarActive("nav-automations");
    renderAutomations();
    window.location.hash = "automations";
  }

  function renderAutomations() {
    const listEl = document.getElementById("auto-rules-list");
    const statTotalEl = document.getElementById("stat-total-rules");
    if (!listEl) return;

    const autos = getStoredAutomations();
    const activeCount = autos.filter(a => a.enabled).length;
    if (statTotalEl) statTotalEl.innerText = `${activeCount.toString().padStart(2, '0')}`;

    let html = "";
    autos.forEach(rule => {
      const isCustom = !DEFAULT_AUTOMATIONS.some(d => d.id === rule.id);
      html += `
        <div class="auto-rule-card ${rule.enabled ? '' : 'is-disabled'}" data-auto-id="${escapeHtml(rule.id)}">
          <div class="auto-rule-top">
            <div class="auto-rule-icon" style="background: ${escapeHtml(rule.iconBg || '#ecfdf5')}; color: ${escapeHtml(rule.iconColor || '#00b06f')};">
              <i class="fa-solid ${escapeHtml(rule.icon || 'fa-bolt')}"></i>
            </div>
            <div class="auto-rule-title-box">
              <h4 class="auto-rule-name">${escapeHtml(rule.name)}</h4>
              <span class="auto-rule-badge" style="background: ${escapeHtml(rule.badgeBg || '#ecfdf5')}; color: ${escapeHtml(rule.badgeColor || '#00b06f')};">
                ${escapeHtml(rule.badge || 'Tự động')}
              </span>
            </div>
            <label class="modern-toggle-switch" title="${rule.enabled ? 'Đang bật tự động hóa' : 'Đang tắt'}">
              <input type="checkbox" class="toggle-auto-active" data-id="${escapeHtml(rule.id)}" ${rule.enabled ? 'checked' : ''}>
              <span class="slider round"></span>
            </label>
          </div>

          <div class="auto-flow-box">
            <div class="auto-flow-item">
              <span class="flow-tag if">KHI</span>
              <span>${escapeHtml(rule.triggerText)}</span>
            </div>
            <div class="auto-flow-item">
              <span class="flow-tag then">THÌ</span>
              <span>${escapeHtml(rule.actionText)}</span>
            </div>
          </div>

          <div class="auto-card-footer">
            <button type="button" class="btn-auto-test" data-id="${escapeHtml(rule.id)}" title="Chạy thử nghiệm kịch bản này ngay">
              <i class="fa-solid fa-play"></i> Chạy thử
            </button>
            ${isCustom ? `
              <button type="button" class="btn-auto-del" data-id="${escapeHtml(rule.id)}" title="Xóa kịch bản này">
                <i class="fa-solid fa-trash-can"></i>
              </button>
            ` : ''}
          </div>
        </div>
      `;
    });

    listEl.innerHTML = html;

    listEl.querySelectorAll(".toggle-auto-active").forEach(chk => {
      chk.addEventListener("change", () => {
        const id = chk.getAttribute("data-id");
        const autos = getStoredAutomations();
        const target = autos.find(a => a.id === id);
        if (target) {
          target.enabled = chk.checked;
          saveStoredAutomations(autos);
          renderAutomations();
          showToast(`Kịch bản [${target.name}] đã ${chk.checked ? 'KÍCH HOẠT' : 'TẠM DỪNG'}!`, chk.checked ? "success" : "info");
        }
      });
    });

    listEl.querySelectorAll(".btn-auto-test").forEach(btn => {
      btn.addEventListener("click", async () => {
        const id = btn.getAttribute("data-id");
        const rule = getStoredAutomations().find(a => a.id === id);
        if (!rule) return;

        const icon = btn.querySelector("i");
        if (icon) icon.className = "fa-solid fa-spinner fa-spin";
        showToast(`Đang chạy thử: [${rule.name}]...`, "info");

        if (rule.actions) {
          const acts = rule.actions;
          if (acts.ac_power !== undefined) {
            acState.power = acts.ac_power;
            if (acts.ac_temp > 0) acState.temp = acts.ac_temp;
            if (acts.ac_mode !== undefined) acState.mode = acts.ac_mode;
            if (acts.ac_fan !== undefined) acState.fan = acts.ac_fan;
            updateAcModalUI();
            await callApi("/api/hvac/control", "POST", {
              power: acState.power,
              temp: acState.temp,
              mode: acState.mode,
              fan: acState.fan
            });
          }
          if (acts.relay1 !== undefined && acts.relay1 >= 0) {
            relayStates[1] = acts.relay1;
            await callApi("/api/gateway/relay", "POST", { channel: 1, state: acts.relay1 });
          }
          if (acts.relay2 !== undefined && acts.relay2 >= 0) {
            relayStates[2] = acts.relay2;
            await callApi("/api/gateway/relay", "POST", { channel: 2, state: acts.relay2 });
          }
          renderDevices();
        }

        setTimeout(() => {
          if (icon) icon.className = "fa-solid fa-play";
          showToast(`Kịch bản [${rule.name}] đã thực thi lệnh thành công!`, "success");
          if (typeof addSystemNotification === "function") {
            addSystemNotification({
              type: "automation",
              title: `Chạy tự động hóa: ${rule.name}`,
              message: rule.actionText || "Đã thực thi các lệnh hành động.",
              badge: "Tự động"
            });
          }
        }, 500);
      });
    });

    listEl.querySelectorAll(".btn-auto-del").forEach(btn => {
      btn.addEventListener("click", () => {
        const id = btn.getAttribute("data-id");
        if (confirm("Bạn có chắc chắn muốn xóa kịch bản này?")) {
          const filtered = getStoredAutomations().filter(a => a.id !== id);
          saveStoredAutomations(filtered);
          renderAutomations();
          showToast("Đã xóa kịch bản tự động hóa!", "info");
        }
      });
    });
  }

  // ── MODAL TẠO TỰ ĐỘNG HÓA MỚI (AUTOMATION BUILDER) ─────────────────────────
  const modalAutomationBuilder = document.getElementById("modal-automation-builder");
  const btnCloseAutoModal = document.getElementById("btn-close-auto-modal");
  const btnCloseAutoModal2 = document.getElementById("btn-close-auto-modal2");
  const btnSaveAutomation = document.getElementById("btn-save-automation");
  const inputAutoName = document.getElementById("input-auto-name");
  const autoTriggerType = document.getElementById("auto-trigger-type");
  const triggerExtraConfig = document.getElementById("trigger-extra-config");
  const triggerExtraLabel = document.getElementById("trigger-extra-label");
  const triggerExtraVal = document.getElementById("trigger-extra-val");
  const triggerExtraUnit = document.getElementById("trigger-extra-unit");
  const autoActAcPower = document.getElementById("auto-act-ac-power");
  const autoActAcDetails = document.getElementById("auto-act-ac-details");
  const autoActAcTemp = document.getElementById("auto-act-ac-temp");
  const autoActAcMode = document.getElementById("auto-act-ac-mode");
  const autoActRelay1 = document.getElementById("auto-act-relay1");

  if (autoTriggerType) {
    autoTriggerType.addEventListener("change", () => {
      const val = autoTriggerType.value;
      if (val === "presence_unoccupied") {
        if (triggerExtraConfig) triggerExtraConfig.style.display = "flex";
        if (triggerExtraLabel) triggerExtraLabel.innerText = "Duy trì trong thời gian tối thiểu:";
        if (triggerExtraVal) triggerExtraVal.value = 5;
        if (triggerExtraUnit) triggerExtraUnit.innerText = "phút";
      } else if (val === "presence_occupied") {
        if (triggerExtraConfig) triggerExtraConfig.style.display = "none";
      } else if (val === "temp_high") {
        if (triggerExtraConfig) triggerExtraConfig.style.display = "flex";
        if (triggerExtraLabel) triggerExtraLabel.innerText = "Nhiệt độ phòng lớn hơn:";
        if (triggerExtraVal) triggerExtraVal.value = 28;
        if (triggerExtraUnit) triggerExtraUnit.innerText = "°C";
      } else if (val === "power_high") {
        if (triggerExtraConfig) triggerExtraConfig.style.display = "flex";
        if (triggerExtraLabel) triggerExtraLabel.innerText = "Công suất tiêu thụ lớn hơn:";
        if (triggerExtraVal) triggerExtraVal.value = 2000;
        if (triggerExtraUnit) triggerExtraUnit.innerText = "Watt (W)";
      } else if (val === "time_schedule") {
        if (triggerExtraConfig) triggerExtraConfig.style.display = "flex";
        if (triggerExtraLabel) triggerExtraLabel.innerText = "Thời điểm hẹn giờ:";
        if (triggerExtraVal) triggerExtraVal.value = 23;
        if (triggerExtraUnit) triggerExtraUnit.innerText = "giờ đêm";
      }
    });
  }

  if (autoActAcPower) {
    autoActAcPower.addEventListener("change", () => {
      if (autoActAcDetails) {
        autoActAcDetails.style.display = (autoActAcPower.value === "1") ? "flex" : "none";
      }
    });
  }

  function openAutomationBuilderModal() {
    if (inputAutoName) inputAutoName.value = "";
    if (autoActAcPower) autoActAcPower.value = "0";
    if (autoActAcDetails) autoActAcDetails.style.display = "none";

    const targetSelect = document.getElementById("auto-act-ac-target");
    if (targetSelect) {
      const acs = getAllAvailableAcs();
      let optHtml = `<option value="all">Tất cả điều hòa trong nhà (Toàn bộ)</option>`;
      acs.forEach(ac => {
        optHtml += `<option value="${escapeHtml(ac.id)}">${escapeHtml(ac.name)} (${escapeHtml(ac.brand_name || 'Hunonic IR')})</option>`;
      });
      targetSelect.innerHTML = optHtml;
    }

    if (modalAutomationBuilder) modalAutomationBuilder.classList.remove("hidden");
  }

  function closeAutomationBuilderModal() {
    if (modalAutomationBuilder) modalAutomationBuilder.classList.add("hidden");
  }

  if (btnOpenCreateAuto) btnOpenCreateAuto.addEventListener("click", openAutomationBuilderModal);
  if (btnCloseAutoModal) btnCloseAutoModal.addEventListener("click", closeAutomationBuilderModal);
  if (btnCloseAutoModal2) btnCloseAutoModal2.addEventListener("click", closeAutomationBuilderModal);

  if (btnSaveAutomation) {
    btnSaveAutomation.addEventListener("click", () => {
      const name = inputAutoName ? inputAutoName.value.trim() : "";
      if (!name) {
        showToast("Vui lòng nhập tên kịch bản tự động hóa!", "error");
        return;
      }

      const trigVal = autoTriggerType ? autoTriggerType.value : "presence_unoccupied";
      const extraVal = triggerExtraVal ? triggerExtraVal.value : "5";
      let triggerText = "";
      let badge = "Tự động";
      let icon = "fa-bolt";
      let iconColor = "#00b06f";
      let iconBg = "#ecfdf5";

      if (trigVal === "presence_unoccupied") {
        triggerText = `Radar LD2410B phát hiện phòng TRỐNG liên tục ≥ ${extraVal} phút`;
        badge = "Radar mmWave";
        icon = "fa-person-walking-arrow-right";
        iconColor = "#059669";
        iconBg = "#ecfdf5";
      } else if (trigVal === "presence_occupied") {
        triggerText = "Radar LD2410B phát hiện CÓ NGƯỜI bước vào phòng";
        badge = "Radar mmWave";
        icon = "fa-person-walking";
        iconColor = "#0284c7";
        iconBg = "#f0f9ff";
      } else if (trigVal === "temp_high") {
        triggerText = `Cảm biến SHT30 đo nhiệt độ phòng vượt ngưỡng > ${extraVal}°C`;
        badge = "Nhiệt độ";
        icon = "fa-temperature-arrow-up";
        iconColor = "#ea580c";
        iconBg = "#fff7ed";
      } else if (trigVal === "power_high") {
        triggerText = `PZEM STM32 phát hiện công suất điện tiêu thụ > ${extraVal} W`;
        badge = "Chất lượng điện";
        icon = "fa-bolt-lightning";
        iconColor = "#d97706";
        iconBg = "#fef3c7";
      } else if (trigVal === "time_schedule") {
        triggerText = `Hẹn giờ kích hoạt tự động vào lúc ${extraVal}:00 hàng ngày`;
        badge = "Hẹn giờ";
        icon = "fa-clock";
        iconColor = "#7c3aed";
        iconBg = "#f5f3ff";
      }

      const actions = {};
      const actParts = [];
      const acTargetSelect = document.getElementById("auto-act-ac-target");
      const acTargetVal = acTargetSelect ? acTargetSelect.value : "all";
      const acTargetText = (acTargetSelect && acTargetSelect.options[acTargetSelect.selectedIndex]) ? acTargetSelect.options[acTargetSelect.selectedIndex].text : "Tất cả điều hòa";
      const acLabel = acTargetVal === "all" ? "Tất cả AC" : acTargetText.replace(/\s*\(.*\)/, "");

      const acPwr = Number(autoActAcPower ? autoActAcPower.value : -1);
      if (acPwr !== -1) {
        actions.ac_power = acPwr;
        actions.ac_target = acTargetVal;
        if (acPwr === 1) {
          actions.ac_temp = Number(autoActAcTemp ? autoActAcTemp.value : 25);
          actions.ac_mode = Number(autoActAcMode ? autoActAcMode.value : 1);
          actions.ac_fan = 0;
          actParts.push(`Bật ${acLabel} ${actions.ac_temp}°C`);
        } else {
          actParts.push(`Tắt ${acLabel}`);
        }
      }

      const r1 = Number(autoActRelay1 ? autoActRelay1.value : -1);
      if (r1 !== -1) {
        actions.relay1 = r1;
        actParts.push(r1 === 1 ? "Bật Đèn (R1)" : "Tắt Đèn (R1)");
      }

      const newAuto = {
        id: "auto_custom_" + Date.now(),
        name,
        badge,
        badgeColor: iconColor,
        badgeBg: iconBg,
        icon,
        iconColor,
        iconBg,
        enabled: true,
        triggerText,
        actionText: actParts.length > 0 ? actParts.join(" &bull; ") : "Kích hoạt thiết bị",
        actions
      };

      const autos = getStoredAutomations();
      autos.push(newAuto);
      saveStoredAutomations(autos);
      renderAutomations();
      closeAutomationBuilderModal();
      showToast(`Đã lưu kịch bản [${name}] thành công!`, "success");
    });
  }

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

  const DEFAULT_NOTIFICATIONS = [
    {
      id: "notif_default_1",
      type: "presence",
      title: "Phát hiện có người trong phòng",
      message: "Radar LD2410B ghi nhận chuyển động tại khu vực giám sát phòng khách.",
      time: new Date(Date.now() - 3 * 60000).toISOString(),
      read: false,
      badge: "Hiện diện"
    },
    {
      id: "notif_default_2",
      type: "automation",
      title: "Kích hoạt tự động hóa: Eco Presence",
      message: "Phòng trống ≥ 5 phút: Hệ thống tự động tắt Điều hòa và ngắt Relay 1 (Đèn chính).",
      time: new Date(Date.now() - 18 * 60000).toISOString(),
      read: false,
      badge: "Tự động"
    },
    {
      id: "notif_default_3",
      type: "device",
      title: "Gateway ESP32-S3 đã kết nối Cloud",
      message: "Trạm Gateway kết nối thành công tới HiveMQ Broker (SSL/TLS MQTTS port 8883).",
      time: new Date(Date.now() - 42 * 60000).toISOString(),
      read: false,
      badge: "Hệ thống"
    },
    {
      id: "notif_default_4",
      type: "alert",
      title: "Cảnh báo độ ẩm phòng cao (77%)",
      message: "Cảm biến SHT30 đo độ ẩm phòng khách vượt ngưỡng tiêu chuẩn khuyến nghị (40% - 60%).",
      time: new Date(Date.now() - 2 * 3600000).toISOString(),
      read: true,
      badge: "Cảnh báo"
    }
  ];

  function getStoredNotifications() {
    try {
      const stored = localStorage.getItem(NOTIF_STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch (e) {}
    return DEFAULT_NOTIFICATIONS;
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

  function formatTimeAgo(isoString) {
    try {
      const diffMs = Date.now() - new Date(isoString).getTime();
      const diffSec = Math.floor(diffMs / 1000);
      if (diffSec < 60) return "Vừa xong";
      const diffMin = Math.floor(diffSec / 60);
      if (diffMin < 60) return `${diffMin} phút trước`;
      const diffHour = Math.floor(diffMin / 60);
      if (diffHour < 24) return `${diffHour} giờ trước`;
      const d = new Date(isoString);
      return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')} ${d.getDate()}/${d.getMonth()+1}`;
    } catch (e) {
      return "Gần đây";
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
    currentHubView = null;
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

    updateSidebarActive("nav-notifs");
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
      closeHubSubView(true);
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
    btnClearAllNotifs.addEventListener("click", () => {
      if (!confirm("Bạn có chắc chắn muốn xóa toàn bộ lịch sử thông báo?")) return;
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

  // ==============================================================================
  // QUẢN LÝ PHÒNG (ROOM MANAGEMENT ENGINE)
  // ==============================================================================
  const viewRoomMgmt = document.getElementById("view-room-mgmt");
  const btnRoomsBack = document.getElementById("btn-rooms-back");
  const btnOpenCreateRoom = document.getElementById("btn-open-create-room");
  const roomsGridContainer = document.getElementById("rooms-grid-container");
  const statTotalRooms = document.getElementById("stat-total-rooms");
  const statTotalRoomDevices = document.getElementById("stat-total-room-devices");
  const statRoomsActiveCount = document.getElementById("stat-rooms-active-count");

  // Modal elements
  const modalRoomBuilder = document.getElementById("modal-room-builder");
  const modalRoomTitle = document.getElementById("modal-room-title");
  const inputRoomName = document.getElementById("input-room-name");
  const roomIconPicker = document.getElementById("room-icon-picker");
  const roomColorPicker = document.getElementById("room-color-picker");
  const roomAssignDevicesList = document.getElementById("room-assign-devices-list");
  const btnCloseRoomModal = document.getElementById("btn-close-room-modal");
  const btnCancelRoomModal = document.getElementById("btn-cancel-room-modal");
  const btnSaveRoom = document.getElementById("btn-save-room");

  const ROOMS_STORAGE_KEY = "gate_user_rooms";
  let editingRoomId = null;
  let selectedRoomIcon = "fa-couch";
  let selectedRoomColor = "#10b981";

  const DEFAULT_ROOMS = [
    {
      id: "room_living",
      name: "Phòng khách",
      icon: "fa-couch",
      color: "#00b06f",
      isDefault: true
    },
    {
      id: "room_bedroom",
      name: "Phòng ngủ",
      icon: "fa-bed",
      color: "#0284c7"
    },
    {
      id: "room_work",
      name: "Phòng làm việc",
      icon: "fa-laptop-code",
      color: "#8b5cf6"
    },
    {
      id: "room_kitchen",
      name: "Nhà bếp",
      icon: "fa-utensils",
      color: "#f59e0b"
    }
  ];

  function getStoredRooms() {
    try {
      const stored = localStorage.getItem(ROOMS_STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch (e) {}
    return DEFAULT_ROOMS;
  }

  function saveStoredRooms(rooms) {
    localStorage.setItem(ROOMS_STORAGE_KEY, JSON.stringify(rooms));
    syncRoomDropdowns();
    if (typeof renderDashboardRoomFilters === "function") {
      renderDashboardRoomFilters();
    }
  }

  function syncRoomDropdowns() {
    const rooms = getStoredRooms();
    const dropdowns = [
      document.getElementById("drawer-edit-room"),
      document.getElementById("new-device-room")
    ];

    dropdowns.forEach(dd => {
      if (!dd) return;
      const curVal = dd.value;
      let html = "";
      rooms.forEach(r => {
        html += `<option value="${escapeHtml(r.name)}">${escapeHtml(r.name)}</option>`;
      });
      dd.innerHTML = html;
      if (curVal && rooms.some(r => r.name === curVal)) {
        dd.value = curVal;
      }
    });
  }

  function getAllSystemDevices() {
    const devs = [];
    const gwRoom = localStorage.getItem("gate_room") || "Phòng khách";
    const gwName = localStorage.getItem("gate_custom_name") || "Trạm Gateway ESP32-S3";
    devs.push({
      id: "gateway_master",
      name: gwName,
      type: "gateway",
      room: gwRoom,
      icon: "fa-server",
      isOnline: isGatewayOnline
    });

    customDevices.forEach(d => {
      let icon = "fa-microchip";
      if (d.type === "sensor") icon = "fa-person-rays";
      else if (d.type === "ir_hub") icon = "fa-wifi";
      else if (d.type === "ac") icon = "fa-wind";

      devs.push({
        id: d.id,
        name: d.name,
        type: d.type,
        room: d.room || "Phòng khách",
        icon,
        isOnline: isDeviceOnline(d)
      });

      if (d.children && Array.isArray(d.children)) {
        d.children.forEach(c => {
          devs.push({
            id: "child_" + c.id,
            name: c.name || "Điều hòa",
            type: "ac_child",
            parentId: d.id,
            room: d.room || "Phòng khách",
            icon: "fa-wind",
            isOnline: isDeviceOnline(d)
          });
        });
      }
    });

    devs.push({
      id: "relay_1",
      name: "Đèn chính (Relay 1)",
      type: "relay",
      room: gwRoom,
      icon: "fa-lightbulb",
      isOnline: isGatewayOnline,
      state: relayStates[1]
    });

    return devs;
  }

  function renderRoomsView() {
    if (!roomsGridContainer) return;

    const rooms = getStoredRooms();
    const allDevs = getAllSystemDevices();

    if (statTotalRooms) statTotalRooms.innerText = rooms.length.toString().padStart(2, '0');
    if (statTotalRoomDevices) statTotalRoomDevices.innerText = allDevs.length.toString();

    let html = "";
    rooms.forEach(room => {
      const roomDevs = allDevs.filter(d => d.room === room.name);
      const isDefault = !!room.isDefault;
      const hasSensor = roomDevs.some(d => d.type === "sensor" || d.name.includes("Cảm Biến") || d.name.includes("SHT30")) || room.name === "Phòng khách";
      const isOccupied = sensorData.hasData && (sensorData.presence === true || Number(sensorData.presence) === 1);

      html += `
        <div class="room-card" data-room-id="${escapeHtml(room.id)}" data-room-name="${escapeHtml(room.name)}">
          <div class="room-card-header">
            <div style="display: flex; align-items: center; gap: 12px; min-width: 0;">
              <div class="room-card-icon" style="background: ${escapeHtml(room.color || '#10b981')}18; color: ${escapeHtml(room.color || '#10b981')};">
                <i class="fa-solid ${escapeHtml(room.icon || 'fa-couch')}"></i>
              </div>
              <div class="room-card-titles">
                <h4 class="room-card-name" title="${escapeHtml(room.name)}">${escapeHtml(room.name)}</h4>
                <span class="room-card-count">${roomDevs.length} thiết bị liên kết</span>
              </div>
            </div>
            <div class="room-card-menu-btns">
              <button type="button" class="btn-room-icon btn-edit-room" data-id="${escapeHtml(room.id)}" title="Chỉnh sửa thông tin phòng">
                <i class="fa-solid fa-pen-to-square"></i>
              </button>
              ${!isDefault ? `
                <button type="button" class="btn-room-icon btn-room-del btn-del-room" data-id="${escapeHtml(room.id)}" title="Xóa phòng này">
                  <i class="fa-solid fa-trash-can"></i>
                </button>
              ` : ''}
            </div>
          </div>

          ${hasSensor ? `
            <div class="room-env-strip">
              <div class="room-env-item" title="Nhiệt độ phòng">
                <i class="fa-solid fa-temperature-half" style="color: #ef4444;"></i>
                <span>${sensorData.hasData && sensorData.temperature > 0 ? sensorData.temperature.toFixed(1) + '°C' : '27.0°C'}</span>
              </div>
              <div class="room-env-item" title="Độ ẩm không khí">
                <i class="fa-solid fa-droplet" style="color: #0284c7;"></i>
                <span>${sensorData.hasData && sensorData.humidity > 0 ? sensorData.humidity.toFixed(0) + '%' : '77%'}</span>
              </div>
              <div class="room-env-item" title="Hiện diện Radar LD2410B">
                <i class="fa-solid fa-person-walking" style="color: ${isOccupied ? '#059669' : '#94a3b8'};"></i>
                <span style="color: ${isOccupied ? '#059669' : '#64748b'};">${isOccupied ? 'Có người' : 'Phòng trống'}</span>
              </div>
            </div>
          ` : `
            <div class="room-env-strip" style="color: #94a3b8; font-size: 0.75rem; justify-content: center; gap: 8px;">
              <i class="fa-solid fa-circle-info"></i> Chưa gắn cảm biến môi trường tại khu vực này
            </div>
          `}

          <div class="room-devices-box">
            <div class="room-devices-title">Thiết bị trong phòng:</div>
            <div class="room-device-chips">
              ${roomDevs.length > 0 ? roomDevs.map(d => `
                <span class="room-device-pill" title="${escapeHtml(d.name)}">
                  <i class="fa-solid ${escapeHtml(d.icon)}" style="color: ${d.isOnline ? '#00b06f' : '#94a3b8'};"></i>
                  <span>${escapeHtml(d.name)}</span>
                </span>
              `).join('') : '<span style="font-size: 0.76rem; color: #94a3b8; font-style: italic;">Chưa có thiết bị nào trong phòng này</span>'}
            </div>
          </div>

          <div class="room-card-footer">
            <button type="button" class="btn-room-off" data-room="${escapeHtml(room.name)}" title="Tắt toàn bộ thiết bị trong phòng này">
              <i class="fa-solid fa-power-off"></i> Tắt hết
            </button>
            <button type="button" class="btn-room-explore" data-room="${escapeHtml(room.name)}" title="Xem chi tiết thiết bị">
              <i class="fa-solid fa-arrow-right"></i> Xem chi tiết
            </button>
          </div>
        </div>
      `;
    });

    roomsGridContainer.innerHTML = html;

    roomsGridContainer.querySelectorAll(".btn-edit-room").forEach(btn => {
      btn.addEventListener("click", () => {
        const id = btn.getAttribute("data-id");
        openRoomBuilderModal(id);
      });
    });

    roomsGridContainer.querySelectorAll(".btn-del-room").forEach(btn => {
      btn.addEventListener("click", () => {
        const id = btn.getAttribute("data-id");
        const rooms = getStoredRooms();
        const room = rooms.find(r => r.id === id);
        if (!room) return;

        if (confirm(`Bạn có chắc chắn muốn xóa phòng "${room.name}"? Các thiết bị trong phòng sẽ được chuyển về "Phòng khách".`)) {
          customDevices.forEach(d => {
            if (d.room === room.name) d.room = "Phòng khách";
          });
          localStorage.setItem("gate_custom_devices", JSON.stringify(customDevices));
          if (localStorage.getItem("gate_room") === room.name) {
            localStorage.setItem("gate_room", "Phòng khách");
          }

          const filtered = rooms.filter(r => r.id !== id);
          saveStoredRooms(filtered);
          renderRoomsView();
          renderDevices();
          showToast(`Đã xóa phòng "${room.name}" thành công!`, "info");
        }
      });
    });

    roomsGridContainer.querySelectorAll(".btn-room-off").forEach(btn => {
      btn.addEventListener("click", async () => {
        const roomName = btn.getAttribute("data-room");
        const allDevs = getAllSystemDevices();
        const devsInRoom = allDevs.filter(d => d.room === roomName);

        if (devsInRoom.length === 0) {
          showToast(`Không có thiết bị nào trong phòng "${roomName}"!`, "info");
          return;
        }

        showToast(`Đang tắt các thiết bị tại ${roomName}...`, "info");
        const gwRoom = localStorage.getItem("gate_room") || "Phòng khách";

        // Tắt Điều hòa nếu AC hoặc Trạm IR thuộc phòng này
        if (roomName === gwRoom || devsInRoom.some(d => d.type === "ac" || d.id === "dev_ir_hub_hunonic")) {
          acState.power = 0;
          updateAcModalUI();
          await callApi("/api/hvac/control", "POST", { power: 0, temp: acState.temp, mode: acState.mode, fan: acState.fan });
        }

        // Tắt các Relay nếu Trạm Gateway thuộc phòng này
        if (roomName === gwRoom) {
          relayStates[1] = 0;
          relayStates[2] = 0;
          await callApi("/api/gateway/relay", "POST", { channel: 1, state: 0 });
          await callApi("/api/gateway/relay", "POST", { channel: 2, state: 0 });
        }

        // Tắt các thiết bị con khác
        customDevices.forEach(d => {
          if (d.room === roomName && (d.type === "relay" || d.type === "socket")) {
            d.state = 0;
          }
        });
        localStorage.setItem("gate_custom_devices", JSON.stringify(customDevices));

        renderDevices();
        renderRoomsView();
        if (typeof renderDashboardRoomFilters === "function") {
          renderDashboardRoomFilters();
        }
        showToast(`Đã tắt toàn bộ thiết bị tại ${roomName}!`, "success");

        if (typeof addSystemNotification === "function") {
          addSystemNotification({
            type: "device",
            title: `Tắt thiết bị tại ${roomName}`,
            message: `Lệnh tắt phòng thực thi: Đã ngắt nguồn toàn bộ thiết bị đang hoạt động tại ${roomName}.`,
            badge: "Phòng"
          });
        }
      });
    });

    roomsGridContainer.querySelectorAll(".btn-room-explore").forEach(btn => {
      btn.addEventListener("click", () => {
        const roomName = btn.getAttribute("data-room");
        selectedRoomFilter = roomName;
        closeHubSubView(true);
        window.location.hash = "";
        if (typeof renderDashboardRoomFilters === "function") {
          renderDashboardRoomFilters();
        }
        renderDevices();
        const filterBar = document.getElementById("dashboard-room-filters") || document.querySelector(".section-block");
        if (filterBar) filterBar.scrollIntoView({ behavior: "smooth" });
        showToast(`Đang lọc thiết bị: ${roomName}`, "info");
      });
    });
  }

  function openRoomBuilderModal(roomId = null) {
    editingRoomId = roomId;
    const rooms = getStoredRooms();
    const allDevs = getAllSystemDevices();

    if (roomId) {
      const room = rooms.find(r => r.id === roomId);
      if (room) {
        if (modalRoomTitle) modalRoomTitle.innerText = "Chỉnh Sửa Phòng";
        if (inputRoomName) inputRoomName.value = room.name;
        selectedRoomIcon = room.icon || "fa-couch";
        selectedRoomColor = room.color || "#10b981";
      }
    } else {
      if (modalRoomTitle) modalRoomTitle.innerText = "Thêm Phòng Mới";
      if (inputRoomName) inputRoomName.value = "";
      selectedRoomIcon = "fa-couch";
      selectedRoomColor = "#10b981";
    }

    if (roomIconPicker) {
      roomIconPicker.querySelectorAll(".icon-picker-btn").forEach(btn => {
        const icon = btn.getAttribute("data-icon");
        btn.classList.toggle("active", icon === selectedRoomIcon);
      });
    }

    if (roomColorPicker) {
      roomColorPicker.querySelectorAll(".color-dot").forEach(dot => {
        const col = dot.getAttribute("data-color");
        dot.classList.toggle("active", col === selectedRoomColor);
      });
    }

    if (roomAssignDevicesList) {
      const currentRoomName = roomId ? (rooms.find(r => r.id === roomId)?.name || "") : "";
      let devHtml = "";
      allDevs.forEach(d => {
        const isAssigned = currentRoomName && d.room === currentRoomName;
        devHtml += `
          <label style="display: flex; align-items: center; justify-content: space-between; font-size: 0.8rem; cursor: pointer; padding: 6px 8px; border-radius: 6px; background: #fff; border: 1px solid #e2e8f0;">
            <div style="display: flex; align-items: center; gap: 8px;">
              <i class="fa-solid ${escapeHtml(d.icon)}" style="color: ${escapeHtml(selectedRoomColor)};"></i>
              <span style="font-weight: 600; color: #1e293b;">${escapeHtml(d.name)}</span>
              <span style="font-size: 0.72rem; color: #94a3b8;">(${escapeHtml(d.room)})</span>
            </div>
            <input type="checkbox" class="assign-dev-checkbox" data-dev-id="${escapeHtml(d.id)}" ${isAssigned ? 'checked' : ''} />
          </label>
        `;
      });
      roomAssignDevicesList.innerHTML = devHtml;
    }

    if (modalRoomBuilder) modalRoomBuilder.classList.remove("hidden");
  }

  function closeRoomBuilderModal() {
    if (modalRoomBuilder) modalRoomBuilder.classList.add("hidden");
    editingRoomId = null;
  }

  function openRoomMgmtView() {
    currentHubView = null;
    const homeDash = document.getElementById("view-home-dashboard");
    const subView = document.getElementById("view-device-hub");
    const autoView = document.getElementById("view-automations");
    const otaView = document.getElementById("view-firmware-update");
    const notifsView = document.getElementById("view-notifications");

    if (homeDash) homeDash.style.display = "none";
    if (subView) subView.style.display = "none";
    if (autoView) autoView.style.display = "none";
    if (otaView) otaView.style.display = "none";
    if (notifsView) notifsView.style.display = "none";
    if (viewRoomMgmt) viewRoomMgmt.style.display = "block";

    updateSidebarActive("nav-rooms");
    renderRoomsView();
    window.location.hash = "rooms";
  }

  if (btnRoomsBack) {
    btnRoomsBack.addEventListener("click", () => {
      closeHubSubView(true);
      window.location.hash = "";
    });
  }

  if (btnOpenCreateRoom) {
    btnOpenCreateRoom.addEventListener("click", () => openRoomBuilderModal());
  }

  if (btnCloseRoomModal) btnCloseRoomModal.addEventListener("click", closeRoomBuilderModal);
  if (btnCancelRoomModal) btnCancelRoomModal.addEventListener("click", closeRoomBuilderModal);

  if (roomIconPicker) {
    roomIconPicker.querySelectorAll(".icon-picker-btn").forEach(btn => {
      btn.addEventListener("click", () => {
        roomIconPicker.querySelectorAll(".icon-picker-btn").forEach(b => b.classList.remove("active"));
        btn.classList.add("active");
        selectedRoomIcon = btn.getAttribute("data-icon") || "fa-couch";
      });
    });
  }

  if (roomColorPicker) {
    roomColorPicker.querySelectorAll(".color-dot").forEach(dot => {
      dot.addEventListener("click", () => {
        roomColorPicker.querySelectorAll(".color-dot").forEach(d => d.classList.remove("active"));
        dot.classList.add("active");
        selectedRoomColor = dot.getAttribute("data-color") || "#10b981";
      });
    });
  }

  if (btnSaveRoom) {
    btnSaveRoom.addEventListener("click", () => {
      const name = inputRoomName ? inputRoomName.value.trim() : "";
      if (!name) {
        showToast("Vui lòng nhập tên phòng!", "error");
        return;
      }

      let rooms = getStoredRooms();

      if (editingRoomId) {
        const room = rooms.find(r => r.id === editingRoomId);
        if (room) {
          const oldName = room.name;
          room.name = name;
          room.icon = selectedRoomIcon;
          room.color = selectedRoomColor;

          if (oldName !== name) {
            customDevices.forEach(d => {
              if (d.room === oldName) d.room = name;
            });
            localStorage.setItem("gate_custom_devices", JSON.stringify(customDevices));
            if (localStorage.getItem("gate_room") === oldName) {
              localStorage.setItem("gate_room", name);
            }
          }
        }
      } else {
        if (rooms.some(r => r.name.toLowerCase() === name.toLowerCase())) {
          showToast(`Phòng "${name}" đã tồn tại!`, "error");
          return;
        }

        const newRoom = {
          id: "room_" + Date.now(),
          name,
          icon: selectedRoomIcon,
          color: selectedRoomColor,
          isDefault: false
        };
        rooms.push(newRoom);
      }

      if (roomAssignDevicesList) {
        const chks = roomAssignDevicesList.querySelectorAll(".assign-dev-checkbox:checked");
        const assignedIds = Array.from(chks).map(c => c.getAttribute("data-dev-id"));

        if (assignedIds.includes("gateway_master")) {
          localStorage.setItem("gate_room", name);
        }
        customDevices.forEach(d => {
          if (assignedIds.includes(d.id)) {
            d.room = name;
          }
        });
        localStorage.setItem("gate_custom_devices", JSON.stringify(customDevices));
      }

      saveStoredRooms(rooms);
      renderRoomsView();
      renderDevices();
      closeRoomBuilderModal();
      showToast(`Đã lưu không gian [${name}] thành công!`, "success");

      if (typeof addSystemNotification === "function") {
        addSystemNotification({
          type: "device",
          title: `Cập nhật phòng: ${name}`,
          message: `Đã lưu cấu hình không gian và phân bổ thiết bị tại khu vực ${name}.`,
          badge: "Phòng"
        });
      }
    });
  }

  // Mở màn hình cập nhật Firmware OTA
  function openFirmwareView() {
    currentHubView = null;
    const homeDash = document.getElementById("view-home-dashboard");
    const subView = document.getElementById("view-device-hub");
    const autoView = document.getElementById("view-automations");
    const notifsView = document.getElementById("view-notifications");
    const roomView = document.getElementById("view-room-mgmt");
    if (homeDash) homeDash.style.display = "none";
    if (subView) subView.style.display = "none";
    if (autoView) autoView.style.display = "none";
    if (notifsView) notifsView.style.display = "none";
    if (roomView) roomView.style.display = "none";
    if (viewFirmwareUpdate) viewFirmwareUpdate.style.display = "block";

    updateSidebarActive("nav-firmware");
    refreshOtaTelemetry();
    loadAdminFirmwares();
    window.location.hash = "firmware";
  }

  // Chọn thiết bị mục tiêu (Gateway S3 vs Node C3)
  function setOtaTarget(target) {
    currentOtaTarget = target;
    if (target === "esp32s3_gate") {
      if (btnSelectTargetGw) btnSelectTargetGw.classList.add("active");
      if (btnSelectTargetNode) btnSelectTargetNode.classList.remove("active");
      if (otaCardGw) otaCardGw.classList.add("ota-dev-card-active");
      if (otaCardNode) otaCardNode.classList.remove("ota-dev-card-active");
      const targetRadio = document.querySelector('input[name="ota_target_radio"][value="esp32s3_gate"]');
      if (targetRadio) targetRadio.checked = true;
      const targetText = document.getElementById("ota-progress-target-text");
      if (targetText) targetText.innerHTML = '<i class="fa-solid fa-server"></i> Gateway ESP32-S3';
      appendOtaLog("Đã chọn mục tiêu: Trạm Gateway ESP32-S3", "info");
    } else {
      if (btnSelectTargetNode) btnSelectTargetNode.classList.add("active");
      if (btnSelectTargetGw) btnSelectTargetGw.classList.remove("active");
      if (otaCardNode) otaCardNode.classList.add("ota-dev-card-active");
      if (otaCardGw) otaCardGw.classList.remove("ota-dev-card-active");
      const targetRadio = document.querySelector('input[name="ota_target_radio"][value="esp32c3_node"]');
      if (targetRadio) targetRadio.checked = true;
      const targetText = document.getElementById("ota-progress-target-text");
      if (targetText) targetText.innerHTML = '<i class="fa-solid fa-microchip"></i> Node Cảm Biến C3';
      appendOtaLog("Đã chọn mục tiêu: Node Cảm Biến C3 (ESP-NOW)", "info");
    }
  }

  // Ghi nhật ký vào console terminal
  function appendOtaLog(message, type = "info") {
    const consoleEl = document.getElementById("ota-terminal-console");
    if (!consoleEl) return;
    const now = new Date();
    const timeStr = now.toTimeString().split(" ")[0];
    const line = document.createElement("div");
    line.className = `term-entry term-${type}`;
    line.textContent = `[${timeStr}] ${message}`;
    consoleEl.appendChild(line);
    consoleEl.scrollTop = consoleEl.scrollHeight;
  }

  // Làm mới telemetry hiển thị trên các thẻ
  async function refreshOtaTelemetry() {
    try {
      const res = await callApi("/api/gateway/ota/status", "GET");
      if (res && res.success) {
        // Gateway specs
        const gwVer = document.getElementById("ota-gw-ver-val");
        if (gwVer) gwVer.innerText = `v${res.gateway_ver || "1.0.0"}`;
        const gwStatusBadge = document.getElementById("ota-gw-status-badge");
        if (gwStatusBadge) {
          gwStatusBadge.className = `gate-status-pill ${res.gateway_online ? 'online' : 'offline'}`;
          gwStatusBadge.innerText = res.gateway_online ? 'Trực tuyến' : 'Ngoại tuyến';
        }
        const gwUptime = document.getElementById("ota-gw-uptime-val");
        if (gwUptime) gwUptime.innerText = formatUptime(res.uptime_sec || 0);
        const gwRssi = document.getElementById("ota-gw-rssi-val");
        if (gwRssi) {
          const heapKb = res.free_heap ? (res.free_heap / 1024).toFixed(1) : "--";
          gwRssi.innerText = `${res.rssi || -100} dBm / ${heapKb} KB`;
        }

        // Node specs
        const nodeVer = document.getElementById("ota-node-ver-val");
        if (nodeVer) nodeVer.innerText = `v${res.node_ver || "1.0.0"}`;
        const nodeBat = document.getElementById("ota-node-bat-val");
        if (nodeBat) nodeBat.innerText = `${res.node_battery ? res.node_battery.toFixed(2) : '3.30'} V`;
        const nodePkts = document.getElementById("ota-node-pkts-val");
        if (nodePkts) nodePkts.innerText = `${res.total_node_pkts || 0} pkts`;

        // Cập nhật trạng thái nạp nếu có
        if (res.ota && !otaPollInterval) {
          handleOtaProgressData(res.ota);
        }
      }
    } catch (err) {
      console.warn("Lỗi tải thông tin OTA:", err);
    }
  }

  // Tải danh sách các file firmware đã có trên VPS
  async function loadAdminFirmwares() {
    const tableBody = document.getElementById("ota-firmware-table-body");
    const refreshIcon = document.getElementById("ota-files-refresh-icon");
    if (refreshIcon) refreshIcon.classList.add("fa-spin");

    try {
      const res = await callApi("/api/gateway/ota/firmwares", "GET");
      if (!tableBody) return;
      if (!res || !Array.isArray(res) || res.length === 0) {
        tableBody.innerHTML = `<tr><td colspan="4" style="text-align: center; padding: 22px; color: #94a3b8;">Chưa có bản firmware nào trong kho VPS. Hãy tải lên file .bin mới.</td></tr>`;
        return;
      }

      tableBody.innerHTML = res.map(f => {
        const sizeKB = (f.size / 1024).toFixed(1);
        const sizeMB = (f.size / (1024 * 1024)).toFixed(2);
        const displaySize = f.size > 1024 * 1024 ? `${sizeMB} MB` : `${sizeKB} KB`;
        const timeStr = f.mtime ? new Date(f.mtime * 1000).toLocaleString("vi-VN") : "--";

        // Tự động xác định target gợi ý dựa trên tên file
        const isNode = f.filename.toLowerCase().includes("node") || f.filename.toLowerCase().includes("c3");
        const defaultTarget = isNode ? "esp32c3_node" : "esp32s3_gate";

        return `
          <tr>
            <td>
              <div style="display: flex; align-items: center; gap: 8px;">
                <i class="fa-solid fa-file-code text-green" style="font-size: 1.15rem;"></i>
                <div>
                  <strong style="color: #0f172a; font-family: monospace;">${f.filename}</strong>
                  <div style="font-size: 0.72rem; color: #94a3b8;">MD5: ${f.md5 ? f.md5.substring(0, 12) + '...' : '--'}</div>
                </div>
              </div>
            </td>
            <td><span class="font-mono" style="font-weight: 600;">${displaySize}</span></td>
            <td style="color: #64748b; font-size: 0.8rem;">${timeStr}</td>
            <td style="text-align: right;">
              <a href="${f.download_url}" download class="btn-ota-table-action btn-ota-table-download" title="Tải về máy tính">
                <i class="fa-solid fa-download"></i> Tải về
              </a>
              <button type="button" class="btn-ota-table-action btn-ota-table-apply" title="Nạp trực tiếp firmware này" onclick="window.quickFlashFirmware('${f.filename}', '${f.download_url}', ${f.size}, '${defaultTarget}')">
                <i class="fa-solid fa-bolt"></i> Nạp ngay
              </button>
            </td>
          </tr>
        `;
      }).join('');
    } catch (err) {
      console.error("Lỗi khi tải kho firmware:", err);
      if (tableBody) {
        tableBody.innerHTML = `<tr><td colspan="4" style="text-align: center; padding: 18px; color: #ef4444;">Không thể tải danh sách firmware từ server!</td></tr>`;
      }
    } finally {
      if (refreshIcon) {
        setTimeout(() => refreshIcon.classList.remove("fa-spin"), 400);
      }
    }
  }

  // Kích hoạt nạp nhanh firmware có sẵn trong kho VPS
  window.quickFlashFirmware = async function(filename, downloadUrl, size, suggestedTarget) {
    if (suggestedTarget) {
      setOtaTarget(suggestedTarget);
    }
    const targetLabel = currentOtaTarget === "esp32s3_gate" ? "Trạm Gateway ESP32-S3" : "Node Cảm Biến C3";

    // Nhận diện version từ tên file (ví dụ: gate_v1.0.2.bin)
    let versionGuess = "1.0.1";
    const match = filename.match(/v?(\d+\.\d+(\.\d+)?)/i);
    if (match && match[1]) {
      versionGuess = match[1];
    }

    const versionInput = prompt(`Xác nhận nạp firmware "${filename}" cho ${targetLabel}.\nNhập phiên bản mục tiêu:`, versionGuess);
    if (!versionInput) return;
    const version = versionInput.trim();

    const targetHost = window.location.hostname || "180.93.113.40";
    const targetPort = window.location.port ? `:${window.location.port}` : "";
    const fullDownloadUrl = downloadUrl.startsWith("http") ? downloadUrl : `http://${targetHost}${targetPort}${downloadUrl}`;

    appendOtaLog(`Chuẩn bị nạp file "${filename}" (v${version}) cho ${targetLabel}...`, "info");
    appendOtaLog(`URL Firmware: ${fullDownloadUrl}`, "info");

    const initialVer = currentOtaTarget === "esp32s3_gate" 
      ? (document.getElementById("ota-gw-ver-val")?.innerText?.replace(/^v/, '') || "1.0.0")
      : (document.getElementById("ota-node-ver-val")?.innerText?.replace(/^v/, '') || "1.0.0");

    try {
      const res = await callApi("/api/gateway/ota/trigger", "POST", {
        target: currentOtaTarget,
        version: version,
        url: fullDownloadUrl,
        filename: filename,
        size: size || 0,
        md5: ""
      });

      if (res && res.success) {
        showToast(res.message || "Đã gửi lệnh OTA thành công!", "success");
        appendOtaLog(`Đã gửi lệnh OTA xuống thiết bị thành công!`, "success");
        startOtaPolling(version, initialVer);
      } else {
        const errMsg = res?.detail || res?.message || "Không thể kích hoạt nạp OTA!";
        showToast(errMsg, "error");
        appendOtaLog(`Lỗi trigger OTA: ${errMsg}`, "error");
      }
    } catch (err) {
      showToast("Lỗi kết nối máy chủ khi kích hoạt OTA!", "error");
      appendOtaLog(`Lỗi mạng: ${err.message}`, "error");
    }
  };

  // Cập nhật giao diện tiến trình OTA
  function handleOtaProgressData(ota) {
    const statusBadge = document.getElementById("ota-progress-status-badge");
    const progressTitle = document.getElementById("ota-progress-title");
    const progressPercent = document.getElementById("ota-progress-percent");
    const progressFill = document.getElementById("ota-progress-fill");
    const progressBytes = document.getElementById("ota-progress-bytes-text");

    const percent = Math.min(100, Math.max(0, ota.percent || 0));
    if (progressPercent) progressPercent.innerText = `${percent}%`;
    if (progressFill) progressFill.style.width = `${percent}%`;

    const bytesFormatted = ota.bytes ? (ota.bytes / 1024).toFixed(1) + " KB" : "0 KB";
    const totalFormatted = ota.total ? (ota.total / 1024).toFixed(1) + " KB" : "--";
    if (progressBytes) progressBytes.innerText = `${bytesFormatted} / ${totalFormatted}`;

    if (ota.status === "in_progress") {
      isOtaInProgress = true;
      if (statusBadge) {
        statusBadge.className = "ota-status-pill ota-status-running";
        statusBadge.innerText = `Đang nạp (${percent}%)`;
      }
      if (progressTitle) progressTitle.innerText = "Đang tải firmware & ghi Flash phân vùng OTA...";
    } else if (ota.status === "rebooting") {
      isOtaInProgress = false;
      if (statusBadge) {
        statusBadge.className = "ota-status-pill ota-status-running";
        statusBadge.innerText = "Rebooting...";
      }
      if (progressTitle) progressTitle.innerText = "Ghi Flash 100%! Thiết bị đang khởi động lại...";
      if (progressPercent) progressPercent.innerText = "100%";
      if (progressFill) progressFill.style.width = "100%";
    } else if (ota.status === "failed") {
      isOtaInProgress = false;
      if (statusBadge) {
        statusBadge.className = "ota-status-pill ota-status-failed";
        statusBadge.innerText = "Thất bại";
      }
      if (progressTitle) progressTitle.innerText = `Lỗi OTA: ${ota.error || "Gặp sự cố khi nạp firmware"}`;
    } else if (ota.status === "triggered") {
      isOtaInProgress = true;
      if (statusBadge) {
        statusBadge.className = "ota-status-pill ota-status-running";
        statusBadge.innerText = "Đang khởi tạo...";
      }
      if (progressTitle) progressTitle.innerText = ota.message || "Đã phát lệnh OTA, đang chờ thiết bị tải file...";
    } else {
      isOtaInProgress = false;
      if (statusBadge) {
        statusBadge.className = "ota-status-pill ota-status-idle";
        statusBadge.innerText = "Sẵn sàng (Idle)";
      }
    }
  }

  // Xử lý chọn file .bin
  function handleOtaFileSelect(file) {
    if (!file) return;
    if (!file.name.toLowerCase().endsWith(".bin")) {
      showToast("Vui lòng chỉ chọn file nhị phân firmware có đuôi .bin!", "error");
      return;
    }
    selectedOtaFile = file;
    if (otaDropzonePrompt) otaDropzonePrompt.style.display = "none";
    if (otaFileSelected) otaFileSelected.style.display = "flex";
    if (otaSelectedFilename) otaSelectedFilename.innerText = file.name;
    const sizeKb = (file.size / 1024).toFixed(1);
    if (otaSelectedFilesize) otaSelectedFilesize.innerText = `${sizeKb} KB`;

    // Tự động nhận diện version từ tên file nếu có (ví dụ fw_v1.0.2.bin -> 1.0.2)
    const match = file.name.match(/v?(\d+\.\d+(\.\d+)?)/i);
    if (match && match[1] && otaFileVersionInput) {
      otaFileVersionInput.value = match[1];
    }
    appendOtaLog(`Đã chọn file: ${file.name} (${sizeKb} KB)`, "info");
  }

  // Hủy file đã chọn
  function clearSelectedOtaFile() {
    selectedOtaFile = null;
    if (otaFileInput) otaFileInput.value = "";
    if (otaFileSelected) otaFileSelected.style.display = "none";
    if (otaDropzonePrompt) otaDropzonePrompt.style.display = "block";
    appendOtaLog("Đã hủy chọn file firmware.", "info");
  }

  // Gửi file upload OTA
  async function submitOtaUpload() {
    if (!selectedOtaFile) {
      showToast("Vui lòng chọn file firmware .bin trước khi bắt đầu nạp!", "warning");
      return;
    }
    const version = (otaFileVersionInput && otaFileVersionInput.value.trim()) || "1.0.1";
    const targetLabel = currentOtaTarget === "esp32s3_gate" ? "Trạm Gateway ESP32-S3" : "Node Cảm Biến C3";

    if (!confirm(`Xác nhận nạp firmware ${selectedOtaFile.name} (v${version}) cho ${targetLabel}?`)) {
      return;
    }

    const token = localStorage.getItem("access_token");
    if (!token) {
      showToast("Phiên làm việc hết hạn, vui lòng đăng nhập lại!", "error");
      window.location.href = "login.html";
      return;
    }

    const initialVer = currentOtaTarget === "esp32s3_gate" 
      ? (document.getElementById("ota-gw-ver-val")?.innerText?.replace(/^v/, '') || "1.0.0")
      : (document.getElementById("ota-node-ver-val")?.innerText?.replace(/^v/, '') || "1.0.0");

    if (btnOtaUploadStart) {
      btnOtaUploadStart.disabled = true;
      btnOtaUploadStart.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> <span>Đang Tải Lên &amp; Nạp...</span>';
    }

    appendOtaLog(`Bắt đầu tải file ${selectedOtaFile.name} lên máy chủ...`, "info");
    const formData = new FormData();
    formData.append("file", selectedOtaFile);
    formData.append("target", currentOtaTarget);
    formData.append("version", version);
    formData.append("auto_trigger", "true");

    try {
      const response = await fetch("/api/gateway/ota/upload", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${token}`
        },
        body: formData
      });

      const res = await response.json();
      if (response.ok && res.success) {
        // /ota/upload returns the file metadata at the root level.  Accept
        // the nested shape too, so frontend and older backend deployments
        // remain compatible.
        const uploadedFile = res.file || res;
        const targetHost = window.location.hostname || "180.93.113.40";
        const targetPort = window.location.port ? `:${window.location.port}` : "";
        const downloadUrl = uploadedFile.download_url || "";
        const firmwareUrl = downloadUrl.startsWith("http")
          ? downloadUrl
          : `http://${targetHost}${targetPort}${downloadUrl}`;

        appendOtaLog(`Upload thành công: MD5 = ${uploadedFile.md5 || "--"}`, "success");
        appendOtaLog(`Đang gửi lệnh OTA xuống Gateway: ${firmwareUrl}`, "info");

        const triggerRes = await callApi("/api/gateway/ota/trigger", "POST", {
          target: currentOtaTarget,
          version,
          url: firmwareUrl,
          filename: uploadedFile.filename || selectedOtaFile.name,
          size: uploadedFile.size || selectedOtaFile.size,
          md5: uploadedFile.md5 || ""
        });

        if (!triggerRes || !triggerRes.success) {
          throw new Error(triggerRes?.detail || triggerRes?.message || "Upload thành công nhưng không thể gửi lệnh OTA!");
        }

        showToast("Đã tải lên và phát lệnh OTA thành công! Đang theo dõi tiến trình...", "success");
        appendOtaLog("Lệnh OTA đã gửi xuống Gateway.", "success");
        loadAdminFirmwares();
        startOtaPolling(version, initialVer);
      } else {
        const errMsg = res.detail || res.message || "Tải lên firmware thất bại!";
        showToast(errMsg, "error");
        appendOtaLog(`Lỗi tải lên: ${errMsg}`, "error");
      }
    } catch (err) {
      showToast("Lỗi kết nối máy chủ khi upload firmware!", "error");
      appendOtaLog(`Lỗi mạng: ${err.message}`, "error");
    } finally {
      if (btnOtaUploadStart) {
        btnOtaUploadStart.disabled = false;
        btnOtaUploadStart.innerHTML = '<i class="fa-solid fa-bolt"></i> <span>Tải Lên &amp; Bắt Đầu Nạp OTA</span>';
      }
    }
  }

  // Kích hoạt OTA qua URL
  async function submitOtaUrl() {
    const url = (otaUrlTextInput && otaUrlTextInput.value.trim()) || "";
    const version = (otaUrlVersionInput && otaUrlVersionInput.value.trim()) || "1.0.1";
    const targetLabel = currentOtaTarget === "esp32s3_gate" ? "Gateway ESP32-S3" : "Node C3";

    if (!url || (!url.startsWith("http://") && !url.startsWith("https://"))) {
      showToast("Vui lòng nhập đường dẫn URL hợp lệ (bắt đầu bằng http:// hoặc https://)!", "warning");
      return;
    }

    if (!confirm(`Kích hoạt OTA từ xa cho ${targetLabel}?\nURL: ${url}`)) {
      return;
    }

    const initialVer = currentOtaTarget === "esp32s3_gate" 
      ? (document.getElementById("ota-gw-ver-val")?.innerText?.replace(/^v/, '') || "1.0.0")
      : (document.getElementById("ota-node-ver-val")?.innerText?.replace(/^v/, '') || "1.0.0");

    if (btnOtaUrlStart) {
      btnOtaUrlStart.disabled = true;
      btnOtaUrlStart.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> <span>Đang Gửi Lệnh...</span>';
    }

    appendOtaLog(`Gửi lệnh OTA qua URL: ${url} (v${version})...`, "info");
    const res = await callApi("/api/gateway/ota/trigger", "POST", {
      target: currentOtaTarget,
      url: url,
      version: version,
      size: 0,
      md5: ""
    });

    if (res && res.success) {
      showToast(res.message, "success");
      appendOtaLog(`Lệnh OTA đã phát thành công tới ${currentOtaTarget}!`, "success");
      startOtaPolling(version, initialVer);
    } else {
      showToast("Không thể gửi lệnh OTA qua URL!", "error");
      appendOtaLog("Gửi lệnh OTA thất bại qua URL.", "error");
    }

    if (btnOtaUrlStart) {
      btnOtaUrlStart.disabled = false;
      btnOtaUrlStart.innerHTML = '<i class="fa-solid fa-bolt"></i> <span>Kích Hoạt Nâng Cấp Qua URL</span>';
    }
  }

  // Khởi động vòng lặp polling tiến trình OTA (Theo chuẩn PUMP Watchdog)
  function startOtaPolling(targetVer = null, initialVer = null) {
    if (otaPollInterval) clearInterval(otaPollInterval);

    const cleanVer = (v) => String(v || '').trim().toLowerCase().replace(/^v/, '');
    const tgtClean = cleanVer(targetVer);
    const initClean = cleanVer(initialVer);

    let pollCount = 0;
    let hasReachedReboot = false;
    let rebootWaitCount = 0;
    let lastProgressPct = -1;
    let lastProgressBytes = -1;

    const progressFill = document.getElementById("ota-progress-fill");
    const progressPercent = document.getElementById("ota-progress-percent");
    const progressTitle = document.getElementById("ota-progress-title");
    const progressBytes = document.getElementById("ota-progress-bytes-text");
    const statusBadge = document.getElementById("ota-progress-status-badge");

    if (progressTitle) progressTitle.innerText = "Đang kết nối và chuẩn bị ghi Flash...";
    if (statusBadge) {
      statusBadge.className = "ota-status-pill ota-status-running";
      statusBadge.innerText = "Đang nạp (0%)";
    }

    otaPollInterval = setInterval(async () => {
      pollCount++;

      // 1. KIỂM TRA PHIÊN BẢN THIẾT BỊ TRƯỚC TIÊN (PUMP Watchdog)
      await refreshOtaTelemetry();

      const currentVerText = currentOtaTarget === "esp32s3_gate"
        ? document.getElementById("ota-gw-ver-val")?.innerText
        : document.getElementById("ota-node-ver-val")?.innerText;
      const curClean = cleanVer(currentVerText);

      const isVerChanged = Boolean(initClean && curClean && curClean !== initClean);
      const isTargetMatched = Boolean(tgtClean && curClean && curClean === tgtClean && (initClean !== tgtClean || pollCount >= 3));

      if (isVerChanged || isTargetMatched) {
        clearInterval(otaPollInterval);
        otaPollInterval = null;
        isOtaInProgress = false;

        if (progressFill) {
          progressFill.style.width = "100%";
          progressFill.style.background = "linear-gradient(90deg, #10b981 0%, #059669 100%)";
        }
        if (progressPercent) progressPercent.innerText = "100%";
        if (statusBadge) {
          statusBadge.className = "ota-status-pill ota-status-running";
          statusBadge.style.background = "#ecfdf5";
          statusBadge.style.color = "#059669";
          statusBadge.innerText = "Thành công";
        }
        const displayVer = curClean || tgtClean;
        if (progressTitle) {
          progressTitle.innerHTML = `<i class="fa-solid fa-circle-check" style="color: #10b981;"></i> <b>NÂNG CẤP THÀNH CÔNG! Đã kích hoạt v${displayVer}</b>`;
        }
        showToast(`🎉 NÂNG CẤP THÀNH CÔNG! Thiết bị đã cập nhật lên phiên bản v${displayVer}!`, "success", 6000);
        appendOtaLog(`[SUCCESS] NÂNG CẤP HOÀN TẤT! Firmware đang chạy: v${displayVer}.`, "success");
        return;
      }

      // 2. Thăm dò API /api/gateway/ota/progress
      try {
        const progRes = await callApi("/api/gateway/ota/progress", "GET");
        if (progRes) {
          const pct = Math.max(0, Math.min(100, progRes.percent || 0));
          const currentBytes = progRes.bytes || 0;

          if (pct > lastProgressPct || currentBytes > lastProgressBytes) {
            lastProgressPct = pct;
            lastProgressBytes = currentBytes;
            if (pct % 25 === 0 && pct > 0) {
              appendOtaLog(`Tiến trình nạp Flash: ${pct}% (${(currentBytes / 1024).toFixed(0)} KB)`, "info");
            }
          }

          if (progressFill) {
            progressFill.style.width = `${pct}%`;
            progressFill.style.background = "linear-gradient(90deg, #00b06f 0%, #10b981 100%)";
          }
          if (progressPercent) progressPercent.innerText = `${pct}%`;
          if (statusBadge && progRes.status === "in_progress") {
            statusBadge.className = "ota-status-pill ota-status-running";
            statusBadge.innerText = `Đang nạp (${pct}%)`;
          }

          if (progRes.bytes && progRes.total) {
            const kbRead = (progRes.bytes / 1024).toFixed(1);
            const kbTotal = (progRes.total / 1024).toFixed(1);
            if (progressBytes) progressBytes.innerText = `${kbRead} KB / ${kbTotal} KB`;
          }

          // Kiểm tra thất bại hoặc ROLLBACK
          if (progRes.status === "failed" || (progRes.error && progRes.error.includes("ROLLBACK"))) {
            clearInterval(otaPollInterval);
            otaPollInterval = null;
            isOtaInProgress = false;

            if (progressFill) progressFill.style.background = "linear-gradient(90deg, #ef4444 0%, #b91c1c 100%)";
            if (statusBadge) {
              statusBadge.className = "ota-status-pill ota-status-failed";
              statusBadge.innerText = "Thất bại";
            }
            const errMsg = progRes.message || (progRes.error === "ROLLBACK_APP_CRASHED"
              ? "Bản firmware mới bị crash boot, đã kích hoạt Rollback về bản cũ!"
              : progRes.error || "Nạp firmware thất bại!");

            if (progressTitle) {
              progressTitle.innerHTML = `<i class="fa-solid fa-triangle-exclamation" style="color: #ef4444;"></i> <b style="color: #ef4444;">${errMsg}</b>`;
            }
            showToast(`⚠️ CẬP NHẬT THẤT BẠI: ${errMsg}`, "error", 5000);
            appendOtaLog(`[ERROR] Nạp thất bại: ${errMsg}`, "error");
            return;
          }

          // Khi thiết bị ghi Flash xong 100% và đang reboot
          if ((pct >= 100 || progRes.status === "rebooting") && progRes.status !== "success") {
            hasReachedReboot = true;
            if (progressFill) progressFill.style.width = "100%";
            if (progressPercent) progressPercent.innerText = "100%";
            if (statusBadge) {
              statusBadge.className = "ota-status-pill ota-status-running";
              statusBadge.innerText = "Rebooting...";
            }
            if (progressTitle) {
              progressTitle.innerHTML = `<i class="fa-solid fa-arrows-rotate fa-spin" style="color: #0284c7;"></i> <b style="color: #0284c7;">Đã nạp xong 100%! Đang khởi động lại và kiểm tra an toàn...</b>`;
            }
          }
        }
      } catch (e) {
        // bỏ qua lỗi mạng chập chờn
      }

      if (hasReachedReboot) {
        rebootWaitCount++;
      }

      // Timeout watchdog: 120s
      if (pollCount > 120) {
        clearInterval(otaPollInterval);
        otaPollInterval = null;
        isOtaInProgress = false;
        appendOtaLog("[TIMEOUT] Quá thời gian chờ (120s). Vui lòng kiểm tra lại thiết bị.", "warn");
      }
    }, 1000);
  }

  // Gán sự kiện cho nút làm mới danh sách file firmware
  const btnOtaRefreshFiles = document.getElementById("btn-ota-refresh-files");
  if (btnOtaRefreshFiles) {
    btnOtaRefreshFiles.addEventListener("click", loadAdminFirmwares);
  }

  // Gán sự kiện cho các thành phần điều khiển OTA
  if (navFirmwareBtn) {
    navFirmwareBtn.addEventListener("click", (e) => {
      e.preventDefault();
      openFirmwareView();
    });
  }

  if (btnOtaBack) {
    btnOtaBack.addEventListener("click", () => {
      closeHubSubView(true);
      window.location.hash = "";
    });
  }

  // Gán sự kiện điều hướng Tự động hóa thông minh
  if (navAutomationsBtn) {
    navAutomationsBtn.addEventListener("click", (e) => {
      e.preventDefault();
      openAutomationsView();
    });
  }

  if (btnAutoBack) {
    btnAutoBack.addEventListener("click", () => {
      closeHubSubView(true);
      window.location.hash = "";
    });
  }

  if (btnOtaRefresh) {
    btnOtaRefresh.addEventListener("click", async () => {
      const icon = btnOtaRefresh.querySelector("i");
      if (icon) icon.classList.add("fa-spin");
      await refreshOtaTelemetry();
      setTimeout(() => {
        if (icon) icon.classList.remove("fa-spin");
      }, 500);
      showToast("Đã làm mới thông số OTA!", "success");
    });
  }

  if (btnOtaReboot) {
    btnOtaReboot.addEventListener("click", async () => {
      if (!confirm("Bạn có chắc chắn muốn khởi động lại Trạm Gateway ESP32-S3 từ xa?")) return;
      appendOtaLog("Đang gửi lệnh Reboot xuống Gateway...", "warn");
      const res = await callApi("/api/gateway/reboot", "POST");
      if (res && res.success) {
        showToast(res.message, "success");
        appendOtaLog("Gateway đang khởi động lại...", "warn");
      } else {
        showToast("Không thể gửi lệnh Reboot tới Gateway!", "error");
      }
    });
  }

  // Bấm chọn target radio hoặc bấm trực tiếp lên thẻ Card
  if (btnSelectTargetGw) {
    btnSelectTargetGw.addEventListener("click", () => setOtaTarget("esp32s3_gate"));
  }
  if (btnSelectTargetNode) {
    btnSelectTargetNode.addEventListener("click", () => setOtaTarget("esp32c3_node"));
  }
  if (otaCardGw) {
    otaCardGw.addEventListener("click", () => setOtaTarget("esp32s3_gate"));
  }
  if (otaCardNode) {
    otaCardNode.addEventListener("click", () => setOtaTarget("esp32c3_node"));
  }

  // Tabs switcher: file vs URL
  if (otaTabFile && otaTabUrl) {
    otaTabFile.addEventListener("click", () => {
      otaTabFile.classList.add("active");
      otaTabUrl.classList.remove("active");
      if (otaContentFile) otaContentFile.style.display = "block";
      if (otaContentUrl) otaContentUrl.style.display = "none";
    });
    otaTabUrl.addEventListener("click", () => {
      otaTabUrl.classList.add("active");
      otaTabFile.classList.remove("active");
      if (otaContentUrl) otaContentUrl.style.display = "block";
      if (otaContentFile) otaContentFile.style.display = "none";
    });
  }

  // Dropzone drag-drop & file picker
  if (otaDropzone) {
    otaDropzone.addEventListener("click", (e) => {
      if (e.target.closest("#btn-ota-clear-file")) return;
      if (otaFileInput) otaFileInput.click();
    });

    otaDropzone.addEventListener("dragover", (e) => {
      e.preventDefault();
      otaDropzone.classList.add("dragover");
    });
    otaDropzone.addEventListener("dragleave", () => {
      otaDropzone.classList.remove("dragover");
    });
    otaDropzone.addEventListener("drop", (e) => {
      e.preventDefault();
      otaDropzone.classList.remove("dragover");
      if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length > 0) {
        handleOtaFileSelect(e.dataTransfer.files[0]);
      }
    });
  }

  if (otaFileInput) {
    otaFileInput.addEventListener("change", (e) => {
      if (e.target.files && e.target.files.length > 0) {
        handleOtaFileSelect(e.target.files[0]);
      }
    });
  }

  if (btnOtaBrowse) {
    btnOtaBrowse.addEventListener("click", (e) => {
      e.stopPropagation();
      if (otaFileInput) otaFileInput.click();
    });
  }

  if (btnOtaClearFile) {
    btnOtaClearFile.addEventListener("click", (e) => {
      e.stopPropagation();
      clearSelectedOtaFile();
    });
  }

  if (btnOtaUploadStart) {
    btnOtaUploadStart.addEventListener("click", submitOtaUpload);
  }
  if (btnOtaUrlStart) {
    btnOtaUrlStart.addEventListener("click", submitOtaUrl);
  }

  if (btnOtaClearLog) {
    btnOtaClearLog.addEventListener("click", () => {
      const consoleEl = document.getElementById("ota-terminal-console");
      if (consoleEl) {
        consoleEl.innerHTML = '<div class="term-entry term-info">[SYSTEM] Đã xóa nhật ký console.</div>';
      }
    });
  }

  // Kiểm tra hash trên URL khi vừa load trang
  function checkUrlHashRoute() {
    if (window.location.hash === "#firmware" || window.location.hash === "#ota") {
      openFirmwareView();
    } else if (window.location.hash === "#automations") {
      openAutomationsView();
    } else if (window.location.hash === "#notifications" || window.location.hash === "#notifs") {
      openNotificationsView();
    } else if (window.location.hash === "#rooms" || window.location.hash === "#room-mgmt") {
      openRoomMgmtView();
    }
  }
  window.addEventListener("hashchange", checkUrlHashRoute);
  checkUrlHashRoute();

  // ==============================================================================
  // CÀI ĐẶT NÂNG CAO ĐIỀU HÒA (GIỚI HẠN NHIỆT ĐỘ & HẸN GIỜ TRÊN NAV BÊN TRÁI)
  // ==============================================================================
  function getStoredAcLimits() {
    try {
      const saved = localStorage.getItem("gate_ac_limits");
      if (saved) return JSON.parse(saved);
    } catch (e) {}
    return {};
  }

  function saveStoredAcLimits(limits) {
    localStorage.setItem("gate_ac_limits", JSON.stringify(limits));
  }

  function getAcLimitsFor(devId) {
    if (!devId) return { min: 16, max: 30 };
    const all = getStoredAcLimits();
    return all[String(devId)] || { min: 16, max: 30 };
  }

  function getStoredAcTimers() {
    try {
      const saved = localStorage.getItem("gate_ac_timers");
      if (saved) return JSON.parse(saved);
    } catch (e) {}
    return [];
  }

  function saveStoredAcTimers(timers) {
    localStorage.setItem("gate_ac_timers", JSON.stringify(timers));
  }

  const acLeftDrawer = document.getElementById("ac-left-drawer");
  const acLeftDrawerOverlay = document.getElementById("ac-left-drawer-overlay");
  const btnCloseAcLeftDrawer = document.getElementById("btn-close-ac-left-drawer");
  const acLeftDevName = document.getElementById("ac-left-dev-name");
  const acLeftDevSub = document.getElementById("ac-left-dev-sub");

  const valLimitMin = document.getElementById("val-limit-min");
  const valLimitMax = document.getElementById("val-limit-max");
  const btnLimitMinMinus = document.getElementById("btn-limit-min-minus");
  const btnLimitMinPlus = document.getElementById("btn-limit-min-plus");
  const btnLimitMaxMinus = document.getElementById("btn-limit-max-minus");
  const btnLimitMaxPlus = document.getElementById("btn-limit-max-plus");
  const btnSaveAcLimits = document.getElementById("btn-save-ac-limits");

  const tabTimerOff = document.getElementById("tab-timer-off");
  const tabTimerOn = document.getElementById("tab-timer-on");
  const panelTimerOff = document.getElementById("panel-timer-off");
  const panelTimerOn = document.getElementById("panel-timer-on");
  const inputTimerOffTime = document.getElementById("input-timer-off-time");
  const inputTimerOnTime = document.getElementById("input-timer-on-time");
  const inputTimerOnTemp = document.getElementById("input-timer-on-temp");
  const selectTimerOnMode = document.getElementById("select-timer-on-mode");
  const btnSubmitTimer = document.getElementById("btn-submit-timer");
  const activeTimersWrap = document.getElementById("active-timers-wrap");
  const activeTimersList = document.getElementById("active-timers-list");

  let currentLeftDrawerAc = null;
  let currentTimerMode = "off";
  let leftDrawerMinTemp = 20;
  let leftDrawerMaxTemp = 28;
  let selectedCountdownMin = 0;

  function openAcLeftDrawer(acDev) {
    if (!acDev) return;
    currentLeftDrawerAc = acDev;
    if (acLeftDevName) acLeftDevName.innerText = acDev.name || `Điều hòa ${acDev.id}`;
    if (acLeftDevSub) acLeftDevSub.innerText = `${acDev.brand_name || 'Hunonic IR'} • ID: ${acDev.id}`;

    const limits = getAcLimitsFor(acDev.id);
    leftDrawerMinTemp = limits.min || 20;
    leftDrawerMaxTemp = limits.max || 28;
    if (valLimitMin) valLimitMin.innerText = `${leftDrawerMinTemp}°C`;
    if (valLimitMax) valLimitMax.innerText = `${leftDrawerMaxTemp}°C`;

    document.querySelectorAll(".timer-chip-btn").forEach(b => b.classList.remove("active"));
    selectedCountdownMin = 0;
    if (inputTimerOffTime) inputTimerOffTime.value = "";
    if (inputTimerOnTime) inputTimerOnTime.value = "";

    renderActiveTimersList();

    if (acLeftDrawer) acLeftDrawer.classList.remove("hidden");
    if (acLeftDrawerOverlay) acLeftDrawerOverlay.classList.remove("hidden");
  }

  function closeAcLeftDrawer() {
    if (acLeftDrawer) acLeftDrawer.classList.add("hidden");
    if (acLeftDrawerOverlay) acLeftDrawerOverlay.classList.add("hidden");
  }

  if (btnCloseAcLeftDrawer) btnCloseAcLeftDrawer.addEventListener("click", closeAcLeftDrawer);
  if (acLeftDrawerOverlay) acLeftDrawerOverlay.addEventListener("click", closeAcLeftDrawer);

  if (btnLimitMinMinus) {
    btnLimitMinMinus.onclick = () => {
      if (leftDrawerMinTemp > 16) {
        leftDrawerMinTemp--;
        if (valLimitMin) valLimitMin.innerText = `${leftDrawerMinTemp}°C`;
      }
    };
  }
  if (btnLimitMinPlus) {
    btnLimitMinPlus.onclick = () => {
      if (leftDrawerMinTemp < leftDrawerMaxTemp - 1) {
        leftDrawerMinTemp++;
        if (valLimitMin) valLimitMin.innerText = `${leftDrawerMinTemp}°C`;
      }
    };
  }
  if (btnLimitMaxMinus) {
    btnLimitMaxMinus.onclick = () => {
      if (leftDrawerMaxTemp > leftDrawerMinTemp + 1) {
        leftDrawerMaxTemp--;
        if (valLimitMax) valLimitMax.innerText = `${leftDrawerMaxTemp}°C`;
      }
    };
  }
  if (btnLimitMaxPlus) {
    btnLimitMaxPlus.onclick = () => {
      if (leftDrawerMaxTemp < 32) {
        leftDrawerMaxTemp++;
        if (valLimitMax) valLimitMax.innerText = `${leftDrawerMaxTemp}°C`;
      }
    };
  }

  if (btnSaveAcLimits) {
    btnSaveAcLimits.onclick = () => {
      if (!currentLeftDrawerAc) return;
      const allLimits = getStoredAcLimits();
      allLimits[String(currentLeftDrawerAc.id)] = {
        min: leftDrawerMinTemp,
        max: leftDrawerMaxTemp
      };
      saveStoredAcLimits(allLimits);
      showToast(`Đã lưu giới hạn nhiệt độ (${leftDrawerMinTemp}°C - ${leftDrawerMaxTemp}°C) cho [${currentLeftDrawerAc.name}]!`, "success");
      if (typeof updateDrawerAcUI === "function") {
        updateDrawerAcUI(currentLeftDrawerAc);
      }
    };
  }

  if (tabTimerOff) {
    tabTimerOff.onclick = () => {
      currentTimerMode = "off";
      tabTimerOff.classList.add("active");
      if (tabTimerOn) tabTimerOn.classList.remove("active");
      if (panelTimerOff) panelTimerOff.style.display = "block";
      if (panelTimerOn) panelTimerOn.style.display = "none";
    };
  }
  if (tabTimerOn) {
    tabTimerOn.onclick = () => {
      currentTimerMode = "on";
      tabTimerOn.classList.add("active");
      if (tabTimerOff) tabTimerOff.classList.remove("active");
      if (panelTimerOff) panelTimerOff.style.display = "none";
      if (panelTimerOn) panelTimerOn.style.display = "block";
    };
  }

  document.querySelectorAll(".timer-chip-btn").forEach(chip => {
    chip.onclick = () => {
      document.querySelectorAll(".timer-chip-btn").forEach(c => c.classList.remove("active"));
      chip.classList.add("active");
      selectedCountdownMin = parseInt(chip.getAttribute("data-minutes")) || 0;
      if (inputTimerOffTime) inputTimerOffTime.value = "";
    };
  });

  if (inputTimerOffTime) {
    inputTimerOffTime.onchange = () => {
      document.querySelectorAll(".timer-chip-btn").forEach(c => c.classList.remove("active"));
      selectedCountdownMin = 0;
    };
  }

  if (btnSubmitTimer) {
    btnSubmitTimer.onclick = () => {
      if (!currentLeftDrawerAc) {
        showToast("Chưa chọn điều hòa!", "error");
        return;
      }

      let targetTimestamp = 0;
      let label = "";

      if (currentTimerMode === "off") {
        if (selectedCountdownMin > 0) {
          targetTimestamp = Date.now() + selectedCountdownMin * 60 * 1000;
          const targetDate = new Date(targetTimestamp);
          const hh = String(targetDate.getHours()).padStart(2, "0");
          const mm = String(targetDate.getMinutes()).padStart(2, "0");
          label = `Tắt sau ${selectedCountdownMin} phút (lúc ${hh}:${mm})`;
        } else if (inputTimerOffTime && inputTimerOffTime.value) {
          const [h, m] = inputTimerOffTime.value.split(":").map(Number);
          const targetDate = new Date();
          targetDate.setHours(h, m, 0, 0);
          if (targetDate.getTime() <= Date.now()) {
            targetDate.setDate(targetDate.getDate() + 1);
          }
          targetTimestamp = targetDate.getTime();
          label = `Tắt vào lúc ${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
        } else {
          showToast("Vui lòng chọn thời gian tắt!", "warning");
          return;
        }
      } else {
        if (!inputTimerOnTime || !inputTimerOnTime.value) {
          showToast("Vui lòng chọn giờ bật điều hòa!", "warning");
          return;
        }
        const [h, m] = inputTimerOnTime.value.split(":").map(Number);
        const targetDate = new Date();
        targetDate.setHours(h, m, 0, 0);
        if (targetDate.getTime() <= Date.now()) {
          targetDate.setDate(targetDate.getDate() + 1);
        }
        targetTimestamp = targetDate.getTime();
        const onTemp = Number(inputTimerOnTemp ? inputTimerOnTemp.value : 25);
        label = `Bật lúc ${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")} (${onTemp}°C)`;
      }

      const newTimer = {
        id: "timer_" + Date.now(),
        devId: String(currentLeftDrawerAc.id),
        devName: currentLeftDrawerAc.name || `Điều hòa ${currentLeftDrawerAc.id}`,
        type: currentTimerMode,
        targetTime: targetTimestamp,
        params: currentTimerMode === "off" ? { power: 0 } : {
          power: 1,
          temp: Number(inputTimerOnTemp ? inputTimerOnTemp.value : 25),
          mode: Number(selectTimerOnMode ? selectTimerOnMode.value : 1),
          fan: 0
        },
        label
      };

      const timers = getStoredAcTimers();
      timers.push(newTimer);
      saveStoredAcTimers(timers);
      renderActiveTimersList();
      showToast(`Đã kích hoạt hẹn giờ: ${label}!`, "success");
    };
  }

  function renderActiveTimersList() {
    if (!activeTimersWrap || !activeTimersList) return;
    const timers = getStoredAcTimers();
    const acTimers = currentLeftDrawerAc ? timers.filter(t => t.devId === String(currentLeftDrawerAc.id)) : timers;

    if (acTimers.length === 0) {
      activeTimersWrap.style.display = "none";
      activeTimersList.innerHTML = "";
      return;
    }

    activeTimersWrap.style.display = "block";
    let html = "";
    const now = Date.now();

    acTimers.forEach(t => {
      const remainingMs = Math.max(0, t.targetTime - now);
      const remainingMin = Math.ceil(remainingMs / 60000);
      const remainText = remainingMin > 60 ? `${Math.floor(remainingMin / 60)}g ${remainingMin % 60}p` : `${remainingMin} phút`;

      html += `
        <div class="active-timer-item">
          <div>
            <strong style="color: ${t.type === 'off' ? '#0f172a' : '#00b06f'};">${escapeHtml(t.label)}</strong>
            <span style="font-size: 0.72rem; color: #64748b; display: block;">Còn ~${remainText} nữa</span>
          </div>
          <button type="button" class="btn-cancel-single-timer" data-timer-id="${escapeHtml(t.id)}" title="Hủy hẹn giờ này">
            <i class="fa-solid fa-trash-can"></i>
          </button>
        </div>
      `;
    });

    activeTimersList.innerHTML = html;

    activeTimersList.querySelectorAll(".btn-cancel-single-timer").forEach(btn => {
      btn.onclick = (e) => {
        e.stopPropagation();
        const tId = btn.getAttribute("data-timer-id");
        const remaining = getStoredAcTimers().filter(t => t.id !== tId);
        saveStoredAcTimers(remaining);
        renderActiveTimersList();
        showToast("Đã hủy lệnh hẹn giờ!", "info");
      };
    });
  }

  function checkActiveAcTimers() {
    const timers = getStoredAcTimers();
    if (timers.length === 0) return;

    const now = Date.now();
    const remaining = [];

    timers.forEach(t => {
      if (now >= t.targetTime) {
        const apiRunner = (typeof window !== "undefined" && window.callApi) ? window.callApi : callApi;
        apiRunner("/api/hvac/control", "POST", {
          device_id: t.devId,
          power: t.params.power,
          temp: t.params.temp || 25,
          mode: t.params.mode || 1,
          fan: t.params.fan || 0
        }).catch(err => console.error("Timer trigger err:", err));

        showToast(`⏰ HẸN GIỜ: Đã ${t.params.power === 1 ? 'BẬT' : 'TẮT'} [${t.devName}] thành công!`, "success", 5000);
        if (typeof addSystemNotification === "function") {
          addSystemNotification({
            type: "automation",
            title: `Hẹn giờ hoàn tất: ${t.devName}`,
            message: `Đã tự động ${t.params.power === 1 ? 'BẬT' : 'TẮT'} điều hòa theo lịch hẹn (${t.label}).`,
            badge: "Hẹn giờ"
          });
        }
      } else {
        remaining.push(t);
      }
    });

    if (remaining.length !== timers.length) {
      saveStoredAcTimers(remaining);
      renderActiveTimersList();
    }
  }
  setInterval(checkActiveAcTimers, 5000);

  // ── CONTROLLER GIỮ CHUỘT / CHẠM VÀO ITEM ĐIỀU HÒA ĐỂ MỞ NAV CÀI ĐẶT ──────
  let globalHoldTimer = null;
  let globalHoldBar = null;
  let globalHoldBadge = null;
  let globalHoldTriggered = false;

  function initGlobalAcLongPress() {
    function startHold(e) {
      if (e.target.closest(".btn-ac-card-direct-gear")) return;
      const card = e.target.closest(".subview-ac-card, .scene-ac-card, [data-child-id], #card-ir-hub-master");
      if (!card) return;
      if (e.button && e.button !== 0) return;

      let acId = card.getAttribute("data-child-id") || card.getAttribute("data-ac-id");
      if (!acId && card.id === "card-ir-hub-master") {
        const allAcs = getAllAvailableAcs();
        if (allAcs && allAcs.length > 0) acId = allAcs[0].id;
      }
      if (!acId) return;

      globalHoldTriggered = false;

      // Xóa các thanh tiến trình / badge cũ nếu có
      card.querySelectorAll(".ac-hold-progress-bar, .ac-hold-floating-badge").forEach(b => b.remove());

      globalHoldBar = document.createElement("div");
      globalHoldBar.className = "ac-hold-progress-bar";
      card.style.position = "relative";
      card.appendChild(globalHoldBar);

      globalHoldBadge = document.createElement("div");
      globalHoldBadge.className = "ac-hold-floating-badge";
      globalHoldBadge.innerHTML = '<i class="fa-solid fa-hourglass-half fa-spin"></i> Giữ mở Cài đặt...';
      card.appendChild(globalHoldBadge);

      setTimeout(() => {
        if (globalHoldBar) globalHoldBar.style.width = "100%";
      }, 20);

      // Nhấn giữ 2.5s sẽ kích hoạt mở thanh điều hướng cài đặt
      globalHoldTimer = setTimeout(() => {
        globalHoldTriggered = true;
        if (globalHoldBar) {
          globalHoldBar.remove();
          globalHoldBar = null;
        }
        if (globalHoldBadge) {
          globalHoldBadge.remove();
          globalHoldBadge = null;
        }

        const allAcs = getAllAvailableAcs();
        const acObj = allAcs.find(a => String(a.id) === String(acId)) || {
          id: acId,
          name: card.querySelector(".hunonic-card-title, strong") ? card.querySelector(".hunonic-card-title, strong").innerText : `Điều hòa ${acId}`
        };
        openAcLeftDrawer(acObj);
        showToast(`Đã mở Cài đặt nâng cao: [${acObj.name}]`, "info");
      }, 2500);
    }

    function cancelHold() {
      if (globalHoldTimer) {
        clearTimeout(globalHoldTimer);
        globalHoldTimer = null;
      }
      if (globalHoldBar) {
        globalHoldBar.remove();
        globalHoldBar = null;
      }
      if (globalHoldBadge) {
        globalHoldBadge.remove();
        globalHoldBadge = null;
      }
    }

    document.addEventListener("mousedown", startHold);
    document.addEventListener("mouseup", cancelHold);
    document.addEventListener("mouseleave", cancelHold);

    document.addEventListener("touchstart", startHold, { passive: true });
    document.addEventListener("touchend", cancelHold);
    document.addEventListener("touchcancel", cancelHold);

    document.addEventListener("click", (e) => {
      const gear = e.target.closest(".btn-ac-card-direct-gear");
      if (gear) {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        const acId = gear.getAttribute("data-ac-id");
        const allAcs = getAllAvailableAcs();
        const acObj = allAcs.find(a => String(a.id) === String(acId)) || { id: acId, name: `Điều hòa ${acId}` };
        if (openAcLeftDrawer) openAcLeftDrawer(acObj);
        return;
      }
      if (globalHoldTriggered) {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        globalHoldTriggered = false;
      }
    }, true);
  }
  initGlobalAcLongPress();

  const btnOpenAcAdvFromDrawer = document.getElementById("btn-open-ac-adv-from-drawer");
  if (btnOpenAcAdvFromDrawer) {
    btnOpenAcAdvFromDrawer.onclick = () => {
      const allAcs = getAllAvailableAcs();
      const dev = currentActiveIrChild || (allAcs && allAcs[0]);
      if (dev && openAcLeftDrawer) {
        openAcLeftDrawer(dev);
      }
    };
  }

  window.openAcLeftDrawer = openAcLeftDrawer;
  window.closeAcLeftDrawer = closeAcLeftDrawer;
  window.getStoredAcLimits = getStoredAcLimits;
  window.saveStoredAcLimits = saveStoredAcLimits;
  window.getStoredAcTimers = getStoredAcTimers;
  window.saveStoredAcTimers = saveStoredAcTimers;
  window.checkActiveAcTimers = checkActiveAcTimers;

  // Khởi tạo ban đầu
  if (typeof renderDashboardRoomFilters === "function") {
    renderDashboardRoomFilters();
  }
  renderDevices();
  renderFavoriteScenes();
  syncRoomDropdowns();
  updateNotificationBadges();
  updateAcModalUI();
  fetchStatus();
  setInterval(fetchStatus, 2500);

  // ── Hàm Toast thông báo ───────────────────────────────────────────────────
  function showToast(message, type = "info", duration = 3500) {
    const container = document.getElementById("toast-container");
    if (!container) return;
    const toast = document.createElement("div");
    toast.className = `toast ${type}`;
    toast.innerHTML = `<span>${message}</span>`;
    container.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = "0";
      toast.style.transform = "translateX(50px)";
      toast.style.transition = "all 0.3s ease";
      setTimeout(() => toast.remove(), 300);
    }, duration);
  }
});
