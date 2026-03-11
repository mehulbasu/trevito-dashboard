'use client';

import { Checkbox, Combobox, Group, InputBase, Select, useCombobox } from '@mantine/core';
import { DatePickerInput, type DatesRangeValue } from '@mantine/dates';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useState } from 'react';
import dayjs from 'dayjs';
import { ALL_CHANNEL_VALUES, CHANNELS, GROUP_BY_OPTIONS, PRODUCTS, ALL_PRODUCT_SKUS } from '@/lib/constants';
import { parseFilters } from '@/lib/filters';

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

export default function FilterBar() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const filters = parseFilters(searchParams);

  // Local state tracks in-progress date selection so the calendar
  // visually updates on the first click; URL is only updated once
  // both start and end are chosen.
  const [dateValue, setDateValue] = useState<DatesRangeValue>([
    filters.from.toDate(),
    filters.to.toDate(),
  ]);

  const push = (patch: Record<string, string | null>) => {
    const params = new URLSearchParams(searchParams.toString());
    for (const [k, v] of Object.entries(patch)) {
      if (v === null) {
        params.delete(k);
      } else {
        params.set(k, v);
      }
    }
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  };

  const handleDateChange = (value: DatesRangeValue) => {
    setDateValue(value);
    const [start, end] = value;
    if (start && end) {
      push({
        from: dayjs(start).format('YYYY-MM-DD'),
        to: dayjs(end).format('YYYY-MM-DD'),
      });
    }
  };

  const handleChannelsChange = (value: string[]) => {
    if (value.length === 0 || value.length === ALL_CHANNEL_VALUES.length) {
      push({ channels: null });
    } else {
      push({ channels: value.join(',') });
    }
  };

  const handleSkusChange = (value: string[]) => {
    if (value.length === 0 || value.length === ALL_PRODUCT_SKUS.length) {
      push({ skus: null });
    } else {
      push({ skus: value.join(',') });
    }
  };

  const handleGroupByChange = (value: string | null) => {
    if (value) push({ groupBy: value });
  };

  return (
    <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end' }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <DatePickerInput
          type="range"
          label="Date range"
          placeholder="Pick range"
          value={dateValue}
          onChange={handleDateChange}
          maxDate={new Date()}
          style={{ width: '100%' }}
        />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <CountMultiSelect
          label="Channels"
          data={CHANNELS as unknown as { value: string; label: string }[]}
          value={filters.channels}
          onChange={handleChannelsChange}
        />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <CountMultiSelect
          label="Products"
          data={PRODUCTS}
          value={filters.skus}
          onChange={handleSkusChange}
        />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <Select
          label="Group by"
          data={GROUP_BY_OPTIONS as unknown as { value: string; label: string }[]}
          value={filters.groupBy}
          onChange={handleGroupByChange}
          allowDeselect={false}
          style={{ width: '100%' }}
        />
      </div>
    </div>
  );
}
