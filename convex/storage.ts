/**
 * Storage abstraction — file upload for employee documents.
 * Files live in Convex managed storage (never in Git); metadata lives in the
 * `documents` table with versions, expiry dates and audit on every access.
 */

import { mutation } from "./_generated/server";
import { PERMISSIONS } from "../src/domain/permissions";
import { requirePermission } from "./lib/auth";

/**
 * Short-lived upload URL for `POST <url>` with the raw file body. The returned
 * storageId is then registered through `lifecycle.uploadDocument`, which keeps
 * the permission + audit path in one place.
 */
export const generateUploadUrl = mutation({
  args: {},
  handler: async (ctx) => {
    await requirePermission(ctx, PERMISSIONS.HR_DOCUMENT_EDIT);
    return await ctx.storage.generateUploadUrl();
  },
});
