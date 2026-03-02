'use client';

import { Button } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { IconRefresh } from '@tabler/icons-react';

type SyncResponse = {
  orders_processed?: number;
  items_processed?: number;
  geo_enrich_error?: string | null;
};

type SyncButtonProps = {
  functionName: string;
  channelName: string;
  onSyncSuccess?: () => void | Promise<void>;
};

export default function SyncButton({ functionName, channelName, onSyncSuccess }: SyncButtonProps) {
  const [isSyncing, setIsSyncing] = useState(false);

  const handleSync = async () => {
    const supabase = createClient();
    setIsSyncing(true);

    try {
      const { data, error } = await supabase.functions.invoke(functionName, {
        method: 'POST',
      });

      if (error) {
        notifications.show({
          title: `${channelName} sync failed`,
          message: error.message,
          color: 'red',
          autoClose: 5000,
        });
        return;
      }

      const response = (data ?? {}) as SyncResponse;
      const ordersProcessed = response.orders_processed ?? 0;
      const itemsProcessed = response.items_processed ?? 0;

      notifications.show({
        title: `${channelName} sync complete`,
        message: `${ordersProcessed} orders and ${itemsProcessed} items processed`,
        color: 'green',
        autoClose: 5000,
      });

      if (response.geo_enrich_error) {
        notifications.show({
          title: 'Geo enrichment warning',
          message: response.geo_enrich_error,
          color: 'yellow',
          autoClose: 7000,
        });
      }

      await onSyncSuccess?.();
    } finally {
      setIsSyncing(false);
    }
  };

  return (
    <Button onClick={handleSync} loading={isSyncing} leftSection={<IconRefresh size={16} />} color="dark" radius="md">
      Sync
    </Button>
  );
}
