## Overview

This is the high-level description of the final dashboard deliverable, for now. We want to retrieve and display sales data for all our channels (Amazon, Flipkart, Shiprocket, Vyapar) in one place. Currently, we have two tables for each channel: one for items (like amazon.items) and one for orders (like amazon.orders). You can find detailed information about all these `sales` schema tables in [Supabase migrations](supabase/migrations/20260309202020_remote_schema.sql).

For the dashboard, our dimensions include product variant, sales channel, and time period (monthly by default). The metrics/facts we want to view are sales revenue and number of products sold. By default, we want to view the per-channel, per-product-variant sales totals (both revenue and quantity) for the last 30 days.

We need a control panel attached to this dashboard to set filters such as (1) Date Range Picker, (2) Multi-Select for Channels, (3) Multi-Select for Products, (4) Group By Selector: A dropdown that lets you choose the "Row Heading" (e.g., Group by "Product" or Group by "Channel"). If the user selects "Group by: Product," the table shows one SKU per row with its total revenue and units sold. If the user selects "Group by: Channel," the rows change to show channel names with their respective totals. By default, we should group by Product first to have 10 SKU rows and then group by Channel so we have 4 rows for each SKU, a total of 40 rows.

While creating this Dashboard, please respect best practices for React and Next.js (App Router). Use Mantine components for all the frontend elements.

#### SKU to Product Mapping

Products are ordered canonically throughout the dashboard — in both the product filter list and the table rows — as follows: Women's fragrances (Allure, Bliss, Celeste, Euphoria), Women's Gift Set, then Men's fragrances (Elixir, Escape, Illusion, Legend), Men's Gift Set.

- `TR PF001`: Allure (Women's)
- `TR PF002`: Bliss (Women's)
- `TR PF003`: Celeste (Women's)
- `TR PF006`: Euphoria (Women's)
- `TR PF008`: Women's Gift Set
- `TR PF004`: Elixir (Men's)
- `TR PF005`: Escape (Men's)
- `TR PF009`: Illusion (Men's)
- `TR PF010`: Legend (Men's)
- `TR PF007`: Men's Gift Set

#### Technical Details
Only the orders which meet the criteria below should be included in the dashboard:
- Shiprocket: `shiprocket_orders.order_status` = `DELIVERED`
- Flipkart: `flipkart_items.status` = `DELIVERED`, `SHIPPED` or `READY_TO_DISPATCH`
- Amazon: `amazon_orders.order_status` = `SHIPPED`
- Vyapar: Include all items

I’m looking for a hybrid architecture where the URL acts as the primary state for filters. I’d like to keep the data processing (like merging our various sales tables) on the database/server side via views or a unified API, and have the frontend reactively update based on URL parameter changes.

## Implementation

### Architecture overview

The dashboard follows a **hybrid server/client architecture** where:
- The URL is the single source of truth for filter state (date range, channels, groupBy).
- The Next.js App Router page is an **async server component** that reads those URL params, executes the database query server-side, and passes the result as plain props to the client-side table component.
- Filter controls are a **client component** that writes back to the URL on change, triggering a server-side re-render. No global state management library (e.g. Redux, Zustand) is used.

This separation gives fast initial loads (data arrives pre-rendered), shareable/bookmarkable URLs, and no client-side data fetching complexity.

---

### File structure

```
trevito-dashboard/
  app/
    dashboard/
      page.tsx          # Async server component — reads URL params, calls RPC, renders layout
      loading.tsx       # Next.js streaming skeleton shown while page.tsx awaits
  components/
    dashboard/
      FilterBar.tsx     # 'use client' — date range, channel multi-select, group-by selector
      SalesTable.tsx    # Pure display component — receives data as props, handles grouping/formatting
  lib/
    constants.ts        # SKU→product map, channel list, group-by options (shared everywhere)
    filters.ts          # parseFilters() — converts URLSearchParams → typed Filters object
supabase/
  migrations/
    20260310000002_dashboard_summary_revenue_fix.sql   # Squashed baseline migration
```

---

### Database layer — `sales.dashboard_summary` RPC

**Why an RPC function instead of a view or multiple queries?**

- A database view cannot accept parameters, so it cannot filter by date range or channels dynamically. Multiple client-side queries would require shipping raw order data to the browser and merging it in JavaScript — expensive and brittle.
- A PostgreSQL function (called via Supabase's PostgREST RPC interface) accepts parameters and returns pre-aggregated results, keeping all data processing server-side and reducing payload size dramatically.

**What it does:**
- Accepts `date_from timestamptz`, `date_to timestamptz`, and a `channels text[]` array.
- Runs four `SELECT … GROUP BY` queries (one per channel) joined with `UNION ALL`, each filtering by the channel's specific status criteria and the supplied date range.
- Groups by `(sku, month_start)` where `month_start = date_trunc('month', order_date)::date`, so the result naturally supports monthly sub-columns without any additional work on the frontend.
- Returns the most granular useful unit: `(channel, sku, month_start, total_revenue, total_quantity)`. The frontend then aggregates further for the selected `groupBy` mode.

**Date field mapping per channel:**
| Channel | Date field |
|---------|-----------|
| Amazon | `amazon_orders.order_date` |
| Flipkart | `flipkart_items.order_date` (date lives on items, not orders) |
| Shiprocket | `shiprocket_orders.order_date` |
| Vyapar | `vyapar_sales.sale_date` (a `date` type, cast to compare with `timestamptz` bounds) |

**Revenue calculation:**
`net_revenue` is a per-unit price stored on each item row. The total revenue for a row is `net_revenue × quantity`. To avoid multiplying every row, the function uses:
```sql
SUM(net_revenue)
  + SUM(net_revenue * (quantity - 1)) FILTER (WHERE quantity > 1)
```
Since ~90% of rows are single-unit orders, the `FILTER` clause means the multiplication is only evaluated for the minority of multi-unit rows. The plain `SUM(net_revenue)` handles the common case cheaply.

**Security: `SECURITY DEFINER`**
By default, a SQL function runs in the security context of the calling user (`authenticated`). The RLS policies on all `sales.*` tables only grant row access to `service_role`, so a plain function would return zero rows silently. Marking the function `SECURITY DEFINER` makes it execute as its owner (`postgres`), bypassing RLS so it can read any row. The `SET search_path = sales, public, pg_catalog` clause is added alongside it to prevent search-path-based privilege escalation.

---

### Filter state — URL as the source of truth

**URL shape:**
```
/dashboard?from=2026-02-07&to=2026-03-09&channels=amazon,flipkart,shopify,vyapar&groupBy=product-channel
```

**How it works end-to-end:**
1. `FilterBar` (client) reads `useSearchParams()` and renders controls pre-populated with the current URL state.
2. When a filter changes, `FilterBar` calls `router.replace(newUrl, { scroll: false })`. `replace` is used instead of `push` so back-navigation skips intermediate filter states.
3. The URL change causes Next.js App Router to re-render `app/dashboard/page.tsx` on the server with the new `searchParams`.
4. `parseFilters()` in `lib/filters.ts` converts the raw URL params to a typed `Filters` object with safe defaults (last 30 days, all channels, `product-channel` groupBy). It is a plain function with no framework dependencies, importable from both server components and client components without triggering the `'use client'` boundary.
5. The server page calls the RPC with the parsed values and passes the result down to `SalesTable` as props.

**Why `parseFilters` lives in `lib/filters.ts` (not inside `FilterBar`):**
Server components cannot import from `'use client'` modules. Since `page.tsx` (server) and `FilterBar.tsx` (client) both need to parse the same URL params into the same typed values, the function must live in a module that has no client-only code. `lib/filters.ts` has no browser APIs and no `'use client'` directive.

**Date picker: local state + URL commit**
`DatePickerInput` in range mode fires `onChange` after the first click with `[startDate, null]` — the end date isn't chosen yet. Because the component is fully controlled (its display depends entirely on the `value` prop), if that partial state were immediately written to the URL, the server would re-render with a broken date range and the calendar would reset mid-selection. The fix is a `useState` hook in `FilterBar` that tracks the in-progress `[start, end | null]` value locally, only committing to the URL once both dates are non-null.

---

### `SalesTable` — frontend grouping and display

The RPC always returns the most granular data: one row per `(channel, sku, month)`. `SalesTable` receives this raw data plus the `groupBy` and date range props, and handles all further aggregation and display logic in the browser.

**Component structure:**
- Built entirely with Mantine components (`Table`, `ScrollArea`, `UnstyledButton`, `Box`) — no raw HTML table elements.
- All derived values — `periods`, aggregated rows, the flat row list, and grand totals — are memoised with `useMemo` to avoid recomputation on unrelated renders.
- `buildFlatRows` (flat row list construction for the product-channel view) is a pure function extracted outside the component.
- A `MonthlyCells` sub-component encapsulates the repeated revenue/qty cell pair pattern, shared by both the grouped and flat row rendering paths.

**Three groupBy modes:**
| Mode | Key | Rows shown |
|------|-----|-----------|
| `product-channel` (default) | `sku\|channel` | Up to 40 rows (10 SKUs × 4 channels). Product name shown only on the first row of each SKU group; a separator line marks each new product. |
| `product` | `sku` | 10 rows. Revenue and qty summed across all channels for each SKU. |
| `channel` | `channel` | 4 rows. Revenue and qty summed across all SKUs for each channel. |

**Monthly sub-columns:**
- `buildPeriods(dateFrom, dateTo)` generates one `Period` entry per calendar month that overlaps the selected range.
- If the selected range covers only one month, `showMonthly` is `false` and the table renders a simple two-column layout (Revenue, Qty).
- If the range spans more than one month, a second header row appears with month labels as column group headers, each spanning two sub-columns (Revenue, Qty). A "Total" column group is always appended on the right.
- Month labels are context-aware: a month where the selected range starts exactly on the 1st and ends exactly on the last day displays just the month name (e.g. `April`). Any partial month at either boundary displays the actual date span (e.g. `Mar 9 – Mar 31`).

**Aggregation in `aggregate()`:**
Iterates the raw RPC rows once, building a `Map` keyed by the composite groupBy key. Each map entry accumulates `totalRevenue`, `totalQty`, and a `monthly` sub-object keyed by `YYYY-MM-DD` month start. This single O(n) pass produces all the data needed for both the detail rows and the totals footer.

**Revenue formatting:**
Uses `Intl.NumberFormat` with `{ style: 'currency', currency: 'INR' }` to format all revenue figures as Indian Rupees (e.g. `₹1,23,456`), respecting the Indian lakh/crore grouping convention automatically.

---

### Filter bar UX

All four filter controls — date range, channels, products, and group-by — are laid out on a single row with equal widths so the bar never wraps or shifts.

The **Channels** and **Products** selects use a compact count-based display instead of showing each selected item as a pill. This keeps the controls a fixed width regardless of how many items are selected. The display reads `All (N)` when everything is selected, `K of N selected` for a subset, and `None selected` when the dropdown has been cleared. Clicking either control opens a dropdown with a checkbox next to each item.

The **Products** filter is backed by the canonical product ordering described above, so the dropdown always lists products in the Women's → Men's.

When **all channels or all products are selected**, the corresponding URL parameter is omitted entirely (treated as the default "no filter applied"), keeping URLs clean and shareable.

---

### Table design and UX

#### Monthly sub-columns

When the selected date range spans more than one calendar month, the table expands to show one pair of Revenue/Qty sub-columns per month, with month names centred above each pair in the top header row. Alternating month groups use slightly different header background shades to make it easy to visually scan across a row. A persistent Total column always appears on the right regardless of how many months are shown.

Partial months at either boundary of the date range display the actual date span (e.g. `Mar 9 – Mar 31`) rather than just the month name.

#### Product name merging (Product → Channel view)

In the default Product → Channel grouping mode, all channel rows belonging to the same product share a single merged Product cell that spans the full channel group. The product name is vertically centred in that merged cell.

#### Sticky label columns

The Product and Channel label columns are pinned to the left edge of the visible area while scrolling horizontally, so the row identity is always visible regardless of how many month columns are on screen.

#### Horizontal scroll controls

Because the table can become wide when many months are selected, two tall narrow buttons flank the table — one on the left gutter, one on the right gutter. Clicking either button smoothly scrolls the table in the corresponding direction. This gives desktop users a click target for horizontal navigation without requiring them to interact with the browser's scrollbar.