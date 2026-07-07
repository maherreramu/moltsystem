# Graph Report - .  (2026-06-10)

## Corpus Check
- cluster-only mode — file stats not available

## Summary
- 488 nodes · 994 edges · 30 communities (25 shown, 5 thin omitted)
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `f47531cf`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- [[_COMMUNITY_Community 0|Community 0]]
- [[_COMMUNITY_Community 1|Community 1]]
- [[_COMMUNITY_Community 2|Community 2]]
- [[_COMMUNITY_Community 3|Community 3]]
- [[_COMMUNITY_Community 4|Community 4]]
- [[_COMMUNITY_Community 5|Community 5]]
- [[_COMMUNITY_Community 6|Community 6]]
- [[_COMMUNITY_Community 7|Community 7]]
- [[_COMMUNITY_Community 8|Community 8]]
- [[_COMMUNITY_Community 9|Community 9]]
- [[_COMMUNITY_Community 10|Community 10]]
- [[_COMMUNITY_Community 11|Community 11]]
- [[_COMMUNITY_Community 12|Community 12]]
- [[_COMMUNITY_Community 13|Community 13]]
- [[_COMMUNITY_Community 14|Community 14]]
- [[_COMMUNITY_Community 15|Community 15]]
- [[_COMMUNITY_Community 16|Community 16]]
- [[_COMMUNITY_Community 17|Community 17]]
- [[_COMMUNITY_Community 18|Community 18]]
- [[_COMMUNITY_Community 19|Community 19]]
- [[_COMMUNITY_Community 20|Community 20]]
- [[_COMMUNITY_Community 21|Community 21]]
- [[_COMMUNITY_Community 22|Community 22]]
- [[_COMMUNITY_Community 23|Community 23]]
- [[_COMMUNITY_Community 25|Community 25]]
- [[_COMMUNITY_Community 26|Community 26]]
- [[_COMMUNITY_Community 29|Community 29]]

## God Nodes (most connected - your core abstractions)
1. `createServiceClient()` - 41 edges
2. `cn()` - 33 edges
3. `Enums` - 28 edges
4. `createClient()` - 21 edges
5. `getSbChecked()` - 16 edges
6. `FASE_LABEL` - 16 edges
7. `compilerOptions` - 16 edges
8. `run()` - 12 edges
9. `FASES_ORDEN` - 11 edges
10. `OPDDetailDrawer()` - 10 edges

## Surprising Connections (you probably didn't know these)
- `Python ETL Scripts` --calls--> `Supabase (Postgres 15)`  [EXTRACTED]
  scripts/20_load_to_supabase.py → docs/ARQUITECTURA.md
- `Python ETL Scripts` --references--> `IMPEL Legacy System`  [EXTRACTED]
  scripts/20_load_to_supabase.py → context/05_modelo_datos_borrador_v3_1.md
- `ActividadPage()` --calls--> `createServiceClient()`  [EXTRACTED]
  app/app/(dashboard)/actividad/page.tsx → app/lib/supabase/server.ts
- `OPsPage()` --calls--> `createServiceClient()`  [EXTRACTED]
  app/app/(dashboard)/ops/page.tsx → app/lib/supabase/server.ts
- `run()` --calls--> `get_client()`  [EXTRACTED]
  scripts/20_load_to_supabase.py → utils/supabase_client.py

## Import Cycles
- None detected.

## Communities (30 total, 5 thin omitted)

### Community 0 - "Community 0"
Cohesion: 0.08
Nodes (36): advancePendienteFase(), advancePhase(), advancePhaseParcial(), blockOpd(), closePendiente(), dailyCheck(), FASES_ORDEN, getActorEmail() (+28 more)

### Community 1 - "Community 1"
Cohesion: 0.05
Nodes (40): dependencies, @base-ui/react, class-variance-authority, clsx, date-fns, @dnd-kit/core, @dnd-kit/sortable, @dnd-kit/utilities (+32 more)

### Community 2 - "Community 2"
Cohesion: 0.10
Nodes (27): geist, inter, metadata, RootLayout(), cn(), Badge(), badgeVariants, Button() (+19 more)

### Community 3 - "Community 3"
Cohesion: 0.15
Nodes (26): assertIsAdmin(), FASES_ORDEN, fetchLeadTimesEstandar(), updateLeadTimeEstandar(), actualizarRolUsuario(), agregarUsuario(), aprobarUsuarioPendiente(), assertIsAdmin() (+18 more)

### Community 4 - "Community 4"
Cohesion: 0.14
Nodes (21): assertPuedeEditar(), crearClienteManual(), getActorEmail(), getSb(), homologarCliente(), invalidar(), reasignarClienteOp(), updateClienteCampo() (+13 more)

### Community 5 - "Community 5"
Cohesion: 0.11
Nodes (22): fetchPlanSemanaWeek(), RawFoco, OPDDetailDrawer(), DIAS, fmtDia(), fmtNum(), fmtRangoSemana(), getLunesDeOffset() (+14 more)

### Community 6 - "Community 6"
Cohesion: 0.12
Nodes (19): CapacidadGrid(), getLunesActualISO(), CapacidadPage(), ColaClient(), ColaPriorizada(), ColaPage(), JuntaClient(), JuntaPage() (+11 more)

### Community 7 - "Community 7"
Cohesion: 0.14
Nodes (25): Client, DataFrame, Path, build_categorias(), build_clientes(), build_clientes_impel(), build_op_ds(), build_ops() (+17 more)

### Community 8 - "Community 8"
Cohesion: 0.16
Nodes (14): CARGA_BG, Props, Bloqueo, CARGA_BG, Props, FASE_LABEL, FASES_ORDEN, Props (+6 more)

### Community 9 - "Community 9"
Cohesion: 0.09
Nodes (21): aliases, components, hooks, lib, ui, utils, iconLibrary, menuAccent (+13 more)

### Community 10 - "Community 10"
Cohesion: 0.10
Nodes (19): compilerOptions, allowJs, esModuleInterop, incremental, isolatedModules, jsx, lib, module (+11 more)

### Community 11 - "Community 11"
Cohesion: 0.19
Nodes (16): ProduccionPage(), GanttMeta, GanttRow, PhasePlan, RawPlan, buildGanttData(), buildKanbanData(), buildTablaData() (+8 more)

### Community 12 - "Community 12"
Cohesion: 0.15
Nodes (18): asignar_fase(), cargar_compras(), cargar_corte(), cargar_cuadro_corte(), cargar_impel(), cargar_marcaciones(), cargar_satelites(), main() (+10 more)

### Community 13 - "Community 13"
Cohesion: 0.14
Nodes (8): config, proxy(), NAV_ANALITICO, NAV_OPERATIVO, ROL_LABEL, createClient(), updateSession(), Database

### Community 14 - "Community 14"
Cohesion: 0.24
Nodes (9): Props, OPDTabla, OPDTable(), Props, Tabs(), TabsContent(), TabsList(), tabsListVariants (+1 more)

### Community 15 - "Community 15"
Cohesion: 0.19
Nodes (9): Filtros, KanbanBoard(), Props, SEMAFORO_BORDER, fetchKanbanData(), _fetchKanbanImpl(), KanbanData, OPDKanban (+1 more)

### Community 16 - "Community 16"
Cohesion: 0.24
Nodes (6): CRITERIOS, Props, OPDCard(), Props, COLOR, SemaforoDot()

### Community 17 - "Community 17"
Cohesion: 0.20
Nodes (8): FASE_COLOR, GanttChart(), Props, SEM_COLOR, ZOOM_BASE, ZOOM_LABELS, ZOOM_ORDER, ZoomLevel

### Community 18 - "Community 18"
Cohesion: 0.28
Nodes (6): ActividadClient(), TIPO_COLOR, TIPO_LABEL, TIPOS_FILTRO, ActividadPage(), EventoLog

### Community 19 - "Community 19"
Cohesion: 0.22
Nodes (8): CompositeTypes, Constants, DatabaseWithoutInternals, DefaultSchema, Json, Tables, TablesInsert, TablesUpdate

### Community 20 - "Community 20"
Cohesion: 0.33
Nodes (6): Azure AD SSO, Python ETL Scripts, IMPEL Legacy System, Metabase Analytics, Next.js 16.2.6 Frontend, Supabase (Postgres 15)

### Community 21 - "Community 21"
Cohesion: 0.40
Nodes (5): Table: op_ds, Table: ops, Table: phase_events, Function: recalc_pull, View: v_score

## Knowledge Gaps
- **160 isolated node(s):** `supabase`, `TIPO_LABEL`, `TIPO_COLOR`, `TIPOS_FILTRO`, `metadata` (+155 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **5 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `cn()` connect `Community 2` to `Community 14`?**
  _High betweenness centrality (0.057) - this node is a cross-community bridge._
- **Why does `createServiceClient()` connect `Community 3` to `Community 0`, `Community 4`, `Community 5`, `Community 6`, `Community 8`, `Community 11`, `Community 14`, `Community 15`, `Community 18`?**
  _High betweenness centrality (0.041) - this node is a cross-community bridge._
- **Why does `Enums` connect `Community 8` to `Community 0`, `Community 3`, `Community 5`, `Community 6`, `Community 11`, `Community 14`, `Community 15`, `Community 16`, `Community 17`, `Community 18`, `Community 19`?**
  _High betweenness centrality (0.036) - this node is a cross-community bridge._
- **What connects `supabase`, `TIPO_LABEL`, `TIPO_COLOR` to the rest of the system?**
  _176 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Community 0` be split into smaller, more focused modules?**
  _Cohesion score 0.07955596669750231 - nodes in this community are weakly interconnected._
- **Should `Community 1` be split into smaller, more focused modules?**
  _Cohesion score 0.04878048780487805 - nodes in this community are weakly interconnected._
- **Should `Community 2` be split into smaller, more focused modules?**
  _Cohesion score 0.09672830725462304 - nodes in this community are weakly interconnected._