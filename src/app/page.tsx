import { TripsApp } from "@/components/trips-app";

export const dynamic = "force-dynamic";

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const params = await searchParams;
  const error = typeof params.error === "string" ? params.error.slice(0, 80) : "";
  return <TripsApp initialError={error} />;
}
