## Schema

-- 1. Create the Orders table
CREATE TABLE sales.amazon_orders (
    order_id TEXT PRIMARY KEY, 
    order_date TIMESTAMPTZ,    -- From createdTime
    order_status TEXT,         -- From fulfillmentStatus
    
    customer_city TEXT,
    customer_state TEXT,       -- From stateOrRegion
    customer_pincode TEXT,     -- From postalCode
    
    last_accessed_at TIMESTAMPTZ DEFAULT now()
);

-- 2. Create the Items table
CREATE TABLE sales.amazon_items (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id TEXT NOT NULL REFERENCES sales.amazon_orders(order_id) ON DELETE CASCADE,
    amazon_item_id TEXT,       -- Store the native orderItemId for safety
    sku TEXT,                  -- From sellerSku
    quantity INTEGER,          -- From quantityOrdered
    
    -- Recommendation: Store Gross Price and calculate Net in a View
    -- Storing only Net makes it impossible to reconcile with Amazon reports later.
    unit_price DECIMAL(10, 2), 
    net_revenue DECIMAL(10, 2) -- (Price * Qty) / 1.18 (to remove 18% GST)
);

-- 3. Performance index using the native Amazon ID
CREATE UNIQUE INDEX uniq_amazon_items_order_item ON sales.amazon_items(order_id, amazon_item_id);

## Notes

Query parameters include:
- `marketplaceIds` = `A21TJRUUN4KGV` (can be hardcoded)
- `lastUpdatedAfter` (ISO 8601 format, should be set to 1 month before current date)
- `includedData` = `RECIPIENT,FULFILLMENT` (array of strings)

Pagination occurs when a request produces a response that exceeds the `maxResultsPerPage` (default 100). This means that the response is divided into individual pages. To retrieve the next page, you must pass the `nextToken` value as the paginationToken query parameter in the next request. You will not receive a `nextToken` value on the last page.

Exclude order if it is non-Amazon:
```
"salesChannel": {
            "marketplaceId": "A21TJRUUN4KGV",
            "marketplaceName": "Non-Amazon",
            "channelName": "NON_AMAZON"
        },
```