import type os from "node:os";
import { describe, expect, it } from "vitest";
import { isLoopbackHost, lanAddresses, lanHosts } from "@/lib/server-address";

function nic(address: string, internal = false, family: "IPv4" | "IPv6" = "IPv4"): os.NetworkInterfaceInfo {
  return { address, family, internal, netmask: "", mac: "", cidr: null } as os.NetworkInterfaceInfo;
}

describe("server address for other devices", () => {
  it("lists LAN IPv4 addresses, private ones first, without loopback, IPv6, or link-local", () => {
    const addresses = lanAddresses({
      lo0: [nic("127.0.0.1", true)],
      en0: [nic("fe80::1", false, "IPv6"), nic("192.168.1.52")],
      utun: [nic("100.64.0.7")],
      eth1: [nic("169.254.3.4"), nic("10.70.10.67")],
    });
    expect(addresses).toEqual(["192.168.1.52", "10.70.10.67", "100.64.0.7"]);
  });

  it("keeps the port of the page that was opened", () => {
    expect(lanHosts("localhost:3000", ["192.168.1.52"])).toEqual(["192.168.1.52:3000"]);
    expect(lanHosts("antrian.lokal", ["10.0.0.2"])).toEqual(["10.0.0.2"]);
  });

  it("recognises addresses that only work on the server itself", () => {
    for (const host of ["localhost:3000", "127.0.0.1", "127.0.1.1:3000", "[::1]:3000"]) expect(isLoopbackHost(host)).toBe(true);
    for (const host of ["192.168.1.52:3000", "antrian.lokal"]) expect(isLoopbackHost(host)).toBe(false);
  });
});
