import { Box, Button, Image, Stack, Text } from '@mantine/core';

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
        <Stack align="center" gap={6}>
          <Image src="/Trevito_logo.svg" alt="Trévito" fit="contain" w={250} h="auto" />        
          <Text
            c="dimmed"
            size='lg'
            style={{ letterSpacing: '0.1em', textTransform: 'uppercase' }}
          >
            Sales Analytics
          </Text>
        </Stack>
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
