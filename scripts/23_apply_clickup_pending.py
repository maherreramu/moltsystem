"""
Aplica el buffer clickup_pending.json a las OP-Ds que ahora existen en Supabase.

Diseñado para correr DESPUÉS de 20_load_to_supabase.py cuando el ETL IMPEL
ha cargado nuevas OP-Ds que estaban pendientes de sincronizar.

Uso:
  uv run python scripts/23_apply_clickup_pending.py --dry-run   # ver pendientes a aplicar
  uv run python scripts/23_apply_clickup_pending.py --apply     # aplicar y limpiar buffer

Flags:
  --dry-run   Muestra qué se aplicaría sin escribir (default)
  --apply     Aplica el sync y elimina del buffer las procesadas
"""

import argparse
import json
import sys
from pathlib import Path

ROOT = Path(__file__).parent.parent
sys.path.insert(0, str(ROOT))

from utils.clickup_helpers import (  # noqa: E402
    PENDING_PATH,
    build_phase_plans,
    log,
    sync_opd,
)


def run(dry: bool):
    from utils.supabase_client import get_client

    log("=" * 60, dry)
    log("23_apply_clickup_pending — buffer → Supabase", dry)
    log(f"  dry_run : {dry}", dry)
    log("=" * 60, dry)

    if not PENDING_PATH.exists():
        log("\nNo existe data/state/clickup_pending.json — nada que aplicar.", dry)
        return

    with open(PENDING_PATH, encoding="utf-8") as f:
        pending: dict[str, dict] = json.load(f)

    if not pending:
        log("\nBuffer vacío — nada que aplicar.", dry)
        return

    log(f"\n  OP-Ds en buffer: {len(pending)}", dry)
    log(f"  refs: {sorted(pending.keys())}", dry)

    sb = get_client()
    refs_buffer = list(pending.keys())
    sb_opds = (
        sb.table("op_ds")
        .select("id, op_num, ref, fase_actual")
        .in_("ref", refs_buffer)
        .execute()
        .data
    )
    ref_to_opd = {r["ref"]: r for r in sb_opds}

    aplicables = [ref for ref in refs_buffer if ref in ref_to_opd]
    aun_pendientes = [ref for ref in refs_buffer if ref not in ref_to_opd]

    log(f"\n  Match (a aplicar ahora):             {len(aplicables)}", dry)
    log(f"  Aún sin cargar (quedan en buffer):   {len(aun_pendientes)}", dry)

    if not aplicables:
        log("\nNinguna OP-D del buffer encontrada en Supabase todavía.", dry)
        return

    n_baseline = n_advance = n_novedad = n_plans = n_skipped = 0
    errors: list[str] = []

    for ref in aplicables:
        parsed = pending[ref]
        opd_db = ref_to_opd[ref]
        fase_db = opd_db.get("fase_actual") or "fase_0"
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
            avanza = result.get("fase_avanza", False)
            if not avanza:
                n_skipped += 1
            prefix = "[dry] " if dry else ""
            marker = "→" if avanza else "✗"
            suffix = "  [sin avance — omitido]" if not avanza else ""
            print(
                f"  {prefix}{ref:12s}  {fase_db:10s} {marker} {parsed['fase_actual']:10s}"
                f"  planes={len(planes)}{suffix}",
                flush=True,
            )
        except Exception as e:
            msg = f"ERROR sync {ref}: {e}"
            print(f"  {msg}", flush=True)
            errors.append(msg)

    if not dry:
        log(f"\n  phase_plans upserted:     {n_plans}", dry)
        log(f"  baselines congeladas:     {n_baseline}", dry)
        log(f"  phase_advance events:     {n_advance}", dry)
        log(f"  novedades (daily_check):  {n_novedad}", dry)
        log(f"  fases sin avance (skip):  {n_skipped}", dry)
        if errors:
            log(f"  ERRORES: {len(errors)}", dry)
            for e in errors:
                print(f"    {e}", flush=True)

        # Actualizar buffer: quedan solo los que siguen sin aparecer en Supabase
        error_refs = set()
        for e in errors:
            m_ref = e.split()
            if len(m_ref) > 2:
                error_refs.add(m_ref[2])
        new_pending = {
            ref: pending[ref]
            for ref in (aun_pendientes + list(error_refs))
            if ref in pending
        }
        with open(PENDING_PATH, "w", encoding="utf-8") as f:
            json.dump(new_pending, f, ensure_ascii=False, indent=2)
        aplicados_ok = len(aplicables) - len(error_refs)
        log(f"  Buffer actualizado: {aplicados_ok} eliminados, {len(new_pending)} quedan.", dry)

    log("\n" + "=" * 60, dry)
    if dry:
        log(f"DRY-RUN: {len(aplicables)} a aplicar, {len(aun_pendientes)} aún en espera.", dry)
        log("Correr con --apply para ejecutar.", dry)
    else:
        log(f"Completado. {len(aplicables)} aplicadas, {len(aun_pendientes)} aún en buffer.", dry)
    log("=" * 60, dry)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Aplica clickup_pending.json → Supabase")
    parser.add_argument("--apply", action="store_true",
                        help="Ejecutar escrituras y limpiar buffer (default: dry-run)")
    args = parser.parse_args()
    run(dry=not args.apply)
