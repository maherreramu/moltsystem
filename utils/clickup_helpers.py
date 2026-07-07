"""
utils/clickup_helpers.py — Lógica compartida entre 22_clickup_sync y 23_apply_clickup_pending.

Incluye: parseo de custom fields ClickUp, mapeo de fases, cálculo de phase_plans
y la función sync_opd que aplica un registro parseado a Supabase.
"""

import json
import re
from datetime import date, timedelta
from pathlib import Path

ROOT = Path(__file__).parent.parent
STATE_DIR = ROOT / "data" / "state"
PENDING_PATH = STATE_DIR / "clickup_pending.json"

DEFAULT_LIST_ID = "901713964089"  # "Producción Activa"

FASES_ORDEN = ["fase_0", "compras", "trazo", "corte", "tiqueteo", "satelites", "empaque", "despacho"]
FASES_PRODUCCION = {"compras", "trazo", "corte", "tiqueteo", "satelites", "empaque", "despacho"}
F0_FIELDS = ["f0_ficha_tec", "f0_patronaje", "f0_muestra", "f0_aprobacion", "f0_tela_avios", "f0_op_creada"]

STATUS_TO_FASE: dict[str, str] = {
    "fase 0 — sin planear": "fase_0",
    "fase 0 - sin planear": "fase_0",
    "fase 0": "fase_0",
    "sin planear": "fase_0",
    "1 compras": "compras",
    "compras": "compras",
    "2 trazo": "trazo",
    "trazo": "trazo",
    "3 corte": "corte",
    "corte": "corte",
    "4 tiqueteo": "tiqueteo",
    "tiqueteo": "tiqueteo",
    "5 satelites": "satelites",
    "5 satélites": "satelites",
    "satelites": "satelites",
    "satélites": "satelites",
    "6 empaque": "empaque",
    "empaque": "empaque",
    "7 despacho": "despacho",
    "despacho": "despacho",
}

# Nombre de campo ClickUp (lowercased) → columna op_ds
DIAS_CF_MAP: dict[str, str] = {
    "días fase 0":          "dias_fase_0",
    "dias fase 0":          "dias_fase_0",
    "días compras":         "dias_compras",
    "dias compras":         "dias_compras",
    "días trazo":           "dias_trazo",
    "dias trazo":           "dias_trazo",
    "días corte":           "dias_corte",
    "dias corte":           "dias_corte",
    "días tiqueteo":        "dias_tiqueteo",
    "dias tiqueteo":        "dias_tiqueteo",
    "días satélites":       "dias_satelites",
    "días satelites":       "dias_satelites",
    "dias satélites":       "dias_satelites",
    "dias satelites":       "dias_satelites",
    "días calidad + empaque": "dias_empaque",
    "dias calidad + empaque": "dias_empaque",
    "días empaque":         "dias_empaque",
    "dias empaque":         "dias_empaque",
    "días despacho":        "dias_despacho",
    "dias despacho":        "dias_despacho",
}

FASE_TO_DIAS_COL: dict[str, str] = {
    "fase_0":    "dias_fase_0",
    "compras":   "dias_compras",
    "trazo":     "dias_trazo",
    "corte":     "dias_corte",
    "tiqueteo":  "dias_tiqueteo",
    "satelites": "dias_satelites",
    "empaque":   "dias_empaque",
    "despacho":  "dias_despacho",
}

# Detecta la fase de un subtask por su nombre
SUBTASK_FASE_PATTERNS = [
    (r'fase.{0,3}0|sin.{0,3}plan', "fase_0"),
    (r'compra',                    "compras"),
    (r'trazo',                     "trazo"),
    (r'corte',                     "corte"),
    (r'tiqueteo',                  "tiqueteo"),
    (r'sat[eé]lit',                "satelites"),
    (r'empaque|calidad',           "empaque"),
    (r'despacho',                  "despacho"),
]


# ─── Helpers de tipos ClickUp ─────────────────────────────────────────────────

def cf_value(task: dict, name_lower: str):
    for cf in task.get("custom_fields", []):
        if cf.get("name", "").strip().lower() == name_lower:
            return cf.get("value")
    return None


def cf_text(task: dict, name_lower: str) -> str | None:
    v = cf_value(task, name_lower)
    if v is None:
        return None
    s = str(v).strip()
    return s or None


def cf_number(task: dict, name_lower: str) -> int | None:
    v = cf_value(task, name_lower)
    if v is None:
        return None
    try:
        return int(float(str(v)))
    except (ValueError, TypeError):
        return None


def cf_date(task: dict, name_lower: str) -> str | None:
    return epoch_ms_to_date(cf_value(task, name_lower))


def cf_dropdown(task: dict, name_lower: str) -> str | None:
    """Resuelve el orderindex de un dropdown al label de la opción."""
    for cf in task.get("custom_fields", []):
        if cf.get("name", "").strip().lower() != name_lower:
            continue
        order_idx = cf.get("value")
        if order_idx is None:
            return None
        for opt in cf.get("type_config", {}).get("options", []):
            if str(opt.get("orderindex")) == str(order_idx):
                return opt.get("name")
    return None


def epoch_ms_to_date(v) -> str | None:
    if v is None:
        return None
    try:
        return date.fromtimestamp(int(str(v)) // 1000).isoformat()
    except (ValueError, TypeError, OSError):
        return None


def subtract_biz_days(date_str: str, days: int) -> str:
    """Resta días hábiles (lun-vie) sin festivos — aproximación para migración."""
    d = date.fromisoformat(date_str)
    n = max(int(days), 0)
    while n > 0:
        d -= timedelta(days=1)
        if d.weekday() < 5:
            n -= 1
    return d.isoformat()


# ─── Parseo de tarea ClickUp ──────────────────────────────────────────────────

def derive_ref(task: dict) -> str | None:
    """Extrae ref (op_num-seq) del campo 'Referencia / prenda' o del nombre."""
    for cf in task.get("custom_fields", []):
        if "referencia" in cf.get("name", "").lower():
            raw = cf.get("value")
            if raw:
                m = re.match(r'^(\d+)-(\d+)', str(raw).strip())
                if m:
                    return f"{m.group(1)}-{m.group(2)}"
    # Fallback por nombre de la tarea
    name = task.get("name", "")
    m2 = re.match(r'^(\d+)-(\d+)', name.strip())
    if m2:
        return f"{m2.group(1)}-{m2.group(2)}"
    return None


def parse_fase_actual(task: dict) -> str:
    status = task.get("status", {}).get("status", "").strip().lower()
    return STATUS_TO_FASE.get(status, "fase_0")


def detect_subtask_fase(subtask: dict) -> str | None:
    name = subtask.get("name", "").lower()
    name = name.translate(str.maketrans("áéíóú", "aeiou"))
    for pattern, fase in SUBTASK_FASE_PATTERNS:
        if re.search(pattern, name):
            return fase
    return None


def parse_task(task: dict, subtasks: list[dict]) -> dict:
    """Parsea una tarea padre ClickUp a un dict normalizado listo para sync."""
    ref = derive_ref(task)
    fase_actual = parse_fase_actual(task)

    dias: dict[str, int | None] = {}
    for cf_name, col in DIAS_CF_MAP.items():
        v = cf_number(task, cf_name)
        if v is not None:
            dias[col] = v

    plan_dates: dict[str, str | None] = {}
    for st in subtasks:
        fase = detect_subtask_fase(st)
        if fase and st.get("due_date"):
            plan_dates[fase] = epoch_ms_to_date(st["due_date"])

    return {
        "ref": ref,
        "clickup_id": task["id"],
        "clickup_name": task.get("name", ""),
        "fase_actual": fase_actual,
        "detalle": cf_text(task, "detalle"),
        "colores": cf_text(task, "colores"),
        "fecha_promesa_satelites": (
            cf_date(task, "fecha promesa satélites") or cf_date(task, "fecha promesa satelites")
        ),
        "fecha_recepcion_satelites": (
            cf_date(task, "fecha recepción satélites") or cf_date(task, "fecha recepcion satelites")
        ),
        "novedades": cf_text(task, "novedades"),
        **dias,
        "comercial": cf_dropdown(task, "comercial"),
        "fecha_compromiso": cf_date(task, "fecha compromiso cliente"),
        "fecha_compromiso_original": cf_date(task, "fecha compromiso original"),
        "plan_dates": plan_dates,
    }


def build_phase_plans(parsed: dict) -> list[dict]:
    """Construye registros phase_plans a partir de las fechas de ClickUp."""
    plan_dates = parsed.get("plan_dates", {})
    if not plan_dates:
        return []

    rows = []
    prev_due: str | None = None
    for fase in FASES_ORDEN:
        due = plan_dates.get(fase)
        if not due:
            prev_due = due
            continue

        dias_col = FASE_TO_DIAS_COL.get(fase)
        dias = parsed.get(dias_col) if dias_col else None

        if fase == "fase_0":
            start = subtract_biz_days(due, dias) if dias else due
        else:
            start = prev_due or due

        rows.append({
            "fase":       fase,
            "dias":       dias or 0,
            "start_date": start,
            "due_date":   due,
        })
        prev_due = due

    return rows


# ─── Sync de una OP-D contra Supabase ────────────────────────────────────────

def sync_opd(sb, opd_db: dict, parsed: dict, dry: bool) -> dict:
    """Sincroniza una OP-D matcheada. Retorna resumen de operaciones."""
    opd_id = opd_db["id"]
    op_num = opd_db["op_num"]
    fase_nueva = parsed["fase_actual"]
    fase_db = opd_db.get("fase_actual", "fase_0") or "fase_0"
    en_produccion = fase_nueva in FASES_PRODUCCION

    # Solo avanzar la fase si ClickUp está más adelante que el sistema
    idx_nueva = FASES_ORDEN.index(fase_nueva) if fase_nueva in FASES_ORDEN else -1
    idx_db = FASES_ORDEN.index(fase_db) if fase_db in FASES_ORDEN else -1
    fase_avanza = idx_nueva > idx_db

    # ── UPDATE op_ds ──────────────────────────────────────────────────────────
    opd_payload: dict = {}
    if fase_avanza:
        opd_payload["fase_actual"] = fase_nueva
    for field in ("detalle", "colores", "fecha_promesa_satelites", "fecha_recepcion_satelites"):
        if parsed.get(field) is not None:
            opd_payload[field] = parsed[field]
    for col in FASE_TO_DIAS_COL.values():
        if parsed.get(col) is not None:
            opd_payload[col] = parsed[col]
    if fase_avanza and en_produccion:
        for f in F0_FIELDS:
            opd_payload[f] = True

    if not dry:
        sb.table("op_ds").update(opd_payload).eq("id", opd_id).execute()

    # ── UPDATE ops ────────────────────────────────────────────────────────────
    ops_payload: dict = {}
    for field in ("comercial", "fecha_compromiso", "fecha_compromiso_original"):
        if parsed.get(field):
            ops_payload[field] = parsed[field]
    if ops_payload and not dry:
        sb.table("ops").update(ops_payload).eq("op_num", op_num).execute()

    # ── UPSERT phase_plans ────────────────────────────────────────────────────
    plan_rows = build_phase_plans(parsed)
    if plan_rows and not dry:
        payload = [{"opd_id": opd_id, **r} for r in plan_rows]
        sb.table("phase_plans").upsert(payload, on_conflict="opd_id,fase").execute()

    # ── freeze_baseline ───────────────────────────────────────────────────────
    baseline_frozen = False
    if fase_avanza and en_produccion and not dry:
        existing = (
            sb.table("phase_plans_baseline")
            .select("opd_id", count="exact")
            .eq("opd_id", opd_id)
            .execute()
        )
        if not existing.count:
            try:
                sb.rpc("freeze_baseline", {
                    "p_opd_id": opd_id,
                    "p_actor": "clickup_migration",
                }).execute()
                baseline_frozen = True
            except Exception as e:
                print(f"  WARN freeze_baseline {opd_id}: {e}", flush=True)

    # ── phase_advance event (idempotente) ─────────────────────────────────────
    phase_advance_inserted = False
    if fase_avanza and en_produccion and not dry:
        existing_adv = (
            sb.table("phase_events")
            .select("id")
            .eq("opd_id", opd_id)
            .eq("tipo", "phase_advance")
            .filter("payload->>origen", "eq", "clickup_migration")
            .limit(1)
            .execute()
        )
        if not existing_adv.data:
            sb.table("phase_events").insert({
                "opd_id": opd_id,
                "tipo":   "phase_advance",
                "actor":  "clickup_migration",
                "payload": json.dumps({"fase": fase_nueva, "origen": "clickup_migration"}),
            }).execute()
            phase_advance_inserted = True

    # ── daily_check para Novedades ────────────────────────────────────────────
    novedad_inserted = False
    nota = parsed.get("novedades")
    if nota and not dry:
        sb.table("phase_events").insert({
            "opd_id": opd_id,
            "tipo":   "daily_check",
            "actor":  "clickup_migration",
            "payload": json.dumps({"nota": nota, "origen": "clickup_migration"}),
        }).execute()
        novedad_inserted = True

    return {
        "opd_id":               opd_id,
        "fase":                 fase_nueva,
        "fase_db":              fase_db,
        "fase_avanza":          fase_avanza,
        "phase_plans":          len(plan_rows),
        "baseline_frozen":      baseline_frozen,
        "phase_advance_inserted": phase_advance_inserted,
        "novedad_inserted":     novedad_inserted,
    }


def log(msg: str, dry: bool = False):
    print(f"{'[DRY-RUN] ' if dry else ''}{msg}", flush=True)
