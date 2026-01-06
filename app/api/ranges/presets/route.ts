import { createServerComponentClient } from "@/lib/supabaseClient";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const supabase = await createServerComponentClient();

    // Fetch all presets, ordered by category then name
    const { data, error } = await supabase
      .from("range_presets")
      .select("*")
      .order("category", { ascending: true })
      .order("name", { ascending: true });

    if (error) {
      console.error("[Ranges Presets API] Database error:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Ensure we always return an array
    return NextResponse.json(data || []);
  } catch (err: any) {
    console.error("[Ranges Presets API] Unexpected error:", err);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 }
    );
  }
}
