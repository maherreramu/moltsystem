# 05 — Modelo de datos MES completo · Referencia iter-2+

> **Rol de este documento:** Diseño del MES detallado (iter-2+). NO es lo que se implementa ahora.
> El sistema actual (iter-1) implementa únicamente el gobierno operativo agregado descrito en `context/03_modelo_iter1.md`.
> Este documento es la hoja de ruta para cuando exista el modelo de datos de compañía codificado
> (SKUs maestros, BOMs estructurados, inventario codificado, catálogo de proveedores normalizado).
> **Prerequisito para usar este documento:** ese modelo de compañía debe existir primero.

---

# Molt SAS — Contexto operativo y modelo de datos MES
**Sistema MES TPS · Referencia iter-2+ · v3.0 · 2026**
*Bogotá, Colombia · Sede Panamá · Fabricación de dotación industrial*

---

## Índice

**Parte I — Contexto de la empresa**
1. [Descripción de Molt SAS](#1-descripción-de-molt-sas)
2. [Áreas funcionales](#2-áreas-funcionales)
3. [Modelos de demanda](#3-modelos-de-demanda)
4. [Ecosistema de sistemas](#4-ecosistema-de-sistemas)

**Parte II — Flujo operativo E2E**
5. [Visión general del flujo](#5-visión-general-del-flujo)
6. [Datos maestros previos al flujo productivo](#6-datos-maestros-previos-al-flujo-productivo)
7. [Disparador: paso a producción](#7-disparador-paso-a-producción)
8. [Fase 1 — Compras](#8-fase-1--compras)
9. [Fase 2 — Recepción de insumos y materias primas](#9-fase-2--recepción-de-insumos-y-materias-primas)
10. [Fase 3 — Trazo](#10-fase-3--trazo)
11. [Fase 4 — Corte](#11-fase-4--corte)
12. [Fase 5 — Tiqueteo y paqueteo](#12-fase-5--tiqueteo-y-paqueteo)
13. [Fase 6 — Marcación (opcional)](#13-fase-6--marcación-opcional)
14. [Fase 7 — Confección](#14-fase-7--confección)
15. [Gestión administrativa de satélites](#15-gestión-administrativa-de-satélites)
16. [Fase 8 — Recepción de PT, empaque y calidad](#16-fase-8--recepción-de-pt-empaque-y-calidad)
17. [Fase 9 — Despacho](#17-fase-9--despacho)
18. [Fase 10 — Facturación](#18-fase-10--facturación)
19. [Reprocesos por satélite](#19-reprocesos-por-satélite)
20. [Esquemas de tercerización](#20-esquemas-de-tercerización)
21. [Canal Panamá](#21-canal-panamá)
22. [Costos ocultos identificados](#22-costos-ocultos-identificados)

**Parte III — Modelo de datos**
23. [Entidades maestras — origen IMPEL](#23-entidades-maestras--origen-impel)
24. [Entidades maestras — configurables en el MES](#24-entidades-maestras--configurables-en-el-mes)
25. [Entidades transaccionales — generadas por el MES](#25-entidades-transaccionales--generadas-por-el-mes)
26. [Reglas de negocio críticas](#26-reglas-de-negocio-críticas)
27. [Inventario completo de entidades](#27-inventario-completo-de-entidades)
28. [Bloques de RF desbloqueados](#28-bloques-de-rf-desbloqueados)

---

## Parte I — Contexto de la empresa

---

## 1. Descripción de Molt SAS

Molt SAS es una empresa colombiana de fabricación de dotación industrial con sede operativa en Bogotá y canal de exportación a través de su sede en Panamá. Fabrica ropa de trabajo, uniformes y dotación para clientes en múltiples sectores industriales.

Su modelo productivo se basa en una **planta interna** para los procesos de trazo, corte y tiqueteo, y una **red flexible de talleres satélite** (aliados de maquila) para marcación y confección. Este modelo le permite escalar capacidad sin inversión fija, pero genera complejidad de coordinación y trazabilidad.

El ciclo productivo completo — desde la compra de materias primas hasta el cobro efectivo al cliente — oscila entre **90 y 120 días**, financiado con instrumentos como leasing, créditos bancarios y factoring.

---

## 2. Áreas funcionales

| Área | Rol principal en el flujo |
|---|---|
| Comercial | Origina la demanda, genera OP en IMPEL, gestiona el cliente |
| Diseño y desarrollo | Ficha técnica, patrón CAD, muestras, validación técnica |
| Compras e importaciones | Cálculo de requerimientos, gestión de OC, seguimiento de proveedores |
| Producción interna | Trazo, corte, tiqueteo, confección en módulo propio |
| Coordinación de satélites | Gestión de OS, asignación a aliados, seguimiento, reprocesos |
| Logística interna | Transporte entre planta y satélites |
| Control de calidad | Inspección en satélites y recepción de PT |
| Bodega y despacho | Empaque, stock PT, despacho en sus cuatro modalidades |
| Canal Panamá | Exportación, facturación internacional en USD |
| Administración y finanzas | Tesorería, cartera, contabilidad, gestión en Siigo |
| Tecnología | IMPEL, MES, transformación digital |

---

## 3. Modelos de demanda

Los cuatro modelos de demanda no cambian la secuencia de fases del MES, pero sí afectan el origen de la OP, la prioridad de procesamiento, las modalidades de despacho aplicables y la política de stock.

| Modelo | Descripción | Modalidad de despacho habitual |
|---|---|---|
| **Make to order (MTO)** | Pedido específico con especificaciones del cliente | Cross docking o envío personalizado |
| **Make to stock (MTS)** | Fabricación anticipada para inventario propio de Molt | Stock directo → consumo posterior |
| **Stock mínimo por contrato** | Abastecimiento continuo con reposición según consumo | Envío de reacción desde stock |
| **Masiva** | Dotación legal obligatoria en Colombia, picos cada ~4 meses | Cross docking o envío personalizado a múltiples sedes |

---

## 4. Ecosistema de sistemas

El MES coexiste con tres sistemas externos. Comprender el rol de cada uno evita duplicar funcionalidad y define la fuente de verdad por entidad.

| Sistema | Rol | Entidades que posee | Integración con el MES |
|---|---|---|---|
| **IMPEL** | ERP/legacy de Molt | OP, OPD, SKU, BOM, costeo, inventario codificado | ETL unidireccional vía Python + DBT. Fuente de datos maestros. Solo lectura desde el MES. |
| **Siigo** | Sistema contable | OC formales, facturas, cuentas de cobro | El MES referencia OC y facturas por número. Sin integración automática en Fase 1. |
| **MasterMind** | Software de trazado CAD | Patrones, archivos de trazo, optimización de marcada | El MES puede generar el archivo de cargue masivo (funcionalidad opcional). |
| **MES (nuevo)** | Capa de ejecución productiva | Fases, OS, lotes, novedades, trazabilidad | Núcleo del proyecto. Recibe maestros de IMPEL y registra todas las transacciones productivas. |

> **Fuentes de verdad:** IMPEL para OP/OPD/SKU/BOM/costeo. Siigo para OC formales y facturas. MES para fases productivas, OS, lotes físicos, consumos reales y trazabilidad.

---

## Parte II — Flujo operativo E2E

---

## 5. Visión general del flujo

```
IMPEL (maestros): SKU modelo → BOM → costeo → OP/OPDs
                                                    ↓
                              [OP pasa a "en producción"]
                                                    ↓
MES activa el flujo ──────────────────────────────────────────
                                                    ↓
    FASE 1 — Compras          → OC en Siigo · orden de espera
    FASE 2 — Recepción MP     → Insumos + rollos con atributos físicos
    FASE 3 — Trazo            → Orden de trazo → archivo MasterMind
    FASE 4 — Corte            → Tendido · consumo MP · corte
    FASE 5 — Tiqueteo         → Paquetes con secuencia de capa
    FASE 6 — Marcación (*)    → OS a satélite(s) de marcación
    FASE 7 — Confección       → OS a satélite(s) de confección
    FASE 8 — Recepción PT     → Ingreso · empaque · calidad
    FASE 9 — Despacho         → Stock · cross docking · kits · reacción
    FASE 10 — Facturación     → Remisiones → factura en Siigo

    (*) Fase opcional según ficha técnica del SKU modelo

    PARALELO:  Gestión administrativa de satélites
    PARALELO:  Facturas de satélites por OS → Contabilidad
    EVENTUAL:  Reprocesos por satélite → cobro al aliado
```

---

## 6. Datos maestros previos al flujo productivo

Todo el flujo productivo depende de que los siguientes elementos estén definidos y codificados en IMPEL antes de que se pueda generar cualquier Orden de Producción.

### 6.1 Inventario codificado

Debe existir un inventario codificado en tres categorías:

- **Productos terminados** — referencias finales entregables al cliente.
- **Insumos** — avíos (hilos, botones, cierres, remaches), etiquetas, insumos de marcación (tintas, transferencias, papeles de sublimado).
- **Materias primas** — telas y textiles.

### 6.2 SKU y SKU modelo

- El **SKU modelo** agrupa todas las variantes de un mismo diseño. Tiene asociada la ficha técnica y el patrón CAD.
- El **SKU** es cada variante concreta del modelo, identificada por talla y/o color.

### 6.3 BOM — Bill of Materials

Vincula el SKU modelo con todos sus insumos, materias primas y servicios requeridos. Incluye:

- Insumos físicos con cantidades por unidad producida.
- Servicios de producción tercerizados modelados como ítems del BOM: corte, marcación (bordado, estampado, sublimación), confección.

### 6.4 Costeo y costeo detalle

- Generado por el área comercial antes de cualquier OP.
- Misma estructura lógica que la OP/OPD: encabezado con N detalles por referencia.
- Costea el BOM y define cantidades por unidad producida.
- Es prerequisito para la creación de la OP.

### 6.5 Patrón o modelo CAD

- Archivo digital generado en la fase de diseño previa para cada SKU modelo.
- Consumido por MasterMind en el proceso de trazo.
- Gestionado por el MES como dato maestro del SKU modelo.

---

## 7. Disparador: paso a producción

### 7.1 Estructura de la OP

```
OP (cabecera — vinculada a un cliente)
├── OPD 1 — referencia A
│   ├── SKU talla S → cantidad X
│   ├── SKU talla M → cantidad Y
│   ├── SKU talla L → cantidad Z
│   └── ficha técnica del modelo
└── OPD 2 — referencia B
    └── ...
```

La **OPD** es la unidad operativa del flujo: define la cantidad a fabricar por SKU (por talla) de una referencia específica.

### 7.2 Validación y paso a producción

Una vez que la OP con sus OPDs cumple todos los requisitos técnicos, el **encargado de planeación de producción** la pasa a estado **"en producción"** en IMPEL.

### 7.3 Extracción por el MES

El cambio de estado es el trigger que activa el MES. El sistema extrae automáticamente la OP, las OPDs, el BOM y el costeo desde IMPEL vía pipeline ETL (Python + DBT). A partir de este momento, el flujo productivo es gestionado por el MES.

---

## 8. Fase 1 — Compras

**Responsable:** Encargado de compras

### 8.1 Cálculo de requerimientos

A partir del BOM/costeo por OPD, el MES calcula automáticamente las cantidades de insumos y materias primas necesarias por referencia.

### 8.2 Tramitación de OC

Las OC formales se generan en **Siigo**. El MES captura el seguimiento:

| Campo | Descripción |
|---|---|
| Operación de tramitación | Proveedor, condiciones, datos de la OC |
| Número de OC en Siigo | Vínculo entre el MES y la OC formal |
| Fecha estimada de llegada | Por referencia/insumo específico |
| Homologación de insumos | Sustitución por equivalente cuando aplica |

### 8.3 Homologación de insumos

Cuando el insumo del BOM no está disponible, compras puede homologar. El MES registra el insumo original, el homologado y la justificación. La homologación aplica sobre el BOM efectivo de la OPD — no modifica el BOM maestro del SKU modelo.

### 8.4 KPIs habilitados

- Lead time de la operación de compras (cálculo → OC tramitada).
- Lead time por insumo (OC → recepción).
- Tasa de homologaciones por OPD.

---

## 9. Fase 2 — Recepción de insumos y materias primas

**Responsables:**
- **Administrador de insumos** → avíos, insumos de marcación y otros no textiles.
- **Encargado de recepción de MP** → telas y textiles.

### 9.1 Orden de espera

Al tramitar cada OC, el MES genera automáticamente una **orden de espera** que le indica al encargado qué se espera recibir, para cuál OPD y cuándo. Es la cola de mercancía pendiente.

**Ciclo de vida de la orden de espera:**

| Estado | Significado |
|---|---|
| `pendiente` | Mercancía aún no ha llegado |
| `parcial_pendiente` | Se recibió parte; saldo por llegar. Notifica a compras para nota crédito o seguimiento |
| `excedente` | Se recibió más de lo ordenado. Notifica a compras para definir aceptación o devolución |
| `completa` | Recepción total confirmada |
| `cancelada` | OC cancelada o proveedor no entregó |

> **Excedente en telas:** frecuente cuando el proveedor vende por rollo completo y el rollo supera la cantidad exacta pedida. El excedente se acepta y queda en inventario disponible como rollo registrado.

### 9.2 Recepción y confirmación

El encargado registra cantidad efectiva recibida, novedades (faltantes, defectos, diferencias) y fecha real de recepción para cálculo de lead time y cumplimiento de proveedor.

### 9.3 Atributos críticos por rollo de tela

Para materias primas textiles, es obligatorio capturar atributos físicos **por rollo individual**:

| Atributo | Importancia operativa |
|---|---|
| **Ancho útil** (cm) | Determina el aprovechamiento real en el trazo |
| **Largo** (m) **o peso** (kg) | Cantidad disponible para planificar el trazo |
| **Lote de proveedor** | Garantiza homogeneidad de color al agrupar rollos |

> **Regla crítica:** los rollos asignados a una misma orden de trazo deben pertenecer preferiblemente al mismo lote de proveedor. El sistema alerta cuando se mezclan lotes — el riesgo es que la prenda terminada tenga piezas de tonos diferentes, lo que genera devoluciones del cliente.

### 9.4 KPIs habilitados

- Cumplimiento del proveedor (cantidad y fecha prometida vs. real).
- Diferencia OC vs. recepción real.
- Lead time real de compras.

---

## 10. Fase 3 — Trazo

**Responsable:** Jefe de trazado | **Software externo:** MasterMind

### 10.1 Insumos del proceso

Para planificar el trazo, el sistema analiza:

- La OPD (qué producir, en qué tallas y cantidades).
- Los rollos de tela disponibles con sus atributos físicos.
- La agrupación de rollos por lote de proveedor.
- El patrón CAD del SKU modelo.

### 10.2 Archivo de cargue para MasterMind

El MES puede generar opcionalmente el **archivo de cargue masivo** para MasterMind. Debe contener:

- Información completa por OPD (puede incluir múltiples OPs en un archivo).
- Telas vinculadas por SKU — pueden ser varias en prendas multicomponente (chaquetas, prendas multicolor).
- Cantidades por talla.
- Atributos físicos por tela o conexión directa a la base de datos de inventario del MES.

---

## 11. Fase 4 — Corte

**Responsable:** Jefe de corte | **Equipos:** Máquina Morgan o mesa manual

### 11.1 Preparación

El sistema indica al encargado de inventario MP los rollos que debe alistar (en paralelo o previo al corte).

### 11.2 Tendido

El jefe de corte registra:

- **Tela consumida** en el tendido → descuenta del inventario por rollo específico.
- **Tela devuelta** → remanentes que regresan al inventario disponible.

### 11.3 Corte

| Campo | Descripción |
|---|---|
| Fecha y hora de inicio | Para seguimiento de lead time |
| Fecha y hora de fin | Duración real |
| Resultado | `completo` \| `parcial` |
| Motivo (si parcial) | Descripción de la causa |

---

## 12. Fase 5 — Tiqueteo y paqueteo

**Responsable:** Jefe de trazado / jefe de corte

### 12.1 Proceso

Cada pieza cortada se etiqueta manualmente con:

- **Número de paquete**
- **Talla**
- **Serial o secuencia de capa**

### 12.2 Por qué la secuencia de capa es crítica

Durante el tendido, las múltiples capas de tela superpuestas pueden tener ligeras variaciones de tono entre sí. La secuencia garantiza que en confección se unan piezas de la **misma capa** (mismo tono), ensamblando la prenda sin diferencias de tonalidad visibles.

> Sin secuencia de capa → riesgo de devoluciones por diferencias de tono entre piezas de la misma prenda.

### 12.3 Salida

Paquetes físicos completamente identificados, listos para el siguiente proceso según la ficha técnica (marcación o confección directa).

---

## 13. Fase 6 — Marcación (opcional)

**Responsable:** Líder de fabricación / coordinador de satélites

Fase opcional. No todas las prendas tienen marcación. Se determina según la ficha técnica del SKU modelo.

### 13.1 Tipos de marcación

| Tipo | Descripción |
|---|---|
| Bordado | Diseño cosido sobre la tela |
| Estampado | Diseño impreso sobre la tela |
| Sublimación | Diseño transferido por calor |

### 13.2 Distribución por Orden de Servicio (OS)

Los paquetes a marcar se distribuyen en **Órdenes de Servicio (OS)**:

- Cada OS va a un satélite de marcación específico.
- Un proceso de marcación puede repartirse entre múltiples satélites.
- La OS funciona como **remisión física** al satélite — incluye precios acordados con el proveedor.

### 13.3 Retorno

Los paquetes marcados retornan y se juntan con el resto de partes e insumos del BOM para formar los paquetes de confección.

---

## 14. Fase 7 — Confección

**Responsable:** Líder de fabricación / coordinador de satélites

### 14.1 Alistamiento

Se generan paquetes por OS de confección, cada una asignada a un satélite. Cada paquete incluye piezas cortadas (con o sin marcación previa) e insumos adicionales del BOM (hilos, botones, cierres, etiquetas).

### 14.2 Asignación a satélites

El líder de fabricación decide considerando disponibilidad de capacidad, especialidad, factores económicos y compromisos. Un mismo proceso puede distribuirse entre múltiples satélites.

### 14.3 Módulo interno de Molt

El módulo interno de confección opera exactamente igual que un satélite externo — genera la misma entidad OS. La única diferencia es que el campo `es_interno = true` y no genera factura de cobro externo.

---

## 15. Gestión administrativa de satélites

**Responsable:** Líder de fabricación (en paralelo a los procesos físicos)

- Monitoreo de salidas de corte para anticipar la asignación.
- Negociación y confirmación de disponibilidad y precios.
- Creación de OS con precios acordados por servicio.
- Seguimiento de compromisos mediante bitácora de eventos de la OS.
- Gestión de novedades, retrasos y reprocesos.

**Bitácora de eventos de la OS** (no avance porcentual — la OS es caja negra):

| Tipo de evento | Descripción |
|---|---|
| `generacion` | OS creada en el sistema |
| `envio_fisico` | Paquetes enviados al satélite |
| `fecha_prometida_original` | Compromiso inicial del satélite |
| `cambio_fecha_prometida` | Modificación del compromiso |
| `retorno_real` | Retorno efectivo de PT |
| `novedad` | Incidencia registrada con causa y observación |

**Causas de novedad:** `error_interno` · `incumplimiento_satelite` · `fuerza_mayor` · `otro`

**KPIs habilitados:** cumplimiento de satélite, número de cambios de fecha por OS, lead time real por tipo de servicio y por satélite.

---

## 16. Fase 8 — Recepción de PT, empaque y calidad

**Responsable:** Área de logística e inventario

### 16.1 Recepción

Ingreso del PT retornado de satélites — conteo por SKU vinculado a la OS de origen, verificación vs. OS.

### 16.2 Empaque y calidad (simultáneo)

**Empaque:**
- Embolsado individual de cada prenda.
- Etiquetado con referencia y código de barras.

**Control de calidad:**
- Prendas defectuosas: se aíslan, se registra la novedad y se reporta al líder de producción para gestionar garantías con el satélite.
- El rechazo de calidad activa el flujo de reproceso (ver sección 19).

---

## 17. Fase 9 — Despacho

**Responsable:** Ejecutivo de cuenta / área de logística

### Modalidad 1 — Stock directo

El PT empaquetado se envía a inventario en stock para consumo futuro. Modalidades 2, 3 y 4 pueden consumir de este stock.

### Modalidad 2 — Cross docking

1. El ejecutivo de cuenta o el sistema recibe las órdenes de despacho del cliente a N sedes destino.
2. Los productos se agrupan en cajas de envío.
3. Se genera una **remisión de despacho** por cada sede destino.

### Modalidad 3 — Envío personalizado

Servicio donde el cliente provee la asignación de dotación por colaborador:

1. El ejecutivo de cuenta carga el archivo del cliente al MES.
2. El MES normaliza el archivo al formato canónico: colaborador + sede + cargo + tallas.
3. Se derivan automáticamente la dirección exacta (por sede) y las referencias con tallas (por cargo, según la tabla `cargo_referencia` del cliente).
4. Los errores de normalización se presentan para corrección antes de aprobar.
5. Se arman kits individuales por colaborador y se despachan como en la modalidad 2.

### Modalidad 4 — Envío de reacción

Modelo de suministro continuo bajo acuerdo marco con el cliente:

- Toda producción sigue anclada a una OP/OPD original.
- El PT producido entra a stock.
- El cliente envía **solicitudes de reposición** continuas según sus necesidades de ingreso, rotación o inventario.
- Cada solicitud se registra en el MES como `solicitud_cliente`, se despacha desde stock y genera una remisión.
- Las solicitudes se acumulan por ciclos de facturación acordados para generar la OC del cliente y/o la factura.

---

## 18. Fase 10 — Facturación

**Responsables:** Ejecutivo de cuenta + Contabilidad

### 18.1 Facturación al cliente

La factura formal se emite en **Siigo**. El MES consolida las remisiones despachadas y registra la referencia a la factura de Siigo.

El esquema de facturación varía por cliente:

| Esquema | Flujo |
|---|---|
| `molt_emite_directa` | MES consolida remisiones → ejecutivo emite factura en Siigo. Sin OC del cliente. |
| `molt_emite_con_oc_cliente` | Cliente envía OC → MES la registra y cruza con remisiones → ejecutivo emite factura referenciando la OC. |
| `resumen_y_oc_cliente` | MES genera resumen de remisiones → se envía al cliente → cliente emite OC → MES la registra → factura en Siigo. |

### 18.2 Facturas de satélites (en paralelo)

Los satélites emiten facturas y cuentas de cobro por cada OS ejecutada. Contabilidad las gestiona cruzando con los precios acordados registrados en la OS.

---

## 19. Reprocesos por satélite

**Responsable:** Líder de fabricación

Cuando un satélite genera daños en piezas cortadas, insumos o prendas terminadas, se activa el flujo de reproceso. El costo es cobrado al satélite responsable.

### 19.1 Flujo

```
1. Detección del daño (en satélite o al recibir PT)
        ↓
2. Registro de novedad en el MES — vinculado a la OS original
        ↓
3. Generación de orden de reposición
        ↓
4a. Reposición de piezas          4b. Reposición de insumos
    → Reactivar corte parcial         → Alistamiento de insumos
    → Alistamiento de piezas          → Envío al satélite
    → Envío al satélite
        ↓
5. Cierre del reproceso — costo calculado para cobrar al satélite
```

### 19.2 Datos registrados

| Campo | Descripción |
|---|---|
| OS origen | A qué OS está vinculado el daño |
| Tipo de daño | `pieza_cortada` · `insumo` · `prenda_terminada` |
| Descripción | Detalle de la novedad |
| Piezas / insumos a reponer | Qué y cuánto debe reponerse |
| Costo del reproceso | Monto a cobrar al satélite |
| Estado | `reportado` → `en_reposicion` → `cerrado_cobrado` |

---

## 20. Esquemas de tercerización

| Esquema | MP e insumos | Corte | Marcación | Confección |
|---|---|---|---|---|
| **Confección en satélite** | Molt | Molt | Molt | Satélite externo |
| **Marcación + confección externas** | Molt | Molt | Satélite | Satélite |
| **Servicio completo** | Molt provee MP | Satélite | Satélite (opcional) | Satélite |
| **Confección interna** | Molt | Molt | Molt | Módulo interno Molt |

**Servicio completo:** las fases 4 (corte), 5 (tiqueteo) y 6 (marcación) ocurren en el satélite. El coordinador registra en el MES los cierres equivalentes de esas fases.

---

## 21. Canal Panamá

La sede Panamá opera como **cliente interno** de Molt Colombia:

- Molt Colombia produce y factura a la sede Panamá en COP.
- Panamá factura a sus clientes internacionales en **USD**.
- Riesgo financiero: cualquier movimiento de TRM entre la cotización y el cobro afecta directamente el margen real.

**Costos adicionales del canal Panamá:** flete internacional (aéreo o marítimo), aduanas y aranceles en Colombia y Panamá, agente de aduana, operación de sede (personal, arriendo). Costos ocultos: diferencial cambiario USD/COP, flete urgente por reproceso internacional, demoras en aduana.

---

## 22. Costos ocultos identificados

Los siguientes costos existen y son reales, pero hoy no se asignan a ningún proyecto ni aparecen en ninguna cotización. El MES habilita su visibilidad:

| # | Costo oculto | Fase donde se origina |
|---|---|---|
| 1 | Tiempo de diseño y muestras en proyectos no cerrados | Diseño |
| 2 | Horas extra y dominicales por reprocesos no presupuestados | Corte, confección |
| 3 | Mensajeros express de urgencia fuera de ruta | Logística |
| 4 | Recompras urgentes de MP por errores de cantidad o calidad | Compras |
| 5 | Reprocesos en satélites (correcciones, reenvíos, prendas rehecha) | OS |
| 6 | Costo financiero del ciclo productivo (90–120 días de capital financiado) | Finanzas |
| 7 | Arrendamiento de bodega de PT para clientes con stock | Bodega |
| 8 | Administración de inventario y envío personalizado por colaborador | Despacho |
| 9 | Diferencial cambiario en importaciones y facturación Panamá | Compras / Panamá |
| 10 | Depreciación real de maquinaria (Morgan, máquinas de coser) | Corte, confección |
| 11 | Ineficiencias por limitaciones de IMPEL (reprocesos manuales, falta de trazabilidad) | Transversal |

---

## Parte III — Modelo de datos

---

## 23. Entidades maestras — origen IMPEL

Solo lectura desde el MES. Se importan vía pipeline ETL cuando la OP pasa a "en producción".

### sku_modelo

| Campo | Tipo | Descripción |
|---|---|---|
| `id_sku_modelo` | PK | Identificador único del diseño |
| `referencia` | varchar | Código comercial del modelo |
| `nombre` | varchar | Nombre descriptivo |
| `ficha_tecnica_url` | varchar | Enlace a ficha técnica |
| `patron_cad_url` | varchar | Archivo CAD para trazado |
| `estado` | enum | `activo` · `descontinuado` · `en_desarrollo` |

### sku

| Campo | Tipo | Descripción |
|---|---|---|
| `id_sku` | PK | Identificador único de la variante |
| `id_sku_modelo` | FK | Modelo padre |
| `talla` | varchar | Talla específica |
| `color` | varchar | Color o variante |
| `codigo_barras` | varchar | Para etiquetado de PT |

### insumo_mp

| Campo | Tipo | Descripción |
|---|---|---|
| `id_insumo` | PK | Identificador único |
| `tipo` | enum | `tela` · `avio` · `insumo_marcacion` · `otro` |
| `referencia` | varchar | Código de la referencia genérica |
| `unidad_medida` | enum | `metro` · `kg` · `unidad` · `litro` |
| `es_textil` | bool | Si `true`, requiere captura de atributos por rollo |

### bom

| Campo | Tipo | Descripción |
|---|---|---|
| `id_bom` | PK | Identificador |
| `id_sku_modelo` | FK | Modelo al que aplica |
| `id_insumo` | FK nullable | Insumo físico (si aplica) |
| `tipo_servicio` | enum nullable | `corte` · `bordado` · `estampado` · `sublimado` · `confeccion` |
| `cantidad_por_unidad` | decimal | Cantidad de insumo o servicio por prenda |
| `unidad` | varchar | Unidad de medida |

### costeo / costeo_detalle

| Campo | Tipo | Descripción |
|---|---|---|
| `id_costeo` | PK | Cabecera del costeo |
| `id_cliente` | FK | Cliente |
| `fecha_costeo` | date | Fecha de generación |
| `id_costeo_detalle` | PK | Detalle por SKU modelo |
| `id_sku_modelo` | FK | SKU costeado |
| `costo_unitario_estimado` | decimal | Costo proyectado por prenda |

### op — Orden de Producción

| Campo | Tipo | Descripción |
|---|---|---|
| `id_op` | PK | Identificador único |
| `id_cliente` | FK | Cliente |
| `fecha_creacion` | date | Generación en IMPEL |
| `fecha_entrega_pactada` | date | Compromiso con el cliente |
| `modelo_demanda` | enum | `MTO` · `MTS` · `stock_minimo` · `masiva` |
| `estado` | enum | `borrador` · `validada` · `en_produccion` · `cerrada` |
| `fecha_paso_a_produccion` | datetime | Trigger de extracción para el MES |

### opd — Orden de Producción Detalle

| Campo | Tipo | Descripción |
|---|---|---|
| `id_opd` | PK | Identificador único |
| `id_op` | FK | OP cabecera |
| `id_sku` | FK | SKU específico (variante por talla) |
| `cantidad` | int | Unidades a producir |
| `ficha_tecnica_url` | varchar | Ficha técnica del modelo |

---

## 24. Entidades maestras — configurables en el MES

Administradas por el equipo de Molt en el propio MES.

### satelite

| Campo | Tipo | Descripción |
|---|---|---|
| `id_satelite` | PK | Identificador |
| `nombre` | varchar | Nombre del aliado de maquila |
| `tipo_capacidad` | enum múltiple | `corte` · `marcacion` · `confeccion` · `servicio_completo` |
| `capacidad_prendas_dia` | int | Capacidad declarada |
| `tarifa_base` | decimal | Tarifa de referencia (puede variar por OS) |
| `es_interno` | bool | `true` para el módulo interno de Molt |
| `propietario` | varchar | `"Molt SAS"` si es interno |
| `estado` | enum | `activo` · `inactivo` · `suspendido` |

### cliente

| Campo | Tipo | Descripción |
|---|---|---|
| `id_cliente` | FK (de IMPEL) | Identificador |
| `nombre` | varchar | Razón social |
| `esquema_facturacion` | enum | `molt_emite_directa` · `molt_emite_con_oc_cliente` · `resumen_y_oc_cliente` |

### sede_cliente

| Campo | Tipo | Descripción |
|---|---|---|
| `id_sede` | PK | Identificador |
| `id_cliente` | FK | Cliente |
| `nombre_sede` | varchar | Nombre o ciudad |
| `direccion` | varchar | Dirección exacta de entrega |
| `ciudad` | varchar | Ciudad |
| `operador_logistico_preferido` | varchar nullable | Transportador habitual |

### cargo_referencia

| Campo | Tipo | Descripción |
|---|---|---|
| `id_cargo_ref` | PK | Identificador |
| `id_cliente` | FK | Cliente |
| `cargo` | varchar | Nombre del cargo |
| `id_sku` | FK | SKU asignado a ese cargo |
| `cantidad` | int | Unidades por persona |

---

## 25. Entidades transaccionales — generadas por el MES

### oc_seguimiento — seguimiento de OC en Siigo

| Campo | Tipo | Descripción |
|---|---|---|
| `id_oc_seg` | PK | Identificador en el MES |
| `id_opd` | FK | OPD que dispara el requerimiento |
| `id_insumo` | FK | Insumo requerido del BOM |
| `cantidad_requerida` | decimal | Calculada por explosión de BOM |
| `cantidad_homologada` | decimal nullable | Si hubo homologación |
| `id_insumo_homologado` | FK nullable | Insumo sustituto |
| `numero_oc_siigo` | varchar | Referencia a OC en Siigo |
| `fecha_estimada_llegada` | date | Compromiso del proveedor |
| `estado` | enum | `calculada` · `tramitada` · `parcial` · `recibida_total` |

### orden_espera

| Campo | Tipo | Descripción |
|---|---|---|
| `id_orden_espera` | PK | Identificador |
| `id_oc_seg` | FK | OC de la que proviene |
| `fecha_estimada` | date | Llegada proyectada |
| `cantidad_recibida_acumulada` | decimal | Suma de recepciones parciales |
| `cantidad_excedente` | decimal nullable | Recibido por encima de lo ordenado |
| `estado` | enum | `pendiente` · `parcial_pendiente` · `excedente` · `completa` · `cancelada` |

### recepcion

| Campo | Tipo | Descripción |
|---|---|---|
| `id_recepcion` | PK | Identificador |
| `id_orden_espera` | FK | Orden que se está cumpliendo |
| `id_insumo` | FK | Insumo recibido |
| `cantidad_recibida` | decimal | Cantidad efectiva |
| `fecha_recepcion` | datetime | Para cálculo de lead time real |
| `responsable` | FK usuario | Quién registra |
| `novedad` | text nullable | Faltantes, defectos, diferencias |

### rollo_tela — atributos físicos por rollo

| Campo | Tipo | Descripción |
|---|---|---|
| `id_rollo` | PK | Identificador único del rollo físico |
| `id_recepcion` | FK | Recepción de la que proviene |
| `id_insumo` | FK | Insumo (tipo = tela) |
| `ancho_util_cm` | decimal | Ancho útil real |
| `largo_o_peso` | decimal | Largo en metros o peso en kg |
| `lote_proveedor` | varchar | Lote externo — clave de homogeneidad |
| `estado` | enum | `disponible` · `reservado` · `consumido` · `devuelto` |

### orden_trazo

| Campo | Tipo | Descripción |
|---|---|---|
| `id_orden_trazo` | PK | Identificador |
| `id_opd` | FK | OPD a trazar |
| `id_rollo` | FK múltiple | Rollos asignados (preferiblemente mismo lote) |
| `cantidades_por_talla` | json | Distribución de tallas en el trazo |
| `archivo_mastermind_url` | varchar nullable | Archivo de cargue generado |
| `estado` | enum | `planeada` · `cargada_mastermind` · `cortada` · `cancelada` |

### corte

| Campo | Tipo | Descripción |
|---|---|---|
| `id_corte` | PK | Identificador |
| `id_orden_trazo` | FK | Orden de trazo origen |
| `tela_consumida` | decimal | Cantidad efectiva consumida |
| `tela_devuelta` | decimal | Cantidad devuelta a inventario |
| `fecha_inicio` | datetime | Inicio de corte |
| `fecha_fin` | datetime | Fin de corte |
| `metodo` | enum | `manual` · `maquina_morgan` |
| `resultado` | enum | `completo` · `parcial` |
| `motivo_parcial` | text nullable | Si resultado = parcial |

### paquete

| Campo | Tipo | Descripción |
|---|---|---|
| `id_paquete` | PK | Identificador único del paquete físico |
| `id_corte` | FK | Corte origen |
| `id_opd` | FK | OPD asociada |
| `talla` | varchar | Talla del paquete |
| `secuencia_capa` | int | Número de capa — preserva homogeneidad de tono |
| `cantidad_piezas` | int | Piezas en el paquete |
| `proximo_proceso` | enum | `marcacion` · `confeccion` |

### os — Orden de Servicio

| Campo | Tipo | Descripción |
|---|---|---|
| `id_os` | PK | Identificador |
| `id_satelite` | FK | Satélite asignado (interno o externo) |
| `tipo_servicio` | enum | `marcacion` · `confeccion` · `servicio_completo` |
| `paquetes_incluidos` | FK múltiple | Lista de paquetes asignados |
| `precio_acordado` | decimal | Tarifa acordada para esta OS |
| `fecha_generacion` | datetime | Creación de la OS |
| `fecha_envio_fisico` | datetime | Salida física hacia el satélite |
| `fecha_prometida` | date | Compromiso del satélite |
| `fecha_retorno_real` | datetime nullable | Retorno efectivo |
| `estado` | enum | `creada` · `enviada` · `en_proceso` · `retornada` · `cerrada` |
| `es_servicio_completo` | bool | El satélite hace corte + marcación + confección |

### os_evento — bitácora de la OS

| Campo | Tipo | Descripción |
|---|---|---|
| `id_evento` | PK | Identificador |
| `id_os` | FK | OS a la que pertenece |
| `tipo_evento` | enum | `generacion` · `envio_fisico` · `fecha_prometida_original` · `cambio_fecha_prometida` · `retorno_real` · `novedad` |
| `fecha_evento` | datetime | Cuándo ocurrió |
| `causa` | enum nullable | `error_interno` · `incumplimiento_satelite` · `fuerza_mayor` · `otro` |
| `observacion` | text nullable | Detalle libre |
| `registrado_por` | FK usuario | Quien registra |

### reproceso_satelite

| Campo | Tipo | Descripción |
|---|---|---|
| `id_reproceso` | PK | Identificador |
| `id_os` | FK | OS original |
| `tipo_dano` | enum | `pieza_cortada` · `insumo` · `prenda_terminada` |
| `descripcion` | text | Detalle de la novedad |
| `piezas_a_reponer` | json | Qué y cuánto debe reponerse |
| `costo_estimado` | decimal | Costo a cobrar al satélite |
| `estado` | enum | `reportado` · `en_reposicion` · `cerrado_cobrado` |
| `responsable` | FK usuario | Líder de fabricación |

### pt_recepcion

| Campo | Tipo | Descripción |
|---|---|---|
| `id_pt_recepcion` | PK | Identificador |
| `id_os` | FK | OS de la que retorna el PT |
| `id_sku` | FK | SKU recibido |
| `cantidad_recibida` | int | Prendas recibidas |
| `cantidad_aprobada` | int | Pasaron empaque y calidad |
| `cantidad_rechazada` | int | Aisladas para gestión de garantía |
| `fecha_recepcion` | datetime | Para cálculo de lead time del satélite |

### stock_pt

| Campo | Tipo | Descripción |
|---|---|---|
| `id_stock` | PK | Identificador |
| `id_sku` | FK | SKU |
| `cantidad_disponible` | int | Stock disponible |
| `cantidad_reservada` | int | Reservada para despacho |
| `id_cliente_propietario` | FK nullable | Si es stock administrado por cliente |

### solicitud_cliente — ancla del envío de reacción

| Campo | Tipo | Descripción |
|---|---|---|
| `id_solicitud` | PK | Identificador |
| `id_cliente` | FK | Cliente que solicita |
| `fecha_solicitud` | datetime | Recepción de la solicitud |
| `canal_entrada` | enum | `email` · `portal` · `whatsapp` · `manual` |
| `estado` | enum | `recibida` · `en_preparacion` · `despachada` · `facturada` |
| `referencia_externa` | varchar nullable | Número de referencia del cliente |

### solicitud_cliente_det

| Campo | Tipo | Descripción |
|---|---|---|
| `id_solicitud_det` | PK | Identificador del detalle |
| `id_solicitud` | FK | Solicitud cabecera |
| `id_sku` | FK | SKU solicitado |
| `cantidad` | int | Unidades solicitadas |
| `cantidad_despachada` | int | Efectivamente enviada |

### cargue_kit — importación de archivo de envío personalizado

| Campo | Tipo | Descripción |
|---|---|---|
| `id_cargue` | PK | Identificador del cargue |
| `id_op` | FK | OP a la que corresponde |
| `id_cliente` | FK | Cliente |
| `fecha_cargue` | datetime | Cuándo fue cargado |
| `archivo_original_url` | varchar | Archivo fuente del cliente |
| `estado` | enum | `cargado` · `normalizado` · `con_errores` · `aprobado` |
| `responsable` | FK usuario | Ejecutivo de cuenta |

### kit_colaborador

| Campo | Tipo | Descripción |
|---|---|---|
| `id_kit` | PK | Identificador |
| `id_cargue` | FK | Cargue origen |
| `nombre_colaborador` | varchar | Nombre completo |
| `cargo` | varchar | Cargo |
| `id_sede_destino` | FK | Sede derivada del lugar/ciudad |
| `direccion_exacta` | varchar | Dirección específica de entrega |

### kit_colaborador_det

| Campo | Tipo | Descripción |
|---|---|---|
| `id_kit_det` | PK | Identificador |
| `id_kit` | FK | Colaborador |
| `id_sku` | FK | SKU = referencia + talla |
| `cantidad` | int | Unidades (generalmente 1) |

### remision_despacho

| Campo | Tipo | Descripción |
|---|---|---|
| `id_remision` | PK | Identificador |
| `id_op` | FK nullable | OP origen (null si es envío de reacción) |
| `id_solicitud` | FK nullable | Solicitud origen (envío de reacción) |
| `tipo_despacho` | enum | `stock_directo` · `cross_docking` · `envio_personalizado` · `envio_reaccion` |
| `destino` | varchar | Sede o dirección |
| `id_sede_cliente` | FK nullable | Sede del cliente |
| `es_kit_personalizado` | bool | True si es por colaborador |
| `operador_logistico` | varchar | Envía, Coordinadora, TCC, flota propia |
| `numero_guia` | varchar | Guía del operador |
| `fecha_despacho` | datetime | Salida efectiva |

### oc_cliente — OC emitida por el cliente (cuando aplica)

| Campo | Tipo | Descripción |
|---|---|---|
| `id_oc_cliente` | PK | Identificador |
| `id_cliente` | FK | Cliente |
| `numero_oc_cliente` | varchar | Número de OC emitida por el cliente |
| `fecha_recepcion` | datetime | Cuando Molt la recibe |
| `valor_total` | decimal | Valor según OC del cliente |
| `estado` | enum | `recibida` · `en_revision` · `aprobada` · `facturada` |

### factura_cliente

| Campo | Tipo | Descripción |
|---|---|---|
| `id_factura` | PK | Identificador en el MES |
| `id_remisiones` | FK múltiple | Remisiones agrupadas |
| `id_oc_cliente` | FK nullable | OC del cliente si aplica por esquema |
| `id_cliente` | FK | Cliente |
| `numero_factura_siigo` | varchar | Referencia a factura en Siigo |
| `responsable_ejecutivo` | FK usuario | Ejecutivo de cuenta |
| `fecha_facturacion` | datetime | Fecha de emisión |

---

## 26. Reglas de negocio críticas

### RN-01 — Trazabilidad de lote de tela
Todos los rollos asignados a una orden de trazo deben preferiblemente compartir el mismo lote de proveedor. Si no es posible, el sistema alerta y registra el riesgo de variación de tono.

### RN-02 — Secuencia de capa obligatoria en tiqueteo
La secuencia de capa es obligatoria al generar paquetes. Las piezas que terminarán en la misma prenda deben unirse por capa para garantizar homogeneidad de tono. Sin secuencia de capa, no se puede emitir el paquete al siguiente proceso.

### RN-03 — Homologación de insumos
La homologación aplica sobre el BOM efectivo de la OPD. Nunca modifica el BOM maestro del SKU modelo.

### RN-04 — Recepción parcial y excedente
La orden de espera permanece abierta hasta completarse o cancelarse. Toda diferencia (faltante o excedente) genera notificación automática a compras.

### RN-05 — Módulo interno = satélite propio
El módulo interno de Molt opera con la misma entidad `os` y el mismo flujo. La diferencia es `es_interno = true` y ausencia de factura de cobro externo.

### RN-06 — Reprocesos por satélite deben cobrarse
El registro en el MES es la fuente de trazabilidad para el cobro al satélite responsable. El reproceso solo se puede cerrar cuando el costo ha sido documentado.

### RN-07 — Envío de reacción siempre anclado a OP/OPD
Toda producción va anclada a una OP. El envío de reacción consume stock ya producido. Las remisiones de este tipo se anclan a `solicitud_cliente`, no directamente a la OP.

### RN-08 — Kit personalizado requiere normalización aprobada
El archivo del cliente debe pasar por normalización y aprobación del ejecutivo de cuenta antes de poder generar los kits. Los errores de mapeo (talla no reconocida, sede no mapeada, cargo sin referencia) bloquean la aprobación.

### RN-09 — Esquema de facturación por cliente
El esquema de facturación es un atributo del maestro de clientes. Determina si se requiere OC del cliente para facturar y el flujo de cierre del ciclo.

### RN-10 — OS como caja negra con bitácora
La OS no registra avance porcentual interno del satélite. El seguimiento se hace mediante la bitácora de eventos (`os_evento`) con causas tipificadas para habilitir KPIs de cumplimiento.

---

## 27. Inventario completo de entidades

### Entidades maestras — origen IMPEL (7)

| Entidad | Descripción |
|---|---|
| `sku_modelo` | Diseño padre del SKU |
| `sku` | Variante por talla/color |
| `insumo_mp` | Insumos y materias primas codificadas |
| `bom` | Bill of Materials por SKU modelo |
| `costeo / costeo_detalle` | Costeo previo a la OP |
| `op` | Orden de producción cabecera |
| `opd` | Orden de producción detalle por SKU |

### Entidades maestras — configurables en el MES (4)

| Entidad | Descripción |
|---|---|
| `satelite` | Aliados de maquila + módulo interno |
| `cliente` | Clientes con esquema de facturación |
| `sede_cliente` | Sedes de destino por cliente |
| `cargo_referencia` | Referencias por cargo por cliente |

### Entidades transaccionales — generadas por el MES (21)

| Entidad | Fase | Descripción |
|---|---|---|
| `oc_seguimiento` | 1 | Seguimiento de OC tramitada en Siigo |
| `orden_espera` | 1→2 | Cola de mercancía esperada |
| `recepcion` | 2 | Recepción física de insumos y MP |
| `rollo_tela` | 2 | Atributos físicos por rollo (ancho, largo, lote) |
| `orden_trazo` | 3 | Planificación de trazo por OPD |
| `corte` | 4 | Registro de tendido y corte |
| `paquete` | 5 | Paquetes de piezas con secuencia de capa |
| `os` | 6/7 | Orden de servicio a satélite |
| `os_evento` | 6/7 | Bitácora de eventos de la OS |
| `reproceso_satelite` | 6/7 | Daños y reposición a cargo del satélite |
| `pt_recepcion` | 8 | Recepción de producto terminado |
| `stock_pt` | 8→9 | Inventario de producto terminado |
| `solicitud_cliente` | 9 | Solicitudes de reposición para envío de reacción |
| `solicitud_cliente_det` | 9 | Detalle por SKU de la solicitud |
| `cargue_kit` | 9 | Cargue de archivo de envío personalizado |
| `kit_colaborador` | 9 | Colaborador normalizado con sede y cargo |
| `kit_colaborador_det` | 9 | Referencias y tallas por colaborador |
| `remision_despacho` | 9 | Remisión de envío por destino |
| `oc_cliente` | 10 | OC emitida por el cliente cuando aplica |
| `factura_cliente` | 10 | Referencia a factura emitida en Siigo |

**Total: 32 entidades** (7 maestras IMPEL + 4 maestras MES + 21 transaccionales)

---

## 28. Bloques de RF desbloqueados

Con el modelo completo, todos los bloques de RF pueden redactarse:

| Bloque | RF | Entidades principales |
|---|---|---|
| **RF-ETL** | Extracción desde IMPEL | `op` `opd` `sku` `bom` `costeo` |
| **RF-COM** | Compras: cálculo BOM, registro OC, homologación, orden espera | `oc_seguimiento` `orden_espera` |
| **RF-REC** | Recepción de insumos y MP con parciales y excedentes | `recepcion` `rollo_tela` `orden_espera` |
| **RF-TRZ** | Trazo: orden de trazo, agrupación por lote, archivo MasterMind | `orden_trazo` `rollo_tela` `sku_modelo` |
| **RF-COR** | Corte: tendido, consumo MP, resultado, tiempos | `corte` `stock_mp` |
| **RF-TIQ** | Tiqueteo: paquetes con secuencia de capa | `paquete` |
| **RF-OS** | Órdenes de servicio (satélites internos y externos) | `os` `os_evento` `satelite` |
| **RF-REP** | Reprocesos por satélite: registro, reposición, cobro | `reproceso_satelite` |
| **RF-PT** | Recepción de PT, empaque y calidad | `pt_recepcion` `stock_pt` |
| **RF-DES** | Despacho en 4 modalidades | `remision_despacho` `solicitud_cliente` `kit_colaborador` |
| **RF-KIT** | Importación y normalización de archivo de kit personalizado | `cargue_kit` `kit_colaborador` `cargo_referencia` `sede_cliente` |
| **RF-FAC** | Facturación al cliente según esquema acordado | `factura_cliente` `oc_cliente` |

---

*Molt SAS · Contexto operativo y modelo de datos · MES TPS · Documento de referencia v3.0 · 2026*
