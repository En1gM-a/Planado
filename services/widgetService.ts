import { NativeModules, Platform } from 'react-native';

import { getGroupWidgetEvents } from './groupService';

type PlanadoWidgetNativeModule = {
  saveGroupAndPinWidget(
    groupId: string,
    groupName: string,
    todayText: string,
    tomorrowText: string,
  ): Promise<boolean>;
};

const nativeWidget = NativeModules.PlanadoWidget as PlanadoWidgetNativeModule | undefined;

function citRoom(event: { description: string | null; location: string | null }) {
  if (event.location?.trim()) return `Room ${event.location.trim()}`;
  const roomLine = event.description?.match(/^Room:\s*(.+)$/im)?.[1]?.trim();
  return roomLine ? `Room ${roomLine}` : '';
}

function eventLine(
  event: {
    title: string;
    description: string | null;
    location: string | null;
    start_time: string;
    is_all_day: boolean;
  },
  showCitRoom: boolean,
) {
  const room = showCitRoom ? citRoom(event) : '';
  const suffix = room ? `  ·  ${room}` : '';
  if (event.is_all_day) return `All day  ${event.title}${suffix}`;
  const time = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' })
    .format(new Date(event.start_time));
  return `${time}  ${event.title}${suffix}`;
}

export async function makeGroupWidget(groupId: string, groupName: string) {
  if (Platform.OS !== 'android' || !nativeWidget) {
    throw new Error('Planado home-screen widgets are currently available on Android builds only.');
  }

  const schedule = await getGroupWidgetEvents(groupId);
  const showCitRoom = schedule.groupType === 'cit_u_classmates';
  const todayText = schedule.today.length
    ? schedule.today.slice(0, 4).map((event) => eventLine(event, showCitRoom)).join('\n')
    : 'Nothing planned today';
  const tomorrowText = schedule.tomorrow.length
    ? schedule.tomorrow.slice(0, 4).map((event) => eventLine(event, showCitRoom)).join('\n')
    : 'Nothing planned tomorrow';

  const pinRequested = await nativeWidget.saveGroupAndPinWidget(
    groupId,
    groupName,
    todayText,
    tomorrowText,
  );

  return { pinRequested };
}
