import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  AppState,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View
} from "react-native";
import { useFocusEffect } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { errorMessage } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { confirm } from "@/lib/confirm";
import {
  CHAT_CHANNEL_LABELS,
  MAX_CHAT_MESSAGE_LENGTH,
  chatChannelsFor,
  deleteChat,
  loadChat,
  mergeMessages,
  openChatStream,
  sendChat,
  type ChatChannel,
  type ChatMessage
} from "@/lib/chat";
import { colors, fonts, radius } from "@/lib/theme";
import { isOfficerRole, ROLE_LABEL } from "@/lib/types";
import { Segmented } from "@/components/Segmented";
import { Backdrop, styles as ui } from "@/components/ui";

type Status = "connecting" | "live" | "reconnecting" | "denied";

/** Messages from the same member within this long share one name header. */
const GROUP_WINDOW_MS = 5 * 60_000;

const ROLE_COLORS: Partial<Record<string, string>> = {
  admin: colors.mystic,
  leader: colors.brassBright,
  officer: colors.cosmic
};

function formatTime(iso: string): string {
  const date = new Date(iso);
  const sameDay = date.toDateString() === new Date().toDateString();
  const time = date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  return sameDay ? time : `${date.toLocaleDateString([], { month: "short", day: "numeric" })}, ${time}`;
}

export default function ChatTab() {
  const { user, refresh } = useAuth();
  const channels = user ? chatChannelsFor(user) : (["alliance"] as ChatChannel[]);
  const [channel, setChannel] = useState<ChatChannel>("alliance");
  // A battlegroup move can take a chat away; fall back to the alliance chat.
  const shown = channels.includes(channel) ? channel : "alliance";

  return (
    <View style={ui.fill}>
      <Backdrop />
      {channels.length > 1 && (
        <View style={styles.picker}>
          <Segmented
            options={channels.map((c) => ({
              value: c,
              label: c === `bg${user?.battlegroup}` && c !== "alliance" ? `${CHAT_CHANNEL_LABELS[c]} ★` : CHAT_CHANNEL_LABELS[c]
            }))}
            value={shown}
            onChange={setChannel}
          />
        </View>
      )}
      {/* Remount per chat so each has its own history and connection. */}
      <ChatRoom key={shown} channel={shown} onDenied={refresh} />
    </View>
  );
}

function ChatRoom({ channel, onDenied }: { channel: ChatChannel; onDenied: () => void }) {
  const { user } = useAuth();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [status, setStatus] = useState<Status>("connecting");
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const lastId = useRef<string | null>(null);
  const officer = isOfficerRole(user?.role);

  useEffect(() => {
    if (messages.length) lastId.current = messages[messages.length - 1]!.id;
  }, [messages]);

  // Live while the tab is on screen and the app is in the foreground; on
  // return it reconnects from the last message it has and catches up.
  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      let close: (() => void) | null = null;
      let retry: ReturnType<typeof setTimeout> | undefined;
      let active = AppState.currentState === "active";

      const connect = () => {
        if (cancelled || !active) return;
        close?.();
        close = openChatStream(channel, lastId.current, {
          onReady: () => setStatus("live"),
          onMessage: (message) => setMessages((current) => mergeMessages(current, [message])),
          onDelete: (id) => setMessages((current) => current.filter((m) => m.id !== id)),
          onDenied: () => {
            setStatus("denied");
            onDenied();
          },
          onClosed: () => {
            if (cancelled || !active) return;
            setStatus("reconnecting");
            retry = setTimeout(connect, 3000);
          }
        });
      };

      const start = async () => {
        if (!lastId.current) {
          try {
            const data = await loadChat(channel);
            if (cancelled) return;
            setMessages((current) => mergeMessages(current, data.messages));
            setHasMore(data.hasMore);
            if (data.messages.length) lastId.current = data.messages[data.messages.length - 1]!.id;
            setError(null);
          } catch (err) {
            if (cancelled) return;
            setError(errorMessage(err));
          } finally {
            if (!cancelled) setLoaded(true);
          }
        }
        connect();
      };
      start();

      const sub = AppState.addEventListener("change", (next) => {
        const nowActive = next === "active";
        if (nowActive === active) return;
        active = nowActive;
        clearTimeout(retry);
        if (active) {
          setStatus("reconnecting");
          connect();
        } else {
          close?.();
          close = null;
        }
      });

      return () => {
        cancelled = true;
        clearTimeout(retry);
        close?.();
        sub.remove();
      };
    }, [channel, onDenied])
  );

  const loadOlder = useCallback(async () => {
    if (!hasMore || loadingOlder || !messages.length) return;
    setLoadingOlder(true);
    try {
      const data = await loadChat(channel, messages[0]!.id);
      setMessages((current) => mergeMessages(current, data.messages));
      setHasMore(data.hasMore);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoadingOlder(false);
    }
  }, [channel, hasMore, loadingOlder, messages]);

  async function send() {
    const text = draft.trim();
    if (!text || sending) return;
    setSending(true);
    setError(null);
    try {
      const { message } = await sendChat(channel, text);
      setMessages((current) => mergeMessages(current, [message]));
      setDraft("");
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSending(false);
    }
  }

  async function remove(message: ChatMessage) {
    const ok = await confirm("Remove message?", "It's removed for everyone in this chat.", "Remove", true);
    if (!ok) return;
    try {
      await deleteChat(channel, message.id);
      setMessages((current) => current.filter((m) => m.id !== message.id));
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  // The list is inverted so it starts at the newest message.
  const newestFirst = [...messages].reverse();
  const statusColor = status === "live" ? colors.tealBright : status === "denied" ? colors.crimsonBright : colors.brass;
  const statusLabel =
    status === "live" ? "Live" : status === "connecting" ? "Connecting…" : status === "denied" ? "No access" : "Reconnecting…";

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <View style={styles.statusRow}>
        <Text style={styles.roomTitle}>{CHAT_CHANNEL_LABELS[channel]} chat</Text>
        <View style={styles.statusPill} accessibilityLiveRegion="polite">
          <View style={[styles.dot, { backgroundColor: statusColor }]} />
          <Text style={styles.statusText}>{statusLabel}</Text>
        </View>
      </View>

      {!loaded ? (
        <View style={[styles.flex, styles.center]}>
          <ActivityIndicator color={colors.brassBright} />
        </View>
      ) : (
        <FlatList
          style={styles.flex}
          contentContainerStyle={styles.list}
          inverted
          data={newestFirst}
          keyExtractor={(m) => m.id}
          keyboardShouldPersistTaps="handled"
          onEndReached={loadOlder}
          onEndReachedThreshold={0.3}
          ListFooterComponent={loadingOlder ? <ActivityIndicator color={colors.parchmentFaint} style={{ marginVertical: 12 }} /> : null}
          ListEmptyComponent={
            <Text style={styles.empty}>
              No messages yet. Say hello to your {channel === "alliance" ? "alliance" : "battlegroup"}.
            </Text>
          }
          renderItem={({ item, index }) => {
            // Inverted: the message shown above this one is the next in the array.
            const previous = newestFirst[index + 1];
            const grouped =
              previous &&
              previous.userId === item.userId &&
              Date.parse(item.createdAt) - Date.parse(previous.createdAt) < GROUP_WINDOW_MS;
            const mine = item.userId === user?.id;
            return (
              <MessageRow
                message={item}
                grouped={Boolean(grouped)}
                mine={mine}
                onLongPress={mine || officer ? () => remove(item) : undefined}
              />
            );
          }}
        />
      )}

      {error ? <Text style={styles.error}>{error}</Text> : null}
      {status === "denied" ? (
        <Text style={styles.denied}>You no longer have access to this chat.</Text>
      ) : (
        <View style={styles.composer}>
          <TextInput
            value={draft}
            onChangeText={setDraft}
            placeholder={`Message ${CHAT_CHANNEL_LABELS[channel]}`}
            placeholderTextColor={colors.parchmentFaint}
            selectionColor={colors.brass}
            maxLength={MAX_CHAT_MESSAGE_LENGTH}
            multiline
            style={styles.input}
            accessibilityLabel="Message"
          />
          <Pressable
            onPress={send}
            disabled={!draft.trim() || sending}
            accessibilityRole="button"
            accessibilityLabel="Send"
            style={({ pressed }) => [styles.send, (!draft.trim() || sending) && styles.sendOff, pressed && { opacity: 0.85 }]}
          >
            {sending ? <ActivityIndicator size="small" color={colors.ink} /> : <Feather name="send" size={18} color={colors.ink} />}
          </Pressable>
        </View>
      )}
    </KeyboardAvoidingView>
  );
}

function MessageRow({
  message,
  grouped,
  mine,
  onLongPress
}: {
  message: ChatMessage;
  grouped: boolean;
  mine: boolean;
  onLongPress?: () => void;
}) {
  const roleColor = ROLE_COLORS[message.role];
  return (
    <Pressable
      onLongPress={onLongPress}
      delayLongPress={350}
      accessibilityHint={onLongPress ? "Long press to remove" : undefined}
      style={({ pressed }) => [styles.message, !grouped && styles.messageFirst, pressed && onLongPress && styles.messagePressed]}
    >
      {!grouped && (
        <View style={styles.header}>
          <Text style={[styles.name, mine && { color: colors.brassBright }]} numberOfLines={1}>
            {message.displayName}
          </Text>
          {roleColor ? <Text style={[styles.role, { color: roleColor }]}>{ROLE_LABEL[message.role]}</Text> : null}
          <Text style={styles.time}>{formatTime(message.createdAt)}</Text>
        </View>
      )}
      <Text style={styles.text} selectable>
        {message.text}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  center: { alignItems: "center", justifyContent: "center" },
  picker: { paddingHorizontal: 16, paddingTop: 12 },
  statusRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.line
  },
  roomTitle: { fontFamily: fonts.displaySemi, fontSize: 18, color: colors.parchment, textTransform: "uppercase", letterSpacing: 1 },
  statusPill: { flexDirection: "row", alignItems: "center", gap: 6 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  statusText: { fontFamily: fonts.body, fontSize: 12, color: colors.parchmentFaint },
  list: { paddingHorizontal: 16, paddingVertical: 12, flexGrow: 1 },
  empty: {
    fontFamily: fonts.body,
    fontSize: 14,
    color: colors.parchmentFaint,
    textAlign: "center",
    padding: 24,
    // The list is inverted, so flip the empty text back upright.
    transform: [{ scaleY: -1 }]
  },
  message: { paddingVertical: 2, borderRadius: radius.sm },
  messageFirst: { marginTop: 12 },
  messagePressed: { backgroundColor: "rgba(255,255,255,0.05)" },
  header: { flexDirection: "row", alignItems: "baseline", gap: 8, marginBottom: 2 },
  name: { fontFamily: fonts.bodySemi, fontSize: 14, color: colors.parchment, flexShrink: 1 },
  role: { fontFamily: fonts.bodySemi, fontSize: 10, textTransform: "uppercase", letterSpacing: 1 },
  time: { fontFamily: fonts.body, fontSize: 11, color: colors.parchmentFaint },
  text: { fontFamily: fonts.body, fontSize: 15, lineHeight: 21, color: colors.parchmentDim },
  error: {
    fontFamily: fonts.body,
    fontSize: 13,
    color: colors.crimsonBright,
    backgroundColor: "rgba(194,54,78,0.1)",
    paddingHorizontal: 16,
    paddingVertical: 8
  },
  denied: { fontFamily: fonts.body, fontSize: 14, color: colors.parchmentFaint, padding: 16, borderTopWidth: 1, borderTopColor: colors.line },
  composer: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 8,
    padding: 10,
    borderTopWidth: 1,
    borderTopColor: colors.line,
    backgroundColor: colors.panel
  },
  input: {
    flex: 1,
    maxHeight: 120,
    minHeight: 44,
    fontFamily: fonts.body,
    fontSize: 16,
    color: colors.parchment,
    backgroundColor: "rgba(13,15,20,0.7)",
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.sm,
    paddingHorizontal: 12,
    paddingTop: 11,
    paddingBottom: 11
  },
  send: {
    width: 44,
    height: 44,
    borderRadius: radius.sm,
    backgroundColor: colors.brassBright,
    alignItems: "center",
    justifyContent: "center"
  },
  sendOff: { opacity: 0.45 }
});
