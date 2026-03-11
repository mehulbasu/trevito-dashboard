'use client';

import React, { useRef } from 'react';
import { Box, Text } from '@mantine/core';
import dayjs from 'dayjs';
import {
  CHANNEL_LABEL,
  getProductName,
  PRODUCT_ORDER,
  type GroupBy,
} from '@/lib/constants';

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

type Props = {
  data: SummaryRow[];
  groupBy: GroupBy;
  dateFrom: string;
  dateTo: string;
};

/* ------------------------------------------------------------------ */
/*  Period helpers                                                     */
/* ------------------------------------------------------------------ */

type Period = { key: string; label: string };

/**
 * Given a date range, build a list of monthly periods with labels. For example:
 * 2024-01-15 to 2024-03-10 would produce:
 * [
 *  { key: '2024-01-01', label: 'Jan 15 – Jan 31' },
 * { key: '2024-02-01', label: 'February' },
 * { key: '2024-03-01', label: 'Mar 1 – Mar 10' },
 * ]
 * The key is the month start date and is used for grouping, while the label is for display.
 * If a period covers the full month, we show just the month name. Otherwise, we show the date range.
 */
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
/*  Formatting                                                         */
/* ------------------------------------------------------------------ */

const inrFmt = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  maximumFractionDigits: 0,
});

const fmtRevenue = (v: number) => inrFmt.format(v);

/* ------------------------------------------------------------------ */
/*  Aggregation                                                        */
/* ------------------------------------------------------------------ */

type AggRow = {
  label: string;
  subLabel?: string;
  sortKey: string;
  monthly: Record<string, { revenue: number; qty: number }>;
  totalRevenue: number;
  totalQty: number;
};

type FlatRow = { row: AggRow; isFirst: boolean; groupSize: number; groupIndex: number };

function skuSortKey(sku: string): string {
  const idx = PRODUCT_ORDER.indexOf(sku);
  return idx === -1 ? `999_${sku}` : idx.toString().padStart(3, '0');
}

/**
 * Aggregate raw summary rows into display rows based on the selected grouping. 
 * For example, if groupBy is 'product-channel', we group by unique (sku, channel) pairs. 
 * If groupBy is 'product', we group by sku only, summing across channels.
 * The resulting rows are enriched with display labels and a sort key for consistent ordering.
 */
function aggregate(data: SummaryRow[], groupBy: GroupBy): AggRow[] {
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
/*  Design tokens                                                      */
/* ------------------------------------------------------------------ */

const T = {
  // Header
  headerBg: '#1e293b',
  headerBgAlt: '#27395a',
  headerTotalBg: '#0f172a',
  headerText: '#f1f5f9',
  // Rows
  rowEven: '#ffffff',
  rowOdd: '#f8fafc',
  rowText: '#0f172a',
  rowSubText: '#475569',
  rowMuted: '#94a3b8',
  // Group boundary
  groupBorderTop: '#64748b',
  // Table borders
  borderLight: '#e2e8f0',
  borderMedium: '#cbd5e1',
  borderStrong: '#94a3b8',
  // Footer
  footerBg: '#f1f5f9',
  footerText: '#0f172a',
} as const;

const CELL_PAD = '9px 14px';
const HEADER_PAD = '10px 14px';

/* ------------------------------------------------------------------ */
/*  Style helpers                                                      */
/* ------------------------------------------------------------------ */

const baseHeaderTh = (extra?: React.CSSProperties): React.CSSProperties => ({
  background: T.headerBg,
  color: T.headerText,
  fontSize: '0.6875rem',
  fontWeight: 700,
  textTransform: 'uppercase',
  letterSpacing: '0.07em',
  padding: HEADER_PAD,
  whiteSpace: 'nowrap',
  border: 'none',
  ...extra,
});

const monthGroupTh = (idx: number): React.CSSProperties => ({
  background: idx % 2 === 0 ? T.headerBg : T.headerBgAlt,
  color: T.headerText,
  fontSize: '0.8125rem',
  fontWeight: 600,
  textAlign: 'center',
  padding: HEADER_PAD,
  whiteSpace: 'nowrap',
  border: 'none',
  borderLeft: `2px solid rgba(255,255,255,0.12)`,
});

const footerCell = (extra?: React.CSSProperties): React.CSSProperties => ({
  padding: CELL_PAD,
  fontWeight: 700,
  fontSize: '0.875rem',
  borderTop: `2px solid ${T.borderStrong}`,
  background: T.footerBg,
  color: T.footerText,
  fontVariantNumeric: 'tabular-nums',
  ...extra,
});

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function SalesTable({ data, groupBy, dateFrom, dateTo }: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const periods = buildPeriods(dateFrom, dateTo);
  const showMonthly = periods.length > 1;
  const rows = aggregate(data, groupBy);

  // Grand totals
  const grandRevenue = rows.reduce((s, r) => s + r.totalRevenue, 0);
  const grandQty = rows.reduce((s, r) => s + r.totalQty, 0);
  const grandMonthly: Record<string, { revenue: number; qty: number }> = {};
  if (showMonthly) {
    for (const p of periods) grandMonthly[p.key] = { revenue: 0, qty: 0 };
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

  // Build flat row list with group metadata for rowspan in product-channel mode
  const flatRowList: FlatRow[] = [];
  if (groupBy === 'product-channel') {
    let gIdx = 0;
    let pos = 0;
    while (pos < rows.length) {
      const prefix = rows[pos].sortKey.split('|')[0];
      let end = pos;
      while (end < rows.length && rows[end].sortKey.split('|')[0] === prefix) end++;
      const size = end - pos;
      for (let k = pos; k < end; k++) {
        flatRowList.push({ row: rows[k], isFirst: k === pos, groupSize: size, groupIndex: gIdx });
      }
      gIdx++;
      pos = end;
    }
  }

  const labelCols = groupBy === 'product-channel' ? 2 : 1;

  return (
    <Box>
      <div style={{ position: 'relative' }}>
        <button
          onClick={() => scrollRef.current?.scrollBy({ left: -300, behavior: 'smooth' })}
          aria-label="Scroll table left"
          style={{
            position: 'absolute', left: -36, top: 0, bottom: 0, width: 32,
            padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'rgba(30,41,59,0.05)', border: '1px solid rgba(30,41,59,0.1)',
            borderRadius: 8, cursor: 'pointer', fontSize: 22, color: '#64748b', zIndex: 10,
          }}
        >
          ‹
        </button>
        <button
          onClick={() => scrollRef.current?.scrollBy({ left: 300, behavior: 'smooth' })}
          aria-label="Scroll table right"
          style={{
            position: 'absolute', right: -36, top: 0, bottom: 0, width: 32,
            padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'rgba(30,41,59,0.05)', border: '1px solid rgba(30,41,59,0.1)',
            borderRadius: 8, cursor: 'pointer', fontSize: 22, color: '#64748b', zIndex: 10,
          }}
        >
          ›
        </button>
        <div
          ref={scrollRef}
          style={{
            borderRadius: 10,
            overflowX: 'auto',
            boxShadow: '0 2px 12px rgba(0,0,0,0.08), 0 1px 3px rgba(0,0,0,0.05)',
            border: `1px solid ${T.borderLight}`,
          }}
        >
        <table
          style={{
            borderCollapse: 'collapse',
            minWidth: '100%',
            width: 'max-content',
            fontSize: '0.875rem',
            fontFamily: 'inherit',
          }}
        >
          <thead>
            {/* ── Row 1: month group labels (only when multiple months) ── */}
            {showMonthly && (
              <tr>
                {Array.from({ length: labelCols }).map((_, j) => (
                  <th
                    key={j}
                    style={baseHeaderTh({
                      position: 'sticky',
                      left: j === 0 ? 0 : 140,
                      zIndex: 2,
                      boxShadow: j === labelCols - 1 ? 'inset 1px 0 0 rgba(255,255,255,0.2), 3px 0 6px rgba(0,0,0,0.2)' : undefined,
                    })}
                  />
                ))}
                {periods.map((p, i) => (
                  <th
                    key={p.key}
                    colSpan={2}
                    style={monthGroupTh(i)}
                  >
                    {p.label}
                  </th>
                ))}
                <th
                  colSpan={2}
                  style={{
                    background: T.headerTotalBg,
                    color: T.headerText,
                    textAlign: 'center',
                    fontSize: '0.6875rem',
                    fontWeight: 700,
                    textTransform: 'uppercase',
                    letterSpacing: '0.07em',
                    padding: HEADER_PAD,
                    border: 'none',
                    borderLeft: `2px solid rgba(255,255,255,0.2)`,
                  }}
                >
                  Total
                </th>
              </tr>
            )}

            {/* ── Row 2: column headers ── */}
            <tr>
              {groupBy === 'product-channel' ? (
                <>
                  <th style={baseHeaderTh({ width: 140, minWidth: 140, position: 'sticky', left: 0, zIndex: 2 })}>
                    Product
                  </th>
                  <th style={baseHeaderTh({ width: 110, minWidth: 110, position: 'sticky', left: 140, zIndex: 2, boxShadow: 'inset 1px 0 0 rgba(255,255,255,0.2), 3px 0 6px rgba(0,0,0,0.2)', borderRight: `1px solid rgba(255,255,255,0.08)` })}>
                    Channel
                  </th>
                </>
              ) : groupBy === 'product' ? (
                <th style={baseHeaderTh({ width: 160, minWidth: 160, position: 'sticky', left: 0, zIndex: 2, boxShadow: '3px 0 6px rgba(0,0,0,0.2)', borderRight: `1px solid rgba(255,255,255,0.08)` })}>
                  Product
                </th>
              ) : (
                <th style={baseHeaderTh({ width: 150, minWidth: 150, position: 'sticky', left: 0, zIndex: 2, boxShadow: '3px 0 6px rgba(0,0,0,0.2)', borderRight: `1px solid rgba(255,255,255,0.08)` })}>
                  Channel
                </th>
              )}

              {showMonthly &&
                periods.map((p, i) => (
                  <React.Fragment key={p.key}>
                    <th
                      style={baseHeaderTh({
                        textAlign: 'right',
                        background: i % 2 === 0 ? T.headerBg : T.headerBgAlt,
                        borderLeft: `2px solid rgba(255,255,255,0.12)`,
                      })}
                    >
                      Revenue
                    </th>
                    <th
                      style={baseHeaderTh({
                        textAlign: 'right',
                        background: i % 2 === 0 ? T.headerBg : T.headerBgAlt,
                        borderRight: `1px solid rgba(255,255,255,0.08)`,
                      })}
                    >
                      Qty
                    </th>
                  </React.Fragment>
                ))}

              <th
                style={baseHeaderTh({
                  textAlign: 'right',
                  background: T.headerTotalBg,
                  borderLeft: `2px solid rgba(255,255,255,0.2)`,
                })}
              >
                Revenue
              </th>
              <th
                style={baseHeaderTh({
                  textAlign: 'right',
                  background: T.headerTotalBg,
                })}
              >
                Qty
              </th>
            </tr>
          </thead>

          <tbody>
            {groupBy !== 'product-channel' ? (
              rows.map((row, i) => {
                const rowBg = i % 2 === 1 ? T.rowOdd : T.rowEven;
                return (
                  <tr key={row.sortKey} style={{ background: rowBg }}>
                    <td
                      style={{
                        padding: CELL_PAD,
                        fontWeight: 500,
                        borderTop: `1px solid ${T.borderLight}`,
                        borderRight: `1px solid ${T.borderLight}`,
                        whiteSpace: 'nowrap',
                        color: T.rowText,
                        width: groupBy === 'product' ? 160 : 150,
                        minWidth: groupBy === 'product' ? 160 : 150,
                        position: 'sticky',
                        left: 0,
                        zIndex: 1,
                        background: rowBg,
                        boxShadow: '3px 0 6px rgba(0,0,0,0.05)',
                      }}
                    >
                      {row.label}
                    </td>
                    {showMonthly &&
                      periods.map((p) => {
                        const m = row.monthly[p.key];
                        return (
                          <React.Fragment key={p.key}>
                            <td
                              style={{
                                padding: CELL_PAD,
                                textAlign: 'right',
                                borderTop: `1px solid ${T.borderLight}`,
                                borderLeft: `2px solid ${T.borderMedium}`,
                                color: m ? T.rowText : T.rowMuted,
                                fontVariantNumeric: 'tabular-nums',
                              }}
                            >
                              {m ? fmtRevenue(m.revenue) : '–'}
                            </td>
                            <td
                              style={{
                                padding: CELL_PAD,
                                textAlign: 'right',
                                borderTop: `1px solid ${T.borderLight}`,
                                borderRight: `1px solid ${T.borderLight}`,
                                color: m ? T.rowSubText : T.rowMuted,
                                fontVariantNumeric: 'tabular-nums',
                              }}
                            >
                              {m ? m.qty : '–'}
                            </td>
                          </React.Fragment>
                        );
                      })}
                    <td
                      style={{
                        padding: CELL_PAD,
                        textAlign: 'right',
                        fontWeight: 600,
                        borderTop: `1px solid ${T.borderLight}`,
                        borderLeft: `2px solid ${T.borderStrong}`,
                        color: T.rowText,
                        fontVariantNumeric: 'tabular-nums',
                      }}
                    >
                      {fmtRevenue(row.totalRevenue)}
                    </td>
                    <td
                      style={{
                        padding: CELL_PAD,
                        textAlign: 'right',
                        fontWeight: 600,
                        borderTop: `1px solid ${T.borderLight}`,
                        color: T.rowSubText,
                        fontVariantNumeric: 'tabular-nums',
                      }}
                    >
                      {row.totalQty}
                    </td>
                  </tr>
                );
              })
            ) : (
              flatRowList.map(({ row, isFirst, groupSize, groupIndex }) => {
                const rowBg = groupIndex % 2 === 1 ? T.rowOdd : T.rowEven;
                const isNewGroup = isFirst && groupIndex > 0;
                const topBorder = isNewGroup
                  ? `2px solid ${T.groupBorderTop}`
                  : `1px solid ${T.borderLight}`;
                return (
                  <tr key={row.sortKey} style={{ background: rowBg }}>
                    {isFirst && (
                      <td
                        rowSpan={groupSize}
                        style={{
                          padding: CELL_PAD,
                          fontWeight: 600,
                          borderTop: isNewGroup ? `2px solid ${T.groupBorderTop}` : `1px solid ${T.borderLight}`,
                          color: T.rowText,
                          width: 140,
                          minWidth: 140,
                          verticalAlign: 'middle',
                          background: rowBg,
                          position: 'sticky',
                          left: 0,
                          zIndex: 1,
                        }}
                      >
                        {row.label}
                      </td>
                    )}
                    <td
                      style={{
                        padding: CELL_PAD,
                        borderTop: topBorder,
                        borderRight: `1px solid ${T.borderLight}`,
                        color: T.rowSubText,
                        fontSize: '0.8125rem',
                        width: 110,
                        minWidth: 110,
                        position: 'sticky',
                        left: 140,
                        zIndex: 1,
                        background: rowBg,
                        boxShadow: `inset 1px 0 0 ${T.borderLight}, 3px 0 6px rgba(0,0,0,0.05)`,
                      }}
                    >
                      {row.subLabel}
                    </td>
                    {showMonthly &&
                      periods.map((p) => {
                        const m = row.monthly[p.key];
                        return (
                          <React.Fragment key={p.key}>
                            <td
                              style={{
                                padding: CELL_PAD,
                                textAlign: 'right',
                                borderTop: topBorder,
                                borderLeft: `2px solid ${T.borderMedium}`,
                                color: m ? T.rowText : T.rowMuted,
                                fontVariantNumeric: 'tabular-nums',
                              }}
                            >
                              {m ? fmtRevenue(m.revenue) : '–'}
                            </td>
                            <td
                              style={{
                                padding: CELL_PAD,
                                textAlign: 'right',
                                borderTop: topBorder,
                                borderRight: `1px solid ${T.borderLight}`,
                                color: m ? T.rowSubText : T.rowMuted,
                                fontVariantNumeric: 'tabular-nums',
                              }}
                            >
                              {m ? m.qty : '–'}
                            </td>
                          </React.Fragment>
                        );
                      })}
                    <td
                      style={{
                        padding: CELL_PAD,
                        textAlign: 'right',
                        fontWeight: 600,
                        borderTop: topBorder,
                        borderLeft: `2px solid ${T.borderStrong}`,
                        color: T.rowText,
                        fontVariantNumeric: 'tabular-nums',
                      }}
                    >
                      {fmtRevenue(row.totalRevenue)}
                    </td>
                    <td
                      style={{
                        padding: CELL_PAD,
                        textAlign: 'right',
                        fontWeight: 600,
                        borderTop: topBorder,
                        color: T.rowSubText,
                        fontVariantNumeric: 'tabular-nums',
                      }}
                    >
                      {row.totalQty}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>

          <tfoot>
            <tr>
              {groupBy === 'product-channel' ? (
                <>
                  <td style={footerCell({ position: 'sticky', left: 0, zIndex: 1, minWidth: 140 })}>Total</td>
                  <td style={footerCell({ borderRight: `1px solid ${T.borderLight}`, position: 'sticky', left: 140, zIndex: 1, minWidth: 110, boxShadow: `inset 1px 0 0 ${T.borderLight}, 3px 0 6px rgba(0,0,0,0.05)` })} />
                </>
              ) : (
                <td style={footerCell({ borderRight: `1px solid ${T.borderLight}`, position: 'sticky', left: 0, zIndex: 1, boxShadow: '3px 0 6px rgba(0,0,0,0.05)' })}>Total</td>
              )}

              {showMonthly &&
                periods.map((p) => {
                  const gm = grandMonthly[p.key];
                  return (
                    <React.Fragment key={p.key}>
                      <td
                        style={footerCell({
                          textAlign: 'right',
                          borderLeft: `2px solid ${T.borderMedium}`,
                        })}
                      >
                        {gm ? fmtRevenue(gm.revenue) : '–'}
                      </td>
                      <td
                        style={footerCell({
                          textAlign: 'right',
                          borderRight: `1px solid ${T.borderLight}`,
                        })}
                      >
                        {gm ? gm.qty : '–'}
                      </td>
                    </React.Fragment>
                  );
                })}

              <td
                style={footerCell({
                  textAlign: 'right',
                  borderLeft: `2px solid ${T.borderStrong}`,
                })}
              >
                {fmtRevenue(grandRevenue)}
              </td>
              <td style={footerCell({ textAlign: 'right' })}>{grandQty}</td>
            </tr>
          </tfoot>
        </table>
        </div>
      </div>
    </Box>
  );
}


