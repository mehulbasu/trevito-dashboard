import dayjs, { type Dayjs } from 'dayjs';
import {
  ALL_CHANNEL_VALUES,
  GROUP_BY_OPTIONS,
  type GroupBy,
} from '@/lib/constants';

export type Filters = {
  from: Dayjs;
  to: Dayjs;
  channels: string[];
  groupBy: GroupBy;
};

/** Parse URL search-params into typed filter values with defaults. */
export function parseFilters(sp: URLSearchParams): Filters {
  const now = dayjs();
  const fromStr = sp.get('from');
  const toStr = sp.get('to');

  const from = fromStr ? dayjs(fromStr) : now.subtract(30, 'day');
  const to = toStr ? dayjs(toStr) : now;

  const channelsParam = sp.get('channels');
  const channels: string[] = channelsParam
    ? channelsParam.split(',').filter((c) =>
        ALL_CHANNEL_VALUES.includes(c as (typeof ALL_CHANNEL_VALUES)[number]),
      )
    : [...ALL_CHANNEL_VALUES];

  const groupByParam = sp.get('groupBy') as GroupBy | null;
  const groupBy: GroupBy = GROUP_BY_OPTIONS.some((o) => o.value === groupByParam)
    ? groupByParam!
    : 'product-channel';

  return {
    from: from.startOf('day'),
    to: to.endOf('day'),
    channels,
    groupBy,
  };
}
