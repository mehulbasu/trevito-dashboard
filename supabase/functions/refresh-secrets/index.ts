/**
 * This function is intended to be run as a scheduled job (e.g. via cron) to refresh expiring API keys.
 * It checks the `private.api_keys` table for any keys that are expiring within the next day
 * and refreshes them by calling the associated Authentication API. The new token and expiry are then 
 * updated back in the database.
 * 
 * The function will respond with a JSON object indicating which services were refreshed or if no refresh was needed.
 * Note: Ensure that the `CRON_SECRET` environment variable is set to a secure, random value and that the same value is used in the request header to prevent unauthorized access.
 */

// TODO!: Schedule this function to run daily using cron
import "@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from 'npm:@supabase/supabase-js@2'

type ApiKeyRow = {
  id: number
  service: string
  key: string
  expiry: string | null
}

const SHIPROCKET_AUTH_URL = 'https://apiv2.shiprocket.in/v1/external/auth/login'
const ONE_DAY_MS = 24 * 60 * 60 * 1000
const TEN_DAYS_MS = 10 * ONE_DAY_MS
const CRON_SECRET_HEADER = 'x-cron-secret'

const fetchShiprocketToken = async (email: string, password: string) => {
  const response = await fetch(SHIPROCKET_AUTH_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password })
  })

  if (!response.ok) {
    throw new Error(`Shiprocket auth failed with ${response.status}`)
  }

  const payload = await response.json() as { token?: string }
  if (!payload.token) {
    throw new Error('Shiprocket auth response missing token')
  }

  return payload.token
}

Deno.serve(async (req) => {
  try {
    if (req.method !== 'POST') {
      return new Response(JSON.stringify({ error: 'Method not allowed' }), {
        status: 405,
        headers: { 'Content-Type': 'application/json' }
      })
    }

    const expectedCronSecret = Deno.env.get('CRON_SECRET')
    const providedCronSecret = req.headers.get(CRON_SECRET_HEADER)
    if (!expectedCronSecret || providedCronSecret !== expectedCronSecret) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      })
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    if (!supabaseUrl || !serviceRoleKey) {
      throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
    }

    const supabase = createClient(
      supabaseUrl,
      serviceRoleKey,
      {
        db: { schema: 'private' },
        global: {
          headers: {
            Authorization: `Bearer ${serviceRoleKey}`,
          },
        },
      },
    )

    const { data: rows, error: fetchError } = await supabase
      .from<ApiKeyRow>('api_keys')
      .select('*')

    if (fetchError) {
      throw fetchError
    }

    const now = Date.now()
    const refreshTargets = rows?.filter((row) => {
      if (row.service !== 'shiprocket') return false
      if (!row.expiry) return true
      const expiry = new Date(row.expiry).getTime()
      return Number.isNaN(expiry) || expiry - now < ONE_DAY_MS
    }) ?? []

    if (refreshTargets.length === 0) {
      return new Response(JSON.stringify({ message: 'No secrets need refreshing' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      })
    }

    const email = Deno.env.get('SHIPROCKET_EMAIL')
    const password = Deno.env.get('SHIPROCKET_PASSWORD')
    if (!email || !password) {
      throw new Error('Missing Shiprocket credentials')
    }

    const token = await fetchShiprocketToken(email, password)
    const newExpiry = new Date(now + TEN_DAYS_MS).toISOString()

    const updatedServices: string[] = []

    for (const row of refreshTargets) {
      const { error: updateError } = await supabase
        .from('api_keys')
        .update({ key: token, expiry: newExpiry })
        .eq('id', row.id)

      if (updateError) {
        throw updateError
      }

      updatedServices.push(row.service)
    }

    return new Response(JSON.stringify({ refreshed: updatedServices }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    })
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err?.message ?? err) }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    })
  }
})
