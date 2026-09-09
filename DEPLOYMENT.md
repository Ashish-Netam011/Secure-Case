# Deploying Secure Case (free cloud stack)

Architecture: **React frontend → Vercel · Express API → Render (free) · MongoDB → Atlas M0**.
The AI tier is cloud-first, so Gemini works on the server without Ollama.

One requirement up front: the frontend must be served over **HTTPS** and call the
API on a different origin, and the API only allows HTTPS origins in production
(`localhost:5173` dev proxy is dev-only). A tunnel-based demo over plain HTTP is
not supported once `NODE_ENV=production` — use this cloud stack.

---

## 1. MongoDB Atlas (database)

1. Create a free account at [mongodb.com/cloud/atlas](https://www.mongodb.com/cloud/atlas) → **Build a Database** → **M0 Free**.
2. Create a database user (username + generated password). Save them.
3. **Network Access → Add IP** → **Allow access from anywhere (0.0.0.0/0)** (required — Render free instances do not have static IPs).
4. **Database → Connect → Drivers** → copy the `mongodb+srv://` URI and replace `<password>` with the user's password.
5. Example: `mongodb+srv://securecase:<password>@cluster0.xxxxx.mongodb.net/secure-case`

## 2. Backend on Render

1. Push this repo to GitHub (done), then at [dashboard.render.com](https://dashboard.render.com): **New → Blueprint** → select the repo — `render.yaml` at the root is detected automatically.
2. Render prompts for the `sync: false` variables. Fill in:
   - `FRONTEND_ORIGIN` — the Vercel URL **after step 3**, e.g. `https://secure-case.vercel.app` (no trailing slash).
   - `MONGO_URI` — the Atlas URI from step 1.
   - `IO_PIN_HASH`, `LO_PIN_HASH`, `ADMIN_PIN_HASH` — bcrypt hashes of each role's 6-digit PIN.
   - `GEMINI_API_KEY` — your key. `JWT_SECRET` is generated for you.
   - `DEMO_LOGIN=1` is already set in `render.yaml` so the three role buttons work.
3. Create the frontend first if Render asks for `FRONTEND_ORIGIN` — get the Vercel URL, then save. Update anytime under **Environment**; Render redeploys on save.
4. Verify: open `https://<your-api>.onrender.com/healthz` → `{"status":"ok"}`.
5. Free-tier note: the API sleeps after ~15 min idle; the first request takes ~30–50 s (cold start). Open the app once before presenting.

## 3. Frontend on Vercel

1. [vercel.com/new](https://vercel.com/new) → import the same GitHub repo.
2. Configure:
   - **Framework Preset:** Vite · **Root Directory:** `Frontend`
   - **Build Command:** `npm run build` · **Output:** `dist` (auto-detected)
   - **Environment variable:** `VITE_API_URL` = `https://<your-api>.onrender.com/api` (required — the SPA cannot reach the API through Vercel's CDN)
3. Deploy. The committed `Frontend/vercel.json` already adds the SPA rewrite so page refreshes work.

> With `VITE_API_URL` pointing directly at Render, evidence uploads up to 15 MB go
> straight to the API and avoid Vercel's 4.5 MB serverless body limit entirely.
> The backend CORS allowlist accepts the Vercel origin via `FRONTEND_ORIGIN`.

## ⚠️ Upload size limit (important)

If you ever serve the frontend with same-origin `/api` instead of setting `VITE_API_URL`,
note that Vercel serverless limits request bodies to **4.5 MB**, which would break 15 MB
evidence uploads. The setup in step 3 (direct `VITE_API_URL` to Render) does not have
this problem.

## 4. Generating PIN hashes

Run once, locally, from `Backend/`:

```bash
node -e "import('bcryptjs').then(b => { const p = process.argv[1]; console.log(b.hashSync(p, 10)); })" 123456
```

Generate one hash per role (IO / LO / ADMIN) with each role's PIN and paste the
three hashes into Render's env vars.

## 5. Post-deploy checklist

- [ ] `https://<api>.onrender.com/healthz` returns `{"status":"ok"}`
- [ ] Login page loads at the Vercel URL and all three role buttons work
- [ ] Upload a small PDF/TXT → hash recorded, evidence appears
- [ ] AI Analyze works (Gemini)
- [ ] Second role's view/request/approve flow works
- [ ] CORS: browser console shows no blocked-origin errors
- [ ] Rotate `JWT_SECRET` later if it was ever exposed in logs

## Notes on security for a public URL

- Role quick-login is enabled for demo convenience — anyone with the URL gets in.
  After the demo, set `DEMO_LOGIN` to empty and redeploy to require PINs.
- All authorization is enforced server-side regardless of login mode.
- Atlas is open to 0.0.0.0/0; for anything beyond a demo, restrict the IP list or use VPC peering.
