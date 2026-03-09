'use client';

import { Group, MultiSelect, Select } from '@mantine/core';
import { DatePickerInput, type DatesRangeValue } from '@mantine/dates';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useState } from 'react';
import dayjs from 'dayjs';
import { CHANNELS, GROUP_BY_OPTIONS } from '@/lib/constants';
import { parseFilters } from '@/lib/filters';

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

  const push = (patch: Record<string, string>) => {
    const params = new URLSearchParams(searchParams.toString());
    for (const [k, v] of Object.entries(patch)) {
      params.set(k, v);
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
    if (value.length > 0) {
      push({ channels: value.join(',') });
    }
  };

  const handleGroupByChange = (value: string | null) => {
    if (value) push({ groupBy: value });
  };

  return (
    <Group gap="sm" wrap="wrap">
      <DatePickerInput
        type="range"
        label="Date range"
        placeholder="Pick range"
        value={dateValue}
        onChange={handleDateChange}
        maxDate={new Date()}
        style={{ minWidth: 260 }}
      />
      <MultiSelect
        label="Channels"
        data={CHANNELS as unknown as { value: string; label: string }[]}
        value={filters.channels}
        onChange={handleChannelsChange}
        style={{ minWidth: 220 }}
      />
      <Select
        label="Group by"
        data={GROUP_BY_OPTIONS as unknown as { value: string; label: string }[]}
        value={filters.groupBy}
        onChange={handleGroupByChange}
        allowDeselect={false}
        style={{ minWidth: 180 }}
      />
    </Group>
  );
}
