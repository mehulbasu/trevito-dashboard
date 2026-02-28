'use client';

import { Button } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';

type FlipkartSyncResponse = {
  orders_processed?: number;
  items_processed?: number;
  geo_enrich_triggered?: boolean;
  geo_enrich_error?: string | null;
};

type FlipkartSyncButtonProps = {
  onSyncSuccess?: () => void | Promise<void>;
};

export default function FlipkartSyncButton({ onSyncSuccess }: FlipkartSyncButtonProps) {
  const [isSyncing, setIsSyncing] = useState(false);

  const handleSyncFlipkart = async () => {
    const supabase = createClient();
    setIsSyncing(true);

    try {
      const { data, error } = await supabase.functions.invoke('flipkart', {
        method: 'POST',
      });

      if (error) {
        notifications.show({
          title: 'Flipkart sync failed',
          message: error.message,
          color: 'red',
          autoClose: 5000,
        });
        return;
      }

      const responseData = (data ?? {}) as FlipkartSyncResponse;
      const ordersProcessed = responseData.orders_processed ?? 0;
      const itemsProcessed = responseData.items_processed ?? 0;
      const responseMessage = `${ordersProcessed} orders and ${itemsProcessed} items processed`;

      notifications.show({
        title: 'Flipkart sync complete',
        message: responseMessage,
        color: 'green',
        autoClose: 5000,
      });

      if (responseData.geo_enrich_error) {
        notifications.show({
          title: 'Geo enrichment warning',
          message: responseData.geo_enrich_error,
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
    <Button onClick={handleSyncFlipkart} loading={isSyncing} w="fit-content">
      Sync Flipkart
    </Button>
  );
}
