import type { Enums } from "@/types/supabase";

const COLOR: Record<Enums<"semaforo_enum">, string> = {
  verde:    "bg-green-500",
  amarillo: "bg-yellow-400",
  rojo:     "bg-red-500",
};

export function SemaforoDot({ semaforo, size = "md" }: { semaforo: Enums<"semaforo_enum"> | null; size?: "sm" | "md" }) {
  const cls = size === "sm" ? "w-2 h-2" : "w-2.5 h-2.5";
  if (!semaforo) return <span className={`${cls} rounded-full bg-gray-300 inline-block`} />;
  return <span className={`${cls} rounded-full inline-block ${COLOR[semaforo]}`} />;
}
