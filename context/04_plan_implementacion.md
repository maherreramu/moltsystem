# 04 — Plan de implementación iter-1 · Sistema de Producción Molt

**Versión:** 2.0
**Fecha original:** 2026-05-28 · **Actualizado:** 2026-06-01
**Estado:** Sprints 0–6 COMPLETADOS · Sprint 7 (VPS deploy) pendiente
**Equipo:** Mateo Herrera (dev único) + Claude Code (asistencia) + comité Molt (validación)

---

## Estado de los sprints

```
✅ Sprint 0 ─► ✅ Sprint 1 ─► ✅ Sprint 2 ─┐
                                           │
   └──────────► ✅ Sprint 3 ──────────► ✅ Sprint 4 ─► ✅ Sprint 5 ─► ✅ Sprint 6 ─► 🔄 Sprint 7
                                                                                       │
                                                                                       ▼
                                                                                  Pendiente:
                                                                                  VPS deploy
```

**Hitos cumplidos:**
- ✅ Schema Supabase completo con 27 migraciones
- ✅ ETL desde IMPEL (537 OP-Ds cargadas)
- ✅ Frontend Next.js 16.2.6 con 13 páginas operativas
- ✅ Todas las Server Actions de operación implementadas
- ✅ Gestión de usuarios y roles (4 roles + página `/admin/usuarios`)
- ✅ Caracterización de clientes (`/clientes` + homologación + creación manual)
- ✅ Cache compartido + Realtime propagación < 2s
- ✅ Junta del lunes usando el sistema (`/junta`)
- ⏳ Sprint 7: VPS deploy (Dockerfile, GitHub Actions, nginx/SSL)
- ⏳ Sprint 0.9: Sentry (DSN configurado, no activado aún)

---

## Sprint 0 — Preparación y prerrequisitos ✅ COMPLETADO

**Resultado:** credenciales Supabase operativas, Azure AD configurado, repo estructurado. Tiers de clientes pendientes de definición por la junta → implementada UI de caracterización en `/clientes` como solución definitiva.

---

## Sprint 1 — Backend core ✅ COMPLETADO

**Resultado:** 27 migraciones aplicadas. Schema completo en Supabase:

| Migración | Contenido |
|---|---|
| 0001–0009 | Enums, maestros, núcleo, plan, eventos, pendientes, funciones, triggers |
| 0010–0011 | Vistas (v_slack, v_score, v_semaforo_op, v_plan_vs_real, etc.) + v_capacidad materializada |
| 0012–0013 | Fix recalc_pull días, fix op_num/seq |
| 0014–0017 | RLS read authenticated, grants vistas, usuarios_sistema, RLS write |
| 0018 | RN-07 gate de pendientes para Despacho |
| 0019 | RPCs JSON para Gantt (bypasan max_rows=1000) |
| 0020–0024 | Fix N+1 v_score, RPCs para cache, Realtime, festivos SECURITY DEFINER |
| 0025 | `get_plan_semana(date)` — plan semana paramétrico |
| 0026 | Homologación clientes (`homologado_a`), `v_cliente_efectivo`, `v_score` actualizado, `get_clientes_data()` |
| 0027 | Rol `visualizacion`, `check_user_access()`, `get_usuarios_sistema_admin()` |

---

## Sprint 2 — ETL desde IMPEL a Supabase ✅ COMPLETADO

**Resultado:**
- `scripts/20_load_to_supabase.py`: carga inicial 537 OP-Ds desde IMPEL Excel
- Clientes upsertados con `ignore_duplicates=True` para no pisar caracterización manual
- `scripts/21_sync_incremental.py`: creado, pendiente activar cron en producción

**Nota sobre paridad:** verificado que semáforo, slack y fases coinciden con sistema anterior para las OP-Ds de referencia.

---

## Sprint 3 — Frontend foundations ✅ COMPLETADO

**Resultado:** Next.js 16.2.6 con Turbopack. Auth funcional: Azure AD SSO + magic link + email/contraseña.

**Desvíos del plan original:**
- `middleware.ts` → `proxy.ts` (cambio de API en Next.js 16)
- SWR no se usó → Supabase Realtime + ISR + `unstable_cache`
- `react-hook-form` + `zod` no se usaron → formularios inline con `useState` + `useTransition`
- `wx-react-gantt` no se usó → Gantt custom de dos paneles con scroll sincronizado

---

## Sprint 4 — Vistas core ✅ COMPLETADO

**Resultado:** `/produccion` con Kanban, Gantt custom y Tabla. 537 OP-Ds visibles en las 3 vistas.

**Desvíos del plan:**
- Gantt: se construyó desde cero (dos paneles, scroll sync, virtualización por ventana) en vez de usar SVAR Gantt
- Baseline overlay implementado con barras SVG inline
- Zoom 4 niveles: año/trimestre/mes/semana
- Zoom continuo con trackpad/pinch (native wheel event listener `passive:false`)
- PostgREST max_rows=1000 → solucionado con RPCs JSON (migraciones 0019, 0021, 0023)

---

## Sprint 5 — Vistas operativas ✅ COMPLETADO

**Resultado:** todas las vistas secundarias operativas.

**Entregado:**
- `/cola` — cola priorizada con breakdown de score
- `/plan-semana` — foco semanal con **navegador de semanas** (pasadas y futuras), colapso por fase
- `/capacidad` — grid semana × fase con rango de fechas "lun 1 jun — vie 5 jun"
- `/mi-fase` — vista por líder con **sección de pendientes activos** y ciclo de vida completo
- `/pendientes` — lista con filtros de urgencia
- `/actividad` — log global de `phase_events` con filtros (añadido fuera del plan original)
- `/ops` — vista agregada de OPs con sub-tabla OP-Ds, links IMPEL, reasignación de cliente

**Añadidos no planificados:**
- Gestión de usuarios (`/admin/usuarios`, migración 0027)
- Caracterización de clientes (`/clientes`, migración 0026)
- Página `/acceso-pendiente` con flujo de autorización explícita

---

## Sprint 6 — Eventos, daily web y junta lunes ✅ COMPLETADO

**Resultado:** sistema completamente operativo para escritura.

**Server Actions implementadas:**
- `advancePhase(opdId, observaciones?)` — avance con gate F0, RN-07 despacho
- `advancePhaseParcial(opdId, cantidad, motivo, observaciones?)` — crea pendiente
- `revertPhase(opdId, motivo)` — reversión con log (solo admin)
- `blockOpd(opdId, motivo, observaciones?)` — bloqueo con motivo
- `unblockOpd(opdId, resolucion)` — desbloqueo
- `updateF0Checkbox(opdId, campo, valor)` — checkboxes F0
- `scoreOverride(opdId, score, motivo)` — override manual
- `replanOpd(opdId, cambios)` — replanificación
- `setSatellitePromise / setSatelliteReceived` — fechas satélite
- `closePendiente(pendienteId)` — cierre con log
- `advancePendienteFase(pendienteId)` — avance de fase del pendiente

**Todas las acciones mutantes usan `getSbChecked()`** — bloquea rol `visualizacion`.

**Campo de observaciones** en avances, avances parciales y bloqueos — almacenado en `phase_events.payload.observaciones` y `op_d_pendientes.notas`.

---

## Sprint 7 — Cut-over, observabilidad y go-live 🔄 PENDIENTE

**Pendiente:**

| # | Tarea | Estado |
|---|---|---|
| 7.1 | Dockerfile multistage para Next.js 16 | ⏳ |
| 7.2 | `docker-compose.yml` del nuevo servicio en VPS | ⏳ |
| 7.3 | Workflow `deploy-vps.yml`: build + push GHCR + ssh deploy | ⏳ |
| 7.4 | nginx + SSL Let's Encrypt para `produccion.molt.com.co` | ⏳ |
| 7.5 | Deploy primer release + smoke test URL pública | ⏳ |
| 7.6 | Sentry: source maps, alertas configuradas | ⏳ (Sprint 0.9) |
| 7.7 | Activar cron para `scripts/21_sync_incremental.py` | ⏳ |
| 7.8–7.9 | Cut-over por líder (Cristian → Daniela → Brayan → ...) | ⏳ |
| 7.10 | Comunicar fin de dailys Excel | ⏳ |
| 7.12 | Documentación de usuario: 1-pagers por rol | ⏳ |
| 7.13 | Runbook operación | ⏳ |
| 7.14 | Retrospectiva comité | ⏳ |

**Criterios de aceptación Sprint 7:**
- URL pública `https://produccion.molt.com.co` accesible con SSL
- Los 6 líderes han usado "Mi fase hoy" ≥ 5 días consecutivos sin bugs críticos
- Junta lunes hace su agenda desde el sistema nuevo

---

## Post go-live: iter-1.5

Ver `context/06_plan_iter1_5.md` para el backlog confirmado. Requerimientos clave:
- **RF-01 Vendido sin OP** — proyecciones de demanda futura
- **RF-02 RLS granular por fase** — acceso granular para líderes
- **RF-06 Sync incremental IMPEL diario** — prerequisito operativo (script existe, falta cron)

---

## Métricas de éxito iter-1

| Métrica | Baseline (ClickUp) | Resultado iter-1 |
|---|---|---|
| Tiempo de recalc_pull completo | ~20 min | <2s (función SQL en Postgres) |
| Tiempo de carga del Kanban | 5-8s | <1s (unstable_cache caliente) |
| Propagación entre usuarios | N/A (sin tiempo real) | <2s (Supabase Realtime) |
| Queries HTTP por render /produccion | N/A | 4 (cacheadas, antes eran 19) |
| Líderes con acceso al sistema | 0 | Sistema listo — cut-over Sprint 7 |
| Caracterización de clientes | 0/537 (todos en default) | UI lista — tarea del equipo comercial |

---

*Molt SAS · Plan de implementación iter-1 · v2.0 · 2026-06-01*
