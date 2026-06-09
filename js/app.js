// ============================================================
// app.js - Utilidades globales, autenticacion y dashboard
// Optica Lima
// ============================================================

const db = window.db;

const formatMoney = (value) =>
  new Intl.NumberFormat("es-PE", { style: "currency", currency: "PEN" }).format(Number(value || 0));

const formatDate = (value) => {
  if (!value) return "-";
  return new Date(`${value}T00:00:00`).toLocaleDateString("es-PE", {
    year: "numeric",
    month: "short",
    day: "2-digit",
  });
};

const formatDateTime = (value) => {
  if (!value) return "-";
  return new Date(value).toLocaleString("es-PE", {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
};

const escapeHtml = (value = "") =>
  String(value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;",
  })[char]);

const sumAmounts = (rows = []) => rows.reduce((sum, item) => sum + Number(item.amount || 0), 0);

const toIsoDate = (date) => date.toISOString().slice(0, 10);

function getDateRanges() {
  const now = new Date();
  const today = toIsoDate(now);
  const weekStartDate = new Date(now);
  const day = weekStartDate.getDay() || 7;
  weekStartDate.setDate(weekStartDate.getDate() - day + 1);

  return {
    today,
    weekStart: toIsoDate(weekStartDate),
    monthStart: toIsoDate(new Date(now.getFullYear(), now.getMonth(), 1)),
    monthEnd: toIsoDate(new Date(now.getFullYear(), now.getMonth() + 1, 0)),
  };
}

async function getSession() {
  try {
    const { data, error } = await db.auth.getSession();
    if (error) {
      console.warn("getSession error:", error.message);
      return null;
    }
    return data.session;
  } catch (err) {
    console.warn("getSession exception:", err);
    return null;
  }
}

async function requireAuth() {
  const session = await getSession();
  if (!session) {
    // replace() evita que "Atras" del navegador vuelva a una pagina protegida
    window.location.replace("login.html");
    return null;
  }
  const userLabel = document.querySelector("[data-user-email]");
  if (userLabel) userLabel.textContent = session.user.email || "Usuario";
  return session;
}

async function logout() {
  try {
    const { data: authData } = await db.auth.getUser();
    if (authData?.user) {
      await logAudit("LOGOUT", "auth", authData.user.id, { email: authData.user.email });
    }
  } catch (_) {}
  await db.auth.signOut();
  // replace() elimina todas las paginas protegidas del historial del navegador
  window.location.replace("login.html");
}

async function confirmLogout() {
  if (window.Swal) {
    const result = await Swal.fire({
      title: "Deseas cerrar sesion?",
      text: "Tu sesion actual se cerrara de forma segura.",
      icon: "question",
      showCancelButton: true,
      confirmButtonColor: "#0f766e",
      cancelButtonColor: "#6b7280",
      confirmButtonText: "Cerrar sesion",
      cancelButtonText: "Cancelar",
      reverseButtons: true,
      backdrop: true,
    });
    if (!result.isConfirmed) return;
  } else if (!window.confirm("Deseas cerrar sesion?")) {
    return;
  }
  await logout();
}

// ── Sistema de temas ─────────────────────────────────────────
const THEMES = {
  blue:   { label: "Azul Corporativo",  color: "#2563eb" },
  dark:   { label: "Oscuro",            color: "#1f2937" },
  green:  { label: "Verde Empresarial", color: "#16a34a" },
  purple: { label: "Morado Premium",    color: "#7c3aed" },
  light:  { label: "Claro Profesional", color: "#e5e7eb" },
};

function applyTheme(theme) {
  const html = document.documentElement;
  if (!theme || theme === "blue") {
    html.removeAttribute("data-theme");
  } else {
    html.setAttribute("data-theme", theme);
  }
  try { localStorage.setItem("ol_theme", theme || "blue"); } catch (_) {}
  document.querySelectorAll("[data-theme-set]").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.themeSet === (theme || "blue"));
  });
}

function setupTheme() {
  let saved = "blue";
  try { saved = localStorage.getItem("ol_theme") || "blue"; } catch (_) {}
  applyTheme(saved);
}

function setupThemeSwitcher() {
  const toggle   = document.querySelector("[data-theme-toggle]");
  const dropdown = document.querySelector("[data-theme-dropdown]");
  if (!toggle || !dropdown) return;

  toggle.addEventListener("click", (e) => {
    e.stopPropagation();
    dropdown.classList.toggle("visible");
  });

  document.addEventListener("click", (e) => {
    if (!toggle.contains(e.target)) dropdown.classList.remove("visible");
  });

  document.querySelectorAll("[data-theme-set]").forEach((btn) => {
    btn.addEventListener("click", () => {
      applyTheme(btn.dataset.themeSet);
      dropdown.classList.remove("visible");
    });
  });
}

function setupLayout() {
  const logoutBtn = document.querySelector("[data-logout]");
  if (logoutBtn) logoutBtn.addEventListener("click", confirmLogout);

  const current = location.pathname.split("/").pop() || "index.html";
  document.querySelectorAll(".sidebar a").forEach((link) => {
    const href = link.getAttribute("href");
    link.classList.toggle("active", href === current || (current === "index.html" && href === "dashboard.html"));
  });

  document.querySelectorAll("input[type='date'][required]").forEach((input) => {
    if (!input.value) input.value = new Date().toISOString().slice(0, 10);
  });

  document.querySelectorAll("[data-modal-close]").forEach((btn) => {
    btn.addEventListener("click", (event) => {
      const modal = event.target.closest(".modal-overlay");
      if (modal) modal.classList.remove("active");
    });
  });

  document.querySelectorAll(".modal-overlay").forEach((modal) => {
    modal.addEventListener("click", (event) => {
      if (event.target === modal) modal.classList.remove("active");
    });
  });
}

function showToast(message, type = "success") {
  const toast = document.querySelector("[data-toast]");
  if (!toast) return;
  toast.textContent = message;
  toast.className = `toast visible ${type}`;
  setTimeout(() => toast.classList.remove("visible"), 3200);
}

async function confirmAction(title, message = "Estas seguro?") {
  if (!window.Swal) return { isConfirmed: window.confirm(`${title}\n${message}`) };
  return await Swal.fire({
    title,
    text: message,
    icon: "warning",
    showCancelButton: true,
    confirmButtonColor: "#0f766e",
    cancelButtonColor: "#b42318",
    confirmButtonText: "Confirmar",
    cancelButtonText: "Cancelar",
    reverseButtons: true,
    backdrop: true,
  });
}

async function confirmDelete(itemName = "este registro") {
  if (!window.Swal) return { isConfirmed: window.confirm(`Eliminar ${itemName}. Esta accion no se puede deshacer.`) };
  return await Swal.fire({
    title: "Eliminar registro?",
    text: `Se eliminara ${itemName}. Esta accion no se puede deshacer.`,
    icon: "warning",
    showCancelButton: true,
    confirmButtonColor: "#b42318",
    cancelButtonColor: "#64726f",
    confirmButtonText: "Si, eliminar",
    cancelButtonText: "Cancelar",
    backdrop: true,
  });
}

async function logAudit(action, tableName, recordId, newValues = null, oldValues = null) {
  try {
    const { data: authData } = await db.auth.getUser();
    if (!authData?.user) return;

    const normalizedAction = normalizeAuditAction(action);
    const email = authData.user.email || "";
    const usuario = authData.user.user_metadata?.full_name || email.split("@")[0] || "Usuario";
    const descripcion = buildAuditDescription(normalizedAction, tableName, newValues, oldValues);

    const { error } = await db.from("auditoria").insert({
      user_id: authData.user.id,
      usuario,
      correo: email,
      accion: normalizedAction,
      modulo: tableName,
      registro_id: recordId ? String(recordId) : null,
      descripcion,
      valores_nuevos: newValues,
      valores_anteriores: oldValues,
    });

    if (!error) return;

    await db.from("audit_logs").insert({
      user_id: authData.user.id,
      action: normalizedAction.toLowerCase(),
      table_name: tableName,
      record_id: recordId ? String(recordId) : null,
      new_values: newValues,
      old_values: oldValues,
    });
  } catch (err) {
    console.warn("Audit log skipped:", err);
  }
}

function normalizeAuditAction(action) {
  const actionMap = {
    insert: "CREATE",
    create: "CREATE",
    update: "UPDATE",
    delete: "DELETE",
    login: "LOGIN",
    logout: "LOGOUT",
  };
  return actionMap[String(action).toLowerCase()] || String(action).toUpperCase();
}

function buildAuditDescription(action, modulo, newValues, oldValues) {
  const labels = {
    CREATE: "Creo un nuevo registro",
    UPDATE: "Actualizo un registro",
    DELETE: "Elimino un registro",
    LOGIN: "Inicio sesion en el sistema",
    LOGOUT: "Cerro sesion en el sistema",
  };

  if (action === "LOGIN" || action === "LOGOUT") return labels[action];

  const source = newValues || oldValues || {};
  const detail =
    source.full_name ||
    source.description ||
    source.product ||
    source.email ||
    source.dni ||
    source.category ||
    "";

  return `${labels[action] || "Realizo una accion"} en ${modulo}${detail ? `: ${detail}` : ""}`;
}

function openModal(modalId) {
  const modal = document.getElementById(modalId);
  if (modal) modal.classList.add("active");
}

function closeModal(modalId) {
  const modal = document.getElementById(modalId);
  if (modal) modal.classList.remove("active");
}

function setLoading(button, isLoading, label = "Guardando") {
  if (!button) return;
  button.disabled = isLoading;
  if (isLoading) {
    button.dataset.originalText = button.textContent;
    button.textContent = `${label}...`;
  } else {
    button.textContent = button.dataset.originalText || button.textContent;
  }
}

function toExcel(rows, filename, sheetName) {
  if (!rows.length) {
    showToast("No hay datos para exportar.", "warning");
    return;
  }

  const headers = Object.keys(rows[0]);
  const tableRows = rows
    .map((row) => `<tr>${headers.map((key) => `<td>${escapeHtml(row[key] ?? "")}</td>`).join("")}</tr>`)
    .join("");

  const workbook = `
    <html xmlns:o="urn:schemas-microsoft-com:office:office"
      xmlns:x="urn:schemas-microsoft-com:office:excel"
      xmlns="http://www.w3.org/TR/REC-html40">
      <head><meta charset="UTF-8"></head>
      <body>
        <table>
          <thead><tr>${headers.map((key) => `<th>${escapeHtml(key)}</th>`).join("")}</tr></thead>
          <tbody>${tableRows}</tbody>
        </table>
      </body>
    </html>`;

  const blob = new Blob([workbook], { type: "application/vnd.ms-excel;charset=utf-8" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `${filename}-${new Date().toISOString().slice(0, 10)}.xls`;
  link.click();
  URL.revokeObjectURL(link.href);
  showToast(`${sheetName} exportado correctamente.`);
}

// SVG helpers para los íconos de KPI
const _svg = {
  today:   `<svg viewBox="0 0 24 24"><polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/><polyline points="16 7 22 7 22 13"/></svg>`,
  weekly:  `<svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>`,
  monthly: `<svg viewBox="0 0 24 24"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/></svg>`,
  expense: `<svg viewBox="0 0 24 24"><rect x="1" y="4" width="22" height="16" rx="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg>`,
  balance: `<svg viewBox="0 0 24 24"><line x1="12" y1="20" x2="12" y2="10"/><path d="M18 20V4M6 20v-6"/></svg>`,
  clients: `<svg viewBox="0 0 24 24"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75"/></svg>`,
};

function _kpiCard(iconType, label, value, valueClass = "", trend = "", trendClass = "neutral") {
  return `
    <article class="metric${iconType === "today" ? " accent-metric" : ""}">
      <div class="metric-header">
        <div class="metric-icon ${iconType}">${_svg[iconType]}</div>
      </div>
      <div class="metric-label">${label}</div>
      <div class="metric-value${valueClass ? " " + valueClass : ""}">${value}</div>
      ${trend ? `<span class="metric-trend ${trendClass}">${trend}</span>` : ""}
    </article>`;
}

// FIX: loadDashboard recibe la sesion ya validada — elimina la llamada duplicada a requireAuth()
async function loadDashboard(session) {
  const cards = document.querySelector("[data-dashboard-cards]");
  if (!cards) return;

  // Usar sesion pasada; si no hay, verificar sin redirigir (la pagina ya esta protegida)
  if (!session) {
    const s = await getSession();
    if (!s) return;
    session = s;
  }

  const { today, weekStart, monthStart, monthEnd } = getDateRanges();
  cards.innerHTML = Array(6)
    .fill(0)
    .map(() => `<article class="metric skeleton"><span></span><strong></strong></article>`)
    .join("");

  const [
    todaySalesResult,
    weekSalesResult,
    monthSalesResult,
    monthExpensesResult,
    clientCountResult,
    recentClientsResult,
  ] = await Promise.all([
    db.from("sales").select("amount").eq("sale_date", today),
    db.from("sales").select("amount").gte("sale_date", weekStart).lte("sale_date", today),
    db.from("sales").select("amount").gte("sale_date", monthStart).lte("sale_date", monthEnd),
    db.from("expenses").select("amount").gte("expense_date", monthStart).lte("expense_date", monthEnd),
    db.from("clients").select("id", { count: "exact", head: true }),
    db.from("clients").select("id,full_name,dni,phone,created_at").order("created_at", { ascending: false }).limit(5),
  ]);

  const firstError = [
    todaySalesResult.error,
    weekSalesResult.error,
    monthSalesResult.error,
    monthExpensesResult.error,
    clientCountResult.error,
    recentClientsResult.error,
  ].find(Boolean);

  if (firstError) {
    cards.innerHTML = `<div style="grid-column:1/-1;padding:24px;text-align:center;color:var(--muted);">No se pudieron cargar los datos. Intente recargar la pagina.</div>`;
    showToast(firstError.message, "error");
    return;
  }

  const todaySales    = sumAmounts(todaySalesResult.data);
  const weekSales     = sumAmounts(weekSalesResult.data);
  const monthSales    = sumAmounts(monthSalesResult.data);
  const monthExpenses = sumAmounts(monthExpensesResult.data);
  const profit        = monthSales - monthExpenses;

  cards.innerHTML =
    _kpiCard("today",   "Vendido hoy",          formatMoney(todaySales),    "positive", "Hoy", "up") +
    _kpiCard("weekly",  "Ventas semanales",      formatMoney(weekSales),     "",         "Esta semana", "neutral") +
    _kpiCard("monthly", "Ventas del mes",        formatMoney(monthSales),    "",         "Este mes", "neutral") +
    _kpiCard("expense", "Gastos del mes",        formatMoney(monthExpenses), "negative", "Este mes", "down") +
    _kpiCard("balance", "Balance mensual",       formatMoney(profit),        profit >= 0 ? "positive" : "negative", profit >= 0 ? "Ganancia" : "Perdida", profit >= 0 ? "up" : "down") +
    _kpiCard("clients", "Clientes registrados",  String(clientCountResult.count || 0), "", "Total", "neutral");

  const stats = document.querySelector("[data-dashboard-stats]");
  if (stats) {
    const avgDaily = monthSales / Math.max(1, new Date().getDate());
    const margin   = monthSales > 0 ? (profit / monthSales) * 100 : 0;
    stats.innerHTML = `
      <div class="stat-line"><span>Promedio diario</span><strong>${formatMoney(avgDaily)}</strong></div>
      <div class="stat-line"><span>Margen estimado</span><strong>${margin.toFixed(1)}%</strong></div>
      <div class="stat-line"><span>Rango mensual</span><strong>${formatDate(monthStart)} — ${formatDate(monthEnd)}</strong></div>
    `;
  }

  const tbody = document.querySelector("[data-recent-clients]");
  if (tbody) {
    tbody.innerHTML =
      (recentClientsResult.data || [])
        .map((client) => `
          <tr>
            <td><strong>${escapeHtml(client.full_name)}</strong></td>
            <td>${escapeHtml(client.dni)}</td>
            <td>${escapeHtml(client.phone || "-")}</td>
            <td>${new Date(client.created_at).toLocaleDateString("es-PE")}</td>
            <td><a href="clientes.html" class="icon-text">Ver</a></td>
          </tr>`)
        .join("") ||
      `<tr><td colspan="5" class="empty-row">Aun no hay clientes registrados.</td></tr>`;
  }
}

document.addEventListener("DOMContentLoaded", async () => {
  setupTheme();       // Aplicar tema guardado ANTES de renderizar
  setupLayout();
  setupThemeSwitcher();

  let session = null;
  if (document.body.dataset.protected === "true") {
    session = await requireAuth(); // Una sola llamada a auth
    if (!session) return;          // Redirigido a login, detener ejecucion
  }

  // Pasar session a loadDashboard para evitar segunda llamada a requireAuth
  await loadDashboard(session);
});
