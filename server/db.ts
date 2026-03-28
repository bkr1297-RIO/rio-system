import { eq, desc } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import { InsertUser, users, blogPosts, InsertBlogPost, demoEvents, InsertDemoEvent, demoWishes, InsertDemoWish } from "../drizzle/schema";
import { ENV } from './_core/env';

let _db: ReturnType<typeof drizzle> | null = null;

// Lazily create the drizzle instance so local tooling can run without a DB.
export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) {
    throw new Error("User openId is required for upsert");
  }

  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot upsert user: database not available");
    return;
  }

  try {
    const values: InsertUser = {
      openId: user.openId,
    };
    const updateSet: Record<string, unknown> = {};

    const textFields = ["name", "email", "loginMethod"] as const;
    type TextField = (typeof textFields)[number];

    const assignNullable = (field: TextField) => {
      const value = user[field];
      if (value === undefined) return;
      const normalized = value ?? null;
      values[field] = normalized;
      updateSet[field] = normalized;
    };

    textFields.forEach(assignNullable);

    if (user.lastSignedIn !== undefined) {
      values.lastSignedIn = user.lastSignedIn;
      updateSet.lastSignedIn = user.lastSignedIn;
    }
    if (user.role !== undefined) {
      values.role = user.role;
      updateSet.role = user.role;
    } else if (user.openId === ENV.ownerOpenId) {
      values.role = 'admin';
      updateSet.role = 'admin';
    }

    if (!values.lastSignedIn) {
      values.lastSignedIn = new Date();
    }

    if (Object.keys(updateSet).length === 0) {
      updateSet.lastSignedIn = new Date();
    }

    await db.insert(users).values(values).onDuplicateKeyUpdate({
      set: updateSet,
    });
  } catch (error) {
    console.error("[Database] Failed to upsert user:", error);
    throw error;
  }
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get user: database not available");
    return undefined;
  }

  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);

  return result.length > 0 ? result[0] : undefined;
}

// ── Blog Queries ──────────────────────────────────────────────────────────────

export async function getPublishedPosts(limit = 50) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(blogPosts).where(eq(blogPosts.published, 1)).orderBy(desc(blogPosts.publishedAt)).limit(limit);
}

export async function getPostBySlug(slug: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(blogPosts).where(eq(blogPosts.slug, slug)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function getAllPosts(limit = 100) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(blogPosts).orderBy(desc(blogPosts.createdAt)).limit(limit);
}

export async function createPost(post: InsertBlogPost) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.insert(blogPosts).values(post);
  return getPostBySlug(post.slug);
}

export async function updatePost(slug: string, data: Partial<InsertBlogPost>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(blogPosts).set(data).where(eq(blogPosts.slug, slug));
  return getPostBySlug(slug);
}

export async function deletePost(slug: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(blogPosts).where(eq(blogPosts.slug, slug));
}

// ── Demo Tracking ──────────────────────────────────────────────────────────────

export async function recordDemoEvent(event: InsertDemoEvent) {
  const db = await getDb();
  if (!db) return;
  await db.insert(demoEvents).values(event);
}

export async function saveDemoWish(wish: { sessionId: string; text: string }) {
  const db = await getDb();
  if (!db) return;
  await db.insert(demoWishes).values({
    sessionId: wish.sessionId,
    text: wish.text,
  });
}

export async function getDemoStats() {
  const db = await getDb();
  if (!db) return { totalSessions: 0, completions: 0, stepCounts: [] };

  const allEvents = await db.select().from(demoEvents).orderBy(desc(demoEvents.createdAt));

  const sessions = new Set(allEvents.map(e => e.sessionId));
  const completions = allEvents.filter(e => e.action === "complete");
  const completedSessions = new Set(completions.map(e => e.sessionId));

  // Count unique sessions per step
  const stepMap = new Map<number, Set<string>>();
  for (const e of allEvents) {
    if (e.action === "view") {
      if (!stepMap.has(e.step)) stepMap.set(e.step, new Set());
      stepMap.get(e.step)!.add(e.sessionId);
    }
  }

  const stepCounts = Array.from(stepMap.entries())
    .map(([step, s]) => ({ step, count: s.size }))
    .sort((a, b) => a.step - b.step);

  return {
    totalSessions: sessions.size,
    completions: completedSessions.size,
    stepCounts,
  };
}
