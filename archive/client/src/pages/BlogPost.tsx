import { trpc } from "@/lib/trpc";
import { useRoute, Link } from "wouter";
import { Loader2, ArrowLeft, Calendar, Tag } from "lucide-react";
import { Streamdown } from "streamdown";

const categoryColors: Record<string, string> = {
  release: "#22c55e",
  announcement: "#b8963e",
  technical: "#3b82f6",
  industry: "#a855f7",
};

export default function BlogPost() {
  const [, params] = useRoute("/blog/:slug");
  const slug = params?.slug ?? "";

  const { data: post, isLoading, error } = trpc.blog.bySlug.useQuery(
    { slug },
    { enabled: !!slug }
  );

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin" style={{ color: "#b8963e" }} />
      </div>
    );
  }

  if (error || !post) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4">
        <p className="text-lg" style={{ color: "#ef4444" }}>
          Post not found.
        </p>
        <Link href="/blog">
          <span
            className="inline-flex items-center gap-2 text-sm cursor-pointer"
            style={{ color: "#b8963e" }}
          >
            <ArrowLeft className="w-4 h-4" /> Back to Updates
          </span>
        </Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen" style={{ fontFamily: "'Outfit', sans-serif" }}>
      <article className="pt-32 pb-24 px-6">
        <div className="max-w-3xl mx-auto">
          {/* Back link */}
          <Link href="/blog">
            <span
              className="inline-flex items-center gap-2 text-sm mb-8 cursor-pointer"
              style={{ color: "#b8963e" }}
            >
              <ArrowLeft className="w-4 h-4" /> Back to Updates
            </span>
          </Link>

          {/* Meta */}
          <div className="flex items-center gap-3 mb-4">
            <span
              className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded"
              style={{
                backgroundColor: `${categoryColors[post.category] ?? "#b8963e"}20`,
                color: categoryColors[post.category] ?? "#b8963e",
              }}
            >
              <Tag className="w-3 h-3" />
              {post.category}
            </span>
            {post.publishedAt && (
              <span className="flex items-center gap-1 text-xs" style={{ color: "#6b7280" }}>
                <Calendar className="w-3 h-3" />
                {new Date(post.publishedAt).toLocaleDateString("en-US", {
                  year: "numeric",
                  month: "long",
                  day: "numeric",
                })}
              </span>
            )}
          </div>

          {/* Title */}
          <h1
            className="text-4xl font-black tracking-wide mb-6"
            style={{ color: "#e5e7eb" }}
          >
            {post.title}
          </h1>

          {/* Summary */}
          {post.summary && (
            <p
              className="text-lg mb-8 pb-8 border-b"
              style={{ color: "#9ca3af", borderColor: "rgba(184,150,62,0.15)" }}
            >
              {post.summary}
            </p>
          )}

          {/* Content */}
          <div
            className="prose prose-invert max-w-none"
            style={{
              color: "#d1d5db",
              lineHeight: "1.8",
            }}
          >
            <Streamdown>{post.content}</Streamdown>
          </div>
        </div>
      </article>
    </div>
  );
}
