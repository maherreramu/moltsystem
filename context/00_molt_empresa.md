# 00 — Contexto general de Molt SAS

## Quiénes somos

**Molt SAS** es una empresa colombiana de fabricación de dotación industrial con sede en Bogotá y canal comercial en Panamá. Fabrica prendas de trabajo para clientes industriales, operando bajo distintos modelos de demanda según el tipo de cliente y contrato.

**Modelo de negocio:** fabricación bajo pedido (predominante), con variantes de make to stock, stock mínimo por contrato y masivas. El ciclo productivo típico va de 90 a 120 días entre la compra de materia prima y el cobro efectivo al cliente.

---

## Modelos de demanda

| Modelo | Descripción |
|---|---|
| **Make to order** | Pedido específico con especificaciones del cliente |
| **Make to stock** | Fabricación anticipada para inventario propio de Molt |
| **Stock mínimo por contrato** | Abastecimiento continuo con reposición según consumo |
| **Masiva** | Dotación legal obligatoria en Colombia, con picos cada 4 meses |

---

## Estructura de áreas funcionales

Molt opera con 11 áreas funcionales que participan secuencialmente o en paralelo en el flujo E2E:

1. Comercial
2. Diseño y desarrollo de producto
3. Compras e importaciones
4. Recepción y control de calidad de materias primas
5. Producción interna (planta Bogotá)
6. Coordinación de producción externa (red de satélites)
7. Logística interna (transporte hacia y desde satélites)
8. Control de calidad
9. Bodega, empaque y despacho
10. Canal Panamá (exportación y logística internacional)
11. Administración, finanzas y tecnología

---

## Flujo E2E resumido

```
Comercial → Diseño → Compras → Recepción MP
                                    ↓
                           Producción interna
                           (trazo, corte, tiqueteo)
                                    ↓
                      Coordinación satélites ↔ Logística
                      (confección, marcación)
                                    ↓
                           Control de calidad
                                    ↓
                      Bodega → Despacho nacional
                                    ↓
                      Canal Panamá → Clientes internacionales
```

---

## Red de satélites

El corazón de la capacidad productiva de Molt es una red de **96+ talleres satélite** externos. Los satélites ejecutan:
- Confección parcial o completa (por unidad, lote o tarifa fija)
- Marcación: bordado, estampado, sublimado
- Servicio completo: reciben materia prima o piezas cortadas y devuelven prenda terminada

La gestión de satélites es responsabilidad del líder de producción (Santiago). El sistema de seguimiento solo registra dos fechas por satélite: **promesa de entrega** y **recepción real**.

---

## Canal Panamá

Panamá opera como **cliente interno** de Molt Colombia. Molt Colombia factura a la sede Panamá; Panamá factura en USD a sus propios clientes internacionales. Este esquema genera un riesgo financiero específico: los costos de producción son en COP pero la facturación es en USD, por lo que el diferencial cambiario entre cotización y cobro afecta directamente el margen real.

---

## Equipo operativo clave

| Persona | Rol |
|---|---|
| **Miguel** | Dirección comercial — priorización estratégica y decisiones finales |
| **Santiago** | Producción y satélites — criterio productivo, validación técnica, fechas satélites |
| **Camila** | Seguimiento diario — actualización tablero, semáforo, cierre semanal |
| **Cristian** | Satélites — apoyo a Santiago en gestión de talleres |
| **Mateo** | Datos y tableros — configuración técnica, cargue inicial, registros |

---

## Costos estructurales por área (resumen)

### Costos visibles por área
- **Comercial:** salarios + comisiones + herramientas CRM
- **Diseño:** horas técnico/diseñador + materiales de muestra + marcaciones de prueba
- **Compras:** costo de MP (local e importada) + flete + aranceles + agente de aduana + financiación
- **Producción interna:** nómina operativa + horas extra + leasing planta + servicios + maquinaria
- **Satélites:** tarifas variables por unidad/lote + tiempo coordinador
- **Logística:** combustible + conductor + peajes + salario mensajero + mantenimiento flota
- **Calidad:** salario inspector + transporte a satélites
- **Bodega/despacho:** materiales de empaque + flota propia + operadores logísticos + nómina
- **Canal Panamá:** flete internacional + aduanas + operación sede Panamá
- **Administración:** nómina administrativa + instrumentos financieros + software + seguros

### Costos ocultos que hoy NO se registran por proyecto

Los siguientes costos son reales pero actualmente no se asignan a ningún proyecto ni aparecen en cotizaciones:

1. Tiempo de diseño y muestras en proyectos no cerrados
2. Horas extra no presupuestadas por reprocesos
3. Mensajeros express de urgencia fuera de ruta
4. Recompras urgentes de MP por errores de cantidad o calidad detectados tarde
5. Reprocesos en satélites (correcciones, reenvíos, rehacer prendas defectuosas)
6. Costo financiero del ciclo productivo (90–120 días de capital financiado)
7. Arrendamiento de bodega de producto terminado para clientes con stock
8. Administración de inventario y envío personalizado por colaborador (no cobrado)
9. Diferencial cambiario en importaciones desde China y en facturación Panamá
10. Depreciación real de maquinaria (cortadora Morgan, máquinas de coser)
11. Ineficiencias operativas por limitaciones de IMPEL

---

## Restricciones operativas conocidas

- **Inspección de MP:** la presión de tiempos frecuentemente impide una inspección rigurosa de telas al recibir, lo que genera defectos detectados solo al cortar (reproceso + recompra urgente).
- **Calidad en satélites:** la capacidad de inspección no alcanza para cubrir todos los procesos con la frecuencia necesaria.
- **IMPEL:** el software de gestión actual tiene alcance limitado (sin funcionalidad ERP real), genera reprocesos manuales y no proporciona trazabilidad por proyecto.
- **Capital de trabajo:** el ciclo de 90–120 días entre compra de MP y cobro requiere financiamiento activo (leasing, créditos, factoring), cuyo costo rara vez se incluye en las cotizaciones.

---

## Herramientas actuales

| Herramienta | Uso |
|---|---|
| IMPEL | Software de gestión interno (alcance limitado) |
| ClickUp | Sistema de seguimiento operativo de órdenes de producción |
| Adobe Illustrator / Photoshop | Diseño de prendas y marcaciones |
| Software de patronaje | Generación de patrones y fichas técnicas |
| CRM | Gestión comercial |

---

## Proyecto de transformación digital en curso

Molt está migrando de ClickUp-como-base-de-datos a un stack propio:
- **Supabase (Postgres)** como sistema de record
- **Next.js** como frontend operativo
- **Metabase** como analítica ejecutiva

La estrategia es *strangler fig*: ClickUp sigue activo durante la migración como espejo temporal mientras el nuevo sistema toma el control progresivo.

---

*Molt SAS · Contexto general de la empresa · Versión 1.0 · 2026*
