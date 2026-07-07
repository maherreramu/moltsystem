# 01 — Flujo Productivo y Tiempos Estándar · Molt SAS

## Las 8 fases del sistema

```
fase_0 → compras → trazo → corte → tiqueteo → satelites → empaque → despacho
```

Cada OP-D viaja secuencialmente por estas fases. El orden es fijo para todas las órdenes.
Excepciones al flujo requieren decisión explícita de los líderes y se modelan como OP parcial.

---

## Fase 0 — Compuerta de entrada

**Regla:** Bloquea el acceso a producción hasta completar los 6 checkboxes.
Una OP-D no puede avanzar a Compras sin los 6 en `true`. Enforcement: trigger Postgres + validación Server Action.

| Checkbox | Descripción |
|----------|-------------|
| `f0_ficha_tec` | Ficha técnica aprobada |
| `f0_patronaje` | Patronaje / molde listo |
| `f0_muestra` | Muestra física aprobada por cliente |
| `f0_aprobacion` | Aprobación formal del cliente |
| `f0_tela_avios` | Tela y avíos definidos y confirmados |
| `f0_op_creada` | OP formalmente creada en IMPEL |

Al completarse los 6 y pasarse a Compras, se dispara `freeze_baseline`: snapshot inmutable del plan pull.

---

## Fases 1–4 — Producción interna

| Fase | Enum | Descripción | Responsable | Notas |
|------|------|-------------|-------------|-------|
| **Compras** | `compras` | MP e insumos disponibles en bodega | Daniela Gaitán | MP importada China puede tomar +10d |
| **Trazo** | `trazo` | Generación del molde sobre la tela | Katherin Barrera | Minimiza merma |
| **Corte** | `corte` | Ejecución del corte | Brayan Rodríguez | Tres recursos: Morgan / manual / externo |
| **Tiqueteo** | `tiqueteo` | Marcación e identificación de piezas cortadas | Milena Pabón | 100% manual — cuello de botella frecuente |

### Recursos de corte (`recurso_corte`)

| Recurso | `recurso_corte_enum` | Capacidad / Cola | Cuándo usar |
|---------|---------------------|------------------|-------------|
| Morgan (máquina) | `morgan` | 713 uds/día · cola +8d cuando hay >308 OPs | Cantidad ≥50 uds, tela compatible, sin urgencia crítica |
| Manual | `manual` | Por medir, sin cola | <50 uds, urgencias pequeñas, tela delicada, muestras |
| Externo | `externo` | 4d sin cola | Deadline ≤22d, ahorra 9d vs Morgan con cola |

---

## Fase 5 — Satélites (caja negra)

El sistema registra solo dos fechas. Todo lo interno es responsabilidad de Santiago.

| Campo | Quién llena | Cuándo |
|-------|-------------|--------|
| `fecha_promesa_satelites` | Cristian / Santiago | Al entregar el lote al satélite |
| `fecha_recepcion_satelites` | Cristian / Santiago | Al recibir el lote terminado |

**Lo que Santiago gestiona internamente (invisible al sistema):**
- Asignación de talleres por tipo de prenda
- Rutas: marcación antes o después de confección
- Reprocesos y correcciones (se modelan como `op_d_pendientes` cuando afectan cantidad)

---

## Fase 6 — Empaque

Calidad y empaque son continuas en la operación. Se modela como una sola fase (`empaque`).
El `tipo_empaque` (`estandar` / `personalizado` / `exportacion`) determina el tiempo estándar.

---

## Fase 7 — Despacho ⚓

Fecha ancla pull — inamovible. Solo cambia con replanificación formal (evento `replan`).
El `tipo_despacho` (`estandar` / `cross_docking` / `personalizado` / `exportacion`) determina tiempo.

---

## Tiempos estándar por fase

Validados con 471 órdenes de servicio reales (mayo 2026). Viven en tabla `lead_time_recurso` — configurables sin cambiar código.

| Fase | Tiempo base | Tiempo complejo | Condición de uso complejo |
|------|-------------|-----------------|--------------------------|
| `fase_0` | 5d | 10d | Primera vez / cliente exigente / prenda compleja |
| `compras` | 5d | 15d | MP importada China / tela especial / avíos con lead time |
| `trazo` | 3d | 7d | >20 referencias / patronaje complejo / sin molde base |
| `corte` | 4d (`externo`) | 13d (`morgan` con cola) | Morgan cuando no hay urgencia de deadline |
| `tiqueteo` | 2d | 3d | >3,000 uds con muchas referencias |
| `satelites` | 15d | 22d | Sastrería especializada (Avianca) |
| `empaque` | 4d | 10d | Empaque personalizado por colaborador / exportación |
| `despacho` | 1d | 7d | `cross_docking`=2d / `personalizado`=3d / `exportacion`=7d |

### Buffer de primera vez (`primera_vez = true`)

Cuando una referencia es nueva para el cliente, sumar días adicionales:
- Por defecto: +5d en `fase_0`, +3d en `satelites`
- Se ajustan en la junta inaugural y con datos reales en las primeras 4 semanas
- `primera_vez` es flag manual en `op_ds` — la junta lo activa

---

## Fórmula pull

```
fecha_compromiso_cliente (ancla)
  ← dias_despacho   (default: 1d)
  ← dias_empaque    (default: 4d)
  ← dias_satelites  (default: 15d)
  ← dias_tiqueteo   (default: 2d)
  ← dias_corte      (default: 4d)
  ← dias_trazo      (default: 3d)
  ← dias_compras    (default: 5d)
  ← dias_fase_0     (default: 5d)
  = start_date de fase_0
```

**Implementación:** función SQL `recalc_pull(opd_id UUID)` en Postgres, usando `restar_dias_habiles(date, INTEGER)` con tabla `festivos_co`. Disparada por trigger al editar `dias_X` o `fecha_compromiso` en `ops`.

**Invariante:** Mover una OP-D entre fases (Kanban) NO recalcula el plan. Solo actualiza `fase_actual` y registra evento `phase_advance`. El plan solo cambia con replanificación explícita.

---

## Tarjeta metodológica de planeación (5 preguntas)

En la junta semanal, para cada OP-D nueva que entra a Fase 0:

| # | Pregunta | Campo que afecta |
|---|----------|-----------------|
| 1 | ¿Tiene condiciones particulares en suministros o materia prima? | `dias_compras` |
| 2 | ¿El volumen puede generar cuello de botella en tiqueteo? | `dias_tiqueteo` |
| 3 | ¿Tiene particularidades en marcación o confección? (sastrería, sin marcación, compleja) | `dias_satelites` |
| 4 | ¿Tiene particularidades de empaque? (personalizado por colaborador, kits, exportación) | `dias_empaque`, `tipo_empaque` |
| 5 | ¿Hay condición especial de despacho acordada con el cliente? | `dias_despacho`, `tipo_despacho` |

Si todas las respuestas son NO → usar tiempos estándar base sin modificación.
Si alguna es SÍ → ajustar el campo correspondiente antes de mover a Compras.

---

## Bloqueos y pendientes

Una OP-D bloqueada permanece en su fase actual — no se mueve. El bloqueo es un metadato:

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `bloqueada` | BOOLEAN | Flag activo |
| `motivo_bloqueo` | `motivo_bloqueo_enum` | `mp_no_llego` / `fase_0_incompleta` / `pendiente_cliente` / `capacidad_satelite` / `reproceso` / `otro` |

Los avances parciales generan un `op_d_pendiente` con `cantidad_afectada` y `causa_desvio`. La OP-D padre sigue con la cantidad restante. Cierre de OP-D requiere todos sus pendientes en `cerrado`.

---

*Molt SAS · Flujo productivo · v2.0 · 2026-05-28 — alineado con modelo iter-1*
