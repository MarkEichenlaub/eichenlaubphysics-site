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

- **Logo**: `logo.jpg`
- **Blurb / page copy**: `index.html` (inside `<section class="intro">`)
- **Booking link**: `index.html`, look for `calLink: "markeichenlaub"` in the inline `<script>`. To deep-link to a specific Cal.com event type, change to `"markeichenlaub/<event-slug>"`.
- **Colors / styling**: `styles.css` (CSS variables at the top)
