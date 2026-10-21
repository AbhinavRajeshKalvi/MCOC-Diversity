import { useRef, useState } from "react";
import { TextInput } from "react-native";
import { router } from "expo-router";
import { api, errorMessage } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import type { LoginResult } from "@/lib/types";
import { Body, Brand, Button, Field, Message, Panel, Screen, TextLink } from "@/components/ui";
import { GoogleButton } from "@/components/GoogleButton";

const USERNAME = /^[a-zA-Z0-9_.-]{3,32}$/;

export default function SignUpScreen() {
  const { completeLogin } = useAuth();
  const [form, setForm] = useState({ displayName: "", username: "", email: "", password: "", confirm: "" });
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const refs = {
    username: useRef<TextInput>(null),
    email: useRef<TextInput>(null),
    password: useRef<TextInput>(null),
    confirm: useRef<TextInput>(null)
  };
  const set = (key: keyof typeof form) => (value: string) => setForm((f) => ({ ...f, [key]: value }));

  function validate(): string | null {
    if (!form.displayName.trim()) return "Enter your in-game name.";
    if (!USERNAME.test(form.username.trim())) return "Usernames are 3–32 letters, numbers, dots, dashes or underscores.";
    if (!/^\S+@\S+\.\S+$/.test(form.email.trim())) return "Enter a valid email address.";
    if (form.password.length < 8) return "Passwords need at least 8 characters.";
    if (form.password !== form.confirm) return "Passwords don't match.";
    return null;
  }

  async function signUp() {
    const problem = validate();
    if (problem) {
      setError(problem);
      return;
    }
    setError(null);
    setLoading(true);
    try {
      const result = await api<LoginResult>("/api/auth/signup", {
        body: {
          displayName: form.displayName.trim(),
          username: form.username.trim(),
          email: form.email.trim(),
          password: form.password
        },
        auth: false
      });
      await completeLogin(result);
    } catch (err) {
      setError(errorMessage(err));
      setLoading(false);
    }
  }

  return (
    <Screen>
      <Brand subtitle="Create your account" />
      <Panel>
        <Field
          label="In-game name"
          value={form.displayName}
          onChangeText={set("displayName")}
          maxLength={60}
          autoCapitalize="words"
          returnKeyType="next"
          onSubmitEditing={() => refs.username.current?.focus()}
        />
        <Field
          ref={refs.username}
          label="Username"
          hint="For signing in. Letters, numbers, dots, dashes and underscores."
          value={form.username}
          onChangeText={set("username")}
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="username-new"
          maxLength={32}
          returnKeyType="next"
          onSubmitEditing={() => refs.email.current?.focus()}
        />
        <Field
          ref={refs.email}
          label="Email"
          hint="Only used to send you a code if you forget your password."
          value={form.email}
          onChangeText={set("email")}
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="email"
          keyboardType="email-address"
          textContentType="emailAddress"
          returnKeyType="next"
          onSubmitEditing={() => refs.password.current?.focus()}
        />
        <Field
          ref={refs.password}
          label="Password"
          hint="At least 8 characters."
          password
          value={form.password}
          onChangeText={set("password")}
          autoComplete="new-password"
          textContentType="newPassword"
          returnKeyType="next"
          onSubmitEditing={() => refs.confirm.current?.focus()}
        />
        <Field
          ref={refs.confirm}
          label="Confirm password"
          password
          value={form.confirm}
          onChangeText={set("confirm")}
          autoComplete="new-password"
          returnKeyType="go"
          onSubmitEditing={signUp}
        />
        <Message kind="error">{error}</Message>
        <Button title="Create account" onPress={signUp} loading={loading} />
        <GoogleButton onError={setError} />
      </Panel>
      <Body style={{ textAlign: "center" }}>
        Already have an account? <TextLink title="Sign in" onPress={() => router.back()} />
      </Body>
    </Screen>
  );
}
