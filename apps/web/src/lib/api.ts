const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000/api";

export type AuthUser = {
  id: string;
  nome: string;
  login: string;
  perfil: string;
  empresaId: string;
  empresaSlug?: string;
  empresaNome?: string;
  permissoes?: string[];
};

const ACCESS_KEY = "fort_beer_access";

export function getAccessToken() {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(ACCESS_KEY);
}

export function setAccessToken(token: string | null) {
  if (typeof window === "undefined") return;
  if (token) localStorage.setItem(ACCESS_KEY, token);
  else localStorage.removeItem(ACCESS_KEY);
}

export async function apiFetch<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const headers = new Headers(options.headers || {});
  if (!headers.has("Content-Type") && options.body) {
    headers.set("Content-Type", "application/json");
  }
  const token = getAccessToken();
  if (token) headers.set("Authorization", `Bearer ${token}`);

  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    headers,
    credentials: "include",
  });

  if (res.status === 401 && !path.includes("/auth/login")) {
    const refreshed = await tryRefresh();
    if (refreshed) {
      headers.set("Authorization", `Bearer ${getAccessToken()}`);
      const retry = await fetch(`${API_URL}${path}`, {
        ...options,
        headers,
        credentials: "include",
      });
      if (!retry.ok) throw new Error(await readError(retry));
      return retry.json() as Promise<T>;
    }
  }

  if (!res.ok) throw new Error(await readError(res));
  return res.json() as Promise<T>;
}

async function tryRefresh() {
  try {
    const res = await fetch(`${API_URL}/auth/refresh`, {
      method: "POST",
      credentials: "include",
    });
    if (!res.ok) {
      setAccessToken(null);
      return false;
    }
    const data = (await res.json()) as { accessToken: string };
    setAccessToken(data.accessToken);
    return true;
  } catch {
    setAccessToken(null);
    return false;
  }
}

async function readError(res: Response) {
  try {
    const data = await res.json();
    return data.message
      ? Array.isArray(data.message)
        ? data.message.join(", ")
        : String(data.message)
      : res.statusText;
  } catch {
    return res.statusText;
  }
}

export async function loginRequest(login: string, senha: string) {
  const data = await apiFetch<{
    accessToken: string;
    user: AuthUser;
  }>("/auth/login", {
    method: "POST",
    body: JSON.stringify({ login, senha, tenantSlug: "fort-beer" }),
  });
  setAccessToken(data.accessToken);
  return data;
}

export async function logoutRequest() {
  try {
    await apiFetch("/auth/logout", { method: "POST" });
  } finally {
    setAccessToken(null);
  }
}
