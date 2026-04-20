import type { CreateExpressContextOptions } from "@trpc/server/adapters/express";
import type { User, Principal } from "../../drizzle/schema";
import { sdk } from "./sdk";

export type TrpcContext = {
  req: CreateExpressContextOptions["req"];
  res: CreateExpressContextOptions["res"];
  user: User | null;
  principal?: Principal | null;
};

export async function createContext(
  opts: CreateExpressContextOptions
): Promise<TrpcContext> {
  let user: User | null = null;

  try {
    user = await sdk.authenticateRequest(opts.req);
  } catch (error) {
    // Authentication is optional for public procedures.
    user = null;
  }

  return {
    req: opts.req,
    res: opts.res,
    user,
    // Principal is resolved lazily by the resolvePrincipal middleware in trpc.ts
    // This avoids a DB call for every public/unauthenticated request
    principal: null,
  };
}
