import InfoPage from "@/components/InfoPage";

export const metadata = { title: "Privacy policy — War Room" };

// Edit the contact address before publishing. Google Play needs a public privacy policy URL.
const CONTACT = process.env.NEXT_PUBLIC_CONTACT_EMAIL || "the app's support email";

export default function PrivacyPage() {
  return (
    <InfoPage title="Privacy policy">
      <p>
        War Room is an alliance planning tool for Marvel Contest of Champions players. It is a fan-made app and is not
        affiliated with Kabam or Marvel.
      </p>
      <h2>What we store</h2>
      <p>
        Your username, in-game name, email address, a hashed password (or your Google account ID if you sign in with
        Google), your alliance membership and role, the champions you add to your roster, and the war plans your
        alliance&apos;s officers make.
      </p>
      <h2>How it is used</h2>
      <p>
        Only to run the app: signing you in, showing your alliance its rosters and plans, and emailing you password reset
        codes. We don&apos;t sell your data, show ads, or share it with anyone except the services that host the app (the
        web host, the database host and the email service).
      </p>
      <h2>Who can see it</h2>
      <p>
        Members of your alliance see your in-game name, role, battlegroup and roster. Your email is never shown to other
        members.
      </p>
      <h2>Deleting your data</h2>
      <p>
        Delete your account any time from Account → Delete account in the app or on the website. This removes your account
        and roster immediately. See <a href="/delete-account">how to delete your account</a>.
      </p>
      <h2>Contact</h2>
      <p>Questions: {CONTACT}.</p>
    </InfoPage>
  );
}
