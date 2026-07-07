"""
22_sync_componentes.py — Sincroniza las telas (componentes) de cada OP-D
desde el cuadro de compras curado.

Fuente: data/operacion/PRODUCCION.xlsx, hoja COMPRAS (misma que lee la heurística).
  - Solo filas con ES TELA = true (los insumos/avíos quedan fuera).
  - nombre_tela = "REFERENCIA INSUMO COMPRADO"; si está vacío → fallback a "INSUMO".
  - Se mapea a la OP-D por su ref ("{OP}-{SEQ}" desde la columna "OP DETALLE").

Upsert idempotente en op_d_componentes por (opd_id, nombre_tela):
  - Solo INSERTA telas nuevas (ignore_duplicates). NUNCA pisa filas existentes,
    por lo que respeta `es_manual` (curaduría en la app) y `cortado` (estado de corte).
  - No elimina telas que ya no estén en el cuadro (additivo, conservador).

Uso:
  uv run python scripts/22_sync_componentes.py --dry-run   # obligatorio antes de escribir
  uv run python scripts/22_sync_componentes.py             # aplica
"""

import argparse
import sys
from pathlib import Path

import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from utils.supabase_client import get_client

ROOT   = Path(__file__).resolve().parent.parent
DIR_OP = ROOT / "data" / "operacion"

TRUTHY = {"TRUE", "VERDADERO", "SI", "SÍ", "X", "1", "YES", "Y"}


def es_verdadero(v) -> bool:
    if isinstance(v, bool):
        return v
    if pd.isna(v):
        return False
    return str(v).strip().upper() in TRUTHY


def norm_ref(x) -> str:
    """Extrae '{OP}-{SEQ}' de 'OP DETALLE' (ej. '6729-2-PANTALON' → '6729-2')."""
    if pd.isna(x) or str(x).strip() in ("", "nan"):
        return ""
    partes = str(x).strip().split("-")
    if len(partes) >= 2:
        try:
            int(partes[0].strip()); int(partes[1].strip())
            return f"{partes[0].strip()}-{partes[1].strip()}"
        except ValueError:
            pass
    return str(x).strip()


def cargar_telas_por_ref() -> dict[str, list[str]]:
    """Retorna {ref → [nombre_tela, ...]} desde la hoja COMPRAS."""
    comp = pd.read_excel(DIR_OP / "PRODUCCION.xlsx", sheet_name="COMPRAS", skiprows=1)
    comp.columns = comp.columns.str.strip()

    for col in ("OP DETALLE", "ES TELA", "REFERENCIA INSUMO COMPRADO", "INSUMO"):
        if col not in comp.columns:
            raise SystemExit(f"Columna '{col}' no encontrada en hoja COMPRAS. Columnas: {list(comp.columns)}")

    out: dict[str, list[str]] = {}
    for _, row in comp.iterrows():
        if not es_verdadero(row.get("ES TELA")):
            continue
        ref = norm_ref(row.get("OP DETALLE"))
        if not ref:
            continue
        nombre = row.get("REFERENCIA INSUMO COMPRADO")
        if pd.isna(nombre) or str(nombre).strip() in ("", "nan"):
            nombre = row.get("INSUMO")  # fallback
        nombre = str(nombre).strip() if pd.notna(nombre) else ""
        if not nombre:
            continue
        out.setdefault(ref, [])
        if nombre not in out[ref]:
            out[ref].append(nombre)
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true", help="No escribe; solo reporta")
    args = ap.parse_args()

    print("Cargando telas desde PRODUCCION.xlsx (hoja COMPRAS)…")
    telas_por_ref = cargar_telas_por_ref()
    total_refs = len(telas_por_ref)
    total_telas = sum(len(v) for v in telas_por_ref.values())
    print(f"  {total_refs} OP-Ds con telas · {total_telas} telas en total")

    sb = get_client()

    # ref → opd_id (solo activas)
    opds = sb.table("op_ds").select("id,ref").eq("activa", True).execute().data or []
    ref_to_id = {o["ref"]: o["id"] for o in opds if o.get("ref")}

    # Filas a insertar (ignore_duplicates respeta lo existente: es_manual y cortado)
    payload = []
    sin_match = []
    for ref, telas in telas_por_ref.items():
        opd_id = ref_to_id.get(ref)
        if not opd_id:
            sin_match.append(ref)
            continue
        for nombre in telas:
            payload.append({
                "opd_id": opd_id,
                "nombre_tela": nombre,
                "es_manual": False,
            })

    print(f"  {len(payload)} filas candidatas · {len(sin_match)} OP-Ds del cuadro sin match en BD")
    if sin_match[:10]:
        print(f"    (sin match, muestra: {sin_match[:10]})")

    if args.dry_run:
        print("DRY-RUN: no se escribió nada.")
        return

    if payload:
        # on_conflict=(opd_id,nombre_tela) + ignore_duplicates → solo inserta nuevas
        sb.table("op_d_componentes").upsert(
            payload, on_conflict="opd_id,nombre_tela", ignore_duplicates=True
        ).execute()
    print(f"Listo. {len(payload)} filas enviadas (las ya existentes se ignoran).")


if __name__ == "__main__":
    main()
