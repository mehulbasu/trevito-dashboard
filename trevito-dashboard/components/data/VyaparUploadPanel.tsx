'use client';

import { Button, FileInput, Stack, Text } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';

type VyaparUploadResponse = {
  message?: string;
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

export default function VyaparUploadPanel() {
  const [file, setFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);

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
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <Stack gap="xs">
      <Text fw={500}>Vyapar sales import</Text>
      <FileInput
        label="Vyapar .xls file"
        placeholder="Select .xls file"
        value={file}
        onChange={setFile}
        accept=".xls,application/vnd.ms-excel"
      />
      <Button onClick={handleUpload} loading={isUploading} w="fit-content">
        Upload Vyapar file
      </Button>
    </Stack>
  );
}
