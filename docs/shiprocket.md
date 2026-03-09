## Table Schema
```
-- Table for Order-level data
create table if not exists sales.shiprocket_orders (
  shiprocket_id bigint not null,
  shopify_order_id text null,
  order_date timestamp with time zone null,
  order_status text null,
  shipped_date timestamp with time zone null,
  delivery_date timestamp with time zone null,
  customer_name text null,
  customer_email text null,
  customer_address text null,
  customer_city text null,
  customer_state text null,
  customer_pincode text null,
  payment_method text null,
  discount_code text null,
  utm_source text null,
  utm_medium text null,
  utm_campaign text null,
  last_accessed_at timestamp with time zone null default now(),
  constraint shiprocket_orders_pkey primary key (shiprocket_id)
) TABLESPACE pg_default;

-- Table for Item-level data
create table if not exists sales.shiprocket_items (
  id uuid not null default gen_random_uuid (),
  shiprocket_order_id bigint not null,
  sku text null,
  quantity integer null,
  net_revenue numeric(10, 2) null,
  net_discount numeric(10, 2) null,
  constraint shiprocket_items_pkey primary key (id),
  constraint shiprocket_items_shiprocket_order_id_fkey foreign KEY (shiprocket_order_id) references sales.shiprocket_orders (shiprocket_id) on delete CASCADE
) TABLESPACE pg_default;

create unique INDEX IF not exists uniq_shiprocket_items_order_sku on sales.shiprocket_items using btree (shiprocket_order_id, sku) TABLESPACE pg_default;

-- Crucial unique index
CREATE UNIQUE INDEX uniq_shiprocket_items_order_sku ON sales.shiprocket_items(shiprocket_order_id, sku);
```
## Notes
- Cash-on-delivery (COD) orders, indicated by `"payment_method": "cod"`, have been rejected/canceled if `"status": "RTO DELIVERED"` indicating Return To Origin (RTO), or `"status": "LOST"` indicating package has been lost.
- Some custom orders will exist with unit prices = 1 rupee where products have been sent to influencers for free. Exclude these and canceled/rejected orders from analytics.
- `net_discount` should store `products.discount` (excluding tax by default). `net_revenue` should store `(products.price / 1.18) - products.discount`, since the price includes 18% GST.