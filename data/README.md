# data/

Archivos de entrada para el ETL IMPEL → Supabase y la heurística de fases.

## Estructura

```
data/
  input_impel/      ← Exports de IMPEL       (gitignored)
  operacion/        ← Planillas operacionales (gitignored)
  state/            ← Estado heurístico       (git-tracked)
  output/           ← Outputs opcionales      (gitignored)
```

---

## data/input_impel/

Exports manuales desde IMPEL. Colocar aquí antes de correr el ETL o la heurística.

| Archivo | Fuente en IMPEL | Usado por |
|---|---|---|
| `Todas OP.xlsx` | Módulo OPs → "Todas OP" | `20_load_to_supabase.py` |
| `Todas Orden de Producción Det.xlsx` | Módulo OPs → "Todas Orden de Producción Det." | `20_load_to_supabase.py`, `21_heuristica_fases.py` |

---

## data/operacion/

Planillas operacionales mantenidas por el equipo de producción.

| Archivo | Sheets usados | Usado por |
|---|---|---|
| `PRODUCCION (3).xlsx` | SATELITES, MARCACIONES, CORTE, COMPRAS | `21_heuristica_fases.py` |
| `SEGUMIENTO OPS-2026 (1).xlsx` | # OPS | `21_heuristica_fases.py` |

---

## data/state/

Archivos de estado generados por la heurística. Se commitean (son pequeños y no contienen datos sensibles).

| Archivo | Generado por | Consumido por |
|---|---|---|
| `fase_map.json` | `21_heuristica_fases.py` | `20_load_to_supabase.py` |

---

## Flujo completo de carga

```bash
# 1. Colocar archivos en data/input_impel/ y data/operacion/

# 2. Generar heurística de fases
uv run python scripts/21_heuristica_fases.py
# → genera data/state/fase_map.json

# 3. Verificar sin escribir
uv run python scripts/20_load_to_supabase.py --dry-run

# 4. Cargar a Supabase
uv run python scripts/20_load_to_supabase.py
```
