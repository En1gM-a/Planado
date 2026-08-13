import Ionicons from '@expo/vector-icons/Ionicons';
import { useEffect, useState, type ReactNode } from 'react';
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

type DialogRequest = {
  title: string;
  message?: string;
  buttons: AlertButton[];
  options?: AlertOptions;
};

type DialogListener = (request: DialogRequest) => void;

const listeners = new Set<DialogListener>();

export const PlanadoAlert = {
  alert(
    title: string,
    message?: string,
    buttons?: AlertButton[],
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

function dialogTone(request: DialogRequest) {
  const text = `${request.title} ${request.message ?? ''}`.toLowerCase();
  const destructive = request.buttons.some((button) => button.style === 'destructive');

  if (destructive || /delete|remove|leave|deactivate|sign out/.test(text)) {
    return { icon: 'trash-outline' as const, color: '#C9525C', soft: '#FFF0F1' };
  }
  if (/could not|failed|error|unavailable/.test(text)) {
    return { icon: 'alert-circle-outline' as const, color: '#C9525C', soft: '#FFF0F1' };
  }
  if (/created|joined|success|ready|imported/.test(text)) {
    return { icon: 'checkmark-circle-outline' as const, color: '#24966B', soft: '#E9F8F1' };
  }
  if (/choose|options|role|action/.test(text)) {
    return { icon: 'options-outline' as const, color: '#5B5CE2', soft: '#EEEEFF' };
  }
  return { icon: 'sparkles-outline' as const, color: '#5B5CE2', soft: '#EEEEFF' };
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
  const stacked = (request?.buttons.length ?? 0) > 2;

  return (
    <>
      {children}
      <Modal
        animationType="fade"
        onRequestClose={() => {
          if (request?.options?.cancelable !== false) dismiss();
        }}
        statusBarTranslucent
        transparent
        visible={Boolean(request)}
      >
        <View style={styles.overlay}>
          <Pressable
            accessibilityLabel="Close dialog"
            onPress={() => {
              if (request?.options?.cancelable !== false) dismiss();
            }}
            style={StyleSheet.absoluteFill}
          />

          {request && tone ? (
            <View accessibilityViewIsModal style={styles.card}>
              <View style={styles.topRow}>
                <View style={[styles.iconWrap, { backgroundColor: tone.soft }]}>
                  <Ionicons color={tone.color} name={tone.icon} size={25} />
                </View>
                {request.options?.cancelable !== false ? (
                  <Pressable
                    accessibilityLabel="Close"
                    hitSlop={8}
                    onPress={() => dismiss()}
                    style={({ pressed }) => [styles.closeButton, pressed && styles.pressed]}
                  >
                    <Ionicons color="#777782" name="close" size={19} />
                  </Pressable>
                ) : null}
              </View>

              <Text style={styles.title}>{request.title}</Text>
              {request.message ? (
                <ScrollView
                  bounces={false}
                  contentContainerStyle={styles.messageContent}
                  showsVerticalScrollIndicator={false}
                  style={styles.messageScroll}
                >
                  <Text style={styles.message}>{request.message}</Text>
                </ScrollView>
              ) : null}

              <View style={[styles.actions, stacked && styles.actionsStacked]}>
                {request.buttons.map((button, index) => {
                  const cancel = button.style === 'cancel';
                  const destructive = button.style === 'destructive';
                  return (
                    <Pressable
                      key={`${button.text ?? 'Button'}-${index}`}
                      onPress={() => choose(button)}
                      style={({ pressed }) => [
                        styles.actionButton,
                        stacked && styles.actionButtonStacked,
                        cancel && styles.cancelButton,
                        destructive && styles.destructiveButton,
                        pressed && styles.pressed,
                      ]}
                    >
                      <Text
                        style={[
                          styles.actionText,
                          cancel && styles.cancelText,
                          destructive && styles.destructiveText,
                        ]}
                      >
                        {button.text ?? 'OK'}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          ) : null}
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    paddingHorizontal: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(24, 24, 35, 0.58)',
  },
  card: {
    width: '100%',
    maxWidth: 410,
    maxHeight: '82%',
    padding: 20,
    borderRadius: 28,
    backgroundColor: '#FFFFFF',
    shadowColor: '#171726',
    shadowOffset: { width: 0, height: 16 },
    shadowOpacity: 0.22,
    shadowRadius: 30,
    elevation: 16,
  },
  topRow: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  iconWrap: {
    width: 52,
    height: 52,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 17,
  },
  closeButton: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#E7E7EF',
    borderRadius: 12,
    backgroundColor: '#F8F8FC',
  },
  title: {
    marginTop: 16,
    color: '#202027',
    fontSize: 20,
    fontWeight: '900',
    letterSpacing: -0.45,
  },
  messageScroll: { maxHeight: 270 },
  messageContent: { paddingTop: 9 },
  message: {
    color: '#6F6F7B',
    fontSize: 13,
    lineHeight: 20,
  },
  actions: {
    marginTop: 21,
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 9,
  },
  actionsStacked: { flexDirection: 'column' },
  actionButton: {
    minWidth: 96,
    minHeight: 46,
    paddingHorizontal: 17,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 15,
    backgroundColor: '#5B5CE2',
  },
  actionButtonStacked: { width: '100%' },
  cancelButton: {
    borderWidth: 1,
    borderColor: '#E7E7EF',
    backgroundColor: '#F7F7FB',
  },
  destructiveButton: { backgroundColor: '#FFF0F1' },
  actionText: { color: '#FFFFFF', fontSize: 11, fontWeight: '900' },
  cancelText: { color: '#696975' },
  destructiveText: { color: '#B7444E' },
  pressed: { opacity: 0.72, transform: [{ scale: 0.985 }] },
});
