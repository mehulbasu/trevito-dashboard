SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


CREATE SCHEMA IF NOT EXISTS "sales";


ALTER SCHEMA "sales" OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "sales"."shiprocket_items" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "shiprocket_order_id" bigint NOT NULL,
    "sku" "text",
    "quantity" integer,
    "selling_price" numeric(10,2)
);


ALTER TABLE "sales"."shiprocket_items" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "sales"."shiprocket_orders" (
    "shiprocket_id" bigint NOT NULL,
    "shopify_order_id" "text",
    "order_date" timestamp with time zone,
    "order_status" "text",
    "shipped_date" timestamp with time zone,
    "delivery_date" timestamp with time zone,
    "customer_name" "text",
    "customer_email" "text",
    "customer_address" "text",
    "customer_city" "text",
    "customer_state" "text",
    "customer_pincode" "text",
    "payment_method" "text",
    "total_amount" numeric(10,2),
    "tax_amount" numeric(10,2),
    "discount_code" "text",
    "total_discount" numeric(10,2),
    "utm_source" "text",
    "utm_medium" "text",
    "utm_campaign" "text",
    "last_accessed_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "sales"."shiprocket_orders" OWNER TO "postgres";


ALTER TABLE ONLY "sales"."shiprocket_items"
    ADD CONSTRAINT "shiprocket_items_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "sales"."shiprocket_orders"
    ADD CONSTRAINT "shiprocket_orders_pkey" PRIMARY KEY ("shiprocket_id");



CREATE UNIQUE INDEX "uniq_shiprocket_items_order_sku" ON "sales"."shiprocket_items" USING "btree" ("shiprocket_order_id", "sku");



ALTER TABLE ONLY "sales"."shiprocket_items"
    ADD CONSTRAINT "shiprocket_items_shiprocket_order_id_fkey" FOREIGN KEY ("shiprocket_order_id") REFERENCES "sales"."shiprocket_orders"("shiprocket_id") ON DELETE CASCADE;



ALTER TABLE "sales"."shiprocket_items" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "sales"."shiprocket_orders" ENABLE ROW LEVEL SECURITY;


GRANT USAGE ON SCHEMA "sales" TO "anon";
GRANT USAGE ON SCHEMA "sales" TO "authenticated";
GRANT USAGE ON SCHEMA "sales" TO "service_role";



GRANT ALL ON TABLE "sales"."shiprocket_items" TO "anon";
GRANT ALL ON TABLE "sales"."shiprocket_items" TO "authenticated";
GRANT ALL ON TABLE "sales"."shiprocket_items" TO "service_role";



GRANT ALL ON TABLE "sales"."shiprocket_orders" TO "anon";
GRANT ALL ON TABLE "sales"."shiprocket_orders" TO "authenticated";
GRANT ALL ON TABLE "sales"."shiprocket_orders" TO "service_role";



ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "sales" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "sales" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "sales" GRANT ALL ON SEQUENCES TO "service_role";



ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "sales" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "sales" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "sales" GRANT ALL ON FUNCTIONS TO "service_role";



ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "sales" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "sales" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "sales" GRANT ALL ON TABLES TO "service_role";