import { NextResponse } from "next/server";

export function apiErrorResponse(error: unknown, logLabel: string) {
  const status = typeof error === "object" && error !== null && "status" in error && typeof error.status === "number"
    ? error.status
    : 500;
  if (status >= 500) {
    console.error(logLabel, {
      errorCode: error instanceof Error ? error.name : "UnknownError",
    });
  }
  return NextResponse.json(
    {
      error:
        status === 401
          ? "Unauthorized"
          : status === 403
            ? "Forbidden"
            : "Internal server error",
    },
    { status },
  );
}
