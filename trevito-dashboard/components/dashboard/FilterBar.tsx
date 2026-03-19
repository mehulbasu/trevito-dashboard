'use client';

import { Button, Checkbox, Combobox, Group, InputBase, Select, Stack, useCombobox } from '@mantine/core';
import { DatePickerInput } from '@mantine/dates';
import { IconCheck, IconDownload, IconRefresh } from '@tabler/icons-react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { ALL_CHANNEL_VALUES, ALL_PRODUCT_SKUS, CHANNELS, GROUP_BY_OPTIONS, PRODUCTS, type GroupBy } from '@/lib/constants';
import { parseFilters } from '@/lib/filters';
import { aggregate, buildPeriods, exportToExcel, type SummaryRow } from '@/lib/salesData';

/* ------------------------------------------------------------------ */
/*  CountMultiSelect – shows "N selected" instead of pills            */
/* ------------------------------------------------------------------ */

type CountSelectProps = {
  label: string;
  data: Array<{ value: string; label: string }>;
  value: string[];
  onChange: (value: string[]) => void;
};

function CountMultiSelect({ label, data, value, onChange }: CountSelectProps) {
  const combobox = useCombobox({ onDropdownClose: () => combobox.resetSelectedOption() });

  const handleSelect = (val: string) => {
    onChange(value.includes(val) ? value.filter((v) => v !== val) : [...value, val]);
  };

  const displayValue =
    value.length === 0
      ? 'None selected'
      : value.length === data.length
      ? `All (${data.length})`
      : `${value.length} of ${data.length} selected`;

  return (
    <Combobox store={combobox} onOptionSubmit={handleSelect}>
      <Combobox.Target>
        <InputBase
          label={label}
          component="button"
          type="button"
          pointer
          rightSection={<Combobox.Chevron />}
          rightSectionPointerEvents="none"
          onClick={() => combobox.toggleDropdown()}
          style={{ cursor: 'pointer', width: '100%', textAlign: 'left' }}
        >
          {displayValue}
        </InputBase>
      </Combobox.Target>
      <Combobox.Dropdown>
        <Combobox.Options>
          {data.map((item) => (
            <Combobox.Option value={item.value} key={item.value} active={value.includes(item.value)}>
              <Group gap="sm" wrap="nowrap">
                <Checkbox
                  checked={value.includes(item.value)}
                  onChange={() => {}}
                  tabIndex={-1}
                  style={{ pointerEvents: 'none' }}
                />
                <span>{item.label}</span>
              </Group>
            </Combobox.Option>
          ))}
        </Combobox.Options>
      </Combobox.Dropdown>
    </Combobox>
  );
}

/* ------------------------------------------------------------------ */
/*  FilterBar                                                          */
/* ------------------------------------------------------------------ */

type FilterBarProps = {
  data: SummaryRow[];
  groupBy: GroupBy;
  dateFrom: string;
  dateTo: string;
};

export default function FilterBar({ data, groupBy, dateFrom, dateTo }: FilterBarProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const committed = parseFilters(searchParams);

  // Draft state — changes here do NOT affect the URL until Apply is clicked
  const [draftFrom, setDraftFrom] = useState<string>(committed.from.format('YYYY-MM-DD'));
  const [draftTo, setDraftTo] = useState<string>(committed.to.format('YYYY-MM-DD'));
  const [draftChannels, setDraftChannels] = useState<string[]>(committed.channels);
  const [draftSkus, setDraftSkus] = useState<string[]>(committed.skus);
  const [draftGroupBy, setDraftGroupBy] = useState<GroupBy>(committed.groupBy);

  // After apply or reset, sync draft back to the new URL state
  useEffect(() => {
    const f = parseFilters(searchParams);
    setDraftFrom(f.from.format('YYYY-MM-DD'));
    setDraftTo(f.to.format('YYYY-MM-DD'));
    setDraftChannels(f.channels);
    setDraftSkus(f.skus);
    setDraftGroupBy(f.groupBy);
  }, [searchParams]);

  // isDirty: true when draft differs from the committed URL state
  const isDirty =
    draftFrom !== committed.from.format('YYYY-MM-DD') ||
    draftTo !== committed.to.format('YYYY-MM-DD') ||
    [...draftChannels].sort().join() !== [...committed.channels].sort().join() ||
    [...draftSkus].sort().join() !== [...committed.skus].sort().join() ||
    draftGroupBy !== committed.groupBy;

  const handleApply = () => {
    const params = new URLSearchParams();
    params.set('from', draftFrom);
    params.set('to', draftTo);
    if (draftChannels.length > 0 && draftChannels.length < ALL_CHANNEL_VALUES.length) {
      params.set('channels', draftChannels.join(','));
    }
    if (draftSkus.length > 0 && draftSkus.length < ALL_PRODUCT_SKUS.length) {
      params.set('skus', draftSkus.join(','));
    }
    if (draftGroupBy !== 'product-channel') {
      params.set('groupBy', draftGroupBy);
    }
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  };

  const handleReset = () => {
    router.replace('/dashboard');
  };

  // Compute aggregated data for export (based on committed/displayed data)
  const exportRows = useMemo(() => aggregate(data, groupBy), [data, groupBy]);
  const exportPeriods = useMemo(() => buildPeriods(dateFrom, dateTo), [dateFrom, dateTo]);
  const exportShowMonthly = exportPeriods.length > 1;
  const { exportGrandRevenue, exportGrandQty, exportGrandMonthly } = useMemo(() => {
    const revenue = exportRows.reduce((s, r) => s + r.totalRevenue, 0);
    const qty = exportRows.reduce((s, r) => s + r.totalQty, 0);
    const monthly: Record<string, { revenue: number; qty: number }> = {};
    if (exportShowMonthly) {
      for (const p of exportPeriods) monthly[p.key] = { revenue: 0, qty: 0 };
      for (const r of exportRows) {
        for (const p of exportPeriods) {
          const m = r.monthly[p.key];
          if (m) {
            monthly[p.key].revenue += m.revenue;
            monthly[p.key].qty += m.qty;
          }
        }
      }
    }
    return { exportGrandRevenue: revenue, exportGrandQty: qty, exportGrandMonthly: monthly };
  }, [exportRows, exportPeriods, exportShowMonthly]);

  const handleExport = () => {
    exportToExcel(
      exportRows,
      exportPeriods,
      exportShowMonthly,
      groupBy,
      dateFrom,
      dateTo,
      exportGrandRevenue,
      exportGrandQty,
      exportGrandMonthly,
    );
  };

  return (
    <Stack gap="lg">
      <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <DatePickerInput
            type="default"
            label="From"
            placeholder="Start date"
            value={draftFrom}
            onChange={(v: string | null) => { if (v) setDraftFrom(v); }}
            maxDate={new Date(draftTo)}
          />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <DatePickerInput
            type="default"
            label="To"
            placeholder="End date"
            value={draftTo}
            onChange={(v: string | null) => { if (v) setDraftTo(v); }}
            minDate={new Date(draftFrom)}
            maxDate={new Date()}
          />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <CountMultiSelect
            label="Channels"
            data={CHANNELS as unknown as { value: string; label: string }[]}
            value={draftChannels}
            onChange={setDraftChannels}
          />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <CountMultiSelect
            label="Products"
            data={PRODUCTS}
            value={draftSkus}
            onChange={setDraftSkus}
          />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <Select
            label="Group by"
            data={GROUP_BY_OPTIONS as unknown as { value: string; label: string }[]}
            value={draftGroupBy}
            onChange={(v) => v && setDraftGroupBy(v as GroupBy)}
            allowDeselect={false}
            style={{ width: '100%' }}
          />
        </div>
      </div>
      <Group justify="flex-end">
        <Button
          color="dark"
          size="sm"
          leftSection={<IconCheck size={14} />}
          disabled={!isDirty}
          onClick={handleApply}
        >
          Apply filters
        </Button>
        <Button
          variant="default"
          size="sm"
          leftSection={<IconRefresh size={14} />}
          onClick={handleReset}
        >
          Reset filters
        </Button>
        <Button
          variant="light"
          color="green"
          size="sm"
          leftSection={<IconDownload size={14} />}
          onClick={handleExport}
        >
          Export data
        </Button>
      </Group>
    </Stack>
  );
}
