export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      categorias_proc: {
        Row: {
          activa: boolean
          created_at: string | null
          id: string
          nombre: string
          updated_at: string | null
        }
        Insert: {
          activa?: boolean
          created_at?: string | null
          id?: string
          nombre: string
          updated_at?: string | null
        }
        Update: {
          activa?: boolean
          created_at?: string | null
          id?: string
          nombre?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      clientes: {
        Row: {
          canal: Database["public"]["Enums"]["canal_cliente_enum"]
          cliente_impel_id: string
          complejidad_tipica: Database["public"]["Enums"]["complejidad_enum"]
          condicion_pago: Database["public"]["Enums"]["condicion_pago_enum"]
          created_at: string | null
          es_manual: boolean
          esquema_facturacion: Database["public"]["Enums"]["esquema_facturacion_enum"]
          homologado_a: string | null
          id: string
          notas: string | null
          stock_administrado: boolean
          tier: Database["public"]["Enums"]["cliente_tier_enum"]
          tipo_relacion: Database["public"]["Enums"]["tipo_relacion_enum"]
          updated_at: string | null
        }
        Insert: {
          canal?: Database["public"]["Enums"]["canal_cliente_enum"]
          cliente_impel_id: string
          complejidad_tipica?: Database["public"]["Enums"]["complejidad_enum"]
          condicion_pago?: Database["public"]["Enums"]["condicion_pago_enum"]
          created_at?: string | null
          es_manual?: boolean
          esquema_facturacion?: Database["public"]["Enums"]["esquema_facturacion_enum"]
          homologado_a?: string | null
          id?: string
          notas?: string | null
          stock_administrado?: boolean
          tier?: Database["public"]["Enums"]["cliente_tier_enum"]
          tipo_relacion?: Database["public"]["Enums"]["tipo_relacion_enum"]
          updated_at?: string | null
        }
        Update: {
          canal?: Database["public"]["Enums"]["canal_cliente_enum"]
          cliente_impel_id?: string
          complejidad_tipica?: Database["public"]["Enums"]["complejidad_enum"]
          condicion_pago?: Database["public"]["Enums"]["condicion_pago_enum"]
          created_at?: string | null
          es_manual?: boolean
          esquema_facturacion?: Database["public"]["Enums"]["esquema_facturacion_enum"]
          homologado_a?: string | null
          id?: string
          notas?: string | null
          stock_administrado?: boolean
          tier?: Database["public"]["Enums"]["cliente_tier_enum"]
          tipo_relacion?: Database["public"]["Enums"]["tipo_relacion_enum"]
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "clientes_cliente_impel_id_fkey"
            columns: ["cliente_impel_id"]
            isOneToOne: true
            referencedRelation: "clientes_impel"
            referencedColumns: ["id_impel"]
          },
          {
            foreignKeyName: "clientes_homologado_a_fkey"
            columns: ["homologado_a"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clientes_homologado_a_fkey"
            columns: ["homologado_a"]
            isOneToOne: false
            referencedRelation: "v_cliente_efectivo"
            referencedColumns: ["cliente_id"]
          },
          {
            foreignKeyName: "clientes_homologado_a_fkey"
            columns: ["homologado_a"]
            isOneToOne: false
            referencedRelation: "v_foco_semanal"
            referencedColumns: ["cliente_id"]
          },
        ]
      }
      clientes_impel: {
        Row: {
          created_at: string | null
          id_impel: string
          nit: string | null
          nombre_comercial: string | null
          razon_social: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          id_impel: string
          nit?: string | null
          nombre_comercial?: string | null
          razon_social: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          id_impel?: string
          nit?: string | null
          nombre_comercial?: string | null
          razon_social?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      festivos_co: {
        Row: {
          descripcion: string | null
          fecha: string
        }
        Insert: {
          descripcion?: string | null
          fecha: string
        }
        Update: {
          descripcion?: string | null
          fecha?: string
        }
        Relationships: []
      }
      lead_time_recurso: {
        Row: {
          activo: boolean
          condiciones: string | null
          dias_default: number
          fase: Database["public"]["Enums"]["fase_enum"]
          recurso: string
          updated_at: string | null
        }
        Insert: {
          activo?: boolean
          condiciones?: string | null
          dias_default: number
          fase: Database["public"]["Enums"]["fase_enum"]
          recurso: string
          updated_at?: string | null
        }
        Update: {
          activo?: boolean
          condiciones?: string | null
          dias_default?: number
          fase?: Database["public"]["Enums"]["fase_enum"]
          recurso?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      op_d_componentes: {
        Row: {
          cantidad_cortada: number
          cantidad_objetivo: number
          cantidad_tiqueteada: number
          cortado: boolean
          cortado_at: string | null
          cortado_por: string | null
          created_at: string | null
          es_manual: boolean
          id: string
          nombre_tela: string
          opd_id: string
          ref_impel: string | null
          rol: string | null
          updated_at: string | null
        }
        Insert: {
          cantidad_cortada?: number
          cantidad_objetivo?: number
          cantidad_tiqueteada?: number
          cortado?: boolean
          cortado_at?: string | null
          cortado_por?: string | null
          created_at?: string | null
          es_manual?: boolean
          id?: string
          nombre_tela: string
          opd_id: string
          ref_impel?: string | null
          rol?: string | null
          updated_at?: string | null
        }
        Update: {
          cantidad_cortada?: number
          cantidad_objetivo?: number
          cantidad_tiqueteada?: number
          cortado?: boolean
          cortado_at?: string | null
          cortado_por?: string | null
          created_at?: string | null
          es_manual?: boolean
          id?: string
          nombre_tela?: string
          opd_id?: string
          ref_impel?: string | null
          rol?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "op_d_componentes_opd_id_fkey"
            columns: ["opd_id"]
            isOneToOne: false
            referencedRelation: "op_ds"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "op_d_componentes_opd_id_fkey"
            columns: ["opd_id"]
            isOneToOne: false
            referencedRelation: "v_foco_semanal"
            referencedColumns: ["opd_id"]
          },
          {
            foreignKeyName: "op_d_componentes_opd_id_fkey"
            columns: ["opd_id"]
            isOneToOne: false
            referencedRelation: "v_mi_fase_hoy"
            referencedColumns: ["opd_id"]
          },
          {
            foreignKeyName: "op_d_componentes_opd_id_fkey"
            columns: ["opd_id"]
            isOneToOne: false
            referencedRelation: "v_plan_vs_real"
            referencedColumns: ["opd_id"]
          },
          {
            foreignKeyName: "op_d_componentes_opd_id_fkey"
            columns: ["opd_id"]
            isOneToOne: false
            referencedRelation: "v_score"
            referencedColumns: ["opd_id"]
          },
          {
            foreignKeyName: "op_d_componentes_opd_id_fkey"
            columns: ["opd_id"]
            isOneToOne: false
            referencedRelation: "v_semaforo_fase"
            referencedColumns: ["opd_id"]
          },
          {
            foreignKeyName: "op_d_componentes_opd_id_fkey"
            columns: ["opd_id"]
            isOneToOne: false
            referencedRelation: "v_slack"
            referencedColumns: ["opd_id"]
          },
        ]
      }
      op_d_pendientes: {
        Row: {
          cantidad_afectada: number
          closed_at: string | null
          closed_by: string | null
          componente_id: string | null
          created_at: string | null
          estado: Database["public"]["Enums"]["pendiente_estado_enum"]
          fase_actual: Database["public"]["Enums"]["fase_enum"]
          fase_origen: Database["public"]["Enums"]["fase_enum"]
          fecha_compromiso_subsanacion: string | null
          id: string
          motivo: Database["public"]["Enums"]["causa_desvio_enum"]
          notas: string | null
          opd_padre_id: string
          responsable: string | null
          updated_at: string | null
        }
        Insert: {
          cantidad_afectada: number
          closed_at?: string | null
          closed_by?: string | null
          componente_id?: string | null
          created_at?: string | null
          estado?: Database["public"]["Enums"]["pendiente_estado_enum"]
          fase_actual: Database["public"]["Enums"]["fase_enum"]
          fase_origen: Database["public"]["Enums"]["fase_enum"]
          fecha_compromiso_subsanacion?: string | null
          id?: string
          motivo: Database["public"]["Enums"]["causa_desvio_enum"]
          notas?: string | null
          opd_padre_id: string
          responsable?: string | null
          updated_at?: string | null
        }
        Update: {
          cantidad_afectada?: number
          closed_at?: string | null
          closed_by?: string | null
          componente_id?: string | null
          created_at?: string | null
          estado?: Database["public"]["Enums"]["pendiente_estado_enum"]
          fase_actual?: Database["public"]["Enums"]["fase_enum"]
          fase_origen?: Database["public"]["Enums"]["fase_enum"]
          fecha_compromiso_subsanacion?: string | null
          id?: string
          motivo?: Database["public"]["Enums"]["causa_desvio_enum"]
          notas?: string | null
          opd_padre_id?: string
          responsable?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "op_d_pendientes_componente_id_fkey"
            columns: ["componente_id"]
            isOneToOne: false
            referencedRelation: "op_d_componentes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "op_d_pendientes_opd_padre_id_fkey"
            columns: ["opd_padre_id"]
            isOneToOne: false
            referencedRelation: "op_ds"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "op_d_pendientes_opd_padre_id_fkey"
            columns: ["opd_padre_id"]
            isOneToOne: false
            referencedRelation: "v_foco_semanal"
            referencedColumns: ["opd_id"]
          },
          {
            foreignKeyName: "op_d_pendientes_opd_padre_id_fkey"
            columns: ["opd_padre_id"]
            isOneToOne: false
            referencedRelation: "v_mi_fase_hoy"
            referencedColumns: ["opd_id"]
          },
          {
            foreignKeyName: "op_d_pendientes_opd_padre_id_fkey"
            columns: ["opd_padre_id"]
            isOneToOne: false
            referencedRelation: "v_plan_vs_real"
            referencedColumns: ["opd_id"]
          },
          {
            foreignKeyName: "op_d_pendientes_opd_padre_id_fkey"
            columns: ["opd_padre_id"]
            isOneToOne: false
            referencedRelation: "v_score"
            referencedColumns: ["opd_id"]
          },
          {
            foreignKeyName: "op_d_pendientes_opd_padre_id_fkey"
            columns: ["opd_padre_id"]
            isOneToOne: false
            referencedRelation: "v_semaforo_fase"
            referencedColumns: ["opd_id"]
          },
          {
            foreignKeyName: "op_d_pendientes_opd_padre_id_fkey"
            columns: ["opd_padre_id"]
            isOneToOne: false
            referencedRelation: "v_slack"
            referencedColumns: ["opd_id"]
          },
        ]
      }
      op_d_prioridad_fase: {
        Row: {
          fase: Database["public"]["Enums"]["fase_enum"]
          opd_id: string
          prioridad: number
          updated_at: string
        }
        Insert: {
          fase: Database["public"]["Enums"]["fase_enum"]
          opd_id: string
          prioridad: number
          updated_at?: string
        }
        Update: {
          fase?: Database["public"]["Enums"]["fase_enum"]
          opd_id?: string
          prioridad?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "op_d_prioridad_fase_opd_id_fkey"
            columns: ["opd_id"]
            isOneToOne: false
            referencedRelation: "op_ds"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "op_d_prioridad_fase_opd_id_fkey"
            columns: ["opd_id"]
            isOneToOne: false
            referencedRelation: "v_foco_semanal"
            referencedColumns: ["opd_id"]
          },
          {
            foreignKeyName: "op_d_prioridad_fase_opd_id_fkey"
            columns: ["opd_id"]
            isOneToOne: false
            referencedRelation: "v_mi_fase_hoy"
            referencedColumns: ["opd_id"]
          },
          {
            foreignKeyName: "op_d_prioridad_fase_opd_id_fkey"
            columns: ["opd_id"]
            isOneToOne: false
            referencedRelation: "v_plan_vs_real"
            referencedColumns: ["opd_id"]
          },
          {
            foreignKeyName: "op_d_prioridad_fase_opd_id_fkey"
            columns: ["opd_id"]
            isOneToOne: false
            referencedRelation: "v_score"
            referencedColumns: ["opd_id"]
          },
          {
            foreignKeyName: "op_d_prioridad_fase_opd_id_fkey"
            columns: ["opd_id"]
            isOneToOne: false
            referencedRelation: "v_semaforo_fase"
            referencedColumns: ["opd_id"]
          },
          {
            foreignKeyName: "op_d_prioridad_fase_opd_id_fkey"
            columns: ["opd_id"]
            isOneToOne: false
            referencedRelation: "v_slack"
            referencedColumns: ["opd_id"]
          },
        ]
      }
      op_ds: {
        Row: {
          activa: boolean
          bloqueada: boolean
          cantidad: number
          categoria_proc_id: string | null
          causa_desvio: Database["public"]["Enums"]["causa_desvio_enum"] | null
          colores: string | null
          created_at: string | null
          detalle: string | null
          dias_compras: number
          dias_corte: number
          dias_despacho: number
          dias_empaque: number
          dias_fase_0: number
          dias_satelites: number
          dias_tiqueteo: number
          dias_trazo: number
          f0_aprobacion: boolean
          f0_ficha_tec: boolean
          f0_muestra: boolean
          f0_op_creada: boolean
          f0_patronaje: boolean
          f0_tela_avios: boolean
          fase_actual: Database["public"]["Enums"]["fase_enum"]
          fecha_promesa_satelites: string | null
          fecha_recepcion_satelites: string | null
          id: string
          impel_id: string
          link_impel: string | null
          motivo_bloqueo:
            | Database["public"]["Enums"]["motivo_bloqueo_enum"]
            | null
          op_num: string
          paquete_completo: boolean
          plan_congelado: boolean
          primera_vez: boolean
          prioridad_manual: number | null
          productos: string | null
          recurso_corte: Database["public"]["Enums"]["recurso_corte_enum"]
          ref: string
          score_motivo: string | null
          score_override: number | null
          seq: number
          subestado_satelite:
            | Database["public"]["Enums"]["satelite_subestado_enum"]
            | null
          tipo_empaque: Database["public"]["Enums"]["tipo_empaque_enum"]
          uds_recibidas_empaque: number | null
          updated_at: string | null
        }
        Insert: {
          activa?: boolean
          bloqueada?: boolean
          cantidad: number
          categoria_proc_id?: string | null
          causa_desvio?: Database["public"]["Enums"]["causa_desvio_enum"] | null
          colores?: string | null
          created_at?: string | null
          detalle?: string | null
          dias_compras?: number
          dias_corte?: number
          dias_despacho?: number
          dias_empaque?: number
          dias_fase_0?: number
          dias_satelites?: number
          dias_tiqueteo?: number
          dias_trazo?: number
          f0_aprobacion?: boolean
          f0_ficha_tec?: boolean
          f0_muestra?: boolean
          f0_op_creada?: boolean
          f0_patronaje?: boolean
          f0_tela_avios?: boolean
          fase_actual?: Database["public"]["Enums"]["fase_enum"]
          fecha_promesa_satelites?: string | null
          fecha_recepcion_satelites?: string | null
          id?: string
          impel_id: string
          link_impel?: string | null
          motivo_bloqueo?:
            | Database["public"]["Enums"]["motivo_bloqueo_enum"]
            | null
          op_num: string
          paquete_completo?: boolean
          plan_congelado?: boolean
          primera_vez?: boolean
          prioridad_manual?: number | null
          productos?: string | null
          recurso_corte?: Database["public"]["Enums"]["recurso_corte_enum"]
          ref: string
          score_motivo?: string | null
          score_override?: number | null
          seq: number
          subestado_satelite?:
            | Database["public"]["Enums"]["satelite_subestado_enum"]
            | null
          tipo_empaque?: Database["public"]["Enums"]["tipo_empaque_enum"]
          uds_recibidas_empaque?: number | null
          updated_at?: string | null
        }
        Update: {
          activa?: boolean
          bloqueada?: boolean
          cantidad?: number
          categoria_proc_id?: string | null
          causa_desvio?: Database["public"]["Enums"]["causa_desvio_enum"] | null
          colores?: string | null
          created_at?: string | null
          detalle?: string | null
          dias_compras?: number
          dias_corte?: number
          dias_despacho?: number
          dias_empaque?: number
          dias_fase_0?: number
          dias_satelites?: number
          dias_tiqueteo?: number
          dias_trazo?: number
          f0_aprobacion?: boolean
          f0_ficha_tec?: boolean
          f0_muestra?: boolean
          f0_op_creada?: boolean
          f0_patronaje?: boolean
          f0_tela_avios?: boolean
          fase_actual?: Database["public"]["Enums"]["fase_enum"]
          fecha_promesa_satelites?: string | null
          fecha_recepcion_satelites?: string | null
          id?: string
          impel_id?: string
          link_impel?: string | null
          motivo_bloqueo?:
            | Database["public"]["Enums"]["motivo_bloqueo_enum"]
            | null
          op_num?: string
          paquete_completo?: boolean
          plan_congelado?: boolean
          primera_vez?: boolean
          prioridad_manual?: number | null
          productos?: string | null
          recurso_corte?: Database["public"]["Enums"]["recurso_corte_enum"]
          ref?: string
          score_motivo?: string | null
          score_override?: number | null
          seq?: number
          subestado_satelite?:
            | Database["public"]["Enums"]["satelite_subestado_enum"]
            | null
          tipo_empaque?: Database["public"]["Enums"]["tipo_empaque_enum"]
          uds_recibidas_empaque?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "op_ds_categoria_proc_id_fkey"
            columns: ["categoria_proc_id"]
            isOneToOne: false
            referencedRelation: "categorias_proc"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "op_ds_op_num_fkey"
            columns: ["op_num"]
            isOneToOne: false
            referencedRelation: "ops"
            referencedColumns: ["op_num"]
          },
          {
            foreignKeyName: "op_ds_op_num_fkey"
            columns: ["op_num"]
            isOneToOne: false
            referencedRelation: "v_semaforo_op"
            referencedColumns: ["op_num"]
          },
        ]
      }
      ops: {
        Row: {
          activa: boolean
          cliente_id: string
          comercial: string | null
          created_at: string | null
          estado_impel: string | null
          fecha_compromiso: string
          fecha_compromiso_original: string | null
          fecha_creacion_impel: string | null
          fecha_paso_produccion: string | null
          flag_parcial: boolean
          impel_id: string | null
          nombre: string | null
          op_num: string
          op_origen: string | null
          total_uds: number | null
          updated_at: string | null
        }
        Insert: {
          activa?: boolean
          cliente_id: string
          comercial?: string | null
          created_at?: string | null
          estado_impel?: string | null
          fecha_compromiso: string
          fecha_compromiso_original?: string | null
          fecha_creacion_impel?: string | null
          fecha_paso_produccion?: string | null
          flag_parcial?: boolean
          impel_id?: string | null
          nombre?: string | null
          op_num: string
          op_origen?: string | null
          total_uds?: number | null
          updated_at?: string | null
        }
        Update: {
          activa?: boolean
          cliente_id?: string
          comercial?: string | null
          created_at?: string | null
          estado_impel?: string | null
          fecha_compromiso?: string
          fecha_compromiso_original?: string | null
          fecha_creacion_impel?: string | null
          fecha_paso_produccion?: string | null
          flag_parcial?: boolean
          impel_id?: string | null
          nombre?: string | null
          op_num?: string
          op_origen?: string | null
          total_uds?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ops_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ops_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "v_cliente_efectivo"
            referencedColumns: ["cliente_id"]
          },
          {
            foreignKeyName: "ops_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "v_foco_semanal"
            referencedColumns: ["cliente_id"]
          },
        ]
      }
      phase_events: {
        Row: {
          actor: string
          fase: Database["public"]["Enums"]["fase_enum"] | null
          id: string
          opd_id: string
          payload: Json | null
          tipo: Database["public"]["Enums"]["phase_event_tipo_enum"]
          ts: string
        }
        Insert: {
          actor: string
          fase?: Database["public"]["Enums"]["fase_enum"] | null
          id?: string
          opd_id: string
          payload?: Json | null
          tipo: Database["public"]["Enums"]["phase_event_tipo_enum"]
          ts?: string
        }
        Update: {
          actor?: string
          fase?: Database["public"]["Enums"]["fase_enum"] | null
          id?: string
          opd_id?: string
          payload?: Json | null
          tipo?: Database["public"]["Enums"]["phase_event_tipo_enum"]
          ts?: string
        }
        Relationships: [
          {
            foreignKeyName: "phase_events_opd_id_fkey"
            columns: ["opd_id"]
            isOneToOne: false
            referencedRelation: "op_ds"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "phase_events_opd_id_fkey"
            columns: ["opd_id"]
            isOneToOne: false
            referencedRelation: "v_foco_semanal"
            referencedColumns: ["opd_id"]
          },
          {
            foreignKeyName: "phase_events_opd_id_fkey"
            columns: ["opd_id"]
            isOneToOne: false
            referencedRelation: "v_mi_fase_hoy"
            referencedColumns: ["opd_id"]
          },
          {
            foreignKeyName: "phase_events_opd_id_fkey"
            columns: ["opd_id"]
            isOneToOne: false
            referencedRelation: "v_plan_vs_real"
            referencedColumns: ["opd_id"]
          },
          {
            foreignKeyName: "phase_events_opd_id_fkey"
            columns: ["opd_id"]
            isOneToOne: false
            referencedRelation: "v_score"
            referencedColumns: ["opd_id"]
          },
          {
            foreignKeyName: "phase_events_opd_id_fkey"
            columns: ["opd_id"]
            isOneToOne: false
            referencedRelation: "v_semaforo_fase"
            referencedColumns: ["opd_id"]
          },
          {
            foreignKeyName: "phase_events_opd_id_fkey"
            columns: ["opd_id"]
            isOneToOne: false
            referencedRelation: "v_slack"
            referencedColumns: ["opd_id"]
          },
        ]
      }
      phase_plans: {
        Row: {
          dias: number
          due_date: string
          fase: Database["public"]["Enums"]["fase_enum"]
          opd_id: string
          start_date: string
          tercerizado: boolean
          updated_at: string | null
        }
        Insert: {
          dias: number
          due_date: string
          fase: Database["public"]["Enums"]["fase_enum"]
          opd_id: string
          start_date: string
          tercerizado?: boolean
          updated_at?: string | null
        }
        Update: {
          dias?: number
          due_date?: string
          fase?: Database["public"]["Enums"]["fase_enum"]
          opd_id?: string
          start_date?: string
          tercerizado?: boolean
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "phase_plans_opd_id_fkey"
            columns: ["opd_id"]
            isOneToOne: false
            referencedRelation: "op_ds"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "phase_plans_opd_id_fkey"
            columns: ["opd_id"]
            isOneToOne: false
            referencedRelation: "v_foco_semanal"
            referencedColumns: ["opd_id"]
          },
          {
            foreignKeyName: "phase_plans_opd_id_fkey"
            columns: ["opd_id"]
            isOneToOne: false
            referencedRelation: "v_mi_fase_hoy"
            referencedColumns: ["opd_id"]
          },
          {
            foreignKeyName: "phase_plans_opd_id_fkey"
            columns: ["opd_id"]
            isOneToOne: false
            referencedRelation: "v_plan_vs_real"
            referencedColumns: ["opd_id"]
          },
          {
            foreignKeyName: "phase_plans_opd_id_fkey"
            columns: ["opd_id"]
            isOneToOne: false
            referencedRelation: "v_score"
            referencedColumns: ["opd_id"]
          },
          {
            foreignKeyName: "phase_plans_opd_id_fkey"
            columns: ["opd_id"]
            isOneToOne: false
            referencedRelation: "v_semaforo_fase"
            referencedColumns: ["opd_id"]
          },
          {
            foreignKeyName: "phase_plans_opd_id_fkey"
            columns: ["opd_id"]
            isOneToOne: false
            referencedRelation: "v_slack"
            referencedColumns: ["opd_id"]
          },
        ]
      }
      phase_plans_baseline: {
        Row: {
          dias: number
          due_date: string
          fase: Database["public"]["Enums"]["fase_enum"]
          frozen_at: string
          frozen_by: string | null
          opd_id: string
          start_date: string
        }
        Insert: {
          dias: number
          due_date: string
          fase: Database["public"]["Enums"]["fase_enum"]
          frozen_at?: string
          frozen_by?: string | null
          opd_id: string
          start_date: string
        }
        Update: {
          dias?: number
          due_date?: string
          fase?: Database["public"]["Enums"]["fase_enum"]
          frozen_at?: string
          frozen_by?: string | null
          opd_id?: string
          start_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "phase_plans_baseline_opd_id_fkey"
            columns: ["opd_id"]
            isOneToOne: false
            referencedRelation: "op_ds"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "phase_plans_baseline_opd_id_fkey"
            columns: ["opd_id"]
            isOneToOne: false
            referencedRelation: "v_foco_semanal"
            referencedColumns: ["opd_id"]
          },
          {
            foreignKeyName: "phase_plans_baseline_opd_id_fkey"
            columns: ["opd_id"]
            isOneToOne: false
            referencedRelation: "v_mi_fase_hoy"
            referencedColumns: ["opd_id"]
          },
          {
            foreignKeyName: "phase_plans_baseline_opd_id_fkey"
            columns: ["opd_id"]
            isOneToOne: false
            referencedRelation: "v_plan_vs_real"
            referencedColumns: ["opd_id"]
          },
          {
            foreignKeyName: "phase_plans_baseline_opd_id_fkey"
            columns: ["opd_id"]
            isOneToOne: false
            referencedRelation: "v_score"
            referencedColumns: ["opd_id"]
          },
          {
            foreignKeyName: "phase_plans_baseline_opd_id_fkey"
            columns: ["opd_id"]
            isOneToOne: false
            referencedRelation: "v_semaforo_fase"
            referencedColumns: ["opd_id"]
          },
          {
            foreignKeyName: "phase_plans_baseline_opd_id_fkey"
            columns: ["opd_id"]
            isOneToOne: false
            referencedRelation: "v_slack"
            referencedColumns: ["opd_id"]
          },
        ]
      }
      phase_promises: {
        Row: {
          fase: Database["public"]["Enums"]["fase_enum"]
          fecha_promesa: string
          opd_id: string
          set_at: string
          set_by: string
        }
        Insert: {
          fase: Database["public"]["Enums"]["fase_enum"]
          fecha_promesa: string
          opd_id: string
          set_at?: string
          set_by: string
        }
        Update: {
          fase?: Database["public"]["Enums"]["fase_enum"]
          fecha_promesa?: string
          opd_id?: string
          set_at?: string
          set_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "phase_promises_opd_id_fkey"
            columns: ["opd_id"]
            isOneToOne: false
            referencedRelation: "op_ds"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "phase_promises_opd_id_fkey"
            columns: ["opd_id"]
            isOneToOne: false
            referencedRelation: "v_foco_semanal"
            referencedColumns: ["opd_id"]
          },
          {
            foreignKeyName: "phase_promises_opd_id_fkey"
            columns: ["opd_id"]
            isOneToOne: false
            referencedRelation: "v_mi_fase_hoy"
            referencedColumns: ["opd_id"]
          },
          {
            foreignKeyName: "phase_promises_opd_id_fkey"
            columns: ["opd_id"]
            isOneToOne: false
            referencedRelation: "v_plan_vs_real"
            referencedColumns: ["opd_id"]
          },
          {
            foreignKeyName: "phase_promises_opd_id_fkey"
            columns: ["opd_id"]
            isOneToOne: false
            referencedRelation: "v_score"
            referencedColumns: ["opd_id"]
          },
          {
            foreignKeyName: "phase_promises_opd_id_fkey"
            columns: ["opd_id"]
            isOneToOne: false
            referencedRelation: "v_semaforo_fase"
            referencedColumns: ["opd_id"]
          },
          {
            foreignKeyName: "phase_promises_opd_id_fkey"
            columns: ["opd_id"]
            isOneToOne: false
            referencedRelation: "v_slack"
            referencedColumns: ["opd_id"]
          },
        ]
      }
      satelite_subfase_promesa: {
        Row: {
          fecha_promesa: string
          opd_id: string
          set_at: string
          set_by: string
          subestado: Database["public"]["Enums"]["satelite_subestado_enum"]
        }
        Insert: {
          fecha_promesa: string
          opd_id: string
          set_at?: string
          set_by: string
          subestado: Database["public"]["Enums"]["satelite_subestado_enum"]
        }
        Update: {
          fecha_promesa?: string
          opd_id?: string
          set_at?: string
          set_by?: string
          subestado?: Database["public"]["Enums"]["satelite_subestado_enum"]
        }
        Relationships: [
          {
            foreignKeyName: "satelite_subfase_promesa_opd_id_fkey"
            columns: ["opd_id"]
            isOneToOne: false
            referencedRelation: "op_ds"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "satelite_subfase_promesa_opd_id_fkey"
            columns: ["opd_id"]
            isOneToOne: false
            referencedRelation: "v_foco_semanal"
            referencedColumns: ["opd_id"]
          },
          {
            foreignKeyName: "satelite_subfase_promesa_opd_id_fkey"
            columns: ["opd_id"]
            isOneToOne: false
            referencedRelation: "v_mi_fase_hoy"
            referencedColumns: ["opd_id"]
          },
          {
            foreignKeyName: "satelite_subfase_promesa_opd_id_fkey"
            columns: ["opd_id"]
            isOneToOne: false
            referencedRelation: "v_plan_vs_real"
            referencedColumns: ["opd_id"]
          },
          {
            foreignKeyName: "satelite_subfase_promesa_opd_id_fkey"
            columns: ["opd_id"]
            isOneToOne: false
            referencedRelation: "v_score"
            referencedColumns: ["opd_id"]
          },
          {
            foreignKeyName: "satelite_subfase_promesa_opd_id_fkey"
            columns: ["opd_id"]
            isOneToOne: false
            referencedRelation: "v_semaforo_fase"
            referencedColumns: ["opd_id"]
          },
          {
            foreignKeyName: "satelite_subfase_promesa_opd_id_fkey"
            columns: ["opd_id"]
            isOneToOne: false
            referencedRelation: "v_slack"
            referencedColumns: ["opd_id"]
          },
        ]
      }
      sedes_cliente: {
        Row: {
          activa: boolean
          ciudad: string
          cliente_id: string
          contacto: string | null
          created_at: string | null
          direccion: string | null
          id: string
          nombre_sede: string
          operador_logistico_preferido: string | null
          updated_at: string | null
        }
        Insert: {
          activa?: boolean
          ciudad: string
          cliente_id: string
          contacto?: string | null
          created_at?: string | null
          direccion?: string | null
          id?: string
          nombre_sede: string
          operador_logistico_preferido?: string | null
          updated_at?: string | null
        }
        Update: {
          activa?: boolean
          ciudad?: string
          cliente_id?: string
          contacto?: string | null
          created_at?: string | null
          direccion?: string | null
          id?: string
          nombre_sede?: string
          operador_logistico_preferido?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sedes_cliente_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sedes_cliente_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "v_cliente_efectivo"
            referencedColumns: ["cliente_id"]
          },
          {
            foreignKeyName: "sedes_cliente_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "v_foco_semanal"
            referencedColumns: ["cliente_id"]
          },
        ]
      }
      semaforo_config: {
        Row: {
          fase: Database["public"]["Enums"]["fase_enum"] | null
          scope: string
          umbral_amarillo: number
          umbral_verde: number
          updated_at: string
        }
        Insert: {
          fase?: Database["public"]["Enums"]["fase_enum"] | null
          scope?: string
          umbral_amarillo?: number
          umbral_verde?: number
          updated_at?: string
        }
        Update: {
          fase?: Database["public"]["Enums"]["fase_enum"] | null
          scope?: string
          umbral_amarillo?: number
          umbral_verde?: number
          updated_at?: string
        }
        Relationships: []
      }
      sku_impel: {
        Row: {
          codigo_barras: string | null
          color: string | null
          created_at: string | null
          id_impel: string
          sku_modelo_id: string | null
          talla: string | null
          updated_at: string | null
        }
        Insert: {
          codigo_barras?: string | null
          color?: string | null
          created_at?: string | null
          id_impel: string
          sku_modelo_id?: string | null
          talla?: string | null
          updated_at?: string | null
        }
        Update: {
          codigo_barras?: string | null
          color?: string | null
          created_at?: string | null
          id_impel?: string
          sku_modelo_id?: string | null
          talla?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sku_impel_sku_modelo_id_fkey"
            columns: ["sku_modelo_id"]
            isOneToOne: false
            referencedRelation: "sku_modelo_impel"
            referencedColumns: ["id_impel"]
          },
        ]
      }
      sku_modelo_impel: {
        Row: {
          created_at: string | null
          estado: string | null
          ficha_tecnica_url: string | null
          id_impel: string
          nombre: string | null
          patron_cad_url: string | null
          referencia: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          estado?: string | null
          ficha_tecnica_url?: string | null
          id_impel: string
          nombre?: string | null
          patron_cad_url?: string | null
          referencia: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          estado?: string | null
          ficha_tecnica_url?: string | null
          id_impel?: string
          nombre?: string | null
          patron_cad_url?: string | null
          referencia?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      user_ui_prefs: {
        Row: {
          prefs: Json
          updated_at: string | null
          user_id: string
        }
        Insert: {
          prefs?: Json
          updated_at?: string | null
          user_id: string
        }
        Update: {
          prefs?: Json
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      usuario_fases_asignadas: {
        Row: {
          created_at: string | null
          fase: Database["public"]["Enums"]["fase_enum"]
          id: string
          solo_lectura: boolean
          updated_at: string | null
          usuario_id: string
        }
        Insert: {
          created_at?: string | null
          fase: Database["public"]["Enums"]["fase_enum"]
          id?: string
          solo_lectura?: boolean
          updated_at?: string | null
          usuario_id: string
        }
        Update: {
          created_at?: string | null
          fase?: Database["public"]["Enums"]["fase_enum"]
          id?: string
          solo_lectura?: boolean
          updated_at?: string | null
          usuario_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "usuario_fases_asignadas_usuario_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: false
            referencedRelation: "usuarios_sistema"
            referencedColumns: ["id"]
          },
        ]
      }
      usuarios_sistema: {
        Row: {
          activo: boolean
          created_at: string | null
          email: string
          id: string
          nombre: string | null
          rol: Database["public"]["Enums"]["rol_sistema_enum"]
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          activo?: boolean
          created_at?: string | null
          email: string
          id?: string
          nombre?: string | null
          rol?: Database["public"]["Enums"]["rol_sistema_enum"]
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          activo?: boolean
          created_at?: string | null
          email?: string
          id?: string
          nombre?: string | null
          rol?: Database["public"]["Enums"]["rol_sistema_enum"]
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      v_capacidad_semana_fase: {
        Row: {
          color_carga: Database["public"]["Enums"]["semaforo_enum"] | null
          fase: Database["public"]["Enums"]["fase_enum"] | null
          n_clientes: number | null
          op_ds_simultaneas: number | null
          semana_inicio: string | null
          semana_label: string | null
          unidades_totales: number | null
        }
        Relationships: []
      }
      v_cliente_efectivo: {
        Row: {
          canonical_id: string | null
          cliente_id: string | null
          complejidad_tipica:
            | Database["public"]["Enums"]["complejidad_enum"]
            | null
          condicion_pago:
            | Database["public"]["Enums"]["condicion_pago_enum"]
            | null
          tier: Database["public"]["Enums"]["cliente_tier_enum"] | null
          tipo_relacion:
            | Database["public"]["Enums"]["tipo_relacion_enum"]
            | null
        }
        Relationships: []
      }
      v_foco_semanal: {
        Row: {
          bloqueada: boolean | null
          cliente: string | null
          cliente_id: string | null
          due_date: string | null
          fase_actual: Database["public"]["Enums"]["fase_enum"] | null
          fase_objetivo_semana: Database["public"]["Enums"]["fase_enum"] | null
          motivo_bloqueo:
            | Database["public"]["Enums"]["motivo_bloqueo_enum"]
            | null
          op_num: string | null
          opd_id: string | null
          ref: string | null
          score_efectivo: number | null
          semaforo: Database["public"]["Enums"]["semaforo_enum"] | null
          slack: number | null
          start_date: string | null
        }
        Relationships: [
          {
            foreignKeyName: "op_ds_op_num_fkey"
            columns: ["op_num"]
            isOneToOne: false
            referencedRelation: "ops"
            referencedColumns: ["op_num"]
          },
          {
            foreignKeyName: "op_ds_op_num_fkey"
            columns: ["op_num"]
            isOneToOne: false
            referencedRelation: "v_semaforo_op"
            referencedColumns: ["op_num"]
          },
        ]
      }
      v_mi_fase_hoy: {
        Row: {
          bloqueada: boolean | null
          cantidad: number | null
          cliente: string | null
          detalle: string | null
          fase_actual: Database["public"]["Enums"]["fase_enum"] | null
          fecha_compromiso: string | null
          fecha_fin_planeada: string | null
          fecha_promesa_satelites: string | null
          motivo_bloqueo:
            | Database["public"]["Enums"]["motivo_bloqueo_enum"]
            | null
          op_num: string | null
          opd_id: string | null
          paquete_completo: boolean | null
          pendientes_abiertos: number | null
          prioridad_fase: number | null
          ref: string | null
          score_efectivo: number | null
          semaforo: Database["public"]["Enums"]["semaforo_enum"] | null
          semaforo_fase: Database["public"]["Enums"]["semaforo_enum"] | null
          slack: number | null
          slack_fase: number | null
          subestado_satelite:
            | Database["public"]["Enums"]["satelite_subestado_enum"]
            | null
          uds_en_fase: number | null
          uds_recibidas_empaque: number | null
          fecha_ingreso_fase: string | null
        }
        Relationships: [
          {
            foreignKeyName: "op_ds_op_num_fkey"
            columns: ["op_num"]
            isOneToOne: false
            referencedRelation: "ops"
            referencedColumns: ["op_num"]
          },
          {
            foreignKeyName: "op_ds_op_num_fkey"
            columns: ["op_num"]
            isOneToOne: false
            referencedRelation: "v_semaforo_op"
            referencedColumns: ["op_num"]
          },
        ]
      }
      v_pendientes_abiertos: {
        Row: {
          cantidad_afectada: number | null
          cantidad_total_opd: number | null
          created_at: string | null
          dias_abierto: number | null
          estado: Database["public"]["Enums"]["pendiente_estado_enum"] | null
          fase_actual: Database["public"]["Enums"]["fase_enum"] | null
          fase_origen: Database["public"]["Enums"]["fase_enum"] | null
          fecha_compromiso_subsanacion: string | null
          id: string | null
          motivo: Database["public"]["Enums"]["causa_desvio_enum"] | null
          notas: string | null
          op_num: string | null
          opd_padre_id: string | null
          opd_ref: string | null
          responsable: string | null
          urgencia: string | null
        }
        Relationships: [
          {
            foreignKeyName: "op_d_pendientes_opd_padre_id_fkey"
            columns: ["opd_padre_id"]
            isOneToOne: false
            referencedRelation: "op_ds"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "op_d_pendientes_opd_padre_id_fkey"
            columns: ["opd_padre_id"]
            isOneToOne: false
            referencedRelation: "v_foco_semanal"
            referencedColumns: ["opd_id"]
          },
          {
            foreignKeyName: "op_d_pendientes_opd_padre_id_fkey"
            columns: ["opd_padre_id"]
            isOneToOne: false
            referencedRelation: "v_mi_fase_hoy"
            referencedColumns: ["opd_id"]
          },
          {
            foreignKeyName: "op_d_pendientes_opd_padre_id_fkey"
            columns: ["opd_padre_id"]
            isOneToOne: false
            referencedRelation: "v_plan_vs_real"
            referencedColumns: ["opd_id"]
          },
          {
            foreignKeyName: "op_d_pendientes_opd_padre_id_fkey"
            columns: ["opd_padre_id"]
            isOneToOne: false
            referencedRelation: "v_score"
            referencedColumns: ["opd_id"]
          },
          {
            foreignKeyName: "op_d_pendientes_opd_padre_id_fkey"
            columns: ["opd_padre_id"]
            isOneToOne: false
            referencedRelation: "v_semaforo_fase"
            referencedColumns: ["opd_id"]
          },
          {
            foreignKeyName: "op_d_pendientes_opd_padre_id_fkey"
            columns: ["opd_padre_id"]
            isOneToOne: false
            referencedRelation: "v_slack"
            referencedColumns: ["opd_id"]
          },
          {
            foreignKeyName: "op_ds_op_num_fkey"
            columns: ["op_num"]
            isOneToOne: false
            referencedRelation: "ops"
            referencedColumns: ["op_num"]
          },
          {
            foreignKeyName: "op_ds_op_num_fkey"
            columns: ["op_num"]
            isOneToOne: false
            referencedRelation: "v_semaforo_op"
            referencedColumns: ["op_num"]
          },
        ]
      }
      v_plan_vs_real: {
        Row: {
          dias_baseline: number | null
          dias_plan_actual: number | null
          due_baseline: string | null
          due_plan_actual: string | null
          fase: Database["public"]["Enums"]["fase_enum"] | null
          fecha_real_fin: string | null
          fecha_real_inicio: string | null
          opd_id: string | null
          ref: string | null
          start_baseline: string | null
          start_plan_actual: string | null
        }
        Relationships: []
      }
      v_score: {
        Row: {
          op_num: string | null
          opd_id: string | null
          pts_caja: number | null
          pts_complejidad: number | null
          pts_contractual: number | null
          pts_estrategico: number | null
          pts_urgencia: number | null
          pts_velocidad: number | null
          ref: string | null
          score_calculado: number | null
          score_efectivo: number | null
          score_override: number | null
          slack_dias: number | null
        }
        Relationships: [
          {
            foreignKeyName: "op_ds_op_num_fkey"
            columns: ["op_num"]
            isOneToOne: false
            referencedRelation: "ops"
            referencedColumns: ["op_num"]
          },
          {
            foreignKeyName: "op_ds_op_num_fkey"
            columns: ["op_num"]
            isOneToOne: false
            referencedRelation: "v_semaforo_op"
            referencedColumns: ["op_num"]
          },
        ]
      }
      v_semaforo_fase: {
        Row: {
          fase: Database["public"]["Enums"]["fase_enum"] | null
          opd_id: string | null
          semaforo_fase: Database["public"]["Enums"]["semaforo_enum"] | null
          slack_fase: number | null
        }
        Relationships: []
      }
      v_semaforo_op: {
        Row: {
          amarillas: number | null
          cliente_id: string | null
          op_num: string | null
          rojas: number | null
          semaforo_op: Database["public"]["Enums"]["semaforo_enum"] | null
          total_op_ds: number | null
          verdes: number | null
        }
        Relationships: [
          {
            foreignKeyName: "ops_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ops_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "v_cliente_efectivo"
            referencedColumns: ["cliente_id"]
          },
          {
            foreignKeyName: "ops_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "v_foco_semanal"
            referencedColumns: ["cliente_id"]
          },
        ]
      }
      v_slack: {
        Row: {
          bloqueada: boolean | null
          cliente_id: string | null
          dias_hasta_compromiso: number | null
          dias_plan_restantes: number | null
          fase_actual: Database["public"]["Enums"]["fase_enum"] | null
          op_num: string | null
          opd_id: string | null
          plan_congelado: boolean | null
          ref: string | null
          semaforo: Database["public"]["Enums"]["semaforo_enum"] | null
          slack: number | null
        }
        Relationships: [
          {
            foreignKeyName: "op_ds_op_num_fkey"
            columns: ["op_num"]
            isOneToOne: false
            referencedRelation: "ops"
            referencedColumns: ["op_num"]
          },
          {
            foreignKeyName: "op_ds_op_num_fkey"
            columns: ["op_num"]
            isOneToOne: false
            referencedRelation: "v_semaforo_op"
            referencedColumns: ["op_num"]
          },
          {
            foreignKeyName: "ops_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ops_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "v_cliente_efectivo"
            referencedColumns: ["cliente_id"]
          },
          {
            foreignKeyName: "ops_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "v_foco_semanal"
            referencedColumns: ["cliente_id"]
          },
        ]
      }
    }
    Functions: {
      check_user_access: {
        Args: { p_email: string }
        Returns: {
          activo: boolean
          rol: Database["public"]["Enums"]["rol_sistema_enum"]
        }[]
      }
      dias_habiles_entre: { Args: { d1: string; d2: string }; Returns: number }
      freeze_baseline: {
        Args: { p_actor: string; p_opd_id: string }
        Returns: undefined
      }
      get_clientes_data: { Args: never; Returns: Json }
      get_festivos_data: { Args: never; Returns: Json }
      get_my_role: {
        Args: never
        Returns: Database["public"]["Enums"]["rol_sistema_enum"]
      }
      get_opds_data: { Args: never; Returns: Json }
      get_phase_plans_baseline_json: { Args: never; Returns: Json }
      get_phase_plans_json: { Args: never; Returns: Json }
      get_plan_semana: { Args: { p_lunes?: string }; Returns: Json }
      get_produccion_data: { Args: never; Returns: Json }
      get_usuarios_sistema_admin: { Args: never; Returns: Json }
      is_admin: { Args: never; Returns: boolean }
      recalc_pull: { Args: { p_opd_id: string }; Returns: undefined }
      restar_dias_habiles: { Args: { d: string; n: number }; Returns: string }
      save_ui_pref: {
        Args: { p_patch: Json; p_view_key: string }
        Returns: undefined
      }
      semaforo_de: {
        Args: {
          p_fase?: Database["public"]["Enums"]["fase_enum"]
          slack: number
        }
        Returns: Database["public"]["Enums"]["semaforo_enum"]
      }
      sumar_dias_habiles: { Args: { d: string; n: number }; Returns: string }
    }
    Enums: {
      canal_cliente_enum: "colombia" | "panama_internacional"
      causa_desvio_enum:
        | "mp_tardia"
        | "calidad_mp"
        | "bloqueo_f0"
        | "capacidad_corte"
        | "capacidad_trazo"
        | "capacidad_satelite"
        | "capacidad_tiqueteo_empaque"
        | "reproceso_interno"
        | "reproceso_satelite"
        | "cambio_cliente"
        | "documentacion_despacho"
        | "otro"
        | "volumen_parcial"
        | "mp_incompleta"
      cliente_tier_enum: "tier_1" | "tier_2" | "estandar"
      complejidad_enum: "alta" | "media" | "baja"
      condicion_pago_enum:
        | "anticipado"
        | "hasta_30d"
        | "30_a_60d"
        | "mas_de_60d"
      esquema_facturacion_enum: "directa" | "con_oc_cliente" | "resumen_y_oc"
      fase_enum:
        | "fase_0"
        | "compras"
        | "trazo"
        | "corte"
        | "tiqueteo"
        | "satelites"
        | "empaque"
        | "despacho"
        | "cierre"
      motivo_bloqueo_enum:
        | "mp_no_llego"
        | "fase_0_incompleta"
        | "pendiente_cliente"
        | "capacidad_satelite"
        | "reproceso"
        | "otro"
      pendiente_estado_enum: "pendiente" | "en_subsanacion" | "cerrado"
      phase_event_tipo_enum:
        | "op_arrival"
        | "f0_checkbox_update"
        | "baseline_freeze"
        | "phase_advance"
        | "phase_revert"
        | "phase_jump"
        | "phase_advance_parcial"
        | "block"
        | "unblock"
        | "replan"
        | "daily_check"
        | "satellite_promise_set"
        | "satellite_received"
        | "uds_recibidas_empaque_set"
        | "score_update"
        | "resource_change"
        | "pendiente_created"
        | "pendiente_status_change"
        | "op_cierre"
        | "componentes_asignados"
        | "avance_corte"
        | "avance_tiqueteo"
        | "observacion_tecnica"
        | "satelite_subestado_change"
      recurso_corte_enum: "morgan" | "manual" | "externo"
      rol_sistema_enum: "admin" | "directivo" | "lider_fase" | "visualizacion"
      satelite_subestado_enum:
        | "corte_externo"
        | "marcacion"
        | "confeccion"
        | "paquete_completo"
      semaforo_enum: "verde" | "amarillo" | "rojo"
      tipo_despacho_enum:
        | "estandar"
        | "cross_docking"
        | "personalizado"
        | "exportacion"
      tipo_empaque_enum: "estandar" | "personalizado" | "exportacion"
      tipo_relacion_enum:
        | "contrato_con_penalizacion"
        | "contrato_sin_penalizacion"
        | "recurrente"
        | "unico"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      canal_cliente_enum: ["colombia", "panama_internacional"],
      causa_desvio_enum: [
        "mp_tardia",
        "calidad_mp",
        "bloqueo_f0",
        "capacidad_corte",
        "capacidad_trazo",
        "capacidad_satelite",
        "capacidad_tiqueteo_empaque",
        "reproceso_interno",
        "reproceso_satelite",
        "cambio_cliente",
        "documentacion_despacho",
        "otro",
        "volumen_parcial",
        "mp_incompleta",
      ],
      cliente_tier_enum: ["tier_1", "tier_2", "estandar"],
      complejidad_enum: ["alta", "media", "baja"],
      condicion_pago_enum: [
        "anticipado",
        "hasta_30d",
        "30_a_60d",
        "mas_de_60d",
      ],
      esquema_facturacion_enum: ["directa", "con_oc_cliente", "resumen_y_oc"],
      fase_enum: [
        "fase_0",
        "compras",
        "trazo",
        "corte",
        "tiqueteo",
        "satelites",
        "empaque",
        "despacho",
        "cierre",
      ],
      motivo_bloqueo_enum: [
        "mp_no_llego",
        "fase_0_incompleta",
        "pendiente_cliente",
        "capacidad_satelite",
        "reproceso",
        "otro",
      ],
      pendiente_estado_enum: ["pendiente", "en_subsanacion", "cerrado"],
      phase_event_tipo_enum: [
        "op_arrival",
        "f0_checkbox_update",
        "baseline_freeze",
        "phase_advance",
        "phase_revert",
        "phase_advance_parcial",
        "block",
        "unblock",
        "replan",
        "daily_check",
        "satellite_promise_set",
        "satellite_received",
        "score_update",
        "resource_change",
        "pendiente_created",
        "pendiente_status_change",
        "op_cierre",
        "componentes_asignados",
        "avance_corte",
        "avance_tiqueteo",
        "observacion_tecnica",
        "satelite_subestado_change",
        "phase_jump",
        "uds_recibidas_empaque_set",
      ],
      recurso_corte_enum: ["morgan", "manual", "externo"],
      rol_sistema_enum: ["admin", "directivo", "lider_fase", "visualizacion"],
      satelite_subestado_enum: [
        "corte_externo",
        "marcacion",
        "confeccion",
        "paquete_completo",
      ],
      semaforo_enum: ["verde", "amarillo", "rojo"],
      tipo_despacho_enum: [
        "estandar",
        "cross_docking",
        "personalizado",
        "exportacion",
      ],
      tipo_empaque_enum: ["estandar", "personalizado", "exportacion"],
      tipo_relacion_enum: [
        "contrato_con_penalizacion",
        "contrato_sin_penalizacion",
        "recurrente",
        "unico",
      ],
    },
  },
} as const
