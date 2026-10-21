// A stand-in for www.youtube.com. Browsers use it as their HTTP(S) proxy:
// YouTube requests get minimal fixture pages carrying the DOM and metadata the
// content script reads; every other host is refused, so tests stay offline.
// youtube.com is HSTS-preloaded, so it serves HTTPS with a throwaway
// self-signed certificate (browsers are launched with acceptInsecureCerts).
import http from "node:http";
import https from "node:https";
import { once } from "node:events";
import selfsigned from "selfsigned";

export const CREATORS = {
  ruled: { channelId: "UCruledcreator", author: "Rule Creator" },
  plain: { channelId: "UCplaincreator", author: "Plain Creator" }
};

// Video id → creator. Ids double as the paths tests navigate to.
const VIDEOS = {
  ruled: CREATORS.ruled,
  plain: CREATORS.plain,
  short: CREATORS.ruled
};

const YOUTUBE_HOSTS = new Set(["www.youtube.com", "youtube.com"]);

const json = (value) => JSON.stringify(value).replaceAll("<", "\\u003c");

function watchPage(videoId, creator, shorts) {
  const player = `<div id="movie_player" class="html5-video-player" style="position:relative;width:640px;height:360px">
      <video class="html5-main-video" width="640" height="360"></video>
    </div>`;
  const body = shorts
    ? `<ytd-reel-video-renderer is-active>${player}<a href="/channel/${creator.channelId}">${creator.author}</a></ytd-reel-video-renderer>`
    : `<ytd-watch-flexy>${player}
        <ytd-watch-metadata><div id="owner"><a href="/channel/${creator.channelId}">${creator.author}</a></div></ytd-watch-metadata>
      </ytd-watch-flexy>`;
  return `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><title>${creator.author} - YouTube</title></head>
<body>
  ${body}
  <script>var ytInitialPlayerResponse = ${json({ videoDetails: { videoId, channelId: creator.channelId, author: creator.author } })};</script>
</body>
</html>`;
}

// Serves watch pages for `videos` (video id → creator).
const handler = (videos) => (request, response) => {
  const url = new URL(request.url, `https://${request.headers.host}`);
  const shorts = url.pathname.match(/^\/shorts\/([^/]+)/);
  const videoId = shorts ? shorts[1] : url.pathname === "/watch" ? url.searchParams.get("v") : null;
  const creator = videos[videoId];
  if (!YOUTUBE_HOSTS.has(url.hostname) || !creator) {
    response.writeHead(404, { "content-type": "text/plain" }).end("not found");
    return;
  }
  response.writeHead(200, { "content-type": "text/html; charset=utf-8" }).end(watchPage(videoId, creator, Boolean(shorts)));
};

// Starts the proxy on a free local port. Returns its port and a close function.
export async function startFakeYouTube(videos = VIDEOS) {
  const pems = await selfsigned.generate([{ name: "commonName", value: "www.youtube.com" }], {
    algorithm: "sha256",
    extensions: [{ name: "subjectAltName", altNames: [...YOUTUBE_HOSTS].map((value) => ({ type: 2, value })) }]
  });
  const handle = handler(videos);
  const tlsServer = https.createServer({ key: pems.private, cert: pems.cert }, handle);
  const proxy = http.createServer(handle);
  const sockets = new Set();
  const track = (socket) => {
    sockets.add(socket);
    socket.on("close", () => sockets.delete(socket));
  };
  proxy.on("connection", track);

  // HTTPS through a proxy arrives as CONNECT host:443. Hand YouTube tunnels to
  // the TLS server; refuse the rest (browser telemetry, update checks, …).
  proxy.on("connect", (request, socket) => {
    const [host] = request.url.split(":");
    if (!YOUTUBE_HOSTS.has(host)) {
      socket.end("HTTP/1.1 403 Forbidden\r\n\r\n");
      return;
    }
    socket.write("HTTP/1.1 200 Connection Established\r\n\r\n");
    tlsServer.emit("connection", socket);
  });

  proxy.listen(0, "127.0.0.1");
  await once(proxy, "listening");
  return {
    port: proxy.address().port,
    async close() {
      for (const socket of sockets) socket.destroy();
      await new Promise((resolve) => proxy.close(resolve));
    }
  };
}
