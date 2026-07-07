import { revalidateTag } from "next/cache";
// Next.js 16: revalidateTag requiere un segundo argumento (profile). "max" purga todas las capas.
import { NextRequest, NextResponse } from "next/server";

// POST /api/revalidate
// Invalida el cache de produccion. Llamado por el ETL tras sincronizar datos.
// Header requerido: x-revalidate-secret: <REVALIDATE_SECRET>
export async function POST(request: NextRequest) {
  const secret = request.headers.get("x-revalidate-secret");
  if (!secret || secret !== process.env.REVALIDATE_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  revalidateTag("produccion", "max");
  return NextResponse.json({ revalidated: true });
}
