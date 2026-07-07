# 02 — Gobierno Operativo y Rituales · Molt SAS

## Los tres rituales fijos

### Lunes 8:00 AM — Junta de planificación semanal (45 min)

**Participantes:** Miguel + Santiago + Camila + Mateo
**Pantalla principal:** Vista Gantt + Cola priorizada + Plan semana (`v_foco_semanal`)

**Agenda fija (6 puntos):**
1. Semáforo semana anterior — ¿qué se cumplió, qué no y por qué? *(Camila presenta)*
2. Estado del plan pull — revisar OP-Ds activas, identificar desvíos vs baseline *(Mateo presenta — vista `/junta-lunes`)*
3. ¿Qué entra a producción esta semana? — aplicar score a OP-Ds con F0 completa *(Miguel decide, cola priorizada ordena)*
4. ¿Hay solapes o cuellos de botella previsibles? — análisis de capacidad por semana/fase *(Santiago valida)*
5. Decisiones y cambios — si se replanifica una OP-D, se registra evento `replan` con motivo *(Camila registra en la app)*
6. Compromisos de la semana — qué debe estar listo el viernes *(Todos)*

**Output obligatorio:** Sistema actualizado con foco semanal antes de las 9:00 AM.

---

### Martes–Jueves 7:30 AM — Daily de seguimiento (15 min)

**Participantes:** Líderes de fase con su fase activa, escalando al comité si hay bloqueos
**Pantalla principal:** Vista "Mi fase hoy" (`v_mi_fase_hoy`) por líder

**3 preguntas por OP-D activa esta semana:**
1. ¿Avanzó según lo planeado ayer?
2. ¿Está bloqueada? → registrar motivo en el sistema, asignar responsable de resolución
3. ¿Necesita decisión antes del mediodía? → escalar, NO debatir en el daily

**Regla de oro:** Se reporta, no se debate. Los debates van a la junta del lunes.
Los líderes registran avances directamente en "Mi fase hoy" — la acción dispara el evento `daily_check` o `phase_advance`.

---

### Viernes 7:00 PM — Cierre semanal (30 min)

**Participantes:** Camila + Mateo

1. Verificar estado final de todas las OP-Ds activas en el sistema
2. Confirmar que los avances parciales de la semana tienen `op_d_pendientes` correctamente creados
3. Registrar causas de desvío en OP-Ds que no avanzaron según plan
4. Preparar agenda del lunes (cola priorizada queda calculada automáticamente)

**Este registro del viernes es lo que hace eficiente el lunes.**

---

## Semáforo de la junta

La vista `/junta-lunes` muestra automáticamente:
- Cola priorizada (`v_score` ordenado DESC)
- OP-Ds con semáforo rojo o amarillo que requieren acción
- Capacidad por semana/fase (`v_capacidad_semana_fase`)
- Bloqueos activos >24h sin resolución

---

## Reglas de operación

| # | Regla | Enforcement |
|---|-------|-------------|
| R-01 | Fecha compromiso inamovible | Solo cambia con evento `replan` registrado + motivo |
| R-02 | Sin F0 completa no hay producción | Trigger Postgres + validación Server Action |
| R-03 | Mover OP-D NO recalcula plan | Solo actualiza `fase_actual` + inserta evento `phase_advance` |
| R-04 | Score decide en conflictos | Miguel puede hacer `score_override` con motivo documentado |
| R-05 | Desvíos = datos, no fracasos | Siempre registrar `causa_desvio` — calibra el modelo de capacidad |
| R-06 | Daily reporta, no debate | 15 minutos máximo, sin debate |
| R-07 | Bloqueo >24h → notificación | Edge Function o cron Python notifica al responsable |

---

## Score de priorización (junta)

El sistema calcula automáticamente el score de cada OP-D según los 5 criterios del PPT (28-may-2026).
Ver detalle completo en `context/03_modelo_iter1.md` → sección Score de priorización.

Miguel puede sobreescribir con `score_override` + motivo. Queda registrado en `phase_events` tipo `score_update`.

---

## Relación con el MES (iter-2+)

El sistema actual (iter-1) es **gobierno operativo agregado** — visibilidad y control por fase a nivel OP-D.
No es un MES detallado. El MES (iter-2+) añadirá trazabilidad por rollo, OS individual, OC, inventario.

Los datos registrados en iter-1 (desvíos, causas, tiempos reales por fase) construyen el modelo de capacidad
que el MES necesitará para generar schedules precisos desde el día 1.

---

*Molt SAS · Gobierno operativo · v2.0 · 2026-05-28 — alineado con iter-1*
