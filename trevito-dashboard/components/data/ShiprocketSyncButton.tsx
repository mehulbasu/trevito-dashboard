'use client';

import { Button } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';

type ShiprocketSyncResponse = {
  orders_processed?: number;
  items_processed?: number;
};

type ShiprocketSyncButtonProps = {
  onSyncSuccess?: () => void | Promise<void>;
};

export default function ShiprocketSyncButton({ onSyncSuccess }: ShiprocketSyncButtonProps) {
  const [isSyncing, setIsSyncing] = useState(false);

  const handleSyncShiprocket = async () => {
    const supabase = createClient();
    setIsSyncing(true);

    try {
      const { data, error } = await supabase.functions.invoke('shiprocket', {
        method: 'POST',
      });

      if (error) {
        notifications.show({
          title: 'Shiprocket sync failed',
          message: error.message,
          color: 'red',
          autoClose: 5000,
        });
        return;
      }

      const responseData = (data ?? {}) as ShiprocketSyncResponse;
      const ordersProcessed = responseData.orders_processed ?? 0;
      const itemsProcessed = responseData.items_processed ?? 0;
      const responseMessage = `${ordersProcessed} orders and ${itemsProcessed} items processed`;

      notifications.show({
        title: 'Shiprocket sync complete',
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
    <Button onClick={handleSyncShiprocket} loading={isSyncing} w="fit-content">
      Sync shiprocket
    </Button>
  );
}
