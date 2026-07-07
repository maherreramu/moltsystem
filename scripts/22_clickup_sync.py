"""
ClickUp → Supabase sync

Extrae el estado real de producción de la lista "Producción Activa" en ClickUp
y lo sincroniza con las OP-Ds existentes en Supabase.

Las OP-Ds que no existen aún en Supabase se guardan en:
  data/state/clickup_pending.json
para aplicarlas después con 23_apply_clickup_pending.py (tras ETL IMPEL).

Uso:
  uv run python scripts/22_clickup_sync.py --dry-run   # reporte sin escritura (default)
  uv run python scripts/22_clickup_sync.py --apply     # ejecutar sincronización

Flags:
  --dry-run   Muestra el plan sin escribir nada (default si no se pasa --apply)
  --apply     Ejecuta las escrituras en Supabase
  --list-id   ID de lista ClickUp (default: 901713964089 = "Producción Activa")
"""

import argparse
import json
import sys
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).parent.parent
sys.path.insert(0, str(ROOT))

from utils.clickup_helpers import (  # noqa: E402
    DEFAULT_LIST_ID,
    FASES_ORDEN,
    PENDING_PATH,
    STATE_DIR,
    build_phase_plans,
    log,
    parse_task,
    sync_opd,
)


def run(dry: bool, list_id: str):
    from utils.clickup_client import ClickUpClient
    from utils.supabase_client import get_client

    log("=" * 60, dry)
    log("22_clickup_sync -- ClickUp -> Supabase", dry)
    log(f"  list_id : {list_id}", dry)
    log(f"  dry_run : {dry}", dry)
    log("=" * 60, dry)

    # ── 1. Fetch ClickUp ──────────────────────────────────────────────────────
    log("\n[1/5] Extrayendo tareas de ClickUp…", dry)
    cu = ClickUpClient()
    all_tasks = cu.get_list_tasks(list_id)
    log(f"  Total tareas (padres + subtareas): {len(all_tasks)}", dry)

    parent_tasks = [t for t in all_tasks if not t.get("parent")]
    subtask_list = [t for t in all_tasks if t.get("parent")]

    subtasks_by_parent: dict[str, list[dict]] = {}
    for st in subtask_list:
        subtasks_by_parent.setdefault(st["parent"], []).append(st)

    log(f"  Tareas padre (OP-Ds): {len(parent_tasks)}", dry)
    log(f"  Subtareas fase-plan:  {len(subtask_list)}", dry)

    # ── 2. Parsear cada OP-D ──────────────────────────────────────────────────
    log("\n[2/5] Parseando OP-Ds…", dry)
    parsed_list: list[dict] = []
    skipped = 0
    for t in parent_tasks:
        p = parse_task(t, subtasks_by_parent.get(t["id"], []))
        if not p["ref"]:
            skipped += 1
            continue
        parsed_list.append(p)
    log(f"  Parseadas: {len(parsed_list)}  /  sin ref (omitidas): {skipped}", dry)

    # ── 3. Cross-reference con Supabase ──────────────────────────────────────
    log("\n[3/5] Cruzando con Supabase…", dry)
    sb = get_client()
    sb_opds = sb.table("op_ds").select("id, op_num, ref, fase_actual").execute().data
    ref_to_opd: dict[str, dict] = {r["ref"]: r for r in sb_opds}
    log(f"  OP-Ds en Supabase: {len(sb_opds)}", dry)

    matched = [p for p in parsed_list if p["ref"] in ref_to_opd]
    pending = [p for p in parsed_list if p["ref"] not in ref_to_opd]
    log(f"  Match (a sincronizar):   {len(matched)}", dry)
    log(f"  No-match (a bufferizar): {len(pending)}", dry)

    fase_dist = Counter(p["fase_actual"] for p in matched)
    log("  Fases en ClickUp (matched):", dry)
    for fase in FASES_ORDEN:
        if fase_dist.get(fase):
            log(f"    {fase:12s}: {fase_dist[fase]}", dry)

    # ── 4. Sincronizar matched ────────────────────────────────────────────────
    log("\n[4/5] Sincronizando OP-Ds matcheadas…", dry)
    n_baseline = n_advance = n_novedad = n_plans = n_skipped = 0
    errors: list[str] = []

    for parsed in matched:
        ref = parsed["ref"]
        opd_db = ref_to_opd[ref]
        fase_prev = opd_db["fase_actual"] or "fase_0"
        planes = build_phase_plans(parsed)
        try:
            result = sync_opd(sb, opd_db, parsed, dry)
            n_plans += result.get("phase_plans", 0)
            if result.get("baseline_frozen"):
                n_baseline += 1
            if result.get("phase_advance_inserted"):
                n_advance += 1
            if result.get("novedad_inserted"):
                n_novedad += 1
            if not result.get("fase_avanza"):
                n_skipped += 1
            if dry:
                avanza = result.get("fase_avanza", False)
                marker = "→" if avanza else "✗"
                log(
                    f"  {ref:12s}  {fase_prev:10s} {marker} {parsed['fase_actual']:10s}"
                    f"  planes={len(planes)}"
                    f"  novedades={'sí' if parsed.get('novedades') else 'no'}"
                    + ("  [sin avance — omitido]" if not avanza else ""),
                    dry,
                )
        except Exception as e:
            msg = f"ERROR sync {ref}: {e}"
            print(f"  {msg}", flush=True)
            errors.append(msg)

    if not dry:
        log(f"  phase_plans upserted:     {n_plans}", dry)
        log(f"  baselines congeladas:     {n_baseline}", dry)
        log(f"  phase_advance events:     {n_advance}", dry)
        log(f"  novedades (daily_check):  {n_novedad}", dry)
        log(f"  fases sin avance (skip):  {n_skipped}", dry)
        if errors:
            log(f"  ERRORES: {len(errors)}", dry)
            for e in errors:
                print(f"    {e}", flush=True)

    # ── 5. Buffer pending ─────────────────────────────────────────────────────
    log("\n[5/5] Actualizando buffer clickup_pending.json…", dry)

    existing_pending: dict[str, dict] = {}
    if PENDING_PATH.exists():
        with open(PENDING_PATH, encoding="utf-8") as f:
            existing_pending = json.load(f)

    for p in pending:
        existing_pending[p["ref"]] = p

    # Limpiar del buffer los que ahora sí existen (por si se corrió en ciclos previos)
    for ref in list(existing_pending.keys()):
        if ref in ref_to_opd:
            del existing_pending[ref]

    log(f"  Pendientes en buffer: {len(existing_pending)}", dry)
    if pending:
        log(f"  Nuevos al buffer: {sorted(p['ref'] for p in pending)}", dry)

    if not dry:
        STATE_DIR.mkdir(parents=True, exist_ok=True)
        with open(PENDING_PATH, "w", encoding="utf-8") as f:
            json.dump(existing_pending, f, ensure_ascii=False, indent=2)
        log(f"  Guardado en {PENDING_PATH}", dry)
    else:
        log("  [dry-run] buffer NO modificado", dry)

    # ── Resumen ───────────────────────────────────────────────────────────────
    log("\n" + "=" * 60, dry)
    if dry:
        log(f"DRY-RUN completado. {len(matched)} a sincronizar, {len(pending)} a bufferizar.", dry)
        log("Correr con --apply para ejecutar.", dry)
    else:
        log(f"Sync completado. {len(matched)} sincronizadas, {len(pending)} en buffer.", dry)
        if errors:
            log(f"  {len(errors)} errores — revisar arriba.", dry)
    log("=" * 60, dry)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="ClickUp → Supabase sync")
    parser.add_argument("--apply", action="store_true",
                        help="Ejecutar escrituras en Supabase (default: dry-run)")
    parser.add_argument("--dry-run", action="store_true",
                        help="Mostrar plan sin escribir (default si no se pasa --apply)")
    parser.add_argument("--list-id", default=DEFAULT_LIST_ID,
                        help=f"ID de lista ClickUp (default: {DEFAULT_LIST_ID})")
    args = parser.parse_args()
    run(dry=not args.apply, list_id=args.list_id)
