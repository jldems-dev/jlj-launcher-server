
if (localStorage.getItem("adminToken")) {
    window.location.href = "/";
} 
async function login() {
  const password = document.getElementById("password").value;
  const btn = document.getElementById("loginBtn");
  const error = document.getElementById("error");

  if (!password) {
    error.textContent = "Please enter password";
    error.classList.add("show");
    return;
  }

  btn.disabled = true;
  btn.textContent = "Logging in...";
  error.classList.remove("show");

  try {
    const res = await fetch("/api/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    });

    const data = await res.json();

    if (res.ok && data.token) {
      localStorage.setItem("adminToken", data.token);
      window.location.href = "/";
    } else {
      error.textContent = data.error || "Login failed";
      error.classList.add("show");
    }
  } catch (err) {
    error.textContent = "Network error";
    error.classList.add("show");
  } finally {
    btn.disabled = false;
    btn.textContent = "Login";
  }
}

document.addEventListener("DOMContentLoaded", () => {
  document.getElementById("password").focus();
});
