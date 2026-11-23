import { useCallback, useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import * as Clipboard from "expo-clipboard";
import { api, errorMessage } from "@/lib/api";
import { colors, fonts } from "@/lib/theme";
import { Body, Button, Label, Message, Panel, SectionTitle } from "@/components/ui";

// The Discord section of the Account screen. Linking lets the alliance's
// Discord bot book nodes, answer node requests and show war info as you.

type Status = { linked: boolean; discordUsername: string | null };

export function DiscordLinkPanel() {
  const [status, setStatus] = useState<Status | null>(null);
  const [code, setCode] = useState<{ code: string; expiresAt: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const data = await api<Status>("/api/discord/link");
      setStatus(data);
      if (data.linked) setCode(null);
    } catch (err) {
      setError(errorMessage(err));
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // While a code is showing, check every few seconds whether it was used.
  useEffect(() => {
    if (!code) return;
    const timer = setInterval(() => {
      if (new Date(code.expiresAt).getTime() < Date.now()) setCode(null);
      else void refresh();
    }, 4000);
    return () => clearInterval(timer);
  }, [code, refresh]);

  async function makeCode() {
    setError(null);
    setBusy(true);
    try {
      setCode(await api("/api/discord/link", { method: "POST", body: {} }));
      setCopied(false);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function unlink() {
    setError(null);
    setBusy(true);
    try {
      await api("/api/discord/link", { method: "DELETE" });
      await refresh();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Panel>
      <SectionTitle>Discord</SectionTitle>
      <Message kind="error">{error}</Message>
      {!status ? (
        <Body>Loading…</Body>
      ) : status.linked ? (
        <>
          <Body>
            Linked to @{status.discordUsername}. The alliance bot can book nodes and answer node requests for you.
          </Body>
          <Button title="Unlink Discord" icon="x-circle" variant="ghost" onPress={unlink} loading={busy} />
        </>
      ) : code ? (
        <>
          <Body>In your alliance&apos;s Discord server, type this command:</Body>
          <View style={styles.codeRow}>
            <Text style={styles.code} selectable>
              /link {code.code}
            </Text>
          </View>
          <Button
            title={copied ? "Copied" : "Copy code"}
            icon="copy"
            variant="ghost"
            onPress={async () => {
              await Clipboard.setStringAsync(code.code);
              setCopied(true);
            }}
          />
          <Label>The code works once, for 10 minutes.</Label>
        </>
      ) : (
        <>
          <Body>
            Link your Discord account to book nodes, answer node requests and see war info from your alliance&apos;s Discord
            server.
          </Body>
          <Button title="Link Discord" icon="link" onPress={makeCode} loading={busy} />
        </>
      )}
    </Panel>
  );
}

const styles = StyleSheet.create({
  codeRow: { alignItems: "center", paddingVertical: 6 },
  code: { fontFamily: fonts.mono, fontSize: 24, letterSpacing: 4, color: colors.brass }
});
