## Schema

-- 1. Create the Sales Report Table (Order Level)
CREATE TABLE sales.vyapar_sales (
    invoice_no BIGINT PRIMARY KEY,     -- The unique identifier from Vyapar
    sale_date DATE NOT NULL,
    customer_name TEXT,
    customer_phone TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 2. Create the Sale Items Table (Item Level)
CREATE TABLE sales.vyapar_items (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    -- FK linking back to the sale
    invoice_no BIGINT NOT NULL REFERENCES sales.vyapar_sales(invoice_no) ON DELETE CASCADE,
    sku TEXT,
    quantity INTEGER,
    net_revenue DECIMAL(12, 2),   -- Total amount - GST / item quantity
    
    -- Ensure we don't duplicate the same item in the same invoice
    CONSTRAINT unique_vyapar_item UNIQUE (invoice_no, sku)
);

-- 3. Index for fast lookups
CREATE INDEX idx_vyapar_items_invoice ON sales.vyapar_items(invoice_no);

## Data

The .xls file contains two sheets, "Sale Report" and "Sale Items". They have a couple empty columns which have been ommitted here for brevity.

### Sale Report

| Date       | Party Name   | Phone No.  | Invoice No. | Transaction Type | Total Amount | Payment Type | Received Amount | Balance Amount |
| ---------- | ------------ | ---------- | ----------- | ---------------- | -----------: | ------------ | --------------: | -------------: |
| 26/12/2025 | Kasturi Saha | 9911115376 | 222         | Sale             |       3896.0 | Cash         |          3896.0 |            0.0 |
| 23/12/2025 | Amol Hulge   | 9075171717 | 221         | Sale             |        649.0 | Cash         |           649.0 |            0.0 |


### Sale Items

| Date       | Party Name   | Invoice No. | Item Name                       | Item code | HSN/SAC  | Quantity | Price/Unit | Discount       | GST            |  Amount |
| ---------- | ------------ | ----------- | ------------------------------- | --------- | -------- | -------: | ---------: | -------------- | -------------- | ------: |
| 26/12/2025 | Kasturi Saha | 222         | TRÉVITO Women’s Gift Set 4X20ml | TR PF008  | 33030050 |      3.0 |     846.61 | 888.94 (35.0%) | 297.16 (18.0%) | 1948.05 |
| 26/12/2025 | Kasturi Saha | 222         | TRÉVITO Men’s Gift Set 4X20ml   | TR PF007  | 33030050 |      3.0 |     846.61 | 888.94 (35.0%) | 297.16 (18.0%) | 1948.05 |
| 23/12/2025 | Amol Hulge   | 221         | TRÉVITO CELESTE For Her 100ml   | TR PF003  | 33030050 |      1.0 |     846.61 | 296.31 (35.0%) | 99.05 (18.0%)  |  649.35 |


