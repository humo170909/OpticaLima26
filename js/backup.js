// ============================================================
// backup.js — Backup mensual automático en Excel
// Óptica Lima
// Archivos: clientes · ventas · gastos · medidas (con nombre) · compras por cliente
// ============================================================

const BACKUP_KEY           = "ol_last_backup";
const BACKUP_INTERVAL_DAYS = 30;

function _getLastBackupDate() {
  try {
    const raw = localStorage.getItem(BACKUP_KEY);
    return raw ? new Date(raw) : null;
  } catch (_) { return null; }
}

function _saveBackupDate() {
  try { localStorage.setItem(BACKUP_KEY, new Date().toISOString()); } catch (_) {}
}

function _daysSinceBackup() {
  const last = _getLastBackupDate();
  if (!last) return Infinity;
  return Math.floor((Date.now() - last.getTime()) / (1000 * 60 * 60 * 24));
}

function _formatLastBackup() {
  const last = _getLastBackupDate();
  if (!last) return "Nunca";
  return last.toLocaleDateString("es-PE", {
    year: "numeric", month: "long", day: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

function _updateBackupBadge() {
  const el = document.querySelector("[data-backup-status]");
  if (!el) return;
  const days = _daysSinceBackup();

  if (!isFinite(days)) {
    el.textContent = "Nunca se ha realizado un backup — se recomienda descargar uno ahora";
    el.className = "backup-status danger";
  } else if (days >= BACKUP_INTERVAL_DAYS) {
    el.textContent = `Último backup: ${_formatLastBackup()} — Han pasado ${days} días`;
    el.className = "backup-status warning";
  } else {
    const remaining = BACKUP_INTERVAL_DAYS - days;
    el.textContent = `Último backup: ${_formatLastBackup()} — Próximo en ${remaining} día${remaining === 1 ? "" : "s"}`;
    el.className = "backup-status ok";
  }
}

async function runFullBackup() {
  const month = new Date().toISOString().slice(0, 7); // YYYY-MM
  showToast("Preparando backup completo…", "success");

  // ── 5 consultas en paralelo ──────────────────────────────
  const [clientesRes, ventasRes, gastosRes, medidasRes, comprasRes] = await Promise.all([

    // 1. Clientes
    db.from("clients")
      .select("full_name, dni, phone, email, address, birth_date, created_at")
      .order("created_at", { ascending: false }),

    // 2. Ventas generales
    db.from("sales")
      .select("description, amount, payment_method, sale_date, clients(full_name, dni)")
      .order("sale_date", { ascending: false }),

    // 3. Gastos
    db.from("expenses")
      .select("description, category, amount, payment_method, expense_date")
      .order("expense_date", { ascending: false }),

    // 4. Medidas visuales — con nombre del cliente
    db.from("visual_measures")
      .select([
        "clients(full_name, dni)",
        "diagnosis_type",
        "od_sphere, od_cylinder, od_axis, od_pupillary_dist",
        "oi_sphere, oi_cylinder, oi_axis, oi_pupillary_dist",
        "av_lejos_od, av_lejos_oi, av_cerca_od, av_cerca_oi",
        "addition, observations, created_at",
      ].join(", "))
      .order("created_at", { ascending: false }),

    // 5. Compras por cliente — lo que se vendió a cada paciente
    db.from("purchases")
      .select("clients(full_name, dni), product, brand, price, purchase_date, payment_method")
      .order("purchase_date", { ascending: false }),
  ]);

  const firstError = [
    clientesRes.error, ventasRes.error, gastosRes.error,
    medidasRes.error, comprasRes.error,
  ].find(Boolean);

  if (firstError) {
    showToast("Error al preparar el backup: " + firstError.message, "error");
    return;
  }

  // ── Definición de archivos a descargar ───────────────────
  const files = [

    // ① Clientes
    {
      data:     clientesRes.data || [],
      filename: `backup-clientes-${month}`,
      sheet:    "Clientes",
      map: (c) => ({
        Nombre:             c.full_name,
        DNI:                c.dni,
        Celular:            c.phone          || "",
        Correo:             c.email          || "",
        Direccion:          c.address        || "",
        "Fecha Nacimiento": c.birth_date     || "",
        "Fecha Registro":   c.created_at
          ? new Date(c.created_at).toLocaleDateString("es-PE")
          : "",
      }),
    },

    // ② Ventas generales (con nombre de cliente si aplica)
    {
      data:     ventasRes.data || [],
      filename: `backup-ventas-${month}`,
      sheet:    "Ventas",
      map: (v) => ({
        Fecha:         v.sale_date,
        Cliente:       v.clients?.full_name || "Venta directa",
        DNI:           v.clients?.dni       || "",
        Descripcion:   v.description,
        "Metodo Pago": v.payment_method     || "",
        "Monto (S/)":  v.amount,
      }),
    },

    // ③ Gastos
    {
      data:     gastosRes.data || [],
      filename: `backup-gastos-${month}`,
      sheet:    "Gastos",
      map: (g) => ({
        Fecha:         g.expense_date,
        Descripcion:   g.description,
        Categoria:     g.category           || "",
        "Metodo Pago": g.payment_method     || "",
        "Monto (S/)":  g.amount,
      }),
    },

    // ④ Medidas visuales — con nombre del paciente
    {
      data:     medidasRes.data || [],
      filename: `backup-medidas-${month}`,
      sheet:    "Medidas Visuales",
      map: (m) => ({
        Paciente:       m.clients?.full_name || "(sin nombre)",
        DNI:            m.clients?.dni       || "",
        Diagnostico:    m.diagnosis_type     || "",
        // Ojo Derecho
        "OD Esfera":    m.od_sphere          || "",
        "OD Cilindro":  m.od_cylinder        || "",
        "OD Eje":       m.od_axis            || "",
        "OD DP":        m.od_pupillary_dist  || "",
        // Ojo Izquierdo
        "OI Esfera":    m.oi_sphere          || "",
        "OI Cilindro":  m.oi_cylinder        || "",
        "OI Eje":       m.oi_axis            || "",
        "OI DP":        m.oi_pupillary_dist  || "",
        // Agudeza visual
        "AV Lejos OD":  m.av_lejos_od        || "",
        "AV Lejos OI":  m.av_lejos_oi        || "",
        "AV Cerca OD":  m.av_cerca_od        || "",
        "AV Cerca OI":  m.av_cerca_oi        || "",
        // Clínica
        Adicion:        m.addition           || "",
        Observaciones:  m.observations       || "",
        Fecha:          m.created_at
          ? new Date(m.created_at).toLocaleDateString("es-PE")
          : "",
      }),
    },

    // ⑤ Compras por cliente — lo que se vendió a cada paciente
    {
      data:     comprasRes.data || [],
      filename: `backup-compras-clientes-${month}`,
      sheet:    "Compras por Cliente",
      map: (c) => ({
        Cliente:        c.clients?.full_name || "(sin nombre)",
        DNI:            c.clients?.dni       || "",
        Producto:       c.product            || "",
        Marca:          c.brand              || "",
        "Precio (S/)":  c.price,
        "Fecha Compra": c.purchase_date      || "",
        "Metodo Pago":  c.payment_method     || "",
      }),
    },
  ];

  // ── Descargar archivos con pausa entre cada uno ──────────
  let downloaded = 0;
  for (const f of files) {
    if (!f.data.length) continue;
    if (downloaded > 0) await new Promise((r) => setTimeout(r, 500));
    toExcel(f.data.map(f.map), f.filename, f.sheet);
    downloaded++;
  }

  _saveBackupDate();
  _updateBackupBadge();
  showToast(
    downloaded
      ? `Backup completado: ${downloaded} archivo${downloaded === 1 ? "" : "s"} descargado${downloaded === 1 ? "" : "s"}.`
      : "No hay datos para respaldar aún."
  );
}

async function checkAutoBackup() {
  const days = _daysSinceBackup();
  if (isFinite(days) && days < BACKUP_INTERVAL_DAYS) return;

  const isFirst = !isFinite(days);

  if (!window.Swal) {
    const ok = window.confirm(
      isFirst
        ? "¿Deseas descargar el primer backup completo del sistema?"
        : `Han pasado ${days} días desde el último backup. ¿Descargar ahora?`
    );
    if (ok) await runFullBackup();
    return;
  }

  const result = await Swal.fire({
    title:    isFirst ? "Primer backup" : "Backup mensual",
    html:     isFirst
      ? "No se ha realizado ningún backup del sistema.<br>Se recomienda descargar un respaldo completo ahora."
      : `Han pasado <strong>${days} días</strong> desde el último backup mensual.<br>Mantén un respaldo actualizado de todos los datos.`,
    icon:     "info",
    showCancelButton: true,
    confirmButtonColor: _primaryColor(),
    cancelButtonColor:  "#6b7280",
    confirmButtonText:  "Descargar backup",
    cancelButtonText:   "Ahora no",
    reverseButtons: true,
  });

  if (result.isConfirmed) await runFullBackup();
}

document.querySelector("[data-backup-now]")?.addEventListener("click", runFullBackup);

document.addEventListener("DOMContentLoaded", () => {
  _updateBackupBadge();
  setTimeout(checkAutoBackup, 2000);
});
