import { API_BASE } from "../constants/config";
import type {
  LoginResponse,
  UsersWarehouseResp,
} from "../constants/types";

type JSONValue =
  | string
  | number
  | boolean
  | null
  | JSONValue[]
  | { [key: string]: JSONValue };

async function handle<T extends JSONValue>(
  responsePromise: Promise<Response>
): Promise<T> {
  let response: Response;

  try {
    response = await responsePromise;
  } catch (err: any) {
    throw new Error(
      `NETWORK_ERROR: ${err?.message || "fetch failed"}`
    );
  }

  if (response.ok) {
    if (response.status === 204) {
      return undefined as unknown as T;
    }

    try {
      return (await response.json()) as T;
    } catch {
      const text = await response.text().catch(() => "");
      throw new Error(`BAD_JSON: ${text.slice(0, 200)}`);
    }
  }

  const text = await response.text().catch(() => "");
  throw new Error(`HTTP_${response.status}: ${text.slice(0, 300)}`);
}

export const api = {
  get: <T extends JSONValue>(path: string) =>
    handle<T>(
      fetch(`${API_BASE}${path}`, {
        cache: "no-store",
      })
    ),

  post: <T extends JSONValue>(path: string, body: unknown) =>
    handle<T>(
      fetch(`${API_BASE}${path}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      })
    ),
};

export const listUsersWarehouse = () =>
  api.get<UsersWarehouseResp>("/distribution/users");

export const loginWarehouse = (payload: {
  name: string;
  password: string;
}) => api.post<LoginResponse>("/loginwarehouse", payload);
