# Deployment

In production the Node server serves the API, Socket.IO **and** the built React client from one origin. That keeps the session cookie first-party (no cross-site cookies, no CORS) and lets WebSockets use the same URL.

## Deploy on Render (recommended)

The repository contains a blueprint, [`render.yaml`](../render.yaml), for one Node web service.

1. **MongoDB Atlas**
   - *Network Access* → allow Render to connect: add `0.0.0.0/0`, or Render's outbound IPs on a paid plan.
   - Keep the connection string handy. It may end in `/`; the app then uses the database `rvce_academic_hub` (override with `MONGODB_DB`).
2. **Create the service.** In the Render dashboard: *New* → *Blueprint* → select this repository. Render reads `render.yaml`:
   - build: `npm ci --include=dev && npm run build` (compiles the client)
   - start: `npm start` (the API, which also serves `client/dist`)
   - health check: `/api/health`
   - generated `JWT_SECRET`, plus `NODE_ENV=production` and `TRUST_PROXY=true`
3. **Fill in the secret variables** that the blueprint marks `sync: false`:

   | Variable | Value |
   |---|---|
   | `MONGODB_URI` | Atlas connection string |
   | `GOOGLE_CLIENT_ID` | Google OAuth Web client ID |
   | `VITE_GOOGLE_CLIENT_ID` | same client ID (baked into the client at build time; redeploy after changing it) |
   | `CLIENT_ORIGIN` | the service URL, e.g. `https://rvce-academic-hub.onrender.com` |
   | `ALLOWED_EMAILS` | optional extra addresses outside `rvce.edu.in` |

   Do **not** set `VITE_API_URL` or `DEV_LOGIN` in production. The client calls `/api` on its own origin, and the sign-in picker must stay off.
4. **Google Cloud Console** → *APIs & Services* → *Credentials* → your OAuth client:
   - Add the Render URL under **Authorized JavaScript origins**.
   - No redirect URI is needed: the app uses Google Identity Services ID tokens.
5. **Load the data once**, from the service's *Shell* tab or locally with the production `MONGODB_URI`:
   ```bash
   npm run seed -w server
   ```
   This creates the MCA semester III subjects, syllabus, question bank, quiz drafts and the administrator account. It is safe to re-run.
6. **Smoke test:**
   - `https://<service>/api/health` returns `{"ok":true}`.
   - Signing in with the administrator's Google account works.
   - A new `@rvce.edu.in` account becomes a student.
   - The browser console shows no Content-Security-Policy errors.

**Uploads.** Assignment files are stored on disk in `UPLOAD_DIR` (default `server/storage`). Render's free instances have an ephemeral disk, so files disappear on redeploy. For real use, attach a Render *Persistent Disk* (paid) and set `UPLOAD_DIR` to its mount path, e.g. `/var/data/uploads`.

**Free plan.** The service sleeps after inactivity; the first request then takes up to about a minute. Use a paid instance during quizzes.

## Docker (own server)

A single multi-stage [`Dockerfile`](../Dockerfile) builds the client and runs the API, which serves the client:

```bash
cp .env.example .env    # set JWT_SECRET, GOOGLE_CLIENT_ID, VITE_GOOGLE_CLIENT_ID, CLIENT_ORIGIN
docker compose up --build -d
docker compose exec app npm run seed -w server
```

The app listens on port 4000; uploads persist in the `uploads` volume and MongoDB in `mongo_data`. Put it behind a TLS reverse proxy (for example Caddy: `reverse_proxy localhost:4000`), set `CLIENT_ORIGIN` to the public URL and `TRUST_PROXY=true`.

## Local development

`./run.sh` sets everything up (see the README). Manually: `npm install`, then `npm run dev`. The API runs on 4000 and Vite on 5173, and `VITE_API_URL=http://localhost:4000/api` points the dev client at the API.

## Operations

- **Backups:** `mongodump --uri "$MONGODB_URI" --out ./backup`; restore with `mongorestore --uri "$MONGODB_URI" ./backup`. Restrict access to backups and encrypt them at rest.
- **Administrator:** the seed creates `maaryamannp.mca25@rvce.edu.in` as administrator. Students are created on their first Google sign-in; administrators promote teachers from *Students* → edit → role.
- **Security:**
  - Sessions are HTTP-only, `Secure` in production, and renewed after half their lifetime.
  - Signed-in traffic is rate-limited per session, so a class behind one college IP is not throttled together. Sign-in attempts are limited per IP.
  - The Content-Security-Policy allows only this origin, Google Identity and Google Fonts.
