/* ============================================================================
 * FEATURE MODULE: PZEM-004T POWER METER & ENERGY STATISTICS
 * Quản lý đơn giá điện, tính tiền điện realtime, biểu đồ Chart.js & Power Banner
 * ============================================================================ */
(function (global) {
  let pzemStatsChart = null;
  let pzemStatsPeriod = "day";
  let pzemStatsMetric = "kwh";
  let pzemStatsCache = null;

  function ctx() {
    return global.SmartHome || {};
  }

  function getElectricityRate() {
    const pz = ctx().getActivePzem ? ctx().getActivePzem() : null;
    if (pz && pz.electricity_rate) {
      return Math.max(100, parseInt(pz.electricity_rate, 10) || 2500);
    }
    const stored = parseInt(localStorage.getItem("gate_electricity_rate"), 10);
    return (stored && stored >= 100) ? stored : 2500;
  }

  function updatePzemCostPreview(rateVal) {
    const previewEl = document.getElementById("drawer-pzem-cost-preview");
    if (!previewEl) return;
    const rate = Math.max(0, parseInt(rateVal, 10) || 0);
    const pzemData = ctx().pzemData || {};
    const energy = (pzemData.energy > 0) ? pzemData.energy : 0;
    const cost = Math.round(energy * rate);
    previewEl.innerText = `Tạm tính: ${cost.toLocaleString("vi-VN")} đ`;
  }

  function highlightActiveRatePreset(rateVal) {
    const val = parseInt(rateVal, 10);
    document.querySelectorAll(".btn-rate-preset").forEach(btn => {
      const btnRate = parseInt(btn.getAttribute("data-rate"), 10);
      if (btnRate === val) {
        btn.classList.add("active");
      } else {
        btn.classList.remove("active");
      }
    });
  }

  function refreshPzemPanel() {
    const c = ctx();
    let panel = document.getElementById("drawer-pzem-panel");
    const customDevices = c.getCustomDevices ? c.getCustomDevices() : [];
    const currentDrawerTarget = c.getCurrentDrawerTarget ? c.getCurrentDrawerTarget() : null;
    const currentActiveIrChild = c.getCurrentActiveIrChild ? c.getCurrentActiveIrChild() : null;
    const drawerHeroBox = document.getElementById("drawer-hero-box");

    const dev = customDevices.find(d => d.id === currentDrawerTarget);
    const visible = dev && c.isPzemDevice && c.isPzemDevice(dev) && !currentActiveIrChild;
    if (!panel && visible && drawerHeroBox) {
      panel = document.createElement("div");
      panel.id = "drawer-pzem-panel";
      drawerHeroBox.parentNode.insertBefore(panel, drawerHeroBox);
    }
    if (!panel) return;
    panel.style.display = visible ? "block" : "none";
    if (!visible) return;

    const pzemData = c.pzemData || { voltage: 0, current: 0, power: 0, energy: 0, frequency: 50, pf: 1 };
    const online = c.isDeviceOnline ? c.isDeviceOnline(dev) : false;
    const color = online ? "#059669" : "#ef4444";
    const statusLabel = online ? "Đang Đo Lường Realtime" : "Mất Kết Nối STM32";

    const vStr = online ? `${pzemData.voltage.toFixed(1)} V` : "-- V";
    const aStr = online ? `${pzemData.current.toFixed(2)} A` : "-- A";
    const wStr = online ? `${pzemData.power.toFixed(1)} W` : "-- W";
    const kwhStr = online ? `${pzemData.energy.toFixed(3)} kWh` : "-- kWh";
    const hzStr = online ? `${pzemData.frequency.toFixed(1)} Hz` : "-- Hz";
    const pfStr = online ? `${pzemData.pf.toFixed(2)}` : "--";

    const currentRate = getElectricityRate();
    const liveCost = Math.round((pzemData.energy || 0) * currentRate);
    const costStr = online ? `${liveCost.toLocaleString("vi-VN")} đ` : "-- đ";

    panel.innerHTML = `
      <section style="padding:20px 16px;margin-bottom:18px;border:1px solid #fed7aa;border-radius:22px;background:linear-gradient(165deg,#fffbeb 0%,#ffffff 100%);text-align:center;box-shadow:0 4px 16px rgba(245,158,11,0.08);">
        <div style="width:64px;height:64px;margin:0 auto 12px;border-radius:50%;background:${online ? '#fef3c7' : '#f1f5f9'};display:grid;place-items:center;color:${online ? '#d97706' : '#94a3b8'};font-size:26px;box-shadow:${online ? '0 6px 18px rgba(217,119,6,0.2)' : 'none'};">
          <i class="fa-solid fa-bolt ${online ? 'fa-beat-fade' : ''}" style="--fa-beat-fade-scale:1.08;--fa-beat-fade-opacity:0.85;"></i>
        </div>
        <div style="font-size:11px;letter-spacing:1.4px;color:#94a3b8;font-weight:700;margin-bottom:4px;">BỘ ĐO ĐIỆN NĂNG PZEM-004T</div>
        <strong style="font-size:19px;color:${color};display:block;margin-bottom:4px;">${statusLabel}</strong>
        <p style="margin:0 0 16px;color:#64748b;font-size:12px;">${online ? 'Dữ liệu truyền từ STM32F103 qua cổng UART mỗi giây' : 'Chưa nhận được bản tin UART từ vi điều khiển STM32'}</p>

        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
          <div style="background:#ffffff;border:1px solid #fed7aa;border-radius:14px;padding:10px 8px;text-align:center;box-shadow:0 1px 3px rgba(0,0,0,0.02);">
            <div style="font-size:10.5px;color:#9a3412;font-weight:700;margin-bottom:4px;display:flex;align-items:center;justify-content:center;gap:4px;">
              <i class="fa-solid fa-bolt" style="color:#f59e0b;"></i> ĐIỆN ÁP (U)
            </div>
            <div style="font-size:16px;font-weight:800;color:#1e293b;">${vStr}</div>
            <div style="font-size:10px;color:#94a3b8;margin-top:2px;">Dải đo: 80 - 260 V</div>
          </div>

          <div style="background:#ffffff;border:1px solid #bae6fd;border-radius:14px;padding:10px 8px;text-align:center;box-shadow:0 1px 3px rgba(0,0,0,0.02);">
            <div style="font-size:10.5px;color:#0369a1;font-weight:700;margin-bottom:4px;display:flex;align-items:center;justify-content:center;gap:4px;">
              <i class="fa-solid fa-gauge-high" style="color:#0284c7;"></i> DÒNG ĐIỆN (I)
            </div>
            <div style="font-size:16px;font-weight:800;color:#1e293b;">${aStr}</div>
            <div style="font-size:10px;color:#94a3b8;margin-top:2px;">Dải đo: 0 - 100 A</div>
          </div>

          <div style="background:#ffffff;border:1px solid #bbf7d0;border-radius:14px;padding:10px 8px;text-align:center;box-shadow:0 1px 3px rgba(0,0,0,0.02);">
            <div style="font-size:10.5px;color:#15803d;font-weight:700;margin-bottom:4px;display:flex;align-items:center;justify-content:center;gap:4px;">
              <i class="fa-solid fa-lightbulb" style="color:#10b981;"></i> CÔNG SUẤT (P)
            </div>
            <div style="font-size:16px;font-weight:800;color:#15803d;">${wStr}</div>
            <div style="font-size:10px;color:#94a3b8;margin-top:2px;">Công suất tiêu thụ</div>
          </div>

          <div style="background:#ffffff;border:1px solid #e9d5ff;border-radius:14px;padding:10px 8px;text-align:center;box-shadow:0 1px 3px rgba(0,0,0,0.02);">
            <div style="font-size:10.5px;color:#7e22ce;font-weight:700;margin-bottom:4px;display:flex;align-items:center;justify-content:center;gap:4px;">
              <i class="fa-solid fa-chart-column" style="color:#8b5cf6;"></i> TIÊU THỤ (E)
            </div>
            <div style="font-size:16px;font-weight:800;color:#7e22ce;">${kwhStr}</div>
            <div style="font-size:11px;color:#059669;font-weight:700;margin-top:2px;">💰 Tạm tính: ${costStr}</div>
          </div>

          <div style="background:#ffffff;border:1px solid #e2e8f0;border-radius:14px;padding:10px 8px;text-align:center;box-shadow:0 1px 3px rgba(0,0,0,0.02);">
            <div style="font-size:10.5px;color:#475569;font-weight:700;margin-bottom:4px;display:flex;align-items:center;justify-content:center;gap:4px;">
              <i class="fa-solid fa-wave-square" style="color:#06b6d4;"></i> TẦN SỐ (F)
            </div>
            <div style="font-size:15px;font-weight:700;color:#334155;">${hzStr}</div>
            <div style="font-size:10px;color:#94a3b8;margin-top:2px;">Lưới AC chuẩn</div>
          </div>

          <div style="background:#ffffff;border:1px solid #e2e8f0;border-radius:14px;padding:10px 8px;text-align:center;box-shadow:0 1px 3px rgba(0,0,0,0.02);">
            <div style="font-size:10.5px;color:#475569;font-weight:700;margin-bottom:4px;display:flex;align-items:center;justify-content:center;gap:4px;">
              <i class="fa-solid fa-sliders" style="color:#ec4899;"></i> HỆ SỐ (PF)
            </div>
            <div style="font-size:15px;font-weight:700;color:#334155;">${pfStr}</div>
            <div style="font-size:10px;color:#94a3b8;margin-top:2px;">Cosφ công suất</div>
          </div>
        </div>

        <div style="margin-top:14px;padding:8px 10px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;font-size:11px;color:#64748b;display:flex;align-items:center;justify-content:center;gap:6px;">
          <i class="fa-solid fa-microchip" style="color:#0284c7;"></i>
          <span>STM32F103 (USART1) ➔ ESP32-S3 (UART1) &bull; 115200 baud</span>
        </div>
      </section>
    `;

    const rateInput = document.getElementById("drawer-edit-pzem-rate");
    if (rateInput) {
      updatePzemCostPreview(rateInput.value || currentRate);
    }
  }

  function updatePowerSummaryWidget() {
    const c = ctx();
    const cardEl = document.getElementById("card-power-widget");
    const headerEl = document.getElementById("power-widget-header");
    const valEl = document.getElementById("power-widget-num");
    const costValEl = document.getElementById("power-widget-cost-val");
    const subEl = document.getElementById("power-widget-sub");
    const badgeEl = document.getElementById("power-widget-badge");

    if (!cardEl && !valEl) return;

    const now = new Date();
    const monthStr = `Điện tiêu thụ tháng ${now.getMonth() + 1}/${now.getFullYear()}`;
    const pzemDev = c.getActivePzem ? c.getActivePzem() : null;
    const isPzemDeleted = localStorage.getItem("gate_pzem_deleted") === "true";
    const pzemData = c.pzemData || { voltage: 0, current: 0, power: 0, energy: 0 };

    const currentRate = getElectricityRate();
    const currentEnergy = (pzemData.energy > 0) ? pzemData.energy : 0;
    const totalCost = Math.round(currentEnergy * currentRate);
    const costFormatted = totalCost.toLocaleString("vi-VN") + " đ";
    const rateFormatted = currentRate.toLocaleString("vi-VN") + " đ/kWh";

    if (costValEl) {
      costValEl.innerText = (!pzemDev || isPzemDeleted) ? "0 đ" : costFormatted;
    }

    if (!pzemDev || isPzemDeleted) {
      if (headerEl) headerEl.innerHTML = `${monthStr} &bull; Chưa có thiết bị đo điện`;
      if (valEl) valEl.innerText = "0.00";
      if (subEl) subEl.innerText = "Tháng trước: 0.00 kWh";
      if (badgeEl) {
        badgeEl.innerHTML = `<i class="fa-solid fa-circle-minus"></i> Chưa kết nối`;
        badgeEl.style.background = "rgba(255, 255, 255, 0.2)";
      }
      return;
    }

    const devName = global.escapeHtml(pzemDev.name || "Đo Điện Năng");
    const isOnline = c.isDeviceOnline ? c.isDeviceOnline(pzemDev) : false;

    if (isOnline) {
      if (headerEl) headerEl.innerHTML = `${monthStr} &bull; ${devName}`;
      if (valEl) valEl.innerText = pzemData.energy > 0 ? pzemData.energy.toFixed(2) : "0.00";
      if (subEl) subEl.innerHTML = `⚡ ${pzemData.voltage.toFixed(1)}V &bull; ${pzemData.current.toFixed(2)}A &bull; ${rateFormatted}`;
      if (badgeEl) {
        badgeEl.innerHTML = `<i class="fa-solid fa-bolt"></i> ${pzemData.power.toFixed(1)} W`;
        badgeEl.style.background = "rgba(255, 255, 255, 0.25)";
      }
    } else {
      if (headerEl) headerEl.innerHTML = `${monthStr} &bull; ${devName} (Ngoại tuyến)`;
      if (valEl) valEl.innerText = pzemData.energy > 0 ? pzemData.energy.toFixed(2) : "0.00";
      const timeStr = (typeof global.formatTimeAgo === "function" && pzemData.lastSeen) ? global.formatTimeAgo(pzemData.lastSeen) : null;
      if (subEl) subEl.innerHTML = timeStr ? `Lần cuối: ${timeStr} &bull; ${rateFormatted}` : `Mất kết nối thiết bị đo &bull; ${rateFormatted}`;
      if (badgeEl) {
        badgeEl.innerHTML = `<i class="fa-solid fa-circle-exclamation"></i> Ngoại tuyến`;
        badgeEl.style.background = "rgba(239, 68, 68, 0.35)";
      }
    }
  }

  async function loadPzemStats(period = pzemStatsPeriod) {
    pzemStatsPeriod = period;
    const refreshBtn = document.getElementById("btn-pzem-stats-refresh");
    if (refreshBtn) refreshBtn.querySelector("i")?.classList.add("fa-spin");

    try {
      const res = await global.callApi(`/api/sensors/pzem/stats?period=${encodeURIComponent(period)}`);
      if (res && res.success && res.data) {
        pzemStatsCache = res.data;
        renderPzemStatsUI(pzemStatsCache);
      }
    } catch (err) {
      console.warn("Không thể tải thống kê PZEM:", err);
    } finally {
      if (refreshBtn) {
        setTimeout(() => refreshBtn.querySelector("i")?.classList.remove("fa-spin"), 300);
      }
    }
  }

  function renderPzemStatsUI(data = pzemStatsCache) {
    if (!data) return;
    const summary = data.summary || {};
    const rate = getElectricityRate();

    const totalKwh = Number(summary.total_kwh || 0);
    const totalCost = Math.round(totalKwh * rate);
    const maxPower = Number(summary.max_power || 0);
    const avgPower = Number(summary.avg_power || 0);
    const samples = Number(summary.sample_count || 0);

    const kwhEl = document.getElementById("pzem-stat-kwh");
    const costEl = document.getElementById("pzem-stat-cost");
    const maxPEl = document.getElementById("pzem-stat-max-p");
    const avgPEl = document.getElementById("pzem-stat-avg-p");
    const sampleEl = document.getElementById("pzem-stat-samples");

    if (kwhEl) kwhEl.innerText = `${totalKwh.toFixed(3)} kWh`;
    if (costEl) costEl.innerText = `${totalCost.toLocaleString("vi-VN")} đ`;
    if (maxPEl) maxPEl.innerText = `${maxPower.toFixed(1)} W`;
    if (avgPEl) avgPEl.innerText = `${avgPower.toFixed(1)} W`;
    if (sampleEl) sampleEl.innerText = `${samples} mẫu`;

    const tbody = document.getElementById("pzem-recent-logs-body");
    if (tbody) {
      const logs = Array.isArray(data.recent_logs) ? data.recent_logs : [];
      if (logs.length === 0) {
        tbody.innerHTML = `<tr><td colspan="4" style="text-align:center;color:#94a3b8;padding:12px;">Chưa có dữ liệu lịch sử lưu trong CSDL</td></tr>`;
      } else {
        tbody.innerHTML = logs.map(item => `
          <tr>
            <td>${global.escapeHtml(item.time || "--")}</td>
            <td>${Number(item.voltage || 0).toFixed(1)}</td>
            <td style="font-weight:700;color:#059669;">${Number(item.power || 0).toFixed(1)}</td>
            <td style="font-weight:700;color:#7e22ce;">${Number(item.energy || 0).toFixed(3)}</td>
          </tr>
        `).join("");
      }
    }

    const canvas = document.getElementById("pzem-stats-chart");
    if (!canvas || typeof Chart === "undefined") return;

    const labels = data.labels || [];
    const kwhSeries = data.kwh_series || [];
    const powerAvgSeries = data.power_avg_series || [];
    const powerMaxSeries = data.power_max_series || [];

    const isKwhMode = (pzemStatsMetric === "kwh");
    const datasets = isKwhMode
      ? [
          {
            label: "Điện năng (kWh)",
            data: kwhSeries,
            backgroundColor: "rgba(0, 176, 111, 0.78)",
            hoverBackgroundColor: "#00b06f",
            borderColor: "#059669",
            borderWidth: 1,
            borderRadius: 5,
            maxBarThickness: 18
          }
        ]
      : [
          {
            label: "Công suất TB (W)",
            data: powerAvgSeries,
            borderColor: "#f59e0b",
            backgroundColor: "rgba(245, 158, 11, 0.16)",
            borderWidth: 2,
            fill: true,
            tension: 0.35,
            pointRadius: 2.5,
            pointHoverRadius: 5
          },
          {
            label: "Công suất đỉnh (W)",
            data: powerMaxSeries,
            borderColor: "#ef4444",
            backgroundColor: "transparent",
            borderWidth: 1.5,
            borderDash: [4, 3],
            fill: false,
            tension: 0.35,
            pointRadius: 0,
            pointHoverRadius: 4
          }
        ];

    if (pzemStatsChart) {
      pzemStatsChart.destroy();
      pzemStatsChart = null;
    }

    pzemStatsChart = new Chart(canvas.getContext("2d"), {
      type: isKwhMode ? "bar" : "line",
      data: { labels, datasets },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: "index", intersect: false },
        plugins: {
          legend: {
            display: !isKwhMode,
            position: "top",
            labels: { boxWidth: 10, font: { size: 10, weight: "600" }, color: "#475569", padding: 6 }
          },
          tooltip: {
            backgroundColor: "rgba(15, 23, 42, 0.92)",
            padding: 9,
            titleFont: { size: 11, weight: "700" },
            bodyFont: { size: 11 },
            callbacks: {
              label: function (tCtx) {
                const val = Number(tCtx.parsed.y || 0);
                if (isKwhMode) {
                  const costVnd = Math.round(val * getElectricityRate());
                  return [
                    `Điện năng: ${val.toFixed(3)} kWh`,
                    `Tiền điện: ${costVnd.toLocaleString("vi-VN")} đ`
                  ];
                }
                return `${tCtx.dataset.label}: ${val.toFixed(1)} W`;
              }
            }
          }
        },
        scales: {
          x: {
            grid: { display: false },
            ticks: {
              color: "#64748b",
              font: { size: 10 },
              maxRotation: 0,
              autoSkip: true,
              maxTicksLimit: pzemStatsPeriod === "day" ? 8 : 7
            }
          },
          y: {
            beginAtZero: true,
            grid: { color: "rgba(226, 232, 240, 0.7)" },
            ticks: {
              color: "#64748b",
              font: { size: 10 },
              maxTicksLimit: 5
            }
          }
        }
      }
    });
  }

  document.addEventListener("DOMContentLoaded", () => {
    const pzemRateInput = document.getElementById("drawer-edit-pzem-rate");
    if (pzemRateInput) {
      pzemRateInput.addEventListener("input", function () {
        updatePzemCostPreview(this.value);
        highlightActiveRatePreset(this.value);
      });
    }

    document.querySelectorAll(".btn-rate-preset").forEach(btn => {
      btn.addEventListener("click", function () {
        const r = this.getAttribute("data-rate");
        if (pzemRateInput) {
          pzemRateInput.value = r;
          updatePzemCostPreview(r);
          highlightActiveRatePreset(r);
        }
      });
    });

    document.querySelectorAll(".pzem-tab-btn").forEach(btn => {
      btn.addEventListener("click", function () {
        const period = this.getAttribute("data-period") || "day";
        document.querySelectorAll(".pzem-tab-btn").forEach(b => b.classList.remove("active"));
        this.classList.add("active");
        loadPzemStats(period);
      });
    });

    document.querySelectorAll(".pzem-metric-btn").forEach(btn => {
      btn.addEventListener("click", function () {
        const metric = this.getAttribute("data-metric") || "kwh";
        pzemStatsMetric = metric;
        document.querySelectorAll(".pzem-metric-btn").forEach(b => b.classList.remove("active"));
        this.classList.add("active");
        if (pzemStatsCache) {
          renderPzemStatsUI(pzemStatsCache);
        } else {
          loadPzemStats(pzemStatsPeriod);
        }
      });
    });

    const btnPzemStatsRefresh = document.getElementById("btn-pzem-stats-refresh");
    if (btnPzemStatsRefresh) {
      btnPzemStatsRefresh.addEventListener("click", () => loadPzemStats(pzemStatsPeriod));
    }
  });

  global.getElectricityRate = getElectricityRate;
  global.updatePzemCostPreview = updatePzemCostPreview;
  global.highlightActiveRatePreset = highlightActiveRatePreset;
  global.refreshPzemPanel = refreshPzemPanel;
  global.updatePowerSummaryWidget = updatePowerSummaryWidget;
  global.loadPzemStats = loadPzemStats;
  global.renderPzemStatsUI = renderPzemStatsUI;
})(window);
