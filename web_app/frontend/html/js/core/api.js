/* ============================================================================
 * CORE MODULE: API & AUTHENTICATION CLIENT
 * Quản lý JWT Token và giao tiếp REST API với FastAPI Backend
 * ============================================================================ */
(function (global) {
  function getAuthToken() {
    return localStorage.getItem("gate_token");
  }

  async function callApi(endpoint, method = "GET", body = null) {
    const token = getAuthToken();
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

  global.getAuthToken = getAuthToken;
  global.callApi = callApi;
})(window);
