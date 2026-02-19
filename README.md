# TRÉVITO Sales Dashboard
Trévito is a newly-launched (July 2025) Indian perfume brand with an online D2C business model. Current product offerings include eight men’s variants, eight women’s variants, a men’s gift set, and a women’s gift set. Products are being sold via the following channels:
- Shopify (brand website)
- Amazon
- Flipkart
- In-person popup stores (billed on an invoicing app Vyapar)

## Overview
Currently, there is no unification for sales data from these four separate channels. They each store data in their own unique formats; solutions like combining them on a spreadsheet are cumbersome and prone to errors.
We want to combine scattered information from these sources and create one single, accurate, and standardized source of truth. The goal is to be able to view key business metrics through sales performance data, identify trends, and efficiently allocate resources.

#### Shopify/Shiprocket
Orders placed on our Shopify website are fulfilled through Shiprocket, a delivery partner. I will use their API service (Orders endpoint) for product and shipment details.
#### Amazon
Amazon offers the Selling Partner API (SP-API) which gives me access to selling partner insights, finance & accounting, inventory & order tracking, and brand analytics. I will use the Reports API to create and retrieve reports for product sales.
#### Flipkart
Flipkart offers the Marketplace Seller API which has an Order Management system with an endpoint to filter and retrieve all orders which meet the specified criteria.
#### Vyapar
The app offers data export options to XLS files but does not have any automated process or API to do so. We will need functionality to upload, parse, and merge XLS sheets to update the database. This solution works fine since popup store sales happen only 2-3 times per month so the database will only need to be updated on those occasions.

## Analytical Deliverables
Dimensions include:
- Product variant
- Sales channel
- Time period (monthly by default)

Metrics include:
- Total sales revenue
- Percentage of sales
- Number of products sold