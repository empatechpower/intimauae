/** Match API admin checks (profile role + bootstrap admin email). */
export function resolveIsAdmin(session, profile) {
  const email = String(session?.user?.email || '').toLowerCase();
  if (email === 'admin@intimauae.ae') return true;
  return profile?.role === 'admin';
}

/**
 * Profile fetch is complete for the current session user.
 * Never treat profile as ready while a logged-in user's profile is still loading.
 */
export function isProfileReadyForSession(authReady, session, profileLoadedForUserId) {
  if (!authReady) return false;
  const userId = session?.user?.id;
  if (!userId) return true;
  return profileLoadedForUserId === userId;
}
