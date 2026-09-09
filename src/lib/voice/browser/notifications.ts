const activeNotifications =
  new Map<string, Notification>();

export function canUseVoiceNotifications() {
  return (
    typeof window !== "undefined" &&
    "Notification" in window
  );
}

export function voiceNotificationPermission() {
  if (!canUseVoiceNotifications()) {
    return "denied" as NotificationPermission;
  }

  return Notification.permission;
}

export async function requestVoiceNotificationPermission() {
  if (!canUseVoiceNotifications()) {
    return "denied" as NotificationPermission;
  }

  if (Notification.permission !== "default") {
    return Notification.permission;
  }

  return Notification.requestPermission();
}

export function showIncomingVoiceNotification(input: {
  callId: string;
  contactName?: string | null;
  phone?: string | null;
}) {
  if (!canUseVoiceNotifications()) {
    return;
  }

  if (Notification.permission !== "granted") {
    return;
  }

  /*
   * Com a aba visivel o popup do Zenith Calls
   * ja e suficiente.
   */
  if (
    typeof document !== "undefined" &&
    document.visibilityState === "visible"
  ) {
    return;
  }

  if (activeNotifications.has(input.callId)) {
    return;
  }

  const identity =
    input.contactName?.trim() ||
    input.phone?.trim() ||
    "Chamada recebida";

  const notification =
    new Notification(
      "Zenith Calls",
      {
        body: `Chamada recebida de ${identity}`,
        tag: `zenith-call-${input.callId}`,
        requireInteraction: true,
      },
    );

  notification.onclick = () => {
    window.focus();
    notification.close();

    activeNotifications.delete(
      input.callId,
    );
  };

  notification.onclose = () => {
    activeNotifications.delete(
      input.callId,
    );
  };

  activeNotifications.set(
    input.callId,
    notification,
  );
}

export function closeVoiceNotification(
  callId: string,
) {
  const notification =
    activeNotifications.get(
      callId,
    );

  if (!notification) {
    return;
  }

  notification.close();

  activeNotifications.delete(
    callId,
  );
}

export function closeAllVoiceNotifications() {
  for (
    const notification
    of activeNotifications.values()
  ) {
    notification.close();
  }

  activeNotifications.clear();
}