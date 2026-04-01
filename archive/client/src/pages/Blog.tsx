import { trpc } from "@/lib/trpc";
import { Link } from "wouter";
import { Loader2, ArrowRight, Calendar, Tag } from "lucide-react";

const categoryColors: Record<string, string> = {
  release: "#22c55e",
  announcement: "#b8963e",
  technical: "#3b82f6",
  industry: "#a855f7",
};

export default function Blog() {
  const { data: posts, isLoading, error } = trpc.blog.list.useQuery({ limit: 50 });

  return (
    <div className="min-h-screen" style={{ fontFamily: "'Outfit', sans-serif" }}>
      {/* Hero */}
      <section className="pt-32 pb-16 px-6">
        <div className="max-w-4xl mx-auto text-center">
          <h1
            className="text-5xl font-black tracking-wide mb-4"
            style={{ color: "#b8963e" }}
          >
            Updates
          </h1>
          <p className="text-lg" style={{ color: "#9ca3af" }}>
            Protocol releases, technical deep-dives, and industry commentary.
          </p>
        </div>
      </section>

      {/* Posts */}
      <section className="pb-24 px-6">
        <div className="max-w-4xl mx-auto">
          {isLoading && (
            <div className="flex justify-center py-20">
              <Loader2 className="w-8 h-8 animate-spin" style={{ color: "#b8963e" }} />
            </div>
          )}

          {error && (
            <div className="text-center py-20">
              <p style={{ color: "#ef4444" }}>Failed to load posts.</p>
            </div>
          )}

          {posts && posts.length === 0 && (
            <div className="text-center py-20">
              <p className="text-lg" style={{ color: "#6b7280" }}>
                No posts yet. Check back soon.
              </p>
            </div>
          )}

          {posts && posts.length > 0 && (
            <div className="space-y-6">
              {posts.map((post) => (
                <Link key={post.slug} href={`/blog/${post.slug}`}>
                  <article
                    className="block p-6 rounded-lg border transition-all duration-200 cursor-pointer"
                    style={{
                      backgroundColor: "rgba(255,255,255,0.02)",
                      borderColor: "rgba(184,150,62,0.15)",
                    }}
                    onMouseEnter={(e) => {
                      (e.currentTarget as HTMLElement).style.borderColor = "rgba(184,150,62,0.4)";
                      (e.currentTarget as HTMLElement).style.backgroundColor = "rgba(255,255,255,0.04)";
                    }}
                    onMouseLeave={(e) => {
                      (e.currentTarget as HTMLElement).style.borderColor = "rgba(184,150,62,0.15)";
                      (e.currentTarget as HTMLElement).style.backgroundColor = "rgba(255,255,255,0.02)";
                    }}
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        {/* Category + Date */}
                        <div className="flex items-center gap-3 mb-3">
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
                                month: "short",
                                day: "numeric",
                              })}
                            </span>
                          )}
                        </div>

                        {/* Title */}
                        <h2
                          className="text-xl font-bold mb-2"
                          style={{ color: "#e5e7eb" }}
                        >
                          {post.title}
                        </h2>

                        {/* Summary */}
                        {post.summary && (
                          <p className="text-sm leading-relaxed" style={{ color: "#9ca3af" }}>
                            {post.summary}
                          </p>
                        )}
                      </div>

                      <ArrowRight
                        className="w-5 h-5 mt-1 flex-shrink-0"
                        style={{ color: "#b8963e" }}
                      />
                    </div>
                  </article>
                </Link>
              ))}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
