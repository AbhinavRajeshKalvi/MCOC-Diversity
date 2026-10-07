import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/lib/db";
import { requireOfficer } from "@/lib/session";
import { setWarMode } from "@/lib/war-settings";
import { withErrorHandling } from "@/lib/api-handler";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const schema = z.object({ mode: z.enum(["regular", "bigThings"]) });

// Switches the whole alliance between regular and Big Things wars. Each mode
// keeps its own saved plans, so nothing is lost by switching.
export const POST = withErrorHandling("POST /api/war-mode", async (req: NextRequest) => {
  const session = await requireOfficer().catch(() => null);
  if (!session) return NextResponse.json({ error: "Only officers can change the war mode." }, { status: 403 });

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid war mode." }, { status: 400 });

  await setWarMode(await getDb(), parsed.data.mode, session.userId);
  return NextResponse.json({ ok: true, mode: parsed.data.mode });
});
