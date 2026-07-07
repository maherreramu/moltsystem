import type { OPDWithMeta } from "@/lib/queries/kanban";
import { SemaforoDot } from "./semaforo-badge";
import { Lock } from "lucide-react";
import { SUBESTADO_LABEL } from "@/lib/fases";

type Props = {
  opd: OPDWithMeta;
  onClick: (opd: OPDWithMeta) => void;
};

export function OPDCard({ opd, onClick }: Props) {
  return (
    <div
      onClick={() => onClick(opd)}
      className="bg-white border border-gray-200 rounded-lg p-3 shadow-sm hover:shadow-md hover:border-gray-300 transition-all cursor-pointer select-none"
    style={{ contentVisibility: "auto", containIntrinsicSize: "auto 80px" }}
    draggable={false}
    >
      {/* Encabezado: ref + semáforos */}
      <div className="flex items-center justify-between mb-1.5">
        <span className="font-mono text-xs font-semibold text-gray-800">{opd.ref}</span>
        <div className="flex items-center gap-1">
          <SemaforoDot semaforo={opd.semaforo} />
          {opd.semaforo_fase !== undefined && (
            <span title="Semáforo de fase">
              <SemaforoDot semaforo={opd.semaforo_fase} size="sm" />
            </span>
          )}
        </div>
      </div>

      {/* Cliente */}
      <p className="text-xs text-gray-500 truncate mb-2">{opd.cliente_nombre}</p>

      {/* Footer: score + slack + pendientes + bloqueo */}
      <div className="flex items-center gap-2 flex-wrap">
        {opd.score_efectivo != null && (
          <span className="text-[10px] font-medium bg-gray-100 text-gray-700 px-1.5 py-0.5 rounded">
            {opd.score_efectivo}pts
          </span>
        )}
        {opd.slack != null && (
          <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${
            opd.slack >= 3
              ? "bg-green-50 text-green-700"
              : opd.slack >= 0
              ? "bg-yellow-50 text-yellow-700"
              : "bg-red-50 text-red-700"
          }`}>
            {opd.slack >= 0 ? `+${opd.slack}d` : `${opd.slack}d`}
          </span>
        )}
        {opd.pendientes > 0 && (
          <span className="text-[10px] font-medium bg-orange-50 text-orange-700 px-1.5 py-0.5 rounded">
            {opd.pendientes} pend.
          </span>
        )}
        {opd.bloqueada && (
          <span title="Bloqueada" className="text-red-600 flex items-center">
            <Lock className="w-3 h-3" />
          </span>
        )}
        {opd.fase_actual === "satelites" && opd.subestado_satelite && (
          <span className="text-[10px] font-medium bg-purple-50 text-purple-700 px-1.5 py-0.5 rounded">
            {SUBESTADO_LABEL[opd.subestado_satelite as keyof typeof SUBESTADO_LABEL]}
          </span>
        )}
      </div>
    </div>
  );
}
