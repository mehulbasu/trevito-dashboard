import "@supabase/functions-js/edge-runtime.d.ts"
import { corsHeaders } from 'npm:@supabase/supabase-js@2.95.3/cors'
import { createClient } from 'npm:@supabase/supabase-js@2.95.3'

type ApiKeyRow = {
  key: string
  expiry: string | null
}

type FlipkartDetailsShipment = {
  shipmentId?: string
  orderId?: string
  deliveryAddress?: {
    city?: string | null
    state?: string | null
    pinCode?: string | null
  }
}

type FlipkartDetailsResponse = {
  shipments?: FlipkartDetailsShipment[]
}

type RequestBody = {
  shipmentIds?: string[]
  limit?: number
}

const FLIPKART_API_ORIGIN = 'https://api.flipkart.net'
const FLIPKART_DETAILS_PATH_PREFIX = '/sellers/v3/shipments/'
const DETAILS_BATCH_LIMIT = 25
const DEFAULT_SELECTION_LIMIT = 500

const chunkArray = <T>(items: T[], chunkSize: number) => {
  const chunks: T[][] = []
  for (let index = 0; index < items.length; index += chunkSize) {
    chunks.push(items.slice(index, index + chunkSize))
  }
  return chunks
}

const fetchShipmentDetails = async (token: string, shipmentIds: string[]) => {
  const endpoint = `${new URL(FLIPKART_DETAILS_PATH_PREFIX, FLIPKART_API_ORIGIN).toString()}${shipmentIds.join(',')}`

  const response = await fetch(endpoint, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json'
    }
  })

  if (!response.ok) {
    const bodyText = await response.text()
    throw new Error(`Flipkart details API failed with ${response.status}: ${bodyText}`)
  }

  const payload = await response.json() as FlipkartDetailsResponse
  console.log(
    `[flipkart-geo-enrich] fetch details success | shipmentsReturned=${payload.shipments?.length ?? 0}`
  )

  return payload
}

Deno.serve(async (req) => {
  const startedAt = Date.now()
  const requestId = crypto.randomUUID()

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    console.log(`[flipkart-geo-enrich] request start`)

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

    const body = await req.json().catch(() => ({} as RequestBody)) as RequestBody

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
      console.error(`[flipkart-geo-enrich] api key query failed | id=${requestId} | error=${apiKeyError.message}`)
      throw apiKeyError
    }

    const flipkartToken = apiKeyRow?.key
    if (!flipkartToken) {
      throw new Error('Missing flipkart API key in private.api_keys')
    }

    let shipmentIds: string[] = []

    if (Array.isArray(body.shipmentIds) && body.shipmentIds.length > 0) {
      shipmentIds = Array.from(new Set(body.shipmentIds.filter(Boolean)))
    } else {
      const selectionLimit = Math.min(Math.max(body.limit ?? DEFAULT_SELECTION_LIMIT, 1), 5000)
      const { data: rows, error: selectError } = await salesClient
        .from('flipkart_orders')
        .select('shipment_id')
        .or('customer_city.is.null,customer_state.is.null,customer_pincode.is.null')
        .limit(selectionLimit)

      if (selectError) {
        throw selectError
      }

      shipmentIds = (rows ?? [])
        .map((row) => row.shipment_id as string)
        .filter(Boolean)

    }

    if (shipmentIds.length === 0) {
      console.log(`[flipkart-geo-enrich] no shipments to enrich | id=${requestId}`)
      return new Response(JSON.stringify({ message: 'No shipments need geo enrichment' }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const batches = chunkArray(shipmentIds, DETAILS_BATCH_LIMIT)
    console.log(`[flipkart-geo-enrich] batching | id=${requestId} | batchCount=${batches.length} | batchSize=${DETAILS_BATCH_LIMIT}`)

    const updates: Array<{
      shipment_id: string
      order_id: string
      customer_city: string | null
      customer_state: string | null
      customer_pincode: string | null
      last_accessed_at: string
    }> = []

    for (let index = 0; index < batches.length; index += 1) {
      const batch = batches[index]
      console.log(`[flipkart-geo-enrich] processing batch | id=${requestId} | batch=${index + 1}/${batches.length} | shipmentCount=${batch.length}`)
      const details = await fetchShipmentDetails(flipkartToken, batch)

      for (const shipment of details.shipments ?? []) {
        const shipmentId = shipment.shipmentId
        const orderId = shipment.orderId
        if (!shipmentId || !orderId) continue

        updates.push({
          shipment_id: shipmentId,
          order_id: orderId,
          customer_city: shipment.deliveryAddress?.city ?? null,
          customer_state: shipment.deliveryAddress?.state ?? null,
          customer_pincode: shipment.deliveryAddress?.pinCode ?? null,
          last_accessed_at: new Date().toISOString()
        })
      }
    }

    if (updates.length > 0) {
      const { error: upsertError } = await salesClient
        .from('flipkart_orders')
        .upsert(updates, { onConflict: 'shipment_id' })

      if (upsertError) {
        console.error(`[flipkart-geo-enrich] upsert failed | id=${requestId} | error=${upsertError.message}`)
        throw upsertError
      }

      console.log(`[flipkart-geo-enrich] upsert success | id=${requestId} | rows=${updates.length}`)
    }

    console.log(`[flipkart-geo-enrich] request complete | id=${requestId} | elapsedMs=${Date.now() - startedAt}`)

    return new Response(JSON.stringify({
      shipment_ids_processed: shipmentIds.length,
      rows_updated: updates.length
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  } catch (err) {
    console.error(
      `[flipkart-geo-enrich] request failed | id=${requestId} | elapsedMs=${Date.now() - startedAt} | error=${String((err as Error)?.message ?? err)}`
    )
    const stack = (err as Error)?.stack
    if (stack) {
      console.error(`[flipkart-geo-enrich] stack | id=${requestId} | ${stack}`)
    }

    return new Response(JSON.stringify({ error: String((err as Error)?.message ?? err) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})
