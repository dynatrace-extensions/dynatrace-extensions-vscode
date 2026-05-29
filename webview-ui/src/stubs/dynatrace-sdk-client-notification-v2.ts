/**
 * Stub for @dynatrace-sdk/client-notification-v2.
 *
 * This package provides Dynatrace notification management APIs (event and resource
 * notifications) that have no meaning inside a VS Code webview. The stubs here
 * satisfy import resolution at bundle time without pulling in the real SDK.
 */

const noopList = () => Promise.resolve({ notifications: [], totalCount: 0 });
const noopCreate = () => Promise.resolve({});
const noopDelete = () => Promise.resolve();

export const eventNotificationsClient = {
  getEventNotifications: noopList,
  createEventNotification: noopCreate,
  deleteEventNotification: noopDelete,
};

export const resourceNotificationsClient = {
  getResourceNotifications: noopList,
  createResourceNotification: noopCreate,
  deleteResourceNotification: noopDelete,
};

export const isErrorEnvelopeError = (): boolean => false;
