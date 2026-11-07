'use client';

import { useEffect, useState } from "react";
import { useFormStatus } from "react-dom";
import { useActionState } from "react";
import { RiLoader2Fill } from "@remixicon/react";
import { Eye, EyeOff } from "lucide-react";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { resetPassword } from "@/features/dashboard/actions";
import { PASSWORD_RECOVERY_UNAVAILABLE_MESSAGE } from "@/features/dashboard/actions/authFeedback";
import { passwordResetLinkState, type PasswordResetLinkState } from "./resetLinkState";

type ResetFormProps = {
  /** Mail delivery is not set up, so a reset link cannot be requested (redeeming one still works). */
  requestUnavailableMessage?: string | null;
}

type ActionState = {
  message: string | null;
  success: string | null;
  formData: {
    email: string;
  };
};

const initialState: ActionState = {
  message: null,
  success: null,
  formData: {
    email: '',
  }
};

function SubmitButton({ mode }: { mode: "reset" | "request" }) {
  const { pending } = useFormStatus();

  return (
    <Button
      type="submit"
      className="w-full py-2 font-medium"
      disabled={pending}
    >
      {pending ? (
        <>
          <RiLoader2Fill className="size-4 shrink-0 animate-spin" aria-hidden="true" />
          {mode === "reset" ? "Resetting password…" : "Requesting reset link…"}
        </>
      ) : (
        mode === "reset" ? "Reset password" : "Send reset link"
      )}
    </Button>
  );
}

async function formAction(
  prevState: ActionState | null,
  formData: FormData,
  mode: "reset" | "request",
  token: string | null
): Promise<ActionState> {
  if (mode === 'reset' && token) {
    formData.set('token', token);
  }
  try {
    const result = await resetPassword(prevState ?? initialState, formData, mode);
    return {
      message: ('message' in result ? result.message : null) ?? null,
      success: ('success' in result ? result.success : null) ?? null,
      formData: result.formData
    };
  } catch {
    // The server action itself could not be reached (network or deploy in progress).
    return { message: PASSWORD_RECOVERY_UNAVAILABLE_MESSAGE, success: null, formData: { email: String(formData.get('email') || '') } };
  }
}

export function ResetForm({ requestUnavailableMessage = null }: ResetFormProps) {
  const [showPassword, setShowPassword] = useState(false);
  // The request form renders straight away; a reset link's token lives in the URL fragment (never sent
  // to the server or logged), so it is read after hydration and then removed from the address bar.
  const [link, setLink] = useState<PasswordResetLinkState>({ mode: 'request', token: null });
  useEffect(() => {
    const next = passwordResetLinkState(window.location.hash);
    setLink(next);
    if (window.location.hash) window.history.replaceState(null, '', window.location.pathname + window.location.search);
  }, []);

  const mode = link.mode === 'reset' ? 'reset' : 'request';
  const [state, dispatch] = useActionState(
    (prevState: ActionState | null, formData: FormData) => formAction(prevState, formData, mode, link.token),
    initialState
  );

  return (
    <>
      <h1 className="mt-6 text-lg font-semibold text-foreground dark:text-foreground">
        {mode === "reset" ? "Reset your password" : "Reset password"}
      </h1>
      <p className="mt-2 text-sm text-muted-foreground dark:text-muted-foreground">
        {mode === "reset"
          ? "Enter your new password below."
          : requestUnavailableMessage
            ? requestUnavailableMessage
            : "Enter your email address and we'll send you a link to reset your password."}
      </p>

      {link.mode === 'invalid' && (
        <div role="alert" aria-live="assertive" className="mt-4 rounded-sm border border-destructive/50 bg-destructive/5 p-4 text-sm text-foreground">
          This reset link is invalid or incomplete. Request a new link below.
        </div>
      )}

      {(mode === 'reset' || !requestUnavailableMessage) && (
        <form action={dispatch} className="mt-8 space-y-4">
          <div>
            <Label
              htmlFor="email"
              className="text-sm font-medium text-foreground dark:text-foreground"
            >
              Email
            </Label>
            <Input
              type="email"
              id="email"
              name="email"
              autoComplete="email"
              placeholder="you@example.com"
              className="mt-2 bg-muted/40"
              defaultValue={state.formData.email}
              required
            />
          </div>
          {mode === "reset" && (
            <div>
              <Label
                htmlFor="password"
                className="text-sm font-medium text-foreground dark:text-foreground"
              >
                New Password
              </Label>
              <div className="relative mt-2">
                <Input
                  type={showPassword ? "text" : "password"}
                  id="password"
                  name="password"
                  autoComplete="new-password"
                  placeholder="••••••••"
                  className="pr-10 bg-muted/40"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  className="absolute inset-y-0 right-0 flex items-center pr-3 text-gray-400 hover:text-gray-500"
                >
                  {showPassword ? (
                    <EyeOff className="h-4 w-4" aria-hidden="true" />
                  ) : (
                    <Eye className="h-4 w-4" aria-hidden="true" />
                  )}
                </button>
              </div>
            </div>
          )}
          <SubmitButton mode={mode} />
        </form>
      )}

      {state.message && (
        <div role="alert" aria-live="assertive" className="mt-4 flex flex-col gap-1 rounded-sm border border-destructive/50 bg-destructive/5 p-4">
          <h2 className="text-sm font-semibold text-foreground">Error</h2>
          <span className="break-words text-sm text-muted-foreground">{state.message}</span>
        </div>
      )}
      {state.success && (
        <div role="status" aria-live="polite" className="mt-4 flex flex-col gap-1 rounded-sm border border-border p-4">
          <h2 className="text-sm font-semibold text-foreground">Success</h2>
          <span className="break-words text-sm text-muted-foreground">{state.success}</span>
        </div>
      )}
    </>
  );
}
