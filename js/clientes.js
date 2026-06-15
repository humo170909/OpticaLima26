// ============================================================
// clientes.js — CRUD completo con ficha optométrica profesional
// Óptica Lima
// ============================================================

const clientForm   = document.querySelector("[data-client-form]");
const searchForm   = document.querySelector("[data-client-search]");
const resultsBody  = document.querySelector("[data-client-results]");
const historyPanel = document.querySelector("[data-client-history]");
const editForm     = document.querySelector("#editClientForm");

// ── Validación ────────────────────────────────────────────────
const CLIENT_VALIDATION = {
  full_name:      { required: "Los nombres completos son obligatorios.", pattern: /^[\p{L}\s]+$/u, message: "Solo se permiten letras y espacios." },
  dni:            { required: "El DNI es obligatorio.", pattern: /^\d{8}$/, message: "Ingrese un DNI valido de 8 digitos." },
  phone:          { required: "El celular es obligatorio.", pattern: /^\d{9}$/, message: "Ingrese un numero celular valido de 9 digitos." },
  email:          { optional: true, pattern: /^[^\s@]+@[^\s@]+\.[^\s@]+$/, message: "Ingrese un correo valido." },
  birth_date:     { required: "La fecha de nacimiento es obligatoria." },
  diagnosis_type: { required: "El tipo de diagnostico es obligatorio." },
  product:        { required: "El producto comprado es obligatorio." },
  brand:          { required: "La marca es obligatoria." },
  price:          { required: "El precio es obligatorio.", validate: (v) => Number(v) > 0, message: "Ingrese un precio mayor a cero." },
  purchase_date:  { required: "La fecha de compra es obligatoria." },
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

// ── Helpers payload visual ────────────────────────────────────
function buildMeasurePayload(form, userId, clientId) {
  return {
    user_id:          userId,
    client_id:        clientId,
    // Campos OD
    od_sphere:        form.get("od_sphere")         || null,
    od_cylinder:      form.get("od_cylinder")       || null,
    od_axis:          form.get("od_axis")            || null,
    od_pupillary_dist:form.get("od_pupillary_dist")  || null,
    // Campos OI
    oi_sphere:        form.get("oi_sphere")         || null,
    oi_cylinder:      form.get("oi_cylinder")       || null,
    oi_axis:          form.get("oi_axis")            || null,
    oi_pupillary_dist:form.get("oi_pupillary_dist")  || null,
    // Agudeza visual
    av_lejos_od:      form.get("av_lejos_od")       || null,
    av_lejos_oi:      form.get("av_lejos_oi")       || null,
    av_cerca_od:      form.get("av_cerca_od")       || null,
    av_cerca_oi:      form.get("av_cerca_oi")       || null,
    // Clínica
    addition:         form.get("addition")           || null,
    diagnosis_type:   form.get("diagnosis_type")    || null,
    observations:     form.get("observations")?.trim() || null,
    // Compat. legacy (vacíos pero presentes por si la BD los requiere)
    right_eye:        form.get("od_sphere")         || null,
    left_eye:         form.get("oi_sphere")         || null,
    sphere:           form.get("od_sphere")         || null,
    cylinder:         form.get("od_cylinder")       || null,
    axis:             form.get("od_axis")            || null,
    pupillary_distance: form.get("od_pupillary_dist") || null,
  };
}

// ── Paginación ────────────────────────────────────────────────
let currentPage    = 1;
const PAGE_SIZE    = 20;
let totalPages     = 1;
let lastSearchTerm = "";
let lastSearchDate = "";
let isSearching    = false; // guard de concurrencia

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
  if (!authData?.user) {
    setLoading(submit, false);
    showToast("Tu sesion ha expirado. Por favor inicia sesion de nuevo.", "error");
    setTimeout(() => { window.location.replace("login.html"); }, 2000);
    return;
  }
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

  // 2. Medidas visuales — SIEMPRE INSERT (historial)
  const measurePayload = buildMeasurePayload(form, userId, client.id);

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

  await logAudit("insert", "clients", client.id, clientPayload);
  clientForm.reset();
  showToast("Cliente, medidas y compra guardados correctamente.");
  currentPage = 1;
  await searchClients();
}

// ── Buscar clientes (con paginación) ─────────────────────────
async function searchClients(event) {
  // Solo resetear página cuando viene de un submit de formulario real
  if (event?.preventDefault) {
    event.preventDefault();
    currentPage = 1;
  }
  if (!resultsBody) return;

  // Guard: evita peticiones concurrentes por doble-clic
  if (isSearching) return;
  isSearching = true;

  // Deshabilitar botones de paginación durante la carga
  const prevBtn = document.getElementById("prevPage");
  const nextBtn = document.getElementById("nextPage");
  if (prevBtn) prevBtn.disabled = true;
  if (nextBtn) nextBtn.disabled = true;

  resultsBody.innerHTML = `<tr><td colspan="6" class="loading-row">Cargando...</td></tr>`;

  try {
    if (!searchForm) throw new Error("Formulario de búsqueda no encontrado.");

    const search   = new FormData(searchForm);
    lastSearchTerm = (search.get("term") || "").trim();
    lastSearchDate = search.get("purchase_date") || "";

    // Sanitizar para evitar manipulación de filtros ilike
    const safeTerm = lastSearchTerm.replace(/[%_\\]/g, "\\$&");

    let clientIds = null;

    if (safeTerm || lastSearchDate) {
      const [clientMatchResult, purchaseMatchResult, saleMatchResult] = await Promise.all([
        safeTerm
          ? db.from("clients").select("id").or(
              `full_name.ilike.%${safeTerm}%,dni.ilike.%${safeTerm}%,phone.ilike.%${safeTerm}%`
            )
          : Promise.resolve({ data: [] }),
        (() => {
          let q = db.from("purchases").select("client_id");
          if (safeTerm)      q = q.ilike("product", `%${safeTerm}%`);
          if (lastSearchDate) q = q.eq("purchase_date", lastSearchDate);
          return q;
        })(),
        safeTerm
          ? db.from("sales").select("client_id").ilike("description", `%${safeTerm}%`)
          : Promise.resolve({ data: [] }),
      ]);

      const searchErrors = [clientMatchResult.error, purchaseMatchResult.error, saleMatchResult.error].filter(Boolean);
      if (searchErrors.length) throw searchErrors[0];

      const ids = [...new Set([
        ...(clientMatchResult.data || []).map((i) => i.id),
        ...(purchaseMatchResult.data || []).map((i) => i.client_id),
        ...(saleMatchResult.data || []).map((i) => i.client_id),
      ].filter(Boolean))];

      if (!ids.length) {
        resultsBody.innerHTML = `<tr><td colspan="6" class="empty-row">No se encontraron clientes.</td></tr>`;
        totalPages = 1;
        return;
      }
      clientIds = ids;
    }

    // Conteo con manejo de error explícito
    let countQuery = db.from("clients").select("id", { count: "exact", head: true });
    if (clientIds) countQuery = countQuery.in("id", clientIds);
    const { count, error: countError } = await countQuery;
    if (countError) throw countError;

    totalPages = Math.max(1, Math.ceil((count || 0) / PAGE_SIZE));
    if (currentPage > totalPages) currentPage = totalPages;

    const from = (currentPage - 1) * PAGE_SIZE;
    const to   = from + PAGE_SIZE - 1;

    let query = db
      .from("clients")
      .select(`
        id, full_name, dni, phone, email, address, birth_date, created_at,
        visual_measures(
          id, od_sphere, od_cylinder, od_axis, od_pupillary_dist,
          oi_sphere, oi_cylinder, oi_axis, oi_pupillary_dist,
          av_lejos_od, av_lejos_oi, av_cerca_od, av_cerca_oi,
          addition, diagnosis_type, observations,
          right_eye, left_eye, sphere, cylinder, axis, pupillary_distance,
          created_at
        ),
        purchases(id, product, brand, price, purchase_date, payment_method),
        sales(id, description, amount, sale_date, payment_method)
      `)
      .order("created_at", { ascending: false })
      .range(from, to);

    if (clientIds) query = query.in("id", clientIds);

    const { data, error } = await query;
    if (error) throw error;

    window.lastClientResults = data || [];

    resultsBody.innerHTML =
      (data || [])
        .map((client) => {
          const lastPurchase = (client.purchases || []).sort(
            (a, b) => new Date(b.purchase_date) - new Date(a.purchase_date)
          )[0];
          const lastMeasure = (client.visual_measures || []).sort(
            (a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0)
          )[0];
          const dx = lastMeasure?.diagnosis_type || "-";
          return `
          <tr data-client-id="${client.id}">
            <td>
              <strong>${escapeHtml(client.full_name)}</strong>
              ${dx !== "-" ? `<span class="table-subtext">${escapeHtml(dx)}</span>` : ""}
            </td>
            <td>${escapeHtml(client.dni)}</td>
            <td>${escapeHtml(client.phone || "-")}</td>
            <td>${escapeHtml(lastPurchase?.product || "-")}</td>
            <td><strong>${formatMoney(lastPurchase?.price || 0)}</strong></td>
            <td>
              <div class="action-buttons">
                <button class="icon-text"  data-view-client="${client.id}"   type="button" title="Ver historial">📋 Ver</button>
                <button class="btn-edit"   data-edit-client="${client.id}"   type="button" title="Editar">✎ Editar</button>
                <button class="btn-delete" data-delete-client="${client.id}"
                  data-client-name="${escapeHtml(client.full_name)}"         type="button" title="Eliminar">🗑</button>
              </div>
            </td>
          </tr>
        `;
        })
        .join("") || `<tr><td colspan="6" class="empty-row">No se encontraron clientes.</td></tr>`;

  } catch (err) {
    // CRÍTICO: limpiar "Cargando..." y mostrar estado de error recuperable
    resultsBody.innerHTML = `
      <tr>
        <td colspan="6" class="empty-row">
          Error al cargar los datos.
          <button class="icon-text" onclick="searchClients()" style="margin-left:8px" type="button">Reintentar</button>
        </td>
      </tr>`;
    showToast(err?.message || "Error al cargar los clientes.", "error");
  } finally {
    // SIEMPRE liberar el guard y restaurar botones
    isSearching = false;
    updatePaginationUI();
  }
}

// ── Eliminar cliente ──────────────────────────────────────────
async function deleteClient(clientId, clientName) {
  const result = await confirmDelete(`al cliente "${clientName}"`);
  if (!result.isConfirmed) return;

  const clientData = (window.lastClientResults || []).find((c) => c.id === clientId);
  const { error } = await db.from("clients").delete().eq("id", clientId);
  if (error) return showToast(error.message, "error");

  await logAudit("delete", "clients", clientId, null, { full_name: clientName, ...clientData });
  showToast(`Cliente "${clientName}" eliminado correctamente.`);
  await searchClients();
}

// ── Abrir modal de edición ────────────────────────────────────
async function openEditClient(clientId) {
  let client = (window.lastClientResults || []).find((c) => c.id === clientId);

  if (!client) {
    const { data, error } = await db
      .from("clients")
      .select(`
        id, full_name, dni, phone, email, address, birth_date,
        visual_measures(
          id, od_sphere, od_cylinder, od_axis, od_pupillary_dist,
          oi_sphere, oi_cylinder, oi_axis, oi_pupillary_dist,
          av_lejos_od, av_lejos_oi, av_cerca_od, av_cerca_oi,
          addition, diagnosis_type, observations, created_at
        )
      `)
      .eq("id", clientId)
      .single();
    if (error || !data) return showToast("No se pudo cargar el cliente.", "error");
    client = data;
  }

  const lastMeasure = (client.visual_measures || []).sort(
    (a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0)
  )[0];

  // Datos personales
  document.getElementById("editClientId").value  = clientId;
  document.getElementById("editFullName").value  = client.full_name || "";
  document.getElementById("editDni").value       = client.dni || "";
  document.getElementById("editPhone").value     = client.phone || "";
  document.getElementById("editEmail").value     = client.email || "";
  document.getElementById("editAddress").value   = client.address || "";
  document.getElementById("editBirthDate").value = client.birth_date || "";

  // Campos visuales
  const m = lastMeasure || {};
  document.getElementById("editMeasureId").value      = m.id || "";
  document.getElementById("editOdSphere").value       = m.od_sphere        || m.sphere   || "";
  document.getElementById("editOdCylinder").value     = m.od_cylinder      || m.cylinder || "";
  document.getElementById("editOdAxis").value         = m.od_axis          || m.axis     || "";
  document.getElementById("editOdPupillary").value    = m.od_pupillary_dist || m.pupillary_distance || "";
  document.getElementById("editOiSphere").value       = m.oi_sphere        || "";
  document.getElementById("editOiCylinder").value     = m.oi_cylinder      || "";
  document.getElementById("editOiAxis").value         = m.oi_axis          || "";
  document.getElementById("editOiPupillary").value    = m.oi_pupillary_dist || "";
  document.getElementById("editAvLejosOd").value      = m.av_lejos_od      || "";
  document.getElementById("editAvLejosOi").value      = m.av_lejos_oi      || "";
  document.getElementById("editAvCercaOd").value      = m.av_cerca_od      || "";
  document.getElementById("editAvCercaOi").value      = m.av_cerca_oi      || "";
  document.getElementById("editAddition").value       = m.addition         || "";
  document.getElementById("editDiagnosisType").value  = m.diagnosis_type   || "";
  document.getElementById("editObservations").value   = m.observations     || "";

  openModal("editClientModal");
}

// ── Guardar edición de cliente ────────────────────────────────
async function saveEditClient(e) {
  e.preventDefault();
  const submit    = editForm.querySelector("button[type='submit']");
  const clientId  = document.getElementById("editClientId").value;
  const measureId = document.getElementById("editMeasureId").value;

  if (!validateClientForm(editForm, false)) return;

  const result = await confirmAction("Guardar cambios", "Deseas guardar los cambios de este cliente?");
  if (!result.isConfirmed) return;

  setLoading(submit, true);
  const form = new FormData(editForm);

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
    od_sphere:         form.get("od_sphere")          || null,
    od_cylinder:       form.get("od_cylinder")        || null,
    od_axis:           form.get("od_axis")             || null,
    od_pupillary_dist: form.get("od_pupillary_dist")   || null,
    oi_sphere:         form.get("oi_sphere")          || null,
    oi_cylinder:       form.get("oi_cylinder")        || null,
    oi_axis:           form.get("oi_axis")             || null,
    oi_pupillary_dist: form.get("oi_pupillary_dist")   || null,
    av_lejos_od:       form.get("av_lejos_od")        || null,
    av_lejos_oi:       form.get("av_lejos_oi")        || null,
    av_cerca_od:       form.get("av_cerca_od")        || null,
    av_cerca_oi:       form.get("av_cerca_oi")        || null,
    addition:          form.get("addition")            || null,
    diagnosis_type:    form.get("diagnosis_type")     || null,
    observations:      form.get("observations")?.trim() || null,
    // legacy compat
    right_eye:         form.get("od_sphere")          || null,
    left_eye:          form.get("oi_sphere")          || null,
    sphere:            form.get("od_sphere")          || null,
    cylinder:          form.get("od_cylinder")        || null,
    axis:              form.get("od_axis")             || null,
    pupillary_distance:form.get("od_pupillary_dist")   || null,
  };

  const { error: clientError } = await db.from("clients").update(clientPayload).eq("id", clientId);
  if (clientError) {
    setLoading(submit, false);
    return showToast(clientError.message, "error");
  }

  // Editar: UPDATE medida existente (no crear historial nuevo aquí)
  let measureErr;
  if (measureId) {
    const { error } = await db.from("visual_measures").update(measurePayload).eq("id", measureId);
    measureErr = error;
  } else {
    const { data: authData } = await db.auth.getUser();
    const { error } = await db.from("visual_measures").insert({
      ...measurePayload,
      user_id:   authData.user.id,
      client_id: clientId,
    });
    measureErr = error;
  }

  setLoading(submit, false);

  if (measureErr) {
    showToast(measureErr.message, "error");
    return;
  }

  await logAudit("update", "clients", clientId, clientPayload, oldClient);
  showToast("Cliente actualizado correctamente.");
  closeModal("editClientModal");
  await searchClients();
}

// ── Receta visual ─────────────────────────────────────────────
function buildRecipeHTML(client, measure) {
  const m = measure || {};
  const v = (val) => escapeHtml(val || "-");
  const today = new Date().toLocaleDateString("es-PE", { year: "numeric", month: "long", day: "numeric" });

  return `
    <div class="recipe-header">
      <h2>Óptica Lima</h2>
      <p>Receta Visual / Prescripción Óptica</p>
    </div>

    <dl class="recipe-patient">
      <dt>Paciente</dt>   <dd>${v(client.full_name)}</dd>
      <dt>DNI</dt>        <dd>${v(client.dni)}</dd>
      <dt>Celular</dt>    <dd>${v(client.phone)}</dd>
      <dt>Fecha</dt>      <dd>${today}</dd>
      <dt>Diagnóstico</dt><dd>${v(m.diagnosis_type)}</dd>
      <dt>Edad</dt>       <dd>${calculateAge(client.birth_date)}</dd>
    </dl>

    <table class="recipe-table">
      <thead>
        <tr>
          <th>Ojo</th><th>Esfera</th><th>Cilindro</th><th>Eje</th>
          <th>D.P.</th><th>Adición</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td>OD — Derecho</td>
          <td>${v(m.od_sphere)}</td>
          <td>${v(m.od_cylinder)}</td>
          <td>${v(m.od_axis)}</td>
          <td>${v(m.od_pupillary_dist)}</td>
          <td rowspan="2">${v(m.addition)}</td>
        </tr>
        <tr>
          <td>OI — Izquierdo</td>
          <td>${v(m.oi_sphere)}</td>
          <td>${v(m.oi_cylinder)}</td>
          <td>${v(m.oi_axis)}</td>
          <td>${v(m.oi_pupillary_dist)}</td>
        </tr>
      </tbody>
    </table>

    ${(m.av_lejos_od || m.av_lejos_oi || m.av_cerca_od || m.av_cerca_oi) ? `
    <table class="recipe-av-table">
      <thead>
        <tr><th>Agudeza Visual</th><th>Lejos OD</th><th>Lejos OI</th><th>Cerca OD</th><th>Cerca OI</th></tr>
      </thead>
      <tbody>
        <tr>
          <td>Sin corrección</td>
          <td>${v(m.av_lejos_od)}</td><td>${v(m.av_lejos_oi)}</td>
          <td>${v(m.av_cerca_od)}</td><td>${v(m.av_cerca_oi)}</td>
        </tr>
      </tbody>
    </table>` : ""}

    ${m.observations ? `
    <dl class="recipe-dx">
      <dt>Observaciones</dt>
      <dd>${escapeHtml(m.observations)}</dd>
    </dl>` : ""}

    <div class="recipe-signature">
      <div>
        <span>Firma y sello del optometrista</span>
        <strong>&nbsp;</strong>
      </div>
      <div>
        <span>Fecha de emisión</span>
        <strong>${today}</strong>
      </div>
    </div>
  `;
}

function openRecipe(clientId, measureId) {
  const client = (window.lastClientResults || []).find((c) => c.id === clientId);
  if (!client) return;

  const allMeasures = [...(client.visual_measures || [])].sort(
    (a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0)
  );
  const measure = measureId
    ? allMeasures.find((m) => m.id === measureId)
    : allMeasures[0];

  document.getElementById("recipeSheet").innerHTML = buildRecipeHTML(client, measure);
  openModal("recipeModal");
}

// ── Vista completa de cliente con pestañas ────────────────────
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

// Renderiza tarjeta visual OD/OI moderna para el historial
function renderVisualMeasureCard(item, clientId) {
  const v = (val) => escapeHtml(val || "-");
  const hasAv = item.av_lejos_od || item.av_lejos_oi || item.av_cerca_od || item.av_cerca_oi;

  return `
    <article class="vht-item">
      <div class="vht-header">
        <span class="vht-date">📅 ${formatDateTime(item.created_at)}</span>
        <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">
          ${item.diagnosis_type
            ? `<span class="vht-diagnosis-badge">🩺 ${escapeHtml(item.diagnosis_type)}</span>`
            : ""}
          <button class="btn-recipe" data-recipe-client="${clientId}" data-recipe-measure="${item.id}" type="button">
            🖨 Receta
          </button>
        </div>
      </div>
      <div class="vht-body">
        <div class="vht-eye">
          <div class="vht-eye-label">OD — Ojo Derecho</div>
          <dl class="vht-eye-grid">
            <div class="vht-field"><dt>Esfera</dt><dd>${v(item.od_sphere   || item.sphere)}</dd></div>
            <div class="vht-field"><dt>Cilindro</dt><dd>${v(item.od_cylinder || item.cylinder)}</dd></div>
            <div class="vht-field"><dt>Eje</dt><dd>${v(item.od_axis       || item.axis)}</dd></div>
            <div class="vht-field"><dt>D.P.</dt><dd>${v(item.od_pupillary_dist || item.pupillary_distance)}</dd></div>
          </dl>
        </div>
        <div class="vht-eye">
          <div class="vht-eye-label">OI — Ojo Izquierdo</div>
          <dl class="vht-eye-grid">
            <div class="vht-field"><dt>Esfera</dt><dd>${v(item.oi_sphere)}</dd></div>
            <div class="vht-field"><dt>Cilindro</dt><dd>${v(item.oi_cylinder)}</dd></div>
            <div class="vht-field"><dt>Eje</dt><dd>${v(item.oi_axis)}</dd></div>
            <div class="vht-field"><dt>D.P.</dt><dd>${v(item.oi_pupillary_dist)}</dd></div>
          </dl>
        </div>
      </div>
      ${(hasAv || item.addition || item.observations) ? `
      <div class="vht-footer">
        <div style="display:flex;gap:16px;flex-wrap:wrap;">
          ${item.addition ? `<span>Adición: <strong>${v(item.addition)}</strong></span>` : ""}
          ${hasAv ? `
            <span>AV Lejos OD: <strong>${v(item.av_lejos_od)}</strong></span>
            <span>AV Lejos OI: <strong>${v(item.av_lejos_oi)}</strong></span>
            <span>AV Cerca OD: <strong>${v(item.av_cerca_od)}</strong></span>
            <span>AV Cerca OI: <strong>${v(item.av_cerca_oi)}</strong></span>
          ` : ""}
        </div>
        ${item.observations ? `<p class="vht-obs">${escapeHtml(item.observations)}</p>` : ""}
      </div>` : ""}
    </article>
  `;
}

function getClientViewData(client) {
  const measures  = sortByDate(client.visual_measures, "created_at");
  const purchases = sortByDate(client.purchases, "purchase_date");
  const sales     = sortByDate(client.sales, "sale_date");
  const lastMeasure  = measures[0]  || {};
  const lastPurchase = purchases[0] || {};
  const lastSale     = sales[0]     || {};
  const totalPurchases = purchases.reduce((sum, item) => sum + Number(item.price  || 0), 0);
  const totalSales     = sales.reduce((sum, item)     => sum + Number(item.amount || 0), 0);
  return { measures, purchases, sales, lastMeasure, lastPurchase, lastSale, totalPurchases, totalSales };
}

function renderClientTabContent(client, tab) {
  const data = getClientViewData(client);
  const m = data.lastMeasure;

  const personalCard = renderInfoCard("Datos personales", [
    ["Nombre completo", client.full_name],
    ["DNI", client.dni],
    ["Numero celular", client.phone],
    ["Correo", client.email],
    ["Direccion", client.address],
    ["Fecha de nacimiento", formatDate(client.birth_date)],
    ["Edad", calculateAge(client.birth_date)],
  ]);

  // Tarjeta visual resumen (última medida)
  const visualCard = renderInfoCard("Última medida visual", [
    ["OD Esfera / Cil / Eje", `${m.od_sphere || m.sphere || "-"} / ${m.od_cylinder || m.cylinder || "-"} / ${m.od_axis || m.axis || "-"}`],
    ["OI Esfera / Cil / Eje", `${m.oi_sphere || "-"} / ${m.oi_cylinder || "-"} / ${m.oi_axis || "-"}`],
    ["D.P. OD / OI", `${m.od_pupillary_dist || m.pupillary_distance || "-"} / ${m.oi_pupillary_dist || "-"}`],
    ["Agudeza Lejos OD/OI", `${m.av_lejos_od || "-"} / ${m.av_lejos_oi || "-"}`],
    ["Agudeza Cerca OD/OI", `${m.av_cerca_od || "-"} / ${m.av_cerca_oi || "-"}`],
    ["Adición", m.addition],
    ["Diagnóstico", m.diagnosis_type],
    ["Observaciones", m.observations],
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

  // Historial visual — cards profesionales
  const measures = `
    <div class="visual-history-timeline">
      ${data.measures.length
        ? data.measures.map((item) => renderVisualMeasureCard(item, client.id)).join("")
        : `<div class="client-empty-state">Sin medidas visuales registradas.</div>`}
    </div>
  `;

  const purchases = `
    <div class="client-timeline">
      ${renderTimelineItems(data.purchases, "Sin compras registradas.", (item) => `
        <article class="client-timeline-item">
          <div>
            <strong>${formatDate(item.purchase_date)} - ${formatMoney(item.price)}</strong>
            <span>${escapeHtml(item.payment_method || "-")}</span>
          </div>
          <p>${escapeHtml(item.product || "-")} ${item.brand ? `<span class="badge-sm">${escapeHtml(item.brand)}</span>` : ""}</p>
        </article>
      `)}
    </div>
  `;

  const salesTab = `
    <div class="client-timeline">
      ${renderTimelineItems(data.sales, "Sin ventas vinculadas registradas.", (item) => `
        <article class="client-timeline-item">
          <div>
            <strong>${formatDate(item.sale_date)} - ${formatMoney(item.amount)}</strong>
            <span>${escapeHtml(item.payment_method || "-")}</span>
          </div>
          <p>${escapeHtml(item.description || "-")}</p>
        </article>
      `)}
    </div>
  `;

  const history = `
    <div class="client-card-grid">
      ${renderInfoCard("Resumen historico", [
        ["Fecha de registro", formatDateTime(client.created_at)],
        ["Ultima medida", m.created_at ? formatDateTime(m.created_at) : "-"],
        ["Ultima compra", formatDate(data.lastPurchase.purchase_date)],
        ["Ultima venta", formatDate(data.lastSale.sale_date)],
      ])}
      ${purchaseCard}
      ${visualCard}
    </div>
  `;

  const tabs = {
    resumen:  summary,
    datos:    `<div class="client-card-grid">${personalCard}${purchaseCard}${visualCard}</div>`,
    medidas:  measures,
    compras:  purchases,
    ventas:   salesTab,
    historial:history,
  };

  return tabs[tab] || summary;
}

function renderClientHistory(clientId, activeTab = "resumen") {
  const client = (window.lastClientResults || []).find((c) => c.id === clientId);
  if (!client || !historyPanel) return;

  const tabs = [
    ["resumen",  "1. Resumen"],
    ["medidas",  "2. Medidas visuales"],
    ["compras",  "3. Compras"],
    ["ventas",   "4. Ventas"],
    ["historial","5. Historial"],
    ["datos",    "6. Datos del cliente"],
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
      Nombre:     c.full_name,
      DNI:        c.dni,
      Celular:    c.phone,
      Correo:     c.email || "",
      Direccion:  c.address || "",
      Nacimiento: c.birth_date || "",
      Registro:   new Date(c.created_at).toLocaleDateString("es-PE"),
    })),
    "clientes",
    "Clientes"
  );
}

// ── Delegación de eventos ─────────────────────────────────────
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
  if (tab) {
    const clientId = historyPanel.dataset.activeClient;
    if (clientId) renderClientHistory(clientId, tab.dataset.clientTab);
    return;
  }

  // Botón receta en timeline
  const recipeBtn = event.target.closest("[data-recipe-client]");
  if (recipeBtn) {
    openRecipe(recipeBtn.dataset.recipeClient, recipeBtn.dataset.recipeMeasure);
  }
});

// Paginación
document.getElementById("prevPage")?.addEventListener("click", () => {
  if (!isSearching && currentPage > 1) { currentPage--; searchClients(); }
});
document.getElementById("nextPage")?.addEventListener("click", () => {
  if (!isSearching && currentPage < totalPages) { currentPage++; searchClients(); }
});

// Event listeners
setupClientInputGuards(clientForm);
setupClientInputGuards(editForm);
clientForm?.addEventListener("submit", saveClient);
searchForm?.addEventListener("submit", searchClients);
editForm?.addEventListener("submit", saveEditClient);
document.querySelector("[data-export-clients]")?.addEventListener("click", exportClients);

// Carga inicial — sin pasar el Event para no resetear currentPage
document.addEventListener("DOMContentLoaded", () => searchClients());
