'use client';

import { Button } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';

type ShiprocketSyncResponse = {
    orders_processed: number;
    items_processed: number;
};

export default function ShiprocketSyncButton() {
  const [isSyncing, setIsSyncing] = useState(false);

  const handleSyncShiprocket = async () => {
    const supabase = createClient();
    setIsSyncing(true);

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
      setIsSyncing(false);
      return;
    }

    // Parse response data for orders and items processed
    const responseData = data as ShiprocketSyncResponse;
    const responseMessage = `${responseData.orders_processed} orders and ${responseData.items_processed} items processed`;

    notifications.show({
      title: 'Shiprocket sync complete',
      message: responseMessage,
      color: 'green',
      autoClose: 5000,
    });

    setIsSyncing(false);
  };

  return (
    <Button onClick={handleSyncShiprocket} loading={isSyncing} w="fit-content">
      Sync shiprocket
    </Button>
  );
}
