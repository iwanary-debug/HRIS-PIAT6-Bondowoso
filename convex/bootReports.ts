import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

/**
 * Boot diagnostics.
 *
 * The inline failsafe in `index.html` posts here when the client bundle fails
 * to render, so a production boot failure is visible from the backend instead
 * of only as a blank page in the user's browser. Messages contain no user data
 * beyond the browser user agent and the page URL.
 */
export const report = mutation({
  args: {
    message: v.string(),
    userAgent: v.optional(v.string()),
    url: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert("bootReports", {
      message: args.message.slice(0, 2000),
      userAgent: args.userAgent,
      url: args.url,
      createdAt: Date.now(),
    });
    return null;
  },
});

/** Latest boot failures, newest first. */
export const list = query({
  args: {},
  handler: async (ctx) => {
    const rows = await ctx.db.query("bootReports").order("desc").take(5);
    return rows.map((row) => ({
      message: row.message,
      userAgent: row.userAgent,
      url: row.url,
      createdAt: row.createdAt,
    }));
  },
});

export const clear = mutation({
  args: {},
  handler: async (ctx) => {
    const rows = await ctx.db.query("bootReports").collect();
    for (const row of rows) await ctx.db.delete(row._id);
    return rows.length;
  },
});
