import { Container, Group, Skeleton, Stack } from '@mantine/core';

export default function DashboardLoading() {
  return (
    <Container size="xl" py="xl">
      <Stack gap="lg">
        {/* Header */}
        <Group>
          <Skeleton circle height={34} width={34} />
          <Stack gap={4}>
            <Skeleton height={28} width={200} />
            <Skeleton height={14} width={280} />
          </Stack>
        </Group>

        {/* Filter bar */}
        <Group gap="sm">
          <Skeleton height={56} width={260} radius="sm" />
          <Skeleton height={56} width={220} radius="sm" />
          <Skeleton height={56} width={180} radius="sm" />
        </Group>

        {/* Table */}
        <Stack gap={0}>
          <Skeleton height={40} radius={0} />
          {Array.from({ length: 10 }).map((_, i) => (
            <Skeleton key={i} height={36} radius={0} mt={2} />
          ))}
        </Stack>
      </Stack>
    </Container>
  );
}
