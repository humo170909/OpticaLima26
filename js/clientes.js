// ============================================================
// clientes.js - CRUD completo de clientes con paginación
// Optica Lima
// ============================================================

const clientForm   = document.querySelector("[data-client-form]");
const searchForm   = document.querySelector("[data-client-search]");
const resultsBody  = document.querySelector("[data-client-results]");
const historyPanel = document.querySelector("[data-client-history]");
const editForm     = document.querySelector("#editClientForm");

const CLIENT_VALIDATION = {
  full_name: { required: "Los nombres completos son obligatorios.", pattern: /^[\p{L}\s]+$/u, message: "Solo se permiten letras y espacios." },
  dni: { required: "El DNI es obligatorio.", pattern: /^\d{8}$/, message: "Ingrese un DNI valido de 8 digitos." },
  phone: { required: "El celular es obligatorio.", pattern: /^\d{9}$/, message: "Ingrese un numero celular valido de 9 digitos." },
  email: { optional: true, pattern: /^[^\s@]+@[^\s@]+\.[^\s@]+$/, message: "Ingrese un correo valido." },
  birth_date: { required: "La fecha de nacimiento es obligatoria." },
  right_eye: { required: "El ojo derecho es obligatorio." },
  left_eye: { required: "El ojo izquierdo es obligatorio." },
  sphere: { required: "La esfera es obligatoria." },
  cylinder: { required: "El cilindro es obligatorio." },
  axis: { required: "El eje es obligatorio." },
  addition: { required: "La adicion es obligatoria." },
  diagnosis: { required: "El diagnostico es obligatorio." },
  product: { required: "El producto comprado es obligatorio." },
  brand: { required: "La marca es obligatoria." },
  price: { required: "El precio es obligatorio.", validate: (value) => Number(value) > 0, message: "Ingrese un precio mayor a cero." },
  purchase_date: { required: "La fecha de compra es obligatoria." },
  payment_method: { required: "El metodo de pago es obligatorio." },
};

function setFieldError(field, message) {
  const label = field.closest("label");
  field.classList.add("field-invalid");
  field.setAttribute("aria-invalid", "true");

  let error = label?.querySelector(".field-error");
  if (!error && label) {
    error = document.createElement("small");
    error.className = "field-error";
    label.appendChild(error);
  }
  if (error) error.textContent = message;
}

function clearFieldError(field) {
  const label = field.closest("label");
  field.classList.remove("field-invalid");
  field.removeAttribute("aria-invalid");
  label?.querySelector(".field-error")?.remove();
}

function validateClientForm(form, includePurchase = true) {
  let isValid = true;
  const purchaseFields = ["product", "brand", "price", "purchase_date", "payment_method"];

  Object.entries(CLIENT_VALIDATION).forEach(([name, rule]) => {
    if (!includePurchase && purchaseFields.includes(name)) return;
    const field = form.elements[name];
    if (!field) return;

    const value = field.value.trim();
    clearFieldError(field);

    if (rule.required && !value) {
      setFieldError(field, rule.required);
      isValid = false;
      return;
    }

    if (!value && rule.optional) return;

    if (value && rule.pattern && !rule.pattern.test(value)) {
      setFieldError(field, rule.message);
      isValid = false;
      return;
    }

    if (value && rule.validate && !rule.validate(value)) {
      setFieldError(field, rule.message);
      isValid = false;
    }
  });

  if (!isValid) {
    const firstInvalid = form.querySelector(".field-invalid");
    firstInvalid?.focus();
    firstInvalid?.scrollIntoView({ behavior: "smooth", block: "center" });
    showToast("Complete correctamente los campos obligatorios.", "error");
  }

  return isValid;
}

function setupClientInputGuards(form) {
  if (!form) return;

  form.querySelectorAll("input[name='full_name']").forEach((input) => {
    input.addEventListener("input", () => {
      input.value = input.value.replace(/[^\p{L}\s]/gu, "");
      clearFieldError(input);
    });
  });

  form.querySelectorAll("input[name='dni']").forEach((input) => {
    input.addEventListener("input", () => {
      input.value = input.value.replace(/\D/g, "").slice(0, 8);
      clearFieldError(input);
    });
  });

  form.querySelectorAll("input[name='phone']").forEach((input) => {
    input.addEventListener("input", () => {
      input.value = input.value.replace(/\D/g, "").slice(0, 9);
      clearFieldError(input);
    });
  });

  form.querySelectorAll("input, select, textarea").forEach((field) => {
    field.addEventListener("input", () => clearFieldError(field));
  });
}

function buildObservationsWithDiagnosis(diagnosis, observations) {
  const cleanDiagnosis = diagnosis.trim();
  const cleanObservations = observations.trim();
  return [`Diagnostico: ${cleanDiagnosis}`, cleanObservations].filter(Boolean).join("\n");
}

function extractDiagnosis(observations = "") {
  return String(observations).match(/^Diagnostico:\s*(.+)$/m)?.[1] || "";
}

function extractObservations(observations = "") {
  return String(observations).replace(/^Diagnostico:\s*.+\n?/m, "").trim();
}

// ── Paginación ────────────────────────────────────────────────
let currentPage = 1;
const PAGE_SIZE = 20;
let totalPages  = 1;
let lastSearchTerm = "";
let lastSearchDate = "";

function updatePaginationUI() {
  const pageInfo = document.getElementById("pageInfo");
  const prevBtn  = document.getElementById("prevPage");
  const nextBtn  = document.getElementById("nextPage");

  if (pageInfo) pageInfo.textContent = `Página ${currentPage} de ${totalPages}`;
  if (prevBtn)  prevBtn.disabled = currentPage <= 1;
  if (nextBtn)  nextBtn.disabled = currentPage >= totalPages;
}

// ── Guardar nuevo cliente ─────────────────────────────────────
async function saveClient(event) {
  event.preventDefault();
  const submit = clientForm.querySelector("button[type='submit']");
  if (!validateClientForm(clientForm, true)) return;

  const result = await confirmAction("Guardar cliente", "Deseas guardar este nuevo cliente?");
  if (!result.isConfirmed) return;

  setLoading(submit, true);

  const form = new FormData(clientForm);
  const { data: authData } = await db.auth.getUser();
  const userId = authData.user.id;

  // 1. Guardar / actualizar cliente (upsert por DNI)
  const clientPayload = {
    user_id:    userId,
    full_name:  form.get("full_name").trim(),
    dni:        form.get("dni").trim(),
    phone:      form.get("phone").trim(),
    email:      form.get("email").trim() || null,
    address:    form.get("address").trim() || null,
    birth_date: form.get("birth_date") || null,
  };

  const { data: client, error: clientError } = await db
    .from("clients")
    .upsert(clientPayload, { onConflict: "user_id,dni" })
    .select()
    .single();

  if (clientError) {
    setLoading(submit, false);
    showToast(clientError.message, "error");
    return;
  }

  // 2. Medidas visuales
  const measurePayload = {
    user_id:            userId,
    client_id:          client.id,
    right_eye:          form.get("right_eye") || null,
    left_eye:           form.get("left_eye") || null,
    sphere:             form.get("sphere") || null,
    cylinder:           form.get("cylinder") || null,
    axis:               form.get("axis") || null,
    addition:           form.get("addition") || null,
    pupillary_distance: form.get("pupillary_distance") || null,
    observations:       buildObservationsWithDiagnosis(form.get("diagnosis") || "", form.get("observations") || "") || null,
  };

  // 3. Compra
  const price = Number(form.get("price") || 0);
  const purchasePayload = {
    user_id:        userId,
    client_id:      client.id,
    product:        form.get("product").trim(),
    brand:          form.get("brand").trim() || null,
    price,
    purchase_date:  form.get("purchase_date") || new Date().toISOString().slice(0, 10),
    payment_method: form.get("payment_method"),
  };

  // 4. Venta (si tiene precio)
  const salePayload = {
    user_id:        userId,
    client_id:      client.id,
    description:    purchasePayload.product,
    amount:         price,
    sale_date:      purchasePayload.purchase_date,
    payment_method: purchasePayload.payment_method,
  };

  const [{ error: measureError }, { error: purchaseError }, { error: saleError }] = await Promise.all([
    db.from("visual_measures").insert(measurePayload),
    db.from("purchases").insert(purchasePayload),
    price > 0 ? db.from("sales").insert(salePayload) : Promise.resolve({ error: null }),
  ]);

  setLoading(submit, false);

  const error = measureError || purchaseError || saleError;
  if (error) {
    showToast(error.message, "error");
    return;
  }

  // Auditoría
  await logAudit("insert", "clients", client.id, clientPayload);

  clientForm.reset();
  showToast("Cliente, medidas y compra guardados correctamente.");
  currentPage = 1;
  await searchClients();
}

// ── Buscar clientes (con paginación) ─────────────────────────
async function searchClients(event) {
  if (event) {
    event.preventDefault();
    currentPage = 1; // Reiniciar página al buscar
  }
  if (!resultsBody) return;

  // Mostrar skeleton
  resultsBody.innerHTML = `<tr><td colspan="6" class="loading-row">Cargando...</td></tr>`;

  const search    = new FormData(searchForm);
  lastSearchTerm  = (search.get("term") || "").trim();
  lastSearchDate  = search.get("purchase_date") || "";

  let clientIds = null;

  // Filtrado por término o fecha
  if (lastSearchTerm || lastSearchDate) {
    const [clientMatchResult, purchaseMatchResult, saleMatchResult] = await Promise.all([
      lastSearchTerm
        ? db.from("clients").select("id").or(
            `full_name.ilike.%${lastSearchTerm}%,dni.ilike.%${lastSearchTerm}%,phone.ilike.%${lastSearchTerm}%`
          )
        : Promise.resolve({ data: [] }),
      (() => {
        let q = db.from("purchases").select("client_id");
        if (lastSearchTerm) q = q.ilike("product", `%${lastSearchTerm}%`);
        if (lastSearchDate) q = q.eq("purchase_date", lastSearchDate);
        return q;
      })(),
      lastSearchTerm
        ? db.from("sales").select("client_id").ilike("description", `%${lastSearchTerm}%`)
        : Promise.resolve({ data: [] }),
    ]);

    const ids = [
      ...(clientMatchResult.data || []).map((i) => i.id),
      ...(purchaseMatchResult.data || []).map((i) => i.client_id),
      ...(saleMatchResult.data || []).map((i) => i.client_id),
    ].filter((v, i, arr) => v && arr.indexOf(v) === i);

    if (!ids.length) {
      resultsBody.innerHTML = `<tr><td colspan="6" class="empty-row">No se encontraron clientes.</td></tr>`;
      totalPages = 1;
      updatePaginationUI();
      return;
    }
    clientIds = ids;
  }

  // Contar total para paginación
  let countQuery = db.from("clients").select("id", { count: "exact", head: true });
  if (clientIds) countQuery = countQuery.in("id", clientIds);
  const { count } = await countQuery;
  totalPages = Math.max(1, Math.ceil((count || 0) / PAGE_SIZE));
  if (currentPage > totalPages) currentPage = totalPages;
  updatePaginationUI();

  // Consulta paginada con datos relacionados
  const from = (currentPage - 1) * PAGE_SIZE;
  const to   = from + PAGE_SIZE - 1;

  let query = db
    .from("clients")
    .select(`
      id, full_name, dni, phone, email, address, birth_date, created_at,
      visual_measures(id, right_eye, left_eye, sphere, cylinder, axis, addition, pupillary_distance, observations, created_at),
      purchases(id, product, brand, price, purchase_date, payment_method),
      sales(id, description, amount, sale_date, payment_method)
    `)
    .order("created_at", { ascending: false })
    .range(from, to);

  if (clientIds) query = query.in("id", clientIds);

  const { data, error } = await query;
  if (error) {
    showToast(error.message, "error");
    return;
  }

  // Guardar resultados en memoria para edición/vista rápida
  window.lastClientResults = data || [];

  resultsBody.innerHTML =
    (data || [])
      .map((client) => {
        const lastPurchase = (client.purchases || []).sort(
          (a, b) => new Date(b.purchase_date) - new Date(a.purchase_date)
        )[0];
        return `
        <tr data-client-id="${client.id}">
          <td><strong>${escapeHtml(client.full_name)}</strong></td>
          <td>${escapeHtml(client.dni)}</td>
          <td>${escapeHtml(client.phone || "-")}</td>
          <td>${escapeHtml(lastPurchase?.product || "-")}</td>
          <td><strong>${formatMoney(lastPurchase?.price || 0)}</strong></td>
          <td>
            <div class="action-buttons">
              <button class="icon-text" data-view-client="${client.id}" type="button" title="Ver historial">📋 Ver</button>
              <button class="btn-edit"   data-edit-client="${client.id}" type="button" title="Editar">✎ Editar</button>
              <button class="btn-delete" data-delete-client="${client.id}"
                data-client-name="${escapeHtml(client.full_name)}" type="button" title="Eliminar">🗑</button>
            </div>
          </td>
        </tr>
      `;
      })
      .join("") || `<tr><td colspan="6" class="empty-row">No se encontraron clientes.</td></tr>`;
}

// ── Eliminar cliente ──────────────────────────────────────────
async function deleteClient(clientId, clientName) {
  const result = await confirmDelete(`al cliente "${clientName}"`);
  if (!result.isConfirmed) return;

  // Guardar datos antes de eliminar (para auditoría)
  const clientData = (window.lastClientResults || []).find((c) => c.id === clientId);

  const { error } = await db.from("clients").delete().eq("id", clientId);
  if (error) return showToast(error.message, "error");

  await logAudit("delete", "clients", clientId, null, {
    full_name: clientName,
    ...clientData,
  });

  showToast(`Cliente "${clientName}" eliminado correctamente.`);
  await searchClients();
}

// ── Abrir modal de edición ────────────────────────────────────
async function openEditClient(clientId) {
  // Buscar en memoria primero, luego en BD si no está
  let client = (window.lastClientResults || []).find((c) => c.id === clientId);

  if (!client) {
    const { data, error } = await db
      .from("clients")
      .select(`
        id, full_name, dni, phone, email, address, birth_date,
        visual_measures(id, right_eye, left_eye, sphere, cylinder, axis, addition, pupillary_distance, observations)
      `)
      .eq("id", clientId)
      .single();
    if (error || !data) return showToast("No se pudo cargar el cliente.", "error");
    client = data;
  }

  const lastMeasure = (client.visual_measures || []).sort(
    (a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0)
  )[0];

  // Rellenar campos del modal
  document.getElementById("editClientId").value     = clientId;
  document.getElementById("editFullName").value     = client.full_name || "";
  document.getElementById("editDni").value          = client.dni || "";
  document.getElementById("editPhone").value        = client.phone || "";
  document.getElementById("editEmail").value        = client.email || "";
  document.getElementById("editAddress").value      = client.address || "";
  document.getElementById("editBirthDate").value    = client.birth_date || "";

  if (lastMeasure) {
    document.getElementById("editRightEye").value         = lastMeasure.right_eye || "";
    document.getElementById("editLeftEye").value          = lastMeasure.left_eye || "";
    document.getElementById("editSphere").value           = lastMeasure.sphere || "";
    document.getElementById("editCylinder").value         = lastMeasure.cylinder || "";
    document.getElementById("editAxis").value             = lastMeasure.axis || "";
    document.getElementById("editAddition").value         = lastMeasure.addition || "";
    document.getElementById("editPupillaryDistance").value = lastMeasure.pupillary_distance || "";
    document.getElementById("editDiagnosis").value        = extractDiagnosis(lastMeasure.observations || "");
    document.getElementById("editObservations").value     = extractObservations(lastMeasure.observations || "");
    document.getElementById("editMeasureId").value        = lastMeasure.id || "";
  } else {
    // Limpiar campos de medidas si no hay
    ["editRightEye","editLeftEye","editSphere","editCylinder",
     "editAxis","editAddition","editDiagnosis","editPupillaryDistance","editObservations","editMeasureId"]
      .forEach((id) => { document.getElementById(id).value = ""; });
  }

  openModal("editClientModal");
}

// ── Guardar edición de cliente ────────────────────────────────
async function saveEditClient(e) {
  e.preventDefault();
  const submit   = editForm.querySelector("button[type='submit']");
  const clientId = document.getElementById("editClientId").value;
  const measureId = document.getElementById("editMeasureId").value;

  if (!validateClientForm(editForm, false)) return;

  const result = await confirmAction("Guardar cambios", "Deseas guardar los cambios de este cliente?");
  if (!result.isConfirmed) return;

  setLoading(submit, true);
  const form = new FormData(editForm);

  // Datos anteriores (para auditoría)
  const oldClient = (window.lastClientResults || []).find((c) => c.id === clientId);

  const clientPayload = {
    full_name:  form.get("full_name").trim(),
    dni:        form.get("dni").trim(),
    phone:      form.get("phone").trim(),
    email:      form.get("email").trim() || null,
    address:    form.get("address").trim() || null,
    birth_date: form.get("birth_date") || null,
  };

  const measurePayload = {
    right_eye:          form.get("right_eye") || null,
    left_eye:           form.get("left_eye") || null,
    sphere:             form.get("sphere") || null,
    cylinder:           form.get("cylinder") || null,
    axis:               form.get("axis") || null,
    addition:           form.get("addition") || null,
    pupillary_distance: form.get("pupillary_distance") || null,
    observations:       buildObservationsWithDiagnosis(form.get("diagnosis") || "", form.get("observations") || "") || null,
  };

  // Actualizar cliente
  const { error: clientError } = await db.from("clients").update(clientPayload).eq("id", clientId);
  if (clientError) {
    setLoading(submit, false);
    return showToast(clientError.message, "error");
  }

  // Actualizar medidas (si existen) o insertar nuevas
  if (measureId) {
    await db.from("visual_measures").update(measurePayload).eq("id", measureId);
  } else {
    const { data: authData } = await db.auth.getUser();
    await db.from("visual_measures").insert({
      ...measurePayload,
      user_id:   authData.user.id,
      client_id: clientId,
    });
  }

  // Auditoría
  await logAudit("update", "clients", clientId, clientPayload, oldClient);

  setLoading(submit, false);
  showToast("Cliente actualizado correctamente.");
  closeModal("editClientModal");
  await searchClients();
}

// ── Vista completa de cliente con pestañas ─────────────────────
function calculateAge(birthDate) {
  if (!birthDate) return "-";
  const birth = new Date(`${birthDate}T00:00:00`);
  if (Number.isNaN(birth.getTime())) return "-";
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const monthDiff = today.getMonth() - birth.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) age -= 1;
  return `${age} años`;
}

function sortByDate(rows, field) {
  return [...(rows || [])].sort((a, b) => new Date(b[field] || 0) - new Date(a[field] || 0));
}

function renderInfoCard(title, rows) {
  return `
    <article class="client-card">
      <h4>${escapeHtml(title)}</h4>
      <dl class="client-detail-list">
        ${rows.map(([label, value]) => `
          <div>
            <dt>${escapeHtml(label)}</dt>
            <dd>${escapeHtml(value || "-")}</dd>
          </div>
        `).join("")}
      </dl>
    </article>
  `;
}

function renderTimelineItems(rows, emptyText, renderer) {
  return rows.length
    ? rows.map(renderer).join("")
    : `<div class="client-empty-state">${escapeHtml(emptyText)}</div>`;
}

function getClientViewData(client) {
  const measures = sortByDate(client.visual_measures, "created_at");
  const purchases = sortByDate(client.purchases, "purchase_date");
  const sales = sortByDate(client.sales, "sale_date");
  const lastMeasure = measures[0] || {};
  const lastPurchase = purchases[0] || {};
  const lastSale = sales[0] || {};
  const totalPurchases = purchases.reduce((sum, item) => sum + Number(item.price || 0), 0);
  const totalSales = sales.reduce((sum, item) => sum + Number(item.amount || 0), 0);

  return { measures, purchases, sales, lastMeasure, lastPurchase, lastSale, totalPurchases, totalSales };
}

function renderClientTabContent(client, tab) {
  const data = getClientViewData(client);

  const personalCard = renderInfoCard("Datos personales", [
    ["Nombre completo", client.full_name],
    ["DNI", client.dni],
    ["Numero celular", client.phone],
    ["Correo electronico", client.email],
    ["Direccion", client.address],
    ["Fecha de nacimiento", formatDate(client.birth_date)],
    ["Edad", calculateAge(client.birth_date)],
  ]);

  const visualCard = renderInfoCard("Datos visuales recientes", [
    ["Ojo derecho", data.lastMeasure.right_eye],
    ["Ojo izquierdo", data.lastMeasure.left_eye],
    ["Esfera", data.lastMeasure.sphere],
    ["Cilindro", data.lastMeasure.cylinder],
    ["Eje", data.lastMeasure.axis],
    ["Adicion", data.lastMeasure.addition],
    ["Distancia pupilar", data.lastMeasure.pupillary_distance],
    ["Diagnostico", extractDiagnosis(data.lastMeasure.observations || "")],
    ["Observaciones", extractObservations(data.lastMeasure.observations || "")],
  ]);

  const purchaseCard = renderInfoCard("Ultima compra", [
    ["Producto comprado", data.lastPurchase.product],
    ["Marca", data.lastPurchase.brand],
    ["Precio", data.lastPurchase.price ? formatMoney(data.lastPurchase.price) : "-"],
    ["Fecha de compra", formatDate(data.lastPurchase.purchase_date)],
    ["Metodo de pago", data.lastPurchase.payment_method],
  ]);

  const summary = `
    <div class="client-summary-grid">
      <article class="client-kpi"><span>Compras</span><strong>${data.purchases.length}</strong></article>
      <article class="client-kpi"><span>Total compras</span><strong>${formatMoney(data.totalPurchases)}</strong></article>
      <article class="client-kpi"><span>Ventas vinculadas</span><strong>${data.sales.length}</strong></article>
      <article class="client-kpi"><span>Total ventas</span><strong>${formatMoney(data.totalSales)}</strong></article>
    </div>
    <div class="client-card-grid">${personalCard}${visualCard}${purchaseCard}</div>
  `;

  const measures = `
    <div class="client-timeline">
      ${renderTimelineItems(data.measures, "Sin medidas visuales registradas.", (item) => `
        <article class="client-timeline-item">
          <div><strong>${formatDateTime(item.created_at)}</strong><span>Registro optometrico</span></div>
          <p>OD: <b>${escapeHtml(item.right_eye || "-")}</b> | OI: <b>${escapeHtml(item.left_eye || "-")}</b> | Esfera: ${escapeHtml(item.sphere || "-")} | Cilindro: ${escapeHtml(item.cylinder || "-")} | Eje: ${escapeHtml(item.axis || "-")}</p>
          <p>Adicion: ${escapeHtml(item.addition || "-")} | DP: ${escapeHtml(item.pupillary_distance || "-")}</p>
          ${item.observations ? `<small>${escapeHtml(item.observations)}</small>` : ""}
        </article>
      `)}
    </div>
  `;

  const purchases = `
    <div class="client-timeline">
      ${renderTimelineItems(data.purchases, "Sin compras registradas.", (item) => `
        <article class="client-timeline-item">
          <div><strong>${formatDate(item.purchase_date)} - ${formatMoney(item.price)}</strong><span>${escapeHtml(item.payment_method || "-")}</span></div>
          <p>${escapeHtml(item.product || "-")} ${item.brand ? `<span class="badge-sm">${escapeHtml(item.brand)}</span>` : ""}</p>
        </article>
      `)}
    </div>
  `;

  const sales = `
    <div class="client-timeline">
      ${renderTimelineItems(data.sales, "Sin ventas vinculadas registradas.", (item) => `
        <article class="client-timeline-item">
          <div><strong>${formatDate(item.sale_date)} - ${formatMoney(item.amount)}</strong><span>${escapeHtml(item.payment_method || "-")}</span></div>
          <p>${escapeHtml(item.description || "-")}</p>
        </article>
      `)}
    </div>
  `;

  const history = `
    <div class="client-card-grid">
      ${renderInfoCard("Resumen historico", [
        ["Fecha de registro", formatDateTime(client.created_at)],
        ["Ultima medida", data.lastMeasure.created_at ? formatDateTime(data.lastMeasure.created_at) : "-"],
        ["Ultima compra", formatDate(data.lastPurchase.purchase_date)],
        ["Ultima venta", formatDate(data.lastSale.sale_date)],
      ])}
      ${purchaseCard}
      ${visualCard}
    </div>
  `;

  const tabs = {
    resumen: summary,
    datos: `<div class="client-card-grid">${personalCard}${purchaseCard}${visualCard}</div>`,
    medidas: measures,
    compras: purchases,
    ventas: sales,
    historial: history,
  };

  return tabs[tab] || summary;
}

function renderClientHistory(clientId, activeTab = "resumen") {
  const client = (window.lastClientResults || []).find((c) => c.id === clientId);
  if (!client || !historyPanel) return;

  const tabs = [
    ["resumen", "1. Resumen"],
    ["medidas", "2. Medidas visuales"],
    ["compras", "3. Compras"],
    ["ventas", "4. Ventas"],
    ["historial", "5. Historial"],
    ["datos", "6. Datos del cliente"],
  ];

  historyPanel.dataset.activeClient = clientId;
  historyPanel.innerHTML = `
    <div class="client-profile-header">
      <div>
        <span class="eyebrow">Perfil del cliente</span>
        <h3>${escapeHtml(client.full_name)}</h3>
        <p>${escapeHtml(client.dni)} · ${escapeHtml(client.phone || "-")}</p>
      </div>
      <span class="badge">${calculateAge(client.birth_date)}</span>
    </div>
    <div class="client-tabs" role="tablist">
      ${tabs.map(([key, label]) => `
        <button class="${key === activeTab ? "active" : ""}" data-client-tab="${key}" type="button" role="tab">
          ${escapeHtml(label)}
        </button>
      `).join("")}
    </div>
    <div class="client-tab-content" data-client-tab-content>
      ${renderClientTabContent(client, activeTab)}
    </div>
  `;

  historyPanel.scrollIntoView({ behavior: "smooth", block: "start" });
}

// ── Exportar Excel ────────────────────────────────────────────
async function exportClients() {
  showToast("Generando Excel...", "success");
  const { data, error } = await db
    .from("clients")
    .select("full_name,dni,phone,email,address,birth_date,created_at")
    .order("created_at", { ascending: false });

  if (error) return showToast(error.message, "error");

  toExcel(
    (data || []).map((c) => ({
      Nombre:    c.full_name,
      DNI:       c.dni,
      Celular:   c.phone,
      Correo:    c.email || "",
      Direccion: c.address || "",
      Nacimiento: c.birth_date || "",
      Registro:  new Date(c.created_at).toLocaleDateString("es-PE"),
    })),
    "clientes",
    "Clientes"
  );
}

// ── Delegación de eventos en tabla ────────────────────────────
resultsBody?.addEventListener("click", (event) => {
  const viewBtn   = event.target.closest("[data-view-client]");
  const editBtn   = event.target.closest("[data-edit-client]");
  const deleteBtn = event.target.closest("[data-delete-client]");

  if (viewBtn)   renderClientHistory(viewBtn.dataset.viewClient);
  if (editBtn)   openEditClient(editBtn.dataset.editClient);
  if (deleteBtn) deleteClient(deleteBtn.dataset.deleteClient, deleteBtn.dataset.clientName);
});

historyPanel?.addEventListener("click", (event) => {
  const tab = event.target.closest("[data-client-tab]");
  if (!tab) return;

  const clientId = historyPanel.dataset.activeClient;
  if (!clientId) return;
  renderClientHistory(clientId, tab.dataset.clientTab);
});

// ── Paginación ────────────────────────────────────────────────
document.getElementById("prevPage")?.addEventListener("click", () => {
  if (currentPage > 1) { currentPage--; searchClients(); }
});
document.getElementById("nextPage")?.addEventListener("click", () => {
  if (currentPage < totalPages) { currentPage++; searchClients(); }
});

// ── Event listeners ───────────────────────────────────────────
setupClientInputGuards(clientForm);
setupClientInputGuards(editForm);
clientForm?.addEventListener("submit", saveClient);
searchForm?.addEventListener("submit", searchClients);
editForm?.addEventListener("submit", saveEditClient);
document.querySelector("[data-export-clients]")?.addEventListener("click", exportClients);

// Carga inicial
document.addEventListener("DOMContentLoaded", searchClients);
