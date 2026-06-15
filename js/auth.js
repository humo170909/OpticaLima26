// ============================================================
// auth.js — Autenticación con protección anti DoS y fuerza bruta
// Backoff progresivo: 1er fallo=nada, 2°=15s, 3°=30s, 4°=60s, 5°+=15 min
// ============================================================

const loginForm    = document.querySelector("[data-login-form]");
const blockedBanner= document.querySelector("[data-login-blocked]");
const blockTitle   = document.querySelector("[data-block-title]");
const blockMessage = document.querySelector("[data-block-message]");

// ── Configuración de rate limiting ──────────────────────────
const RATE = {
  MAX_ATTEMPTS: 5,
  // Backoff en segundos por número de intento fallido (índice = nº intento)
  // Intento 1: sin espera | 2: 15s | 3: 30s | 4: 60s | 5+: 900s (15 min)
  BACKOFF: [0, 15, 30, 60, 900],
  STORAGE_KEY: "ol_login_attempts",
};

// ── Storage de intentos ──────────────────────────────────────
function _getAttempts() {
  try {
    const raw = localStorage.getItem(RATE.STORAGE_KEY)
             || sessionStorage.getItem(RATE.STORAGE_KEY);
    return raw ? JSON.parse(raw) : { count: 0, cooldownUntil: null };
  } catch (_) {
    return { count: 0, cooldownUntil: null };
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

// ── Comprobar si hay cooldown activo ─────────────────────────
function isBlocked() {
  const { cooldownUntil } = _getAttempts();
  return !!cooldownUntil && Date.now() < cooldownUntil;
}

function remainingSeconds() {
  const { cooldownUntil } = _getAttempts();
  if (!cooldownUntil) return 0;
  return Math.max(0, Math.ceil((cooldownUntil - Date.now()) / 1000));
}

// ── Banner con cuenta regresiva ──────────────────────────────
let _countdownTimer = null;

function showBlockBanner(isFull = false) {
  if (!blockedBanner || !blockMessage) return;

  if (blockTitle) {
    blockTitle.textContent = isFull
      ? "Cuenta bloqueada temporalmente"
      : "Espera requerida entre intentos";
  }

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
    blockMessage.textContent = isFull
      ? `Por seguridad, puede intentar de nuevo en ${m}:${s}.`
      : `Próximo intento disponible en ${m}:${s}.`;
  }

  tick();
  clearInterval(_countdownTimer);
  _countdownTimer = setInterval(tick, 1000);
}

function hideBlockBanner() {
  blockedBanner?.classList.remove("visible");
  clearInterval(_countdownTimer);
}

// ── Registrar un intento fallido (backoff progresivo) ────────
function registerFailedAttempt() {
  const data  = _getAttempts();
  data.count  = (data.count || 0) + 1;

  const idx        = Math.min(data.count, RATE.BACKOFF.length - 1);
  const backoffSecs = RATE.BACKOFF[idx];
  const isFull     = data.count >= RATE.MAX_ATTEMPTS;

  if (backoffSecs > 0) {
    data.cooldownUntil = Date.now() + backoffSecs * 1000;
    _saveAttempts(data);
    showBlockBanner(isFull);
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

    // 1. Cooldown activo → bloquear sin consumir intento
    if (isBlocked()) {
      const { count } = _getAttempts();
      showBlockBanner(count >= RATE.MAX_ATTEMPTS);
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

    // 2. Autenticar con Supabase
    const { error: signInError } = await db.auth.signInWithPassword({ email, password });

    if (signInError) {
      setLoading(submit, false);
      registerFailedAttempt();
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

    // 4. Login exitoso — limpiar intentos y cooldown
    _clearAttempts();
    hideBlockBanner();

    // 5. Auditoría en background (no bloquea el redirect)
    logAudit("LOGIN", "auth", null, { email }).catch(() => {});

    // 6. Redirigir (replace evita que "Atrás" vuelva al login)
    window.location.replace("dashboard.html");
  });
}

// ── Verificar estado al cargar la página ─────────────────────
document.addEventListener("DOMContentLoaded", async () => {
  if (!document.body.classList.contains("login-page")) return;

  // Restaurar banner si hay cooldown activo al recargar la página
  if (isBlocked()) {
    const { count } = _getAttempts();
    showBlockBanner(count >= RATE.MAX_ATTEMPTS);
  }

  // Si ya hay sesión activa, redirigir directamente
  const session = await getSession();
  if (session) window.location.replace("dashboard.html");
});
