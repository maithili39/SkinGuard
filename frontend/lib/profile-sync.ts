/**
 * Fix #14: Cross-tab profile state synchronisation.
 *
 * Problem: When a user updates their skin profile in Tab A (which writes to
 * localStorage), Tab B keeps the old state in React memory — it never
 * re-reads localStorage. Any analysis run in Tab B uses the stale profile
 * and produces wrong results without telling the user.
 *
 * Solution (two complementary mechanisms):
 *
 * 1. `storage` event — fires in ALL other tabs/windows when localStorage
 *    changes. Reads the updated key and calls the provided setter.
 *    Does NOT fire in the tab that made the change (good — that tab is
 *    already up to date in React state).
 *
 * 2. `BroadcastChannel` — fires in ALL tabs including the one that sent it.
 *    Used for in-memory profile toggles that we also want to echo to other
 *    tabs immediately (e.g. toggling "pregnant" via the chip UI without
 *    saving to the backend yet).
 *
 * 3. `visibilitychange` — when a background tab becomes visible again,
 *    re-read localStorage once in case several changes accumulated while
 *    the tab was hidden (storage events can be missed if the browser
 *    throttles background tabs).
 *
 * Usage in a component:
 *   useProfileSync(LS_USER_KEY, setUser, setProfile, setAllergies);
 */

import { useEffect, useRef } from 'react';
import type { UserState, SkinProfile } from '../types';

const CHANNEL_NAME = 'skinguard_profile_sync';

/** Reconstruct profile + allergies from a UserState object. */
function applyUserState(
  u: UserState,
  setUser: (u: UserState) => void,
  setProfile: (p: SkinProfile) => void,
  setAllergies: (a: string[]) => void,
) {
  setUser(u);
  if (u.profile) {
    setProfile({
      pregnant: u.profile.pregnant ?? false,
      sensitive_skin: u.profile.sensitive_skin ?? false,
      acne_prone: u.profile.acne_prone ?? false,
      fungal_acne: u.profile.fungal_acne ?? false,
      rosacea: u.profile.rosacea ?? false,
      dry_skin: u.profile.dry_skin ?? false,
      oily_skin: u.profile.oily_skin ?? false,
      combination_skin: u.profile.combination_skin ?? false,
      normal_skin: u.profile.normal_skin ?? false,
    });
    setAllergies(u.profile.avoid_list ?? []);
  }
}

/**
 * Hook that keeps profile state synchronised across browser tabs.
 *
 * @param lsKey        - localStorage key that holds the serialised UserState.
 * @param setUser      - React setter for the user state atom.
 * @param setProfile   - React setter for the skin profile atom.
 * @param setAllergies - React setter for the avoid-list atom.
 */
export function useProfileSync(
  lsKey: string,
  setUser: (u: UserState | null) => void,
  setProfile: (p: SkinProfile) => void,
  setAllergies: (a: string[]) => void,
): void {
  // Keep a stable ref to the setters so the effect doesn't re-register on
  // every render (the setters from useState are stable but TS doesn't know that).
  const setUserRef = useRef(setUser);
  const setProfileRef = useRef(setProfile);
  const setAllergiesRef = useRef(setAllergies);
  setUserRef.current = setUser;
  setProfileRef.current = setProfile;
  setAllergiesRef.current = setAllergies;

  useEffect(() => {
    // ── Helper ──────────────────────────────────────────────────────────────
    function readAndApply(raw: string | null) {
      if (!raw) {
        setUserRef.current(null);
        return;
      }
      try {
        const u: UserState = JSON.parse(raw);
        applyUserState(u, setUserRef.current, setProfileRef.current, setAllergiesRef.current);
      } catch {
        // Corrupted storage entry — ignore.
      }
    }

    // ── 1. storage event (fires in OTHER tabs) ───────────────────────────────
    function onStorage(e: StorageEvent) {
      if (e.key !== lsKey) return;
      readAndApply(e.newValue);
    }
    window.addEventListener('storage', onStorage);

    // ── 2. BroadcastChannel (fires in ALL tabs, including sender) ────────────
    let channel: BroadcastChannel | null = null;
    try {
      channel = new BroadcastChannel(CHANNEL_NAME);
      channel.onmessage = (e: MessageEvent) => {
        if (e.data?.type === 'profile_updated' && e.data?.key === lsKey) {
          readAndApply(localStorage.getItem(lsKey));
        } else if (e.data?.type === 'logged_out') {
          setUserRef.current(null);
        }
      };
    } catch {
      // BroadcastChannel not supported (e.g. older Safari) — storage event covers it.
    }

    // ── 3. visibilitychange (catches missed events in background tabs) ────────
    function onVisible() {
      if (document.visibilityState === 'visible') {
        readAndApply(localStorage.getItem(lsKey));
      }
    }
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      window.removeEventListener('storage', onStorage);
      document.removeEventListener('visibilitychange', onVisible);
      channel?.close();
    };
  }, [lsKey]);
}

/**
 * Broadcast a profile update to all other tabs.
 * Call this after writing to localStorage so other tabs pick it up immediately
 * without waiting for the visibilitychange fallback.
 */
export function broadcastProfileUpdate(lsKey: string): void {
  try {
    const channel = new BroadcastChannel(CHANNEL_NAME);
    channel.postMessage({ type: 'profile_updated', key: lsKey });
    // Close immediately — we only need to fire once.
    setTimeout(() => channel.close(), 100);
  } catch {
    // Not supported — the storage event in other tabs will still catch it.
  }
}

/**
 * Broadcast a logout event so all other tabs clear their session immediately.
 */
export function broadcastLogout(): void {
  try {
    const channel = new BroadcastChannel(CHANNEL_NAME);
    channel.postMessage({ type: 'logged_out' });
    setTimeout(() => channel.close(), 100);
  } catch {
    // Not supported.
  }
}
