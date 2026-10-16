import { NextResponse } from "next/server";
import {
  MAX_POSTS,
  classifyStatus,
  clampItems,
  collectReplies,
  getRun,
  parseTweetId,
  startRepliesRun,
  tweetUrl,
} from "../../../lib/apify";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Parses the pasted links and starts a single Apify run for all of them. */
export async function POST(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Send a JSON body with a `urls` array." }, { status: 400 });
  }

  const rawUrls = Array.isArray(body?.urls) ? body.urls : [];
  const perPostLimit = clampItems(body?.maxItems);

  const entries = rawUrls.map((value) => String(value || "").trim()).filter(Boolean);
  if (!entries.length) {
    return NextResponse.json({ error: "Paste at least one post link." }, { status: 400 });
  }

  const invalid = [];
  const seen = new Set();
  const targets = [];

  for (const entry of entries) {
    const tweetId = parseTweetId(entry);
    if (!tweetId) {
      invalid.push(entry);
      continue;
    }
    if (seen.has(tweetId)) continue;
    seen.add(tweetId);
    targets.push({ input: entry, tweetId, url: tweetUrl(tweetId) });
  }

  if (!targets.length) {
    return NextResponse.json(
      { error: "None of those links look like an X post link.", invalid },
      { status: 400 }
    );
  }

  if (targets.length > MAX_POSTS) {
    return NextResponse.json(
      { error: `Too many links. Up to ${MAX_POSTS} posts per scan.` },
      { status: 400 }
    );
  }

  try {
    const run = await startRepliesRun(
      targets.map((target) => target.tweetId),
      perPostLimit
    );
    return NextResponse.json({
      runId: run.runId,
      status: "running",
      perPostLimit,
      targets,
      invalid,
    });
  } catch (error) {
    return NextResponse.json({ error: String(error.message || error) }, { status: 502 });
  }
}

/** Reports run progress, and the grouped reply authors once the run is done. */
export async function GET(request) {
  const params = request.nextUrl.searchParams;
  const runId = String(params.get("run") || "").trim();
  const tweetIds = String(params.get("tweets") || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);

  if (!runId || !tweetIds.length) {
    return NextResponse.json({ error: "Pass ?run=<runId>&tweets=<id,id>." }, { status: 400 });
  }

  try {
    const run = await getRun(runId);
    const kind = classifyStatus(run.status);

    if (kind === "running") {
      return NextResponse.json({ runId, status: "running" });
    }

    if (kind === "failed") {
      return NextResponse.json({
        runId,
        status: "failed",
        error: run.statusMessage || `The Apify run ended with status ${run.status}.`,
      });
    }

    const collected = await collectReplies(run.datasetId, tweetIds);

    if (collected.allDemo) {
      return NextResponse.json({
        runId,
        status: "failed",
        error:
          "The actor returned demo data instead of real results. Check that APIFY_ACTOR points at an actor your Apify plan allows.",
      });
    }

    return NextResponse.json({
      runId,
      status: "ready",
      scanned: collected.scanned,
      posts: collected.posts,
    });
  } catch (error) {
    return NextResponse.json({ runId, status: "failed", error: String(error.message || error) });
  }
}
