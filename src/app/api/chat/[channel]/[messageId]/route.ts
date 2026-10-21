import { NextResponse } from "next/server";
import { getDb, toObjectId } from "@/lib/db";
import { requireAlliance } from "@/lib/session";
import { isOfficerRole } from "@/lib/auth";
import { withErrorHandling } from "@/lib/api-handler";
import { CHAT_COLLECTION, loadChatMember, memberCanUse, publishChatEvent } from "@/lib/chat";
import { isChatChannel } from "@/lib/chat-channels";

export const dynamic = "force-dynamic";

// Removes a message: members can remove their own, officers can remove anyone's.
export const DELETE = withErrorHandling(
  "DELETE /api/chat/message",
  async (_req: Request, { params }: { params: { channel: string; messageId: string } }) => {
    const session = await requireAlliance();
    const id = toObjectId(params.messageId);
    if (!isChatChannel(params.channel) || !id) return NextResponse.json({ error: "Message not found." }, { status: 404 });

    const db = await getDb();
    const member = await loadChatMember(db, session.userId);
    if (!member || !memberCanUse(member, session.allianceId, params.channel)) {
      return NextResponse.json({ error: "You don't have permission to do that." }, { status: 403 });
    }
    const messages = db.collection(CHAT_COLLECTION);
    const message = await messages.findOne({ _id: id, allianceId: member.allianceId, channel: params.channel });
    if (!message || message.deletedAt) return NextResponse.json({ error: "Message not found." }, { status: 404 });
    if (String(message.userId) !== session.userId && !isOfficerRole(member.role)) {
      return NextResponse.json({ error: "Only officers can remove other members' messages." }, { status: 403 });
    }

    // Kept as an empty tombstone so live connections hear about the removal.
    await messages.updateOne(
      { _id: id },
      { $set: { deletedAt: new Date(), deletedBy: toObjectId(session.userId), text: "" } }
    );
    await publishChatEvent({ type: "delete", allianceId: session.allianceId, channel: params.channel, id: params.messageId });
    return NextResponse.json({ ok: true });
  }
);
