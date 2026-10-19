import Ionicons from '@expo/vector-icons/Ionicons';
import { type ComponentProps, useEffect, useState, type ReactNode } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type AlertButton,
  type AlertOptions,
} from 'react-native';

import { COLORS } from '../theme/colors';
import { ON_PRIMARY, RADIUS, SHADOW, TYPE } from '../theme/tokens';
import { ModalCard } from './ui/motion';
import { PressableScale } from './ui/PressableScale';

type IconName = ComponentProps<typeof Ionicons>['name'];

/** A React Native alert button, plus an optional icon and supporting line for menus. */
export type PlanadoAlertButton = AlertButton & {
  icon?: IconName;
  description?: string;
};

type DialogRequest = {
  title: string;
  message?: string;
  buttons: PlanadoAlertButton[];
  options?: AlertOptions;
};

type DialogListener = (request: DialogRequest) => void;

const listeners = new Set<DialogListener>();

export const PlanadoAlert = {
  alert(
    title: string,
    message?: string,
    buttons?: PlanadoAlertButton[],
    options?: AlertOptions,
  ) {
    const request: DialogRequest = {
      title,
      message,
      buttons: buttons?.length ? buttons : [{ text: 'Got it' }],
      options,
    };

    listeners.forEach((listener) => listener(request));
  },
};

/** Fallback icons for buttons that do not name one, matched on their label. */
const ICON_RULES: [RegExp, IconName][] = [
  [/edit|rename/i, 'create-outline'],
  [/invite/i, 'person-add-outline'],
  [/calendar/i, 'calendar-outline'],
  [/remove imported|delete/i, 'trash-outline'],
  [/remove/i, 'person-remove-outline'],
  [/sign out|log out/i, 'log-out-outline'],
  [/leave/i, 'exit-outline'],
  [/make admin/i, 'shield-checkmark-outline'],
  [/member|role/i, 'person-outline'],
  [/deactivate/i, 'close-circle-outline'],
  [/share/i, 'share-social-outline'],
  [/copy/i, 'copy-outline'],
  [/keep/i, 'archive-outline'],
  [/view|open/i, 'open-outline'],
];

function iconFor(button: PlanadoAlertButton): IconName | null {
  if (button.icon) return button.icon;
  const label = button.text ?? '';
  return ICON_RULES.find(([pattern]) => pattern.test(label))?.[1] ?? null;
}

function dialogTone(request: DialogRequest) {
  const text = `${request.title} ${request.message ?? ''}`.toLowerCase();
  const destructive = request.buttons.some((button) => button.style === 'destructive');

  if (request.buttons.length > 2 || /choose|options|role|action/.test(text)) {
    return { icon: 'options-outline' as const, color: COLORS.primary, soft: COLORS.primarySoft };
  }
  if (destructive || /delete|remove|leave|deactivate|sign out/.test(text)) {
    return { icon: 'warning-outline' as const, color: COLORS.red, soft: COLORS.redSoft };
  }
  if (/could not|failed|error|unavailable/.test(text)) {
    return { icon: 'alert-circle-outline' as const, color: COLORS.red, soft: COLORS.redSoft };
  }
  if (/created|joined|success|ready|imported|synced|saved|updated|connected/.test(text)) {
    return { icon: 'checkmark-circle-outline' as const, color: COLORS.green, soft: COLORS.greenSoft };
  }
  return { icon: 'sparkles-outline' as const, color: COLORS.primary, soft: COLORS.primarySoft };
}

export function PlanadoAlertProvider({ children }: { children: ReactNode }) {
  const [request, setRequest] = useState<DialogRequest | null>(null);

  useEffect(() => {
    const listener: DialogListener = (nextRequest) => setRequest(nextRequest);
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }, []);

  function dismiss(invokeDismiss = true) {
    const onDismiss = request?.options?.onDismiss;
    setRequest(null);
    if (invokeDismiss) onDismiss?.();
  }

  function choose(button: AlertButton) {
    setRequest(null);
    setTimeout(() => button.onPress?.(), 160);
  }

  const tone = request ? dialogTone(request) : null;
  const isMenu = (request?.buttons.length ?? 0) > 2;
  // Long labels ("Delete permanently") stack full width: action on top, Cancel below.
  const vertical = Boolean(request?.buttons.some((button) => (button.text ?? '').length > 13));
  const dialogButtons = request
    ? vertical
      ? [...request.buttons.filter((button) => button.style !== 'cancel'), ...request.buttons.filter((button) => button.style === 'cancel')]
      : request.buttons
    : [];
  const cancelable = request?.options?.cancelable !== false;

  return (
    <>
      {children}
      <Modal
        animationType="fade"
        onRequestClose={() => {
          if (cancelable) dismiss();
        }}
        statusBarTranslucent
        transparent
        visible={Boolean(request)}
      >
        <View style={styles.overlay}>
          <Pressable
            accessibilityLabel="Close dialog"
            onPress={() => {
              if (cancelable) dismiss();
            }}
            style={StyleSheet.absoluteFill}
          />

          {request && tone ? (
            <ModalCard style={styles.card}>
              <View style={styles.header}>
                <View style={[styles.iconWrap, { backgroundColor: tone.soft }]}>
                  <Ionicons color={tone.color} name={tone.icon} size={24} />
                </View>
                <View style={styles.headerCopy}>
                  <Text accessibilityRole="header" style={styles.title}>{request.title}</Text>
                  {isMenu && request.message ? (
                    <Text numberOfLines={2} style={styles.subtitle}>{request.message}</Text>
                  ) : null}
                </View>
                {cancelable ? (
                  <PressableScale
                    accessibilityLabel="Close"
                    hitSlop={6}
                    onPress={() => dismiss()}
                    scaleTo={0.9}
                    style={styles.closeButton}
                  >
                    <Ionicons color={COLORS.ink} name="close" size={20} />
                  </PressableScale>
                ) : null}
              </View>

              {!isMenu && request.message ? (
                <ScrollView
                  bounces={false}
                  contentContainerStyle={styles.messageContent}
                  showsVerticalScrollIndicator={false}
                  style={styles.messageScroll}
                >
                  <Text style={styles.message}>{request.message}</Text>
                </ScrollView>
              ) : null}

              {isMenu ? (
                <ActionMenu buttons={request.buttons} onChoose={choose} />
              ) : (
                <View style={[styles.actions, vertical && styles.actionsVertical]}>
                  {dialogButtons.map((button, index) => (
                    <DialogButton
                      button={button}
                      fill={!vertical}
                      key={`${button.text ?? 'Button'}-${index}`}
                      onPress={() => choose(button)}
                    />
                  ))}
                </View>
              )}
            </ModalCard>
          ) : null}
        </View>
      </Modal>
    </>
  );
}

/** Action-sheet layout: regular choices, then destructive ones apart, then Cancel. */
function ActionMenu({
  buttons,
  onChoose,
}: {
  buttons: PlanadoAlertButton[];
  onChoose: (button: AlertButton) => void;
}) {
  const regular = buttons.filter((button) => button.style !== 'cancel' && button.style !== 'destructive');
  const destructive = buttons.filter((button) => button.style === 'destructive');
  const cancel = buttons.filter((button) => button.style === 'cancel');

  return (
    <View style={styles.menu}>
      {regular.length ? (
        <View style={styles.menuGroup}>
          {regular.map((button, index) => (
            <MenuRow
              button={button}
              divided={index > 0}
              key={`${button.text ?? 'Option'}-${index}`}
              onPress={() => onChoose(button)}
            />
          ))}
        </View>
      ) : null}
      {destructive.length ? (
        <View style={[styles.menuGroup, styles.menuGroupDanger]}>
          {destructive.map((button, index) => (
            <MenuRow
              button={button}
              destructive
              divided={index > 0}
              key={`${button.text ?? 'Danger'}-${index}`}
              onPress={() => onChoose(button)}
            />
          ))}
        </View>
      ) : null}
      {cancel.map((button, index) => (
        <DialogButton button={button} key={`${button.text ?? 'Cancel'}-${index}`} onPress={() => onChoose(button)} />
      ))}
    </View>
  );
}

function MenuRow({
  button,
  destructive,
  divided,
  onPress,
}: {
  button: PlanadoAlertButton;
  destructive?: boolean;
  divided?: boolean;
  onPress: () => void;
}) {
  const icon = iconFor(button) ?? (destructive ? 'trash-outline' : 'ellipse-outline');
  const label = button.text ?? 'OK';

  return (
    <Pressable
      accessibilityHint={button.description}
      accessibilityLabel={label}
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.menuRow, divided && styles.menuRowDivided, pressed && styles.menuRowPressed]}
    >
      <View style={[styles.menuIcon, destructive && styles.menuIconDanger]}>
        <Ionicons color={destructive ? COLORS.red : COLORS.primary} name={icon} size={20} />
      </View>
      <View style={styles.menuCopy}>
        <Text numberOfLines={1} style={[styles.menuLabel, destructive && styles.menuLabelDanger]}>{label}</Text>
        {button.description ? (
          <Text numberOfLines={1} style={styles.menuDescription}>{button.description}</Text>
        ) : null}
      </View>
      {!destructive ? <Ionicons color={COLORS.muted} name="chevron-forward" size={18} /> : null}
    </Pressable>
  );
}

function DialogButton({
  button,
  fill,
  onPress,
}: {
  button: PlanadoAlertButton;
  fill?: boolean;
  onPress: () => void;
}) {
  const cancel = button.style === 'cancel';
  const destructive = button.style === 'destructive';
  const icon = cancel ? null : iconFor(button);
  const foreground = cancel ? COLORS.ink : ON_PRIMARY;

  return (
    <PressableScale
      accessibilityLabel={button.text ?? 'OK'}
      onPress={onPress}
      scaleTo={0.96}
      style={[styles.actionButton, fill && styles.actionButtonFill, cancel && styles.cancelButton, destructive && styles.destructiveButton]}
    >
      {icon ? <Ionicons color={foreground} name={icon} size={18} /> : null}
      <Text numberOfLines={1} style={[styles.actionText, { color: foreground }]}>
        {button.text ?? 'OK'}
      </Text>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    paddingHorizontal: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(8, 8, 18, 0.62)',
  },
  card: {
    width: '100%',
    maxWidth: 410,
    maxHeight: '86%',
    padding: 20,
    borderWidth: 1,
    borderColor: COLORS.line,
    borderRadius: RADIUS.xxl,
    backgroundColor: COLORS.surface,
    boxShadow: SHADOW.lg,
  },
  header: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  iconWrap: {
    width: 52,
    height: 52,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: RADIUS.lg,
  },
  headerCopy: { flex: 1 },
  title: { ...TYPE.title3, color: COLORS.ink, fontWeight: '800' },
  subtitle: { ...TYPE.subhead, marginTop: 2, color: COLORS.muted, fontWeight: '400' },
  closeButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 22,
    backgroundColor: COLORS.elevatedStrong,
  },
  messageScroll: { maxHeight: 280 },
  messageContent: { paddingTop: 14 },
  message: { ...TYPE.body, color: COLORS.muted },
  actions: { marginTop: 22, flexDirection: 'row', gap: 10 },
  actionsVertical: { flexDirection: 'column' },
  actionButton: {
    minHeight: 52,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: RADIUS.md,
    backgroundColor: COLORS.primary,
  },
  actionButtonFill: { flex: 1 },
  cancelButton: {
    borderWidth: 1.5,
    borderColor: COLORS.line,
    backgroundColor: COLORS.surface,
  },
  destructiveButton: { backgroundColor: COLORS.red },
  actionText: { ...TYPE.bodyStrong, fontWeight: '700' },
  menu: { marginTop: 18, gap: 10 },
  menuGroup: {
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: COLORS.line,
    borderRadius: RADIUS.lg,
    backgroundColor: COLORS.elevated,
  },
  menuGroupDanger: { borderColor: COLORS.redSoft },
  menuRow: { minHeight: 60, paddingHorizontal: 14, paddingVertical: 10, flexDirection: 'row', alignItems: 'center', gap: 12 },
  menuRowDivided: { borderTopWidth: 1, borderTopColor: COLORS.line },
  menuRowPressed: { backgroundColor: COLORS.elevatedStrong },
  menuIcon: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center', borderRadius: RADIUS.sm, backgroundColor: COLORS.primarySoft },
  menuIconDanger: { backgroundColor: COLORS.redSoft },
  menuCopy: { flex: 1 },
  menuLabel: { ...TYPE.bodyStrong, color: COLORS.ink, fontWeight: '700' },
  menuLabelDanger: { color: COLORS.red },
  menuDescription: { ...TYPE.footnote, marginTop: 1, color: COLORS.muted },
});
