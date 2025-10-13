import { PanelData } from "./panels";
import { ObjectValues } from "./util-types";

export const WebviewEventType = {
  updateData: "updateData",
  showToast: "showToast",
  openLog: "openLog",
} as const;
// eslint-disable-next-line @typescript-eslint/no-redeclare
export type WebviewEventType = ObjectValues<typeof WebviewEventType>;

interface WebviewEventBase {
  /** Type of the event. */
  messageType: string;
  /** Event data. */
  data: unknown;
}

export interface WebviewUpdateEvent extends WebviewEventBase {
  messageType: typeof WebviewEventType.updateData;
  data: PanelData;
}

export interface WebviewToastEvent extends WebviewEventBase {
  messageType: typeof WebviewEventType.showToast;
  data: ToastOptions;
}

export interface WebviewLogEvent extends WebviewEventBase {
  messageType: typeof WebviewEventType.openLog;
  data: LogData;
}

export type WebviewEvent = WebviewUpdateEvent | WebviewToastEvent | WebviewLogEvent;

export interface LogData {
  logContent: string;
}

export type ToastPosition = "bottom-right" | "bottom-center" | "bottom-left";

/** Options that can be given to the showToast function. */
export interface ToastOptions {
  /** Title displayed in the toast notification. */
  title: string;
  /**
   * Type of the notification. Also indicates the color and icon.
   * @defaultValue 'info'
   * */
  type?: "info" | "warning" | "critical" | "success";
  /**
   * The Toast notification will automatically close after a certain period of
   * time given in milliseconds. If 'infinite' is provided, the consumer will
   * need to manually close the toast.
   * Default value by type:
   * info: 8000ms
   * critical and warning: 'infinite'
   * */
  lifespan?: number | "infinite";
  /**
   * Live region roles
   * * Default value by type:
   * info and warning: 'status'
   * critical: 'alert'
   */
  role?: "alert" | "log" | "status";
  /**
   * Position of toast
   * @defaultValue 'bottom-left'
   */
  position?: ToastPosition;
}
