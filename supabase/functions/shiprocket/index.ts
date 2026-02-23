/**
 * Shiprocket incremental sync edge function.
 *
 * What it does:
 * - Fetches recent orders from Shiprocket (`updatedFrom = today - 25 days`) and upserts them into
 *   `sales.shiprocket_orders` and `sales.shiprocket_items`.
 *
 * How it works:
 * - Reads the current Shiprocket bearer token from `private.api_keys` where `service = 'shiprocket'`.
 * - Paginates Shiprocket API responses and writes normalized order/item records into the sales schema.
 *
 * Request params:
 * - Method: POST (no request body required).
 *
 * Response:
 * - 200: `{ orders_processed: number, items_processed: number }` or `{ message: string }`.
 * - 500: `{ error: string }`.
 */
import "@supabase/functions-js/edge-runtime.d.ts"
import { corsHeaders } from 'npm:@supabase/supabase-js@2.95.3/cors'
import { createClient } from 'npm:@supabase/supabase-js@2.95.3'

type ApiKeyRow = {
  key: string
  expiry: string | null
}

type ShiprocketOrder = {
  id: number
  channel_order_id: string
  created_at: string
  status: string
  payment_method: string
  total: string
  tax: string
  customer_name: string
  customer_email: string
  customer_address: string
  customer_city: string
  customer_state: string
  customer_pincode: string
  products: Array<{ channel_sku: string; quantity: number; mrp: number; discount_including_tax: number }>
  shipments: Array<{ shipped_date: string | null; delivered_date: string | null }>
  others?: {
    discount_codes?: Array<{ code?: string; amount?: string }>
    note_attributes?: Array<{ name: string; value: string }>
  }
}

type ShiprocketResponse = {
  data?: ShiprocketOrder[]
  meta?: {
    pagination?: {
      links?: {
        next?: string | null
      }
    }
  }
}

const parseNumber = (value: string | number | undefined | null) => {
  if (value == null || value === '') return 0
  const parsed = Number(String(value).replace(/[^0-9.-]/g, ''))
  return Number.isNaN(parsed) ? 0 : parsed
}

const parseDate = (value: string | null | undefined) => {
  if (!value) return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date.toISOString()
}

const getNoteAttribute = (attrs: Array<{ name: string; value: string }> | undefined, key: string) =>
  attrs?.find((attr) => attr.name.toLowerCase() === key.toLowerCase())?.value ?? null

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    if (req.method !== 'POST') {
      return new Response(JSON.stringify({ error: 'Method not allowed' }), {
        status: 405,
        headers: {  ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    if (!supabaseUrl || !serviceRoleKey) {
      throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
    }

    const salesClient = createClient(
      supabaseUrl,
      serviceRoleKey,
      { db: { schema: 'sales' } }
    )

    const privateClient = createClient(
      supabaseUrl,
      serviceRoleKey,
      { db: { schema: 'private' } }
    )

    const { data: apiKeyRow, error: apiKeyError } = await privateClient
      .from('api_keys')
      .select('key, expiry')
      .eq('service', 'shiprocket')
      .order('id', { ascending: false })
      .limit(1)
      .maybeSingle<ApiKeyRow>()

    if (apiKeyError) {
      throw apiKeyError
    }

    const shiprocketToken = apiKeyRow?.key
    if (!shiprocketToken) {
      throw new Error('Missing shiprocket API key in private.api_keys')
    }

    const updatedFromDate = new Date(Date.now() - 25 * 24 * 60 * 60 * 1000)
      .toISOString()
      .split('T')[0]

    const shiprocketUrl = new URL('https://apiv2.shiprocket.in/v1/external/orders')
    const preservedParams = new URLSearchParams()
    shiprocketUrl.searchParams.set('updatedFrom', updatedFromDate)
    preservedParams.set('updatedFrom', updatedFromDate)

    const headers = { Authorization: `Bearer ${shiprocketToken}` }
    const orders: ShiprocketOrder[] = []
    let nextUrl: string | null = shiprocketUrl.toString()

    const applyPreservedParams = (input: string) => {
      const normalizedUrl = new URL(input)
      for (const [key, value] of preservedParams) {
        if (!normalizedUrl.searchParams.has(key)) {
          normalizedUrl.searchParams.set(key, value)
        }
      }
      return normalizedUrl.toString()
    }

    const pause = () => new Promise((resolve) => setTimeout(resolve, 500))

    while (nextUrl) {
      const fetchUrl = applyPreservedParams(nextUrl)
      console.log(`Fetching Shiprocket orders from: ${fetchUrl}`)
      const response = await fetch(fetchUrl, { headers })
      if (!response.ok) {
        throw new Error(`Shiprocket responded with ${response.status}`)
      }

      const page = await response.json() as ShiprocketResponse
      orders.push(...(page.data ?? []))

      nextUrl = page.meta?.pagination?.links?.next ?? null
      if (nextUrl) {
        await pause()
      }
    }

    if (orders.length === 0) {
      return new Response(JSON.stringify({ message: 'No Shiprocket orders returned' }), {
        status: 200,
        headers: {  ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const processedOrders = orders.map((order) => {
      const discountCodes = order.others?.discount_codes ?? []
      const totalDiscount = discountCodes.reduce((sum, code) => sum + parseNumber(code.amount), 0)
      const noteAttrs = order.others?.note_attributes

      const shipment = order.shipments?.[0]

      return {
        shiprocket_id: order.id,
        shopify_order_id: order.channel_order_id,
        order_date: parseDate(order.created_at),
        order_status: order.status,
        shipped_date: parseDate(shipment?.shipped_date ?? null),
        delivery_date: parseDate(shipment?.delivered_date ?? null),
        customer_name: order.customer_name,
        customer_email: order.customer_email,
        customer_address: order.customer_address,
        customer_city: order.customer_city,
        customer_state: order.customer_state,
        customer_pincode: order.customer_pincode,
        payment_method: order.payment_method,
        total_amount: parseNumber(order.total),
        tax_amount: parseNumber(order.tax),
        discount_code: discountCodes.map((code) => code.code).filter(Boolean).join(', ') || null,
        total_discount: totalDiscount,
        utm_source: getNoteAttribute(noteAttrs, 'utm_source'),
        utm_medium: getNoteAttribute(noteAttrs, 'utm_medium'),
        utm_campaign: getNoteAttribute(noteAttrs, 'utm_campaign')
      }
    })

    const { error: orderError } = await salesClient
      .from('shiprocket_orders')
      .upsert(processedOrders, { onConflict: 'shiprocket_id' })

    if (orderError) {
      throw orderError
    }

    // TODO: Selling price is currently per-unit. Multiply by quantity?
    const itemsToInsert = orders.flatMap((order) =>
      order.products.map((product) => ({
        shiprocket_order_id: order.id,
        sku: product.channel_sku,
        quantity: product.quantity,
        selling_price: parseNumber(product.mrp) - parseNumber(product.discount_including_tax)
      }))
    )

    const skusByOrder = orders.reduce<Record<number, string[]>>((acc, order) => {
      acc[order.id] = Array.from(new Set(order.products.map((product) => product.channel_sku)))
      return acc
    }, {})

    if (itemsToInsert.length > 0) {
      const { error: itemError } = await salesClient
        .from('shiprocket_items')
        .upsert(itemsToInsert, { onConflict: 'shiprocket_order_id,sku' })

      if (itemError) {
        throw itemError
      }

      // TODO: Review cleanup logic and redundant deletes
      for (const [orderId, skus] of Object.entries(skusByOrder)) {
        if (skus.length === 0) continue
        const sanitized = skus
          .map((sku) => `"${sku.replace(/"/g, '""')}"`)
          .join(',')
        const { error: cleanupError } = await salesClient
          .from('shiprocket_items')
          .delete()
          .eq('shiprocket_order_id', Number(orderId))
          .not('sku', 'in', `(${sanitized})`)

        if (cleanupError) {
          throw cleanupError
        }
      }
    }

    // Update sales.last_updated table with timestamp
    const { error: lastUpdatedError } = await salesClient
      .from('last_updated')
      .upsert({ channel: 'shiprocket', updated: new Date() }, { onConflict: 'channel' })

    if (lastUpdatedError) {
      throw lastUpdatedError
    }

    return new Response(JSON.stringify({
      orders_processed: processedOrders.length,
      items_processed: itemsToInsert.length
    }), {
      status: 200,
      headers: {  ...corsHeaders, 'Content-Type': 'application/json' }
    })
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err?.message ?? err) }), {
      status: 500,
      headers: {  ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})