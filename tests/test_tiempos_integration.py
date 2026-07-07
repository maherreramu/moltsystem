"""
tests/test_tiempos_integration.py
Tests de integración para el módulo Tiempos (tab de edición de días por fase).

Qué se verifica:
  1. Schema — ops.fecha_compromiso existe (campo nuevo usado por TiemposTable)
  2. Schema — op_ds tiene los 8 columnas dias_* (fuente de verdad)
  3. Schema — trigger RN-06 existe (el que llama recalc_pull automáticamente)
  4. Invariante — phase_plans.dias == op_ds.dias_* para cada fase de cada OP-D activa
  5. Behavior — actualizar op_ds.dias_satelites propaga a phase_plans (trigger RN-06)

Corre con:  uv run --with pytest pytest tests/test_tiempos_integration.py -v
"""

import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).parent.parent))
from utils.supabase_client import get_client

FASES = ["fase_0", "compras", "trazo", "corte", "tiqueteo", "satelites", "empaque", "despacho"]
DIAS_COLS = {
    "fase_0":    "dias_fase_0",
    "compras":   "dias_compras",
    "trazo":     "dias_trazo",
    "corte":     "dias_corte",
    "tiqueteo":  "dias_tiqueteo",
    "satelites": "dias_satelites",
    "empaque":   "dias_empaque",
    "despacho":  "dias_despacho",
}


@pytest.fixture(scope="module")
def sb():
    return get_client()


# ─── 1. Schema: ops.fecha_compromiso ─────────────────────────────────────────

def test_ops_tiene_fecha_compromiso(sb):
    """
    TiemposTable selecciona ops.fecha_compromiso; si la columna no existiera
    PostgREST levantaría un error en lugar de devolver datos.
    """
    res = sb.from_("ops").select("fecha_compromiso").limit(1).execute()
    # Si llega aquí sin excepción, la columna existe
    assert res.data is not None


# ─── 2. Schema: op_ds tiene los 8 dias_* ─────────────────────────────────────

def test_op_ds_tiene_todas_columnas_dias(sb):
    """op_ds debe tener los 8 columnas dias_* que TiemposTable edita."""
    cols = ",".join(DIAS_COLS.values())
    res = sb.from_("op_ds").select(cols).limit(1).execute()
    assert res.data is not None
    if res.data:
        row = res.data[0]
        faltantes = [c for c in DIAS_COLS.values() if c not in row]
        assert not faltantes, f"Faltan columnas en op_ds: {faltantes}"


# ─── 3. Schema: trigger RN-06 — verificación indirecta via recalc_pull RPC ───

def test_recalc_pull_rpc_existe(sb):
    """
    recalc_pull es la función que el trigger RN-06 llama.
    Verificamos que existe como RPC llamándola con un UUID inválido
    (esperamos error de NOT FOUND, no de función inexistente).
    """
    import uuid
    try:
        sb.rpc("recalc_pull", {"p_opd_id": str(uuid.uuid4())}).execute()
        # Si no lanza excepción con un UUID fake, la función existe y manejó el caso vacío
    except Exception as e:
        msg = str(e)
        # Aceptamos: función retorna vacío silenciosamente (sin error) o lanza 404/no rows
        # Rechazamos: "function recalc_pull does not exist" (código 42883)
        assert "does not exist" not in msg and "42883" not in msg, (
            f"recalc_pull RPC no existe: {msg}"
        )


# ─── 4. Invariante: phase_plans.dias == op_ds.dias_* ─────────────────────────

def test_phase_plans_sincronizados_con_op_ds(sb):
    """
    Para cada OP-D activa, phase_plans.dias debe coincidir con op_ds.dias_*.
    Esta invariante la mantiene el trigger RN-06 + recalc_pull.
    Si falla, indica que hay OP-Ds con phase_plans desincronizados.
    """
    # Leer op_ds con sus dias
    opds_res = (
        sb.from_("op_ds")
        .select(
            "id,dias_fase_0,dias_compras,dias_trazo,dias_corte,"
            "dias_tiqueteo,dias_satelites,dias_empaque,dias_despacho"
        )
        .eq("activa", True)
        .execute()
    )
    opds = {row["id"]: row for row in opds_res.data}
    if not opds:
        pytest.skip("No hay OP-Ds activas para verificar")

    # Leer phase_plans para esas OP-Ds
    opd_ids = list(opds.keys())
    plans_res = (
        sb.from_("phase_plans")
        .select("opd_id,fase,dias")
        .in_("opd_id", opd_ids)
        .execute()
    )

    desync = []
    for plan in plans_res.data:
        opd = opds.get(plan["opd_id"])
        if not opd:
            continue
        fase = plan["fase"]
        col = DIAS_COLS.get(fase)
        if not col:
            continue
        expected = opd[col]
        actual   = plan["dias"]
        if expected != actual:
            desync.append({
                "opd_id": plan["opd_id"],
                "fase":   fase,
                "op_ds":  expected,
                "phase_plans": actual,
            })

    assert not desync, (
        f"{len(desync)} filas desincronizadas (op_ds.dias_X != phase_plans.dias):\n"
        + "\n".join(str(d) for d in desync[:5])
    )


# ─── 5. Behavior: trigger propaga cambio a phase_plans ───────────────────────

def test_trigger_propaga_cambio_dias_satelites(sb):
    """
    Al actualizar op_ds.dias_satelites, el trigger RN-06 llama recalc_pull
    y phase_plans.dias para 'satelites' debe actualizarse.
    Se restaura el valor original al final.
    """
    # Tomar la primera OP-D activa que tenga phase_plans
    opds_res = sb.from_("op_ds").select("id,dias_satelites,plan_congelado").eq("activa", True).limit(10).execute()
    candidatos = [r for r in opds_res.data if not r["plan_congelado"]]
    if not candidatos:
        pytest.skip("No hay OP-Ds activas sin plan congelado para testear")

    opd = candidatos[0]
    opd_id        = opd["id"]
    dias_original = opd["dias_satelites"]
    dias_nuevo    = dias_original + 1 if dias_original < 60 else dias_original - 1

    try:
        # 1. Aplicar cambio
        sb.from_("op_ds").update({"dias_satelites": dias_nuevo}).eq("id", opd_id).execute()

        # 2. Verificar que phase_plans se actualizó
        plan_res = (
            sb.from_("phase_plans")
            .select("dias")
            .eq("opd_id", opd_id)
            .eq("fase", "satelites")
            .single()
            .execute()
        )
        dias_en_plan = plan_res.data["dias"]
        assert dias_en_plan == dias_nuevo, (
            f"El trigger no propagó el cambio: phase_plans.dias={dias_en_plan}, esperado={dias_nuevo}"
        )

    finally:
        # 3. Restaurar siempre, aunque el assert falle
        sb.from_("op_ds").update({"dias_satelites": dias_original}).eq("id", opd_id).execute()

    # 4. Verificar que la restauración también se propagó
    plan_res2 = (
        sb.from_("phase_plans")
        .select("dias")
        .eq("opd_id", opd_id)
        .eq("fase", "satelites")
        .single()
        .execute()
    )
    assert plan_res2.data["dias"] == dias_original, "La restauración no se propagó correctamente"
