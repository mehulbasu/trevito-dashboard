import { Container, Stack, Title } from '@mantine/core';
import ShiprocketSyncPanel from '@/components/data/ShiprocketSyncPanel';
import AmazonSyncPanel from '@/components/data/AmazonSyncPanel';
import FlipkartSyncPanel from '@/components/data/FlipkartSyncPanel';
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

async function getAmazonLastUpdated() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .schema('sales')
    .from('last_updated')
    .select('updated')
    .eq('channel', 'amazon')
    .maybeSingle<{ updated: string }>();

  if (error) {
    console.error('Error fetching Amazon last updated timestamp:', error);
    return null;
  }

  return data?.updated ?? null;
}

async function getFlipkartLastUpdated() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .schema('sales')
    .from('last_updated')
    .select('updated')
    .eq('channel', 'flipkart')
    .maybeSingle<{ updated: string }>();

  if (error) {
    console.error('Error fetching Flipkart last updated timestamp:', error);
    return null;
  }

  return data?.updated ?? null;
}

export default async function DataPage() {
  const shiprocketLastUpdated = await getShiprocketLastUpdated();
  const amazonLastUpdated = await getAmazonLastUpdated();
  const flipkartLastUpdated = await getFlipkartLastUpdated();
  const vyaparLastUpdated = await getVyaparLastUpdated();

  return (
    <Container size="lg" py="md">
      <Stack>
        <Title order={2}>Manage data</Title>
        <ShiprocketSyncPanel initialLastUpdated={shiprocketLastUpdated} />
        <AmazonSyncPanel initialLastUpdated={amazonLastUpdated} />
        <FlipkartSyncPanel initialLastUpdated={flipkartLastUpdated} />
        <VyaparUploadPanel initialLastUpdated={vyaparLastUpdated} />
      </Stack>
    </Container>
  );
}
