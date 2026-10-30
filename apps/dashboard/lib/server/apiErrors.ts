import { NextResponse } from "next/server";

// Raised on purpose by the data layer for problems the caller can fix; its message is safe to show.
export class InputError extends Error {
  readonly status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = "InputError";
    this.status = status;
  }
}

// Matched by name as well so it still works if the class is loaded from two bundles.
function isInputError(error: unknown): error is InputError {
  return error instanceof InputError || (error instanceof Error && error.name === "InputError");
}

function getPrismaErrorCode(error: unknown) {
  if (typeof error !== "object" || error === null) {
    return null;
  }

  const code = (error as { code?: unknown }).code;
  return typeof code === "string" && /^P\d{4}$/.test(code) ? code : null;
}

// Prisma error messages name tables, columns and queries: they are logged on the server, never sent to the client.
export function mapPrismaError(error: unknown, conflictMessage = "That value is already in use.") {
  switch (getPrismaErrorCode(error)) {
    case "P2002":
      return { status: 409, message: conflictMessage };
    case "P2003":
      return { status: 409, message: "The record is still referenced by other data." };
    case "P2025":
      return { status: 404, message: "The requested record was not found." };
    default:
      return null;
  }
}

export function errorResponse(error: unknown, fallbackMessage: string, options: { conflictMessage?: string } = {}) {
  if (isInputError(error)) {
    return NextResponse.json({ error: error.message }, { status: error.status ?? 400 });
  }

  const mapped = mapPrismaError(error, options.conflictMessage);
  if (mapped) {
    return NextResponse.json({ error: mapped.message }, { status: mapped.status });
  }

  console.error(`[dashboard:api] ${fallbackMessage}`, error);
  return NextResponse.json({ error: fallbackMessage }, { status: 500 });
}
