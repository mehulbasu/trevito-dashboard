import { Button, Center, Stack, Title } from '@mantine/core';

export default function Home() {
  return (
    <Center h={'100vh'}>
      <Stack align="center">
        <Title>Trévito Sales Dashboard</Title>
        <Button component="a" href="/data">
          Manage data
        </Button>
      </Stack>
    </Center>
  );
}
