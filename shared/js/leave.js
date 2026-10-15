/**
 * ============================================================================
 * CDA SOLUTIONS - SHARED LEAVE MODAL CONTROLLER (leave.js)
 * Shared between Employee Portal & Admin Dashboard
 * ============================================================================
 */

function openLeaveModal() {
  const modal = document.getElementById("leaveModal");
  if (!modal) return;

  const todayStr = new Date().toISOString().split('T')[0];
  const startInput = document.getElementById("leaveStartDate");
  const endInput = document.getElementById("leaveEndDate");

  if (startInput) startInput.value = todayStr;
  if (endInput) endInput.value = todayStr;

  const alertBox = document.getElementById("leaveModalAlert");
  if (alertBox) alertBox.classList.add("hidden");

  modal.classList.remove("hidden");
}

function closeLeaveModal() {
  const modal = document.getElementById("leaveModal");
  if (modal) {
    modal.classList.add("hidden");
  }
  const form = document.getElementById("leaveForm");
  if (form) form.reset();
}

function handleLeaveSubmit(e, onSuccessCallback) {
  if (e && e.preventDefault) e.preventDefault();

  const session = getSession();
  if (!session || !session.user) {
    alert("Session expired. Please log in again.");
    window.location.replace("../index.html");
    return;
  }

  const leaveType = document.getElementById("leaveType").value;
  const startDate = document.getElementById("leaveStartDate").value;
  const endDate = document.getElementById("leaveEndDate").value;
  const alertBox = document.getElementById("leaveModalAlert");

  if (!startDate || !endDate) {
    if (alertBox) showAlertUI(alertBox, "Please select both a Start Date and an End Date.", true);
    return;
  }

  if (new Date(startDate) > new Date(endDate)) {
    if (alertBox) showAlertUI(alertBox, "Start Date cannot be after End Date.", true);
    return;
  }

  if (alertBox) alertBox.classList.add("hidden");
  showLoader(true, "Registering leave application with CDA Solutions...");

  google.script.run
    .withFailureHandler(function(err) {
      showLoader(false);
      if (alertBox) {
        showAlertUI(alertBox, "Submission Error: " + err.message, true);
      } else {
        alert("Submission Error: " + err.message);
      }
    })
    .withSuccessHandler(function(res) {
      showLoader(false);
      if (res.status === "success") {
        closeLeaveModal();
        alert(res.message || "Leave request submitted successfully!");
        if (typeof onSuccessCallback === "function") {
          onSuccessCallback(res);
        }
      } else {
        if (alertBox) {
          showAlertUI(alertBox, "Error: " + res.message, true);
        } else {
          alert("Error: " + res.message);
        }
      }
    })
    .submitLeaveRequest(
      session.user.email,
      session.user.firstName,
      session.user.lastName,
      leaveType,
      startDate,
      endDate
    );
}

// Close modal on Escape key press
document.addEventListener("keydown", function(e) {
  if (e.key === "Escape") {
    closeLeaveModal();
  }
});
