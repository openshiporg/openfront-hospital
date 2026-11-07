// Server Component
import { Logo } from "../../components/Logo";
import { ResetForm } from "./ResetForm";
import Link from "next/link";
import { passwordResetEmailAvailable, RESET_EMAIL_UNAVAILABLE } from "../../lib/authFlow";

// The reset link carries its token in the URL fragment (#token=...), which never reaches the server,
// so the form decides between request and reset mode in the browser (see resetLinkState.ts).
export async function ResetPage() {
  const emailUnavailable = !passwordResetEmailAvailable();

  return (
    <main className="flex min-h-svh w-full items-center justify-center p-6 md:p-10">
      <div className="w-full max-w-sm">
        <div className="flex items-center space-x-1.5">
          <Logo aria-hidden="true" />
        </div>
        <ResetForm requestUnavailableMessage={emailUnavailable ? RESET_EMAIL_UNAVAILABLE : null} />
        <p className="mt-6 text-sm">
          <Link
            href="/dashboard/signin"
            className="font-medium text-primary hover:text-primary/90 dark:text-primary hover:dark:text-primary/90"
          >
            Back to sign in
          </Link>
        </p>
      </div>
    </main>
  );
}
