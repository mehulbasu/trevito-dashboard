'use client';

import { Stack, Text } from '@mantine/core';
import { useState } from 'react';
import ShiprocketSyncButton from '@/components/data/ShiprocketSyncButton';
import { createClient } from '@/lib/supabase/client';

type ShiprocketSyncPanelProps = {
  initialLastUpdated: string | null;
};

const formatLastUpdated = (timestamp: string | null) =>
  timestamp ? new Date(timestamp).toLocaleString() : 'Not synced yet';

export default function ShiprocketSyncPanel({ initialLastUpdated }: ShiprocketSyncPanelProps) {
  const [lastUpdated, setLastUpdated] = useState<string | null>(initialLastUpdated);

  const refreshLastUpdated = async () => {
    const supabase = createClient();
    const { data, error } = await supabase
      .schema('sales')
      .from('last_updated')
      .select('updated')
      .eq('channel', 'shiprocket')
      .maybeSingle<{ updated: string }>();

    if (error) {
      console.error('Error fetching latest Shiprocket timestamp:', error);
      return;
    }

    setLastUpdated(data?.updated ?? null);
  };

  return (
    <Stack gap="xs">
      <ShiprocketSyncButton onSyncSuccess={refreshLastUpdated} />
      <Text c="dimmed" size="sm">
        Last updated: {formatLastUpdated(lastUpdated)}
      </Text>
    </Stack>
  );
}
