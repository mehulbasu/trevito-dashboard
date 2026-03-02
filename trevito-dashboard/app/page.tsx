import { Box, Button, Divider, Image, Stack, Text, Title } from '@mantine/core';

export default function Home() {
  return (
    <Box
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Stack align="center" gap="xl" style={{ width: '100%', maxWidth: 380, padding: '2rem' }}>
        <Image src="/Logo.svg" alt="Trévito" h={90} fit="contain" />
        <Stack align="center" gap={6}>
          <Title
            order={1}
            style={{
              letterSpacing: '0.18em',
              fontSize: '2.25rem',
              fontWeight: 700,
            }}
          >
            TRÉVITO
          </Title>
          <Text
            c="dimmed"
            size="sm"
            style={{ letterSpacing: '0.25em', textTransform: 'uppercase' }}
          >
            Sales Analytics
          </Text>
        </Stack>
        <Divider style={{ width: '100%' }} />
        <Stack w="100%" gap="sm">
          <Button
            component="a"
            href="/dashboard"
            size="lg"
            color="dark"
            variant="filled"
            radius="md"
            fullWidth
          >
            View Dashboard
          </Button>
          <Button
            component="a"
            href="/data"
            size="lg"
            color="dark"
            variant="light"
            radius="md"
            fullWidth
          >
            Manage Data
          </Button>
        </Stack>
      </Stack>
    </Box>
  );
}
