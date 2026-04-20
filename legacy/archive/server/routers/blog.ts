/**
 * Blog tRPC Router
 * Public: list published posts, read single post by slug
 * Admin: create, update, delete, list all (including drafts)
 */

import { z } from "zod";
import { publicProcedure, router } from "../_core/trpc";
import { TRPCError } from "@trpc/server";
import {
  getPublishedPosts,
  getPostBySlug,
  getAllPosts,
  createPost,
  updatePost,
  deletePost,
} from "../db";

const protectedAdminProcedure = publicProcedure.use(({ ctx, next }) => {
  if (!ctx.user) throw new TRPCError({ code: "UNAUTHORIZED" });
  if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN" });
  return next({ ctx: { ...ctx, user: ctx.user } });
});

export const blogRouter = router({
  // Public: list published posts
  list: publicProcedure
    .input(z.object({ limit: z.number().min(1).max(100).default(20) }).optional())
    .query(async ({ input }) => {
      return getPublishedPosts(input?.limit ?? 20);
    }),

  // Public: get single post by slug
  bySlug: publicProcedure
    .input(z.object({ slug: z.string() }))
    .query(async ({ input }) => {
      const post = await getPostBySlug(input.slug);
      if (!post || !post.published) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Post not found" });
      }
      return post;
    }),

  // Admin: list all posts including drafts
  adminList: protectedAdminProcedure
    .input(z.object({ limit: z.number().min(1).max(200).default(50) }).optional())
    .query(async ({ input }) => {
      return getAllPosts(input?.limit ?? 50);
    }),

  // Admin: create post
  create: protectedAdminProcedure
    .input(
      z.object({
        slug: z.string().min(1).max(128),
        title: z.string().min(1).max(256),
        summary: z.string().optional(),
        content: z.string().min(1),
        category: z.enum(["release", "announcement", "technical", "industry"]).default("announcement"),
        published: z.boolean().default(false),
      })
    )
    .mutation(async ({ input }) => {
      return createPost({
        slug: input.slug,
        title: input.title,
        summary: input.summary ?? null,
        content: input.content,
        category: input.category,
        published: input.published ? 1 : 0,
        publishedAt: input.published ? new Date() : null,
      });
    }),

  // Admin: update post
  update: protectedAdminProcedure
    .input(
      z.object({
        slug: z.string(),
        title: z.string().min(1).max(256).optional(),
        summary: z.string().optional(),
        content: z.string().optional(),
        category: z.enum(["release", "announcement", "technical", "industry"]).optional(),
        published: z.boolean().optional(),
      })
    )
    .mutation(async ({ input }) => {
      const data: Record<string, unknown> = {};
      if (input.title !== undefined) data.title = input.title;
      if (input.summary !== undefined) data.summary = input.summary;
      if (input.content !== undefined) data.content = input.content;
      if (input.category !== undefined) data.category = input.category;
      if (input.published !== undefined) {
        data.published = input.published ? 1 : 0;
        if (input.published) data.publishedAt = new Date();
      }
      return updatePost(input.slug, data);
    }),

  // Admin: delete post
  delete: protectedAdminProcedure
    .input(z.object({ slug: z.string() }))
    .mutation(async ({ input }) => {
      await deletePost(input.slug);
      return { success: true };
    }),
});
