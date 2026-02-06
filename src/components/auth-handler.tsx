'use client';

import { useEffect } from 'react';
import { useUser, useAuth } from '@/firebase';
import { initiateAnonymousSignIn } from '@/firebase/non-blocking-login';

export function AuthHandler({ children }: { children: React.ReactNode }) {
  const { user, isUserLoading } = useUser();
  const auth = useAuth();

  useEffect(() => {
    // If the user state is not loading and there is no user, sign in anonymously.
    if (!isUserLoading && !user && auth) {
      initiateAnonymousSignIn(auth);
    }
  }, [user, isUserLoading, auth]);

  return <>{children}</>;
}
