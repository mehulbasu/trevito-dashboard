// app/(auth)/login/Login.tsx
'use client';

import { useState, useEffect, useRef } from 'react';
import { TextInput, Button, Paper, Stack, Center, Text } from '@mantine/core';
import { createClient } from '@/lib/supabase/client';

const RETRY_DELAY = 60;

export function LoginComponent() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [countdown, setCountdown] = useState(RETRY_DELAY);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const supabase = createClient();

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const error = params.get('error');
    if (error) {
      alert('Error: ' + error);
      // Clear the error from URL
      window.history.replaceState({}, '', '/login');
    }
  }, []);

  useEffect(() => {
    if (sent) {
      setCountdown(RETRY_DELAY);
      intervalRef.current = setInterval(() => {
        setCountdown((prev) => {
          if (prev <= 1) {
            clearInterval(intervalRef.current!);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [sent]);

  const handleLogin = async () => {
    setLoading(true);
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        shouldCreateUser: false,
        emailRedirectTo: `${window.location.origin}/confirm`,
      },
    });

    setLoading(false);
    if (error) {
      if (error.message.toLowerCase().includes('signups not allowed')) {
        alert('Invite-only access: Please contact the administrator to receive an invite.');
      } else {
        alert(error.message);
      }
    } else {
      setSent(true);
    }
  };

  const handleRetry = () => {
    setSent(false);
    setCountdown(RETRY_DELAY);
  };

  return (
    <Center h="100vh">
      <Stack align="center" gap="xl" style={{ width: '100%', maxWidth: 500, padding: '2rem' }}>
        <Stack align="center" gap={6}>
          <Text size="2rem" fw={700}>
            TRÉVITO
          </Text>
          <Text
            c="dimmed"
            size="sm"
            style={{ letterSpacing: '0.1em', textTransform: 'uppercase' }}
          >
            Sales Analytics
          </Text>
        </Stack>
        <Paper withBorder shadow="md" w="100%" p={30} radius="md">
          {sent ? (
            <Stack gap="md">
              <Text ta="center" fw={500}>
                Please check your email for the login link.
              </Text>
              <Stack gap={5} align="center">
                {countdown > 0 && (
                  <Text size="xs" mb="sm" c="dimmed">
                    Retry available in {countdown}s
                  </Text>
                )}
                <Button
                  fullWidth
                  variant="light"
                  color="dark"
                  onClick={handleRetry}
                  disabled={countdown > 0}
                >
                  Retry
                </Button>
              </Stack>
            </Stack>
          ) : (
            <Stack gap={0}>
              <TextInput
                label="Email"
                placeholder="username@trevitolifestyle.com"
                required
                value={email}
                size="md"
                labelProps={{ mb: 'sm' }}
                onChange={(e) => setEmail(e.currentTarget.value)}
                onKeyDown={(e) => e.key === 'Enter' && !loading && handleLogin()}
              />
              <Button fullWidth size="md" color="dark" mt="xl" onClick={handleLogin} loading={loading}>
                Send Login Link
              </Button>
            </Stack>
          )}
        </Paper>
      </Stack>
    </Center>
  );
}