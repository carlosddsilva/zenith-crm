import { getSessionByToken } from "./session-store";
import { readSessionToken } from "./session-cookie";

export async function getCurrentUser() {
  const token = await readSessionToken();

  if (!token) {
    return null;
  }

  return getSessionByToken(token);
}

export async function requireCurrentUser() {
  const user = await getCurrentUser();

  if (!user) {
    throw new Error("UNAUTHORIZED");
  }

  return user;
}
