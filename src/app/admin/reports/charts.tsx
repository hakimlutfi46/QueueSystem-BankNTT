"use client";

import { Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { HourBucket, RangeDay } from "@/lib/reports/types";

export function HourChart({ hours }: { hours: HourBucket[] }) {
  const data = hours.map((bucket) => ({
    jam: String(bucket.hour).padStart(2, "0"),
    jumlah: bucket.count,
  }));
  return (
    <div className="h-72 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data}>
          <CartesianGrid stroke="var(--brand-grey)" strokeOpacity={0.35} />
          <XAxis dataKey="jam" />
          <YAxis allowDecimals={false} />
          <Tooltip />
          <Bar dataKey="jumlah" name="Jumlah tiket" fill="var(--brand-navy)" />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function RangeChart({ days }: { days: RangeDay[] }) {
  const data = days.map((day) => ({
    tanggal: day.date.slice(5),
    tunggu: day.wait.averageSeconds,
    penanganan: day.handle.averageSeconds,
  }));
  return (
    <div className="h-72 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data}>
          <CartesianGrid stroke="var(--brand-grey)" strokeOpacity={0.35} />
          <XAxis dataKey="tanggal" />
          <YAxis allowDecimals={false} />
          <Tooltip />
          <Legend />
          <Line type="monotone" dataKey="tunggu" name="Rata-rata tunggu (detik)" stroke="var(--brand-navy)" strokeWidth={2} connectNulls={false} />
          <Line type="monotone" dataKey="penanganan" name="Rata-rata penanganan (detik)" stroke="var(--brand-orange)" strokeWidth={2} connectNulls={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
