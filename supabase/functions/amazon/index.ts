import "@supabase/functions-js/edge-runtime.d.ts"
import { corsHeaders } from 'npm:@supabase/supabase-js@2.95.3/cors'
import { createClient } from 'npm:@supabase/supabase-js@2.95.3'
import { Orders_v2026SpApi } from 'npm:@amazon-sp-api-release/amazon-sp-api-sdk-js@1.7.2'

type AmazonOrder = {
  orderId: string
  createdTime?: string | Date
  fulfillment?: {
    fulfillmentStatus?: string
  }
  recipient?: {
    deliveryAddress?: {
      city?: string
      stateOrRegion?: string
      postalCode?: string
    }
  }
  orderItems?: Array<{
    orderItemId?: string
    quantityOrdered?: number
    product?: {
      sellerSku?: string
      price?: {
        unitPrice?: {
          amount?: string | number
        }
      }
    }
  }>
}

const AMAZON_MARKETPLACE_ID = 'A21TJRUUN4KGV'
const SP_API_FE_ENDPOINT = 'https://sellingpartnerapi-fe.amazon.com'

const parseAmount = (value: string | number | undefined) => {
  if (value == null || value === '') return null
  const parsed = Number(value)
  return Number.isNaN(parsed) ? null : parsed
}

const parseDate = (value: string | Date | undefined) => {
  if (!value) return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date.toISOString()
}

const toFixedNumber = (value: number | null) => {
  if (value == null) return null
  return Number(value.toFixed(2))
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    if (req.method !== 'POST') {
      return new Response(JSON.stringify({ error: 'Method not allowed' }), {
        status: 405,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    const amazonClientId = Deno.env.get('AMAZON_CLIENT_ID')
    const amazonClientSecret = Deno.env.get('AMAZON_CLIENT_SECRET')
    const amazonRefreshToken = Deno.env.get('AMAZON_REFRESH_TOKEN')

    if (!supabaseUrl || !serviceRoleKey) {
      throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
    }

    if (!amazonClientId || !amazonClientSecret || !amazonRefreshToken) {
      throw new Error('Missing AMAZON_CLIENT_ID, AMAZON_CLIENT_SECRET or AMAZON_REFRESH_TOKEN')
    }

    const salesClient = createClient(
      supabaseUrl,
      serviceRoleKey,
      { db: { schema: 'sales' } }
    )

    const apiClient = new Orders_v2026SpApi.ApiClient(SP_API_FE_ENDPOINT)
    apiClient.enableAutoRetrievalAccessToken(
      amazonClientId,
      amazonClientSecret,
      amazonRefreshToken,
      null
    )
    const searchOrdersApi = new Orders_v2026SpApi.SearchOrdersApi(apiClient)

    const lastUpdatedAfter = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)

    const allOrders: AmazonOrder[] = []
    let nextToken: string | null = null

    do {
      const response = await searchOrdersApi.searchOrders({
        marketplaceIds: [AMAZON_MARKETPLACE_ID],
        lastUpdatedAfter,
        includedData: ['RECIPIENT', 'FULFILLMENT'],
        maxResultsPerPage: 100,
        paginationToken: nextToken ?? undefined
      })

      allOrders.push(...((response?.orders ?? []) as AmazonOrder[]))
      nextToken = response?.pagination?.nextToken ?? null
    } while (nextToken)

    if (allOrders.length === 0) {
      return new Response(JSON.stringify({ message: 'No Amazon orders returned' }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const nowIso = new Date().toISOString()

    const ordersToUpsert = allOrders.map((order) => ({
      order_id: order.orderId,
      order_date: parseDate(order.createdTime),
      order_status: order.fulfillment?.fulfillmentStatus ?? null,
      customer_city: order.recipient?.deliveryAddress?.city ?? null,
      customer_state: order.recipient?.deliveryAddress?.stateOrRegion ?? null,
      customer_pincode: order.recipient?.deliveryAddress?.postalCode ?? null,
      last_accessed_at: nowIso
    }))

    const { error: orderError } = await salesClient
      .from('amazon_orders')
      .upsert(ordersToUpsert, { onConflict: 'order_id' })

    if (orderError) {
      throw orderError
    }

    const itemsToUpsert = allOrders.flatMap((order) =>
      (order.orderItems ?? []).map((item) => {
        const quantity = item.quantityOrdered ?? 0
        const unitPrice = parseAmount(item.product?.price?.unitPrice?.amount)
        const grossRevenue = unitPrice == null ? null : unitPrice * quantity
        const netRevenue = grossRevenue == null ? null : grossRevenue / 1.18

        return {
          order_id: order.orderId,
          amazon_item_id: item.orderItemId ?? null,
          sku: item.product?.sellerSku ?? null,
          quantity,
          unit_price: toFixedNumber(unitPrice),
          net_revenue: toFixedNumber(netRevenue)
        }
      })
    )

    const orderIds = allOrders.map((order) => order.orderId)

    if (orderIds.length > 0) {
      const { error: cleanupError } = await salesClient
        .from('amazon_items')
        .delete()
        .in('order_id', orderIds)

      if (cleanupError) {
        throw cleanupError
      }
    }

    if (itemsToUpsert.length > 0) {
      const { error: itemError } = await salesClient
        .from('amazon_items')
        .upsert(itemsToUpsert, { onConflict: 'order_id,amazon_item_id' })

      if (itemError) {
        throw itemError
      }
    }

    const { error: lastUpdatedError } = await salesClient
      .from('last_updated')
      .upsert({ channel: 'amazon', updated: new Date() }, { onConflict: 'channel' })

    if (lastUpdatedError) {
      throw lastUpdatedError
    }

    return new Response(JSON.stringify({
      orders_processed: ordersToUpsert.length,
      items_processed: itemsToUpsert.length
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err?.message ?? err) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})
