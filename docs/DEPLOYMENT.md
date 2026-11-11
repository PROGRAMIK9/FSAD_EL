# Local development and deployment

1. Copy `.env.example` to `.env`.
2. Replace `JWT_SECRET` with at least 32 random bytes; set the same Google OAuth client ID in `GOOGLE_CLIENT_ID` and `VITE_GOOGLE_CLIENT_ID`.
3. Set `ALLOWED_EMAIL_DOMAINS` only to institution-approved domains, and use `ALLOWED_EMAILS` for explicit exceptions.
4. Run `docker compose up --build`. MongoDB persists in the `mongo_data` volume; client is at port 5173 and API at port 4000.
5. Provision the initial administrator directly through a secure, one-time database operation. Do not place credentials in seed scripts or commit secrets.

For local Node development, run `npm install`, then run `npm run dev` at repository root. Set `MONGODB_URI=mongodb://127.0.0.1:27017/rvce_academic_hub` in `.env`; local MongoDB can be run with `docker compose up -d mongo`. The included sample records are inactive and can be loaded with `npm run seed -w server`.

Back up MongoDB with `mongodump --uri "$MONGODB_URI" --out ./backup`; restore with `mongorestore --uri "$MONGODB_URI" ./backup`. Restrict backup access and encrypt backups at rest.

Google OAuth requires an institution configured client ID. The default allowed email domain is `rvce.edu.in`. Each quiz is fixed at 10 marks and supports MCQ or single-line fill-in questions; the selected question marks must total 10.

`npm run seed -w server` loads the real MCA semester III scheme and syllabus and creates the administrator account; it creates no passwords and no other users. Students are created on their first Google sign-in.
