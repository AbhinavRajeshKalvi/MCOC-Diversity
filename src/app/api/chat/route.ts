import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { requireAlliance } from "@/lib/session";
import { withErrorHandling } from "@/lib/api-handler";
import { loadChatMember } from "@/lib/chat";
import { channelsFor } from "@/lib/chat-channels";

export const dynamic = "force-dynamic";

// The chats the signed-in member can use (for the floating chat button).
export const GET = withErrorHandling("GET /api/chat", async () => {
  const session = await requireAlliance();
  const member = await loadChatMember(await getDb(), session.userId);
  if (!member) return NextResponse.json({ error: "Create or join an alliance first." }, { status: 403 });
  return NextResponse.json({ channels: channelsFor(member), battlegroup: member.battlegroup });
});
