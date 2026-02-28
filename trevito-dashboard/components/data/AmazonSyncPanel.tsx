'use client';

import { Stack, Text } from '@mantine/core';
import { useState } from 'react';
import AmazonSyncButton from '@/components/data/AmazonSyncButton';
import { createClient } from '@/lib/supabase/client';

type AmazonSyncPanelProps = {
  initialLastUpdated: string | null;
};

const formatLastUpdated = (timestamp: string | null) =>
  timestamp ? new Date(timestamp).toLocaleString() : 'Not synced yet';

export default function AmazonSyncPanel({ initialLastUpdated }: AmazonSyncPanelProps) {
  const [lastUpdated, setLastUpdated] = useState<string | null>(initialLastUpdated);

  const refreshLastUpdated = async () => {
    const supabase = createClient();
    const { data, error } = await supabase
      .schema('sales')
      .from('last_updated')
      .select('updated')
      .eq('channel', 'amazon')
      .maybeSingle<{ updated: string }>();

    if (error) {
      console.error('Error fetching latest Amazon timestamp:', error);
      return;
    }

    setLastUpdated(data?.updated ?? null);
  };

  return (
    <Stack gap="xs">
      <AmazonSyncButton onSyncSuccess={refreshLastUpdated} />
      <Text c="dimmed" size="sm">
        Last updated: {formatLastUpdated(lastUpdated)}
      </Text>
    </Stack>
  );
}
