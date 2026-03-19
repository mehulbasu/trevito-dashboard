import dayjs from 'dayjs';
import * as XLSX from 'xlsx';
import { CHANNEL_LABEL, getProductName, PRODUCT_ORDER, type GroupBy } from '@/lib/constants';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export type SummaryRow = {
  channel: string;
  sku: string;
  month_start: string;
  total_revenue: number;
  total_quantity: number;
};

export type Period = { key: string; label: string };

export type AggRow = {
  label: string;
  subLabel?: string;
  sortKey: string;
  monthly: Record<string, { revenue: number; qty: number }>;
  totalRevenue: number;
  totalQty: number;
};

/* ------------------------------------------------------------------ */
/*  Period helpers                                                     */
/* ------------------------------------------------------------------ */

/**
 * Given a date range, build a list of monthly periods with labels. For example:
 * 2024-01-15 to 2024-03-10 would produce:
 * [
 *  { key: '2024-01-01', label: 'Jan 15 – Jan 31' },
 *  { key: '2024-02-01', label: 'February' },
 *  { key: '2024-03-01', label: 'Mar 1 – Mar 10' },
 * ]
 * The key is the month start date and is used for grouping, while the label is for display.
 * If a period covers the full month, we show just the month name. Otherwise, we show the date range.
 */
export function buildPeriods(dateFrom: string, dateTo: string): Period[] {
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
      periodStart.isSame(monthStart, 'day') && periodEnd.isSame(monthEnd, 'day');

    const label = isFullMonth
      ? monthStart.format('MMMM')
      : `${periodStart.format('MMM D')} – ${periodEnd.format('MMM D')}`;

    periods.push({ key: monthStart.format('YYYY-MM-DD'), label });
    cursor = cursor.add(1, 'month');
  }

  return periods;
}

/* ------------------------------------------------------------------ */
/*  Aggregation                                                        */
/* ------------------------------------------------------------------ */

export function skuSortKey(sku: string): string {
  const idx = PRODUCT_ORDER.indexOf(sku);
  return idx === -1 ? `999_${sku}` : idx.toString().padStart(3, '0');
}

/**
 * Aggregate raw summary rows into display rows based on the selected grouping.
 * For example, if groupBy is 'product-channel', we group by unique (sku, channel) pairs.
 * If groupBy is 'product', we group by sku only, summing across channels.
 * The resulting rows are enriched with display labels and a sort key for consistent ordering.
 */
export function aggregate(data: SummaryRow[], groupBy: GroupBy): AggRow[] {
  const map = new Map<string, AggRow>();

  for (const row of data) {
    let key: string;
    let label: string;
    let subLabel: string | undefined;
    let sortKey: string;

    if (groupBy === 'product-channel') {
      key = `${row.sku}|${row.channel}`;
      label = getProductName(row.sku);
      subLabel = CHANNEL_LABEL[row.channel] ?? row.channel;
      sortKey = `${skuSortKey(row.sku)}|${row.channel}`;
    } else if (groupBy === 'product') {
      key = row.sku;
      label = getProductName(row.sku);
      sortKey = skuSortKey(row.sku);
    } else {
      key = row.channel;
      label = CHANNEL_LABEL[row.channel] ?? row.channel;
      sortKey = row.channel;
    }

    let agg = map.get(key);
    if (!agg) {
      agg = { label, subLabel, sortKey, monthly: {}, totalRevenue: 0, totalQty: 0 };
      map.set(key, agg);
    }

    // Aggregate monthly and total revenue/quantity
    const mk = dayjs(row.month_start).startOf('month').format('YYYY-MM-DD');
    if (!agg.monthly[mk]) agg.monthly[mk] = { revenue: 0, qty: 0 };
    agg.monthly[mk].revenue += Number(row.total_revenue);
    agg.monthly[mk].qty += Number(row.total_quantity);
    agg.totalRevenue += Number(row.total_revenue);
    agg.totalQty += Number(row.total_quantity);
  }

  return Array.from(map.values()).sort((a, b) => a.sortKey.localeCompare(b.sortKey));
}

/* ------------------------------------------------------------------ */
/*  Export                                                            */
/* ------------------------------------------------------------------ */

export function exportToExcel(
  rows: AggRow[],
  periods: Period[],
  showMonthly: boolean,
  groupBy: GroupBy,
  dateFrom: string,
  dateTo: string,
  grandRevenue: number,
  grandQty: number,
  grandMonthly: Record<string, { revenue: number; qty: number }>,
) {
  const header: (string | number)[] =
    groupBy === 'product-channel'
      ? ['Product', 'Channel']
      : groupBy === 'product'
      ? ['Product']
      : ['Channel'];

  if (showMonthly) {
    for (const p of periods) header.push(`${p.label} Revenue`, `${p.label} Qty`);
  }
  header.push('Total Revenue', 'Total Qty');

  const dataRows = rows.map((row) => {
    const cells: (string | number)[] =
      groupBy === 'product-channel' ? [row.label, row.subLabel ?? ''] : [row.label];
    if (showMonthly) {
      for (const p of periods) {
        const m = row.monthly[p.key];
        cells.push(m ? m.revenue : 0, m ? m.qty : 0);
      }
    }
    cells.push(row.totalRevenue, row.totalQty);
    return cells;
  });

  const totalsRow: (string | number)[] =
    groupBy === 'product-channel' ? ['Total', ''] : ['Total'];
  if (showMonthly) {
    for (const p of periods) {
      const gm = grandMonthly[p.key];
      totalsRow.push(gm ? gm.revenue : 0, gm ? gm.qty : 0);
    }
  }
  totalsRow.push(grandRevenue, grandQty);

  const ws = XLSX.utils.aoa_to_sheet([header, ...dataRows, totalsRow]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Sales');
  XLSX.writeFile(wb, `trevito_sales_${dateFrom}_to_${dateTo}.xlsx`);
}
