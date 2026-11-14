export async function api(path: string, init?: RequestInit) {
  const token = localStorage.getItem("crs_token") ?? JSON.stringify({ student: { sub: "s123" } });
  const response = await fetch(`/api${path}`, { ...init, headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, ...(init?.headers ?? {}) } });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error?.message ?? "Something went wrong");
  return body;
}
