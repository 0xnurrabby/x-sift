"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";

const POLL_MS = 4000;
const MAX_POLLS = 150;
const ALL = "all";

const EXAMPLE = "https://x.com/apify/status/2111097950776721636";

function formatNumber(value) {
  const number = Number(value) || 0;
  if (number >= 1_000_000) return `${(number / 1_000_000).toFixed(number >= 10_000_000 ? 0 : 1)}M`;
  if (number >= 1_000) return `${(number / 1_000).toFixed(number >= 10_000 ? 0 : 1)}k`;
  return String(number);
}

function byFollowers(a, b) {
  return b.followers - a.followers || b.replies - a.replies || a.userName.localeCompare(b.userName);
}

function Stamp({ size = 13 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="#3b82f6"
        d="M12 1.6l2.6 2 3.2-.4 1.2 3 2.9 1.5-1.3 3 1.3 3-2.9 1.5-1.2 3-3.2-.4-2.6 2-2.6-2-3.2.4-1.2-3L.9 14.3l1.3-3-1.3-3L3.8 6.7l1.2-3 3.2.4L12 1.6z"
      />
      <path fill="#fff" d="M10.9 14.6l-2.4-2.4-1.2 1.2 3.6 3.6 6-6-1.2-1.2-4.8 4.8z" />
    </svg>
  );
}

function Mark() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="1" y="1" width="22" height="22" rx="7" fill="#fff" />
      <path d="M7 7h2.6l8 10H15L7 7Zm10 0-4 5m-6 5 4-5" stroke="#000" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

export default function Home() {
  const router = useRouter();

  const [urlsText, setUrlsText] = useState("");
  const [verifiedOnly, setVerifiedOnly] = useState(true);
  const [minFollowers, setMinFollowers] = useState(1000);
  const [dedupe, setDedupe] = useState(true);
  const [maxItems, setMaxItems] = useState(500);

  const [scan, setScan] = useState(null);
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [active, setActive] = useState(ALL);

  const timer = useRef(null);
  const ticketRef = useRef(0);

  useEffect(() => () => clearTimeout(timer.current), []);

  const poll = useCallback(async (runId, tweetIds, ticket, attempt) => {
    try {
      const query = new URLSearchParams({ run: runId, tweets: tweetIds.join(",") });
      const response = await fetch(`/api/scan?${query.toString()}`, { cache: "no-store" });
      const data = await response.json().catch(() => ({}));
      if (ticket !== ticketRef.current) return;

      if (!response.ok) {
        setError(data.error || "Lost contact with the scanner.");
        setScanning(false);
        return;
      }

      if (data.status === "running") {
        if (attempt < MAX_POLLS) {
          timer.current = setTimeout(() => poll(runId, tweetIds, ticket, attempt + 1), POLL_MS);
        } else {
          setScanning(false);
          setError("The Apify run is taking much longer than usual. Try again in a moment.");
        }
        return;
      }

      if (data.status === "failed") {
        setError(data.error || "The Apify run failed.");
        setScan((current) => (current ? { ...current, status: "failed" } : current));
        setScanning(false);
        return;
      }

      setScan((current) =>
        current
          ? {
              ...current,
              status: "ready",
              posts: data.posts || [],
              scanned: data.scanned || 0,
            }
          : current
      );
      setScanning(false);
    } catch (cause) {
      if (ticket !== ticketRef.current) return;
      setError(String(cause.message || cause));
      setScanning(false);
    }
  }, []);

  async function runScan(event) {
    event.preventDefault();
    if (scanning) return;

    const urls = urlsText
      .split(/[\n,\s]+/)
      .map((value) => value.trim())
      .filter(Boolean);

    if (!urls.length) {
      setError("Paste at least one X post link first.");
      return;
    }

    clearTimeout(timer.current);
    const ticket = ticketRef.current + 1;
    ticketRef.current = ticket;

    setError("");
    setNotice("");
    setActive(ALL);
    setScanning(true);
    setScan(null);

    try {
      const response = await fetch("/api/scan", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ urls, maxItems: Number(maxItems) || undefined }),
      });
      const data = await response.json().catch(() => ({}));
      if (ticket !== ticketRef.current) return;

      if (!response.ok) {
        setError(data.error || "Could not start the scan.");
        setScanning(false);
        return;
      }

      setScan({
        runId: data.runId,
        status: "running",
        targets: data.targets || [],
        invalid: data.invalid || [],
        posts: [],
        scanned: 0,
      });

      if (data.invalid?.length) {
        setNotice(`Skipped ${data.invalid.length} link(s) that are not X post links.`);
      }

      poll(
        data.runId,
        (data.targets || []).map((target) => target.tweetId),
        ticket,
        0
      );
    } catch (cause) {
      if (ticket !== ticketRef.current) return;
      setError(String(cause.message || cause));
      setScanning(false);
    }
  }

  async function signOut() {
    await fetch("/api/logout", { method: "POST" });
    router.replace("/login");
    router.refresh();
  }

  const threshold = Number(minFollowers) || 0;

  const passes = useCallback(
    (author) => {
      if (verifiedOnly && !author.verified) return false;
      if (threshold > 0 && author.followers < threshold) return false;
      return true;
    },
    [verifiedOnly, threshold]
  );

  const posts = useMemo(() => scan?.posts || [], [scan]);

  const perPost = useMemo(
    () =>
      posts.map((post) => ({
        key: post.tweetId,
        label: post.root?.authorUserName ? `@${post.root.authorUserName}` : post.tweetId,
        post,
        authors: (post.authors || []).filter(passes).sort(byFollowers),
      })),
    [posts, passes]
  );

  const combined = useMemo(() => {
    const map = new Map();
    for (const post of posts) {
      for (const author of post.authors || []) {
        if (!passes(author)) continue;
        const key = dedupe
          ? author.userName.toLowerCase()
          : `${author.userName.toLowerCase()}::${post.tweetId}`;
        const existing = map.get(key);
        if (existing) {
          existing.replies += author.replies;
          existing.posts += 1;
          existing.followers = Math.max(existing.followers, author.followers);
        } else {
          map.set(key, { ...author, posts: 1 });
        }
      }
    }
    return [...map.values()].sort(byFollowers);
  }, [posts, passes, dedupe]);

  const stats = useMemo(() => {
    const unique = new Set();
    let replies = 0;
    for (const post of posts) {
      replies += post.replyCount || 0;
      for (const author of post.authors || []) unique.add(author.userName.toLowerCase());
    }
    return { replies, commenters: unique.size, matched: combined.length };
  }, [posts, combined.length]);

  const activePost = perPost.find((entry) => entry.key === active) || null;
  const rows = active === ALL ? combined : activePost?.authors || [];
  const usernameText = useMemo(() => rows.map((row) => row.userName).join("\n"), [rows]);

  useEffect(() => {
    if (active !== ALL && !perPost.some((entry) => entry.key === active)) setActive(ALL);
  }, [active, perPost]);

  async function copyList() {
    if (!usernameText) return;
    try {
      await navigator.clipboard.writeText(usernameText);
      setNotice(`Copied ${rows.length} username${rows.length === 1 ? "" : "s"} to the clipboard.`);
    } catch {
      setNotice("Clipboard was blocked by the browser. Use “Download .txt” instead.");
    }
  }

  function saveFile(content, filename, type) {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  function downloadTxt() {
    if (!usernameText) return;
    const stamp = new Date().toISOString().slice(0, 10);
    saveFile(`${usernameText}\n`, `x-sift-usernames-${stamp}.txt`, "text/plain;charset=utf-8");
    setNotice(`Exported ${rows.length} username${rows.length === 1 ? "" : "s"} as .txt.`);
  }

  function downloadCsv() {
    if (!rows.length) return;
    const header = ["username", "name", "verified", "followers", "replies", "posts", "profile_url"];
    const lines = rows.map((row) =>
      [
        row.userName,
        row.name,
        row.verified ? "yes" : "no",
        row.followers,
        row.replies,
        row.posts || 1,
        `https://x.com/${row.userName}`,
      ]
        .map((value) => `"${String(value).replace(/"/g, '""')}"`)
        .join(",")
    );
    const stamp = new Date().toISOString().slice(0, 10);
    saveFile([header.join(","), ...lines].join("\n"), `x-sift-usernames-${stamp}.csv`, "text/csv;charset=utf-8");
    setNotice(`Exported ${rows.length} row${rows.length === 1 ? "" : "s"} as .csv.`);
  }

  const ready = scan?.status === "ready";
  const postById = new Map(posts.map((post) => [post.tweetId, post]));

  return (
    <div className="shell">
      <header className="nav">
        <div className="wrap nav-inner">
          <div className="brand">
            <Mark />
            <span>x-sift</span>
            <span className="brand-sub">reply username extractor</span>
          </div>
          <div className="nav-right">
            <span className="nav-user">private access</span>
            <button className="btn" type="button" onClick={signOut}>
              Sign out
            </button>
          </div>
        </div>
      </header>

      <main className="wrap" style={{ flex: "1 1 auto", paddingBottom: 40 }}>
        <section className="hero">
          <h1>
            Every username that replied,
            <br />
            <em>sorted and filtered.</em>
          </h1>
          <p>
            Paste one or more X post links. x-sift reads the whole reply thread and hands back a
            clean list of usernames — filtered by X verification and follower count.
          </p>
          <div className="hero-tags">
            <span className="tag">apify run · xquik/x-reply-scraper</span>
            <span className="tag">X verified only</span>
            <span className="tag">min followers</span>
            <span className="tag">.txt · .csv · copy</span>
          </div>
        </section>

        <form className="panel" onSubmit={runScan}>
          <div className="panel-head">
            <span className="panel-title">01 — Post links</span>
            <button
              type="button"
              className="btn"
              onClick={() => setUrlsText(EXAMPLE)}
              disabled={scanning}
            >
              Use example
            </button>
          </div>
          <div className="panel-body">
            <textarea
              className="textarea"
              value={urlsText}
              onChange={(event) => setUrlsText(event.target.value)}
              spellCheck={false}
              placeholder={"One post link per line, up to 10 posts\nhttps://x.com/user/status/1234567890"}
            />

            <div className="controls">
              <label className={`switch${verifiedOnly ? " on" : ""}`}>
                <input
                  type="checkbox"
                  checked={verifiedOnly}
                  onChange={(event) => setVerifiedOnly(event.target.checked)}
                />
                X verified only
              </label>

              <label className={`switch${threshold > 0 ? " on" : ""}`}>
                <input
                  type="checkbox"
                  checked={threshold > 0}
                  onChange={(event) => setMinFollowers(event.target.checked ? 1000 : 0)}
                />
                Min followers
                <input
                  className="number"
                  type="number"
                  min="0"
                  step="100"
                  value={minFollowers}
                  onChange={(event) => setMinFollowers(Math.max(0, Number(event.target.value) || 0))}
                  onClick={(event) => event.preventDefault()}
                  aria-label="Minimum followers"
                />
              </label>

              <label className={`switch${dedupe ? " on" : ""}`}>
                <input
                  type="checkbox"
                  checked={dedupe}
                  onChange={(event) => setDedupe(event.target.checked)}
                />
                De-duplicate
              </label>

              <label className="switch on">
                Max replies / post
                <input
                  className="number"
                  type="number"
                  min="25"
                  max="2000"
                  step="25"
                  value={maxItems}
                  onChange={(event) => setMaxItems(Number(event.target.value) || 500)}
                  aria-label="Maximum replies per post"
                />
              </label>
            </div>

            <div className="actions">
              <button className="btn btn-primary btn-lg" type="submit" disabled={scanning}>
                {scanning ? <span className="spin" /> : null}
                {scanning ? "Scanning…" : "Scan replies"}
              </button>
            </div>

            {error ? <div className="alert">{error}</div> : null}
            {notice ? <div className="alert alert-info">{notice}</div> : null}

            <p className="note">
              Replies are read through Apify and billed to your account · very large threads may
              return less than the total reply count.
            </p>
          </div>
        </form>

        {scan ? (
          <section className="panel">
            <div className="panel-head">
              <span className="panel-title">02 — Apify run</span>
              <span className="panel-title">
                {ready ? `${scan.scanned} rows scanned` : scan.status}
              </span>
            </div>
            <div className="panel-body">
              <div className="jobs">
                <div className="job">
                  <span className={`dot ${scan.status}`} />
                  <span className="status-word">{scan.status === "ready" ? "done" : scan.status}</span>
                  <span className="job-url">
                    {scan.targets.length} post{scan.targets.length === 1 ? "" : "s"} · run{" "}
                    {scan.runId}
                  </span>
                  <span className="status-word">
                    {scanning ? "live" : ready ? "complete" : "stopped"}
                  </span>
                </div>

                {scan.targets.map((target) => {
                  const post = postById.get(target.tweetId);
                  return (
                    <div className="job" key={target.tweetId}>
                      <span className={`dot ${ready ? "ready" : "running"}`} />
                      <span className="job-url">{target.url}</span>
                      <span className="status-word">
                        {post
                          ? `${post.replyCount} replies · ${post.authors.length} users`
                          : ready
                            ? "no replies found"
                            : "reading"}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          </section>
        ) : null}

        {ready ? (
          <section className="stats section">
            <div className="stat">
              <div className="stat-value">{posts.length}</div>
              <div className="stat-label">posts scanned</div>
            </div>
            <div className="stat">
              <div className="stat-value">{stats.replies.toLocaleString()}</div>
              <div className="stat-label">replies read</div>
            </div>
            <div className="stat">
              <div className="stat-value">{stats.commenters.toLocaleString()}</div>
              <div className="stat-label">unique commenters</div>
            </div>
            <div className="stat">
              <div className="stat-value">{stats.matched.toLocaleString()}</div>
              <div className="stat-label">matched filters</div>
            </div>
          </section>
        ) : null}

        {ready ? (
          <section className="panel">
            <div className="panel-head">
              <span className="panel-title">03 — Usernames</span>
              <div className="nav-right">
                <button className="btn" type="button" onClick={copyList} disabled={!rows.length}>
                  Copy
                </button>
                <button className="btn" type="button" onClick={downloadTxt} disabled={!rows.length}>
                  .txt
                </button>
                <button className="btn" type="button" onClick={downloadCsv} disabled={!rows.length}>
                  .csv
                </button>
              </div>
            </div>

            <div className="tabs">
              <button
                type="button"
                className={`tab${active === ALL ? " active" : ""}`}
                onClick={() => setActive(ALL)}
              >
                All posts <span className="tab-count">{combined.length}</span>
              </button>
              {perPost.map((entry) => (
                <button
                  key={entry.key}
                  type="button"
                  className={`tab${active === entry.key ? " active" : ""}`}
                  onClick={() => setActive(entry.key)}
                  title={entry.post.url}
                >
                  {entry.label} <span className="tab-count">{entry.authors.length}</span>
                </button>
              ))}
            </div>

            {activePost?.post.root?.text ? (
              <div className="post-ref">
                <span className="badge">source post</span>
                <span className="post-ref-text">{activePost.post.root.text}</span>
                <a className="badge" href={activePost.post.url} target="_blank" rel="noreferrer">
                  open on X ↗
                </a>
              </div>
            ) : null}

            {rows.length ? (
              <div className="table-scroll">
                <table className="list">
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>Account</th>
                      <th className="col-followers">Followers</th>
                      <th>Replies</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row, index) => (
                      <tr key={`${row.userName}-${index}`}>
                        <td className="rank">{index + 1}</td>
                        <td>
                          <div className="who">
                            {row.avatar ? (
                              <img className="avatar" src={row.avatar} alt="" loading="lazy" />
                            ) : (
                              <span className="avatar" />
                            )}
                            <div className="who-text">
                              <div className="who-name">
                                <span>{row.name}</span>
                                {row.verified ? <Stamp /> : null}
                                {row.isOP ? <span className="badge badge-op">OP</span> : null}
                                {active === ALL && row.posts > 1 ? (
                                  <span className="badge badge-posts">{row.posts} posts</span>
                                ) : null}
                              </div>
                              <a
                                className="handle"
                                href={`https://x.com/${row.userName}`}
                                target="_blank"
                                rel="noreferrer"
                              >
                                @{row.userName}
                              </a>
                            </div>
                          </div>
                        </td>
                        <td className="num col-followers">{formatNumber(row.followers)}</td>
                        <td className="num">{row.replies}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="empty">
                No commenters match the current filters.
                <br />
                Loosen “X verified only” or lower the follower threshold.
              </div>
            )}

            {usernameText ? (
              <div className="panel-body" style={{ borderTop: "1px solid #1a1a1a" }}>
                <span className="panel-title">Plain text output</span>
                <textarea
                  className="textarea"
                  style={{ marginTop: 10, minHeight: 110 }}
                  value={usernameText}
                  readOnly
                  spellCheck={false}
                />
              </div>
            ) : null}
          </section>
        ) : null}
      </main>

      <footer className="footer">
        <div className="wrap nav-inner" style={{ height: "auto", flexWrap: "wrap", gap: 10 }}>
          <span>x-sift · private build · runs on apify</span>
          <span>password protected · single-user</span>
        </div>
      </footer>
    </div>
  );
}
