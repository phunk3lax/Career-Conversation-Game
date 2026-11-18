# Career Conversation Challenge — Live AI Team Game

A browser-based multiplayer workshop game for manager career conversations. Participants join a shared room code, submit **one response per team**, vote for strong coaching examples, and receive **AI-generated scores and feedback** on each of three coaching criteria. The facilitator can override scores and advance scenarios. Every scenario includes its own illustrated conversation.

## What is included

- **2–10 teams**, with **up to 4 people per team** (10 teams = 40 participants). Default is 5 teams.
- Six career conversation scenarios, each with a distinctive original image.
- Team submission with change-version protection; each teammate can save one shared answer.
- Anonymous voting for another team's response; top-voted team(s) get a +1 voting bonus.
- **Automatic AI grading at reveal** when `OPENAI_API_KEY` is configured, with separate 0-or-1 scoring for each of 3 coaching criteria, a strength, and a suggested improvement. Results appear after scoring completes; fallback manual grading always works.
- Facilitator manual overrides **take priority** over AI results, even while an AI job is running.
- Live updates every 2 seconds; works on phones, tablets, laptops, and projected browser screens.
- Multi-room state persists to JSON in the configured `GAME_DATA_FILE` location. One server process only.

## Running locally

Requires **Python 3.9 or later**. No Python packages to install.

### Windows

Double-click `start_windows.bat`, then open **http://localhost:8000**.

### macOS / Linux

```bash
./start_mac_linux.sh
```

Or run `python app.py`. Without an AI key, multiplayer, rubric reveal, voting, and **manual scoring** still work.

### Add AI grading

An **OpenAI API key**, separate from a ChatGPT subscription, is required for real AI evaluation. Never paste the key into a web page, share it with participants, or commit it to source control.

- Windows PowerShell (current shell): `$env:OPENAI_API_KEY="YOUR_API_KEY"; python app.py`
- macOS/Linux (current shell): `export OPENAI_API_KEY="YOUR_API_KEY"; python app.py`
- Optional model: `OPENAI_MODEL=gpt-4.1-mini` (default).

Once a round reaches **Reveal**, all submitted team answers are graded automatically in one server-side AI request. The scorer checks 3 criteria (0–3 total), supplies strengths and improvements, and updates the live leaderboard. Voting bonus is calculated separately. The facilitator can edit any score and manual corrections are preserved. If grading fails, the game displays a retry action and manual scoring remains available.

**Privacy:** The specific scenario text, the three coaching criteria, and team response texts are sent to the OpenAI API for grading. Participant names are not sent for grading. Don't paste real employee performance data, client confidential material, or sensitive personal details into team responses. Your organization may have additional AI/privacy requirements. API usage is billed separately.

## Publish to a public URL via Render

This archive contains a ready-to-deploy `render.yaml` Blueprint defining a Python web service and **1 GB persistent disk**. Render will assign the public HTTPS address after deployment (for example, `https://your-app-name.onrender.com` — **illustrative only**, not a live address).

**Connection to a hosting account and deployment are still required. No public URL has been created from this downloaded ZIP.**

Suggested steps:

1. Connect your **Render** account to ChatGPT using the Render option supplied in this conversation, or create a Render account at https://render.com.
2. If deploying manually: unzip the project, create a private Git repository with the contents of `career-conversation-live/` at the repo root, and connect it to Render as a Blueprint deployment using `render.yaml`.
3. During deployment, securely set `OPENAI_API_KEY` in Render's environment settings. Render's configuration requests it without storing it in the YAML file.
4. Review the Render **paid plan and persistent disk** charges before approving deployment. OpenAI API usage is billed separately.
5. When deployed, open the public HTTPS URL, choose **Host a live game**, create the room, and share **only** the participant join link. Keep the facilitator URL (which contains the private host key) to yourself.
6. Test from a phone on cellular data, not just the same Wi-Fi, to verify public access.

Alternative: host with another service that supports a long-running single Python process and writable persistent storage. Set its command to `python app.py`, `PORT` to the assigned port, `OPENAI_API_KEY` server-side, and `GAME_DATA_FILE` to a persisted path.

**Important production limitations:** This is a workshop app, not an enterprise multi-tenant product. It uses bearer room/host tokens but no employee SSO, a basic game-creation rate limit, and JSON file storage. It is designed for small, trusted sessions and **one server instance**. For organization-wide use, add SSO, stronger abuse controls, database persistence, and a compliance review. Don't share facilitator URLs. Games and participant names stay stored until removed from the data file. Server logs intentionally avoid writing facilitator query secrets.

## Running on a shared local network

Participants on the same Wi-Fi can use `http://YOUR-COMPUTER-LAN-IP:8000/?join=ROOMCODE`. Windows: find your address using `ipconfig`. On the host computer create the room using the network IP in the address bar so the generated join link is correct. Corporate firewalls may block local access.

## Facilitator guide — 40 to 50 minutes

1. **Lobby (3 minutes):** Set 2–10 teams and have players join the room code.
2. **Discuss and write (2–3 minutes per scenario):** Read the scenario and have each team submit its manager response.
3. **Vote (1 minute):** Open voting; participants select a different team's response.
4. **Debrief (2 minutes):** Reveal the coaching rubric. AI grading runs automatically when configured; review strengths/improvements, change any scores if needed, and advance.
5. **Wrap up:** Review final totals and ask each player to share one better question they will use in a real career conversation.

### Points

- 1 point for each rubric behavior clearly shown in the written response; 0–3 AI/rubric points.
- +1 crowd-vote bonus for the most-voted submitted team(s). Tied leaders each receive the bonus.
- Up to 4 points per round, 24 across six rounds. AI suggestions are not objective performance evaluations.

## Files

- `app.py` — game API, real-time room state, AI scoring integration, rubric logic.
- `static/app.js`, `static/style.css`, `static/index.html` — responsive facilitator and participant app.
- `static/images/scenario-1.webp` through `scenario-6.webp` — six original AI-generated scene illustrations.
- `render.yaml` — Render deployment Blueprint with persistent storage and secret prompt.
- `start_windows.bat`, `start_mac_linux.sh` — local launch scripts.

## Customize

Scenarios are defined in `SCENARIOS` at the top of `app.py` (titles, dialogue, background, coaching criteria, examples, and image path). After modifying them, restart or redeploy the server. Images can be replaced by keeping their filenames unchanged.
