const API_ROOT = "https://api.apify.com/v2";

/**
 * Default actor: xquik/x-reply-scraper.
 * Cheap per delivered reply row, walks nested replies, and — unlike the API Dojo
 * scrapers — it runs on Apify's free plan and returns full author profiles
 * (follower count + verification flags), which the filters need.
 */
export const ACTOR = process.env.APIFY_ACTOR || "xquik/x-reply-scraper";
export const ACTOR_SLUG = ACTOR.replace("/", "~");

export const MAX_POSTS = 10;
export const DEFAULT_MAX_ITEMS = 500;
export const MIN_ITEMS = 25;
export const MAX_ITEMS = 2000;

const CHUNK_SIZE = 1000;

function token() {
  const value = process.env.APIFY_TOKEN;
  if (!value) {
    throw new Error("APIFY_TOKEN is not configured on the server.");
  }
  return value;
}

/** Accepts x.com / twitter.com status links, or a bare numeric post id. */
export function parseTweetId(input) {
  const raw = String(input || "").trim();
  if (!raw) return null;

  const bare = raw.match(/^(\d{5,25})$/);
  if (bare) return bare[1];

  const match = raw.match(
    /(?:twitter\.com|x\.com|mobile\.twitter\.com|nitter\.[a-z.]+)\/(?:[A-Za-z0-9_]{1,20}\/)?status(?:es)?\/(\d{5,25})/i
  );
  if (match) return match[1];

  const loose = raw.match(/\/status(?:es)?\/(\d{5,25})/i);
  if (loose) return loose[1];

  const idOnly = raw.match(/(\d{15,25})/);
  return idOnly ? idOnly[1] : null;
}

export function tweetUrl(tweetId) {
  return `https://x.com/i/status/${tweetId}`;
}

export function clampItems(value) {
  const number = Number.parseInt(value, 10);
  if (!Number.isFinite(number) || number <= 0) return DEFAULT_MAX_ITEMS;
  return Math.min(Math.max(number, MIN_ITEMS), MAX_ITEMS);
}

/**
 * One Apify run covers every pasted post. Replies of every post come back in a
 * single dataset and are grouped again per post using `sourceTweetId`.
 */
export async function startRepliesRun(tweetIds, perPostLimit) {
  const budget = perPostLimit * tweetIds.length + tweetIds.length;

  const response = await fetch(
    `${API_ROOT}/acts/${ACTOR_SLUG}/runs?token=${token()}&memory=1024&timeout=300`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        tweetIds,
        maxItems: budget,
        maxItemsPerTarget: perPostLimit + 1,
        includeOriginalPost: true,
        includeTargetMetadata: true,
        dedupeAcrossTargets: true,
        scope: "all",
        outputMode: "compact",
        outputPreset: "flat",
      }),
      cache: "no-store",
    }
  );

  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload?.data) {
    const message = payload?.error?.message || `Apify rejected the run (${response.status}).`;
    throw new Error(message);
  }

  return {
    runId: payload.data.id,
    datasetId: payload.data.defaultDatasetId,
    status: payload.data.status,
  };
}

export async function getRun(runId) {
  const response = await fetch(`${API_ROOT}/actor-runs/${runId}?token=${token()}`, {
    cache: "no-store",
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload?.data) {
    const message = payload?.error?.message || `Could not read run ${runId}.`;
    throw new Error(message);
  }
  return {
    runId: payload.data.id,
    status: payload.data.status,
    datasetId: payload.data.defaultDatasetId,
    statusMessage: payload.data.statusMessage || "",
  };
}

async function readDatasetChunk(datasetId, offset) {
  const response = await fetch(
    `${API_ROOT}/datasets/${datasetId}/items?token=${token()}&clean=true&limit=${CHUNK_SIZE}&offset=${offset}`,
    { cache: "no-store" }
  );
  if (!response.ok) {
    throw new Error(`Could not read dataset ${datasetId} (${response.status}).`);
  }
  const items = await response.json();
  return Array.isArray(items) ? items : [];
}

export function classifyStatus(status) {
  if (status === "SUCCEEDED") return "ready";
  if (["FAILED", "ABORTED", "ABORTING", "TIMED-OUT"].includes(status)) return "failed";
  return "running";
}

function isVerifiedAuthor(item) {
  if (item.authorVerified === true) return true;
  if (item.authorIsVerified === true) return true;
  if (item.authorIsBlueVerified === true) return true;
  const type = String(item.authorVerifiedType || "").toLowerCase();
  return type !== "" && type !== "none";
}

function readAuthor(item) {
  const userName = String(
    item.authorUsername || item.author?.userName || item.author?.username || ""
  ).trim();
  if (!userName) return null;

  return {
    userName,
    name: String(item.authorName || item.author?.name || userName).trim(),
    verified: isVerifiedAuthor(item),
    verifiedType: item.authorVerifiedType || null,
    followers: Number(item.authorFollowers ?? item.author?.followers) || 0,
    avatar: item.authorProfilePicture || item.author?.profilePicture || null,
    url: `https://x.com/${userName}`,
    replies: 1,
    isOP: false,
  };
}

/**
 * Collects dataset pages and folds them into one de-duplicated author list per
 * post, so a large thread never has to sit in memory in raw form.
 */
export function createAccumulator(tweetIds) {
  const wanted = tweetIds.map((id) => String(id));
  const posts = new Map(
    wanted.map((id) => [id, { tweetId: id, url: tweetUrl(id), replyCount: 0, authors: new Map(), root: null, ignored: 0 }])
  );
  let scanned = 0;
  let demo = 0;

  function resolveTarget(item) {
    const direct = item.sourceTweetId != null ? String(item.sourceTweetId) : "";
    if (direct && posts.has(direct)) return direct;

    for (const id of wanted) {
      if (String(item.conversationId) === id) return id;
      if (String(item.rootTweetId) === id) return id;
      if (String(item.inReplyToId) === id && String(item.sourceTweetId || "") === "") return id;
    }
    return "";
  }

  function add(items) {
    for (const item of items) {
      if (!item || typeof item !== "object") continue;
      scanned += 1;
      if (item.demo === true) {
        demo += 1;
        continue;
      }

      const targetId = resolveTarget(item);
      if (!targetId) continue;
      const post = posts.get(targetId);

      const itemId = item.id != null ? String(item.id) : "";
      const isRoot = item.isOriginalPost === true || (itemId && itemId === targetId);

      if (isRoot) {
        post.root = {
          text: String(item.text || "").slice(0, 280),
          url: item.url || tweetUrl(targetId),
          authorName: item.authorName || item.author?.name || "",
          authorUserName: item.authorUsername || item.author?.userName || "",
          createdAt: item.createdAt || null,
        };
        continue;
      }

      post.replyCount += 1;

      const author = readAuthor(item);
      if (!author) continue;

      const key = author.userName.toLowerCase();
      const existing = post.authors.get(key);
      if (existing) {
        existing.replies += 1;
        existing.followers = Math.max(existing.followers, author.followers);
        if (!existing.verified && author.verified) {
          existing.verified = true;
          existing.verifiedType = author.verifiedType || existing.verifiedType;
        }
        continue;
      }
      post.authors.set(key, author);
    }
  }

  /** Marks the author of the source post itself. */
  function finish() {
    const result = [];
    for (const post of posts.values()) {
      if (post.root?.authorUserName) {
        const op = post.authors.get(post.root.authorUserName.toLowerCase());
        if (op) op.isOP = true;
      }
      result.push({
        tweetId: post.tweetId,
        url: post.url,
        replyCount: post.replyCount,
        scanned: post.authors.size,
        authors: [...post.authors.values()],
        root: post.root,
      });
    }
    return { posts: result, scanned, demo, allDemo: demo > 0 && demo === scanned };
  }

  return { add, finish };
}

/** Streams a whole dataset through an accumulator in fixed-size pages. */
export async function collectReplies(datasetId, tweetIds) {
  const accumulator = createAccumulator(tweetIds);
  let offset = 0;

  for (let page = 0; page < 20; page += 1) {
    const items = await readDatasetChunk(datasetId, offset);
    if (!items.length) break;
    accumulator.add(items);
    offset += items.length;
    if (items.length < CHUNK_SIZE) break;
  }

  return accumulator.finish();
}
