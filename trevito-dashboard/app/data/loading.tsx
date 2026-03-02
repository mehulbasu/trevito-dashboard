import { Card, Container, Group, Skeleton, Stack } from '@mantine/core';

export default function DataLoading() {
  return (
    <Container size="sm" py="xl">
      <Stack gap="lg">
        <Group>
          <Skeleton circle height={34} width={34} />
          <Stack gap={4}>
            <Skeleton height={28} width={180} />
            <Skeleton height={14} width={260} />
          </Stack>
        </Group>
        {Array.from({ length: 4 }).map((_, i) => (
          <Card key={i} withBorder shadow="sm" radius="md" padding="lg">
            <Stack gap="md">
              <Group justify="space-between">
                <Group gap="sm">
                  <Skeleton height={38} width={38} radius="md" />
                  <Stack gap={4}>
                    <Skeleton height={20} width={100} />
                    <Skeleton height={12} width={140} />
                  </Stack>
                </Group>
                <Skeleton height={22} width={70} radius="xl" />
              </Group>
              <Group justify="space-between">
                <Skeleton height={14} width={200} />
                <Skeleton height={36} width={100} radius="md" />
              </Group>
            </Stack>
          </Card>
        ))}
      </Stack>
    </Container>
  );
}
