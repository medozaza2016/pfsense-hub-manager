import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";

export type ToastKind = "success" | "error" | "warning" | "info";
type Toast = { id: string; message: string; kind: ToastKind };
type ToastContextValue = {
  notify: (message: string, kind?: ToastKind, durationMs?: number) => void;
  dismiss: (id: string) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

const icons: Record<ToastKind, string> = {
  success: "✓",
  error: "!",
  warning: "!",
  info: "i"
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const timers = useRef(new Map<string, number>());

  const dismiss = useCallback((id: string) => {
    const timer = timers.current.get(id);
    if (timer !== undefined) window.clearTimeout(timer);
    timers.current.delete(id);
    setToasts(current => current.filter(toast => toast.id !== id));
  }, []);

  const notify = useCallback((message: string, kind: ToastKind = "info", durationMs?: number) => {
    const cleanMessage = message.trim();
    if (!cleanMessage) return;
    const id = `toast-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    const toast = { id, message: cleanMessage, kind };
    setToasts(current => [...current.slice(-3), toast]);
    const duration = durationMs ?? (kind === "error" ? 7000 : 5000);
    const timer = window.setTimeout(() => dismiss(id), duration);
    timers.current.set(id, timer);
  }, [dismiss]);

  useEffect(() => () => {
    for (const timer of timers.current.values()) window.clearTimeout(timer);
    timers.current.clear();
  }, []);

  return (
    <ToastContext.Provider value={{ notify, dismiss }}>
      {children}
      <div className="toast-viewport" aria-label="Notifications" aria-live="polite" aria-relevant="additions text">
        {toasts.map(toast => (
          <div className={`toast toast-${toast.kind}`} key={toast.id} role={toast.kind === "error" ? "alert" : "status"}>
            <span className="toast-icon" aria-hidden="true">{icons[toast.kind]}</span>
            <p>{toast.message}</p>
            <button type="button" className="toast-dismiss" aria-label="Dismiss notification" onClick={() => dismiss(toast.id)}>×</button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) throw new Error("useToast must be used inside ToastProvider.");
  return context;
}
