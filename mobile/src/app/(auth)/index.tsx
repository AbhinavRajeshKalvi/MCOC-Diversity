import { useRef, useState } from "react";
import { Text, TextInput, View } from "react-native";
import { router } from "expo-router";
import { api, errorMessage } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import type { LoginResult } from "@/lib/types";
import { colors, fonts } from "@/lib/theme";
import { Body, Brand, Button, Field, Message, Panel, Screen, TextLink } from "@/components/ui";
import { GoogleButton } from "@/components/GoogleButton";

export default function SignInScreen() {
  const { completeLogin } = useAuth();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const passwordRef = useRef<TextInput>(null);

  async function signIn() {
    if (!username.trim() || !password) {
      setError("Enter your username or email and your password.");
      return;
    }
    setError(null);
    setLoading(true);
    try {
      const result = await api<LoginResult>("/api/auth/login", { body: { username: username.trim(), password }, auth: false });
      await completeLogin(result);
    } catch (err) {
      setError(errorMessage(err));
      setLoading(false);
    }
  }

  return (
    <Screen centered>
      <Brand />
      <Panel>
        <Field
          label="Username or email"
          value={username}
          onChangeText={setUsername}
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="username"
          textContentType="username"
          returnKeyType="next"
          onSubmitEditing={() => passwordRef.current?.focus()}
        />
        <Field
          ref={passwordRef}
          label="Password"
          password
          value={password}
          onChangeText={setPassword}
          autoComplete="current-password"
          textContentType="password"
          returnKeyType="go"
          onSubmitEditing={signIn}
        />
        <TextLink title="Forgot password?" onPress={() => router.push("/forgot-password")} style={{ alignSelf: "flex-end", fontSize: 13 }} />
        <Message kind="error">{error}</Message>
        <Button title="Sign in" onPress={signIn} loading={loading} />
        <GoogleButton onError={setError} />
      </Panel>
      <View style={{ alignItems: "center", gap: 6 }}>
        <Body style={{ textAlign: "center" }}>New to War Room?</Body>
        <Button title="Create an account" variant="ghost" icon="user-plus" onPress={() => router.push("/sign-up")} style={{ alignSelf: "stretch" }} />
        <Text style={{ fontFamily: fonts.body, fontSize: 12, color: colors.parchmentFaint, textAlign: "center", marginTop: 6 }}>
          After signing up, create your alliance or join one with the code your Leader sends you.
        </Text>
      </View>
    </Screen>
  );
}
