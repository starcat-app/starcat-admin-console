/** 同源 BFF 客户端。错误只消费服务端已脱敏的消息。 */
export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: {
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...init?.headers,
    },
  });
  const payload = (await response.json().catch(() => ({}))) as {
    data?: T;
    error?: unknown;
  };
  if (!response.ok)
    throw new Error(responseErrorMessage(payload.error, response.status));
  return payload.data as T;
}

/**
 * 兼容控制台 BFF 与上游服务的两种错误 envelope，避免对象被隐式转成
 * `[object Object]`。只提取可展示的 message，未知结构继续使用 HTTP 状态兜底。
 */
function responseErrorMessage(error: unknown, status: number): string {
  if (typeof error === "string" && error.trim()) return error;
  if (error && typeof error === "object" && "message" in error) {
    const message = error.message;
    if (typeof message === "string" && message.trim()) return message;
  }
  return `Request failed (${status})`;
}

export function jsonBody(
  value: unknown,
): Pick<RequestInit, "body" | "headers"> {
  return {
    body: JSON.stringify(value),
    headers: { "Content-Type": "application/json" },
  };
}
