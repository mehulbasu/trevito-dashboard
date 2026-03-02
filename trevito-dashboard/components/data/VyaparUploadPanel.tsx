'use client';

import { Badge, Button, Card, FileInput, Group, Stack, Text, ThemeIcon } from '@mantine/core';
import { IconFileSpreadsheet, IconUpload } from '@tabler/icons-react';
import { notifications } from '@mantine/notifications';
import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { formatLastUpdated } from '@/components/data/utils';

type VyaparUploadResponse = {
  message?: string;
};

type VyaparUploadPanelProps = {
  initialLastUpdated: string | null;
};

const toBase64 = (bytes: Uint8Array) => {
  let binary = '';
  const chunkSize = 0x8000;

  for (let index = 0; index < bytes.length; index += chunkSize) {
    const chunk = bytes.subarray(index, index + chunkSize);
    binary += String.fromCharCode(...chunk);
  }

  return btoa(binary);
};

export default function VyaparUploadPanel({ initialLastUpdated }: VyaparUploadPanelProps) {
  const [file, setFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<string | null>(initialLastUpdated);

  const refreshLastUpdated = async () => {
    const supabase = createClient();
    const { data, error } = await supabase
      .schema('sales')
      .from('last_updated')
      .select('updated')
      .eq('channel', 'vyapar')
      .maybeSingle<{ updated: string }>();

    if (error) {
      console.error('Error fetching latest Vyapar timestamp:', error);
      return;
    }

    setLastUpdated(data?.updated ?? null);
  };

  const handleUpload = async () => {
    if (!file) {
      notifications.show({
        title: 'No file selected',
        message: 'Please choose a Vyapar .xls file before uploading.',
        color: 'yellow',
        autoClose: 4000,
      });
      return;
    }

    const supabase = createClient();
    setIsUploading(true);

    try {
      const fileBytes = new Uint8Array(await file.arrayBuffer());
      const fileBase64 = toBase64(fileBytes);

      const { data, error } = await supabase.functions.invoke('vyapar', {
        method: 'POST',
        body: {
          file_name: file.name,
          mime_type: file.type || 'application/vnd.ms-excel',
          file_base64: fileBase64,
        },
      });

      if (error) {
        notifications.show({
          title: 'Vyapar upload failed',
          message: error.message,
          color: 'red',
          autoClose: 5000,
        });
        return;
      }

      const responseData = (data ?? {}) as VyaparUploadResponse;
      notifications.show({
        title: 'Vyapar file uploaded',
        message: responseData.message ?? `${file.name} sent for processing.`,
        color: 'green',
        autoClose: 5000,
      });

      await refreshLastUpdated();
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <Card withBorder shadow="sm" radius="md" padding="lg">
      <Stack gap="md">
        <Group justify="space-between">
          <Group gap="sm">
            <ThemeIcon variant="light" color="teal" size="lg" radius="md">
              <IconFileSpreadsheet size={20} />
            </ThemeIcon>
            <div>
              <Text fw={600} size="lg">Vyapar</Text>
              <Text c="dimmed" size="xs">Manual sales import</Text>
            </div>
          </Group>
          <Badge variant="light" color={lastUpdated ? 'green' : 'gray'}>
            {lastUpdated ? 'Uploaded' : 'Not uploaded'}
          </Badge>
        </Group>
        <FileInput
          placeholder="Select .xls file"
          value={file}
          onChange={setFile}
          accept=".xls,application/vnd.ms-excel"
        />
        <Group justify="space-between" align="center">
          <Text c="dimmed" size="sm">
            Last updated: {formatLastUpdated(lastUpdated)}
          </Text>
          <Button onClick={handleUpload} loading={isUploading} leftSection={<IconUpload size={16} />}>
            Upload file
          </Button>
        </Group>
      </Stack>
    </Card>
  );
}
