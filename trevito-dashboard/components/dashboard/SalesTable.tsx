import React from 'react';
import { Box, Table, Text } from '@mantine/core';
import dayjs from 'dayjs';
import {
  CHANNEL_LABEL,
  getProductName,
  type GroupBy,
} from '@/lib/constants';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export type SummaryRow = {
  channel: string;
  sku: string;
  month_start: string;          // ISO date string e.g. "2026-02-01"
  total_revenue: number;
  total_quantity: number;
};

type Props = {
  data: SummaryRow[];
  groupBy: GroupBy;
  dateFrom: string; // YYYY-MM-DD
  dateTo: string;   // YYYY-MM-DD
};

/* ------------------------------------------------------------------ */
/*  Month / period helpers                                             */
/* ------------------------------------------------------------------ */

type Period = { key: string; label: string };

function buildPeriods(dateFrom: string, dateTo: string): Period[] {
  const from = dayjs(dateFrom);
  const to = dayjs(dateTo);

  const periods: Period[] = [];
  let cursor = from.startOf('month');

  while (cursor.isBefore(to) || cursor.isSame(to, 'month')) {
    const monthStart = cursor.startOf('month');
    const monthEnd = cursor.endOf('month');

    const periodStart = from.isAfter(monthStart) ? from : monthStart;
    const periodEnd = to.isBefore(monthEnd) ? to : monthEnd;

    const isFullMonth =
      periodStart.isSame(monthStart, 'day') &&
      periodEnd.isSame(monthEnd, 'day');

    let label: string;
    if (isFullMonth) {
      label = monthStart.format('MMMM');
    } else if (periodStart.isSame(monthStart, 'day')) {
      // Starts at month start but ends early
      label = `${periodStart.format('MMM D')} – ${periodEnd.format('MMM D')}`;
    } else if (periodEnd.isSame(monthEnd, 'day')) {
      // Starts late but goes to month end
      label = `${periodStart.format('MMM D')} – ${periodEnd.format('MMM D')}`;
    } else {
      label = `${periodStart.format('MMM D')} – ${periodEnd.format('MMM D')}`;
    }

    periods.push({ key: monthStart.format('YYYY-MM-DD'), label });
    cursor = cursor.add(1, 'month');
  }

  return periods;
}

/* ------------------------------------------------------------------ */
/*  Formatting                                                         */
/* ------------------------------------------------------------------ */

const inrFmt = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  maximumFractionDigits: 0,
});

function fmtRevenue(v: number) {
  return inrFmt.format(v);
}

/* ------------------------------------------------------------------ */
/*  Aggregation logic                                                  */
/* ------------------------------------------------------------------ */

type AggKey = string; // composite key for grouping

/** monthly bucket key from a month_start ISO string */
function monthKey(ms: string) {
  return dayjs(ms).startOf('month').format('YYYY-MM-DD');
}

type AggRow = {
  label: string;        // display label for the row (product name or channel)
  subLabel?: string;    // secondary label (channel name in product-channel mode)
  sortKey: string;      // for deterministic ordering
  monthly: Record<string, { revenue: number; qty: number }>;
  totalRevenue: number;
  totalQty: number;
};

function aggregate(data: SummaryRow[], groupBy: GroupBy): AggRow[] {
  const map = new Map<AggKey, AggRow>();

  for (const row of data) {
    let key: string;
    let label: string;
    let subLabel: string | undefined;
    let sortKey: string;

    if (groupBy === 'product-channel') {
      key = `${row.sku}|${row.channel}`;
      label = `${getProductName(row.sku)} (${row.sku})`;
      subLabel = CHANNEL_LABEL[row.channel] ?? row.channel;
      sortKey = `${row.sku}|${row.channel}`;
    } else if (groupBy === 'product') {
      key = row.sku;
      label = `${getProductName(row.sku)} (${row.sku})`;
      sortKey = row.sku;
    } else {
      // channel
      key = row.channel;
      label = CHANNEL_LABEL[row.channel] ?? row.channel;
      sortKey = row.channel;
    }

    let agg = map.get(key);
    if (!agg) {
      agg = { label, subLabel, sortKey, monthly: {}, totalRevenue: 0, totalQty: 0 };
      map.set(key, agg);
    }

    const mk = monthKey(row.month_start);
    if (!agg.monthly[mk]) agg.monthly[mk] = { revenue: 0, qty: 0 };
    agg.monthly[mk].revenue += Number(row.total_revenue);
    agg.monthly[mk].qty += Number(row.total_quantity);
    agg.totalRevenue += Number(row.total_revenue);
    agg.totalQty += Number(row.total_quantity);
  }

  return Array.from(map.values()).sort((a, b) => a.sortKey.localeCompare(b.sortKey));
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function SalesTable({ data, groupBy, dateFrom, dateTo }: Props) {
  const periods = buildPeriods(dateFrom, dateTo);
  const showMonthly = periods.length > 1;
  const rows = aggregate(data, groupBy);

  const grandRevenue = rows.reduce((s, r) => s + r.totalRevenue, 0);
  const grandQty = rows.reduce((s, r) => s + r.totalQty, 0);
  const grandMonthly: Record<string, { revenue: number; qty: number }> = {};
  if (showMonthly) {
    for (const p of periods) {
      grandMonthly[p.key] = { revenue: 0, qty: 0 };
    }
    for (const r of rows) {
      for (const p of periods) {
        const m = r.monthly[p.key];
        if (m) {
          grandMonthly[p.key].revenue += m.revenue;
          grandMonthly[p.key].qty += m.qty;
        }
      }
    }
  }

  if (rows.length === 0) {
    return (
      <Text c="dimmed" ta="center" py="xl">
        No sales data found for the selected filters.
      </Text>
    );
  }

  // Detect product group boundaries for visual grouping in product-channel mode
  const productGroupStarts = new Set<number>();
  if (groupBy === 'product-channel') {
    let lastSku = '';
    rows.forEach((r, i) => {
      const sku = r.sortKey.split('|')[0];
      if (sku !== lastSku) {
        productGroupStarts.add(i);
        lastSku = sku;
      }
    });
  }

  return (
    <Box style={{ overflowX: 'auto' }}>
      <Table striped highlightOnHover withTableBorder withColumnBorders>
        <thead>
          {/* Top header row: month group labels spanning Revenue + Qty */}
          {showMonthly && (
            <tr>
              {groupBy === 'product-channel' ? (
                <>
                  <th />
                  <th />
                </>
              ) : (
                <th />
              )}
              {periods.map((p) => (
                <th key={p.key} colSpan={2} style={{ textAlign: 'center', fontWeight: 600 }}>
                  {p.label}
                </th>
              ))}
              <th colSpan={2} style={{ textAlign: 'center', fontWeight: 700 }}>
                Total
              </th>
            </tr>
          )}
          {/* Column header row */}
          <tr>
            {groupBy === 'product-channel' ? (
              <>
                <th>Product</th>
                <th>Channel</th>
              </>
            ) : groupBy === 'product' ? (
              <th>Product</th>
            ) : (
              <th>Channel</th>
            )}
            {showMonthly &&
              periods.map((p) => (
                <React.Fragment key={p.key}>
                  <th style={{ textAlign: 'right' }}>Revenue</th>
                  <th style={{ textAlign: 'right' }}>Qty</th>
                </React.Fragment>
              ))}
            <th style={{ textAlign: 'right' }}>Revenue</th>
            <th style={{ textAlign: 'right' }}>Qty</th>
          </tr>
        </thead>

        <tbody>
          {rows.map((row, i) => (
            <tr
              key={row.sortKey}
              style={
                productGroupStarts.has(i) && i !== 0
                  ? { borderTop: '2px solid var(--mantine-color-dark-4)' }
                  : undefined
              }
            >
              {groupBy === 'product-channel' ? (
                <>
                  <td style={{ fontWeight: productGroupStarts.has(i) ? 600 : 400 }}>
                    {productGroupStarts.has(i) ? row.label : ''}
                  </td>
                  <td>{row.subLabel}</td>
                </>
              ) : (
                <td style={{ fontWeight: 500 }}>{row.label}</td>
              )}
              {showMonthly &&
                periods.map((p) => {
                  const m = row.monthly[p.key];
                  return (
                    <React.Fragment key={p.key}>
                      <td style={{ textAlign: 'right' }}>{m ? fmtRevenue(m.revenue) : '–'}</td>
                      <td style={{ textAlign: 'right' }}>{m ? m.qty : '–'}</td>
                    </React.Fragment>
                  );
                })}
              <td style={{ textAlign: 'right', fontWeight: 600 }}>
                {fmtRevenue(row.totalRevenue)}
              </td>
              <td style={{ textAlign: 'right', fontWeight: 600 }}>{row.totalQty}</td>
            </tr>
          ))}
        </tbody>

        <tfoot>
          <tr style={{ borderTop: '2px solid var(--mantine-color-dark-4)' }}>
            {groupBy === 'product-channel' ? (
              <>
                <td style={{ fontWeight: 700 }}>Total</td>
                <td />
              </>
            ) : (
              <td style={{ fontWeight: 700 }}>Total</td>
            )}
            {showMonthly &&
              periods.map((p) => {
                const gm = grandMonthly[p.key];
                return (
                  <React.Fragment key={p.key}>
                    <td style={{ textAlign: 'right', fontWeight: 700 }}>
                      {gm ? fmtRevenue(gm.revenue) : '–'}
                    </td>
                    <td style={{ textAlign: 'right', fontWeight: 700 }}>
                      {gm ? gm.qty : '–'}
                    </td>
                  </React.Fragment>
                );
              })}
            <td style={{ textAlign: 'right', fontWeight: 700 }}>{fmtRevenue(grandRevenue)}</td>
            <td style={{ textAlign: 'right', fontWeight: 700 }}>{grandQty}</td>
          </tr>
        </tfoot>
      </Table>
    </Box>
  );
}

