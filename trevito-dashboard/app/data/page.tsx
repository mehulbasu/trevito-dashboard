import { Container, Stack, Title } from '@mantine/core';
import ShiprocketSyncButton from '@/components/data/ShiprocketSyncButton';

export default function DataPage() {
  return (
    <Container size="lg" py="md">
      <Stack>
        <Title order={2}>Manage data</Title>
        <ShiprocketSyncButton />
      </Stack>
    </Container>
  );
}
