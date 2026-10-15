/**
 * ============================================================================
 * CDA SOLUTIONS - EMPLOYEE ATTENDANCE CONTROLLER (employee.js)
 * ============================================================================
 */

const LOGIN_URL = "../index.html";

let CURRENT_EMPLOYEE = null;

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

  // Start live clock
  startLiveClock();
});

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
