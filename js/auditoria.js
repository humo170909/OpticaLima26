// ============================================================
// auditoria.js - Historial de actividad con filtros y paginacion
// Optica Lima
// ============================================================

const auditForm = document.querySelector("[data-audit-filters]");
const auditBody = document.querySelector("[data-audit-results]");
const auditTotal = document.querySelector("[data-audit-total]");
const auditPageLabel = document.querySelector("[data-audit-page]");
const auditPrev = document.querySelector("[data-audit-prev]");
const auditNext = document.querySelector("[data-audit-next]");
const auditReset = document.querySelector("[data-audit-reset]");

const AUDIT_PAGE_SIZE = 20;
let auditPage = 1;
let auditTotalPages = 1;

const actionClasses = {
  CREATE: "success",
  UPDATE: "warning",
  DELETE: "danger",
  LOGIN: "info",
  LOGOUT: "muted",
};

function getAuditFilters() {
  const form = new FormData(auditForm);
  return {
    search: (form.get("search") || "").trim(),
    usuario: (form.get("usuario") || "").trim(),
    fecha: form.get("fecha") || "",
    accion: form.get("accion") || "",
    modulo: form.get("modulo") || "",
  };
}

function applyAuditFilters(query, filters) {
  if (filters.fecha) {
    const start = `${filters.fecha}T00:00:00`;
    const end = `${filters.fecha}T23:59:59.999`;
    query = query.gte("fecha", start).lte("fecha", end);
  }

  if (filters.accion) query = query.eq("accion", filters.accion);
  if (filters.modulo) query = query.eq("modulo", filters.modulo);

  if (filters.usuario) {
    query = query.or(`usuario.ilike.%${filters.usuario}%,correo.ilike.%${filters.usuario}%`);
  }

  if (filters.search) {
    query = query.or(
      `usuario.ilike.%${filters.search}%,correo.ilike.%${filters.search}%,accion.ilike.%${filters.search}%,registro_id.ilike.%${filters.search}%,descripcion.ilike.%${filters.search}%`
    );
  }

  return query;
}

function updateAuditPagination() {
  if (auditPageLabel) auditPageLabel.textContent = `Pagina ${auditPage} de ${auditTotalPages}`;
  if (auditPrev) auditPrev.disabled = auditPage <= 1;
  if (auditNext) auditNext.disabled = auditPage >= auditTotalPages;
}

function renderAuditRows(rows) {
  if (!auditBody) return;

  auditBody.innerHTML =
    rows
      .map((item) => {
        const className = actionClasses[item.accion] || "muted";
        return `
          <tr>
            <td>${formatDateTime(item.fecha)}</td>
            <td>
              <strong>${escapeHtml(item.usuario || "Usuario")}</strong>
              <small class="table-subtext">${escapeHtml(item.correo || "-")}</small>
            </td>
            <td><span class="audit-badge ${className}">${escapeHtml(item.accion)}</span></td>
            <td>${escapeHtml(item.modulo || "-")}</td>
            <td><code>${escapeHtml(item.registro_id || "-")}</code></td>
            <td>${escapeHtml(item.descripcion || "-")}</td>
          </tr>
        `;
      })
      .join("") || `<tr><td colspan="6" class="empty-row">No se encontraron registros de auditoria.</td></tr>`;
}

async function loadAudit(event) {
  if (event) {
    event.preventDefault();
    auditPage = 1;
  }
  if (!auditBody || !auditForm) return;

  auditBody.innerHTML = `<tr><td colspan="6" class="loading-row">Cargando...</td></tr>`;

  const filters = getAuditFilters();
  const from = (auditPage - 1) * AUDIT_PAGE_SIZE;
  const to = from + AUDIT_PAGE_SIZE - 1;

  let query = db
    .from("auditoria")
    .select("id,usuario,correo,accion,modulo,registro_id,descripcion,fecha", { count: "exact" })
    .order("fecha", { ascending: false })
    .range(from, to);

  query = applyAuditFilters(query, filters);

  const { data, count, error } = await query;
  if (error) {
    auditBody.innerHTML = `<tr><td colspan="6" class="empty-row">No se pudo cargar la auditoria.</td></tr>`;
    showToast(error.message, "error");
    return;
  }

  auditTotalPages = Math.max(1, Math.ceil((count || 0) / AUDIT_PAGE_SIZE));
  if (auditPage > auditTotalPages) auditPage = auditTotalPages;
  if (auditTotal) auditTotal.textContent = count || 0;

  renderAuditRows(data || []);
  updateAuditPagination();
}

auditForm?.addEventListener("submit", loadAudit);

auditReset?.addEventListener("click", () => {
  auditForm.reset();
  auditPage = 1;
  loadAudit();
});

auditPrev?.addEventListener("click", () => {
  if (auditPage <= 1) return;
  auditPage -= 1;
  loadAudit();
});

auditNext?.addEventListener("click", () => {
  if (auditPage >= auditTotalPages) return;
  auditPage += 1;
  loadAudit();
});

document.addEventListener("DOMContentLoaded", loadAudit);
