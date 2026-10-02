# Firebase setup (client account) — click-by-click

Do this in the **client’s** Google / Firebase account (or your test account first — same clicks).

---

## Part 1 — Create the Firebase project

1. Open **https://console.firebase.google.com**
2. Sign in with the Google account that should own the project (client’s).
3. Click **Add project** (or **Create a project**).
4. **Project name:** e.g. `intimauae` or `intimauae-prod` → **Continue**.
5. Google Analytics: On or Off (either is fine) → **Create project**.
6. Wait → **Continue** into the project.

---

## Part 2 — Turn on the services we need

### Authentication
1. Left menu → **Build** → **Authentication**
2. Click **Get started**
3. **Sign-in method** tab → enable **Email/Password** → **Save**
4. (Optional later) Google / other providers

### Firestore Database
1. Left menu → **Build** → **Firestore Database**
2. Click **Create database**
3. Start in **production mode** (we’ll set rules) → **Next**
4. Pick a region close to users (e.g. `europe-west` / Middle East if listed) → **Enable**

### Storage
1. Left menu → **Build** → **Storage**
2. Click **Get started** → use default security for now → pick same region → **Done**

---

## Part 3 — Get keys for the app (give these to the developer)

### A) Web app config (for `apps/web`)
1. Project overview (gear next to **Project Overview**) → **Project settings**
2. Scroll to **Your apps** → click the **</>** web icon
3. App nickname: `intimauae-web` → **Register app**
4. Copy the `firebaseConfig` object (apiKey, authDomain, projectId, etc.)

### B) Service account (for server migration + API) — SECRET
1. **Project settings** → **Service accounts** tab
2. Click **Generate new private key** → **Generate key**
3. A JSON file downloads — rename/save as:
   `C:\Users\user\Documents\doll\firebase-service-account.json`
4. **Never commit this file to Git** (already in `.gitignore`)

Tell the developer when that file is in the project folder so import can run.

---

## Part 4 — What was already exported from Supabase

On the developer machine, data was exported to:

`migrations-data/supabase-export/`

| File | Rows (at export time) |
|------|------------------------|
| categories.json | 3 |
| products.json | 24 |
| product_images.json | 34 |
| profiles.json | 1 |
| orders / payments / etc. | included |
| settings.json | 9 |
| blog_posts.json | 4 |
| coupons.json | 1 |

Auth **passwords** are not in these JSON files. Admin users must be **recreated** in Firebase Authentication (or Invited), then linked to a profile document with `role: "admin"`.

---

## Part 5 — After the service account file is in place

Developer runs:

```bash
cd C:\Users\user\Documents\doll
npm install firebase-admin -w apps/api
node scripts/import-to-firebase.mjs
```

That uploads the exported JSON into **Firestore** collections.

---

## Part 6 — Important reality check

| Step | Status |
|------|--------|
| Export from your current Supabase | Done (local JSON) |
| Create Firebase project | **You** do in console (this guide) |
| Import JSON → Firestore | Script ready — needs service account file |
| Rewrite app API from Postgres → Firebase | **Separate big step** (code changes) |

Creating Firebase + importing data ≠ the live website automatically uses Firebase. The code must be switched after the data is in Firestore.

---

## Suggested order for you right now

1. Log into client Google → Firebase Console  
2. Create project + Auth + Firestore + Storage (Parts 1–2)  
3. Download service account JSON → put in project root as `firebase-service-account.json`  
4. Message the developer: “Firebase ready, key file is in place”  
5. They run the import + continue wiring the app  

Optional: create a **second** Firebase project under your own Google account named `intimauae-dev` to practice — same steps.
