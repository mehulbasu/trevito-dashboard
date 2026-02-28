import "@supabase/functions-js/edge-runtime.d.ts"
import { corsHeaders } from 'npm:@supabase/supabase-js@2.95.3/cors'
import { createClient } from 'npm:@supabase/supabase-js@2.95.3'
// TODO: This function is untested
// TODO: Adjust cancellationDate window and schedule as a cron job

type ApiKeyRow = {
  key: string
  expiry: string | null
}

type FlipkartShipment = {
  shipmentId?: string
}

type FlipkartFilterResponse = {
  hasMore?: boolean
  nextPageUrl?: string | null
  shipments?: FlipkartShipment[]
}

const FLIPKART_API_ORIGIN = 'https://api.flipkart.net'
const FLIPKART_FILTER_PATH = '/sellers/v3/shipments/filter/'
const FOURTEEN_DAYS_MS = 14 * 24 * 60 * 60 * 1000

const createCancelledFilterBody = () => ({
  filter: {
    type: 'cancelled',
    states: ['Cancelled'],
    cancellationDate: {
      from: new Date(Date.now() - FOURTEEN_DAYS_MS).toISOString(),
      to: new Date().toISOString()
    }
  }
})

const getNextTokenFromUrl = (nextPageUrl: string) => {
  const parsed = new URL(nextPageUrl, FLIPKART_API_ORIGIN)
  return parsed.searchParams.get('next_token')
}

const fetchInitialCancelledPage = async (token: string) => {
  const endpoint = new URL(FLIPKART_FILTER_PATH, FLIPKART_API_ORIGIN).toString()
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      Accept: 'application/json'
    },
    body: JSON.stringify(createCancelledFilterBody())
  })

  if (!response.ok) {
    const bodyText = await response.text()
    throw new Error(`Flipkart cancelled filter failed with ${response.status}: ${bodyText}`)
  }

  return await response.json() as FlipkartFilterResponse
}

const fetchNextCancelledPage = async (token: string, nextPageUrl: string) => {
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
    throw new Error(`Flipkart cancelled next page failed with ${response.status}: ${bodyText}`)
  }

  return await response.json() as FlipkartFilterResponse
}

const collectCancelledShipmentIds = async (token: string) => {
  const shipmentIds = new Set<string>()
  const seenTokens = new Set<string>()

  let page = await fetchInitialCancelledPage(token)

  while (true) {
    for (const shipment of page.shipments ?? []) {
      if (shipment.shipmentId) {
        shipmentIds.add(shipment.shipmentId)
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
      throw new Error('Pagination loop detected while fetching cancelled shipments; next_token repeated.')
    }

    seenTokens.add(nextToken)
    page = await fetchNextCancelledPage(token, page.nextPageUrl)
  }

  return Array.from(shipmentIds)
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

    const cancelledShipmentIds = await collectCancelledShipmentIds(flipkartToken)

    if (cancelledShipmentIds.length === 0) {
      return new Response(JSON.stringify({
        message: 'No cancelled shipments found',
        cancelled_shipments_found: 0,
        deleted_orders: 0,
        deleted_items: 0
      }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const { data: itemsToDelete, error: itemsCountError } = await salesClient
      .from('flipkart_items')
      .select('id')
      .in('shipment_id', cancelledShipmentIds)

    if (itemsCountError) {
      throw itemsCountError
    }

    const itemsCount = itemsToDelete?.length ?? 0

    const { error: deleteItemsError } = await salesClient
      .from('flipkart_items')
      .delete()
      .in('shipment_id', cancelledShipmentIds)

    if (deleteItemsError) {
      throw deleteItemsError
    }

    const { data: ordersToDelete, error: ordersCountError } = await salesClient
      .from('flipkart_orders')
      .select('shipment_id')
      .in('shipment_id', cancelledShipmentIds)

    if (ordersCountError) {
      throw ordersCountError
    }

    const ordersCount = ordersToDelete?.length ?? 0

    const { error: deleteOrdersError } = await salesClient
      .from('flipkart_orders')
      .delete()
      .in('shipment_id', cancelledShipmentIds)

    if (deleteOrdersError) {
      throw deleteOrdersError
    }

    return new Response(JSON.stringify({
      cancelled_shipments_found: cancelledShipmentIds.length,
      deleted_orders: ordersCount,
      deleted_items: itemsCount
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
