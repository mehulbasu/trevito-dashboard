## Overview

This is the high-level description of the final dashboard deliverable, for now. We want to retrieve and display sales data for all our channels (Amazon, Flipkart, Shiprocket, Vyapar) in one place. Currently, we have two tables for each channel: one for items (like amazon.items) and one for orders (like amazon.orders). You can find detailed information about all these `sales` schema tables in [Supabase migrations](supabase/migrations/20260309202020_remote_schema.sql).

For the dashboard, our dimensions include product variant, sales channel, and time period (monthly by default). The metrics/facts we want to view are sales revenue and number of products sold. By default, we want to view the per-channel, per-product-variant sales totals (both revenue and quantity) for the last 30 days.

We need a control panel attached to this dashboard to set filters such as (1) Date Range Picker, (2) Multi-Select for Channels, (3) Group By Selector: A dropdown that lets you choose the "Row Heading" (e.g., Group by "Product" or Group by "Channel"). If the user selects "Group by: Product," the table shows one SKU per row with its total revenue and units sold. If the user selects "Group by: Channel," the rows change to show channel names with their respective totals. By default, we should group by Product first to have 10 SKU rows and then group by Channel so we have 4 rows for each SKU, a total of 40 rows.

While creating this Dashboard, please respect best practices for React and Next.js (App Router). Use Mantine components for all the frontend elements.

#### SKU to Product Mapping
- `TR PF001`: Allure
- `TR PF002`: Bliss
- `TR PF003`: Celeste
- `TR PF004`: Allure
- `TR PF005`: Escape
- `TR PF006`: Euphoria
- `TR PF007`: Men's Gift Set
- `TR PF008`: Women's Gift Set
- `TR PF009`: Illusion
- `TR PF010`: Legend
