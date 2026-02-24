import "@supabase/functions-js/edge-runtime.d.ts"
import { corsHeaders } from 'npm:@supabase/supabase-js@2.95.3/cors'
import { createClient } from 'npm:@supabase/supabase-js@2.95.3'
import * as XLSX from 'npm:xlsx@0.18.5'

type VyaparRequest = {
  file_name?: string
  mime_type?: string
  file_base64?: string
}

type SaleReportRow = {
  Date?: string | number | Date
  'Party Name'?: string
  'Phone No.'?: string | number
  'Invoice No.'?: string | number
  'Total Amount'?: string | number
  'Transaction Type'?: string
}

type SaleItemsRow = {
  'Invoice No.'?: string | number
  'Item code'?: string
  Quantity?: string | number
  Amount?: string | number
  GST?: string | number
}

const parseNumber = (value: string | number | undefined | null) => {
  if (value == null || value === '') return null
  const parsed = Number(String(value).replace(/[^0-9.-]/g, ''))
  return Number.isNaN(parsed) ? null : parsed
}

const parseInteger = (value: string | number | undefined | null) => {
  const parsed = parseNumber(value)
  if (parsed == null) return null
  return Math.round(parsed)
}

const parseLeadingNumber = (value: string | number | undefined | null) => {
  if (value == null || value === '') return null
  if (typeof value === 'number') return Number.isNaN(value) ? null : value

  const match = String(value).trim().match(/^-?\d+(?:\.\d+)?/)
  if (!match) return null

  const parsed = Number(match[0])
  return Number.isNaN(parsed) ? null : parsed
}

const parseDateFromVyapar = (value: string | number | Date | undefined) => {
  if (value == null || value === '') return null

  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10)
  }

  if (typeof value === 'number') {
    const parsed = XLSX.SSF.parse_date_code(value)
    if (parsed) {
      const year = String(parsed.y).padStart(4, '0')
      const month = String(parsed.m).padStart(2, '0')
      const day = String(parsed.d).padStart(2, '0')
      return `${year}-${month}-${day}`
    }
  }

  const stringValue = String(value).trim()
  const dmyMatch = stringValue.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  if (dmyMatch) {
    const day = dmyMatch[1].padStart(2, '0')
    const month = dmyMatch[2].padStart(2, '0')
    const year = dmyMatch[3]
    return `${year}-${month}-${day}`
  }

  const parsed = new Date(stringValue)
  if (Number.isNaN(parsed.getTime())) return null
  return parsed.toISOString().slice(0, 10)
}

const decodeBase64ToBytes = (base64: string) => {
  const sanitized = base64.includes(',') ? base64.split(',')[1] : base64
  const binary = atob(sanitized)
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index)
  }
  return bytes
}

const upsertVyaparLastUpdated = async (salesClient: ReturnType<typeof createClient>) => {
  const { error: lastUpdatedError } = await salesClient
    .from('last_updated')
    .upsert({ channel: 'vyapar', updated: new Date() }, { onConflict: 'channel' })

  if (lastUpdatedError) {
    throw lastUpdatedError
  }
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

    const payload = await req.json() as VyaparRequest
    const fileBase64 = payload.file_base64
    if (!fileBase64) {
      return new Response(JSON.stringify({ error: 'Missing file_base64 in request body' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const bytes = decodeBase64ToBytes(fileBase64)
    const workbook = XLSX.read(bytes, { type: 'array', cellDates: true })

    const saleReportSheet = workbook.Sheets['Sale Report']
    const saleItemsSheet = workbook.Sheets['Sale Items']

    if (!saleReportSheet || !saleItemsSheet) {
      throw new Error('Expected sheets "Sale Report" and "Sale Items" were not found in the file')
    }

    const saleReportRows = XLSX.utils.sheet_to_json<SaleReportRow>(saleReportSheet, {
      range: 2,
      defval: null,
      raw: false
    })
    const saleItemsRows = XLSX.utils.sheet_to_json<SaleItemsRow>(saleItemsSheet, {
      defval: null,
      raw: false
    })

    console.log('Found ' + saleReportRows.length + ' rows in "Sale Report" sheet and ' + saleItemsRows.length + ' rows in "Sale Items" sheet')

    const salesRows = saleReportRows
      .filter((row) => String(row['Transaction Type'] ?? '').toLowerCase() === 'sale')
      .map((row) => {
        const invoiceNo = parseInteger(row['Invoice No.'])
        const saleDate = parseDateFromVyapar(row.Date)

        if (!invoiceNo || !saleDate) return null

        return {
          invoice_no: invoiceNo,
          sale_date: saleDate,
          customer_name: row['Party Name']?.trim() || null,
          customer_phone: row['Phone No.'] != null ? String(row['Phone No.']).trim() : null
        }
      })
      .filter((row): row is NonNullable<typeof row> => row != null)

    if (salesRows.length === 0) {
      await upsertVyaparLastUpdated(salesClient)

      return new Response(JSON.stringify({
        message: 'No sale records found in "Sale Report"',
        sales_processed: 0,
        items_processed: 0
      }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const { error: salesError } = await salesClient
      .from('vyapar_sales')
      .upsert(salesRows, { onConflict: 'invoice_no' })

    if (salesError) {
      throw salesError
    }

    console.log(`Parsed and upserted ${salesRows.length} sales rows into database`)

    const validInvoices = new Set(salesRows.map((row) => row.invoice_no))
    const itemAggregate = new Map<string, { invoice_no: number; sku: string; quantity: number; net_price: number }>()

    for (const row of saleItemsRows) {
      const invoiceNo = parseInteger(row['Invoice No.'])
      const sku = row['Item code']?.trim()
      const quantity = parseInteger(row.Quantity)
      const amount = parseNumber(row.Amount)
      const gst = parseLeadingNumber(row.GST)

      if (!invoiceNo || !sku || quantity == null || amount == null || gst == null) continue
      if (!validInvoices.has(invoiceNo)) continue

      const netPrice = amount - gst

      const key = `${invoiceNo}::${sku}`
      const existing = itemAggregate.get(key)
      
      if (existing) {
        existing.quantity += quantity
        existing.net_price += netPrice
      } else {
        itemAggregate.set(key, {
          invoice_no: invoiceNo,
          sku,
          quantity,
          net_price: netPrice
        })
      }
    }

    const itemsRows = Array.from(itemAggregate.values()).map((item) => ({
      invoice_no: item.invoice_no,
      sku: item.sku,
      quantity: item.quantity,
      net_price: Number(item.net_price.toFixed(2))
    }))

    if (itemsRows.length > 0) {
      const { error: itemError } = await salesClient
        .from('vyapar_items')
        .upsert(itemsRows, { onConflict: 'invoice_no,sku' })

      if (itemError) {
        throw itemError
      }
    }

    console.log(`Parsed and upserted ${itemsRows.length} item rows from "Sale Items" sheet`)

    await upsertVyaparLastUpdated(salesClient)

    return new Response(JSON.stringify({
      message: 'Vyapar file processed successfully',
      file_name: payload.file_name ?? null,
      sales_processed: salesRows.length,
      items_processed: itemsRows.length
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
