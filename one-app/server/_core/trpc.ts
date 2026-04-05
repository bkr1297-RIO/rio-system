import { NOT_ADMIN_ERR_MSG, UNAUTHED_ERR_MSG } from '@shared/const';
import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import type { TrpcContext } from "./context";
import type { SystemRole } from "../../drizzle/schema";
import { getPrincipalByUserId, getOrCreatePrincipal, principalHasRole } from "../db";
import { ENV } from "./env";

const t = initTRPC.context<TrpcContext>().create({
  transformer: superjson,
});

export const router = t.router;
export const publicProcedure = t.procedure;

const requireUser = t.middleware(async opts => {
  const { ctx, next } = opts;

  if (!ctx.user) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: UNAUTHED_ERR_MSG });
  }

  return next({
    ctx: {
      ...ctx,
      user: ctx.user,
    },
  });
});

export const protectedProcedure = t.procedure.use(requireUser);

export const adminProcedure = t.procedure.use(
  t.middleware(async opts => {
    const { ctx, next } = opts;

    if (!ctx.user || ctx.user.role !== 'admin') {
      throw new TRPCError({ code: "FORBIDDEN", message: NOT_ADMIN_ERR_MSG });
    }

    return next({
      ctx: {
        ...ctx,
        user: ctx.user,
      },
    });
  }),
);

// ═══════════════════════════════════════════════════════════════════
// ROLE ENFORCEMENT — requireRole middleware
// ═══════════════════════════════════════════════════════════════════

/**
 * Middleware that resolves the current user's principal and injects it into context.
 * Creates a principal on first access (fail-closed: new principals have no roles
 * unless they are the system owner).
 */
const resolvePrincipal = t.middleware(async opts => {
  const { ctx, next } = opts;

  if (!ctx.user) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: UNAUTHED_ERR_MSG });
  }

  // Try to get existing principal, or create one
  let principal = await getPrincipalByUserId(ctx.user.id);
  if (!principal) {
    const isOwner = ctx.user.openId === ENV.ownerOpenId;
    principal = await getOrCreatePrincipal(ctx.user.id, ctx.user.name ?? null, isOwner);
  }

  if (!principal) {
    throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Failed to resolve principal" });
  }

  // Fail-closed: suspended or revoked principals cannot act
  if (principal.status !== "active") {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: `Principal ${principal.principalId} is ${principal.status}. Access denied.`,
    });
  }

  return next({
    ctx: {
      ...ctx,
      user: ctx.user,
      principal,
    },
  });
});

/**
 * Procedure that resolves the principal but does not require a specific role.
 * Use for endpoints where any authenticated principal can access.
 */
export const principalProcedure = t.procedure.use(resolvePrincipal);

/**
 * Create a role-gated procedure.
 * Fail-closed: if the principal does not have the required role, the request is rejected with 403.
 *
 * Usage:
 *   roleGatedProcedure("approver")  → only principals with "approver" role
 *   roleGatedProcedure("meta")      → only principals with "meta" role
 */
export function roleGatedProcedure(requiredRole: SystemRole) {
  return principalProcedure.use(async opts => {
    const { ctx, next } = opts;

    if (!principalHasRole(ctx.principal, requiredRole)) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: `Role "${requiredRole}" required. Principal ${ctx.principal.principalId} does not have this role.`,
      });
    }

    return next({ ctx });
  });
}
