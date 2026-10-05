# Classroom fork: setup

## 1. Repo
1. Copy `spatial-narrative` into a new repo `spatial-narrative-classroom` (keep `vendor/`, `media/`, `index.html` etc.).
   `git remote add upstream https://github.com/jonathaniscarroll/spatial-narrative.git` to pull engine fixes later.
2. Overlay this kit: `story/engine.twee`, `story/content.twee`, `author/index.html`, `author/config.js`, `.github/workflows/build-and-deploy.yml`, `supabase/`.
3. **Delete `story/main.twee`** (the kit replaces it: engine.twee = everything before `:: Start`, content.twee = student passages).
   Engine changes now go in `engine.twee`; when merging upstream, port edits made to the engine half of `main.twee`.

## 2. Supabase
1. New project. Authentication > Sign In / Providers > enable **Anonymous sign-ins**; enable CAPTCHA or rate limits.
2. SQL Editor: paste `supabase/schema.sql`. First change `CHANGE-ME-class-code` to a long code (three random words).
3. Edge function: `supabase functions deploy publish`, then
   `supabase secrets set GITHUB_REPO=YOU/spatial-narrative-classroom GITHUB_TOKEN=<fine-grained PAT, this repo only, Contents: read+write>`.
4. Put the Project URL and anon key into `author/config.js` (public values).

## 3. GitHub
- Settings > Pages > Source: GitHub Actions.
- Settings > Secrets and variables > Actions > **Variables**: `SUPABASE_URL`, `SUPABASE_ANON_KEY`.
- Run the workflow once manually (Actions tab). Reader: `https://YOU.github.io/spatial-narrative-classroom/`; authoring: `.../author/`.

## Notes
- Locks last 2 minutes and renew every 45 s while a passage is open. Saves are per passage with a version check.
- Students can write SugarCube macros in passage text; the database blocks `script`/`stylesheet`/`widget`/`init`/`startup` tags and multi-passage injection, but not macros. Moderation is off by design.
- Comments in the reader still call the upstream repo's GitHub Issues API (`_geoCommentsBase`, engine.twee). Point it elsewhere or ignore it.
- Pages scheduled workflows can be auto-disabled after 60 days without repo activity; re-enable or push a commit after long breaks.
- If `author/sw.js` caches `index.html`, bump its cache name so students get the new tool.
