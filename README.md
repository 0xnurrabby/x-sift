# x-sift

Paste one or more X (Twitter) post links, get back the usernames of everyone who replied —
filtered by **X verified** status and a **minimum follower count**. Copy the list or export it as `.txt`.

Runs on the Apify actor [`xquik/x-reply-scraper`](https://apify.com/xquik/x-reply-scraper):
one Apify run per scan, replies grouped back per post, no cookies or X login needed.

## Features

- Multiple post links in a single scan (one per line, up to 10 posts)
- Live Apify run status plus per-post reply/user counts
- Filters: X verified only · minimum followers (default 1,000) · username de-duplication
- Per-post tabs plus a combined "All posts" view
- Copy to clipboard, download `.txt`, or download `.csv`
- Whole site sits behind a single password (server-side, cookie session)

## Environment variables

| Name | Required | Description |
| --- | --- | --- |
| `APP_PASSWORD` | yes | The only password that unlocks the site. |
| `APIFY_TOKEN` | yes | Apify API token used to start runs and read datasets. |
| `APIFY_ACTOR` | no | Defaults to `xquik/x-reply-scraper`. |

### Why not `apidojo/twitter-scraper-lite`?

That actor refuses to deliver real rows on Apify's free plan — it returns
`{"demo": true}` items with the log message *"Monthly run limit exceeded per user"* and caps
free-plan runs at 10 items. `xquik/x-reply-scraper` costs the same ballpark
($0.00015 per delivered reply), runs on the free plan, follows nested replies, and returns full
author profiles (followers + verification), which the filters need. Point `APIFY_ACTOR` at any
other replies actor that outputs `authorFollowers` / `authorVerified` style fields to swap it.

### Filter semantics

"X verified" matches any public verification signal on the profile: blue check, legacy or
organisation verification, or a business/verified account type.

Copy `.env.example` to `.env.local` for local development.

## Local development

```bash
npm install
npm run dev
# http://localhost:3000
```

## Deploy

```bash
npm i -g vercel
vercel link
vercel env add APP_PASSWORD production
vercel env add APIFY_TOKEN production
vercel --prod
```

## Notes

- X search does not always index every reply of a very large conversation, so extremely busy
  posts can come back partially. Raise **Max replies per post** to pull more.
- "Verified" means any X verification signal on the profile: blue check, legacy/organisation
  verification, or a business verified type.
- Apify usage is billed to the account that owns `APIFY_TOKEN`.
