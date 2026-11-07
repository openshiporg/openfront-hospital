'use client';

import { useState } from "react";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { RiLoader2Fill } from "@remixicon/react";
import { Eye, EyeOff } from "lucide-react";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { signIn } from "@/features/dashboard/actions";

type SignInFormProps = {
  from: string;
}

type ActionState = {
  message: string | null;
  formData: {
    email: string;

  };
};

const initialState: ActionState = {
  message: null,
  formData: {
    email: '',

  }
};

function SubmitButton() {
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
          Signing in…
        </>
      ) : (
        "Sign in"
      )}
    </Button>
  );
}

export function SignInForm({ from }: SignInFormProps) {
  const [showPassword, setShowPassword] = useState(false);
  const [state, formAction] = useActionState(signIn, initialState);

  return (
    <>
      <form action={formAction} className="mt-8 space-y-4">
        <input type="hidden" name="from" value={from} />
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
        <div>
          <Label
            htmlFor="password"
            className="text-sm font-medium text-foreground dark:text-foreground"
          >
            Password
          </Label>
          <div className="relative mt-2">
            <Input
              type={showPassword ? "text" : "password"}
              id="password"
              name="password"
              autoComplete="current-password"
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
        <SubmitButton />
      </form>

      {state.message && (
        <div role="alert" aria-live="assertive" className="mt-4 flex flex-col gap-1 rounded-sm border border-destructive/50 bg-destructive/5 p-4">
          <h2 className="text-sm font-semibold text-foreground">Error</h2>
          <span className="break-words text-sm text-muted-foreground">{state.message}</span>
        </div>
      )}
    </>
  );
} 