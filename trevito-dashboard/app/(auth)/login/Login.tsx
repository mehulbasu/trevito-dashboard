// app/(auth)/login/Login.tsx
'use client';

import { useState } from 'react';
import { TextInput, Button, Paper, Title, Stack, Center } from '@mantine/core';
import { createClient } from '@supabase/supabase-js';

export function LoginComponent() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!);

  const handleLogin = async () => {
    setLoading(true);
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        shouldCreateUser: false, // Prevents creating a new user if the email doesn't exist
        emailRedirectTo: `${window.location.origin}/auth/confirm` // Redirect URL after email confirmation
      },
    });
    
    setLoading(false);
    if (error) alert(error.message);
    // TODO: Change this to a toast notification
    else alert('Check your email for the login link!');
  };

  return (
    <Center h='100vh'>
    <Stack align="center">
      <Title>Trévito Lifestyle</Title>
      <Paper withBorder shadow="md" w="420px" p={30} mt={30} radius="md">
        <TextInput 
          label="Email" 
          placeholder="username@trevitolifestyle.com" 
          required 
          value={email}
          onChange={(e) => setEmail(e.currentTarget.value)}
        />
        <Button fullWidth mt="xl" onClick={handleLogin} loading={loading}>
          Send Login Link
        </Button>
      </Paper>
    </Stack>
    </Center>
  );
}