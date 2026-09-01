"use client";

import { useState, useTransition, type FormEvent } from "react";

type BaseState = { error?: string; success?: boolean };

/**
 * Drives a <form> against a Server Action without useActionState — success
 * side effects (closing a dialog, toasting) run inside the submit event
 * handler instead of a useEffect reacting to returned state, which avoids
 * synchronous setState-in-effect renders.
 */
export function useActionForm<T extends BaseState>(
  action: (formData: FormData) => Promise<T>,
  onSuccess?: (result: T) => void
) {
  const [error, setError] = useState<string | undefined>();
  const [isPending, startTransition] = useTransition();

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    startTransition(async () => {
      const result = await action(formData);
      if (result.error) {
        setError(result.error);
      } else {
        setError(undefined);
        onSuccess?.(result);
      }
    });
  }

  return { handleSubmit, isPending, error };
}
