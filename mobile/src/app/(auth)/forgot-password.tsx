import { useRef, useState } from "react";
import { TextInput } from "react-native";
import { router } from "expo-router";
import { api, errorMessage } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import type { LoginResult } from "@/lib/types";
import { colors, fonts } from "@/lib/theme";
import { Body, Brand, Button, Field, Message, Panel, Screen, TextLink } from "@/components/ui";

// Step 1: email → the server emails a 6-digit code. Step 2: code + new password
// → the password is changed, other devices are signed out, and this one is signed in.
export default function ForgotPasswordScreen() {
  const { completeLogin } = useAuth();
  const [step, setStep] = useState<"email" | "code">("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const passwordRef = useRef<TextInput>(null);
  const confirmRef = useRef<TextInput>(null);

  async function sendCode() {
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) {
      setError("Enter the email on your account.");
      return;
    }
    setError(null);
    setLoading(true);
    try {
      const data = await api<{ message: string }>("/api/auth/forgot-password", { body: { email: email.trim() }, auth: false });
      setNotice(data.message);
      setStep("code");
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  async function reset() {
    if (code.length !== 6) return setError("Enter the 6-digit code from the email.");
    if (password.length < 8) return setError("New password must be at least 8 characters.");
    if (password !== confirm) return setError("Passwords don't match.");
    setError(null);
    setLoading(true);
    try {
      const result = await api<LoginResult>("/api/auth/reset-password", {
        body: { email: email.trim(), code, newPassword: password },
        auth: false
      });
      await completeLogin(result);
    } catch (err) {
      setError(errorMessage(err));
      setLoading(false);
    }
  }

  return (
    <Screen centered>
      <Brand subtitle="Reset your password" />
      <Panel>
        {step === "email" ? (
          <>
            <Body>Enter the email on your account and we&apos;ll send you a 6-digit reset code.</Body>
            <Field
              label="Email"
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="email"
              keyboardType="email-address"
              returnKeyType="send"
              onSubmitEditing={sendCode}
              autoFocus
            />
            <Message kind="error">{error}</Message>
            <Button title="Send code" icon="mail" onPress={sendCode} loading={loading} />
          </>
        ) : (
          <>
            <Message kind="notice">{notice}</Message>
            <Field
              label="Code"
              value={code}
              onChangeText={(v) => setCode(v.replace(/\D/g, "").slice(0, 6))}
              keyboardType="number-pad"
              autoComplete="one-time-code"
              textContentType="oneTimeCode"
              maxLength={6}
              style={{ fontFamily: fonts.mono, fontSize: 22, letterSpacing: 8, color: colors.brassBright }}
              returnKeyType="next"
              onSubmitEditing={() => passwordRef.current?.focus()}
              autoFocus
            />
            <Field
              ref={passwordRef}
              label="New password"
              password
              value={password}
              onChangeText={setPassword}
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
              onSubmitEditing={reset}
            />
            <Message kind="error">{error}</Message>
            <Button title="Set new password" onPress={reset} loading={loading} />
            <TextLink
              title="Didn't get it? Send another code"
              onPress={() => {
                setStep("email");
                setError(null);
              }}
              style={{ textAlign: "center", fontSize: 13 }}
            />
          </>
        )}
      </Panel>
      <Body style={{ textAlign: "center" }}>
        <TextLink title="Back to sign in" onPress={() => router.back()} />
      </Body>
    </Screen>
  );
}
