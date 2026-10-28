# eichenlaubphysics-site

Public landing page for **Mark Eichenlaub Physics Mentorship** at https://eichenlaubphysics.com.

Single static page (HTML + CSS + Cal.com embed). No build step.

## Local preview

Just open `index.html` in a browser, or run any static server:

```
npx serve .
```

## Deploy

Pushed to GitHub, deployed via Cloudflare Pages to `eichenlaubphysics.com`. Cloudflare also redirects `markeichenlaub.com` → `eichenlaubphysics.com`.

## Editing content

The page text lives in `content/sections.html`, one `<section>` per block in
page order. `python tools/build.py` turns it into `index.html` (and the draft
editor page). A section with `data-nav="Label"` gets a header link;
`data-hidden="true"` keeps it off the live page.

### Draft editor (`/draft/`)

Mark edits a draft in the browser at `https://eichenlaubphysics.com/draft/?k=<DRAFT_KEY>`
(the key is in the gitignored `.env`). Click text to edit it, drag the handles
to reorder cards or sections, delete or hide sections; it autosaves to the
`site_drafts` table in the portal's Supabase through the `save_site_draft` RPC.

- `python tools/build.py --pull` pulls the saved draft, prints what changed,
  writes `content/sections.html`, and rebuilds `index.html`. Review, commit,
  push: that publishes it.
- `python tools/build.py --seed` overwrites the saved draft with the current
  `content/sections.html`.

Older notes:

- **Logo**: `logo.jpg`
- **Blurb / page copy**: `index.html` (inside `<section class="intro">`)
- **Booking link**: `index.html`, look for `calLink: "markeichenlaub"` in the inline `<script>`. To deep-link to a specific Cal.com event type, change to `"markeichenlaub/<event-slug>"`.
- **Colors / styling**: `styles.css` (CSS variables at the top)
