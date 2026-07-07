"""
ETL IMPEL → Supabase — dos modos de operación:

  MODO INCREMENTAL (default, uso semanal):
    Inserta solo las OPs y OP-Ds que NO existen en Supabase.
    Las existentes no se tocan — el equipo gestiona su avance en el front.
    Las nuevas entran en fase_0; los triggers DB asignan dias_* y freeze_baseline
    se activa cuando el equipo cierra F0 manualmente.

  MODO INICIAL (solo tras truncate de carga limpia):
    Upsert completo de todas las OPs/OP-Ds activas de IMPEL.
    Requiere data/state/fase_map.json generado por 21_heuristica_fases.py.

Fuentes (en data/ dentro de este mismo repo):
  data/input_impel/Todas OP.xlsx
  data/input_impel/Todas Orden de Producción Det.xlsx
  data/state/fase_map.json   (solo necesario en --modo inicial)

Ver data/README.md para instrucciones completas.

Uso:
  uv run python scripts/20_load_to_supabase.py --dry-run          # incremental dry-run
  uv run python scripts/20_load_to_supabase.py                     # incremental real
  uv run python scripts/20_load_to_supabase.py --modo inicial      # carga limpia inicial

Flags:
  --dry-run           Muestra plan sin escribir a Supabase
  --modo {inicial,incremental}  (default: incremental)
  --data PATH         Ruta a la carpeta data/ (default: ./data)
  --solo-op OP        Solo procesar una OP (ej. --solo-op 6729)
"""

import argparse
import json
import sys
from datetime import date
from pathlib import Path

import pandas as pd

# ─── Paths ────────────────────────────────────────────────────────────────────
ROOT      = Path(__file__).parent.parent
DATA_DIR  = ROOT / "data"                        # default: ./data
INPUT_DIR = DATA_DIR / "input_impel"             # Excels de IMPEL
STATE_DIR = DATA_DIR / "state"                   # fase_map.json y otros

# ─── Mapeo fases antiguas → enum iter-1 ──────────────────────────────────────
FASE_ENUM = {
    "fase 0 — sin planear": "fase_0",
    "1 compras":            "compras",
    "2 trazo":              "trazo",
    "3 corte":              "corte",
    "4 tiqueteo":           "tiqueteo",
    "5 satelites":          "satelites",
    "6 empaque":            "empaque",
    "7 despacho":           "despacho",
}

FASES_PRODUCCION = {
    "compras", "trazo", "corte", "tiqueteo", "satelites", "empaque", "despacho"
}

VENDEDOR_MAP = {
    "MIGUEL": "Miguel", "MIGUEL GUTIERREZ": "Miguel", "MIGUEL GUTIÉRREZ": "Miguel",
    "SANTIAGO": "Santiago", "SANTIAGO BARRIGA": "Santiago",
    "CAMILA": "Camila", "CAMILA MONTOYA": "Camila",
    "CRISTIAN": "Cristian", "CRISTIAN ESGUERRA": "Cristian",
    "MATEO": "Mateo", "MATEO HERRERA": "Mateo",
}

ESTADOS_ACTIVOS = {
    "Pendiente Inicio Producción",
    "En Producción",
    "En Producción - Reproceso",
}

IMPEL_LINK_TPL = "https://www.impeltechnology.com/prod1/m/main.jsp?pageId=14150894&id={}"

# Solo se cargan OPs creadas a partir de esta fecha (inclusive)
FECHA_MINIMA = date(2026, 4, 30)


# ─── Helpers ──────────────────────────────────────────────────────────────────

def norm_cliente_id(nombre: str) -> str:
    return nombre.strip().upper().replace(" ", "_").replace(".", "")


def clean_text(v) -> str | None:
    """Convierte a str limpio. Solo elimina bytes nulos — preserva newlines
    intencionales de celdas Excel (Alt+Enter). El cliente Supabase envía
    texto como JSON, donde \\n es válido en strings."""
    if v is None or (isinstance(v, float) and pd.isna(v)):
        return None
    s = str(v).replace("\x00", "").strip()
    return s or None


def parse_date(val) -> str | None:
    if val is None or (isinstance(val, float) and pd.isna(val)):
        return None
    if isinstance(val, date):
        return val.isoformat()
    try:
        return pd.to_datetime(val, dayfirst=True).date().isoformat()
    except Exception:
        return None


def log(msg: str, dry: bool = False):
    print(f"{'[DRY-RUN] ' if dry else ''}{msg}", flush=True)


# ─── Carga de fuentes ─────────────────────────────────────────────────────────

def cargar_excels(data: Path) -> tuple[pd.DataFrame, pd.DataFrame]:
    dir_imp = data / "input_impel"
    ops_df = pd.read_excel(dir_imp / "Todas OP.xlsx")
    det_df = pd.read_excel(dir_imp / "Todas Orden de Producción Det.xlsx")
    ops_df.columns = ops_df.columns.str.strip()
    det_df.columns = det_df.columns.str.strip()
    return ops_df, det_df


def cargar_fase_map(data: Path) -> dict:
    fase_map_path = data / "state" / "fase_map.json"
    if not fase_map_path.exists():
        return {}
    with open(fase_map_path, encoding="utf-8") as f:
        return json.load(f)


# ─── Construcción de payloads ─────────────────────────────────────────────────

def clean_categoria(raw) -> str | None:
    """Limpia el valor de Categoría Proc de IMPEL: quita el guion trailing."""
    if raw is None or (isinstance(raw, float) and pd.isna(raw)):
        return None
    return str(raw).strip().rstrip("-").strip() or None


def build_categorias(det_df: pd.DataFrame) -> list[dict]:
    """Extrae categorías únicas del detalle IMPEL para upsert en categorias_proc."""
    nombres = {
        clean_categoria(v)
        for v in det_df["Categoría Proc"].dropna()
    } - {None}
    return [{"nombre": n} for n in sorted(nombres)]


def build_clientes_impel(det_df: pd.DataFrame, ops_df: pd.DataFrame) -> list[dict]:
    nombres = set(det_df["ClienteNombre"].dropna().str.strip())
    nombres |= set(ops_df["ClienteNombre"].dropna().str.strip())
    return [
        {"id_impel": norm_cliente_id(n), "razon_social": n.strip()}
        for n in sorted(nombres) if n.strip()
    ]


def build_clientes(clientes_impel: list[dict]) -> list[dict]:
    return [
        {
            "cliente_impel_id": c["id_impel"],
            "tier": "estandar", "tipo_relacion": "unico",
            "condicion_pago": "mas_de_60d", "esquema_facturacion": "directa",
            "stock_administrado": False, "canal": "colombia",
            "complejidad_tipica": "media",
        }
        for c in clientes_impel
    ]


def build_ops(ops_df: pd.DataFrame, det_df: pd.DataFrame,
              cliente_id_map: dict, solo_op: str | None, skip_filters: bool = False) -> list[dict]:
    """Genera registros ops.
    op_num: número plano de IMPEL (ej. "6778") — sin prefijo.
    impel_id: Campo de Identificacion de Todas OP.xlsx (ID único IMPEL para la OP).

    Manejo de duplicados en Todas OP.xlsx:
    IMPEL puede tener dos filas para el mismo Num-OP (correcciones o revisiones).
    Usamos la fila cuyo impel_id (Campo de Identificacion) sea el MENOR — corresponde
    al registro original, cuyo ID es secuencialmente anterior a los OP-Ds del detalle.
    """
    if skip_filters:
        ops_activas = set(det_df["Num-OP"].dropna().astype(int).astype(str))
    else:
        ops_activas = set(
            det_df[det_df["Estado OP"].isin(ESTADOS_ACTIVOS)]["Num-OP"]
            .dropna().astype(int).astype(str)
        )
    # Mapa op_num → estado_impel (primer valor no-nulo por OP)
    estado_por_op: dict[str, str] = {}
    for _, r in det_df[["Num-OP", "Estado OP"]].dropna().iterrows():
        k = str(int(r["Num-OP"]))
        if k not in estado_por_op:
            estado_por_op[k] = str(r["Estado OP"]).strip()

    # Cuando hay duplicados de Num-OP, quedarse con el de menor impel_id (el original)
    ops_df_dedup = ops_df.copy()
    ops_df_dedup["_num_op_str"] = ops_df_dedup["Num-OP"].dropna().astype(int).astype(str)
    ops_df_dedup["_campo_id_int"] = pd.to_numeric(
        ops_df_dedup["Campo de Identificacion"], errors="coerce"
    )
    duplicados = ops_df_dedup[ops_df_dedup.duplicated("_num_op_str", keep=False)]
    if not duplicados.empty:
        nums_dup = duplicados["_num_op_str"].unique()
        print(f"  WARN: {len(nums_dup)} op_num(s) con duplicados en Todas OP.xlsx: {list(nums_dup)}")
        print(f"        Usando el registro con menor Campo de Identificacion (el original)")
    # Mantener solo el de menor impel_id por op_num
    ops_df_dedup = (
        ops_df_dedup
        .sort_values("_campo_id_int")
        .drop_duplicates(subset="_num_op_str", keep="first")
    )

    result = []
    for _, row in ops_df_dedup.iterrows():
        if pd.isna(row.get("Num-OP")):
            continue
        num_op = str(int(row["Num-OP"]))
        if num_op not in ops_activas:
            continue
        if solo_op and num_op != solo_op:
            continue
        if not skip_filters:
            fecha_creacion = parse_date(row.get("Fecha Creación"))
            if fecha_creacion and date.fromisoformat(fecha_creacion) < FECHA_MINIMA:
                continue

        cliente_nombre = str(row.get("ClienteNombre", "")).strip()
        cliente_uuid   = cliente_id_map.get(norm_cliente_id(cliente_nombre))
        if not cliente_uuid:
            print(f"  WARN: cliente '{cliente_nombre}' no encontrado, omitiendo OP {num_op}")
            continue

        vendedor_raw = str(row.get("Vendedor", "")).strip().upper()
        comercial    = VENDEDOR_MAP.get(vendedor_raw, vendedor_raw.capitalize() or None)

        # Campo de Identificacion = ID único IMPEL para la OP (análogo a Id. en el detalle)
        campo_id = row.get("Campo de Identificacion")
        impel_id = str(int(campo_id)) if (campo_id is not None and not pd.isna(campo_id)) else None

        result.append({
            "op_num":                    num_op,           # "6778", sin prefijo
            "impel_id":                  impel_id,         # "85323893"
            "cliente_id":                cliente_uuid,
            "nombre":                    clean_text(row.get("OP") or row.get("Nombre")),
            "fecha_creacion_impel":      parse_date(row.get("Fecha Creación")),
            "fecha_compromiso":          parse_date(row.get("Fec. Pro. Comercial 1")),
            "fecha_compromiso_original": parse_date(row.get("Fec. Pro. Comercial 1")),
            "total_uds": int(row["Cantidad Prendas"]) if not pd.isna(row.get("Cantidad Prendas")) else None,
            "comercial": comercial,
            "activa":    True,
            "estado_impel": estado_por_op.get(num_op),
        })
    return result


def build_op_ds(det_df: pd.DataFrame, fase_map: dict,
                op_num_set: set, solo_op: str | None,
                cat_id_map: dict | None = None, skip_filters: bool = False) -> list[dict]:
    """Genera registros op_ds.
    op_num: número plano (ej. "6778").
    seq: directamente de columna Secuencia de IMPEL.
    ref: "{op_num}-{seq}" — clave de negocio derivada (verificada por CHECK en DB).
    descripcion: texto multilinea preservado (\\n legítimos de celdas Excel).
    """
    if skip_filters:
        det = det_df.copy()
    else:
        det = det_df[det_df["Estado OP"].isin(ESTADOS_ACTIVOS)].copy()

    result = []
    for _, row in det.iterrows():
        if pd.isna(row.get("Id.")) or pd.isna(row.get("Num-OP")):
            continue

        impel_id = str(int(row["Id."]))
        num_op   = str(int(row["Num-OP"]))

        if solo_op and num_op != solo_op:
            continue
        if num_op not in op_num_set:
            continue

        # seq viene directo de IMPEL (columna Secuencia) — no lo calculamos
        seq_raw = row.get("Secuencia")
        if seq_raw is None or pd.isna(seq_raw):
            continue
        seq = int(seq_raw)

        # ref = clave de negocio derivada, coherente con CHECK en DB
        ref = f"{num_op}-{seq}"

        fase_info    = fase_map.get(impel_id, {})
        fase_actual  = FASE_ENUM.get(fase_info.get("fase", "fase 0 — sin planear"), "fase_0")
        en_produccion = fase_actual in FASES_PRODUCCION

        f0_base  = en_produccion
        ficha_raw = row.get("Ficha Técnica Producto")
        f0_ficha  = bool(ficha_raw and str(ficha_raw).strip() not in ("", "nan", "NaN")) if not f0_base else True

        result.append({
            "impel_id":      impel_id,
            "op_num":        num_op,
            "seq":           seq,
            "ref":           ref,
            "detalle":       clean_text(row.get("Detalle")),
            "cantidad":      max(int(row["Producir"]) if not pd.isna(row.get("Producir")) else 1, 1),
            "fase_actual":   fase_actual,
            "f0_ficha_tec":  f0_ficha,
            "f0_patronaje":  f0_base,
            "f0_muestra":    f0_base,
            "f0_aprobacion": f0_base,
            "f0_tela_avios": f0_base,
            "f0_op_creada":  f0_base,
            "colores":           clean_text(row.get("Colores")),
            "productos":         clean_text(row.get("Productos")),
            "categoria_proc_id": (cat_id_map or {}).get(clean_categoria(row.get("Categoría Proc"))),
            "link_impel":    IMPEL_LINK_TPL.format(impel_id),
            "activa":        True,
        })
    return result


# ─── ETL principal ────────────────────────────────────────────────────────────

def run(dry_run: bool, data: Path, solo_op: str | None, modo: str = "incremental", skip_filters: bool = False):
    from utils.supabase_client import get_client

    log("=" * 60)
    log("ETL: IMPEL → Supabase")
    log(f"  modo        : {modo}")
    log(f"  data        : {data.resolve()}")
    log(f"  dry_run     : {dry_run}")
    log(f"  skip_filters: {skip_filters}")
    log(f"  solo_op     : {solo_op or 'todas'}")
    log("=" * 60)

    sb = get_client()

    log("\n[1/8] Leyendo fuentes IMPEL + fase_map…")
    ops_df, det_df = cargar_excels(data)
    # En modo incremental las nuevas entran en fase_0 — no necesita fase_map
    fase_map = cargar_fase_map(data) if modo == "inicial" else {}

    # Excluir OP-Ds cuya OP cabecera está marcada como muestra
    if "Muestra" in ops_df.columns and not skip_filters:
        def _is_muestra(value) -> bool:
            if pd.isna(value):
                return False
            return str(value).strip().lower() not in ("", "0", "no", "false", "f", "n", "na", "nan")

        muestra_ops = set(
            ops_df.loc[ops_df["Muestra"].apply(_is_muestra), "Num-OP"]
            .dropna()
            .apply(lambda x: str(int(x)) if pd.notna(x) else "")
            .tolist()
        )
        if muestra_ops:
            antes  = len(det_df)
            det_df = det_df[
                ~det_df["Num-OP"].apply(lambda x: str(int(x)) if pd.notna(x) else "").isin(muestra_ops)
            ].copy()
            log(f"  Excluidas por muestra  : {antes - len(det_df)} OP-Ds ({len(muestra_ops)} OPs)")

    if skip_filters:
        det_activo = det_df
    else:
        det_activo = det_df[det_df["Estado OP"].isin(ESTADOS_ACTIVOS)]
    log(f"  OP-Ds activas/filtradas en IMPEL : {len(det_activo)}")
    log(f"  OP-Ds en fase_map      : {len(fase_map)}")

    log("\n[2/8] Upserting categorias_proc…")
    categorias = build_categorias(det_df)
    log(f"  {len(categorias)} categorías únicas")
    if not dry_run:
        sb.table("categorias_proc").upsert(categorias, on_conflict="nombre", ignore_duplicates=True).execute()
    cat_id_map: dict[str, str] = {}
    if not dry_run:
        rows = sb.table("categorias_proc").select("id, nombre").execute().data
        cat_id_map = {r["nombre"]: r["id"] for r in rows}
    else:
        cat_id_map = {c["nombre"]: f"uuid-cat-{c['nombre']}" for c in categorias}

    log("\n[3/8] Upserting clientes_impel + clientes…")
    clientes_impel = build_clientes_impel(det_df, ops_df)
    log(f"  {len(clientes_impel)} clientes únicos")
    if not dry_run:
        sb.table("clientes_impel").upsert(clientes_impel, on_conflict="id_impel").execute()
        # insert-only: ignorar duplicados para no pisar tier/tipo_relacion/condicion_pago/
        # complejidad_tipica ni la homologación que se editan manualmente en /clientes.
        sb.table("clientes").upsert(
            build_clientes(clientes_impel),
            on_conflict="cliente_impel_id",
            ignore_duplicates=True,
        ).execute()

    cliente_id_map = {}
    if not dry_run:
        rows = sb.table("clientes").select("id, cliente_impel_id").execute().data
        cliente_id_map = {r["cliente_impel_id"]: r["id"] for r in rows}
    else:
        cliente_id_map = {c["id_impel"]: f"uuid-{c['id_impel']}" for c in clientes_impel}

    log("\n[4/8] Upserting ops…")
    ops_payload = build_ops(ops_df, det_df, cliente_id_map, solo_op, skip_filters)
    log(f"  {len(ops_payload)} OPs en IMPEL (impel_id poblado: {sum(1 for o in ops_payload if o.get('impel_id'))})")

    # op_num_set completo — necesario para no excluir OP-Ds nuevas de OPs ya existentes
    op_num_set = {r["op_num"] for r in ops_payload}

    if not dry_run:
        if modo == "incremental":
            existentes_op = {r["op_num"] for r in sb.table("ops").select("op_num").execute().data}
            ops_nuevas = [o for o in ops_payload if o["op_num"] not in existentes_op]
            log(f"  OPs nuevas: {len(ops_nuevas)}  ·  existentes omitidas: {len(ops_payload) - len(ops_nuevas)}")
            if ops_nuevas:
                for chunk in _chunks(ops_nuevas, 100):
                    sb.table("ops").insert(chunk).execute()
            # Actualizar estado_impel en OPs existentes (refleja el estado real de IMPEL)
            from itertools import groupby as _gb
            existentes_con_estado = [o for o in ops_payload if o["op_num"] in existentes_op and o.get("estado_impel")]
            for estado, grp in _gb(sorted(existentes_con_estado, key=lambda x: x["estado_impel"]), key=lambda x: x["estado_impel"]):
                nums = [o["op_num"] for o in grp]
                for chunk in _chunks(nums, 200):
                    sb.table("ops").update({"estado_impel": estado}).in_("op_num", chunk).execute()
            if existentes_con_estado:
                log(f"  estado_impel actualizado: {len(existentes_con_estado)} OPs")
        else:
            for chunk in _chunks(ops_payload, 100):
                sb.table("ops").upsert(chunk, on_conflict="op_num").execute()
    elif modo == "incremental":
        log("  [dry-run] se consultaría Supabase para detectar OPs nuevas")

    log("\n[5/8] Cargando op_ds…")
    opds_payload = build_op_ds(det_df, fase_map, op_num_set, solo_op, cat_id_map, skip_filters)
    log(f"  {len(opds_payload)} OP-Ds en IMPEL")
    from collections import Counter
    dist = Counter(r["fase_actual"] for r in opds_payload)
    for fase in ["fase_0","compras","trazo","corte","tiqueteo","satelites","empaque","despacho"]:
        if dist[fase]:
            log(f"    {fase:12s}: {dist[fase]}")

    # opds_a_cargar: en incremental solo las nuevas; en inicial todas
    opds_a_cargar = opds_payload
    if not dry_run:
        if modo == "incremental":
            existentes_opd = {r["impel_id"] for r in sb.table("op_ds").select("impel_id").execute().data}
            opds_a_cargar = [r for r in opds_payload if r["impel_id"] not in existentes_opd]
            log(f"  OP-Ds nuevas: {len(opds_a_cargar)}  ·  existentes omitidas: {len(opds_payload) - len(opds_a_cargar)}")
            if opds_a_cargar:
                for chunk in _chunks(opds_a_cargar, 100):
                    sb.table("op_ds").insert(chunk).execute()
        else:
            for chunk in _chunks(opds_a_cargar, 100):
                sb.table("op_ds").upsert(chunk, on_conflict="impel_id").execute()
    elif modo == "incremental":
        log("  [dry-run] se consultaría Supabase para detectar OP-Ds nuevas")

    log("\n[6/8] Phase plans + recalc_pull…")
    if not dry_run:
        # Solo operar sobre las OP-Ds efectivamente cargadas en este ciclo
        impel_ids = [r["impel_id"] for r in opds_a_cargar]
        if not impel_ids:
            log("  Sin OP-Ds nuevas — se omite")
            opd_map = {}
        else:
            opd_rows = sb.table("op_ds").select("id, impel_id").in_("impel_id", impel_ids).execute().data
            opd_map  = {r["impel_id"]: r for r in opd_rows}

            hoy    = date.today().isoformat()
            planes = []
            for impel_id, opd in opd_map.items():
                for fase in ["fase_0","compras","trazo","corte","tiqueteo","satelites","empaque","despacho"]:
                    planes.append({"opd_id": opd["id"], "fase": fase,
                                    "dias": 0, "start_date": hoy, "due_date": hoy})
            for chunk in _chunks(planes, 500):
                sb.table("phase_plans").upsert(chunk, on_conflict="opd_id,fase", ignore_duplicates=True).execute()

            ok = err = 0
            for opd in opd_map.values():
                try:
                    sb.rpc("recalc_pull", {"p_opd_id": opd["id"]}).execute(); ok += 1
                except Exception as e:
                    print(f"  ERROR recalc_pull {opd['id']}: {e}"); err += 1
            log(f"  recalc_pull: {ok} OK, {err} errores")
    else:
        opd_map = {}

    log("\n[7/8] freeze_baseline para OP-Ds nuevas en producción…")
    if not dry_run and opd_map:
        en_prod = [r for r in opds_a_cargar if r["fase_actual"] in FASES_PRODUCCION]
        ok = err = 0
        for opd_data in en_prod:
            opd_db = opd_map.get(opd_data["impel_id"])
            if not opd_db:
                continue
            try:
                sb.rpc("freeze_baseline", {"p_opd_id": opd_db["id"], "p_actor": "etl_initial_load"}).execute()
                ok += 1
            except Exception as e:
                print(f"  ERROR freeze_baseline: {e}"); err += 1
        log(f"  freeze_baseline: {ok} OK, {err} errores")

    log("\n[8/8] op_arrival events…")
    if not dry_run and opd_map:
        eventos = []
        for impel_id, opd in opd_map.items():
            existing = sb.table("phase_events").select("id").eq("opd_id", opd["id"]).eq("tipo", "op_arrival").limit(1).execute().data
            if not existing:
                eventos.append({"opd_id": opd["id"], "tipo": "op_arrival",
                                 "actor": "etl_initial_load",
                                 "payload": json.dumps({"impel_id": impel_id})})
        if eventos:
            for chunk in _chunks(eventos, 200):
                sb.table("phase_events").insert(chunk).execute()
        log(f"  {len(eventos)} eventos op_arrival insertados")

    log("\n" + "=" * 60)
    if dry_run:
        log("DRY-RUN — nada escrito.")
        if modo == "incremental":
            log(f"  OPs en IMPEL: {len(ops_payload)}  OP-Ds en IMPEL: {len(opds_payload)}")
            log("  (en modo incremental se insertarían solo las que no existan en Supabase)")
        else:
            log(f"  OPs: {len(ops_payload)}  OP-Ds: {len(opds_payload)}  phase_plans: {len(opds_payload)*8}")
    else:
        def n(t, col="*"):
            return sb.table(t).select(col, count="exact").execute().count
        log("Carga completada:")
        log(f"  op_ds total: {n('op_ds')}  phase_plans: {n('phase_plans','opd_id')}  "
            f"phase_plans_baseline: {n('phase_plans_baseline','opd_id')}  "
            f"phase_events: {n('phase_events')}")
        if modo == "incremental":
            log(f"  OP-Ds insertadas este ciclo: {len(opds_a_cargar)}")
    log("=" * 60)


def _chunks(lst: list, n: int):
    for i in range(0, len(lst), n):
        yield lst[i:i+n]


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="ETL IMPEL → Supabase")
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--modo",    choices=["inicial", "incremental"], default="incremental",
                        help="'incremental' (default): inserta solo OPs/OP-Ds nuevas. "
                             "'inicial': upsert completo, usar solo tras truncate.")
    parser.add_argument("--data",    default=str(DATA_DIR),
                        help="Ruta a la carpeta data/ (default: ./data)")
    parser.add_argument("--solo-op", default=None)
    parser.add_argument("--skip-filters", action="store_true", help="Ignora filtros de fecha, estado y muestra")
    args = parser.parse_args()
    data_path = Path(args.data)
    if not (data_path / "input_impel").exists():
        print(f"ERROR: data/input_impel/ no encontrado en {data_path.resolve()}")
        print("       Coloca los Excels de IMPEL en data/input_impel/ — ver data/README.md")
        sys.exit(1)
    run(dry_run=args.dry_run, data=data_path, solo_op=args.solo_op, modo=args.modo, skip_filters=args.skip_filters)
