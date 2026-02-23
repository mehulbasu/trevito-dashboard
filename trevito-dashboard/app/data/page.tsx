import { Container, Stack, Text, Title } from '@mantine/core';
import ShiprocketSyncButton from '@/components/data/ShiprocketSyncButton';
import { createClient } from '@/lib/supabase/server';

type LastUpdatedRow = {
  channel: string;
  updated: string;
};

async function getLastUpdatedTimestamps() {
  const supabase = await createClient();
  const { data, error } = await supabase.schema('sales').from('last_updated').select('channel, updated');

  if (error) {
    console.error('Error fetching last updated timestamp:', error);
    return [] as LastUpdatedRow[];
  }

  return (data ?? []) as LastUpdatedRow[];
}

export default async function DataPage() {
  const timestamps = await getLastUpdatedTimestamps();

  // TODO: Update after successful sync
  const shiprocketLastUpdated = timestamps.find((row) => row.channel === 'shiprocket')?.updated;
  const shiprocketLastUpdatedLocal = shiprocketLastUpdated
    ? new Date(shiprocketLastUpdated).toLocaleString()
    : 'Not synced yet';

  return (
    <Container size="lg" py="md">
      <Stack>
        <Title order={2}>Manage data</Title>
        <ShiprocketSyncButton />
        <Text c="dimmed" size="sm">
          Last updated: {shiprocketLastUpdatedLocal}
        </Text>
      </Stack>
    </Container>
  );
}
