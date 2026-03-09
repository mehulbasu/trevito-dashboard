import { ActionIcon, Container, Group, Stack, Text, Title } from '@mantine/core';
import { IconArrowLeft } from '@tabler/icons-react';
import { Suspense } from 'react';

import FilterBar from '@/components/dashboard/FilterBar';
import { parseFilters } from '@/lib/filters';
import SalesTable, { type SummaryRow } from '@/components/dashboard/SalesTable';
import { createClient } from '@/lib/supabase/server';

type Props = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function DashboardPage({ searchParams }: Props) {
  const sp = new URLSearchParams();
  const raw = await searchParams;
  for (const [k, v] of Object.entries(raw)) {
    if (typeof v === 'string') sp.set(k, v);
  }

  const filters = parseFilters(sp);

  const dateFrom = filters.from.format('YYYY-MM-DD');
  const dateTo = filters.to.format('YYYY-MM-DD');
  // Pass end-of-day + 1 day for exclusive upper bound in SQL
  const dateToExclusive = filters.to.add(1, 'day').startOf('day').toISOString();

  const supabase = await createClient();
  const { data, error } = await supabase.schema('sales').rpc('dashboard_summary', {
    date_from: filters.from.toISOString(),
    date_to: dateToExclusive,
    channels: filters.channels,
  });

  if (error) {
    console.error('dashboard_summary RPC error:', error);
  }

  const rows: SummaryRow[] = (data ?? []) as SummaryRow[];

  return (
    <Container size="xl" py="xl">
      <Stack gap="lg">
        <Group>
          <ActionIcon
            component="a"
            href="/"
            variant="light"
            color="dark"
            size="xl"
            aria-label="Back to home"
          >
            <IconArrowLeft />
          </ActionIcon>
          <div>
            <Title order={2}>Sales Dashboard</Title>
            <Text c="dimmed" size="sm">
              Revenue and quantity across all channels
            </Text>
          </div>
        </Group>

        <Suspense>
          <FilterBar />
        </Suspense>

        <SalesTable
          data={rows}
          groupBy={filters.groupBy}
          dateFrom={dateFrom}
          dateTo={dateTo}
        />
      </Stack>
    </Container>
  );
}
