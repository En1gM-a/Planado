import AsyncStorage from '@react-native-async-storage/async-storage';
import { NativeModules, Platform } from 'react-native';

import { getGroupWidgetEvents } from './groupService';

type PlanadoWidgetNativeModule = {
  saveGroupAndPinWidget(
    groupId: string,
    groupName: string,
    todayText: string,
    tomorrowText: string,
    snapshotDate: string,
    scheduleJson: string,
  ): Promise<boolean>;
  saveGroupWidgetData(
    groupId: string,
    groupName: string,
    todayText: string,
    tomorrowText: string,
    snapshotDate: string,
    scheduleJson: string,
  ): Promise<boolean>;
  saveGroupAndPinWidgetV2?(
    groupId: string,
    groupName: string,
    todayText: string,
    tomorrowText: string,
    snapshotDate: string,
    scheduleJson: string,
    importantJson: string,
  ): Promise<boolean>;
  saveGroupWidgetDataV2?(
    groupId: string,
    groupName: string,
    todayText: string,
    tomorrowText: string,
    snapshotDate: string,
    scheduleJson: string,
    importantJson: string,
  ): Promise<boolean>;
};

const nativeWidget = NativeModules.PlanadoWidget as PlanadoWidgetNativeModule | undefined;
const WIDGET_SELECTION_KEY = 'planado:selected-widget-group';

type WidgetSelection = { groupId: string; groupName: string };

function localDateKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

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

async function widgetSnapshot(groupId: string) {
  const schedule = await getGroupWidgetEvents(groupId);
  const showCitRoom = schedule.groupType === 'cit_u_classmates';
  const todayText = schedule.today.length
    ? schedule.today.slice(0, 4).map((event) => eventLine(event, showCitRoom)).join('\n')
    : showCitRoom ? 'No classes scheduled today' : 'Nothing planned today';
  const tomorrowText = schedule.tomorrow.length
    ? schedule.tomorrow.slice(0, 4).map((event) => eventLine(event, showCitRoom)).join('\n')
    : showCitRoom ? 'No classes scheduled tomorrow' : 'Nothing planned tomorrow';
  const datedSchedule = Object.fromEntries(Object.entries(schedule.days).map(([date, events]) => [
    date,
    events.length
      ? events.slice(0, 4).map((event) => eventLine(event, showCitRoom)).join('\n')
      : showCitRoom ? 'No classes scheduled' : 'Nothing planned',
  ]));
  return {
    todayText,
    tomorrowText,
    snapshotDate: localDateKey(),
    scheduleJson: JSON.stringify(datedSchedule),
    importantJson: JSON.stringify(schedule.important.map((event) => ({
      title: event.title,
      startMs: new Date(event.start_time).getTime(),
      endMs: new Date(event.end_time).getTime(),
    }))),
  };
}

async function selectedWidget(): Promise<WidgetSelection | null> {
  const stored = await AsyncStorage.getItem(WIDGET_SELECTION_KEY);
  if (!stored) return null;
  try {
    const value = JSON.parse(stored) as Partial<WidgetSelection>;
    if (typeof value.groupId !== 'string' || typeof value.groupName !== 'string') return null;
    return { groupId: value.groupId, groupName: value.groupName };
  } catch {
    return null;
  }
}

export async function makeGroupWidget(groupId: string, groupName: string) {
  if (Platform.OS !== 'android' || !nativeWidget) {
    throw new Error('Planado home-screen widgets are currently available on Android builds only.');
  }

  const snapshot = await widgetSnapshot(groupId);

  const pinRequested = nativeWidget.saveGroupAndPinWidgetV2
    ? await nativeWidget.saveGroupAndPinWidgetV2(
        groupId,
        groupName,
        snapshot.todayText,
        snapshot.tomorrowText,
        snapshot.snapshotDate,
        snapshot.scheduleJson,
        snapshot.importantJson,
      )
    : await nativeWidget.saveGroupAndPinWidget(
        groupId,
        groupName,
        snapshot.todayText,
        snapshot.tomorrowText,
        snapshot.snapshotDate,
        snapshot.scheduleJson,
      );

  await AsyncStorage.setItem(WIDGET_SELECTION_KEY, JSON.stringify({ groupId, groupName }));

  return { pinRequested };
}

export async function refreshSelectedWidget() {
  if (Platform.OS !== 'android' || !nativeWidget) return false;
  const selection = await selectedWidget();
  if (!selection) return false;
  const snapshot = await widgetSnapshot(selection.groupId);
  if (nativeWidget.saveGroupWidgetDataV2) {
    await nativeWidget.saveGroupWidgetDataV2(
      selection.groupId,
      selection.groupName,
      snapshot.todayText,
      snapshot.tomorrowText,
      snapshot.snapshotDate,
      snapshot.scheduleJson,
      snapshot.importantJson,
    );
  } else {
    await nativeWidget.saveGroupWidgetData(
      selection.groupId,
      selection.groupName,
      snapshot.todayText,
      snapshot.tomorrowText,
      snapshot.snapshotDate,
      snapshot.scheduleJson,
    );
  }
  return true;
}

export async function refreshGroupWidgetIfSelected(groupId: string) {
  if (Platform.OS !== 'android' || !nativeWidget) return false;
  const selection = await selectedWidget();
  if (!selection || selection.groupId !== groupId) return false;
  return refreshSelectedWidget();
}

export async function syncSelectedWidgetGroupName(groupId: string, groupName: string) {
  if (Platform.OS !== 'android' || !nativeWidget) return false;
  const selection = await selectedWidget();
  if (!selection || selection.groupId !== groupId) return false;
  await AsyncStorage.setItem(WIDGET_SELECTION_KEY, JSON.stringify({ groupId, groupName }));
  return refreshSelectedWidget();
}
