"""
21_heuristica_fases.py
Heurística operacional: asigna la fase más avanzada confirmada
a cada OP-D activa, cruzando 5 fuentes de datos operacionales.

Fuentes (en data/ de este repo):
  data/input_impel/Todas Orden de Producción Det.xlsx   ← export IMPEL
  data/operacion/PRODUCCION (3).xlsx                    ← planilla operacional
  data/operacion/SEGUMIENTO OPS-2026 (1).xlsx           ← cuadro de corte

Output:
  data/state/fase_map.json   ← {impel_id: {fase, confianza, evidencia}}

Ver data/README.md para instrucciones de qué colocar en cada carpeta.

Uso:
  uv run python scripts/21_heuristica_fases.py
  uv run python scripts/21_heuristica_fases.py --excel
  uv run python scripts/21_heuristica_fases.py --preview-only
"""

import sys, json, argparse
import pandas as pd
import warnings
from pathlib import Path
from datetime import date

warnings.filterwarnings("ignore")

# ─── RUTAS ───────────────────────────────────────────────────────────────────

ROOT     = Path(__file__).parent.parent
DIR_IMP  = ROOT / "data" / "input_impel"
DIR_OP   = ROOT / "data" / "operacion"
OUT_DIR  = ROOT / "data" / "output"
MAP_PATH = ROOT / "data" / "state" / "fase_map.json"

# ─── CONFIGURACIÓN ───────────────────────────────────────────────────────────

ESTADOS_REL = {
    "Pendiente Inicio Producción",
    "En Producción",
    "En Producción - Reproceso",
}

FASES_CU = {
    "fase_0":    "fase 0 — sin planear",
    "compras":   "1 compras",
    "trazo":     "2 trazo",
    "corte":     "3 corte",
    "tiqueteo":  "4 tiqueteo",
    "satelites": "5 satelites",
    "empaque":   "6 empaque",
    "despacho":  "7 despacho",
}

# ─── HELPERS ─────────────────────────────────────────────────────────────────

def norm_clave(x: str) -> str:
    """Extrae '{OP}-{SEQ}' de texto como '6729-2-PANTALON SASTRE'."""
    if pd.isna(x) or str(x).strip() in ("", "nan"):
        return ""
    partes = str(x).strip().split("-")
    if len(partes) >= 2:
        try:
            int(partes[0].strip())
            int(partes[1].strip())
            return f"{partes[0].strip()}-{partes[1].strip()}"
        except ValueError:
            pass
    return str(x).strip()


# ─── CARGA DE FUENTES ────────────────────────────────────────────────────────

def cargar_impel() -> dict[str, dict]:
    """Carga las OP-Ds activas de IMPEL. Retorna {impel_id → {clave, op_det, num_op}}."""
    det = pd.read_excel(DIR_IMP / "Todas Orden de Producción Det.xlsx")
    det.columns = det.columns.str.strip()
    det = det[det["Estado OP"].isin(ESTADOS_REL) & det["Id."].notna() & det["Num-OP"].notna()]
    result = {}
    for _, row in det.iterrows():
        impel_id = str(int(row["Id."]))
        clave    = norm_clave(row.get("OP Det", ""))
        result[impel_id] = {
            "clave":  clave,
            "op_det": str(row.get("OP Det", "")),
            "num_op": str(int(row["Num-OP"])),
        }
    return result


def cargar_satelites() -> dict[str, str]:
    """Retorna {clave → estado}: 'ENTREGADO' | 'PENDIENTE'."""
    sat = pd.read_excel(DIR_OP / "PRODUCCION.xlsx", sheet_name="SATELITES")
    sat["clave"] = sat["#OP DETALLE"].apply(norm_clave)
    sat = sat[sat["clave"] != ""]

    col_pend = "CANTIDAD PENDIENTE SATELITE"

    def agg_estado(grp: pd.DataFrame) -> str:
        activas = grp[grp["ESTADO"].isin({"ENTREGADO", "PENDIENTE"})]
        if activas.empty:
            return "CERRADO"
        if col_pend in activas.columns:
            pendientes = pd.to_numeric(activas[col_pend], errors="coerce").fillna(0)
            if pendientes.sum() == 0:
                return "ENTREGADO"
            else:
                return "PENDIENTE"
        return ("ENTREGADO" if (activas["ESTADO"] == "ENTREGADO").all()
                else "PENDIENTE")

    resultado = (
        sat.groupby("clave")
           .apply(agg_estado)
           .rename("estado")
           .reset_index()
    )
    return dict(zip(resultado["clave"], resultado["estado"]))


def cargar_marcaciones() -> set[str]:
    """Retorna set de claves que tienen alguna OS de marcación activa."""
    marc = pd.read_excel(DIR_OP / "PRODUCCION.xlsx", sheet_name="MARCACIONES")
    marc["clave"] = marc["#OP DETALLE"].apply(norm_clave)
    marc = marc[marc["ESTADO"].isin({"ENTREGADO", "PENDIENTE", "CERRADO"})]
    return set(marc[marc["clave"] != ""]["clave"])


def cargar_corte() -> dict[str, dict]:
    """Retorna {clave → {cortado_total, cortado_parc, fecha_corte, en_sheet}}."""
    corte = pd.read_excel(DIR_OP / "PRODUCCION.xlsx", sheet_name="CORTE")
    corte["clave"] = corte["OP DETALLE"].apply(norm_clave)
    corte = corte[corte["clave"] != ""]

    grp = corte.groupby("clave").agg(
        cortado_total = ("CORTADO",     lambda x: "CORTADO" in x.values),
        cortado_parc  = ("CORTADO",     lambda x: "PARCIAL" in x.values and "CORTADO" not in x.values),
        fecha_corte   = ("FECHA CORTE", lambda x: x.notna().any()),
        en_sheet      = ("OP DETALLE",  lambda x: True),
    ).reset_index()
    return {r["clave"]: r.to_dict() for _, r in grp.iterrows()}


def cargar_cuadro_corte() -> dict[str, dict]:
    """Retorna {clave → {estado, trazado}}."""
    ops = pd.read_excel(DIR_OP / "SEGUMIENTO OPS-2026.xlsx", sheet_name="# OPS")
    ops.columns = ops.columns.str.strip()
    ops["clave"] = ops["#OP DETALLE"].apply(norm_clave)
    ops = ops[ops["clave"] != ""]
    result = {}
    for _, row in ops.iterrows():
        clave = row["clave"]
        trazado_val = str(row.get("TRAZADO", "")).strip()
        cortado_val = row.get("CORTADO", None)
        result[clave] = {
            "estado":      str(row.get("ESTADO", "")).strip(),
            "trazado":     trazado_val in ("✔", "SI", "S", "1", "True", "X"),
            "cortado":     str(cortado_val).strip().upper() if pd.notna(cortado_val) else "",
            "cant_cortada": row.get("CANTIDAD CORTADA", None),
        }
    return result


def cargar_compras() -> dict[str, str]:
    """Retorna {clave → 'DISPONIBLE' | 'PARCIAL' | 'FALTA'}."""
    comp = pd.read_excel(DIR_OP / "PRODUCCION.xlsx", sheet_name="COMPRAS", skiprows=1)
    comp.columns = comp.columns.str.strip()
    comp["clave"] = comp["OP DETALLE"].apply(norm_clave)
    comp = comp[comp["clave"] != ""]

    def agg_estado(x):
        estados     = x.str.strip().str.upper().str.replace(r"\s+", " ", regex=True)
        disponibles = (estados == "DISPONIBLE").sum()
        falta       = (estados == "FALTA").sum()
        solicitado  = (estados == "SOLICITADO").sum()
        anulado     = (estados == "ANULADO").sum()
        validos     = len(x) - anulado
        if validos == 0:
            return "FALTA"
        if falta == 0 and solicitado == 0 and disponibles > 0:
            return "DISPONIBLE"
        if disponibles > 0:
            return "PARCIAL"
        return "FALTA"

    grp = comp.groupby("clave")["ESTADO"].agg(agg_estado)
    return grp.to_dict()


# ─── HEURÍSTICA ──────────────────────────────────────────────────────────────

def asignar_fase(
    clave: str,
    sat_map:   dict,
    marc_set:  set,
    corte_map: dict,
    cuadro:    dict,
    comp_map:  dict,
) -> dict:
    """Aplica la escalera de fases. Retorna {fase, confianza, evidencia}."""
    evidencia = []
    fase      = FASES_CU["fase_0"]
    conf      = "baja"

    sat_est = sat_map.get(clave)
    if sat_est == "ENTREGADO":
        return {"fase": FASES_CU["empaque"], "confianza": "alta", "evidencia": "sat=ENTREGADO"}

    if sat_est == "PENDIENTE":
        return {"fase": FASES_CU["satelites"], "confianza": "alta", "evidencia": "sat=PENDIENTE"}

    if clave in marc_set:
        return {"fase": FASES_CU["satelites"], "confianza": "media", "evidencia": "marc=activa"}

    corte_info  = corte_map.get(clave, {})
    cuadro_info = cuadro.get(clave, {})

    if corte_info.get("cortado_total"):
        conf = "alta" if corte_info.get("fecha_corte") else "media"
        return {"fase": FASES_CU["tiqueteo"], "confianza": conf,
                "evidencia": "corte=CORTADO" + (" fecha_ok" if corte_info.get("fecha_corte") else "")}

    if corte_info.get("cortado_parc"):
        return {"fase": FASES_CU["corte"], "confianza": "media", "evidencia": "corte=PARCIAL"}

    if cuadro_info.get("cant_cortada") and not pd.isna(cuadro_info.get("cant_cortada", float("nan"))):
        return {"fase": FASES_CU["corte"], "confianza": "media",
                "evidencia": f"cuadro=cortado({cuadro_info['cant_cortada']})"}

    if cuadro_info.get("trazado"):
        return {"fase": FASES_CU["trazo"], "confianza": "media", "evidencia": "cuadro=TRAZADO✔"}

    comp_est = comp_map.get(clave, "FALTA")
    if comp_est == "DISPONIBLE":
        conf = "media" if corte_info.get("en_sheet") else "baja"
        ev   = "comp=DISPONIBLE+en_corte_sheet" if corte_info.get("en_sheet") else "comp=DISPONIBLE"
        return {"fase": FASES_CU["trazo"], "confianza": conf, "evidencia": ev}

    if comp_est == "PARCIAL":
        return {"fase": FASES_CU["compras"], "confianza": "baja", "evidencia": "comp=PARCIAL"}

    return {"fase": fase, "confianza": conf, "evidencia": "sin_evidencia"}


# ─── MAIN ─────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="Heurística de asignación de fases")
    parser.add_argument("--excel",        action="store_true",
                        help="Exportar detalle a data/output/heuristica_fases.xlsx")
    parser.add_argument("--preview-only", action="store_true",
                        help="Solo mostrar resultado, no guardar data/state/fase_map.json")
    args = parser.parse_args()

    print("=" * 65)
    print("MOLT SAS · Heurística de Fases")
    print("=" * 65)

    print("\nCargando fuentes operacionales...")
    impel = cargar_impel()
    print(f"  IMPEL activas:     {len(impel)} OP-Ds")

    print("  Satélites...",   end=" "); sat_map   = cargar_satelites();   print(f"{len(sat_map)} registros")
    print("  Marcaciones...", end=" "); marc_set  = cargar_marcaciones(); print(f"{len(marc_set)} registros")
    print("  Corte...",       end=" "); corte_map = cargar_corte();       print(f"{len(corte_map)} registros")
    print("  Cuadro corte...",end=" "); cuadro    = cargar_cuadro_corte();print(f"{len(cuadro)} registros")
    print("  Compras...",     end=" "); comp_map  = cargar_compras();     print(f"{len(comp_map)} registros")

    print("\nAplicando heurística...")
    fase_map    = {}
    rows_export = []
    from collections import Counter
    dist_fase = Counter()
    dist_conf = Counter()

    for impel_id, datos in impel.items():
        clave     = datos["clave"]
        resultado = asignar_fase(clave, sat_map, marc_set, corte_map, cuadro, comp_map)
        fase_map[impel_id] = {**resultado, "clave": clave, "op_det": datos["op_det"], "num_op": datos["num_op"]}
        dist_fase[resultado["fase"]] += 1
        dist_conf[resultado["confianza"]] += 1
        rows_export.append({
            "IMPEL ID": impel_id, "OP #": datos["num_op"], "OP Det": datos["op_det"],
            "Clave": clave, "Fase asignada": resultado["fase"],
            "Confianza": resultado["confianza"], "Evidencia": resultado["evidencia"],
        })

    ORDEN_FASES = [FASES_CU[k] for k in ["fase_0","compras","trazo","corte","tiqueteo","satelites","empaque","despacho"]]
    total = len(fase_map)
    print(f"\n{'='*65}\nDISTRIBUCIÓN DE FASES ASIGNADAS\n{'='*65}")
    for fase in ORDEN_FASES:
        n = dist_fase.get(fase, 0)
        print(f"  {fase:<28}  {n:>4}  {100*n/total:>5.1f}%")
    print(f"\n  Total: {total}")
    print("\nConfianza:")
    for conf in ("alta", "media", "baja"):
        n = dist_conf.get(conf, 0)
        print(f"  {conf:<8} {n:>4}  ({100*n/total:.0f}%)")

    avanzadas = sum(n for f, n in dist_fase.items() if f != FASES_CU["fase_0"])
    print(f"\n  OP-Ds más allá de Fase 0: {avanzadas} ({100*avanzadas/total:.0f}%)")

    if not args.preview_only:
        MAP_PATH.parent.mkdir(parents=True, exist_ok=True)
        MAP_PATH.write_text(json.dumps(fase_map, indent=2, ensure_ascii=False, default=str), encoding="utf-8")
        print(f"\nGuardado en: {MAP_PATH}")
    else:
        print("\n[preview-only] fase_map.json NO guardado")

    if args.excel:
        OUT_DIR.mkdir(parents=True, exist_ok=True)
        df = pd.DataFrame(rows_export)
        df["_orden"] = df["Fase asignada"].apply(lambda f: ORDEN_FASES.index(f) if f in ORDEN_FASES else 99)
        df["_op"]    = pd.to_numeric(df["OP #"], errors="coerce").fillna(0).astype(int)
        df = df.sort_values(["_orden", "_op"]).drop(columns=["_orden", "_op"])
        path = OUT_DIR / "heuristica_fases.xlsx"
        with pd.ExcelWriter(path, engine="openpyxl") as writer:
            df.to_excel(writer, sheet_name="Detalle", index=False)
            resumen = pd.DataFrame([{"Fase": f, "N": dist_fase.get(f, 0)} for f in ORDEN_FASES])
            resumen.to_excel(writer, sheet_name="Resumen", index=False)
        print(f"Exportado a: {path}")


if __name__ == "__main__":
    main()
