export const formatLastUpdated = (timestamp: string | null) =>
  timestamp ? new Date(timestamp).toLocaleString() : 'Never';
