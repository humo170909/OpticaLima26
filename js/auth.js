const loginForm = document.querySelector("[data-login-form]");

function setLoginError(field, message) {
  const label = field.closest("label");
  field.classList.add("field-invalid");

  let error = label?.querySelector(".field-error");
  if (!error && label) {
    error = document.createElement("small");
    error.className = "field-error";
    label.appendChild(error);
  }
  if (error) error.textContent = message;
}

function clearLoginError(field) {
  const label = field.closest("label");
  field.classList.remove("field-invalid");
  label?.querySelector(".field-error")?.remove();
}

function validateLoginForm() {
  let isValid = true;
  const email = loginForm.email;
  const password = loginForm.password;

  clearLoginError(email);
  clearLoginError(password);

  if (!email.value.trim()) {
    setLoginError(email, "El correo es obligatorio.");
    isValid = false;
  } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.value.trim())) {
    setLoginError(email, "Ingrese un correo valido.");
    isValid = false;
  }

  if (!password.value) {
    setLoginError(password, "La contrasena es obligatoria.");
    isValid = false;
  }

  if (!isValid) showToast("Revise sus datos de acceso.", "error");
  return isValid;
}

if (loginForm) {
  loginForm.querySelectorAll("input").forEach((field) => {
    field.addEventListener("input", () => clearLoginError(field));
  });

  loginForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!validateLoginForm()) return;

    const submit = loginForm.querySelector("button[type='submit']");
    setLoading(submit, true, "Ingresando");

    const email = loginForm.email.value.trim();
    const password = loginForm.password.value;

    const { error } = await db.auth.signInWithPassword({ email, password });
    setLoading(submit, false);

    if (error) {
      showToast("Usuario o contrasena incorrectos.", "error");
      return;
    }

    await logAudit("LOGIN", "auth", null, { email });
    window.location.href = "dashboard.html";
  });
}

document.addEventListener("DOMContentLoaded", async () => {
  if (!document.body.classList.contains("login-page")) return;
  const session = await getSession();
  if (session) window.location.href = "dashboard.html";
});
