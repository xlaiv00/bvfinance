# Together — Joint Finance Tracker

A shared finance app for couples. Built with Next.js 14, Supabase, and deployed on Vercel.

---

## 🚀 Setup in ~20 minutes

### Step 1 — Create a Supabase project

1. Go to **https://supabase.com** → Sign up (free)
2. Click **New project** → give it a name like `together-finance`
3. Choose a region close to you (e.g. Frankfurt for Czech Republic)
4. Wait ~2 minutes for it to provision
5. Go to **SQL Editor** (left sidebar) → paste the entire contents of `supabase/schema.sql` → click **Run**

### Step 2 — Get your Supabase keys

1. In Supabase, go to **Project Settings → API**
2. Copy:
   - `Project URL` → this is your `NEXT_PUBLIC_SUPABASE_URL`
   - `anon public` key → this is your `NEXT_PUBLIC_SUPABASE_ANON_KEY`

### Step 3 — Deploy to Vercel

1. Push this project to a **GitHub repo** (just drag the folder into github.com/new)
2. Go to **https://vercel.com** → Sign up with GitHub (free)
3. Click **Add New Project** → import your GitHub repo
4. In the **Environment Variables** section, add:
   ```
   NEXT_PUBLIC_SUPABASE_URL = paste your project URL
   NEXT_PUBLIC_SUPABASE_ANON_KEY = paste your anon key
   ```
5. Click **Deploy** — Vercel builds and gives you a live URL like `together-finance.vercel.app`

### Step 4 — Set up Auth redirect URL in Supabase

1. In Supabase → **Authentication → URL Configuration**
2. Add your Vercel URL to **Site URL**: `https://your-app.vercel.app`
3. Add to **Redirect URLs**: `https://your-app.vercel.app/auth/callback`

---

## 👥 How you and your partner share data

1. **First person** signs up → goes to Dashboard → sees an **invite code** in the sidebar
2. **Second person** signs up → on the household setup screen, chooses **"Join existing"** → enters the code
3. From that point, all data is shared in real-time — expenses, savings, trips, everything

---

## 💻 Local development (optional)

```bash
npm install
cp .env.local.example .env.local
# fill in your Supabase keys in .env.local
npm run dev
# open http://localhost:3000
```

---

## 📁 Project structure

```
src/
  app/
    dashboard/        # Dashboard page + client
    expenses/         # Expenses page + client
    contributions/    # Contributions page + client
    savings/          # Savings goals page + client
    trips/            # Trips page + client
    login/            # Auth page
    auth/callback/    # Supabase auth callback
  components/
    Sidebar.tsx       # Navigation sidebar
    Timeline.tsx      # Year/month selector
    HouseholdSetup.tsx # Create or join a household
  lib/supabase/
    client.ts         # Browser Supabase client
    server.ts         # Server Supabase client
  types/index.ts      # All types + helpers
supabase/
  schema.sql          # Run this in Supabase SQL Editor
```

---

## 🔧 Tech stack

- **Next.js 14** (App Router) — frontend + server rendering
- **Supabase** — database (PostgreSQL), auth, row-level security
- **Vercel** — hosting (free tier is plenty)
- **TypeScript** — fully typed

---

## 🔒 Security

Row Level Security is enabled on every table. Each household's data is completely isolated — users can only see and modify data that belongs to their own household. This is enforced at the database level, not just in the app.
