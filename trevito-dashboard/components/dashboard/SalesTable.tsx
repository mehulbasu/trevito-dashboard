'use client';

import React, { useMemo, useRef } from 'react';
import { Box, ScrollArea, Table, Text, UnstyledButton } from '@mantine/core';
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

/** Build flat row list with group metadata for rowspan in product-channel mode */
function buildFlatRows(rows: AggRow[]): FlatRow[] {
  const list: FlatRow[] = [];
  let gIdx = 0;
  let pos = 0;
  while (pos < rows.length) {
    // Group rows with the same product (same prefix before '|') together for rowspan
    const prefix = rows[pos].sortKey.split('|')[0];
    let end = pos;
    while (end < rows.length && rows[end].sortKey.split('|')[0] === prefix) end++;
    const size = end - pos;
    for (let k = pos; k < end; k++) {
      // Mark the first row in the group for rendering the product label with rowspan
      list.push({ row: rows[k], isFirst: k === pos, groupSize: size, groupIndex: gIdx });
    }
    gIdx++;
    pos = end;
  }
  return list;
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
  borderLeft: '2px solid rgba(255,255,255,0.12)',
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

const monthlyRevenueStyle = (
  topBorder: string,
  hasValue: boolean,
): React.CSSProperties => ({
  padding: CELL_PAD,
  textAlign: 'right',
  borderTop: topBorder,
  borderLeft: `2px solid ${T.borderMedium}`,
  color: hasValue ? T.rowText : T.rowMuted,
  fontVariantNumeric: 'tabular-nums',
});

const monthlyQtyStyle = (
  topBorder: string,
  hasValue: boolean,
): React.CSSProperties => ({
  padding: CELL_PAD,
  textAlign: 'right',
  borderTop: topBorder,
  borderRight: `1px solid ${T.borderLight}`,
  color: hasValue ? T.rowSubText : T.rowMuted,
  fontVariantNumeric: 'tabular-nums',
});

const totalRevenueStyle = (topBorder: string): React.CSSProperties => ({
  padding: CELL_PAD,
  textAlign: 'right',
  fontWeight: 600,
  borderTop: topBorder,
  borderLeft: `2px solid ${T.borderStrong}`,
  color: T.rowText,
  fontVariantNumeric: 'tabular-nums',
});

const totalQtyStyle = (topBorder: string): React.CSSProperties => ({
  padding: CELL_PAD,
  textAlign: 'right',
  fontWeight: 600,
  borderTop: topBorder,
  color: T.rowSubText,
  fontVariantNumeric: 'tabular-nums',
});

/* ------------------------------------------------------------------ */
/*  MonthlyCells – revenue/qty pair per period + totals                */
/* ------------------------------------------------------------------ */

function MonthlyCells({
  row,
  periods,
  showMonthly,
  topBorder,
}: {
  row: AggRow;
  periods: Period[];
  showMonthly: boolean;
  topBorder: string;
}) {
  return (
    <>
      {showMonthly &&
        periods.map((p) => {
          const m = row.monthly[p.key];
          return (
            <React.Fragment key={p.key}>
              <Table.Td style={monthlyRevenueStyle(topBorder, !!m)}>
                {m ? fmtRevenue(m.revenue) : '–'}
              </Table.Td>
              <Table.Td style={monthlyQtyStyle(topBorder, !!m)}>
                {m ? m.qty : '–'}
              </Table.Td>
            </React.Fragment>
          );
        })}
      <Table.Td style={totalRevenueStyle(topBorder)}>
        {fmtRevenue(row.totalRevenue)}
      </Table.Td>
      <Table.Td style={totalQtyStyle(topBorder)}>{row.totalQty}</Table.Td>
    </>
  );
}

/* ------------------------------------------------------------------ */
/*  Scroll button base style                                           */
/* ------------------------------------------------------------------ */

const scrollBtnBase: React.CSSProperties = {
  position: 'absolute',
  top: 0,
  bottom: 0,
  width: 32,
  padding: 0,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  background: 'rgba(30,41,59,0.05)',
  border: '1px solid rgba(30,41,59,0.1)',
  borderRadius: 8,
  cursor: 'pointer',
  fontSize: 22,
  color: '#64748b',
  zIndex: 10,
};

/* ------------------------------------------------------------------ */
/*  Main Table Component                                              */
/* ------------------------------------------------------------------ */

export default function SalesTable({ data, groupBy, dateFrom, dateTo }: Props) {
  const viewportRef = useRef<HTMLDivElement>(null);

  const periods = useMemo(() => buildPeriods(dateFrom, dateTo), [dateFrom, dateTo]);
  const showMonthly = periods.length > 1;
  const rows = useMemo(() => aggregate(data, groupBy), [data, groupBy]);

  const flatRowList = useMemo(
    () => (groupBy === 'product-channel' ? buildFlatRows(rows) : []),
    [rows, groupBy],
  );

  // Pre-aggregate grand totals and monthly totals for the footer row
  const { grandRevenue, grandQty, grandMonthly } = useMemo(() => {
    const revenue = rows.reduce((s, r) => s + r.totalRevenue, 0);
    const qty = rows.reduce((s, r) => s + r.totalQty, 0);
    const monthly: Record<string, { revenue: number; qty: number }> = {};
    if (showMonthly) {
      for (const p of periods) monthly[p.key] = { revenue: 0, qty: 0 };
      for (const r of rows) {
        for (const p of periods) {
          const m = r.monthly[p.key];
          if (m) {
            monthly[p.key].revenue += m.revenue;
            monthly[p.key].qty += m.qty;
          }
        }
      }
    }
    return { grandRevenue: revenue, grandQty: qty, grandMonthly: monthly };
  }, [rows, periods, showMonthly]);

  if (rows.length === 0) {
    return (
      <Text c="dimmed" ta="center" py="xl">
        No sales data found for the selected filters.
      </Text>
    );
  }

  const labelCols = groupBy === 'product-channel' ? 2 : 1;

  const scrollBy = (offset: number) =>
    viewportRef.current?.scrollBy({ left: offset, behavior: 'smooth' });

  return (
    <Box pos="relative">
      <UnstyledButton
        onClick={() => scrollBy(-300)}
        aria-label="Scroll table left"
        style={{ ...scrollBtnBase, left: -36 }}
      >
        ‹
      </UnstyledButton>
      <UnstyledButton
        onClick={() => scrollBy(300)}
        aria-label="Scroll table right"
        style={{ ...scrollBtnBase, right: -36 }}
      >
        ›
      </UnstyledButton>

      <ScrollArea
        viewportRef={viewportRef}
        type="auto"
        style={{
          borderRadius: 10,
          boxShadow: '0 2px 12px rgba(0,0,0,0.08), 0 1px 3px rgba(0,0,0,0.05)',
          border: `1px solid ${T.borderLight}`,
        }}
      >
        <Table
          withRowBorders={false}
          withTableBorder={false}
          withColumnBorders={false}
          style={{
            minWidth: '100%',
            width: 'max-content',
            fontSize: '0.875rem',
          }}
        >
          <Table.Thead>
            {/* ── Row 1: month group labels (only when multiple months) ── */}
            {showMonthly && (
              <Table.Tr>
                {Array.from({ length: labelCols }).map((_, j) => (
                  <Table.Th
                    key={j}
                    style={baseHeaderTh({
                      position: 'sticky',
                      left: j === 0 ? 0 : 140,
                      zIndex: 2,
                      boxShadow:
                        j === labelCols - 1
                          ? 'inset 1px 0 0 rgba(255,255,255,0.2), 3px 0 6px rgba(0,0,0,0.2)'
                          : undefined,
                    })}
                  />
                ))}
                {periods.map((p, i) => (
                  <Table.Th key={p.key} colSpan={2} style={monthGroupTh(i)}>
                    {p.label}
                  </Table.Th>
                ))}
                <Table.Th
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
                    borderLeft: '2px solid rgba(255,255,255,0.2)',
                  }}
                >
                  Total
                </Table.Th>
              </Table.Tr>
            )}

            {/* ── Row 2: column headers ── */}
            <Table.Tr>
              {groupBy === 'product-channel' ? (
                <>
                  <Table.Th
                    style={baseHeaderTh({
                      width: 140,
                      minWidth: 140,
                      position: 'sticky',
                      left: 0,
                      zIndex: 2,
                    })}
                  >
                    Product
                  </Table.Th>
                  <Table.Th
                    style={baseHeaderTh({
                      width: 110,
                      minWidth: 110,
                      position: 'sticky',
                      left: 140,
                      zIndex: 2,
                      boxShadow:
                        'inset 1px 0 0 rgba(255,255,255,0.2), 3px 0 6px rgba(0,0,0,0.2)',
                      borderRight: '1px solid rgba(255,255,255,0.08)',
                    })}
                  >
                    Channel
                  </Table.Th>
                </>
              ) : groupBy === 'product' ? (
                <Table.Th
                  style={baseHeaderTh({
                    width: 160,
                    minWidth: 160,
                    position: 'sticky',
                    left: 0,
                    zIndex: 2,
                    boxShadow: '3px 0 6px rgba(0,0,0,0.2)',
                    borderRight: '1px solid rgba(255,255,255,0.08)',
                  })}
                >
                  Product
                </Table.Th>
              ) : (
                <Table.Th
                  style={baseHeaderTh({
                    width: 150,
                    minWidth: 150,
                    position: 'sticky',
                    left: 0,
                    zIndex: 2,
                    boxShadow: '3px 0 6px rgba(0,0,0,0.2)',
                    borderRight: '1px solid rgba(255,255,255,0.08)',
                  })}
                >
                  Channel
                </Table.Th>
              )}

              {/**
               * If multiple periods, show revenue and qty columns for each period. 
               * Otherwise just show total columns.
               */}
              {showMonthly &&
                periods.map((p, i) => (
                  <React.Fragment key={p.key}>
                    <Table.Th
                      style={baseHeaderTh({
                        textAlign: 'right',
                        background: i % 2 === 0 ? T.headerBg : T.headerBgAlt,
                        borderLeft: '2px solid rgba(255,255,255,0.12)',
                      })}
                    >
                      Revenue
                    </Table.Th>
                    <Table.Th
                      style={baseHeaderTh({
                        textAlign: 'right',
                        background: i % 2 === 0 ? T.headerBg : T.headerBgAlt,
                        borderRight: '1px solid rgba(255,255,255,0.08)',
                      })}
                    >
                      Qty
                    </Table.Th>
                  </React.Fragment>
                ))}

              <Table.Th
                style={baseHeaderTh({
                  textAlign: 'right',
                  background: T.headerTotalBg,
                  borderLeft: '2px solid rgba(255,255,255,0.2)',
                })}
              >
                Revenue
              </Table.Th>
              <Table.Th
                style={baseHeaderTh({
                  textAlign: 'right',
                  background: T.headerTotalBg,
                })}
              >
                Qty
              </Table.Th>
            </Table.Tr>
          </Table.Thead>

          <Table.Tbody>
            {groupBy !== 'product-channel'
              ? rows.map((row, i) => {
                  const rowBg = i % 2 === 1 ? T.rowOdd : T.rowEven;
                  const topBorder = `1px solid ${T.borderLight}`;
                  return (
                    <Table.Tr key={row.sortKey} style={{ background: rowBg }}>
                      <Table.Td
                        style={{
                          padding: CELL_PAD,
                          fontWeight: 500,
                          borderTop: topBorder,
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
                      </Table.Td>
                      <MonthlyCells
                        row={row}
                        periods={periods}
                        showMonthly={showMonthly}
                        topBorder={topBorder}
                      />
                    </Table.Tr>
                  );
                })
              : flatRowList.map(({ row, isFirst, groupSize, groupIndex }) => {
                  const rowBg = groupIndex % 2 === 1 ? T.rowOdd : T.rowEven;
                  const isNewGroup = isFirst && groupIndex > 0;
                  const topBorder = isNewGroup
                    ? `2px solid ${T.groupBorderTop}`
                    : `1px solid ${T.borderLight}`;
                  return (
                    <Table.Tr key={row.sortKey} style={{ background: rowBg }}>
                      {isFirst && (
                        <Table.Td
                          rowSpan={groupSize}
                          style={{
                            padding: CELL_PAD,
                            fontWeight: 600,
                            borderTop: isNewGroup
                              ? `2px solid ${T.groupBorderTop}`
                              : `1px solid ${T.borderLight}`,
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
                        </Table.Td>
                      )}
                      <Table.Td
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
                      </Table.Td>
                      <MonthlyCells
                        row={row}
                        periods={periods}
                        showMonthly={showMonthly}
                        topBorder={topBorder}
                      />
                    </Table.Tr>
                  );
                })}
          </Table.Tbody>

          <Table.Tfoot>
            <Table.Tr>
              {groupBy === 'product-channel' ? (
                <>
                  <Table.Td
                    style={footerCell({
                      position: 'sticky',
                      left: 0,
                      zIndex: 1,
                      minWidth: 140,
                    })}
                  >
                    Total
                  </Table.Td>
                  <Table.Td
                    style={footerCell({
                      borderRight: `1px solid ${T.borderLight}`,
                      position: 'sticky',
                      left: 140,
                      zIndex: 1,
                      minWidth: 110,
                      boxShadow: `inset 1px 0 0 ${T.borderLight}, 3px 0 6px rgba(0,0,0,0.05)`,
                    })}
                  />
                </>
              ) : (
                <Table.Td
                  style={footerCell({
                    borderRight: `1px solid ${T.borderLight}`,
                    position: 'sticky',
                    left: 0,
                    zIndex: 1,
                    boxShadow: '3px 0 6px rgba(0,0,0,0.05)',
                  })}
                >
                  Total
                </Table.Td>
              )}

              {showMonthly &&
                periods.map((p) => {
                  const gm = grandMonthly[p.key];
                  return (
                    <React.Fragment key={p.key}>
                      <Table.Td
                        style={footerCell({
                          textAlign: 'right',
                          borderLeft: `2px solid ${T.borderMedium}`,
                        })}
                      >
                        {gm ? fmtRevenue(gm.revenue) : '–'}
                      </Table.Td>
                      <Table.Td
                        style={footerCell({
                          textAlign: 'right',
                          borderRight: `1px solid ${T.borderLight}`,
                        })}
                      >
                        {gm ? gm.qty : '–'}
                      </Table.Td>
                    </React.Fragment>
                  );
                })}

              <Table.Td
                style={footerCell({
                  textAlign: 'right',
                  borderLeft: `2px solid ${T.borderStrong}`,
                })}
              >
                {fmtRevenue(grandRevenue)}
              </Table.Td>
              <Table.Td style={footerCell({ textAlign: 'right' })}>{grandQty}</Table.Td>
            </Table.Tr>
          </Table.Tfoot>
        </Table>
      </ScrollArea>
    </Box>
  );
}
