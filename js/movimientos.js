// ============================================================
// ventas.js - Ventas y gastos
// Optica Lima
// ============================================================

const movementForm = document.querySelector("[data-movement-form]");
const movementBody = document.querySelector("[data-movement-results]");
const movementType = document.body.dataset.module;

window.lastMovementResults = [];

function setMovementError(field, message) {
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

function clearMovementError(field) {
  const label = field.closest("label");
  field.classList.remove("field-invalid");
  field.removeAttribute("aria-invalid");
  label?.querySelector(".field-error")?.remove();
}

function validateMovementForm(form) {
  let isValid = true;
  const isGasto = movementType === "gastos";
  const rules = [
    ["description", "La descripcion es obligatoria."],
    ["amount", "Ingrese un monto mayor a cero.", (value) => Number(value) > 0],
    ["movement_date", "La fecha es obligatoria."],
    ["payment_method", "Seleccione un metodo de pago."],
  ];

  if (isGasto) rules.splice(1, 0, ["category", "La categoria es obligatoria."]);

  rules.forEach(([name, message, validate]) => {
    const field = form.elements[name];
    if (!field) return;

    const value = field.value.trim();
    clearMovementError(field);

    if (!value || (validate && !validate(value))) {
      setMovementError(field, message);
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

function setupMovementValidation(form) {
  if (!form) return;
  form.querySelectorAll("input, select, textarea").forEach((field) => {
    field.addEventListener("input", () => clearMovementError(field));
  });
}

async function saveMovement(event) {
  event.preventDefault();
  const submit = movementForm.querySelector("button[type='submit']");
  const isGasto = movementType === "gastos";
  const label = isGasto ? "gasto" : "venta";

  if (!validateMovementForm(movementForm)) return;

  const result = await confirmAction(`Registrar ${label}`, `Deseas guardar este ${label}?`);
  if (!result.isConfirmed) return;

  setLoading(submit, true);

  const form = new FormData(movementForm);
  const { data: authData } = await db.auth.getUser();

  const payload = {
    user_id: authData.user.id,
    description: form.get("description").trim(),
    amount: Number(form.get("amount") || 0),
    payment_method: form.get("payment_method") || null,
  };

  if (isGasto) {
    payload.category = form.get("category").trim() || "General";
    payload.expense_date = form.get("movement_date") || new Date().toISOString().slice(0, 10);
  } else {
    payload.sale_date = form.get("movement_date") || new Date().toISOString().slice(0, 10);
  }

  const table = isGasto ? "expenses" : "sales";
  const { data: inserted, error } = await db.from(table).insert(payload).select().single();
  setLoading(submit, false);

  if (error) return showToast(error.message, "error");

  await logAudit("insert", table, inserted.id, payload);
  movementForm.reset();
  const dateInput = movementForm.querySelector("input[name='movement_date']");
  if (dateInput) dateInput.value = new Date().toISOString().slice(0, 10);

  showToast(`${isGasto ? "Gasto" : "Venta"} registrada correctamente.`);
  await loadMovements();
}

async function loadMovements() {
  if (!movementBody) return;
  const isGasto = movementType === "gastos";
  const table = isGasto ? "expenses" : "sales";
  const dateField = isGasto ? "expense_date" : "sale_date";
  const selectFields = isGasto
    ? "id,description,amount,payment_method,category,expense_date"
    : "id,description,amount,payment_method,sale_date";

  movementBody.innerHTML = `<tr><td colspan="${isGasto ? 6 : 5}" class="loading-row">Cargando...</td></tr>`;

  const { data, error } = await db
    .from(table)
    .select(selectFields)
    .order(dateField, { ascending: false })
    .limit(100);

  if (error) return showToast(error.message, "error");

  window.lastMovementResults = data || [];

  const total = sumAmounts(data || []);
  const totalNode = document.querySelector("[data-movement-total]");
  if (totalNode) totalNode.textContent = formatMoney(total);

  movementBody.innerHTML =
    (data || [])
      .map((item) => `
        <tr data-movement-id="${item.id}">
          <td>${formatDate(item[dateField])}</td>
          <td>${escapeHtml(item.description)}</td>
          ${isGasto ? `<td><span class="badge-sm">${escapeHtml(item.category || "General")}</span></td>` : ""}
          <td>${escapeHtml(item.payment_method || "-")}</td>
          <td><strong>${formatMoney(item.amount)}</strong></td>
          <td>
            <div class="action-buttons">
              <button class="btn-edit" data-edit-movement="${item.id}" type="button" title="Editar">Editar</button>
              <button class="btn-delete" data-delete-movement="${item.id}" type="button" title="Eliminar">Eliminar</button>
            </div>
          </td>
        </tr>
      `)
      .join("") || `<tr><td colspan="${isGasto ? 6 : 5}" class="empty-row">Aun no hay registros.</td></tr>`;
}

function openEditMovement(movementId) {
  const item = (window.lastMovementResults || []).find((movement) => movement.id === movementId);
  if (!item) return showToast("Registro no encontrado.", "error");

  const isGasto = movementType === "gastos";
  const dateField = isGasto ? "expense_date" : "sale_date";

  document.getElementById("editMovementId").value = item.id;
  document.getElementById("editMovementDescription").value = item.description || "";
  document.getElementById("editMovementAmount").value = item.amount || "";
  document.getElementById("editMovementDate").value = item[dateField] || "";
  document.getElementById("editMovementPayment").value = item.payment_method || "Efectivo";

  if (isGasto) {
    const categoryField = document.getElementById("editMovementCategory");
    if (categoryField) categoryField.value = item.category || "General";
  }

  openModal("editMovementModal");
}

async function saveEditMovement(event) {
  event.preventDefault();
  const editForm = document.getElementById("editMovementForm");
  const submit = editForm.querySelector("button[type='submit']");
  const isGasto = movementType === "gastos";
  const movementId = document.getElementById("editMovementId").value;
  const table = isGasto ? "expenses" : "sales";
  const dateField = isGasto ? "expense_date" : "sale_date";

  const adaptedForm = {
    elements: {
      description: document.getElementById("editMovementDescription"),
      amount: document.getElementById("editMovementAmount"),
      movement_date: document.getElementById("editMovementDate"),
      payment_method: document.getElementById("editMovementPayment"),
      category: document.getElementById("editMovementCategory"),
    },
    querySelector: (...args) => editForm.querySelector(...args),
  };
  if (!validateMovementForm(adaptedForm)) return;

  const result = await confirmAction("Guardar cambios", "Deseas guardar los cambios?");
  if (!result.isConfirmed) return;

  setLoading(submit, true);

  const oldItem = (window.lastMovementResults || []).find((movement) => movement.id === movementId);
  const payload = {
    description: document.getElementById("editMovementDescription").value.trim(),
    amount: Number(document.getElementById("editMovementAmount").value || 0),
    [dateField]: document.getElementById("editMovementDate").value,
    payment_method: document.getElementById("editMovementPayment").value,
  };

  if (isGasto) {
    const categoryField = document.getElementById("editMovementCategory");
    payload.category = categoryField?.value.trim() || "General";
  }

  const { error } = await db.from(table).update(payload).eq("id", movementId);
  setLoading(submit, false);

  if (error) return showToast(error.message, "error");

  await logAudit("update", table, movementId, payload, oldItem);
  showToast("Registro actualizado correctamente.");
  closeModal("editMovementModal");
  await loadMovements();
}

async function deleteMovement(movementId) {
  const isGasto = movementType === "gastos";
  const table = isGasto ? "expenses" : "sales";
  const item = (window.lastMovementResults || []).find((movement) => movement.id === movementId);

  const result = await confirmDelete(`este ${isGasto ? "gasto" : "venta"}`);
  if (!result.isConfirmed) return;

  const { error } = await db.from(table).delete().eq("id", movementId);
  if (error) return showToast(error.message, "error");

  await logAudit("delete", table, movementId, null, item);
  showToast(isGasto ? "Gasto eliminado correctamente." : "Venta eliminada correctamente.");
  await loadMovements();
}

async function exportMovements() {
  const isGasto = movementType === "gastos";
  const table = isGasto ? "expenses" : "sales";
  const dateField = isGasto ? "expense_date" : "sale_date";
  const fields = isGasto
    ? `description,category,amount,payment_method,expense_date`
    : `description,amount,payment_method,sale_date`;
  const { data, error } = await db.from(table).select(fields).order(dateField, { ascending: false });

  if (error) return showToast(error.message, "error");

  const rows = (data || []).map((item) => ({
    Fecha: item[dateField],
    Descripcion: item.description,
    Categoria: item.category || "",
    MetodoPago: item.payment_method || "",
    Monto: item.amount,
  }));

  toExcel(rows, isGasto ? "gastos" : "ventas", isGasto ? "Gastos" : "Ventas");
}

movementBody?.addEventListener("click", (event) => {
  const editBtn = event.target.closest("[data-edit-movement]");
  const deleteBtn = event.target.closest("[data-delete-movement]");

  if (editBtn) openEditMovement(editBtn.dataset.editMovement);
  if (deleteBtn) deleteMovement(deleteBtn.dataset.deleteMovement);
});

setupMovementValidation(movementForm);
setupMovementValidation(document.getElementById("editMovementForm"));
document.getElementById("editMovementForm")?.addEventListener("submit", saveEditMovement);
movementForm?.addEventListener("submit", saveMovement);
document.querySelector("[data-export-movements]")?.addEventListener("click", exportMovements);
document.addEventListener("DOMContentLoaded", loadMovements);
