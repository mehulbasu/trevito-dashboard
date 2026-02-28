'use client';

import { Button } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';

type AmazonSyncResponse = {
  orders_processed?: number;
  items_processed?: number;
};

type AmazonSyncButtonProps = {
  onSyncSuccess?: () => void | Promise<void>;
};

export default function AmazonSyncButton({ onSyncSuccess }: AmazonSyncButtonProps) {
  const [isSyncing, setIsSyncing] = useState(false);

  const handleSyncAmazon = async () => {
    const supabase = createClient();
    setIsSyncing(true);

    try {
      const { data, error } = await supabase.functions.invoke('amazon', {
        method: 'POST',
      });

      if (error) {
        notifications.show({
          title: 'Amazon sync failed',
          message: error.message,
          color: 'red',
          autoClose: 5000,
        });
        return;
      }

      const responseData = (data ?? {}) as AmazonSyncResponse;
      const ordersProcessed = responseData.orders_processed ?? 0;
      const itemsProcessed = responseData.items_processed ?? 0;
      const responseMessage = `${ordersProcessed} orders and ${itemsProcessed} items processed`;

      notifications.show({
        title: 'Amazon sync complete',
        message: responseMessage,
        color: 'green',
        autoClose: 5000,
      });

      await onSyncSuccess?.();
    } finally {
      setIsSyncing(false);
    }
  };

  return (
    <Button onClick={handleSyncAmazon} loading={isSyncing} w="fit-content">
      Sync Amazon
    </Button>
  );
}
