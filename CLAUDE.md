# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

The Next.js app lives in `trevito-dashboard/`. Run all commands from that directory:

```bash
cd trevito-dashboard
npm run dev      # Start dev server (port 3000)
npm run build    # Production build
npm run lint     # Run ESLint
```

For Supabase edge functions, use the Supabase CLI from the repo root:

```bash
npx supabase functions serve <function-name>   # Serve a single edge function locally
npx supabase db push                           # Apply pending migrations
npx supabase start                             # Start local Supabase stack
```

## Architecture

**Trévito Dashboard** is a multi-channel sales analytics platform for a D2C perfume brand. It aggregates sales from 4 channels (Shopify/Shiprocket, Amazon, Flipkart, Vyapar) into a unified dashboard.

### Tech Stack

- **Next.js** (App Router) + React + TypeScript
- **Mantine** for UI components + Tailwind CSS 4 for styling
- **Supabase** for auth (magic link/OTP), PostgreSQL database, and Deno edge functions
- **`@/*`** path alias maps to the `trevito-dashboard/` root

### App Structure

```
trevito-dashboard/
├── app/
│   ├── (auth)/login/    # Email OTP login; shouldCreateUser=false → invite-only
│   ├── (auth)/confirm/  # Auth callback route
│   ├── dashboard/       # Analytics view (async server component)
│   └── data/            # Data sync controls
├── components/
│   ├── dashboard/       # FilterBar, SalesTable
│   └── data/            # SyncPanel, SyncButton, VyaparUploadPanel
├── lib/
│   ├── supabase/        # server.ts (SSR client), client.ts (browser client)
│   ├── constants.ts     # SKU/product definitions, channel configs
│   └── filters.ts       # URL search-param parsing for dashboard filters
└── supabase/
    ├── migrations/       # PostgreSQL migrations (schema: `sales`)
    └── functions/        # Edge functions: shiprocket, amazon, flipkart, vyapar (+ backfill variants)
```

### Data Flow

1. **Auth:** Supabase magic link → `/confirm` callback → redirect to dashboard
2. **Dashboard:** Server component fetches via `supabase.schema('sales').rpc('dashboard_summary', { date_from, date_to, channels })` → renders `SalesTable`
3. **Filters:** Stored entirely in URL search params (`?from=&to=&channels=&skus=&groupBy=`). Default: last 30 days, all channels, grouped by `product-channel`
4. **Data Sync:** Buttons in `/data` call Supabase edge functions (Shiprocket/Amazon/Flipkart) or parse uploaded XLS (Vyapar)

### Key Domain Concepts

- **SKUs:** 10 product variants — Women's (Allure, Bliss, Celeste, Euphoria, Gift Set) and Men's (Elixir, Escape, Illusion, Legend, Gift Set). Defined in `lib/constants.ts`
- **Channels:** `shopify`, `amazon`, `flipkart`, `vyapar`
- **Grouping options:** `product-channel` (default), `product`, `channel`
- **Database schema:** `sales` (separate from `public`). Tables: `shiprocket_orders`, `amazon_orders`, `flipkart_orders`, `vyapar_orders`, `last_updated`

### Edge Functions

Deno-based TypeScript functions in `supabase/functions/`. Each channel (except Vyapar) has a main sync function and a backfill variant for historical data. `refresh-secrets` handles credential rotation via Supabase Vault, set to execute everyday at midnight via a `cron` job.
