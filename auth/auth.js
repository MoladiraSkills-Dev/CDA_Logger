/**
 * ============================================================================
 * CDA SOLUTIONS - AUTHENTICATION CONTROLLER (auth.js)
 * Logic for Login and Registration with Role-Based Redirection
 * ============================================================================
 */

// If already logged in, redirect automatically
document.addEventListener("DOMContentLoaded", function() {
  const session = getSession();
  if (session && session.user && session.accountType) {
    if (session.accountType === "Admin") {
      window.location.replace("admin/index.html");
    } else {
      window.location.replace("employee/index.html");
    }
  }
});

function toggleAuthMode(toLogin) {
  const alertBox = document.getElementById("authAlert");
  if (alertBox) alertBox.classList.add("hidden");

  const authTitle = document.getElementById("authTitle");
  const authSubtitle = document.getElementById("authSubtitle");
  const loginForm = document.getElementById("loginForm");
  const registerForm = document.getElementById("registerForm");

  if (toLogin) {
    if (authTitle) authTitle.innerHTML = 'Sign In to <span style="color: var(--cda-blue);">CDA Logger</span>';
    if (authSubtitle) authSubtitle.innerText = 'Enter your corporate credentials to log attendance.';
    if (loginForm) loginForm.classList.remove("hidden");
    if (registerForm) registerForm.classList.add("hidden");
  } else {
    if (authTitle) authTitle.innerHTML = 'Create Access <span style="color: var(--cda-teal);">Account</span>';
    if (authSubtitle) authSubtitle.innerText = 'Register your profile to access CDA Solutions logging.';
    if (loginForm) loginForm.classList.add("hidden");
    if (registerForm) registerForm.classList.remove("hidden");
  }
}

function handleLoginSubmit(e) {
  e.preventDefault();
  const alertBox = document.getElementById("authAlert");
  if (alertBox) alertBox.classList.add("hidden");

  const email = document.getElementById("loginEmail").value.trim();
  const pass = document.getElementById("loginPassword").value;

  if (!email || !pass) {
    showAlertUI(alertBox, "Please provide both email and password.", true);
    return;
  }

  showLoader(true, "Verifying CDA corporate credentials...");

  google.script.run
    .withFailureHandler(function(err) {
      showLoader(false);
      const msg = err && err.message ? err.message : String(err || "Unable to reach server");
      showAlertUI(alertBox, "Connection Error: " + msg, true);
    })
    .withSuccessHandler(function(res) {
      showLoader(false);
      if (res.status === "success") {
        saveSession(res.user, res.accountType);
        
        // Role-based redirection
        if (res.accountType === "Admin") {
          window.location.replace("admin/index.html");
        } else {
          window.location.replace("employee/index.html");
        }
      } else {
        showAlertUI(alertBox, res.message || "Invalid credentials provided.", true);
      }
    })
    .loginUser(email, pass);
}

function handleRegisterSubmit(e) {
  e.preventDefault();
  const alertBox = document.getElementById("authAlert");
  if (alertBox) alertBox.classList.add("hidden");

  const email = document.getElementById("regEmail").value.trim();
  const first = document.getElementById("regFirst").value.trim();
  const last = document.getElementById("regLast").value.trim();
  const pass = document.getElementById("regPassword").value;

  if (!email || !first || !last || !pass) {
    showAlertUI(alertBox, "All registration fields are required.", true);
    return;
  }

  showLoader(true, "Creating your CDA employee profile...");

  google.script.run
    .withFailureHandler(function(err) {
      showLoader(false);
      const msg = err && err.message ? err.message : String(err || "Unable to reach server");
      showAlertUI(alertBox, "Registration Error: " + msg, true);
    })
    .withSuccessHandler(function(res) {
      showLoader(false);
      if (res.status === "success") {
        toggleAuthMode(true);
        const loginEmail = document.getElementById("loginEmail");
        if (loginEmail) loginEmail.value = email;
        const regForm = document.getElementById("registerForm");
        if (regForm) regForm.reset();
        showAlertUI(alertBox, res.message || "Registration successful! You may now sign in.", false);
      } else {
        showAlertUI(alertBox, res.message || "Registration could not be completed.", true);
      }
    })
    .registerUser(email, first, last, pass);
}
