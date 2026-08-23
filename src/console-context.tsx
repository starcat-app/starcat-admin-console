/**
 * 环境与脱敏操作记录只保存在当前浏览器会话。
 * 真正密钥始终留在 BFF 配置存储，不进入该 Context 或 localStorage。
 */
import {
  createContext,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import type { ActivityEntry, EnvironmentId } from "@/types";

interface ConsoleContextValue {
  environment: EnvironmentId;
  setEnvironment: (environment: EnvironmentId) => void;
  activity: ActivityEntry[];
  record: (
    entry: Omit<ActivityEntry, "id" | "createdAt" | "environment">,
  ) => void;
}

const ConsoleContext = createContext<ConsoleContextValue | null>(null);

export function ConsoleProvider({ children }: { children: ReactNode }) {
  const [environment, setEnvironmentState] = useState<EnvironmentId>(() =>
    sessionStorage.getItem("starcat-admin-environment") === "production"
      ? "production"
      : "test",
  );
  const [activity, setActivity] = useState<ActivityEntry[]>([]);

  const value = useMemo<ConsoleContextValue>(
    () => ({
      environment,
      setEnvironment(next) {
        sessionStorage.setItem("starcat-admin-environment", next);
        setEnvironmentState(next);
      },
      activity,
      record(entry) {
        setActivity((current) =>
          [
            {
              ...entry,
              id: crypto.randomUUID(),
              createdAt: new Date().toISOString(),
              environment,
            },
            ...current,
          ].slice(0, 100),
        );
      },
    }),
    [activity, environment],
  );

  return (
    <ConsoleContext.Provider value={value}>{children}</ConsoleContext.Provider>
  );
}

export function useConsole() {
  const value = useContext(ConsoleContext);
  if (!value) throw new Error("useConsole must be used inside ConsoleProvider");
  return value;
}
