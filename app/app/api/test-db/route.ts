import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const opNum = searchParams.get('op') || '6748';
  
  const sb = await createServiceClient();
  const { data, error } = await sb.from("ops").select("op_num, fecha_compromiso").eq("op_num", opNum).single();
  
  return NextResponse.json({
    timestamp: new Date().toISOString(),
    opNum,
    data,
    error
  });
}
