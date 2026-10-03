# Hotel Ops — Setup & Rollout Guide

This app runs on two free/cheap services (Supabase for the database, Vercel for hosting) and needs
no server of your own to maintain. The steps below take you from zero to a live, working app.

You'll want a developer for the one-time setup (roughly steps 1–6 below involve some copy/pasting
of code and config), but once it's live, day-to-day use (adding staff, managing zones) needs no
technical skill at all — that's all done inside the app itself.

---

## Part A — One-time technical setup

### 1. Create a Supabase project
1. Go to https://supabase.com and sign up (free tier is enough to start).
2. Click **New Project**. Choose a name (e.g. "hotel-ops") and a strong database password — save
   this password somewhere safe.
3. Wait ~2 minutes for the project to finish provisioning.

### 2. Run the database schema
1. In your Supabase project, open **SQL Editor** (left sidebar) → **New query**.
2. Open `supabase/schema.sql` from this project, copy its entire contents, paste into the editor, and
   click **Run**.
3. This creates every table, permission rule, and the immutable audit log described in the spec.

### 3. Get your API keys
1. In Supabase, go to **Project Settings > API**.
2. Copy the **Project URL** and the **anon public** key — you'll need both shortly.
3. Copy the **service_role** key too (keep this one secret — it's only used in Part 4 below, never
   in the app itself).

### 4. Deploy the Edge Function (for creating staff accounts)
This function is what lets the General Manager create staff logins safely from inside the app.
1. Install the Supabase CLI: https://supabase.com/docs/guides/cli (one-line install command on that page).
2. From this project's folder, run:
   ```
   supabase login
   supabase link --project-ref YOUR_PROJECT_ID   (find this in your Supabase project URL)
   supabase functions deploy create-staff-account
   supabase secrets set SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
   ```
3. **Optional — email invites:** sign up at https://resend.com (free tier available), verify a
   sending domain, get an API key, then run:
   ```
   supabase secrets set RESEND_API_KEY=your-resend-key
   ```
   If you skip this, account creation still works — the General Manager just sees the temporary
   password on-screen to share directly instead of it being emailed.

### 5. Configure the app's environment
1. Copy `.env.example` to a new file named `.env` in the project root.
2. Fill in the two values from Step 3 (Project URL and anon public key).

### 6. Deploy the app to Vercel
1. Push this project to a GitHub repository (ask your developer, or use GitHub Desktop if doing it
   yourself — it's a drag-and-drop style tool).
2. Go to https://vercel.com, sign up, click **Add New Project**, and import the GitHub repo.
3. In the Vercel project's **Environment Variables** settings, add the same two values from Step 5
   (`VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`).
4. Click **Deploy**. Vercel gives you a live URL (e.g. `hotel-ops.vercel.app`) within a minute or two.
5. From now on, any code update pushed to GitHub redeploys automatically — no manual server work.

---

## Part B — Creating the first account (General Manager)

The schema doesn't seed a first user, since accounts are meant to be created through the app's own
Staff Management screen — but that screen requires being logged in as a GM already. To break this
chicken-and-egg problem once, at the very start:

1. In Supabase, go to **Authentication > Users > Add User**, enter the GM's email and a password.
2. Go to **Table Editor > profiles > Insert row**, and add a row with:
   - `id`: the user ID you just created (copy it from the Authentication page)
   - `full_name`: the GM's name
   - `role`: `general_manager`
   - `active`: `true`
   - `must_change_password`: `true`
3. That's it — from here on, every other account is created inside the app by this GM.

---

## Part C — Rolling out to the hotel (no technical skill needed from here)

1. **Sign in as GM** at your Vercel URL, using the credentials from Part B. You'll be asked to set
   a new password immediately — this replaces the one only you and your developer know.
2. **Add rooms** — go to the **Room Board**, click **Add Room**, and enter each room's number and
   floor. (This is GM-only.)
3. **Set up zones** — go to the **Zones** tab, create your floor/wing zones, and assign each room to one.
4. **Create staff accounts** — go to the **Staff** tab, add each person with their name, email, role,
   and phone number. Share their temporary password with them directly (or rely on the email invite
   if you set up Resend in Part A).
5. **Install on phones** — have each staff member open the app's URL in their phone's browser, then:
   - **iPhone (Safari):** tap the Share icon → "Add to Home Screen"
   - **Android (Chrome):** tap the ⋮ menu → "Add to Home Screen" / "Install app"
   This gives them an app icon on their home screen — no App Store or Play Store needed.
6. **First login** — each staff member signs in with their email + temporary password, and is
   immediately prompted to set their own password.
7. **Pilot on one floor first.** Assign one zone's rooms, run a normal day's turnover through the
   app, and check the Dashboard and audit trail make sense before rolling out hotel-wide.

---

## What's built vs. what's a next step

**Fully working:** room board with live status, room creation (GM), housekeeping start/end
cleaning flow with tap-based timers (now offline-safe — see below), supervisor inspection queue
with approve/reject/reroute, maintenance tickets with the guest-approval gate and photo uploads,
lost & found lifecycle with photos, supply requests, zone management, staff shift roster
(zone assignment per day), staff account creation with forced password reset, notifications
(dashboard badge + push, correctly fanned out to every person holding a role — see note below),
the immutable audit log, room block/release with mandatory supervisor inspection on release,
ticket aging alerts (1hr → supervisor, 3hr → GM) and checkout auto-escalation for deferred
tickets — both run automatically inside Postgres via `pg_cron` and a database trigger, no
separate server needed — and basic offline write-queueing for the two highest-stakes actions
(Start/End Cleaning), which now save locally and sync automatically when connectivity returns.

**One-time extra setup step:** the aging-alert schedule needs `pg_cron` enabled once. This is
already included at the bottom of `schema.sql` — running that file (Part A, Step 2) sets it up
automatically. No separate action needed beyond running the schema.

**Still worth a developer's attention before full go-live:**
- **Offline queueing covers Start/End Cleaning only.** Other actions (approving an inspection,
  submitting a ticket) still need a live connection. Worth expanding if the pilot shows other
  actions commonly happen in dead zones.
- **Unclaimed-room pickup is property-wide, not zone-restricted.** Any active housekeeper can
  claim any unclaimed room from "Available to pick up" in My Rooms, regardless of their assigned
  zone. Worth tightening once the shift roster is in daily use, if that turns out to matter.
- **No in-app "guest checked in" tracking.** The app assumes checkout events are entered by front
  desk via "Mark Checked Out" on the Room Detail page — it doesn't attempt to sync with a
  separate property-management/reservation system. If one exists, integrating checkout events
  automatically would remove a manual step.
- **A stray/leftover room in a "not_started" cleaning task with no staff assigned** (e.g. from a
  cancelled shift change) will just sit in the unclaimed pool indefinitely — there's no
  stale-task cleanup or alerting yet.

None of these block a pilot rollout on a single floor.
"# CHP-App" 
