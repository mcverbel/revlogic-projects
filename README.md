# revlogic Projects

The internal engagement tracker for revlogic. It replaces ClickUp and Asana for professional services.

- **Engagements** from the first deal stage through delivery, with a journey bar that follows Aurasell's sales process.
- **Tabs:** Overview, Plan (list + timeline), Suggested, People, Docs.
- **Suggested tasks:** Claude reads call recordings (Aurasell, Otter), emails (Gmail) and Slack tied to an engagement and suggests tasks. A person accepts, edits or dismisses each one.
- **My Work:** every task you own or are assigned to, ordered by your private priority.
- **Slack notifications:** assignments, @mentions, a due-soon digest on weekdays, milestones posted to the internal channel.
- **Claude tracker connector:** each person's Claude can list, update and add their tasks.

Stack: Next.js 15, Neon Postgres, Drizzle, Auth.js (Google), Tailwind 4, Claude API. Deploys to Vercel.

---

## 1. Run it locally

```bash
npm install
cp .env.example .env        # fill in the values (section 2)
npm run db:migrate          # creates the tables in Neon
npm run db:seed             # adds the HiddenLayer pilot (run once)
npm run dev                 # http://localhost:3000
```

## 2. Accounts and keys

| What | Where | Env vars |
| --- | --- | --- |
| **Neon** | neon.tech → new project `revlogic-projects` → Connection Details → pooled string | `DATABASE_URL` |
| **Google sign-in** | Google Cloud Console → APIs & Services. Make the OAuth consent screen **Internal** (only rev-logic.com users, no Google review needed). Enable the **Gmail API** and **Drive API**. Create an OAuth client (Web). Redirect URIs: `http://localhost:3000/api/auth/callback/google` and `https://<your-vercel-domain>/api/auth/callback/google` | `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET` |
| **Auth secret** | `npx auth secret` | `AUTH_SECRET` |
| **Token encryption** | `openssl rand -base64 32` | `TOKEN_ENCRYPTION_KEY` |
| **Claude API** | console.anthropic.com → API keys. Pick the model id from docs.claude.com/en/docs/about-claude/models | `ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL` |
| **Slack app** | api.slack.com/apps → Create app. **Bot scopes:** `chat:write`, `channels:history`, `groups:history`, `users:read`, `users:read.email`. **User scopes** (for "My Slack DMs"): `search:read`, `im:history`, `mpim:history`. Redirect URL: `https://<domain>/api/connect/slack/callback`. Install to the workspace, then `/invite @<app>` in each engagement channel | `SLACK_BOT_TOKEN`, `SLACK_CLIENT_ID`, `SLACK_CLIENT_SECRET` |
| **Aurasell** | Aurasell → Settings → MCP Access → "OAuth client ID". Each person clicks **Connect** next to Aurasell on the Connections page and signs in to Aurasell (same as the Claude connector) | `AURASELL_OAUTH_CLIENT_ID`, `AURASELL_MCP_URL` |
| **Otter** | Each person pastes their own key on the Connections page | `OTTER_API_BASE_URL` |
| **Cron** | Any random string; Vercel sends it automatically | `CRON_SECRET` |

`ADMIN_EMAILS` makes those people admins when they first sign in. `ALLOWED_EMAIL_DOMAINS` limits sign-in (default `rev-logic.com`).

## 3. Deploy to Vercel

1. Push to GitHub (for example `mcverbel/revlogic-projects`) and import it in Vercel.
2. Add every env var from `.env.example` in Vercel → Settings → Environment Variables. Set `APP_URL` to the production URL.
3. Deploy. `vercel.json` sets up two cron jobs:
   - `/api/cron/suggestions` every 3 hours: syncs deal stages from Aurasell, then reads new calls, emails and Slack and writes suggestions.
   - `/api/cron/reminders` on weekday mornings: Slack DMs for tasks due tomorrow or overdue.
4. Add the production redirect URIs to Google and Slack (section 2).

## 4. Before going live: confirm two integrations

One endpoint is still unverified, marked `TODO(confirm path)`:

- **Aurasell** now goes through Aurasell's MCP server (`src/lib/sources/aurasell.ts`) with the same tools Claude uses (`list_meetings`, `get_meeting_summary`, `get_opportunity`), signed in per person.
- **`src/lib/sources/otter.ts`:** the transcript list endpoint and auth for revlogic's Otter plan.

Gmail, Drive, Slack and the Claude API use their standard public APIs.

## 5. How Suggested tasks work

1. Each engagement lists its sources under Overview → Engagement settings: email domains, Slack channel ids, and the Aurasell account. Adding a client contact's email adds its domain automatically.
2. The cron (or **Check now** on the Suggested tab) collects new items from the last 14 days:
   - Aurasell calls on the linked account
   - Slack messages in the mapped channels
   - each engagement member's Gmail threads with the client domain or mentioning the client
   - each member's Slack DMs and Otter transcripts, if they connected them
3. Every item is read once (`processed_items`). The same email in three inboxes counts once.
4. Claude returns suggestions with an owner matched to the team, a due date only if one was said, the type (revlogic task, waiting on client, milestone estimate), and a verbatim quote. It also flags pending suggestions that look done already.
5. Accepting creates a task in the first phase, with the owner, assignees, due date, the source link and a Slack DM to the owner.

Only the quote and link are stored, never full emails or transcripts.

## 6. Aurasell calls → Suggested tasks (scheduled Claude task)

Aurasell's sign-in only returns to its approved assistants (Claude, ChatGPT), so the app can't sign in to Aurasell directly. Instead, a scheduled Claude task uses the Aurasell connector you already have in Claude:

1. Deploy the app (section 3). On Connections, create a personal token.
2. In claude.ai Organization settings → Capabilities, allow your Vercel domain so scheduled tasks can reach the app.
3. Create a scheduled task (every 3 hours) that:
   - calls the app's `engagements_to_sync` tool (POST `https://<domain>/api/mcp` with `Authorization: Bearer <token>`),
   - for each Aurasell account, lists recent meetings with the Aurasell connector and skips `processed_meeting_ids`,
   - reads each new meeting's internal minutes (`get_meeting_summary`, `moms_internal`) and sends its next steps to `add_suggestions` with quotes, speakers and timestamps.

Claude can set this task up for you once the app is deployed.

## 7. Claude tracker connector

Connections → **Create token**. In Claude, add a custom connector with URL `https://<domain>/api/mcp`, sent with the header `Authorization: Bearer <token>`.

Tools: `my_tasks`, `update_task`, `create_task`, `engagement_summary`, `engagements_to_sync`, `add_suggestions`.

If your Claude plan's custom-connector screen only supports OAuth and not a bearer token, tell me and I'll add the OAuth flow.

## 8. What was tested

Tested on a local Postgres with the HiddenLayer seed:

- Every page renders.
- Accept, accept-as-done and dismiss on suggestions.
- Journey stage changes.
- Adding tasks, phases, contacts and documents.
- The task panel.
- The timeline view.
- The MCP endpoint: list, summary, create and my_tasks.
- Cron auth.

Not tested here, because they need your real keys:

- Google sign-in
- Gmail and Drive reads
- Slack
- The Claude API extraction
- Aurasell and Otter

## Project map

```
src/app/(app)/            pages: My Work, engagement tabs, Connections, Team, New engagement
src/app/api/              auth, cron jobs, Slack connect, MCP connector
src/actions/              server actions (all writes go through here, each logs activity)
src/components/           UI: sidebar, journey bar, plan list/timeline/task panel, suggested, people, docs
src/db/schema.ts          database tables
src/lib/suggest.ts        suggestion pipeline (sources → Claude → suggestions)
src/lib/sources/          Gmail/Drive, Slack, Aurasell, Otter adapters
scripts/seed.ts           HiddenLayer pilot data
```
