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

const fetchFilterPage = async (
  token: string,
  params: {
    filterType: DispatchFilterType
    states: string[]
    nextPageUrl?: string | null
  }
) => {
  const endpoint = params.nextPageUrl
    ? new URL(params.nextPageUrl, FLIPKART_API_ORIGIN).toString()
    : new URL(FLIPKART_FILTER_PATH, FLIPKART_API_ORIGIN).toString()

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      Accept: 'application/json'
    },
    body: JSON.stringify({
      filter: {
        type: params.filterType,
        states: params.states
      }
    })
  })

  if (!response.ok) {
    const bodyText = await response.text()
    throw new Error(`Flipkart filter API failed with ${response.status}: ${bodyText}`)
  }

  return await response.json() as FlipkartFilterResponse
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
      throw apiKeyError
    }

    const flipkartToken = apiKeyRow?.key
    if (!flipkartToken) {
      throw new Error('Missing flipkart API key in private.api_keys')
    }

    const shipmentMap = new Map<string, FlipkartShipment>()

    for (const filter of FILTERS) {
      let nextPageUrl: string | null = null
      let hasMore = true

      while (hasMore) {
        const page = await fetchFilterPage(flipkartToken, {
          filterType: filter.type,
          states: filter.states,
          nextPageUrl
        })

        const pageShipments = page.shipments ?? []
        for (const shipment of pageShipments) {
          const shipmentId = shipment.shipmentId
          if (!shipmentId) continue

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

        hasMore = Boolean(page.hasMore)
        nextPageUrl = page.nextPageUrl ?? null
      }
    }

    const shipments = Array.from(shipmentMap.values())

    if (shipments.length === 0) {
      return new Response(JSON.stringify({ message: 'No Flipkart shipments returned' }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

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

    if (orderError) {
      throw orderError
    }

    const shipmentIds = ordersToUpsert.map((row) => row.shipment_id)

    if (shipmentIds.length > 0) {
      const { error: cleanupError } = await salesClient
        .from('flipkart_items')
        .delete()
        .in('shipment_id', shipmentIds)

      if (cleanupError) {
        throw cleanupError
      }
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
        throw itemError
      }
    }

    const { error: lastUpdatedError } = await salesClient
      .from('last_updated')
      .upsert({ channel: 'flipkart', updated: new Date() }, { onConflict: 'channel' })

    if (lastUpdatedError) {
      throw lastUpdatedError
    }

    let geoEnrichTriggered = false
    let geoEnrichError: string | null = null

    try {
      const invokeClient = createClient(supabaseUrl, serviceRoleKey)
      const invokeResult = await invokeClient.functions.invoke('flipkart-geo-enrich', {
        body: { shipmentIds }
      })

      if (invokeResult.error) {
        geoEnrichError = invokeResult.error.message
      } else {
        geoEnrichTriggered = true
      }
    } catch (error) {
      geoEnrichError = String((error as Error)?.message ?? error)
    }

    return new Response(JSON.stringify({
      orders_processed: ordersToUpsert.length,
      items_processed: itemsToUpsert.length,
      geo_enrich_triggered: geoEnrichTriggered,
      geo_enrich_error: geoEnrichError
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  } catch (err) {
    return new Response(JSON.stringify({ error: String((err as Error)?.message ?? err) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})
