// ============================================================
// auth.js — Autenticación con protección anti-fuerza bruta
// Óptica Lima
// ============================================================

const loginForm    = document.querySelector("[data-login-form]");
const blockedBanner= document.querySelector("[data-login-blocked]");
const blockMessage = document.querySelector("[data-block-message]");

// ── Configuración de rate limiting ──────────────────────────
const RATE = {
  MAX_ATTEMPTS: 5,
  BLOCK_MS:     15 * 60 * 1000,  // 15 minutos
  STORAGE_KEY:  "ol_login_attempts",
};

// ── Helpers de storage de intentos ──────────────────────────
function _getAttempts() {
  try {
    const raw = localStorage.getItem(RATE.STORAGE_KEY)
             || sessionStorage.getItem(RATE.STORAGE_KEY);
    return raw ? JSON.parse(raw) : { count: 0, blockedAt: null };
  } catch (_) {
    return { count: 0, blockedAt: null };
  }
}

function _saveAttempts(data) {
  const json = JSON.stringify(data);
  try { localStorage.setItem(RATE.STORAGE_KEY, json); } catch (_) {}
  try { sessionStorage.setItem(RATE.STORAGE_KEY, json); } catch (_) {}
}

function _clearAttempts() {
  try { localStorage.removeItem(RATE.STORAGE_KEY); } catch (_) {}
  try { sessionStorage.removeItem(RATE.STORAGE_KEY); } catch (_) {}
}

// ── Comprobar si el usuario está bloqueado ───────────────────
function isBlocked() {
  const data = _getAttempts();
  if (!data.blockedAt) return false;
  const elapsed = Date.now() - data.blockedAt;
  if (elapsed >= RATE.BLOCK_MS) {
    _clearAttempts();
    return false;
  }
  return true;
}

// Tiempo restante en segundos
function remainingSeconds() {
  const data = _getAttempts();
  if (!data.blockedAt) return 0;
  return Math.ceil((RATE.BLOCK_MS - (Date.now() - data.blockedAt)) / 1000);
}

// ── Mostrar/ocultar banner de bloqueo con cuenta regresiva ───
let _countdownTimer = null;

function showBlockBanner() {
  if (!blockedBanner || !blockMessage) return;
  blockedBanner.classList.add("visible");

  const submit = loginForm?.querySelector("button[type='submit']");
  if (submit) submit.disabled = true;

  function tick() {
    const secs = remainingSeconds();
    if (secs <= 0) {
      blockedBanner.classList.remove("visible");
      if (submit) submit.disabled = false;
      clearInterval(_countdownTimer);
      return;
    }
    const m = String(Math.floor(secs / 60)).padStart(2, "0");
    const s = String(secs % 60).padStart(2, "0");
    blockMessage.textContent = `Intente nuevamente en ${m}:${s} minutos.`;
  }

  tick();
  clearInterval(_countdownTimer);
  _countdownTimer = setInterval(tick, 1000);
}

function hideBlockBanner() {
  blockedBanner?.classList.remove("visible");
  clearInterval(_countdownTimer);
}

// ── Registrar un intento fallido ─────────────────────────────
function registerFailedAttempt() {
  const data = _getAttempts();
  data.count = (data.count || 0) + 1;

  if (data.count >= RATE.MAX_ATTEMPTS) {
    data.blockedAt = Date.now();
    _saveAttempts(data);
    showBlockBanner();
  } else {
    _saveAttempts(data);
    const remaining = RATE.MAX_ATTEMPTS - data.count;
    showToast(
      `Credenciales incorrectas. ${remaining} intento${remaining === 1 ? "" : "s"} restante${remaining === 1 ? "" : "s"}.`,
      "error"
    );
  }
}

// ── Validación de campos ─────────────────────────────────────
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
  const email    = loginForm.email;
  const password = loginForm.password;

  clearLoginError(email);
  clearLoginError(password);

  if (!email.value.trim()) {
    setLoginError(email, "El correo es obligatorio.");
    isValid = false;
  } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.value.trim())) {
    setLoginError(email, "Ingrese un correo válido.");
    isValid = false;
  }

  if (!password.value) {
    setLoginError(password, "La contraseña es obligatoria.");
    isValid = false;
  }

  return isValid;
}

// ── Limpiar errores en tiempo real ───────────────────────────
loginForm?.querySelectorAll("input[name='email'], input[name='password']")
  .forEach((field) => {
    field.addEventListener("input", () => clearLoginError(field));
  });

// ── Submit del formulario ────────────────────────────────────
if (loginForm) {
  loginForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    // 1. Verificar bloqueo activo
    if (isBlocked()) {
      showBlockBanner();
      return;
    }

    if (!validateLoginForm()) {
      showToast("Revise sus datos de acceso.", "error");
      return;
    }

    const submit   = loginForm.querySelector("button[type='submit']");
    const email    = loginForm.email.value.trim();
    const password = loginForm.password.value;

    setLoading(submit, true, "Verificando");

    // 2. Autenticar
    const { error: signInError } = await db.auth.signInWithPassword({ email, password });

    if (signInError) {
      setLoading(submit, false);
      registerFailedAttempt(); // contabiliza el intento
      return;
    }

    // 3. Verificar que la sesión quedó persistida en storage
    const { data: sessionCheck } = await db.auth.getSession();
    if (!sessionCheck?.session) {
      setLoading(submit, false);
      showToast(
        "Sesión iniciada pero no pudo guardarse. " +
        "Desactiva Tracking Prevention en el navegador.",
        "error"
      );
      return;
    }

    // 4. Limpiar intentos fallidos al login exitoso
    _clearAttempts();
    hideBlockBanner();

    // 5. Auditoría en background — NO bloquea el redirect
    logAudit("LOGIN", "auth", null, { email }).catch(() => {});

    // 6. Redirigir (botón queda en "loading" hasta que la página descarga)
    window.location.href = "dashboard.html";
  });
}

// ── Comprobar sesión activa al cargar la página ──────────────
document.addEventListener("DOMContentLoaded", async () => {
  if (!document.body.classList.contains("login-page")) return;

  // Mostrar bloqueo si corresponde
  if (isBlocked()) {
    showBlockBanner();
  }

  // Si ya hay sesión activa, redirigir sin agregar login al historial
  const session = await getSession();
  if (session) window.location.replace("dashboard.html");
});
