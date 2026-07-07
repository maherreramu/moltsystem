# MoltSistem — Frontend Next.js

Sistema de seguimiento operativo de producción para **Molt SAS**.

## Stack

- **Next.js 16.2.6** (App Router + Turbopack)
- **Supabase** — base de datos Postgres + Auth + Realtime
- **Tailwind CSS** + shadcn/ui
- **@tanstack/react-table** — tablas con filtros y sort
- **@dnd-kit/core** — drag-and-drop en el Kanban

## Desarrollo local

```bash
# Instalar dependencias
npm install

# Dev server (http://localhost:3000)
npm run dev

# Build de producción
npm run build

# Verificar tipos
npm run typecheck

# Linting
npm run lint
```

## Variables de entorno

Copiar desde la raíz del repo:

```bash
cp ../.env.example .env.local
# Editar .env.local con las credenciales reales
```

Variables requeridas:

```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SECRET_KEY=
REVALIDATE_SECRET=
```

## Estructura

```
app/
  app/
    (dashboard)/     # Páginas con layout de dashboard
      produccion/    # Kanban + Gantt + Tabla
      ops/           # OPs agregadas
      clientes/      # Caracterización de clientes
      mi-fase/       # Vista por líder
      admin/         # Gestión de usuarios (solo admin)
      ...
    login/           # Login (Azure AD / magic link / contraseña)
    acceso-pendiente/ # Usuarios no autorizados
    auth/callback/   # Callback OAuth
  components/        # Componentes reutilizables
  lib/
    actions/         # Server Actions (mutaciones)
    queries/         # Server-side data fetching
    supabase/        # Clientes Supabase (server, client, middleware)
    format.ts        # Formatters (fmtNum, fmtRangoSemana, etc.)
    score-pesos.ts   # Constantes del score de priorización
  types/             # Tipos autogenerados de Supabase
```

## Notas importantes (Next.js 16)

- El archivo de middleware es `proxy.ts`, no `middleware.ts`
- `updateTag()` en Server Actions (no `revalidateTag`)
- `revalidateTag(tag, "max")` en Route Handlers
- `unstable_cache` no permite `cookies()` internamente

Ver `../CLAUDE.md` para convenciones completas del proyecto.
