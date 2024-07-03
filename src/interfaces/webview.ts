export interface WebviewMessage {
  messageType: string;
  data: unknown;
}

export interface PanelData {
  // Used to match component on the React side
  dataType: string;
  // Holds actual data the panel works with
  data: unknown;
}

export declare type ToastPosition = "bottom-right" | "bottom-center" | "bottom-left";

/** Options that can be given to the showToast function. */
export interface ToastOptions {
  /** Title displayed in the toast notification. */
  title: string;
  /**
   * Type of the notification. Also indicates the color and icon.
   * @defaultValue 'info'
   * */
  type?: "info" | "warning" | "critical" | "success";
  /** Message displayed in the toast notification.
   * >>> Actual type is string | JSX.Element
   */
  message?: string;
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
   * Optional actions passed to the toast element, appended on the bottom left.
   * Should only be used to either add a Button or a Link.
   * >>> Actual type is JSX.Element
   */
  actions?: unknown;
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
