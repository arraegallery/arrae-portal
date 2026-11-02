# ARRAE Portal

Curation workspace for ARRAE Gallery, replacing the Airtable base "Artist Applications and Artworks".

What's here now (Volume IV first release):

- **Review board** (`/admin/review/<show>`): every artist and work for a show as a large image gallery, by artist or as one grid. Filter by status, medium, price, new applicant vs roster artist. One-click decisions per work and per application, a lightbox with full details (arrow keys move between works), and an artist panel with bio, links and private notes.
- **Waitlist** (`/admin/waitlist`): ranked list with notes, carry-forward, and a medium filter for filling a spot.
- **Soft wording**: admins see working labels; artists will only ever see the softer text in `src/lib/status.ts`.

Coming next: artist login, decision emails, push to Shopify, check-in.

## Stack

Next.js (App Router) · Postgres via Drizzle · Supabase (database, email-link sign-in, image storage) · Vercel hosting.

## Setup

1. Copy `.env.example` to `.env.local` and fill it in.
2. `npm install`
3. `npm run db:migrate` to create the tables.
4. `npm run import:airtable -- path/to/arrae_clean.json` to load the cleaned Airtable export. Safe to re-run; it never overwrites decisions made in the app.
5. `npm run import:images -- --show volume-iv` to copy images from Airtable into Supabase Storage (needs `AIRTABLE_TOKEN`). Run it again without `--show` for everything else.
6. `npm run dev`

For local work without sign-in, set `DEV_AUTH_BYPASS=true` (ignored in production).

## Data

Artist data never goes in this repository. The cleaned export (`arrae_clean.json`) and the review list live in the project's shared files.
