import { useAuth } from "@/lib/auth";
import { Body, Brand, Message, Panel, Screen, TextLink } from "@/components/ui";
import { PasswordForm } from "@/components/PasswordForm";

// Accounts an officer created on the old website start with a default
// password; they have to pick their own before using the app.
export default function ChangePasswordScreen() {
  const { signOut } = useAuth();
  return (
    <Screen centered>
      <Brand subtitle="Set your password" />
      <Panel>
        <Message kind="warning">You&apos;re using the default password. Set your own before continuing.</Message>
        <PasswordForm hasPassword />
      </Panel>
      <Body style={{ textAlign: "center" }}>
        <TextLink title="Sign out" onPress={signOut} />
      </Body>
    </Screen>
  );
}
