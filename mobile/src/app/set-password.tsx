import { useState } from "react";
import { router } from "expo-router";
import { useAuth } from "@/lib/auth";
import { Body, Message, Panel, Screen } from "@/components/ui";
import { PasswordForm } from "@/components/PasswordForm";

export default function SetPasswordScreen() {
  const { user } = useAuth();
  const [done, setDone] = useState(false);
  const hasPassword = Boolean(user?.hasPassword);
  return (
    <Screen edges={["bottom"]}>
      <Panel>
        {!hasPassword && <Body>You sign in with Google. Set a password if you also want to sign in with your username.</Body>}
        <Message kind="notice">{done ? "Password saved. You've been signed out on your other devices." : null}</Message>
        <PasswordForm
          hasPassword={hasPassword}
          onDone={() => {
            setDone(true);
            setTimeout(() => router.back(), 900);
          }}
        />
      </Panel>
    </Screen>
  );
}
