let accessToken: string | null = null;
export const setAccessToken = (token: string | null) => { accessToken = token; };

async function raw(path: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  if (typeof init.body === "string" && !headers.has("content-type")) headers.set("content-type", "application/json");
  if (accessToken) headers.set("authorization", `Bearer ${accessToken}`);
  return fetch(`/api${path}`, { ...init, headers, credentials: "include" });
}

async function authenticatedResponse(path: string, init: RequestInit = {}) {
  let res = await raw(path, init);
  if (res.status === 401 && path !== "/auth/login" && path !== "/auth/refresh") {
    const refresh = await raw("/auth/refresh", { method: "POST" });
    if (refresh.ok) {
      const payload = await refresh.json() as { accessToken: string };
      setAccessToken(payload.accessToken);
      res = await raw(path, init);
    }
  }
  return res;
}

async function throwApiError(res: Response): Promise<never> {
  const body = await res.json().catch(() => ({ error: "Request failed." })) as { error?: string };
  throw new Error(body.error ?? "Request failed.");
}

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await authenticatedResponse(path, init);
  if (!res.ok) return throwApiError(res);
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export async function apiBlob(path: string): Promise<Blob> {
  const res = await authenticatedResponse(path);
  if (!res.ok) return throwApiError(res);
  return res.blob();
}
