/**
 * ============================================================================
 * CDA SOLUTIONS - ADMIN DASHBOARD CONTROLLER (admin.js)
 * Management Dashboard: Telemetry Logs, Daily Summaries, Weekly & Monthly
 * Legal Compliance, Leave Approvals, Staff Profiles & Timesheet Exports.
 * ============================================================================
 */

const LOGIN_URL = "../index.html";

let CURRENT_ADMIN_USER = null;
let CACHED_LOGS_ARRAY = [];
let CACHED_SUMMARIES_ARRAY = [];
let CACHED_WEEKLY_ARRAY = [];
let CACHED_MONTHLY_ARRAY = [];
let CACHED_LEAVE_ARRAY = [];
let CACHED_EMPLOYEES_ARRAY = [];

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
 * Loads all database tables from Google Apps Script backend
 */
function loadAdminDashboard() {
  showLoader(true, "Synchronizing CDA database records...");

  google.script.run
    .withFailureHandler(function(err) {
      showLoader(false);
      alert("System Connection Error: " + err.message);
    })
    .withSuccessHandler(function(res) {
      showLoader(false);
      if (res.status === "success") {
        CACHED_LOGS_ARRAY = res.logs || [];
        CACHED_SUMMARIES_ARRAY = res.summaries || [];
        CACHED_WEEKLY_ARRAY = res.weeklySummaries || [];
        CACHED_MONTHLY_ARRAY = res.monthlySummaries || [];
        CACHED_LEAVE_ARRAY = res.leaveRequests || [];
        CACHED_EMPLOYEES_ARRAY = res.employees || [];

        // Set initial filter values to today
        const todayStr = new Date().toISOString().split('T')[0];
        const currentMonthStr = todayStr.substring(0, 7);

        const filterDate = document.getElementById("filterDate");
        const filterSummaryDate = document.getElementById("filterSummaryDate");
        const filterMonthlyMonth = document.getElementById("filterMonthlyMonth");

        if (filterDate && !filterDate.value) filterDate.value = todayStr;
        if (filterSummaryDate && !filterSummaryDate.value) filterSummaryDate.value = todayStr;
        if (filterMonthlyMonth && !filterMonthlyMonth.value) filterMonthlyMonth.value = currentMonthStr;

        // Render sections
        renderStaffProfilesTable(CACHED_EMPLOYEES_ARRAY);
        renderLeaveRequestsTable(CACHED_LEAVE_ARRAY);
        populateExportEmployeeDropdown(CACHED_EMPLOYEES_ARRAY);

        applyAdminLogFilters();
        applyAdminSummaryFilters();
        applyAdminWeeklyFilters();
        applyAdminMonthlyFilters();
      } else {
        alert("Database Error: " + res.message);
      }
    })
    .getAdminDashboardData();
}

/**
 * TAB SWITCHING CONTROLLER
 */
function switchAdminTab(tabName) {
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
  } else {
    clockPanel.classList.add("hidden");
    if (toggleBtnText) toggleBtnText.innerText = "My Shift Clock In / Out";
  }
}

function triggerAdminClockAction(actionType) {
  const alertBox = document.getElementById("adminLogAlert");
  if (alertBox) alertBox.classList.add("hidden");

  if (!navigator.geolocation) {
    showAlertUI(alertBox, "Geolocation is not supported by your browser.", true);
    return;
  }

  showLoader(true, `Querying GPS coordinates for Admin ${actionType}...`);

  navigator.geolocation.getCurrentPosition(
    function(pos) {
      const lat = pos.coords.latitude;
      const lon = pos.coords.longitude;

      showLoader(true, `Logging ${actionType} with reverse geocoding...`);

      google.script.run
        .withFailureHandler(function(err) {
          showLoader(false);
          showAlertUI(alertBox, "Attendance Error: " + err.message, true);
        })
        .withSuccessHandler(function(res) {
          showLoader(false);
          if (res.status === "success") {
            const msg = `${res.action} recorded at ${res.time} (${res.location})`;
            showAlertUI(alertBox, msg, false);
            loadAdminDashboard();
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
          lon
        );
    },
    function(err) {
      showLoader(false);
      showAlertUI(alertBox, "GPS blocked: Please enable device location settings in your browser.", true);
    },
    { enableHighAccuracy: true, timeout: 12000, maximumAge: 0 }
  );
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
    const fullName = `${log.firstName} ${log.lastName}`.toLowerCase();
    const matchesSearch = (searchQuery === "") || fullName.includes(searchQuery) || log.email.toLowerCase().includes(searchQuery);

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
    return;
  }

  tbody.innerHTML = filtered.map(log => {
    const coordsDisplay = (log.lat && log.lon && log.lat !== "0")
      ? `<span class="cell-gps-pill">GPS: ${log.lat}, ${log.lon}</span>`
      : `<span class="cell-gps-pill" style="color: var(--cda-slate-400); background: #f1f5f9; border-color: #e2e8f0;">GPS: Telemetry standard</span>`;

    const editedTag = log.editedBy
      ? `<span class="cell-edited-pill">Edited: ${log.editedBy}</span>`
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
}

function resetAdminLogFilters() {
  const dateInput = document.getElementById("filterDate");
  const searchInput = document.getElementById("filterSearch");
  if (dateInput) dateInput.value = new Date().toISOString().split('T')[0];
  if (searchInput) searchInput.value = "";
  applyAdminLogFilters();
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
    const fullName = `${sum.firstName} ${sum.lastName}`.toLowerCase();
    const matchesSearch = (searchQuery === "") || fullName.includes(searchQuery) || sum.email.toLowerCase().includes(searchQuery);
    return matchesDate && matchesSearch;
  });

  renderSummariesTable(filtered);
}

function resetAdminSummaryFilters() {
  const dateInput = document.getElementById("filterSummaryDate");
  const searchInput = document.getElementById("filterSummarySearch");
  if (dateInput) dateInput.value = "";
  if (searchInput) searchInput.value = "";
  applyAdminSummaryFilters();
}

function renderSummariesTable(summaries) {
  const tbody = document.getElementById("summariesTableBody");
  if (!tbody) return;

  if (summaries.length === 0) {
    tbody.innerHTML = `<tr><td colspan="8" class="text-center text-muted" style="padding: 2rem;">No daily shift summaries found for active filters.</td></tr>`;
    return;
  }

  tbody.innerHTML = summaries.map(sum => {
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
        loadAdminDashboard();
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
        loadAdminDashboard();
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
    const matchesWeek = (selectedKey === "") || (w.weekKey.toUpperCase().includes(selectedKey));
    const fullName = `${w.firstName} ${w.lastName}`.toLowerCase();
    const matchesSearch = (searchQuery === "") || fullName.includes(searchQuery) || w.email.toLowerCase().includes(searchQuery);
    return matchesWeek && matchesSearch;
  });

  renderWeeklyTable(filtered);
}

function resetAdminWeeklyFilters() {
  const keyInput = document.getElementById("filterWeeklyKey");
  const searchInput = document.getElementById("filterWeeklySearch");
  if (keyInput) keyInput.value = "";
  if (searchInput) searchInput.value = "";
  applyAdminWeeklyFilters();
}

function renderWeeklyTable(weeklyData) {
  const tbody = document.getElementById("weeklyTableBody");
  if (!tbody) return;

  if (weeklyData.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" class="text-center text-muted" style="padding: 2rem;">No weekly summary records match filter criteria.</td></tr>`;
    return;
  }

  tbody.innerHTML = weeklyData.map(w => {
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
    const fullName = `${m.firstName} ${m.lastName}`.toLowerCase();
    const matchesSearch = (searchQuery === "") || fullName.includes(searchQuery) || m.email.toLowerCase().includes(searchQuery);
    return matchesMonth && matchesSearch;
  });

  renderMonthlyTable(filtered);
}

function resetAdminMonthlyFilters() {
  const monthInput = document.getElementById("filterMonthlyMonth");
  const searchInput = document.getElementById("filterMonthlySearch");
  if (monthInput) monthInput.value = "";
  if (searchInput) searchInput.value = "";
  applyAdminMonthlyFilters();
}

function renderMonthlyTable(monthlyData) {
  const tbody = document.getElementById("monthlyTableBody");
  if (!tbody) return;

  if (monthlyData.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" class="text-center text-muted" style="padding: 2rem;">No monthly summaries match filter configuration.</td></tr>`;
    return;
  }

  tbody.innerHTML = monthlyData.map(m => {
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
}

/**
 * TAB 5: LEAVE REQUESTS APPROVALS
 */
function renderLeaveRequestsTable(requests) {
  const tbody = document.getElementById("leaveTableBody");
  if (!tbody) return;

  if (requests.length === 0) {
    tbody.innerHTML = `<tr><td colspan="5" class="text-center text-muted" style="padding: 2rem;">No leave applications on record.</td></tr>`;
    return;
  }

  tbody.innerHTML = requests.map(req => {
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
        loadAdminDashboard();
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

  if (employees.length === 0) {
    tbody.innerHTML = `<tr><td colspan="4" class="text-center text-muted" style="padding: 2rem;">No registered staff profiles found.</td></tr>`;
    return;
  }

  tbody.innerHTML = employees.map(emp => {
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
        loadAdminDashboard();
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
