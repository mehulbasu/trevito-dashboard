## Data Retrieval Process

**POST /v3/shipments/filter/**

Request Body Parameters: `filter`

The `type` and `states` attributes are required:
```
"type":"postDispatch",
"states":["SHIPPED", "DELIVERED"]
```
OR
```
"type":"preDispatch",
"states":["APPROVED", "PACKING_IN_PROGRESS", "PACKED", "FORM_FAILED", "READY_TO_DISPATCH"]
```

This gives us a response similar to `flipkart.json`, with a `shipmentId` for each shipment.

Note that:
- A single customer order can be splitted into multiple shipments even though all the products are from the same seller.
- A shipment can have multiple order item ids(products) of the same order/customer.
- A shipment cannot have order item ids of multiple orders/customers.

With this API call, we have almost all the required information except for the buyer's geographic information.

**POST /v3/shipments/:shipmentIds**

`shipmentIds` is a comma-separated list of IDs. This gives us a response similar to `flipkart-details.json`.
The Shipments API gives the shipping details for multiple shipment ids based on the specified shipmentIds. The recommended limit is 25 shipmentIds.

## Schema

```sql
-- 1. Create the Orders table (one row per shipmentId)
CREATE TABLE sales.flipkart_orders (
    shipment_id TEXT PRIMARY KEY,
    order_id TEXT NOT NULL,
    payment_type TEXT,

    customer_city TEXT,
    customer_state TEXT,
    customer_pincode TEXT,

    last_accessed_at TIMESTAMPTZ DEFAULT now()
);

-- 2. Create the Items table
CREATE TABLE sales.flipkart_items (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    shipment_id TEXT NOT NULL REFERENCES sales.flipkart_orders(shipment_id) ON DELETE CASCADE,
    order_item_id TEXT,
    order_date TIMESTAMPTZ,

    status TEXT,
    quantity INTEGER,
    sku TEXT,
    total_price DECIMAL(10, 2)
    net_revenue DECIMAL(10, 2)
);

-- 3. Performance indexes and uniqueness constraints
CREATE UNIQUE INDEX uniq_flipkart_items_shipment_order_item ON sales.flipkart_items(shipment_id, order_item_id);
CREATE INDEX idx_flipkart_orders_order_id ON sales.flipkart_orders(order_id);
CREATE INDEX idx_flipkart_orders_geo ON sales.flipkart_orders(customer_state, customer_city, customer_pincode);
CREATE INDEX idx_flipkart_items_status ON sales.flipkart_items(status);
CREATE INDEX idx_flipkart_items_order_date ON sales.flipkart_items(order_date);
CREATE INDEX idx_flipkart_items_sku ON sales.flipkart_items(sku);
```

## Notes

- Order ID OD336809639415806100 has one product as "Delivered", another as "Return Requested". If it is a replacement that has been delivered, why does it still say "Return Requested"? How should we handle such replacements?

- Need to know API behavior in two specific cases yet to be observed. In both cases, we want to know how it affect the `totalPrice` field in `orderItems.priceComponents`:
    - An order with 2+ items of the same product variant: Will `totalPrice` already be multiplied by the item quantity?
    - An order with 2+ items of different product variants: Assuming there will be a `totalPrice` field for each `orderItems` object, how will they handle the logistics fees? Will it be subtracted from both prices? Only one?