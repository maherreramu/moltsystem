"""
scripts/27_load_tiempos_satelites.py — OPDs_sin_tiempos_enriquecido.xlsx → op_ds.dias_satelites

Lee la columna "Tiempo" del informe de OP-Ds sin tiempos, que en todos los
casos representa el tiempo en satélites (días), y actualiza op_ds.dias_satelites.
Luego llama recalc_pull por cada OP-D actualizada para recalcular el phase_plan.

Las OP-Ds del Excel que no existan en Supabase se reportan sin fallo (son OPs
anteriores a la carga inicial o pendientes de ETL IMPEL).

Uso:
  uv run python scripts/27_load_tiempos_satelites.py --dry-run
  uv run python scripts/27_load_tiempos_satelites.py --apply

Flags:
  --dry-run          Muestra el plan sin escribir (default si no se pasa --apply)
  --apply            Ejecuta las actualizaciones en Supabase
  --file PATH        Ruta al Excel (default: el nombre estándar del informe)
  --skip-recalc      No llama recalc_pull tras actualizar
"""

import argparse
import sys
from pathlib import Path

import pandas as pd

ROOT = Path(__file__).parent.parent
sys.path.insert(0, str(ROOT))

DEFAULT_FILE = ROOT / "data" / "OPDs_sin_tiempos_enriquecido.xlsx"
HEADER_ROW = 3  # fila 0-indexada donde está el encabezado en el Excel


def parse_excel(path: Path) -> list[dict]:
    df = pd.read_excel(str(path), header=None)
    # El encabezado real está en la fila 3 (0-indexada)
    header = df.iloc[HEADER_ROW].tolist()
    df2 = df.iloc[HEADER_ROW + 1:].copy()
    df2.columns = header
    df2 = df2[df2["OP-D (Ref)"].notna()].reset_index(drop=True)

    rows = []
    for _, row in df2.iterrows():
        ref = str(row["OP-D (Ref)"]).strip()
        tiempo = row.get("Tiempo")
        if pd.isna(tiempo):
            continue
        try:
            dias = int(float(tiempo))
        except (ValueError, TypeError):
            continue
        if dias <= 0:
            continue
        rows.append({"ref": ref, "dias_satelites": dias})

    return rows


def run(dry: bool, file: Path, skip_recalc: bool):
    from utils.supabase_client import get_client

    tag = "[DRY-RUN] " if dry else ""
    print("=" * 60)
    print(f"{tag}27_load_tiempos_satelites — informe → op_ds.dias_satelites")
    print(f"  archivo     : {file.name}")
    print(f"  dry_run     : {dry}")
    print(f"  skip_recalc : {skip_recalc}")
    print("=" * 60)

    rows = parse_excel(file)
    # Deduplicar por ref (ultima aparición gana)
    deduped: dict[str, dict] = {}
    for r in rows:
        deduped[r["ref"]] = r
    rows = list(deduped.values())
    print(f"\n  Filas con Tiempo en Excel: {len(rows)}")

    sb = get_client()
    all_refs = [r["ref"] for r in rows]
    sb_opds = (
        sb.table("op_ds")
        .select("id, ref, dias_satelites")
        .in_("ref", all_refs)
        .execute()
        .data
    )
    ref_to_opd: dict[str, dict] = {r["ref"]: r for r in sb_opds}
    not_found = sorted(r["ref"] for r in rows if r["ref"] not in ref_to_opd)

    print(f"  Encontradas en Supabase : {len(ref_to_opd)}")
    print(f"  No en Supabase (omitir) : {len(not_found)}")
    if not_found:
        print(f"  Refs omitidas           : {not_found}")

    n_updated = n_identical = n_missing = 0
    n_recalc_ok = n_recalc_err = 0

    print(f"\n  {'ref':14}  {'actual':>6} {'nuevo':>5}  acción")
    print("  " + "-" * 42)

    for row in sorted(rows, key=lambda r: r["ref"]):
        ref = row["ref"]
        if ref not in ref_to_opd:
            n_missing += 1
            continue

        opd = ref_to_opd[ref]
        nuevo = row["dias_satelites"]
        actual = opd["dias_satelites"]

        if nuevo == actual:
            n_identical += 1
            print(f"  {ref:14}  {actual!s:>6} {nuevo!s:>5}  igual")
            continue

        print(f"  {ref:14}  {actual!s:>6} {nuevo!s:>5}  ✓ actualizar")
        n_updated += 1

        if not dry:
            sb.table("op_ds").update({"dias_satelites": nuevo}).eq("id", opd["id"]).execute()
            if not skip_recalc:
                try:
                    sb.rpc("recalc_pull", {"p_opd_id": opd["id"]}).execute()
                    n_recalc_ok += 1
                except Exception as e:
                    print(f"  WARN recalc_pull {ref}: {e}", flush=True)
                    n_recalc_err += 1

    print("\n" + "=" * 60)
    if dry:
        print(f"DRY-RUN: {n_updated} a actualizar, {n_identical} ya iguales, {n_missing} no existen.")
        print("Correr con --apply para ejecutar.")
    else:
        print(f"Completado: {n_updated} actualizadas, {n_identical} ya iguales, {n_missing} no existen.")
        if not skip_recalc:
            print(f"recalc_pull: {n_recalc_ok} OK, {n_recalc_err} errores.")
    print("=" * 60)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="informe OP-Ds → op_ds.dias_satelites")
    parser.add_argument("--apply", action="store_true", help="Ejecutar actualizaciones (default: dry-run)")
    parser.add_argument("--dry-run", action="store_true", help="Mostrar plan sin escribir (default)")
    parser.add_argument("--file", default=str(DEFAULT_FILE), help="Ruta al Excel")
    parser.add_argument("--skip-recalc", action="store_true", help="No llamar recalc_pull")
    args = parser.parse_args()
    run(dry=not args.apply, file=Path(args.file), skip_recalc=args.skip_recalc)
