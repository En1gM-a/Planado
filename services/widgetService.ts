import AsyncStorage from '@react-native-async-storage/async-storage';
import { NativeModules, Platform } from 'react-native';

import { getGroupWidgetEvents, type GroupWidgetEvent } from './groupService';

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
  // V3 (native widget redesign): structured rows plus the group's accent color.
  saveGroupAndPinWidgetV3?(
    groupId: string,
    groupName: string,
    todayText: string,
    tomorrowText: string,
    snapshotDate: string,
    scheduleJson: string,
    importantJson: string,
    eventsJson: string,
    accentColor: string,
  ): Promise<boolean>;
  saveGroupWidgetDataV3?(
    groupId: string,
    groupName: string,
    todayText: string,
    tomorrowText: string,
    snapshotDate: string,
    scheduleJson: string,
    importantJson: string,
    eventsJson: string,
    accentColor: string,
  ): Promise<boolean>;
};

const nativeWidget = NativeModules.PlanadoWidget as PlanadoWidgetNativeModule | undefined;
const WIDGET_SELECTION_KEY = 'planado:selected-widget-group';
const MAX_EVENTS_PER_DAY = 6;

type WidgetSelection = { groupId: string; groupName: string; color?: string };

type WidgetSnapshot = Awaited<ReturnType<typeof widgetSnapshot>>;

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

function timeLabel(event: GroupWidgetEvent) {
  if (event.is_all_day) return 'All day';
  return new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' })
    .format(new Date(event.start_time));
}

function eventLine(event: GroupWidgetEvent, showCitRoom: boolean) {
  const room = showCitRoom ? citRoom(event) : '';
  const suffix = room ? `  ·  ${room}` : '';
  return `${timeLabel(event)}  ${event.title}${suffix}`;
}

function isHexColor(value: string | null | undefined): value is string {
  return Boolean(value && /^#[0-9a-f]{6}$/i.test(value));
}

/** Structured row for the redesigned native widget (V3). */
function widgetRow(event: GroupWidgetEvent, showCitRoom: boolean, accentColor: string | undefined) {
  const detail = showCitRoom ? citRoom(event) : event.location?.trim() ?? '';
  return {
    id: event.id,
    time: timeLabel(event),
    title: event.title,
    detail,
    color: isHexColor(event.color) ? event.color : isHexColor(accentColor) ? accentColor : '',
    allDay: event.is_all_day,
    startMs: new Date(event.start_time).getTime(),
    endMs: new Date(event.end_time).getTime(),
  };
}

async function widgetSnapshot(groupId: string, accentColor?: string) {
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
  const structuredSchedule = Object.fromEntries(Object.entries(schedule.days).map(([date, events]) => [
    date,
    events.slice(0, MAX_EVENTS_PER_DAY).map((event) => widgetRow(event, showCitRoom, accentColor)),
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
    eventsJson: JSON.stringify(structuredSchedule),
    accentColor: isHexColor(accentColor) ? accentColor : '',
  };
}

async function selectedWidget(): Promise<WidgetSelection | null> {
  const stored = await AsyncStorage.getItem(WIDGET_SELECTION_KEY);
  if (!stored) return null;
  try {
    const value = JSON.parse(stored) as Partial<WidgetSelection>;
    if (typeof value.groupId !== 'string' || typeof value.groupName !== 'string') return null;
    return {
      groupId: value.groupId,
      groupName: value.groupName,
      color: typeof value.color === 'string' ? value.color : undefined,
    };
  } catch {
    return null;
  }
}

/** Sends the snapshot through the newest bridge method the installed APK supports. */
async function saveSnapshot(
  widget: PlanadoWidgetNativeModule,
  groupId: string,
  groupName: string,
  snapshot: WidgetSnapshot,
  pin: boolean,
) {
  if (pin) {
    if (widget.saveGroupAndPinWidgetV3) {
      return widget.saveGroupAndPinWidgetV3(
        groupId,
        groupName,
        snapshot.todayText,
        snapshot.tomorrowText,
        snapshot.snapshotDate,
        snapshot.scheduleJson,
        snapshot.importantJson,
        snapshot.eventsJson,
        snapshot.accentColor,
      );
    }
    if (widget.saveGroupAndPinWidgetV2) {
      return widget.saveGroupAndPinWidgetV2(
        groupId,
        groupName,
        snapshot.todayText,
        snapshot.tomorrowText,
        snapshot.snapshotDate,
        snapshot.scheduleJson,
        snapshot.importantJson,
      );
    }
    return widget.saveGroupAndPinWidget(
      groupId,
      groupName,
      snapshot.todayText,
      snapshot.tomorrowText,
      snapshot.snapshotDate,
      snapshot.scheduleJson,
    );
  }

  if (widget.saveGroupWidgetDataV3) {
    return widget.saveGroupWidgetDataV3(
      groupId,
      groupName,
      snapshot.todayText,
      snapshot.tomorrowText,
      snapshot.snapshotDate,
      snapshot.scheduleJson,
      snapshot.importantJson,
      snapshot.eventsJson,
      snapshot.accentColor,
    );
  }
  if (widget.saveGroupWidgetDataV2) {
    return widget.saveGroupWidgetDataV2(
      groupId,
      groupName,
      snapshot.todayText,
      snapshot.tomorrowText,
      snapshot.snapshotDate,
      snapshot.scheduleJson,
      snapshot.importantJson,
    );
  }
  return widget.saveGroupWidgetData(
    groupId,
    groupName,
    snapshot.todayText,
    snapshot.tomorrowText,
    snapshot.snapshotDate,
    snapshot.scheduleJson,
  );
}

export async function makeGroupWidget(groupId: string, groupName: string, color?: string) {
  if (Platform.OS !== 'android' || !nativeWidget) {
    throw new Error('Planado home-screen widgets are currently available on Android builds only.');
  }

  const snapshot = await widgetSnapshot(groupId, color);
  const pinRequested = await saveSnapshot(nativeWidget, groupId, groupName, snapshot, true);

  await AsyncStorage.setItem(WIDGET_SELECTION_KEY, JSON.stringify({ groupId, groupName, color }));

  return { pinRequested };
}

export async function refreshSelectedWidget() {
  if (Platform.OS !== 'android' || !nativeWidget) return false;
  const selection = await selectedWidget();
  if (!selection) return false;
  const snapshot = await widgetSnapshot(selection.groupId, selection.color);
  await saveSnapshot(nativeWidget, selection.groupId, selection.groupName, snapshot, false);
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
  await AsyncStorage.setItem(
    WIDGET_SELECTION_KEY,
    JSON.stringify({ groupId, groupName, color: selection.color }),
  );
  return refreshSelectedWidget();
}
