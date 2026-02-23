import { Container, Stack, Title } from '@mantine/core';
import ShiprocketSyncPanel from '@/components/data/ShiprocketSyncPanel';
import VyaparUploadPanel from '@/components/data/VyaparUploadPanel';
import { createClient } from '@/lib/supabase/server';

async function getShiprocketLastUpdated() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .schema('sales')
    .from('last_updated')
    .select('updated')
    .eq('channel', 'shiprocket')
    .maybeSingle<{ updated: string }>();

  if (error) {
    console.error('Error fetching Shiprocket last updated timestamp:', error);
    return null;
  }

  return data?.updated ?? null;
}

async function getVyaparLastUpdated() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .schema('sales')
    .from('last_updated')
    .select('updated')
    .eq('channel', 'vyapar')
    .maybeSingle<{ updated: string }>();

  if (error) {
    console.error('Error fetching Vyapar last updated timestamp:', error);
    return null;
  }

  return data?.updated ?? null;
}

export default async function DataPage() {
  const shiprocketLastUpdated = await getShiprocketLastUpdated();
  const vyaparLastUpdated = await getVyaparLastUpdated();

  return (
    <Container size="lg" py="md">
      <Stack>
        <Title order={2}>Manage data</Title>
        <ShiprocketSyncPanel initialLastUpdated={shiprocketLastUpdated} />
        <VyaparUploadPanel initialLastUpdated={vyaparLastUpdated} />
      </Stack>
    </Container>
  );
}
