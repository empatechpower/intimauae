/**
 * Verify Firebase ID tokens without firebase-admin (avoids Vercel serverless crashes / cold-start bloat).
 * Uses Identity Toolkit REST: https://identitytoolkit.googleapis.com/v1/accounts:lookup
 */

export async function verifyFirebaseIdToken(idToken) {
  const apiKey = process.env.FIREBASE_API_KEY || process.env.VITE_FIREBASE_API_KEY;
  if (!apiKey) {
    const err = new Error('Firebase API key not configured');
    err.status = 500;
    throw err;
  }
  if (!idToken) {
    const err = new Error('Missing idToken');
    err.status = 400;
    throw err;
  }

  const res = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${encodeURIComponent(apiKey)}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idToken })
    }
  );
  const data = await res.json().catch(() => ({}));
  const user = data?.users?.[0];
  if (!res.ok || !user) {
    const err = new Error(data?.error?.message || 'Invalid or expired OTP session');
    err.status = 401;
    err.code = data?.error?.message || 'auth/argument-error';
    throw err;
  }

  return {
    uid: user.localId,
    phone_number: user.phoneNumber || null,
    email: user.email || null
  };
}
