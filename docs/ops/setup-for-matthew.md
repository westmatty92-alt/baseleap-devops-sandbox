# Setup for Matthew: the things only you can do

For the sandbox project **baseleap-devops-sandbox**. No coding. About 45 minutes, mostly copy and paste.
Nothing here deploys anything. It gives the pipeline the settings and keys it needs.

## Read this first

- **You will copy secret values from one website and paste them into another.** Do it straight from one browser tab to the other. Do not paste them into chat, email, a document, a note or a file in the project. Nobody on the team (including the agents) needs to see them. When you're done, say "done" and the part number.
- **Never type a value into a file.** Everything below goes into a website's settings box.
- Website menus get renamed now and then. If a button isn't where this guide says, **stop and send a screenshot** (with the value boxes blank). Don't guess.
- Open three browser tabs: **Vercel**, **Supabase**, **GitHub**. Sign in to all three.
- Use these names exactly: capitals, underscores, no spaces.
- This is a sandbox. It's deleted after the drills (see Part 5, which cleans up).

**Spend check.** If any page says "Upgrade", "Pro plan" or shows a price, **stop**. That is a spending decision for you and Baseleap. Don't click upgrade. GitHub shouldn't ask, because the sandbox repo is public.

| Your sandbox | |
|---|---|
| GitHub repo | `westmatty92-alt/baseleap-devops-sandbox` (public: it's a practice app with no client data; keys stay hidden in GitHub's encrypted secrets) |
| Vercel project | `baseleap` team → `baseleap-devops-sandbox` |
| Production address | `https://baseleap-devops-sandbox.vercel.app` (public address, not a secret) |
| Supabase project ref | `lrwtbrycrjturxnyqdta` (ca-central-1) |

---

## Part 1: Vercel

### 1.1 Open the project
1. Go to **vercel.com** and sign in.
2. At the top left, click the team name and choose **baseleap**.
3. Click the project **baseleap-devops-sandbox**.

### 1.2 Add the environment variables
1. Click **Settings** (top menu of the project), then **Environment Variables** (left menu).
2. For each row of the table below, do this:
   1. Click **Add New** (or **Create new**).
   2. **Key:** type the name exactly.
   3. **Value:** paste the value (where to find it is in Part 2).
   4. **Environments:** tick exactly the boxes in the table. **Leave Development unticked.** For Preview, leave the branch box on "All Preview Branches".
   5. If the table says **Sensitive: yes**, switch **Sensitive** on. (Once saved, nobody can read it again, which is what we want.)
   6. Click **Save**.

| # | Key (name) | Production | Preview | Sensitive | Where the value comes from |
|---|---|---|---|---|---|
| 1 | `NEXT_PUBLIC_SUPABASE_URL` | ✅ | ✅ | no (it's public by design) | Supabase, step 2.1 (**Project URL**) |
| 2 | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | ✅ | ✅ | no (public by design; row-level security protects the data) | Supabase, step 2.1 (**anon** key) |
| 3 | `SUPABASE_SERVICE_ROLE_KEY` | ✅ | ✅ | **yes** | Supabase, step 2.1 (**service_role** key). **The most powerful key in the project. Only ever paste it here and nowhere else.** |
| 4 | `SITE_URL` | ✅ | ✅ | no | **Production row:** `https://baseleap-devops-sandbox.vercel.app`. **Preview row:** the staging address from step 1.5 (add this row after 1.5). |

`SITE_URL` needs **two separate rows**: one ticked Production only, one ticked Preview only. Vercel lets you add the same key twice if the environments differ.

**Do not add** any other names. Specifically **not** `SESSION_MAX_AGE_DAYS` (the app has a built-in default), `VERCEL_GIT_COMMIT_SHA` (Vercel supplies it), or anything starting with `BASELEAP_`, `E2E_` or `SUPABASE_PREVIEW`/`SUPABASE_PROD`. Our drift check reports them if they appear.

### 1.3 Make sure Vercel supplies the "version" (needed by the health check)
1. Still on **Settings → Environment Variables**, look for the checkbox **Automatically expose System Environment Variables**.
2. It should be **ticked**. If not, tick it and click **Save**.

### 1.4 Check the Git settings
1. **Settings → Git** (left menu).
2. **Connected Git Repository** should show `westmatty92-alt/baseleap-devops-sandbox`.
3. **Production Branch** should be `main`. If it isn't, change it and click **Save**.
4. Leave everything else. (The setting that stops Git pushes from deploying `main` is in the project's `vercel.json` file, so it's reviewed like code.)

### 1.5 Find the staging address
Staging is the `staging` branch's preview. Its address stays the same on every push.
1. Click **Deployments** (top menu).
2. Use the branch filter and pick `staging`. (If you can't find it, it's because the `staging` branch hasn't been pushed yet. Come back after Baseleap says it has.)
3. Click the latest deployment. Under **Domains**, copy the address that looks like `baseleap-devops-sandbox-git-staging-….vercel.app`.
4. Go back to 1.2 and add the **Preview** row of `SITE_URL` with `https://` plus that address.

### 1.6 Protect previews, and create the key the checks use to get in
1. **Settings → Deployment Protection** (left menu).
2. **Vercel Authentication** should be **on** (Standard Protection). Preview addresses then ask for a Vercel login. The production address stays public.
3. Scroll to **Protection Bypass for Automation**.
4. Click **Add Secret** (or switch it on, then **Add**). Vercel generates a long random value.
5. **Copy it** (use the copy or eye icon). You'll paste it into GitHub in step 3.2. **This is `VERCEL_AUTOMATION_BYPASS_SECRET`.**
6. Click **Save** if the page asks.

### 1.7 Copy two IDs (not secret)
1. **Team ID.** Click the **baseleap** team name (top left) → **Settings** → **General**. Copy **Team ID** (looks like `team_…`). This is `VERCEL_ORG_ID`.
2. **Project ID.** Open the project → **Settings → General**. Copy **Project ID** (looks like `prj_…`). This is `VERCEL_PROJECT_ID`.
3. You'll paste both into GitHub in step 3.4. They are identifiers, not passwords.

### 1.8 Create the Vercel token (lets the release workflow deploy)
1. Click your **profile picture** (top right) → **Account Settings** → **Tokens** (left menu).
2. Under **Create Token**:
   - **Token name:** `baseleap-sandbox-release`
   - **Scope:** choose the team **baseleap** (not "Full Account"). This is the narrowest Vercel offers: the token can only touch that team.
   - **Expiration:** **30 days**.
3. Click **Create**. **Copy the token now.** Vercel only shows it once.
4. You'll paste it into GitHub in step 3.4 as `VERCEL_TOKEN`.
5. Put a reminder in your calendar for 28 days from now to replace it.

---

## Part 2: Supabase

Open **supabase.com/dashboard/project/lrwtbrycrjturxnyqdta** (the project ref is in the address).

### 2.1 The three values for Vercel (Part 1, step 1.2)
1. Left menu: **Project Settings** (gear) → **Data API**. Copy the **Project URL** (`https://lrwtbrycrjturxnyqdta.supabase.co`). It goes in `NEXT_PUBLIC_SUPABASE_URL`.
2. Left menu: **Project Settings → API Keys**. There are two tabs:
   - **Legacy anon, service_role API keys** (use this tab): copy **anon** (`public`) into `NEXT_PUBLIC_SUPABASE_ANON_KEY`. Click **Reveal** next to **service_role** (`secret`) and copy it into `SUPABASE_SERVICE_ROLE_KEY`.
   - If your project only shows **Publishable and secret API keys** (legacy tab missing), use the **Publishable** key where this guide says anon and the **Secret** key where it says service_role. Both work with the app.
3. Close the page when you're done.

### 2.2 Database password (for the release's database updates)
1. **Project Settings → Database**. Find **Database password**.
2. Supabase never shows the old one. If you saved it when you created the project, use that.
3. If you don't have it: click **Reset database password**, choose **Generate a password**, **copy it**, and confirm. Resetting is fine in this sandbox; the app doesn't connect with the database password. (On a real client project, resetting would need a plan first.)
4. You'll paste it into GitHub in step 3.4 as `SUPABASE_DB_PASSWORD`.

### 2.3 Supabase access token (lets the release workflow apply database changes)
1. Click your **profile picture** (bottom left) → **Account preferences** → **Access Tokens**. (Direct address: supabase.com/dashboard/account/tokens.)
2. Click **Generate new token**.
   - **Name:** `baseleap-sandbox-release`
   - **Expiry:** **30 days**.
3. **Copy it now.** It's shown once.
4. It goes into GitHub in step 3.4 as `SUPABASE_ACCESS_TOKEN`.
5. Note: Supabase can't limit a token to one project. It can reach every project on your account, so it only goes into the `production` environment (which waits for your approval) and has a short expiry. Same calendar reminder as the Vercel token.

### 2.4 Sign-in links must be allowed to come back to the app
1. **Authentication** (left menu) → **URL Configuration**.
2. **Site URL:** `https://baseleap-devops-sandbox.vercel.app`.
3. **Redirect URLs:** click **Add URL** and add these two (the second uses your staging address from step 1.5):
   - `https://baseleap-devops-sandbox.vercel.app/**`
   - `https://<your staging address>/**`
4. Click **Save changes**.

---

## Part 3: GitHub

Open **github.com/westmatty92-alt/baseleap-devops-sandbox** → **Settings** (top menu of the repo).

### 3.0 Plan check: already done
The sandbox repo is **public**, so GitHub's free plan includes the two protections we need (required approvers on an environment, and protected branches). If you still see "Upgrade" next to **Required reviewers**, stop and send a screenshot.

### 3.1 Make the default permissions read-only
1. **Settings → Actions → General**.
2. Scroll to **Workflow permissions**. Select **Read repository contents and packages permissions**.
3. Click **Save**.

### 3.2 Create the `staging` environment
1. **Settings → Environments → New environment**. Name: `staging`. Click **Configure environment**.
2. Leave **Required reviewers** empty (staging checks run on their own).
3. **Environment secrets → Add environment secret**
   - Name: `VERCEL_AUTOMATION_BYPASS_SECRET`
   - Value: paste what you copied in step 1.6
   - **Add secret**
4. **Environment variables → Add environment variable**
   - Name: `PRODUCTION_HOSTS`
   - Value: `baseleap-devops-sandbox.vercel.app` (a safety list: staging checks refuse to run against these addresses)
   - **Add variable**

### 3.3 Create the `production` environment (this is your approval button)
1. **Settings → Environments → New environment**. Name: `production`. Click **Configure environment**.
2. Tick **Required reviewers**. In the box, search for and select **yourself** (`westmatty92-alt`). Click **Save protection rules**.
   - Leave **Prevent self-review** **unticked**. You are the only reviewer, and ticking it would block you from approving your own release.
3. If you see **Allow administrators to bypass configured protection rules**, **untick** it.
4. Under **Deployment branches and tags**, choose **Selected branches and tags**, click **Add deployment branch or tag rule**, type `main`, and **Add rule**. (Only `main` can use production keys.)
5. **Result:** every release stops and waits for you. GitHub emails you, and the run shows a yellow **Review deployments** button.

### 3.4 Production secrets and variables
Still inside the `production` environment page:

**Environment secrets → Add environment secret**, once for each:

| Name | Paste |
|---|---|
| `VERCEL_TOKEN` | the Vercel token from step 1.8 |
| `SUPABASE_ACCESS_TOKEN` | the Supabase token from step 2.3 |
| `SUPABASE_DB_PASSWORD` | the database password from step 2.2 |

**Environment variables → Add environment variable**, once for each (these are identifiers, not secret):

| Name | Value |
|---|---|
| `VERCEL_ORG_ID` | the Team ID from step 1.7 |
| `VERCEL_PROJECT_ID` | the Project ID from step 1.7 |
| `SUPABASE_PRODUCTION_REF` | `lrwtbrycrjturxnyqdta` |

### 3.6 One repository-wide variable
This one is **not** inside an environment, so the 15-minute uptime check can read it without needing your approval each time.
1. **Settings → Secrets and variables → Actions → Variables** tab.
2. Under **Repository variables**, click **New repository variable**.
3. Name: `PRODUCTION_URL`. Value: `https://baseleap-devops-sandbox.vercel.app`. **Add variable**.

### 3.7 Protect `main` (do this after the first checks have run)
GitHub only lets you pick a required check after it has seen it run once. Baseleap will tell you when the first CI run has finished.
1. **Settings → Branches → Add branch ruleset** (or **Add classic branch protection rule**).
2. Name/pattern: `main`. Enforcement: **Active**.
3. Tick: **Require a pull request before merging**; **Require status checks to pass** and add these three: `verify`, `security`, `workflows`; **Block force pushes**; **Restrict deletions**.
4. **Do not** add yourself to a bypass list.
5. **Create** / **Save changes**.

### 3.8 Catch accidental secrets (if offered)
**Settings → Code security** (or "Advanced Security"). If **Secret protection → Push protection** is available at no charge, turn it **on**. If it shows a price, skip it. Our own scan already runs on every push.

---

## Part 4: Final checklist (tick each and tell us "all done")

| ✓ | Where | Name | Kind |
|---|---|---|---|
| ☐ | Vercel, Production + Preview | `NEXT_PUBLIC_SUPABASE_URL` | variable |
| ☐ | Vercel, Production + Preview | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | variable |
| ☐ | Vercel, Production + Preview | `SUPABASE_SERVICE_ROLE_KEY` | **sensitive** |
| ☐ | Vercel, Production | `SITE_URL` | variable |
| ☐ | Vercel, Preview | `SITE_URL` | variable |
| ☐ | Vercel | System variables exposed | setting |
| ☐ | Vercel | Protection Bypass for Automation created | setting |
| ☐ | Supabase | Redirect URLs added (production and staging) | setting |
| ☐ | GitHub, repo variable | `PRODUCTION_URL` | variable |
| ☐ | GitHub `staging` | `VERCEL_AUTOMATION_BYPASS_SECRET` | secret |
| ☐ | GitHub `staging` | `PRODUCTION_HOSTS` | variable |
| ☐ | GitHub `production` | `VERCEL_TOKEN`, `SUPABASE_ACCESS_TOKEN`, `SUPABASE_DB_PASSWORD` | secrets |
| ☐ | GitHub `production` | `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID`, `SUPABASE_PRODUCTION_REF` | variables |
| ☐ | GitHub `production` | Required reviewer = you; deployment branch = `main` only | setting |
| ☐ | GitHub | `main` protected (after the first CI run) | setting |

Baseleap then checks, **read-only and by name only**, that all of this is in place (`node scripts/env-check.mjs --vercel`). It never reads values.

## Part 5: When the drills are over (cleanup)
- Vercel → Account Settings → Tokens → **delete** `baseleap-sandbox-release`.
- Supabase → Account → Access Tokens → **revoke** `baseleap-sandbox-release`.
- Vercel → project → Settings → Deployment Protection → **remove** the bypass secret.
- Delete the sandbox repo, Vercel project and Supabase project if they're no longer needed.

## What you'll see at release time
1. A pull request from `staging` into `main` is merged by Baseleap (after you've approved Gate 3).
2. GitHub emails you: **"Review pending deployments"**. Open the run and click **Review deployments → production → Approve and deploy**. **This is your second yes.** Nothing reaches production before it.
3. The workflow updates the database, deploys, and checks the live site. If the check fails it **rolls back by itself** and the run turns red.
