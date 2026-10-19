/**
 * ============================================================================
 * CDA SOLUTIONS - EMPLOYEE ATTENDANCE CONTROLLER (employee.js)
 * ============================================================================
 */

const LOGIN_URL = "../index.html";

let CURRENT_EMPLOYEE = null;
let CURRENT_SHIFT_STATUS = null;

document.addEventListener("DOMContentLoaded", function() {
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

  // Restore cached shift status if present
  if (session.todayShift) {
    updateEmployeeShiftUI(session.todayShift);
  }

  // Synchronize live shift status from backend
  fetchTodayShiftStatus();

  // Start live clock
  startLiveClock();
});

function fetchTodayShiftStatus() {
  if (!CURRENT_EMPLOYEE || !CURRENT_EMPLOYEE.email) return;

  google.script.run
    .withFailureHandler(function(err) {
      console.warn("Could not retrieve real-time shift status:", err);
    })
    .withSuccessHandler(function(res) {
      if (res && res.status === "success" && res.todayShift) {
        updateEmployeeShiftUI(res.todayShift);
        updateSessionShift(res.todayShift);
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

function triggerClockAction(actionType) {
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

  if (!navigator.geolocation) {
    showAlertUI(alertBox, "Geolocation is not supported by your current browser device.", true);
    return;
  }

  showLoader(true, `Querying GPS coordinates for ${actionType}...`);

  navigator.geolocation.getCurrentPosition(
    function(pos) {
      const lat = pos.coords.latitude;
      const lon = pos.coords.longitude;

      showLoader(true, `Resolving physical location & logging ${actionType}...`);

      google.script.run
        .withFailureHandler(function(err) {
          showLoader(false);
          showAlertUI(alertBox, "Attendance Error: " + err.message, true);
        })
        .withSuccessHandler(function(res) {
          showLoader(false);
          if (res.status === "success") {
            const feedback = `${res.action} confirmed at ${res.time} (${res.location})`;
            showAlertUI(alertBox, feedback, false);

            if (actionType === "Clock In") {
              const newShift = {
                date: res.date,
                clockIn: res.time,
                clockOut: "--",
                floorIn: res.time.substring(0, 5),
                floorOut: "--",
                status: "In Progress",
                hasClockedIn: true,
                hasClockedOut: false
              };
              updateEmployeeShiftUI(newShift);
              updateSessionShift(newShift);
            } else if (actionType === "Clock Out") {
              const updatedShift = CURRENT_SHIFT_STATUS || {};
              updatedShift.hasClockedOut = true;
              updatedShift.clockOut = res.time;
              updatedShift.status = "Completed";
              updateEmployeeShiftUI(updatedShift);
              updateSessionShift(updatedShift);
            }
          } else {
            showAlertUI(alertBox, res.message || "Failed to record attendance action.", true);
          }
        })
        .processActivityLog(
          CURRENT_EMPLOYEE.email,
          CURRENT_EMPLOYEE.firstName,
          CURRENT_EMPLOYEE.lastName,
          actionType,
          lat,
          lon
        );
    },
    function(err) {
      showLoader(false);
      let errMsg = "GPS blocked: Please enable device location permissions in your browser.";
      if (err.code === 2) errMsg = "Location unavailable. Please check your network or GPS connection.";
      if (err.code === 3) errMsg = "Location request timed out. Please try again.";
      showAlertUI(alertBox, errMsg, true);
    },
    { enableHighAccuracy: true, timeout: 12000, maximumAge: 0 }
  );
}

function handleEmployeeLogout() {
  if (confirm("Are you sure you want to exit your active session?")) {
    logout(LOGIN_URL);
  }
}
