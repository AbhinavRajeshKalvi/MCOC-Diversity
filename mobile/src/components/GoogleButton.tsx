import { useState } from "react";
import { api, errorMessage } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { getGoogleIdToken, googleSignInAvailable } from "@/lib/google";
import type { LoginResult } from "@/lib/types";
import { Button, Divider } from "./ui";

/** "Continue with Google". Hidden unless the build has a Google client ID configured. */
export function GoogleButton({ onError }: { onError: (message: string | null) => void }) {
  const { completeLogin } = useAuth();
  const [loading, setLoading] = useState(false);
  if (!googleSignInAvailable) return null;

  async function signIn() {
    onError(null);
    setLoading(true);
    try {
      const idToken = await getGoogleIdToken();
      if (!idToken) return;
      const result = await api<LoginResult>("/api/auth/google", { body: { idToken }, auth: false });
      await completeLogin(result);
    } catch (err) {
      onError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <Divider label="or" />
      <Button title="Continue with Google" icon="log-in" variant="ghost" onPress={signIn} loading={loading} />
    </>
  );
}
