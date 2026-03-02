import { ActionIcon, Container, Group, Stack, Text, Title } from '@mantine/core';
import { IconArrowLeft, IconBrandAmazon, IconShoppingCart, IconTruck } from '@tabler/icons-react';
import SyncPanel from '@/components/data/SyncPanel';
import VyaparUploadPanel from '@/components/data/VyaparUploadPanel';
import { createClient } from '@/lib/supabase/server';

type LastUpdatedRow = { channel: string; updated: string };

async function getAllLastUpdated(): Promise<Record<string, string>> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .schema('sales')
    .from('last_updated')
    .select('channel, updated');

  if (error) {
    console.error('Error fetching last_updated:', error);
    return {};
  }

  return Object.fromEntries(
    (data as LastUpdatedRow[]).map(({ channel, updated }) => [channel, updated])
  );
}

export default async function DataPage() {
  const lastUpdated = await getAllLastUpdated();

  return (
    <Container size="sm" py="xl">
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
            <Title order={2}>Manage data</Title>
            <Text c="dimmed" size="sm">Sync and import your sales data sources</Text>
          </div>
        </Group>
        <SyncPanel
          title="Shopify"
          subtitle="Shipping data from Shiprocket"
          icon={<IconTruck size={20} />}
          iconColor="indigo"
          channelKey="shiprocket"
          functionName="shiprocket"
          initialLastUpdated={lastUpdated.shiprocket ?? null}
        />
        <SyncPanel
          title="Amazon"
          subtitle="Marketplace orders"
          icon={<IconBrandAmazon size={20} />}
          iconColor="orange"
          channelKey="amazon"
          functionName="amazon"
          initialLastUpdated={lastUpdated.amazon ?? null}
        />
        <SyncPanel
          title="Flipkart"
          subtitle="Marketplace orders"
          icon={<IconShoppingCart size={20} />}
          iconColor="blue"
          channelKey="flipkart"
          functionName="flipkart"
          initialLastUpdated={lastUpdated.flipkart ?? null}
        />
        <VyaparUploadPanel initialLastUpdated={lastUpdated.vyapar ?? null} />
      </Stack>
    </Container>
  );
}
