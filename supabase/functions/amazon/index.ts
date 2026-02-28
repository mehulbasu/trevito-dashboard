import "@supabase/functions-js/edge-runtime.d.ts"
import { corsHeaders } from 'npm:@supabase/supabase-js@2.95.3/cors'
import { createClient } from 'npm:@supabase/supabase-js@2.95.3'
import { LwaAuthClient } from 'npm:@amazon-sp-api-release/amazon-sp-api-sdk-js@1.7.2'

type AmazonOrder = {
  orderId: string
  createdTime?: string | Date
  salesChannel?: {
    marketplaceId?: string
    marketplaceName?: string
    channelName?: string
  }
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
const SP_API_ENDPOINT = 'https://sellingpartnerapi-eu.amazon.com'

const amazonClientId = Deno.env.get('AMAZON_CLIENT_ID')
const amazonClientSecret = Deno.env.get('AMAZON_CLIENT_SECRET')
const amazonRefreshToken = Deno.env.get('AMAZON_REFRESH_TOKEN')

let lwaAuthClient: LwaAuthClient | null = null
let amazonClientInitError: string | null = null

if (!amazonClientId || !amazonClientSecret || !amazonRefreshToken) {
  amazonClientInitError = 'Missing AMAZON_CLIENT_ID, AMAZON_CLIENT_SECRET or AMAZON_REFRESH_TOKEN'
} else {
  try {
    lwaAuthClient = new LwaAuthClient(
      amazonClientId,
      amazonClientSecret,
      amazonRefreshToken,
      null
    )
    console.log('[amazon] Amazon LWA auth client initialized')
  } catch (error) {
    amazonClientInitError = `Failed to initialize Amazon LWA auth client: ${String(error)}`
  }
}

const searchOrdersPage = async (
  accessToken: string,
  params: {
    lastUpdatedAfter: string
    paginationToken?: string
  }
) => {
  const url = new URL('/orders/2026-01-01/orders', SP_API_ENDPOINT)
  url.searchParams.set('lastUpdatedAfter', params.lastUpdatedAfter)
  url.searchParams.set('marketplaceIds', AMAZON_MARKETPLACE_ID)
  url.searchParams.set('maxResultsPerPage', '100')
  url.searchParams.set('includedData', 'RECIPIENT,FULFILLMENT')
  if (params.paginationToken) {
    url.searchParams.set('paginationToken', params.paginationToken)
  }

  const response = await fetch(url, {
    method: 'GET',
    headers: {
      'x-amz-access-token': accessToken,
      'Content-Type': 'application/json',
      Accept: 'application/json'
    }
  })

  if (!response.ok) {
    const bodyText = await response.text()
    const error = new Error(`Amazon searchOrders failed with ${response.status}: ${response.statusText}`) as Error & {
      status?: number
      response?: { text?: string }
    }
    error.status = response.status
    error.response = { text: bodyText }
    throw error
  }

  return await response.json() as {
    orders?: AmazonOrder[]
    pagination?: { nextToken?: string | null }
  }
}

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
  const requestStartedAt = Date.now()

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    console.log(`[amazon] Request received: ${req.method}`)

    if (req.method !== 'POST') {
      return new Response(JSON.stringify({ error: 'Method not allowed' }), {
        status: 405,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    if (!supabaseUrl || !serviceRoleKey) {
      throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
    }

    if (amazonClientInitError) {
      throw new Error(amazonClientInitError)
    }

    if (!lwaAuthClient) {
      throw new Error('Amazon LWA auth client not initialized')
    }

    const salesClient = createClient(
      supabaseUrl,
      serviceRoleKey,
      { db: { schema: 'sales' } }
    )

    const lastUpdatedAfter = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
    const lastUpdatedAfterIso = lastUpdatedAfter.toISOString()
    const accessToken = await lwaAuthClient.getAccessToken()
    console.log(`[amazon] Starting searchOrders sync from ${lastUpdatedAfterIso}`)

    const allOrders: AmazonOrder[] = []
    let nextToken: string | null = null
    let pageNumber = 0

    do {
      pageNumber += 1
      console.log(`[amazon] Fetching page ${pageNumber}${nextToken ? ' (with pagination token)' : ''}`)

      let response: { orders?: AmazonOrder[]; pagination?: { nextToken?: string | null } }
      try {
        response = await searchOrdersPage(accessToken, {
          lastUpdatedAfter: lastUpdatedAfterIso,
          paginationToken: nextToken ?? undefined
        })
      } catch (error) {
        const apiError = error as {
          status?: number
          response?: { text?: string; body?: unknown }
          message?: string
        }
        const errorPayload = apiError.response?.text ?? JSON.stringify(apiError.response?.body ?? null)
        console.error(
          `[amazon] searchOrders API failed on page ${pageNumber} with status ${apiError.status ?? 'unknown'}: ${apiError.message ?? 'Unknown error'}`
        )
        if (errorPayload && errorPayload !== 'null') {
          console.error(`[amazon] searchOrders error payload: ${errorPayload}`)
        }
        throw error
      }

      const pageOrders = (response?.orders ?? []) as AmazonOrder[]
      allOrders.push(...pageOrders)
      nextToken = response?.pagination?.nextToken ?? null

      console.log(`[amazon] Page ${pageNumber} fetched: ${pageOrders.length} orders (running total: ${allOrders.length})`)
    } while (nextToken)

    console.log(`[amazon] Pagination complete. Total orders fetched: ${allOrders.length}`)

    const filteredOrders = allOrders.filter(
      (order) => order.salesChannel?.channelName?.toUpperCase() !== 'NON_AMAZON'
    )
    const skippedNonAmazonOrders = allOrders.length - filteredOrders.length
    if (skippedNonAmazonOrders > 0) {
      console.log(`[amazon] Skipped ${skippedNonAmazonOrders} NON_AMAZON orders`)
    }

    if (filteredOrders.length === 0) {
      console.log('[amazon] No orders returned from Amazon')
      return new Response(JSON.stringify({ message: 'No Amazon orders returned' }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const nowIso = new Date().toISOString()

    const ordersToUpsert = filteredOrders.map((order) => ({
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
    console.log(`[amazon] Upserted ${ordersToUpsert.length} rows into sales.amazon_orders`)

    const itemsToUpsert = filteredOrders.flatMap((order) =>
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

    const orderIds = filteredOrders.map((order) => order.orderId)

    if (orderIds.length > 0) {
      console.log(`[amazon] Cleaning existing items for ${orderIds.length} orders before upsert`)
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

      console.log(`[amazon] Upserted ${itemsToUpsert.length} rows into sales.amazon_items`)
    }

    const { error: lastUpdatedError } = await salesClient
      .from('last_updated')
      .upsert({ channel: 'amazon', updated: new Date() }, { onConflict: 'channel' })

    if (lastUpdatedError) {
      throw lastUpdatedError
    }

    const elapsedMs = Date.now() - requestStartedAt
    console.log(`[amazon] Sync complete in ${elapsedMs}ms`)

    return new Response(JSON.stringify({
      orders_processed: ordersToUpsert.length,
      items_processed: itemsToUpsert.length
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  } catch (err) {
    const topLevelError = err as {
      status?: number
      response?: { text?: string; body?: unknown }
      message?: string
    }
    console.error(
      `[amazon] Sync failed${topLevelError.status ? ` (status ${topLevelError.status})` : ''}: ${topLevelError.message ?? String(err)}`
    )
    const topLevelPayload = topLevelError.response?.text ?? JSON.stringify(topLevelError.response?.body ?? null)
    if (topLevelPayload && topLevelPayload !== 'null') {
      console.error(`[amazon] Failure payload: ${topLevelPayload}`)
    }
    return new Response(JSON.stringify({ error: String(err?.message ?? err) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})
