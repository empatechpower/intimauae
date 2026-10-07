import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../../../../');

let initTried = false;

function loadServiceAccount() {
  const rawJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (rawJson) {
    return JSON.parse(rawJson);
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

export function getFirebaseAdminApp() {
  const apps = getApps();
  if (apps.length) return apps[0];
  if (initTried) return null;
  initTried = true;
  const sa = loadServiceAccount();
  if (!sa) {
    console.warn('[firebase] service account not found — phone login disabled');
    return null;
  }
  return initializeApp({
    credential: cert(sa),
    projectId: sa.project_id || process.env.FIREBASE_PROJECT_ID
  });
}

export async function verifyFirebaseIdToken(idToken) {
  const app = getFirebaseAdminApp();
  if (!app) {
    const err = new Error('Firebase Admin not configured');
    err.status = 500;
    throw err;
  }
  return getAuth(app).verifyIdToken(idToken);
}
