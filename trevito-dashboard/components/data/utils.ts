const lastUpdatedFormatter = new Intl.DateTimeFormat(undefined, {
  month: 'long',
  day: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
});

export const formatLastUpdated = (timestamp: string | null) =>
  timestamp ? lastUpdatedFormatter.format(new Date(timestamp)) : 'Never';
