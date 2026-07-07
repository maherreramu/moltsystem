"""
scripts/24_sync_satelites.py
Sincroniza fechas de entrega de satélites y bloqueos por pago desde el
reporte operativo del 2026-06-15.

Uso:
    uv run python scripts/24_sync_satelites.py --dry-run   # ver reporte sin escribir
    uv run python scripts/24_sync_satelites.py --apply     # aplicar cambios

Casos manejados:
  'fecha'        → actualiza op_ds.fecha_promesa_satelites + phase_event
  'confirmar'    → igual que 'fecha' pero marcado como tentativo en el reporte
  'retenido_pago'→ bloquea OP-D (bloqueada=true, motivo_bloqueo='pendiente_cliente')
  'sin_fecha'    → reporta como acción manual requerida, sin cambios en DB
  'aerosan'      → documenta sin acción (satélites que no van a recibir)

Si un ref no existe en op_ds → se lista como PENDIENTE A MIGRAR DESDE IMPEL.
"""

import sys
import argparse
from pathlib import Path

# Forzar UTF-8 en Windows (evita UnicodeEncodeError en cp1252)
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")
if hasattr(sys.stderr, "reconfigure"):
    sys.stderr.reconfigure(encoding="utf-8")

sys.path.insert(0, str(Path(__file__).parent.parent))
from utils.supabase_client import get_client

FUENTE = "actualizacion_satelites_2026-06-15"
ACTOR  = "etl_sync_satelites"

# ─── Datos del reporte operativo ─────────────────────────────────────────────
# (ref, fecha_promesa, tipo, nota)
# tipo: 'fecha' | 'confirmar' | 'retenido_pago' | 'sin_fecha' | 'aerosan'
ACTUALIZACIONES = [
    # Con fecha definida → fecha_promesa_satelites
    ("6696-8",  "2026-06-16", "fecha",          None),
    ("6653-17", "2026-06-16", "fecha",          "en módulo"),
    ("6653-18", "2026-06-16", "fecha",          "en módulo"),
    ("6705-1",  "2026-06-19", "fecha",          "gorras corral nueva imagen"),
    ("6705-2",  "2026-06-19", "fecha",          "gorras corral nueva imagen"),
    ("6705-3",  "2026-06-19", "fecha",          "gorras corral nueva imagen"),
    ("6705-14", "2026-06-16", "fecha",          None),
    ("6745-1",  "2026-06-11", "fecha",          None),
    ("6750-1",  "2026-06-11", "fecha",          None),
    ("6747-4",  "2026-06-12", "fecha",          "módulo"),
    ("6747-5",  "2026-06-12", "fecha",          "módulo"),
    ("6749-14", "2026-06-12", "fecha",          "módulo"),
    ("6749-15", "2026-06-12", "fecha",          "módulo"),
    ("6683-1",  "2026-06-17", "fecha",          None),
    ("6683-2",  "2026-06-17", "fecha",          None),
    ("6683-3",  "2026-06-17", "fecha",          None),
    ("6683-4",  "2026-06-17", "fecha",          None),
    ("6678-2",  "2026-06-17", "fecha",          None),
    ("6694-2",  "2026-06-17", "fecha",          None),
    ("6694-6",  "2026-06-17", "fecha",          None),
    ("6749-2",  "2026-06-19", "fecha",          None),
    ("6749-3",  "2026-06-19", "fecha",          None),
    ("6749-4",  "2026-06-19", "fecha",          None),
    ("6766-1",  "2026-06-16", "fecha",          None),
    ("6786-3",  "2026-06-30", "fecha",          None),
    ("6786-4",  "2026-07-09", "fecha",          None),
    ("6786-5",  "2026-06-30", "fecha",          None),
    ("6787-2",  "2026-07-09", "fecha",          None),
    ("6787-3",  "2026-06-30", "fecha",          "chocolates"),
    ("6781-1",  "2026-07-09", "fecha",          None),
    ("6797-1",  "2026-07-09", "fecha",          None),
    ("6797-2",  "2026-07-09", "fecha",          None),
    ("6797-3",  "2026-07-09", "fecha",          None),
    ("6797-4",  "2026-07-09", "fecha",          None),
    ("6797-5",  "2026-07-09", "fecha",          None),
    # Fecha por confirmar (última reportada en secuencia 11/06 → 16/06 → x)
    ("6745-3",  "2026-06-16", "confirmar",      "última fecha reportada — secuencia: 11/06 → 16/06 → x (pendiente confirmación)"),
    # Retenidos x pago → bloquear
    ("6694-3",  None,         "retenido_pago",  "Retenido por cartera/pago"),
    ("6694-8",  None,         "retenido_pago",  "Retenido por cartera/pago"),
    ("6745-2",  None,         "retenido_pago",  "Retenido por pago — lo dejó quieto x pago"),
    # Sin fecha — acción manual requerida
    ("6639-17", None,         "sin_fecha",      "Pendiente validación comercial para avanzar"),
    ("6626-1",  None,         "sin_fecha",      "Avianca chaqueta sastre (Taylor) — validar fecha con Santiago"),
    # Aerosan: no van a recibir — solo documentar
    ("6473-9",  None,         "aerosan",        "Chaquetas Aerosan que no van a recibir. Para Molt"),
    ("6473-10", None,         "aerosan",        "Chaquetas Aerosan que no van a recibir. Para Molt"),
    ("6547-1",  None,         "aerosan",        "Chaquetas Aerosan que no van a recibir"),
    ("6547-2",  None,         "aerosan",        "Chaquetas Aerosan que no van a recibir"),
]


def main(dry_run: bool):
    sb = get_client()
    modo = "DRY-RUN" if dry_run else "APPLY"
    print(f"\n{'='*60}")  # noqa: keep ASCII
    print(f"  sync_satelites — {modo}  ({len(ACTUALIZACIONES)} entradas)")
    print(f"{'='*60}\n")

    # ── 1. Batch lookup de todos los refs ──────────────────────────
    all_refs = [r[0] for r in ACTUALIZACIONES]
    res = sb.from_("op_ds").select(
        "id,ref,bloqueada,motivo_bloqueo,fecha_promesa_satelites,fase_actual"
    ).in_("ref", all_refs).execute()
    opd_map = {row["ref"]: row for row in (res.data or [])}

    # ── 2. Clasificar y procesar ───────────────────────────────────
    aplicados       = []   # (ref, accion, detalle)
    pendientes_impel = []  # refs no encontrados en op_ds
    manual          = []   # sin_fecha
    aerosan_docs    = []   # solo documentar
    skips           = []   # ya bloqueada / ya tenía fecha igual

    for ref, fecha, tipo, nota in ACTUALIZACIONES:
        opd = opd_map.get(ref)

        # ── Ref no encontrado en DB ────────────────────────────────
        if opd is None:
            # Aerosan ya sabemos que no van a estar (son para documentar)
            if tipo == "aerosan":
                aerosan_docs.append((ref, nota))
            else:
                pendientes_impel.append((ref, tipo, nota))
            continue

        opd_id = opd["id"]

        # ── sin_fecha / aerosan con opd existente ──────────────────
        if tipo == "sin_fecha":
            manual.append((ref, nota))
            continue
        if tipo == "aerosan":
            aerosan_docs.append((ref, nota))
            continue

        # ── retenido_pago ──────────────────────────────────────────
        if tipo == "retenido_pago":
            if opd["bloqueada"]:
                skips.append((ref, f"ya bloqueada ({opd['motivo_bloqueo']}) — omitida"))
                continue
            if not dry_run:
                sb.from_("op_ds").update({
                    "bloqueada": True,
                    "motivo_bloqueo": "pendiente_cliente",
                }).eq("id", opd_id).execute()
                sb.from_("phase_events").insert({
                    "opd_id": opd_id,
                    "tipo": "block",
                    "actor": ACTOR,
                    "payload": {
                        "motivo": "pendiente_cliente",
                        "observaciones": nota,
                        "fuente": FUENTE,
                    },
                }).execute()
            aplicados.append((ref, "[BLOQUEO]", f"motivo=pendiente_cliente - {nota}"))
            continue

        # ── fecha / confirmar ──────────────────────────────────────
        fecha_actual = opd.get("fecha_promesa_satelites")
        if not dry_run:
            sb.from_("op_ds").update({
                "fecha_promesa_satelites": fecha,
            }).eq("id", opd_id).execute()
            payload = {"fecha": fecha, "fuente": FUENTE}
            if nota:
                payload["nota"] = nota
            if tipo == "confirmar":
                payload["tentativa"] = True
            sb.from_("phase_events").insert({
                "opd_id": opd_id,
                "tipo": "satellite_promise_set",
                "actor": ACTOR,
                "payload": payload,
            }).execute()

        tag = "[!] CONFIRMAR" if tipo == "confirmar" else "[OK]"
        detalle = f"fecha_promesa → {fecha}"
        if fecha_actual and fecha_actual != fecha:
            detalle += f"  (anterior: {fecha_actual})"
        if nota:
            detalle += f"  [{nota}]"
        aplicados.append((ref, tag, detalle))

    # ── 3. Reporte ─────────────────────────────────────────────────
    SEP = "-" * 60

    def section(title, items):
        if not items:
            return
        print(f"\n{SEP}")
        print(f"  {title} ({len(items)})")
        print(SEP)
        for line in items:
            print(f"  {line}")

    # Aplicados
    print(f"\n{SEP}")
    print(f"  {'[DRY-RUN] ' if dry_run else ''}APLICADOS ({len(aplicados)})")
    print(SEP)
    for ref, tag, detalle in aplicados:
        print(f"  {tag}  {ref:12s} → {detalle}")

    # Skips
    if skips:
        print(f"\n{SEP}")
        print(f"  OMITIDOS / YA ACTUALIZADOS ({len(skips)})")
        print(SEP)
        for ref, motivo in skips:
            print(f"  —  {ref:12s}  {motivo}")

    # Pendientes IMPEL
    if pendientes_impel:
        print(f"\n{SEP}")
        print(f"  ⚡ PENDIENTES A MIGRAR DESDE IMPEL ({len(pendientes_impel)})")
        print(SEP)
        print(f"  Estos refs NO existen en op_ds — cargar primero con el ETL:")
        print(f"    uv run python scripts/20_load_to_supabase.py --dry-run")
        print(f"    uv run python scripts/20_load_to_supabase.py")
        print(f"  Luego volver a correr este script.\n")
        for ref, tipo, nota in pendientes_impel:
            nota_str = f" — {nota}" if nota else ""
            print(f"  ✗  {ref:12s}  [{tipo}]{nota_str}")

    # Acción manual
    if manual:
        print(f"\n{SEP}")
        print(f"  ACCIÓN MANUAL REQUERIDA ({len(manual)})")
        print(SEP)
        for ref, nota in manual:
            print(f"  ⚡  {ref:12s}  {nota}")

    # Aerosan documentado
    if aerosan_docs:
        print(f"\n{SEP}")
        print(f"  AEROSAN — DOCUMENTADO, SIN ACCIÓN ({len(aerosan_docs)})")
        print(SEP)
        for ref, nota in aerosan_docs:
            print(f"  📄  {ref:12s}  {nota}")

    # Resumen final
    print(f"\n{'='*60}")  # noqa: keep ASCII
    print(f"  RESUMEN")
    print(f"{'='*60}")
    print(f"  Aplicados:              {len(aplicados)}")
    print(f"  Omitidos (ya tenían):   {len(skips)}")
    print(f"  Pendientes IMPEL:       {len(pendientes_impel)}")
    print(f"  Acción manual:          {len(manual)}")
    print(f"  Aerosan (documentado):  {len(aerosan_docs)}")
    if dry_run:
        print(f"\n  ⚠  DRY-RUN — ningún cambio fue escrito. Correr con --apply para aplicar.")
    print()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Sync fechas de satélites desde reporte operativo")
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument("--dry-run", action="store_true", help="Ver reporte sin escribir en DB")
    group.add_argument("--apply",   action="store_true", help="Aplicar cambios en DB")
    args = parser.parse_args()
    main(dry_run=args.dry_run)
