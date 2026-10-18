"use strict";
// LAN discovery responder so kiosks, TVs and counter PCs can find this server without an IP address.
//
// Contract (shared with the client apps, keep in sync):
//   UDP port 41234, bound on 0.0.0.0.
//   Request : {"type":"bankntt-discover","v":1}   (broadcast or unicast)
//   Reply   : {"type":"bankntt-server","v":1,"name":<branch name>,"port":3000,"version":<app version>}
//             sent unicast to the sender's address and port.
// Anything else is ignored. Replies are rate limited per sender address.

const dgram = require("node:dgram");

const DISCOVERY_PORT = 41234;
const MAX_REQUEST_BYTES = 512;
const RATE_LIMIT_PER_SECOND = 10;

function isDiscoverRequest(buffer) {
  if (!buffer || buffer.length === 0 || buffer.length > MAX_REQUEST_BYTES) return false;
  let message;
  try {
    message = JSON.parse(buffer.toString("utf8"));
  } catch {
    return false;
  }
  return Boolean(message) && typeof message === "object" && message.type === "bankntt-discover" && message.v === 1;
}

/** Token bucket per sender address: RATE_LIMIT_PER_SECOND replies per second, small burst allowed. */
function createRateLimiter(perSecond = RATE_LIMIT_PER_SECOND) {
  const buckets = new Map();
  function allow(key, now = Date.now()) {
    let bucket = buckets.get(key);
    if (!bucket) {
      if (buckets.size > 10000) buckets.clear(); // never grow without bound
      bucket = { tokens: perSecond, at: now };
      buckets.set(key, bucket);
    }
    bucket.tokens = Math.min(perSecond, bucket.tokens + ((now - bucket.at) / 1000) * perSecond);
    bucket.at = now;
    if (bucket.tokens < 1) return false;
    bucket.tokens -= 1;
    return true;
  }
  function sweep(now = Date.now()) {
    for (const [key, bucket] of buckets) if (now - bucket.at > 10000) buckets.delete(key);
  }
  return { allow, sweep };
}

/**
 * @param {object} options
 * @param {() => string} options.getName current branch name
 * @param {number} options.httpPort
 * @param {string} options.version
 * @param {number} [options.port] UDP port (default 41234)
 * @param {string} [options.host] bind address (default 0.0.0.0)
 * @param {(line: string) => void} [options.log]
 * @returns {Promise<{ close: () => Promise<void>, port: number }>}
 */
function startDiscovery(options) {
  const log = options.log || ((line) => console.log(line));
  const limiter = createRateLimiter();
  const socket = dgram.createSocket({ type: "udp4", reuseAddr: false });
  const sweeper = setInterval(() => limiter.sweep(), 30000);
  sweeper.unref();

  socket.on("message", (buffer, remote) => {
    try {
      if (!isDiscoverRequest(buffer)) return;
      if (!limiter.allow(remote.address)) return;
      let name = "";
      try {
        name = String(options.getName() || "");
      } catch {
        name = "";
      }
      const reply = Buffer.from(
        JSON.stringify({
          type: "bankntt-server",
          v: 1,
          name: name || require("node:os").hostname(),
          port: options.httpPort,
          version: options.version,
        }),
      );
      socket.send(reply, remote.port, remote.address, (error) => {
        if (error) log(`discovery: reply to ${remote.address}:${remote.port} failed: ${error.message}`);
      });
    } catch (error) {
      log(`discovery: ignored bad datagram: ${error && error.message ? error.message : error}`);
    }
  });

  return new Promise((resolve, reject) => {
    let listening = false;
    socket.on("error", (error) => {
      if (!listening) {
        clearInterval(sweeper);
        reject(error);
        return;
      }
      // Keep the web server alive: a broken discovery socket only means clients need the IP address.
      log(`discovery: socket error: ${error.message}`);
    });
    socket.bind(options.port || DISCOVERY_PORT, options.host || "0.0.0.0", () => {
      listening = true;
      const address = socket.address();
      log(`discovery: listening on udp ${address.address}:${address.port}`);
      resolve({
        port: address.port,
        close: () =>
          new Promise((done) => {
            clearInterval(sweeper);
            socket.close(() => done());
          }),
      });
    });
  });
}

module.exports = { startDiscovery, isDiscoverRequest, createRateLimiter, DISCOVERY_PORT };
