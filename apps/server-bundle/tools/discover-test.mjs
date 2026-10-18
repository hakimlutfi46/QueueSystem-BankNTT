#!/usr/bin/env node
// Sends a discovery request and prints every server that answers.
//
//   node discover-test.mjs                     broadcast to 255.255.255.255:41234
//   node discover-test.mjs 192.168.1.20        unicast to one host
//   node discover-test.mjs 127.0.0.1 41299     custom port (local tests)
//   --timeout=2000                             wait time in ms (default 1500)
//   --bad                                      also send malformed datagrams (must be ignored)
//
// Exit code 0 when at least one valid reply arrived, 1 otherwise.
import dgram from "node:dgram";

const args = process.argv.slice(2).filter((arg) => !arg.startsWith("--"));
const flags = process.argv.slice(2).filter((arg) => arg.startsWith("--"));
const host = args[0] || "255.255.255.255";
const port = Number(args[1] || 41234);
const timeoutFlag = flags.find((flag) => flag.startsWith("--timeout="));
const timeout = timeoutFlag ? Number(timeoutFlag.split("=")[1]) : 1500;
const sendBad = flags.includes("--bad");

const socket = dgram.createSocket("udp4");
const servers = [];

socket.on("message", (buffer, remote) => {
  let message;
  try {
    message = JSON.parse(buffer.toString("utf8"));
  } catch {
    console.log(`invalid reply from ${remote.address}:${remote.port}: ${buffer.toString("utf8")}`);
    return;
  }
  if (message.type !== "bankntt-server" || message.v !== 1) {
    console.log(`unexpected reply from ${remote.address}:${remote.port}: ${JSON.stringify(message)}`);
    return;
  }
  servers.push({ address: remote.address, ...message });
  console.log(`server ${remote.address} -> http://${remote.address}:${message.port}  ${JSON.stringify(message)}`);
});

socket.bind(0, () => {
  socket.setBroadcast(true);
  const send = (text) => socket.send(Buffer.from(text), port, host);
  if (sendBad) {
    for (const bad of ["", "not json", "{}", '{"type":"bankntt-discover","v":2}', "[1,2,3]", "null", "x".repeat(4000)]) {
      send(bad);
    }
  }
  send(JSON.stringify({ type: "bankntt-discover", v: 1 }));
  setTimeout(() => {
    socket.close();
    if (servers.length === 0) console.log(`no server answered on ${host}:${port}`);
    process.exit(servers.length > 0 ? 0 : 1);
  }, timeout);
});
