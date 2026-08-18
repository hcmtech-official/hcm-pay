const AUTH = { user: "admin", pass: "frog123" };

const loginForm = document.getElementById("login-form");
const loginError = document.getElementById("login-error");

// already signed in this session? skip straight to the dashboard
if (sessionStorage.getItem("hcmpay_authed") === "1") {
  window.location.href = "dashboard.html";
}

loginForm.addEventListener("submit", (e) => {
  e.preventDefault();
  const u = document.getElementById("login-user").value.trim();
  const p = document.getElementById("login-pass").value;
  if (u.toLowerCase() === AUTH.user.toLowerCase() && p === AUTH.pass) {
    sessionStorage.setItem("hcmpay_authed", "1");
    window.location.href = "dashboard.html";
  } else {
    loginError.hidden = false;
  }
});
