import { useRef, useState } from "react";
import { TextInput } from "react-native";
import { api, errorMessage } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import type { LoginResult } from "@/lib/types";
import { Button, Field, Message } from "./ui";

/** Change (or, for Google-only accounts, set) the password. Other devices get signed out; this one stays signed in. */
export function PasswordForm({ hasPassword, onDone }: { hasPassword: boolean; onDone?: () => void }) {
  const { completeLogin } = useAuth();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const nextRef = useRef<TextInput>(null);
  const confirmRef = useRef<TextInput>(null);

  async function save() {
    if (hasPassword && !current) return setError("Enter your current password.");
    if (next.length < 8) return setError("New password must be at least 8 characters.");
    if (next !== confirm) return setError("New passwords don't match.");
    setError(null);
    setLoading(true);
    try {
      const result = await api<LoginResult>("/api/account/password", {
        body: { currentPassword: hasPassword ? current : undefined, newPassword: next }
      });
      await completeLogin(result);
      onDone?.();
    } catch (err) {
      setError(errorMessage(err));
      setLoading(false);
    }
  }

  return (
    <>
      {hasPassword && (
        <Field
          label="Current password"
          password
          value={current}
          onChangeText={setCurrent}
          autoComplete="current-password"
          returnKeyType="next"
          onSubmitEditing={() => nextRef.current?.focus()}
        />
      )}
      <Field
        ref={nextRef}
        label="New password"
        hint="At least 8 characters."
        password
        value={next}
        onChangeText={setNext}
        autoComplete="new-password"
        returnKeyType="next"
        onSubmitEditing={() => confirmRef.current?.focus()}
      />
      <Field
        ref={confirmRef}
        label="Confirm new password"
        password
        value={confirm}
        onChangeText={setConfirm}
        autoComplete="new-password"
        returnKeyType="go"
        onSubmitEditing={save}
      />
      <Message kind="error">{error}</Message>
      <Button title="Save password" onPress={save} loading={loading} />
    </>
  );
}
