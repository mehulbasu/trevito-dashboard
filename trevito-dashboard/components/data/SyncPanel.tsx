'use client';

import { Badge, Card, Group, Stack, Text, ThemeIcon } from '@mantine/core';
import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import SyncButton from '@/components/data/SyncButton';
import { formatLastUpdated } from '@/components/data/utils';

type SyncPanelProps = {
  title: string;
  subtitle: string;
  icon: React.ReactNode;
  iconColor: string;
  channelKey: string;
  functionName: string;
  initialLastUpdated: string | null;
};

export default function SyncPanel({
  title,
  subtitle,
  icon,
  iconColor,
  channelKey,
  functionName,
  initialLastUpdated,
}: SyncPanelProps) {
  const [lastUpdated, setLastUpdated] = useState<string | null>(initialLastUpdated);

  const refreshLastUpdated = async () => {
    const supabase = createClient();
    const { data, error } = await supabase
      .schema('sales')
      .from('last_updated')
      .select('updated')
      .eq('channel', channelKey)
      .maybeSingle<{ updated: string }>();

    if (error) {
      console.error(`Error fetching latest ${title} timestamp:`, error);
      return;
    }

    setLastUpdated(data?.updated ?? null);
  };

  return (
    <Card withBorder shadow="sm" radius="md" padding="lg">
      <Stack gap="md">
        <Group justify="space-between">
          <Group gap="sm">
            <ThemeIcon variant="light" color={iconColor} size="lg" radius="md">
              {icon}
            </ThemeIcon>
            <div>
              <Text fw={600} size="lg">{title}</Text>
              <Text c="dimmed" size="xs">{subtitle}</Text>
            </div>
          </Group>
          <Badge variant="light" color={lastUpdated ? 'green' : 'gray'}>
            {lastUpdated ? 'Synced' : 'Not synced'}
          </Badge>
        </Group>
        <Group justify="space-between" align="center">
          <Text c="dimmed" size="sm">
            Last updated: {formatLastUpdated(lastUpdated)}
          </Text>
          <SyncButton
            functionName={functionName}
            channelName={title}
            onSyncSuccess={refreshLastUpdated}
          />
        </Group>
      </Stack>
    </Card>
  );
}
