/**
 * ============================================================================
 * CDA SOLUTIONS - EMPLOYEE ATTENDANCE CONTROLLER (employee.js)
 * ============================================================================
 */

const LOGIN_URL = "../index.html";

let CURRENT_EMPLOYEE = null;
let CURRENT_SHIFT_STATUS = null;

document.addEventListener("DOMContentLoaded", function () {
  // Enforce session presence & role
  const session = requireSession("Employee", LOGIN_URL);
  if (!session) return;

  CURRENT_EMPLOYEE = session.user;

  // Initialize UI with Employee information
  const greetingEl = document.getElementById("employeeGreeting");
  const emailEl = document.getElementById("employeeEmail");
  const avatarEl = document.getElementById("employeeAvatar");

  if (greetingEl) {
    greetingEl.innerText = `${CURRENT_EMPLOYEE.firstName} ${CURRENT_EMPLOYEE.lastName}`;
  }
  if (emailEl) {
    emailEl.innerText = CURRENT_EMPLOYEE.email;
  }
  if (avatarEl) {
    const fInitial = CURRENT_EMPLOYEE.firstName ? CURRENT_EMPLOYEE.firstName.charAt(0).toUpperCase() : "C";
    const lInitial = CURRENT_EMPLOYEE.lastName ? CURRENT_EMPLOYEE.lastName.charAt(0).toUpperCase() : "D";
    avatarEl.innerText = `${fInitial}${lInitial}`;
  }

  // Restore cached shift status ONLY if it matches today's date
  const localToday = new Date();
  const todayStr = `${localToday.getFullYear()}-${String(localToday.getMonth() + 1).padStart(2, '0')}-${String(localToday.getDate()).padStart(2, '0')}`;

  if (session.todayShift && session.todayShift.date === todayStr) {
    updateEmployeeShiftUI(session.todayShift);
  } else {
    // Clear stale shift from a previous day to prevent false "Shift completed" lock
    updateSessionShift(null);
    updateEmployeeShiftUI({
      date: todayStr,
      clockIn: "--",
      clockOut: "--",
      floorIn: "--",
      floorOut: "--",
      totalHours: "--",
      status: "Not Started",
      hasClockedIn: false,
      hasClockedOut: false
    });
  }

  // Synchronize live shift status from backend
  fetchTodayShiftStatus();

  // Start live clock
  startLiveClock();

  // Initialize live geolocation status
  initGeoStatusDisplay();
});

function fetchTodayShiftStatus() {
  if (!CURRENT_EMPLOYEE || !CURRENT_EMPLOYEE.email) return;

  google.script.run
    .withFailureHandler(function (err) {
      console.warn("Could not retrieve real-time shift status:", err);
    })
    .withSuccessHandler(function (res) {
      if (res && res.status === "success") {
        if (res.todayShift) {
          updateEmployeeShiftUI(res.todayShift);
          updateSessionShift(res.todayShift);
        }
        if (res.leaveInfo) {
          updateEmployeeLeaveBadge(res.leaveInfo);
        }
      }
    })
    .getTodayShiftStatus(CURRENT_EMPLOYEE.email);
}

function updateEmployeeShiftUI(shift) {
  CURRENT_SHIFT_STATUS = shift;

  const btnIn = document.getElementById("btnClockIn");
  const btnOut = document.getElementById("btnClockOut");
  const inSub = document.getElementById("clockInSubtext");
  const outSub = document.getElementById("clockOutSubtext");
  const inBadge = document.getElementById("clockInBadge");
  const outBadge = document.getElementById("clockOutBadge");

  if (!btnIn || !btnOut) return;

  const hasIn = shift && (shift.hasClockedIn || (shift.clockIn && shift.clockIn !== "--"));
  const hasOut = shift && (shift.hasClockedOut || (shift.clockOut && shift.clockOut !== "--"));
  const isCompleted = shift && (shift.status === "Completed" || hasOut);

  if (isCompleted) {
    btnIn.disabled = true;
    btnIn.title = "Shift finalized for today";
    if (inSub) inSub.innerText = "Shift completed for today";
    if (inBadge) {
      inBadge.classList.remove("hidden");
      inBadge.innerText = `✓ In: ${shift.clockIn || "--"}`;
    }

    btnOut.disabled = true;
    btnOut.title = "Shift finalized for today";
    if (outSub) outSub.innerText = `Shift finalized (${shift.clockOut || "--"})`;
    if (outBadge) {
      outBadge.classList.remove("hidden");
      outBadge.innerText = "✓ Completed";
    }
  } else if (hasIn) {
    btnIn.disabled = true;
    btnIn.title = `Already clocked in at ${shift.clockIn}`;
    if (inSub) {
      const displayInTime = shift.floorIn && shift.floorIn !== "--" ? shift.floorIn : shift.clockIn;
      inSub.innerText = `Active shift since ${displayInTime}`;
    }
    if (inBadge) {
      inBadge.classList.remove("hidden");
      inBadge.innerText = "✓ Clocked In";
    }

    btnOut.disabled = false;
    btnOut.title = "Conclude your shift for today";
    if (outSub) outSub.innerText = "End Daily Shift & GPS";
    if (outBadge) {
      outBadge.classList.add("hidden");
    }
  } else {
    // Has not clocked in yet -> strictly forbid clock-out
    btnIn.disabled = false;
    btnIn.title = "Clock in for your morning shift";
    if (inSub) inSub.innerText = "Start Daily Shift";
    if (inBadge) {
      inBadge.classList.add("hidden");
    }

    btnOut.disabled = true;
    btnOut.title = "You cannot clock out until you have clocked in for today";
    if (outSub) outSub.innerText = "Clock in first to enable clock out";
    if (outBadge) {
      outBadge.classList.remove("hidden");
      outBadge.innerText = "Clock-In Required";
    }
  }
}

function startLiveClock() {
  function updateTime() {
    const now = new Date();
    const timeEl = document.getElementById("liveTime");
    const dateEl = document.getElementById("liveDate");

    if (timeEl) {
      const hours = String(now.getHours()).padStart(2, '0');
      const mins = String(now.getMinutes()).padStart(2, '0');
      const secs = String(now.getSeconds()).padStart(2, '0');
      timeEl.innerText = `${hours}:${mins}:${secs}`;
    }

    if (dateEl) {
      const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
      dateEl.innerText = now.toLocaleDateString(undefined, options);
    }
  }

  updateTime();
  setInterval(updateTime, 1000);
}

function updateGeoStatus(state, message, timestamp = null) {
  const box = document.getElementById("geoStatusBox");
  const icon = document.getElementById("geoStatusIcon");
  const text = document.getElementById("geoStatusText");
  if (!box || !text) return;

  box.classList.remove("geo-status-ready", "geo-status-acquiring", "geo-status-locked", "geo-status-error");

  if (state === "acquiring" || state === "resolving") {
    box.classList.add("geo-status-acquiring");
    if (icon) icon.innerText = "📡";
    text.innerHTML = `<span class="geo-pulse-dot"></span> ${escapeHtml(message)}`;
  } else if (state === "locked") {
    box.classList.add("geo-status-locked");
    if (icon) icon.innerText = "📍";
    const timeStr = timestamp ? ` <span class="text-muted" style="font-size: 0.72rem;">(${escapeHtml(timestamp)})</span>` : "";
    text.innerHTML = `<strong>Verified Location:</strong> ${escapeHtml(message)}${timeStr}`;
  } else if (state === "error") {
    box.classList.add("geo-status-error");
    if (icon) icon.innerText = "⚠️";
    text.innerHTML = `<span style="color: var(--cda-rose-600); font-weight: 500;">${escapeHtml(message)}</span>`;
  } else {
    box.classList.add("geo-status-ready");
    if (icon) icon.innerText = "📍";
    text.innerText = message || "GPS reverse-geocoding actively verifies your physical shift location.";
  }
}

function initGeoStatusDisplay() {
  if (!navigator.geolocation) {
    updateGeoStatus("error", "Geolocation is not supported by your current browser device.");
    return;
  }

  if (navigator.permissions && navigator.permissions.query) {
    navigator.permissions.query({ name: "geolocation" }).then(function (perm) {
      if (perm.state === "granted") {
        updateGeoStatus("ready", "GPS active & verified. Ready to record physical shift coordinates.");
      } else if (perm.state === "denied") {
        updateGeoStatus("error", "GPS permissions blocked in browser. Please allow location access to clock in/out.");
      } else {
        updateGeoStatus("ready", "GPS reverse-geocoding actively verifies your physical shift location.");
      }

      perm.onchange = function () {
        initGeoStatusDisplay();
      };
    }).catch(function () {
      updateGeoStatus("ready", "GPS reverse-geocoding actively verifies your physical shift location.");
    });
  } else {
    updateGeoStatus("ready", "GPS reverse-geocoding actively verifies your physical shift location.");
  }
}

async function triggerClockAction(actionType) {
  const alertBox = document.getElementById("employeeAlert");
  if (alertBox) alertBox.classList.add("hidden");

  // Strict Client-Side Guard: Prevent Clock Out without Clock In
  if (actionType === "Clock Out") {
    const isClockedIn = CURRENT_SHIFT_STATUS && (CURRENT_SHIFT_STATUS.hasClockedIn || (CURRENT_SHIFT_STATUS.clockIn && CURRENT_SHIFT_STATUS.clockIn !== "--"));
    if (!isClockedIn) {
      showAlertUI(
        alertBox,
        "Action Blocked: You cannot clock out because you have not clocked in for today yet. Please clock in first.",
        true
      );
      return;
    }
  }

  // Attempt Geolocation acquisition with graceful fallback for desktop/timeout/denied
  let lat = "0";
  let lon = "0";
  let resolvedAddress = "Location Unavailable (GPS Off/Desktop)";

  if (navigator.geolocation) {
    updateGeoStatus("acquiring", `Querying GPS coordinates for ${actionType}...`);
    showLoader(true, `Querying GPS coordinates for ${actionType}...`);

    try {
      const pos = await getCurrentCoordinates({ highAccuracyTimeout: 6000, standardTimeout: 8000 });
      lat = String(pos.coords.latitude);
      lon = String(pos.coords.longitude);

      updateGeoStatus("resolving", `Resolving physical street address...`);
      showLoader(true, `Resolving physical location & logging ${actionType}...`);

      try {
        resolvedAddress = await resolveGeolocationAddress(lat, lon);
      } catch (e) {
        resolvedAddress = `GPS: ${Number(lat).toFixed(4)}, ${Number(lon).toFixed(4)}`;
      }
    } catch (geoErr) {
      console.warn("GPS resolution could not complete:", geoErr);
      let reason = "Location unavailable";
      if (geoErr && geoErr.code === 1) reason = "Location access denied";
      else if (geoErr && geoErr.code === 2) reason = "GPS position unavailable";
      else if (geoErr && geoErr.code === 3) reason = "GPS request timed out";

      resolvedAddress = `Unverified Location (${reason})`;
      updateGeoStatus("error", `GPS note: ${reason}. Continuing shift record.`);
    }
  } else {
    updateGeoStatus("error", "Geolocation not supported by device. Continuing shift record.");
  }

  showLoader(true, `Recording ${actionType} with CDA Solutions...`);

  google.script.run
    .withFailureHandler(function (err) {
      showLoader(false);
      updateGeoStatus("error", "Attendance Error: " + (err.message || err));
      showAlertUI(alertBox, "Attendance Error: " + (err.message || err), true);
    })
    .withSuccessHandler(function (res) {
      showLoader(false);
      if (res && res.status === "success") {
        const finalLocation = (res.location && !res.location.includes("Offline/Cached") && !res.location.includes("Unknown"))
          ? res.location
          : resolvedAddress;

        const feedback = `${res.action} confirmed at ${res.time} (${finalLocation})`;
        showAlertUI(alertBox, feedback, false);
        updateGeoStatus("locked", finalLocation, res.time);

        if (actionType === "Clock In") {
          const floorInVal = res.floorIn || calculateFloorIn(res.time);
          const newShift = {
            date: res.date,
            clockIn: res.time,
            clockOut: "--",
            floorIn: floorInVal,
            floorOut: "--",
            status: "In Progress",
            hasClockedIn: true,
            hasClockedOut: false,
            location: finalLocation
          };
          updateEmployeeShiftUI(newShift);
          updateSessionShift(newShift);
          // Sync with backend
          fetchTodayShiftStatus();
        } else if (actionType === "Clock Out") {
          const updatedShift = CURRENT_SHIFT_STATUS || {};
          updatedShift.hasClockedOut = true;
          updatedShift.clockOut = res.time;
          updatedShift.floorIn = res.floorIn || updatedShift.floorIn || "--";
          updatedShift.floorOut = res.floorOut || updatedShift.floorOut || "--";
          updatedShift.totalHours = res.totalHours || updatedShift.totalHours || "--";
          updatedShift.status = "Completed";
          updatedShift.location = finalLocation;
          updateEmployeeShiftUI(updatedShift);
          updateSessionShift(updatedShift);
          // Sync with backend to reflect finalized hours/floor
          fetchTodayShiftStatus();
        }
      } else {
        const errorMsg = (res && res.message) ? res.message : "Failed to record attendance action.";
        updateGeoStatus("error", errorMsg);
        showAlertUI(alertBox, errorMsg, true);
      }
    })
    .processActivityLog(
      CURRENT_EMPLOYEE.email,
      CURRENT_EMPLOYEE.firstName,
      CURRENT_EMPLOYEE.lastName,
      actionType,
      lat,
      lon,
      resolvedAddress
    );
}

function handleEmployeeLogout() {
  if (confirm("Are you sure you want to exit your active session?")) {
    logout(LOGIN_URL);
  }
}

/**
 * Calculates floor clock-in time client-side:
 * Early clock-in (< 08:00) automatically sets to 08:00; past 08:00 shows actual time (HH:mm).
 */
function calculateFloorIn(timeStr) {
  if (!timeStr || timeStr === "--") return "--";
  const parts = String(timeStr).split(":");
  if (parts.length >= 2) {
    const hours = parseInt(parts[0], 10);
    const mins = parseInt(parts[1], 10);
    if (!isNaN(hours) && !isNaN(mins)) {
      const totalMins = (hours * 60) + mins;
      if (totalMins < 480) {
        return "08:00";
      }
      return `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
    }
  }
  return timeStr.substring(0, 5);
}

/**
 * Updates the notification badge on the Leave Application trigger button
 */
function updateEmployeeLeaveBadge(leaveInfo) {
  const badge = document.getElementById("employeeLeaveBadge");
  if (!badge) return;

  if (!leaveInfo) {
    badge.classList.add("hidden");
    return;
  }

  if (leaveInfo.activeLeaveType) {
    badge.className = "leave-btn-badge badge-teal";
    badge.innerText = `On Leave: ${leaveInfo.activeLeaveType}`;
    badge.title = `You have an approved ${leaveInfo.activeLeaveType} leave active today`;
    badge.classList.remove("hidden");
  } else if (leaveInfo.pendingCount > 0) {
    badge.className = "leave-btn-badge badge-warning";
    badge.innerText = `${leaveInfo.pendingCount} Pending`;
    badge.title = `You have ${leaveInfo.pendingCount} pending leave application${leaveInfo.pendingCount > 1 ? 's' : ''}`;
    badge.classList.remove("hidden");
  } else {
    badge.innerText = "";
    badge.classList.add("hidden");
  }
}
