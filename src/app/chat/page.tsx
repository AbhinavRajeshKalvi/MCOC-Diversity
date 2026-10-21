import { requirePageSession } from "@/lib/session";
import { getDb } from "@/lib/db";
import { loadChatMember } from "@/lib/chat";
import { channelsFor, isChatChannel } from "@/lib/chat-channels";
import AppShell from "@/components/AppShell";
import ChatPanel from "@/components/ChatPanel";
import DbErrorNotice from "@/components/DbErrorNotice";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function ChatPage({ searchParams }: { searchParams: { c?: string } }) {
  const session = await requirePageSession();

  let member: Awaited<ReturnType<typeof loadChatMember>> = null;
  let dbError: string | null = null;
  try {
    member = await loadChatMember(await getDb(), session.userId);
  } catch (err) {
    console.error("Chat page failed to load:", err);
    dbError = err instanceof Error ? err.message : "Unexpected server error.";
  }

  const channels = member ? channelsFor(member) : ["alliance" as const];
  const requested = isChatChannel(searchParams.c) && channels.includes(searchParams.c) ? searchParams.c : null;
  const initialChannel = requested ?? "alliance";

  return (
    <AppShell session={session}>
      <h1 className="page-title">Chat</h1>
      <p className="page-lede">
        Talk with your whole alliance, or just your battlegroup.
        {member?.battlegroup ? "" : " You'll get a battlegroup chat once an officer puts you in a battlegroup."}
      </p>
      {dbError ? (
        <DbErrorNotice message={dbError} />
      ) : (
        <ChatPanel
          channels={channels}
          initialChannel={initialChannel}
          myBattlegroup={member?.battlegroup ?? null}
          viewer={{ userId: session.userId, role: session.role }}
        />
      )}
    </AppShell>
  );
}
