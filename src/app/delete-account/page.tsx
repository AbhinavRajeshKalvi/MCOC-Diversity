import InfoPage from "@/components/InfoPage";

export const metadata = { title: "Delete your account — War Room" };

const CONTACT = process.env.NEXT_PUBLIC_CONTACT_EMAIL || "the app's support email";

// Google Play requires a web page explaining how to delete an account.
export default function DeleteAccountPage() {
  return (
    <InfoPage title="Delete your account">
      <p>You can delete your War Room account and all data tied to it at any time.</p>
      <h2>In the app</h2>
      <p>Open the Account screen (the person icon at the top right), then tap Delete account and confirm.</p>
      <h2>On the website</h2>
      <p>
        <a href="/login">Sign in</a>, open Account from the menu, and choose Delete my account.
      </p>
      <h2>What gets deleted</h2>
      <p>
        Your account (username, name, email, password or Google link), your roster, and your places in your alliance&apos;s
        war plans are deleted right away. If you&apos;re the last member of an alliance, the alliance and its plans are deleted
        too. Leaders need to make another member Leader first.
      </p>
      <h2>Can&apos;t sign in?</h2>
      <p>Email {CONTACT} from the address on your account and we&apos;ll delete it for you.</p>
    </InfoPage>
  );
}
