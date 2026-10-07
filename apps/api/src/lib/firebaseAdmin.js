import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../../../../');

let initTried = false;
let appInstance = null;

function loadServiceAccount() {
  const rawJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (rawJson) {
    try {
      // Vercel sometimes stores private_key newlines as literal \n
      const parsed = JSON.parse(rawJson);
      if (parsed?.private_key && typeof parsed.private_key === 'string') {
        parsed.private_key = parsed.private_key.replace(/\\n/g, '\n');
      }
      return parsed;
    } catch (e) {
      console.warn('[firebase] invalid FIREBASE_SERVICE_ACCOUNT_JSON:', e.message);
      return null;
    }
  }
  const envPath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH;
  const candidates = [
    envPath,
    path.join(ROOT, 'firebase-service-account.json'),
    path.join(process.cwd(), 'firebase-service-account.json'),
    path.join(process.cwd(), '../firebase-service-account.json'),
    path.join(process.cwd(), '../../firebase-service-account.json')
  ].filter(Boolean);

  for (const p of candidates) {
    try {
      if (fs.existsSync(p)) {
        return JSON.parse(fs.readFileSync(p, 'utf8'));
      }
    } catch {
      /* try next */
    }
  }
  return null;
}

/** Lazy-load Firebase Admin so catalog/admin routes do not pull it in on cold start. */
export async function getFirebaseAdminApp() {
  if (appInstance) return appInstance;
  if (initTried) return null;
  initTried = true;

  const sa = loadServiceAccount();
  if (!sa) {
    console.warn('[firebase] service account not found — phone login disabled');
    return null;
  }

  try {
    const { cert, getApps, initializeApp } = await import('firebase-admin/app');
    const existing = getApps();
    appInstance = existing.length
      ? existing[0]
      : initializeApp({
          credential: cert(sa),
          projectId: sa.project_id || process.env.FIREBASE_PROJECT_ID
        });
    return appInstance;
  } catch (e) {
    console.warn('[firebase] init failed:', e.message);
    return null;
  }
}

export async function verifyFirebaseIdToken(idToken) {
  const app = await getFirebaseAdminApp();
  if (!app) {
    const err = new Error('Firebase Admin not configured');
    err.status = 500;
    throw err;
  }
  const { getAuth } = await import('firebase-admin/auth');
  return getAuth(app).verifyIdToken(idToken);
}
