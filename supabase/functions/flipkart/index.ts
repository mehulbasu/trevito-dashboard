import "@supabase/functions-js/edge-runtime.d.ts"
import { corsHeaders } from 'npm:@supabase/supabase-js@2.95.3/cors'
import { createClient } from 'npm:@supabase/supabase-js@2.95.3'

type ApiKeyRow = {
  key: string
  expiry: string | null
}

type FlipkartPriceComponents = {
  totalPrice?: number | string | null
}

type FlipkartOrderItem = {
  orderItemId?: string
  orderId?: string
  orderDate?: string
  paymentType?: string
  status?: string
  quantity?: number
  sku?: string
  priceComponents?: FlipkartPriceComponents
}

type FlipkartShipment = {
  shipmentId?: string
  updatedAt?: string
  orderItems?: FlipkartOrderItem[]
}

type FlipkartFilterResponse = {
  hasMore?: boolean
  nextPageUrl?: string | null
  shipments?: FlipkartShipment[]
}

type DispatchFilterType = 'postDispatch' | 'preDispatch'

const FLIPKART_API_ORIGIN = 'https://api.flipkart.net'
const FLIPKART_FILTER_PATH = '/sellers/v3/shipments/filter'
const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000

const FILTERS: Array<{ type: DispatchFilterType; states: string[] }> = [
  { type: 'postDispatch', states: ['SHIPPED', 'DELIVERED'] },
  { type: 'preDispatch', states: ['APPROVED', 'PACKING_IN_PROGRESS', 'PACKED', 'FORM_FAILED', 'READY_TO_DISPATCH'] }
]

const parseNumber = (value: string | number | undefined | null) => {
  if (value == null || value === '') return null
  const parsed = Number(value)
  return Number.isNaN(parsed) ? null : Number(parsed.toFixed(2))
}

const parseDate = (value: string | undefined) => {
  if (!value) return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date.toISOString()
}

const createFilterBody = (filterType: DispatchFilterType, states: string[]) => ({
  filter: {
    type: filterType,
    states,
    orderDate: {
      from: new Date(Date.now() - THIRTY_DAYS_MS).toISOString(),
      to: new Date().toISOString()
    }
  }
})

const getNextTokenFromUrl = (nextPageUrl: string) => {
  const parsed = new URL(nextPageUrl, FLIPKART_API_ORIGIN)
  return parsed.searchParams.get('next_token')
}

const fetchInitialPage = async (
  token: string,
  params: {
    filterType: DispatchFilterType
    states: string[]
  }
) => {
  const endpoint = new URL(FLIPKART_FILTER_PATH, FLIPKART_API_ORIGIN).toString()
  const requestBody = createFilterBody(params.filterType, params.states)

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      Accept: 'application/json'
    },
    body: JSON.stringify(requestBody)
  })

  if (!response.ok) {
    const bodyText = await response.text()
    console.error(
      `[flipkart] initial fetch failed | status=${response.status} ${response.statusText} | endpoint=${endpoint} | body=${bodyText.slice(0, 1500)}`
    )
    throw new Error(`Flipkart filter API failed with ${response.status}: ${bodyText}`)
  }

  const payload = await response.json() as FlipkartFilterResponse
  console.log(
    `[flipkart] initial fetch success | shipments=${payload.shipments?.length ?? 0} | hasMore=${Boolean(payload.hasMore)}`
  )

  return payload
}

const fetchNextPage = async (token: string, nextPageUrl: string) => {
  const nextToken = getNextTokenFromUrl(nextPageUrl)
  if (!nextToken) {
    throw new Error(`Missing next_token in nextPageUrl: ${nextPageUrl}`)
  }

  const endpoint = new URL(FLIPKART_FILTER_PATH, FLIPKART_API_ORIGIN)
  endpoint.searchParams.set('next_token', nextToken)

  const response = await fetch(endpoint, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json'
    }
  })

  if (!response.ok) {
    const bodyText = await response.text()
    console.error(
      `[flipkart] next fetch failed | status=${response.status} ${response.statusText} | endpoint=${endpoint.toString()} | body=${bodyText.slice(0, 1500)}`
    )
    throw new Error(`Flipkart next page failed with ${response.status}: ${bodyText}`)
  }

  const payload = await response.json() as FlipkartFilterResponse
  console.log(
    `[flipkart] next fetch success | shipments=${payload.shipments?.length ?? 0} | hasMore=${Boolean(payload.hasMore)}`
  )

  return payload
}

const collectShipmentsForFilter = async (
  token: string,
  filter: { type: DispatchFilterType; states: string[] },
  requestId: string
) => {
  const shipments = new Map<string, FlipkartShipment>()
  const seenTokens = new Set<string>()

  let pageNumber = 1
  let page = await fetchInitialPage(token, {
    filterType: filter.type,
    states: filter.states
  })

  while (true) {
    const pageShipments = page.shipments ?? []

    for (const shipment of pageShipments) {
      const shipmentId = shipment.shipmentId
      if (!shipmentId) continue

      const existing = shipments.get(shipmentId)
      if (!existing) {
        shipments.set(shipmentId, shipment)
        continue
      }

      const existingUpdated = parseDate(existing.updatedAt) ?? ''
      const incomingUpdated = parseDate(shipment.updatedAt) ?? ''
      if (incomingUpdated >= existingUpdated) {
        shipments.set(shipmentId, shipment)
      }
    }

    if (!page.hasMore || !page.nextPageUrl) {
      break
    }

    const nextToken = getNextTokenFromUrl(page.nextPageUrl)
    if (!nextToken) {
      throw new Error(`Pagination requested but next_token missing: ${page.nextPageUrl}`)
    }
    if (seenTokens.has(nextToken)) {
      throw new Error(`Pagination loop detected for filter ${filter.type}; next_token repeated.`)
    }

    seenTokens.add(nextToken)
    pageNumber += 1
    page = await fetchNextPage(token, page.nextPageUrl)
  }

  return shipments
}

Deno.serve(async (req) => {
  const startedAt = Date.now()
  const requestId = crypto.randomUUID()

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
      .eq('service', 'flipkart')
      .order('id', { ascending: false })
      .limit(1)
      .maybeSingle<ApiKeyRow>()

    if (apiKeyError) {
      console.error(`[flipkart] api key query failed | id=${requestId} | error=${apiKeyError.message}`)
      throw apiKeyError
    }

    const flipkartToken = apiKeyRow?.key
    if (!flipkartToken) {
      throw new Error('Missing flipkart API key in private.api_keys')
    }

    const shipmentMap = new Map<string, FlipkartShipment>()

    for (const filter of FILTERS) {
      const filterShipments = await collectShipmentsForFilter(flipkartToken, filter, requestId)
      for (const [shipmentId, shipment] of filterShipments.entries()) {
        const existing = shipmentMap.get(shipmentId)
        if (!existing) {
          shipmentMap.set(shipmentId, shipment)
          continue
        }

        const existingUpdated = parseDate(existing.updatedAt) ?? ''
        const incomingUpdated = parseDate(shipment.updatedAt) ?? ''
        if (incomingUpdated >= existingUpdated) {
          shipmentMap.set(shipmentId, shipment)
        }
      }
    }

    const shipments = Array.from(shipmentMap.values())

    if (shipments.length === 0) {
      return new Response(JSON.stringify({ message: 'No Flipkart shipments returned' }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    console.log(`[flipkart] fetched unique shipments | count=${shipments.length}`)

    const nowIso = new Date().toISOString()

    const ordersToUpsert = shipments
      .map((shipment) => {
        const shipmentId = shipment.shipmentId
        const firstItem = shipment.orderItems?.[0]
        if (!shipmentId || !firstItem?.orderId) return null

        return {
          shipment_id: shipmentId,
          order_id: firstItem.orderId,
          payment_type: firstItem.paymentType ?? null,
          last_accessed_at: nowIso
        }
      })
      .filter((row): row is { shipment_id: string; order_id: string; payment_type: string | null; last_accessed_at: string } => Boolean(row))

    const { error: orderError } = await salesClient
      .from('flipkart_orders')
      .upsert(ordersToUpsert, { onConflict: 'shipment_id' })

    console.log(`[flipkart] order upsert attempted | id=${requestId} | rows=${ordersToUpsert.length}`)

    if (orderError) {
      console.error(`[flipkart] order upsert failed | id=${requestId} | error=${orderError.message}`)
      throw orderError
    }

    const shipmentIds = ordersToUpsert.map((row) => row.shipment_id)

    if (shipmentIds.length > 0) {
      const { error: cleanupError } = await salesClient
        .from('flipkart_items')
        .delete()
        .in('shipment_id', shipmentIds)

      if (cleanupError) {
        console.error(`[flipkart] items cleanup failed | id=${requestId} | error=${cleanupError.message}`)
        throw cleanupError
      }

      console.log(`[flipkart] items cleanup complete | id=${requestId} | shipmentCount=${shipmentIds.length}`)
    }

    const itemsToUpsert = shipments.flatMap((shipment) =>
      (shipment.orderItems ?? [])
        .filter((item) => shipment.shipmentId && item.orderItemId)
        .map((item) => ({
          shipment_id: shipment.shipmentId as string,
          order_item_id: item.orderItemId as string,
          order_date: parseDate(item.orderDate),
          status: item.status ?? null,
          quantity: item.quantity ?? null,
          sku: item.sku ?? null,
          total_price: parseNumber(item.priceComponents?.totalPrice)
        }))
    )

    if (itemsToUpsert.length > 0) {
      const { error: itemError } = await salesClient
        .from('flipkart_items')
        .upsert(itemsToUpsert, { onConflict: 'shipment_id,order_item_id' })

      if (itemError) {
        console.error(`[flipkart] item upsert failed | id=${requestId} | error=${itemError.message}`)
        throw itemError
      }
    }

    console.log(`[flipkart] item upsert complete | id=${requestId} | rows=${itemsToUpsert.length}`)

    const { error: lastUpdatedError } = await salesClient
      .from('last_updated')
      .upsert({ channel: 'flipkart', updated: new Date() }, { onConflict: 'channel' })

    if (lastUpdatedError) {
      console.error(`[flipkart] last_updated upsert failed | id=${requestId} | error=${lastUpdatedError.message}`)
      throw lastUpdatedError
    }

    console.log(`[flipkart] sync complete | id=${requestId} | elapsedMs=${Date.now() - startedAt}`)

    return new Response(JSON.stringify({
      orders_processed: ordersToUpsert.length,
      items_processed: itemsToUpsert.length
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  } catch (err) {
    console.error(
      `[flipkart] sync failed | id=${requestId} | elapsedMs=${Date.now() - startedAt} | error=${String((err as Error)?.message ?? err)}`
    )
    const stack = (err as Error)?.stack
    if (stack) {
      console.error(`[flipkart] stack | id=${requestId} | ${stack}`)
    }

    return new Response(JSON.stringify({ error: String((err as Error)?.message ?? err) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})
