/**
 * Single import point for the backend API.
 *
 * The UI never imports Convex function modules directly — it goes through this
 * service layer, so swapping the data provider (Convex -> Cloudflare D1 ->
 * PIAT 6 Super App) only touches this file and the services beside it.
 */

export { api } from "../../convex/_generated/api";
