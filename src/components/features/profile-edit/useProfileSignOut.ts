"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { clearPersistedQueries } from "@/lib/client/query-persistence";

export function useProfileSignOut(profileId: string) {
  const [confirmSignOut, setConfirmSignOut] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  async function signOut() {
    setSigningOut(true);
    const supabase = createClient();
    try {
      if ("serviceWorker" in navigator && "PushManager" in window) {
        const registration = await navigator.serviceWorker.getRegistration();
        const subscription = await registration?.pushManager.getSubscription();
        if (subscription) {
          const endpoint = subscription.endpoint;
          const { error: deleteError } = await supabase
            .from("push_subscriptions")
            .delete()
            .eq("endpoint", endpoint)
            .eq("user_id", profileId);
          if (deleteError) throw deleteError;
          await subscription.unsubscribe();
        }
      }
    } catch (pushCleanupError) {
      console.error("Failed to remove push subscription during sign out", pushCleanupError);
    }
    await clearPersistedQueries();
    await supabase.auth.signOut();
    window.location.assign("/login");
  }

  return { confirmSignOut, setConfirmSignOut, signingOut, signOut };
}
