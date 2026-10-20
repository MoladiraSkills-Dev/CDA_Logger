/**
 * ============================================================================
 * CDA SOLUTIONS - ADMIN DASHBOARD CONTROLLER (admin.js)
 * Management Dashboard: Telemetry Logs, Daily Summaries, Weekly & Monthly
 * Legal Compliance, Leave Approvals, Staff Profiles & Timesheet Exports.
 * ============================================================================
 */

const LOGIN_URL = "../index.html";
const PAGE_SIZE = 25;

let CURRENT_ADMIN_USER = null;
let ACTIVE_ADMIN_TAB = "logsTab";

let CACHED_LOGS_ARRAY = [];
let CACHED_SUMMARIES_ARRAY = [];
let CACHED_WEEKLY_ARRAY = [];
let CACHED_MONTHLY_ARRAY = [];
let CACHED_LEAVE_ARRAY = [];
let CACHED_EMPLOYEES_ARRAY = [];

const LOADED_TABS = {
  logsTab: false,
  summariesTab: false,
  weeklyTab: false,
  monthlyTab: false,
  leaveTab: false,
  usersTab: false,
  exportTab: true
};

const TAB_PAGE_LIMITS = {
  logs: PAGE_SIZE,
  summaries: PAGE_SIZE,
  weekly: PAGE_SIZE,
  monthly: PAGE_SIZE,
  leave: PAGE_SIZE,
  users: PAGE_SIZE
};

const TAB_BACKEND_MAP = {
  summariesTab: "summaries",
  weeklyTab: "weekly",
  monthlyTab: "monthly",
  leaveTab: "leave",
  usersTab: "users"
};

document.addEventListener("DOMContentLoaded", function() {
  const session = requireSession("Admin", LOGIN_URL);
  if (!session) return;

  CURRENT_ADMIN_USER = session.user;

  const greetingEl = document.getElementById("adminGreeting");
  if (greetingEl) {
    greetingEl.innerText = `${CURRENT_ADMIN_USER.firstName}'s Management Space`;
  }

  loadAdminDashboard();
});

/**
 * Loads fast initial telemetry data (< 1s) with automatic fallback to full dataset.
 */
function loadAdminDashboard(targetTab = null) {
  showLoader(true, "Synchronizing CDA database records...");

  // Reset pagination chunks for clean reload
  TAB_PAGE_LIMITS.logs = PAGE_SIZE;
  TAB_PAGE_LIMITS.summaries = PAGE_SIZE;
  TAB_PAGE_LIMITS.weekly = PAGE_SIZE;
  TAB_PAGE_LIMITS.monthly = PAGE_SIZE;
  TAB_PAGE_LIMITS.leave = PAGE_SIZE;
  TAB_PAGE_LIMITS.users = PAGE_SIZE;

  // Mark background tabs as needing fresh data
  Object.keys(LOADED_TABS).forEach(tab => {
    if (tab !== 'exportTab') LOADED_TABS[tab] = false;
  });

  google.script.run
    .withFailureHandler(function(err) {
      fallbackFullDashboardLoad(targetTab);
    })
    .withSuccessHandler(function(res) {
      if (res && res.status === "success") {
        CACHED_LOGS_ARRAY = res.logs || [];
        CACHED_EMPLOYEES_ARRAY = res.employees || [];
        LOADED_TABS['logsTab'] = true;

        if (res.dailyStats) {
          const statLogins = document.getElementById("statLogins");
          const statLogouts = document.getElementById("statLogouts");
          if (statLogins) statLogins.innerText = res.dailyStats.loginsToday;
          if (statLogouts) statLogouts.innerText = res.dailyStats.logoutsToday;
        }

        const todayStr = new Date().toISOString().split('T')[0];
        const currentMonthStr = todayStr.substring(0, 7);

        const filterDate = document.getElementById("filterDate");
        const filterSummaryDate = document.getElementById("filterSummaryDate");
        const filterMonthlyMonth = document.getElementById("filterMonthlyMonth");

        if (filterDate && !filterDate.value) filterDate.value = todayStr;
        if (filterSummaryDate && !filterSummaryDate.value) filterSummaryDate.value = todayStr;
        if (filterMonthlyMonth && !filterMonthlyMonth.value) filterMonthlyMonth.value = currentMonthStr;

        populateExportEmployeeDropdown(CACHED_EMPLOYEES_ARRAY);
        applyAdminLogFilters();
        updateAdminAttendanceButtonStates();
        showLoader(false);

        const destTab = targetTab || ACTIVE_ADMIN_TAB;
        if (destTab && destTab !== 'logsTab') {
          switchAdminTab(destTab);
        }
      } else {
        fallbackFullDashboardLoad(targetTab);
      }
    })
    .getAdminInitData();
}

/**
 * Fallback loader if getAdminInitData is not yet deployed on Google Apps Script
 */
function fallbackFullDashboardLoad(targetTab = null) {
  google.script.run
    .withFailureHandler(function(err) {
      showLoader(false);
      alert("System Connection Error: " + (err.message || err));
    })
    .withSuccessHandler(function(res) {
      showLoader(false);
      if (res && res.status === "success") {
        CACHED_LOGS_ARRAY = res.logs || [];
        CACHED_SUMMARIES_ARRAY = res.summaries || [];
        CACHED_WEEKLY_ARRAY = res.weeklySummaries || [];
        CACHED_MONTHLY_ARRAY = res.monthlySummaries || [];
        CACHED_LEAVE_ARRAY = res.leaveRequests || [];
        CACHED_EMPLOYEES_ARRAY = res.employees || [];

        Object.keys(LOADED_TABS).forEach(k => LOADED_TABS[k] = true);

        const todayStr = new Date().toISOString().split('T')[0];
        const currentMonthStr = todayStr.substring(0, 7);

        const filterDate = document.getElementById("filterDate");
        const filterSummaryDate = document.getElementById("filterSummaryDate");
        const filterMonthlyMonth = document.getElementById("filterMonthlyMonth");

        if (filterDate && !filterDate.value) filterDate.value = todayStr;
        if (filterSummaryDate && !filterSummaryDate.value) filterSummaryDate.value = todayStr;
        if (filterMonthlyMonth && !filterMonthlyMonth.value) filterMonthlyMonth.value = currentMonthStr;

        renderStaffProfilesTable(CACHED_EMPLOYEES_ARRAY);
        renderLeaveRequestsTable(CACHED_LEAVE_ARRAY);
        populateExportEmployeeDropdown(CACHED_EMPLOYEES_ARRAY);

        applyAdminLogFilters();
        applyAdminSummaryFilters();
        applyAdminWeeklyFilters();
        applyAdminMonthlyFilters();
        updateAdminAttendanceButtonStates();

        const destTab = targetTab || ACTIVE_ADMIN_TAB;
        if (destTab) {
          switchAdminTab(destTab);
        }
      } else {
        alert("Database Error: " + (res ? res.message : "Failed to load dashboard"));
      }
    })
    .getAdminDashboardData();
}

/**
 * TAB SWITCHING & ON-DEMAND LAZY LOADING CONTROLLER
 */
function switchAdminTab(tabName) {
  ACTIVE_ADMIN_TAB = tabName;
  const tabs = ['logsTab', 'summariesTab', 'weeklyTab', 'monthlyTab', 'leaveTab', 'usersTab', 'exportTab'];
  
  tabs.forEach(t => {
    const btn = document.getElementById(`btn-${t}`);
    const content = document.getElementById(`content-${t}`);
    
    if (t === tabName) {
      if (btn) btn.classList.add("active");
      if (content) content.classList.add("active");
    } else {
      if (btn) btn.classList.remove("active");
      if (content) content.classList.remove("active");
    }
  });

  // If this tab has not been loaded into memory yet, trigger on-demand AJAX fetch
  if (!LOADED_TABS[tabName] && TAB_BACKEND_MAP[tabName]) {
    fetchTabData(tabName);
  }
}

/**
 * Fetches isolated tab data from backend via AJAX
 */
function fetchTabData(tabName) {
  const backendKey = TAB_BACKEND_MAP[tabName];
  if (!backendKey) return;

  showTabInlineLoader(tabName);

  google.script.run
    .withFailureHandler(function(err) {
      hideTabInlineLoader(tabName, "Failed to load data: " + (err.message || err));
    })
    .withSuccessHandler(function(res) {
      if (res && res.status === "success") {
        LOADED_TABS[tabName] = true;

        if (res.summaries) {
          CACHED_SUMMARIES_ARRAY = res.summaries;
          applyAdminSummaryFilters();
          updateAdminAttendanceButtonStates();
        } else if (res.weeklySummaries) {
          CACHED_WEEKLY_ARRAY = res.weeklySummaries;
          applyAdminWeeklyFilters();
        } else if (res.monthlySummaries) {
          CACHED_MONTHLY_ARRAY = res.monthlySummaries;
          applyAdminMonthlyFilters();
        } else if (res.leaveRequests) {
          CACHED_LEAVE_ARRAY = res.leaveRequests;
          renderLeaveRequestsTable(CACHED_LEAVE_ARRAY);
        } else if (res.employees) {
          CACHED_EMPLOYEES_ARRAY = res.employees;
          renderStaffProfilesTable(CACHED_EMPLOYEES_ARRAY);
          populateExportEmployeeDropdown(CACHED_EMPLOYEES_ARRAY);
        }
      } else {
        hideTabInlineLoader(tabName, "Database error: " + (res ? res.message : "Unknown error"));
      }
    })
    .getAdminTabData(backendKey);
}

function showTabInlineLoader(tabName) {
  const tableBodies = {
    summariesTab: { id: "summariesTableBody", cols: 8, label: "daily shift summaries" },
    weeklyTab: { id: "weeklyTableBody", cols: 6, label: "weekly compliance records" },
    monthlyTab: { id: "monthlyTableBody", cols: 6, label: "monthly summaries" },
    leaveTab: { id: "leaveTableBody", cols: 5, label: "leave applications" },
    usersTab: { id: "usersTableBody", cols: 4, label: "employee profiles" }
  };

  const cfg = tableBodies[tabName];
  if (!cfg) return;
  const tbody = document.getElementById(cfg.id);
  if (tbody) {
    tbody.innerHTML = `
      <tr>
        <td colspan="${cfg.cols}" class="text-center" style="padding: 3rem 1.5rem;">
          <div class="inline-loader-wrap">
            <div class="inline-spinner"></div>
            <div style="font-weight: 600; color: var(--cda-navy); margin-top: 0.75rem;">Loading ${cfg.label}...</div>
            <div class="text-muted" style="font-size: 0.75rem; margin-top: 0.25rem;">Fetching real-time records from CDA database</div>
          </div>
        </td>
      </tr>
    `;
  }
}

function hideTabInlineLoader(tabName, errorMsg) {
  const tableBodies = {
    summariesTab: { id: "summariesTableBody", cols: 8 },
    weeklyTab: { id: "weeklyTableBody", cols: 6 },
    monthlyTab: { id: "monthlyTableBody", cols: 6 },
    leaveTab: { id: "leaveTableBody", cols: 5 },
    usersTab: { id: "usersTableBody", cols: 4 }
  };
  const cfg = tableBodies[tabName];
  if (!cfg) return;
  const tbody = document.getElementById(cfg.id);
  if (tbody && errorMsg) {
    tbody.innerHTML = `<tr><td colspan="${cfg.cols}" class="text-center text-danger" style="padding: 2rem;">${escapeHtml(errorMsg)}</td></tr>`;
  }
}

/**
 * REUSABLE PAGINATION & INCREMENTAL RENDERER
 */
function renderPaginationBar(containerId, totalCount, currentLimit, onMoreFnName, onAllFnName, onResetFnName) {
  const container = document.getElementById(containerId);
  if (!container) return;

  if (totalCount === 0) {
    container.innerHTML = "";
    return;
  }

  if (totalCount <= PAGE_SIZE) {
    container.innerHTML = `
      <div class="pagination-inner">
        <div class="pagination-info">
          Showing all <strong>${totalCount}</strong> record${totalCount === 1 ? '' : 's'}
        </div>
      </div>
    `;
    return;
  }

  const showingCount = Math.min(totalCount, currentLimit);
  const remaining = totalCount - showingCount;

  let actionsHtml = '';
  if (remaining > 0) {
    const nextChunk = Math.min(PAGE_SIZE, remaining);
    actionsHtml = `
      <button type="button" class="btn btn-outline btn-sm btn-load-more" onclick="${onMoreFnName}()">
        <span>⬇</span> Load More (+${nextChunk})
      </button>
      <button type="button" class="btn btn-outline btn-sm" onclick="${onAllFnName}()">
        Show All (${totalCount})
      </button>
    `;
  } else {
    actionsHtml = `
      <span class="pagination-all-loaded">✓ All ${totalCount} records displayed</span>
      <button type="button" class="btn btn-outline btn-sm" onclick="${onResetFnName}()">
        Collapse to ${PAGE_SIZE}
      </button>
    `;
  }

  container.innerHTML = `
    <div class="pagination-inner">
      <div class="pagination-info">
        Showing <strong>${showingCount}</strong> of <strong>${totalCount}</strong> records
      </div>
      <div class="pagination-actions">
        ${actionsHtml}
      </div>
    </div>
  `;
}

function loadMoreLogs() {
  TAB_PAGE_LIMITS.logs += PAGE_SIZE;
  applyAdminLogFilters();
}
function showAllLogs() {
  TAB_PAGE_LIMITS.logs = 999999;
  applyAdminLogFilters();
}
function resetLogsPagination() {
  TAB_PAGE_LIMITS.logs = PAGE_SIZE;
  applyAdminLogFilters();
}

function loadMoreSummaries() {
  TAB_PAGE_LIMITS.summaries += PAGE_SIZE;
  applyAdminSummaryFilters();
}
function showAllSummaries() {
  TAB_PAGE_LIMITS.summaries = 999999;
  applyAdminSummaryFilters();
}
function resetSummariesPagination() {
  TAB_PAGE_LIMITS.summaries = PAGE_SIZE;
  applyAdminSummaryFilters();
}

function loadMoreWeekly() {
  TAB_PAGE_LIMITS.weekly += PAGE_SIZE;
  applyAdminWeeklyFilters();
}
function showAllWeekly() {
  TAB_PAGE_LIMITS.weekly = 999999;
  applyAdminWeeklyFilters();
}
function resetWeeklyPagination() {
  TAB_PAGE_LIMITS.weekly = PAGE_SIZE;
  applyAdminWeeklyFilters();
}

function loadMoreMonthly() {
  TAB_PAGE_LIMITS.monthly += PAGE_SIZE;
  applyAdminMonthlyFilters();
}
function showAllMonthly() {
  TAB_PAGE_LIMITS.monthly = 999999;
  applyAdminMonthlyFilters();
}
function resetMonthlyPagination() {
  TAB_PAGE_LIMITS.monthly = PAGE_SIZE;
  applyAdminMonthlyFilters();
}

function loadMoreLeave() {
  TAB_PAGE_LIMITS.leave += PAGE_SIZE;
  renderLeaveRequestsTable(CACHED_LEAVE_ARRAY);
}
function showAllLeave() {
  TAB_PAGE_LIMITS.leave = 999999;
  renderLeaveRequestsTable(CACHED_LEAVE_ARRAY);
}
function resetLeavePagination() {
  TAB_PAGE_LIMITS.leave = PAGE_SIZE;
  renderLeaveRequestsTable(CACHED_LEAVE_ARRAY);
}

function loadMoreUsers() {
  TAB_PAGE_LIMITS.users += PAGE_SIZE;
  renderStaffProfilesTable(CACHED_EMPLOYEES_ARRAY);
}
function showAllUsers() {
  TAB_PAGE_LIMITS.users = 999999;
  renderStaffProfilesTable(CACHED_EMPLOYEES_ARRAY);
}
function resetUsersPagination() {
  TAB_PAGE_LIMITS.users = PAGE_SIZE;
  renderStaffProfilesTable(CACHED_EMPLOYEES_ARRAY);
}

/**
 * ADMIN SELF-ATTENDANCE PANEL CONTROLLER
 */
function toggleAdminClockPanel() {
  const clockPanel = document.getElementById("adminSelfClockPanel");
  const toggleBtnText = document.getElementById("adminClockToggleText");
  if (!clockPanel) return;

  if (clockPanel.classList.contains("hidden")) {
    clockPanel.classList.remove("hidden");
    if (toggleBtnText) toggleBtnText.innerText = "Hide Clock In / Out Panel";
    updateAdminAttendanceButtonStates();
  } else {
    clockPanel.classList.add("hidden");
    if (toggleBtnText) toggleBtnText.innerText = "My Shift Clock In / Out";
  }
}

function updateAdminAttendanceButtonStates() {
  const btnIn = document.getElementById("btnAdminClockIn");
  const btnOut = document.getElementById("btnAdminClockOut");
  const hint = document.getElementById("adminClockStatusHint");
  if (!btnIn || !btnOut || !CURRENT_ADMIN_USER) return;

  const todayStr = new Date().toISOString().split('T')[0];
  const adminEmail = (CURRENT_ADMIN_USER.email || "").trim().toLowerCase();

  let hasClockedIn = false;
  let hasClockedOut = false;
  let inTime = "";
  let outTime = "";

  (CACHED_SUMMARIES_ARRAY || []).forEach(s => {
    if (String(s.email).trim().toLowerCase() === adminEmail && String(s.date).trim() === todayStr) {
      if (s.clockIn && s.clockIn !== "--") {
        hasClockedIn = true;
        inTime = s.clockIn;
      }
      if (s.clockOut && s.clockOut !== "--") {
        hasClockedOut = true;
        outTime = s.clockOut;
      }
    }
  });

  (CACHED_LOGS_ARRAY || []).forEach(l => {
    if (String(l.email).trim().toLowerCase() === adminEmail && String(l.date).trim() === todayStr) {
      if (l.action === "Clock In") {
        hasClockedIn = true;
        if (!inTime) inTime = l.time;
      } else if (l.action === "Clock Out") {
        hasClockedOut = true;
        if (!outTime) outTime = l.time;
      }
    }
  });

  if (hasClockedOut) {
    btnIn.disabled = true;
    btnIn.title = "Shift completed today";
    btnOut.disabled = true;
    btnOut.title = "Shift completed today";
    if (hint) hint.innerText = `Daily shift completed for today (${outTime || "--"}).`;
  } else if (hasClockedIn) {
    btnIn.disabled = true;
    btnIn.title = "Already clocked in today";
    btnOut.disabled = false;
    btnOut.title = "Clock out and conclude daily shift";
    if (hint) hint.innerText = `Active shift in progress since ${inTime || "--"}. Ready to clock out.`;
  } else {
    btnIn.disabled = false;
    btnIn.title = "Clock in for morning shift";
    btnOut.disabled = true;
    btnOut.title = "You cannot clock out until you have clocked in for today";
    if (hint) hint.innerText = "Clock in first to enable clock out";
  }
}

async function triggerAdminClockAction(actionType) {
  const alertBox = document.getElementById("adminLogAlert");
  if (alertBox) alertBox.classList.add("hidden");

  // Strict Client-Side Guard: Prevent Clock Out without Clock In
  if (actionType === "Clock Out") {
    const todayStr = new Date().toISOString().split('T')[0];
    const adminEmail = (CURRENT_ADMIN_USER.email || "").trim().toLowerCase();
    let hasClockedIn = false;

    (CACHED_SUMMARIES_ARRAY || []).forEach(s => {
      if (String(s.email).trim().toLowerCase() === adminEmail && String(s.date).trim() === todayStr && s.clockIn && s.clockIn !== "--") {
        hasClockedIn = true;
      }
    });

    (CACHED_LOGS_ARRAY || []).forEach(l => {
      if (String(l.email).trim().toLowerCase() === adminEmail && String(l.date).trim() === todayStr && l.action === "Clock In") {
        hasClockedIn = true;
      }
    });

    if (!hasClockedIn) {
      showAlertUI(
        alertBox, 
        "Action Blocked: You cannot clock out because you have not clocked in for today yet. Please clock in first.", 
        true
      );
      return;
    }
  }

  if (!navigator.geolocation) {
    showAlertUI(alertBox, "Geolocation is not supported by your browser.", true);
    return;
  }

  showLoader(true, `Querying GPS coordinates for Admin ${actionType}...`);

  try {
    const pos = await getCurrentCoordinates();
    const lat = pos.coords.latitude;
    const lon = pos.coords.longitude;

    showLoader(true, `Resolving physical location & logging Admin ${actionType}...`);

    let resolvedAddress = "";
    try {
      resolvedAddress = await resolveGeolocationAddress(lat, lon);
    } catch (e) {
      resolvedAddress = `GPS: ${lat.toFixed(4)}, ${lon.toFixed(4)}`;
    }

    google.script.run
      .withFailureHandler(function(err) {
        showLoader(false);
        showAlertUI(alertBox, "Attendance Error: " + (err.message || err), true);
      })
      .withSuccessHandler(function(res) {
        showLoader(false);
        if (res.status === "success") {
          const finalLocation = (res.location && !res.location.includes("Offline/Cached") && !res.location.includes("Unknown"))
            ? res.location
            : resolvedAddress;

          const msg = `${res.action} recorded at ${res.time} (${finalLocation})`;
          showAlertUI(alertBox, msg, false);
          loadAdminDashboard('logsTab');
        } else {
          showAlertUI(alertBox, res.message || "Attendance action blocked.", true);
        }
      })
      .processActivityLog(
        CURRENT_ADMIN_USER.email,
        CURRENT_ADMIN_USER.firstName,
        CURRENT_ADMIN_USER.lastName,
        actionType,
        lat,
        lon,
        resolvedAddress
      );
  } catch (err) {
    showLoader(false);
    let errMsg = "GPS blocked: Please enable device location settings in your browser.";
    if (err.code === 2) errMsg = "Location unavailable. Please check your network or GPS connection.";
    if (err.code === 3) errMsg = "Location request timed out. Please try again.";
    showAlertUI(alertBox, errMsg, true);
  }
}

/**
 * TAB 1: ACTIVITY LOGS & LIVE TELEMETRY
 */
function applyAdminLogFilters() {
  const dateInput = document.getElementById("filterDate");
  const searchInput = document.getElementById("filterSearch");

  const selectedDate = dateInput ? dateInput.value.trim() : "";
  const searchQuery = searchInput ? searchInput.value.trim().toLowerCase() : "";

  let totalLogins = 0;
  let totalLogouts = 0;

  const filtered = CACHED_LOGS_ARRAY.filter(log => {
    const matchesDate = (selectedDate === "") || (log.date === selectedDate);
    const fullName = `${log.firstName || ""} ${log.lastName || ""}`.toLowerCase();
    const email = (log.email || "").toLowerCase();
    const matchesSearch = (searchQuery === "") || fullName.includes(searchQuery) || email.includes(searchQuery);

    if (matchesDate && matchesSearch) {
      if (log.action === "Clock In") totalLogins++;
      if (log.action === "Clock Out") totalLogouts++;
      return true;
    }
    return false;
  });

  const statLogins = document.getElementById("statLogins");
  const statLogouts = document.getElementById("statLogouts");
  const statDate = document.getElementById("statDateDisplay");

  if (statLogins) statLogins.innerText = totalLogins;
  if (statLogouts) statLogouts.innerText = totalLogouts;
  if (statDate) statDate.innerText = selectedDate || "All Time";

  const tbody = document.getElementById("logsTableBody");
  if (!tbody) return;

  if (filtered.length === 0) {
    tbody.innerHTML = `<tr><td colspan="5" class="text-center text-muted" style="padding: 2rem;">No telemetry logs match active filter criteria.</td></tr>`;
    renderPaginationBar("logsPagination", 0, TAB_PAGE_LIMITS.logs, "loadMoreLogs", "showAllLogs", "resetLogsPagination");
    return;
  }

  const visibleSlice = filtered.slice(0, TAB_PAGE_LIMITS.logs);

  tbody.innerHTML = visibleSlice.map(log => {
    const coordsDisplay = (log.lat && log.lon && log.lat !== "0")
      ? `<a href="https://maps.google.com/?q=${encodeURIComponent(log.lat + ',' + log.lon)}" target="_blank" rel="noopener noreferrer" class="cell-gps-pill" title="View coordinates on Google Maps" style="text-decoration: none; display: inline-flex; align-items: center; gap: 4px; margin-top: 4px;">📍 GPS: ${escapeHtml(log.lat)}, ${escapeHtml(log.lon)} ↗</a>`
      : `<span class="cell-gps-pill" style="color: var(--cda-slate-400); background: #f1f5f9; border-color: #e2e8f0; margin-top: 4px;">GPS: Telemetry standard</span>`;

    const editedTag = log.editedBy
      ? `<span class="cell-edited-pill">Edited: ${escapeHtml(log.editedBy)}</span>`
      : `<span class="text-muted" style="font-size: 0.75rem;">--</span>`;

    const actionBadge = log.action === "Clock In"
      ? `<span class="badge badge-teal">Clock In</span>`
      : `<span class="badge badge-warning">Clock Out</span>`;

    return `
      <tr>
        <td>
          <span class="cell-staff-name">${escapeHtml(log.firstName)} ${escapeHtml(log.lastName)}</span>
          <span class="cell-staff-email">${escapeHtml(log.email)}</span>
        </td>
        <td>
          <strong style="display:block; color: var(--cda-slate-800);">${log.date}</strong>
          <span class="text-muted font-mono" style="font-size: 0.75rem;">${log.time}</span>
        </td>
        <td>${actionBadge}</td>
        <td>
          <div style="font-weight: 500; color: var(--cda-slate-800);">${escapeHtml(log.location || 'Resolved Location')}</div>
          ${coordsDisplay}
        </td>
        <td>${editedTag}</td>
      </tr>
    `;
  }).join("");

  renderPaginationBar("logsPagination", filtered.length, TAB_PAGE_LIMITS.logs, "loadMoreLogs", "showAllLogs", "resetLogsPagination");
}

function resetAdminLogFilters() {
  TAB_PAGE_LIMITS.logs = PAGE_SIZE;
  const dateInput = document.getElementById("filterDate");
  const searchInput = document.getElementById("filterSearch");
  if (dateInput) dateInput.value = new Date().toISOString().split('T')[0];
  if (searchInput) searchInput.value = "";
  applyAdminLogFilters();
}

/**
 * Maintenance Utility: Re-resolves physical street addresses for historical activity logs
 */
function triggerReResolveLocations() {
  const btn = document.getElementById("btnReResolveLocations");
  if (!confirm("Re-resolve physical street addresses for historical activity logs showing cached or unresolved coordinates?")) {
    return;
  }

  if (btn) {
    btn.disabled = true;
    btn.innerText = "Resolving...";
  }
  showLoader(true, "Re-resolving historical log coordinates via LocationIQ API...");

  google.script.run
    .withFailureHandler(function(err) {
      showLoader(false);
      if (btn) {
        btn.disabled = false;
        btn.innerText = "📍 Re-resolve GPS";
      }
      alert("Failed to re-resolve locations: " + (err.message || err));
    })
    .withSuccessHandler(function(res) {
      showLoader(false);
      if (btn) {
        btn.disabled = false;
        btn.innerText = "📍 Re-resolve GPS";
      }
      const msg = res && res.message ? res.message : "Historical log locations successfully re-resolved.";
      alert(msg);
      loadAdminDashboard('logsTab');
    })
    .reResolveHistoricalLogLocations();
}

/**
 * TAB 2: DAILY SUMMARIES CONTROLLER
 */
function applyAdminSummaryFilters() {
  const dateInput = document.getElementById("filterSummaryDate");
  const searchInput = document.getElementById("filterSummarySearch");

  const selectedDate = dateInput ? dateInput.value.trim() : "";
  const searchQuery = searchInput ? searchInput.value.trim().toLowerCase() : "";

  const filtered = CACHED_SUMMARIES_ARRAY.filter(sum => {
    const matchesDate = (selectedDate === "") || (sum.date === selectedDate);
    const fullName = `${sum.firstName || ""} ${sum.lastName || ""}`.toLowerCase();
    const email = (sum.email || "").toLowerCase();
    const matchesSearch = (searchQuery === "") || fullName.includes(searchQuery) || email.includes(searchQuery);
    return matchesDate && matchesSearch;
  });

  renderSummariesTable(filtered);
}

function resetAdminSummaryFilters() {
  TAB_PAGE_LIMITS.summaries = PAGE_SIZE;
  const dateInput = document.getElementById("filterSummaryDate");
  const searchInput = document.getElementById("filterSummarySearch");
  if (dateInput) dateInput.value = "";
  if (searchInput) searchInput.value = "";
  applyAdminSummaryFilters();
}

function renderSummariesTable(summaries) {
  const tbody = document.getElementById("summariesTableBody");
  if (!tbody) return;

  if (!summaries || summaries.length === 0) {
    tbody.innerHTML = `<tr><td colspan="8" class="text-center text-muted" style="padding: 2rem;">No daily shift summaries found for active filters.</td></tr>`;
    renderPaginationBar("summariesPagination", 0, TAB_PAGE_LIMITS.summaries, "loadMoreSummaries", "showAllSummaries", "resetSummariesPagination");
    return;
  }

  const visibleSlice = summaries.slice(0, TAB_PAGE_LIMITS.summaries);

  tbody.innerHTML = visibleSlice.map(sum => {
    const statusBadge = sum.status === "Completed"
      ? `<span class="badge badge-success">Completed</span>`
      : `<span class="badge badge-warning">In Progress</span>`;

    const isOt = sum.overtime && sum.overtime !== "0 mins" && sum.overtime !== "N/A";
    const otBadge = isOt
      ? `<span class="badge badge-purple">${sum.overtime}</span>`
      : `<span class="text-muted" style="font-size: 0.8rem;">${sum.overtime || '0 mins'}</span>`;

    return `
      <tr>
        <td>
          <span class="cell-staff-name">${escapeHtml(sum.firstName)} ${escapeHtml(sum.lastName)}</span>
          <span class="cell-staff-email">${escapeHtml(sum.email)}</span>
        </td>
        <td><strong>${sum.date}</strong></td>
        <td>
          <span style="display:block; font-size: 0.775rem;">In: <strong>${sum.clockIn}</strong></span>
          <span style="display:block; font-size: 0.775rem; color: var(--cda-slate-500);">Out: <strong>${sum.clockOut}</strong></span>
        </td>
        <td>
          <span class="font-mono" style="display:block; font-size: 0.775rem; color: var(--cda-blue); font-weight: 700;">In: ${sum.floorIn}</span>
          <span class="font-mono" style="display:block; font-size: 0.775rem; color: var(--cda-orange); font-weight: 700;">Out: ${sum.floorOut}</span>
        </td>
        <td><strong style="color: var(--cda-navy); font-size: 0.9rem;">${sum.totalHours}</strong></td>
        <td>${otBadge}</td>
        <td>${statusBadge}</td>
        <td class="text-right" style="white-space: nowrap;">
          <button 
            type="button" 
            onclick="openSummaryEditModal('${sum.summaryId}', '${escapeHtml(sum.firstName)} ${escapeHtml(sum.lastName)}', '${sum.date}', '${sum.clockIn}', '${sum.clockOut}')" 
            class="btn btn-outline btn-sm"
          >
            Edit
          </button>
          <button 
            type="button" 
            onclick="deleteDailySummary('${sum.summaryId}', '${sum.date}', '${sum.email}')" 
            class="btn btn-outline-danger btn-sm"
            style="margin-left: 0.25rem;"
          >
            Delete
          </button>
        </td>
      </tr>
    `;
  }).join("");

  renderPaginationBar("summariesPagination", summaries.length, TAB_PAGE_LIMITS.summaries, "loadMoreSummaries", "showAllSummaries", "resetSummariesPagination");
}

function formatTimeForInput(timeStr) {
  if (!timeStr || timeStr === "--" || timeStr === "N/A") return "";
  const parts = String(timeStr).split(":");
  if (parts.length >= 2) {
    return `${parts[0].padStart(2, '0')}:${parts[1].padStart(2, '0')}:${parts.length > 2 ? parts[2].padStart(2, '0') : "00"}`;
  }
  return "";
}

function openSummaryEditModal(sumId, fullName, dateStr, clockIn, clockOut) {
  const modal = document.getElementById("editSummaryModal");
  if (!modal) return;

  document.getElementById("editSumId").value = sumId;
  document.getElementById("editSumName").innerText = fullName;
  document.getElementById("editSumDate").innerText = "Shift Date: " + dateStr;
  document.getElementById("editSumIn").value = formatTimeForInput(clockIn);
  document.getElementById("editSumOut").value = formatTimeForInput(clockOut);

  modal.classList.remove("hidden");
}

function closeSummaryEditModal() {
  const modal = document.getElementById("editSummaryModal");
  if (modal) modal.classList.add("hidden");
}

function handleSummaryUpdateSave(e) {
  e.preventDefault();
  const sumId = document.getElementById("editSumId").value;
  const newIn = document.getElementById("editSumIn").value;
  const newOut = document.getElementById("editSumOut").value;

  showLoader(true, "Updating shift timestamps & syncing summaries...");

  google.script.run
    .withFailureHandler(function(err) {
      showLoader(false);
      alert("Shift update failed: " + err.message);
    })
    .withSuccessHandler(function(res) {
      showLoader(false);
      closeSummaryEditModal();
      if (res.status === "success") {
        loadAdminDashboard('summariesTab');
      } else {
        alert("Error: " + res.message);
      }
    })
    .adminUpdateDailySummary(sumId, newIn, newOut, CURRENT_ADMIN_USER.email);
}

function deleteDailySummary(summaryId, dateStr, email) {
  if (!confirm(`Are you sure you want to permanently delete this shift on ${dateStr} for ${email}?\n\nThis will scrub underlying activity telemetry and recalculate weekly & monthly totals.`)) {
    return;
  }

  showLoader(true, "Scrubbing shift record...");

  google.script.run
    .withFailureHandler(function(err) {
      showLoader(false);
      alert("Delete Error: " + err.message);
    })
    .withSuccessHandler(function(res) {
      showLoader(false);
      if (res.status === "success") {
        loadAdminDashboard('summariesTab');
      } else {
        alert("Error: " + res.message);
      }
    })
    .adminDeleteDailySummary(summaryId, dateStr, email, CURRENT_ADMIN_USER.email);
}

/**
 * TAB 3: WEEKLY SUMMARIES & LEGAL COMPLIANCE
 */
function applyAdminWeeklyFilters() {
  const keyInput = document.getElementById("filterWeeklyKey");
  const searchInput = document.getElementById("filterWeeklySearch");

  const selectedKey = keyInput ? keyInput.value.trim().toUpperCase() : "";
  const searchQuery = searchInput ? searchInput.value.trim().toLowerCase() : "";

  const filtered = CACHED_WEEKLY_ARRAY.filter(w => {
    const weekKey = (w.weekKey || "").toUpperCase();
    const matchesWeek = (selectedKey === "") || weekKey.includes(selectedKey);
    const fullName = `${w.firstName || ""} ${w.lastName || ""}`.toLowerCase();
    const email = (w.email || "").toLowerCase();
    const matchesSearch = (searchQuery === "") || fullName.includes(searchQuery) || email.includes(searchQuery);
    return matchesWeek && matchesSearch;
  });

  renderWeeklyTable(filtered);
}

function resetAdminWeeklyFilters() {
  TAB_PAGE_LIMITS.weekly = PAGE_SIZE;
  const keyInput = document.getElementById("filterWeeklyKey");
  const searchInput = document.getElementById("filterWeeklySearch");
  if (keyInput) keyInput.value = "";
  if (searchInput) searchInput.value = "";
  applyAdminWeeklyFilters();
}

function renderWeeklyTable(weeklyData) {
  const tbody = document.getElementById("weeklyTableBody");
  if (!tbody) return;

  if (!weeklyData || weeklyData.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" class="text-center text-muted" style="padding: 2rem;">No weekly summary records match filter criteria.</td></tr>`;
    renderPaginationBar("weeklyPagination", 0, TAB_PAGE_LIMITS.weekly, "loadMoreWeekly", "showAllWeekly", "resetWeeklyPagination");
    return;
  }

  const visibleSlice = weeklyData.slice(0, TAB_PAGE_LIMITS.weekly);

  tbody.innerHTML = visibleSlice.map(w => {
    let complianceBadge = `<span class="badge compliance-under">Under Target (&lt;45 hrs)</span>`;
    if (w.complianceStatus.includes("MAX CAP ALERT")) {
      complianceBadge = `<span class="badge compliance-max-alert">🔴 MAX CAP ALERT (55+ hrs)</span>`;
    } else if (w.complianceStatus.includes("Target Met")) {
      complianceBadge = `<span class="badge compliance-met">Target Met (45-54 hrs)</span>`;
    }

    const isOt = w.totalOvertime && w.totalOvertime !== "0 mins" && w.totalOvertime !== "N/A";
    const otBadge = isOt
      ? `<span class="badge badge-purple">${w.totalOvertime}</span>`
      : `<span class="text-muted" style="font-size: 0.8rem;">${w.totalOvertime || '0 mins'}</span>`;

    return `
      <tr>
        <td>
          <span class="cell-staff-name">${escapeHtml(w.firstName)} ${escapeHtml(w.lastName)}</span>
          <span class="cell-staff-email">${escapeHtml(w.email)}</span>
        </td>
        <td><strong class="font-mono" style="color: var(--cda-blue);">${w.weekKey}</strong></td>
        <td><strong style="color: var(--cda-navy); font-size: 0.95rem;">${w.totalHours}</strong></td>
        <td>${otBadge}</td>
        <td><span style="font-weight: 600;">${w.daysWorked} days</span></td>
        <td>${complianceBadge}</td>
      </tr>
    `;
  }).join("");

  renderPaginationBar("weeklyPagination", weeklyData.length, TAB_PAGE_LIMITS.weekly, "loadMoreWeekly", "showAllWeekly", "resetWeeklyPagination");
}

/**
 * TAB 4: MONTHLY SUMMARIES
 */
function applyAdminMonthlyFilters() {
  const monthInput = document.getElementById("filterMonthlyMonth");
  const searchInput = document.getElementById("filterMonthlySearch");

  const selectedMonth = monthInput ? monthInput.value.trim() : "";
  const searchQuery = searchInput ? searchInput.value.trim().toLowerCase() : "";

  const filtered = CACHED_MONTHLY_ARRAY.filter(m => {
    const matchesMonth = (selectedMonth === "") || (m.month === selectedMonth);
    const fullName = `${m.firstName || ""} ${m.lastName || ""}`.toLowerCase();
    const email = (m.email || "").toLowerCase();
    const matchesSearch = (searchQuery === "") || fullName.includes(searchQuery) || email.includes(searchQuery);
    return matchesMonth && matchesSearch;
  });

  renderMonthlyTable(filtered);
}

function resetAdminMonthlyFilters() {
  TAB_PAGE_LIMITS.monthly = PAGE_SIZE;
  const monthInput = document.getElementById("filterMonthlyMonth");
  const searchInput = document.getElementById("filterMonthlySearch");
  if (monthInput) monthInput.value = "";
  if (searchInput) searchInput.value = "";
  applyAdminMonthlyFilters();
}

function renderMonthlyTable(monthlyData) {
  const tbody = document.getElementById("monthlyTableBody");
  if (!tbody) return;

  if (!monthlyData || monthlyData.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" class="text-center text-muted" style="padding: 2rem;">No monthly summaries match filter configuration.</td></tr>`;
    renderPaginationBar("monthlyPagination", 0, TAB_PAGE_LIMITS.monthly, "loadMoreMonthly", "showAllMonthly", "resetMonthlyPagination");
    return;
  }

  const visibleSlice = monthlyData.slice(0, TAB_PAGE_LIMITS.monthly);

  tbody.innerHTML = visibleSlice.map(m => {
    const isOt = m.totalOvertime && m.totalOvertime !== "0 mins" && m.totalOvertime !== "N/A";
    const otBadge = isOt
      ? `<span class="badge badge-purple">${m.totalOvertime}</span>`
      : `<span class="text-muted" style="font-size: 0.8rem;">${m.totalOvertime || '0 mins'}</span>`;

    return `
      <tr>
        <td>
          <span class="cell-staff-name">${escapeHtml(m.firstName)} ${escapeHtml(m.lastName)}</span>
          <span class="cell-staff-email">${escapeHtml(m.email)}</span>
        </td>
        <td><strong class="font-mono" style="color: var(--cda-navy);">${m.month}</strong></td>
        <td><strong style="color: var(--cda-navy); font-size: 0.95rem;">${m.totalHours}</strong></td>
        <td>${otBadge}</td>
        <td><span class="badge badge-success">${m.daysWorked} days</span></td>
        <td><span class="font-mono text-muted" style="font-size: 0.75rem;">${m.lastUpdated}</span></td>
      </tr>
    `;
  }).join("");

  renderPaginationBar("monthlyPagination", monthlyData.length, TAB_PAGE_LIMITS.monthly, "loadMoreMonthly", "showAllMonthly", "resetMonthlyPagination");
}

/**
 * TAB 5: LEAVE REQUESTS APPROVALS
 */
function renderLeaveRequestsTable(requests) {
  const tbody = document.getElementById("leaveTableBody");
  if (!tbody) return;

  if (!requests || requests.length === 0) {
    tbody.innerHTML = `<tr><td colspan="5" class="text-center text-muted" style="padding: 2rem;">No leave applications on record.</td></tr>`;
    renderPaginationBar("leavePagination", 0, TAB_PAGE_LIMITS.leave, "loadMoreLeave", "showAllLeave", "resetLeavePagination");
    return;
  }

  const visibleSlice = requests.slice(0, TAB_PAGE_LIMITS.leave);

  tbody.innerHTML = visibleSlice.map(req => {
    let statusBadge = `<span class="badge badge-warning">Pending</span>`;
    if (req.status === "Approved") statusBadge = `<span class="badge badge-success">Approved</span>`;
    if (req.status === "Rejected") statusBadge = `<span class="badge badge-danger">Rejected</span>`;

    const actions = req.status === "Pending" ? `
      <div style="display: flex; justify-content: flex-end; gap: 0.5rem;">
        <button type="button" onclick="handleLeaveAction('${req.reqId}', 'Approved')" class="btn btn-secondary btn-sm">Approve</button>
        <button type="button" onclick="handleLeaveAction('${req.reqId}', 'Rejected')" class="btn btn-outline-danger btn-sm">Reject</button>
      </div>
    ` : `<span class="text-muted" style="font-size: 0.8rem; font-style: italic;">Resolved</span>`;

    return `
      <tr>
        <td>
          <span class="cell-staff-name">${escapeHtml(req.firstName)} ${escapeHtml(req.lastName)}</span>
          <span class="cell-staff-email">${escapeHtml(req.email)}</span>
        </td>
        <td><strong style="color: var(--cda-slate-800);">${escapeHtml(req.type)} Leave</strong></td>
        <td>
          <span style="font-size: 0.8rem; font-weight: 600;">${req.startDate}</span>
          <span class="text-muted" style="font-size: 0.75rem;"> to </span>
          <span style="font-size: 0.8rem; font-weight: 600;">${req.endDate}</span>
        </td>
        <td>${statusBadge}</td>
        <td class="text-right">${actions}</td>
      </tr>
    `;
  }).join("");

  renderPaginationBar("leavePagination", requests.length, TAB_PAGE_LIMITS.leave, "loadMoreLeave", "showAllLeave", "resetLeavePagination");
}

function handleLeaveAction(reqId, newStatus) {
  showLoader(true, `Updating leave application to ${newStatus}...`);

  google.script.run
    .withFailureHandler(function(err) {
      showLoader(false);
      alert("Action Error: " + err.message);
    })
    .withSuccessHandler(function(res) {
      showLoader(false);
      if (res.status === "success") {
        loadAdminDashboard('leaveTab');
      } else {
        alert("Error: " + res.message);
      }
    })
    .adminUpdateLeaveStatus(reqId, newStatus);
}

/**
 * TAB 6: STAFF DIRECTORY & PROFILES
 */
function renderStaffProfilesTable(employees) {
  const tbody = document.getElementById("usersTableBody");
  if (!tbody) return;

  if (!employees || employees.length === 0) {
    tbody.innerHTML = `<tr><td colspan="4" class="text-center text-muted" style="padding: 2rem;">No registered staff profiles found.</td></tr>`;
    renderPaginationBar("usersPagination", 0, TAB_PAGE_LIMITS.users, "loadMoreUsers", "showAllUsers", "resetUsersPagination");
    return;
  }

  const visibleSlice = employees.slice(0, TAB_PAGE_LIMITS.users);

  tbody.innerHTML = visibleSlice.map(emp => {
    const workBadge = emp.workStatus === "On Leave"
      ? `<span class="badge badge-warning">On Leave</span>`
      : `<span class="badge badge-success">Active</span>`;

    const standingBadge = emp.accountStanding === "Verified"
      ? `<span class="badge badge-teal">Verified</span>`
      : `<span class="badge badge-danger">Blocked</span>`;

    return `
      <tr>
        <td>
          <span class="cell-staff-name">${escapeHtml(emp.firstName)} ${escapeHtml(emp.lastName)}</span>
          <span class="cell-staff-email">${escapeHtml(emp.email)}</span>
        </td>
        <td>${workBadge}</td>
        <td>${standingBadge}</td>
        <td class="text-right">
          <button 
            type="button" 
            onclick="openEditModal('${escapeHtml(emp.email)}', '${escapeHtml(emp.firstName)}', '${escapeHtml(emp.lastName)}', '${emp.accountStanding}')" 
            class="btn btn-outline btn-sm"
          >
            Manage
          </button>
        </td>
      </tr>
    `;
  }).join("");

  renderPaginationBar("usersPagination", employees.length, TAB_PAGE_LIMITS.users, "loadMoreUsers", "showAllUsers", "resetUsersPagination");
}

function openEditModal(email, first, last, status) {
  const modal = document.getElementById("editModal");
  if (!modal) return;

  document.getElementById("editEmail").value = email;
  document.getElementById("editFirst").value = first;
  document.getElementById("editLast").value = last;
  document.getElementById("editStatus").value = status;
  document.getElementById("editPassword").value = "";

  modal.classList.remove("hidden");
}

function closeEditModal() {
  const modal = document.getElementById("editModal");
  if (modal) modal.classList.add("hidden");
}

function handleAdminUpdateSave(e) {
  e.preventDefault();
  const email = document.getElementById("editEmail").value;
  const first = document.getElementById("editFirst").value.trim();
  const last = document.getElementById("editLast").value.trim();
  const status = document.getElementById("editStatus").value;
  const newPassword = document.getElementById("editPassword").value;

  showLoader(true, "Updating employee profile...");

  google.script.run
    .withFailureHandler(function(err) {
      showLoader(false);
      alert("Profile update failed: " + err.message);
    })
    .withSuccessHandler(function(res) {
      showLoader(false);
      closeEditModal();
      if (res.status === "success") {
        loadAdminDashboard('usersTab');
      } else {
        alert("Error: " + res.message);
      }
    })
    .adminUpdateUser(email, first, last, status, newPassword);
}

/**
 * TAB 7: TIMESHEET EXPORTS CONTROLLER
 */
function populateExportEmployeeDropdown(employees) {
  const select = document.getElementById("exportEmail");
  if (!select) return;

  select.innerHTML = "";
  
  const optAll = document.createElement("option");
  optAll.value = "ALL";
  optAll.text = "All Employees (Zip Archive Only)";
  select.appendChild(optAll);

  employees.forEach(emp => {
    const opt = document.createElement("option");
    opt.value = emp.email;
    opt.text = `${emp.firstName} ${emp.lastName} (${emp.email})`;
    select.appendChild(opt);
  });
}

function handleExport(format) {
  const email = document.getElementById("exportEmail").value;
  const startDate = document.getElementById("exportStart").value;
  const endDate = document.getElementById("exportEnd").value;
  const alertBox = document.getElementById("exportAlert");

  if (email === "ALL") {
    showAlertUI(alertBox, "PDF and CSV exports require a single employee selection. For all employees, click 'Export Timesheets (.zip)'.", true);
    return;
  }

  if (!startDate || !endDate) {
    showAlertUI(alertBox, "Please select both a Start Date and an End Date.", true);
    return;
  }

  if (new Date(startDate) > new Date(endDate)) {
    showAlertUI(alertBox, "Start Date cannot be after End Date.", true);
    return;
  }

  if (alertBox) alertBox.classList.add("hidden");
  showLoader(true, `Generating standardized ${format.toUpperCase()} timesheet...`);

  google.script.run
    .withFailureHandler(function(err) {
      showLoader(false);
      showAlertUI(alertBox, "Export Error: " + err.message, true);
    })
    .withSuccessHandler(function(res) {
      showLoader(false);
      if (res.status === "success") {
        triggerNativeDownload(res.base64, res.mimeType, res.filename);
        showAlertUI(alertBox, `${format.toUpperCase()} Timesheet successfully compiled and downloaded.`, false);
      } else {
        showAlertUI(alertBox, "Export Error: " + res.message, true);
      }
    })
    .exportTimesheetData(email, startDate, endDate, format);
}

function requestZipExport() {
  const email = document.getElementById("exportEmail").value;
  const startDate = document.getElementById("exportStart").value;
  const endDate = document.getElementById("exportEnd").value;
  const alertBox = document.getElementById("exportAlert");

  const btn = document.getElementById("btnDownloadZip");
  const spinner = document.getElementById("spinnerZip");
  const text = document.getElementById("textZip");

  if (!startDate || !endDate) {
    showAlertUI(alertBox, "Please select both a Start Date and an End Date.", true);
    return;
  }

  if (new Date(startDate) > new Date(endDate)) {
    showAlertUI(alertBox, "Start Date cannot be after End Date.", true);
    return;
  }

  if (alertBox) alertBox.classList.add("hidden");
  if (btn) btn.classList.add("disabled");
  if (spinner) spinner.classList.remove("hidden");
  if (text) text.innerText = "Compiling Archive...";

  google.script.run
    .withFailureHandler(function(err) {
      resetZipButton();
      showAlertUI(alertBox, "ZIP Export Error: " + err.message, true);
    })
    .withSuccessHandler(function(res) {
      resetZipButton();
      if (res.status === "success") {
        triggerNativeDownload(res.base64, res.mimeType, res.filename);
        showAlertUI(alertBox, "ZIP Archive generated and downloaded successfully.", false);
      } else {
        showAlertUI(alertBox, "Export Error: " + res.message, true);
      }
    })
    .generateTimesheetsZip(email, startDate, endDate);
}

function resetZipButton() {
  const btn = document.getElementById("btnDownloadZip");
  const spinner = document.getElementById("spinnerZip");
  const text = document.getElementById("textZip");

  if (btn) btn.classList.remove("disabled");
  if (spinner) spinner.classList.add("hidden");
  if (text) text.innerText = "Export Timesheets (.zip)";
}

function handleAdminLogout() {
  if (confirm("Sign out of CDA Admin Dashboard?")) {
    logout(LOGIN_URL);
  }
}

function escapeHtml(str) {
  if (!str) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
