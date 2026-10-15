/**
 * ============================================================================
 * CDA SOLUTIONS - SHARED API CLIENT & SESSION RUNTIME (api.js)
 * Architecture: Decoupled GitHub Pages Frontend -> Google Apps Script Backend
 * ============================================================================
 */

// Deployment Configuration: Set your Google Apps Script Web App /exec URL here:
const APPS_SCRIPT_WEB_APP_URL = "https://script.google.com/macros/s/AKfycbz7CWI8ioBzhkVNfKkwIUiYoLJHG8c_BEYLmxFrRAKMkb-UEklboASiByNS2Y7s8wLV/exec";

// Local storage key for dynamic runtime override (if configured via admin settings)
const STORAGE_OVERRIDE_URL_KEY = "cda_api_override_url";

function getActiveApiUrl() {
  const customUrl = localStorage.getItem(STORAGE_OVERRIDE_URL_KEY);
  return (customUrl && customUrl.trim().length > 0) ? customUrl.trim() : APPS_SCRIPT_WEB_APP_URL;
}

/**
 * Core asynchronous API fetcher using POST with URLSearchParams to prevent CORS preflight.
 */
async function callApi(method, args = {}) {
  const url = getActiveApiUrl();

  if (!url || url.includes("YOUR_CDA_WEB_APP_EXEC_URL_HERE")) {
    console.warn("[CDA Logger] Apps Script Web App URL is still set to placeholder. Please configure your deployed Web App URL in shared/js/api.js.");
  }

  const payload = { method, args };
  const body = new URLSearchParams();
  body.append("payload", JSON.stringify(payload));

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded"
      },
      body: body
    });

    if (!response.ok) {
      throw new Error(`Server returned HTTP ${response.status} (${response.statusText})`);
    }

    const data = await response.json();
    return data;
  } catch (error) {
    console.error(`[CDA API Error: ${method}]`, error);
    throw error;
  }
}

/**
 * Argument mapping dictionary for backward compatibility with positional calls
 */
const METHOD_ARG_MAPS = {
  registerUser: ["email", "firstName", "lastName", "password"],
  loginUser: ["email", "password"],
  processActivityLog: ["email", "firstName", "lastName", "action", "lat", "lon"],
  getAdminDashboardData: [],
  adminUpdateDailySummary: ["summaryId", "clockIn", "clockOut", "adminEmail"],
  adminDeleteDailySummary: ["summaryId", "dateStr", "email", "adminEmail"],
  adminUpdateUser: ["targetEmail", "firstName", "lastName", "status", "newPassword"],
  submitLeaveRequest: ["email", "firstName", "lastName", "leaveType", "startDate", "endDate"],
  adminUpdateLeaveStatus: ["reqId", "newStatus"],
  exportTimesheetData: ["email", "startDate", "endDate", "format"],
  generateTimesheetsZip: ["email", "startDate", "endDate"],
  extractExistingLogsToDailySummaries: [],
  resetClockOutFloorTimes: []
};

function normalizeArgs(method, callArgs) {
  if (callArgs.length === 1 && typeof callArgs[0] === "object" && !Array.isArray(callArgs[0])) {
    return callArgs[0];
  }
  const paramNames = METHOD_ARG_MAPS[method];
  const result = {};
  if (paramNames) {
    paramNames.forEach((name, idx) => {
      result[name] = callArgs[idx] !== undefined ? callArgs[idx] : null;
    });
  }
  return result;
}

/**
 * google.script.run Shim: Allows seamless `.withSuccessHandler().withFailureHandler()[method](...args)` execution
 */
function createScriptRunProxy() {
  let successHandler = null;
  let failureHandler = null;

  const targetObj = {};

  const proxy = new Proxy(targetObj, {
    get(target, prop) {
      if (prop === "withSuccessHandler") {
        return function(fn) {
          successHandler = fn;
          return proxy; // Must return the Proxy to allow chaining in any order
        };
      }
      if (prop === "withFailureHandler") {
        return function(fn) {
          failureHandler = fn;
          return proxy; // Must return the Proxy to allow chaining in any order
        };
      }

      // Any backend method call: loginUser, registerUser, processActivityLog, etc.
      return async function(...rawArgs) {
        try {
          const args = normalizeArgs(prop, rawArgs);
          const res = await callApi(prop, args);
          if (typeof successHandler === "function") {
            successHandler(res);
          }
          return res;
        } catch (err) {
          showLoader(false);
          if (typeof failureHandler === "function") {
            failureHandler(err);
          } else {
            console.error(`Unhandled API failure in ${String(prop)}:`, err);
            alert(`API Error (${String(prop)}): ${err.message || err}`);
          }
        }
      };
    }
  });

  return proxy;
}

window.google = window.google || {};
window.google.script = window.google.script || {};
Object.defineProperty(window.google.script, "run", {
  get() {
    return createScriptRunProxy();
  },
  configurable: true
});

/**
 * ==========================================================================
 * SESSION MANAGEMENT HELPERS
 * ==========================================================================
 */

const SESSION_USER_KEY = "cda_active_user";
const SESSION_ROLE_KEY = "cda_active_role";

function saveSession(user, accountType) {
  sessionStorage.setItem(SESSION_USER_KEY, JSON.stringify(user));
  sessionStorage.setItem(SESSION_ROLE_KEY, accountType);
}

function getSession() {
  const userJson = sessionStorage.getItem(SESSION_USER_KEY);
  const accountType = sessionStorage.getItem(SESSION_ROLE_KEY);
  if (!userJson || !accountType) return null;
  try {
    return {
      user: JSON.parse(userJson),
      accountType: accountType
    };
  } catch (e) {
    return null;
  }
}

function clearSession() {
  sessionStorage.removeItem(SESSION_USER_KEY);
  sessionStorage.removeItem(SESSION_ROLE_KEY);
}

function requireSession(expectedRole, loginRedirectUrl = "../index.html") {
  const session = getSession();
  if (!session) {
    window.location.replace(loginRedirectUrl);
    return null;
  }
  if (expectedRole && session.accountType !== expectedRole) {
    // If Admin attempts to access Employee, or Employee attempts Admin
    if (session.accountType === "Admin") {
      window.location.replace("../admin/index.html");
    } else {
      window.location.replace("../employee/index.html");
    }
    return null;
  }
  return session;
}

function logout(loginUrl = "../index.html") {
  clearSession();
  window.location.replace(loginUrl);
}

/**
 * ==========================================================================
 * UI FEEDBACK & DOWNLOAD UTILITIES
 * ==========================================================================
 */

function showLoader(show, msg = "Processing request...") {
  let spinner = document.getElementById("globalSpinner");
  let messageEl = document.getElementById("spinnerMessage");

  if (!spinner) {
    spinner = document.createElement("div");
    spinner.id = "globalSpinner";
    spinner.className = "spinner-overlay hidden";
    spinner.innerHTML = `
      <div class="spinner"></div>
      <div id="spinnerMessage" class="spinner-message">Processing request...</div>
    `;
    document.body.appendChild(spinner);
    messageEl = document.getElementById("spinnerMessage");
  }

  if (messageEl) {
    messageEl.innerText = msg;
  }

  if (show) {
    spinner.classList.remove("hidden");
  } else {
    spinner.classList.add("hidden");
  }
}

function showAlertUI(targetElOrId, text, isError = false) {
  const el = typeof targetElOrId === "string" ? document.getElementById(targetElOrId) : targetElOrId;
  if (!el) return;
  el.innerText = text;
  el.className = `alert ${isError ? 'alert-danger' : 'alert-success'}`;
  el.classList.remove("hidden");
}

function triggerNativeDownload(base64Data, contentType, filename) {
  try {
    const byteCharacters = atob(base64Data);
    const byteArrays = [];
    for (let offset = 0; offset < byteCharacters.length; offset += 512) {
      const slice = byteCharacters.slice(offset, offset + 512);
      const byteNumbers = new Array(slice.length);
      for (let i = 0; i < slice.length; i++) {
        byteNumbers[i] = slice.charCodeAt(i);
      }
      const byteArray = new Uint8Array(byteNumbers);
      byteArrays.push(byteArray);
    }
    const blob = new Blob(byteArrays, { type: contentType });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    setTimeout(() => {
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    }, 200);
  } catch (err) {
    console.error("Native download failed:", err);
    alert("Download failed: " + err.message);
  }
}
