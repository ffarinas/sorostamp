/* ═══════════════════════════════════════════════════════════════════
   Sorostamp — public proof page (the SSR win).
   SERVER component: reads the REAL attestation from the live Soroban
   testnet contract by `id`, exports generateMetadata() for a shareable,
   per-proof title + OG, then renders the client proof view with the data.
   In Next.js 16, `params` is a Promise and must be awaited.
   ═══════════════════════════════════════════════════════════════════ */
import type { Metadata } from "next";
import { PublicProof } from "@/components/verify";
import { getAttestation, resolveSubjectFromQuery, resolveBodyFromQuery } from "@/lib/soroban";
import { NET } from "@/lib/data";

type Props = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ s?: string; f?: string; c?: string }>;
};

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const { id } = await params;
  const { s, f, c } = await searchParams;
  const att = await getAttestation(id, c === "body" ? NET.verifierBody : NET.verifier);

  // Per-proof title when the attestation exists on-chain; otherwise generic.
  const title = att
    ? `Verified proof · sealed in ledger ${att.ledger} — Sorostamp`
    : "Verified proof — Sorostamp";
  const description = att
    ? `A fact proven from a DKIM-signed email and sealed on Stellar (ledger ${att.ledger}) with Sorostamp — verifiable on-chain, with the email never revealed.`
    : "A fact proven from a DKIM-signed email and sealed on Stellar with Sorostamp — verifiable on-chain, with the email never revealed.";

  // Dynamic OG image that renders the proof card (the revealed fact + verified
  // badge), so the shared link looks like a proof — not a favicon.
  const og = new URLSearchParams();
  if (s) og.set("s", s);
  if (f) og.set("f", f);
  if (c) og.set("c", c);
  const ogImage = `/api/og?${og.toString()}`;

  return {
    title,
    description,
    alternates: { canonical: `/p/${id}` },
    openGraph: {
      title,
      description,
      url: `https://sorostamp.com/p/${id}`,
      siteName: "Sorostamp",
      type: "website",
      images: [{ url: ogImage, width: 1200, height: 630 }],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [ogImage],
    },
  };
}

export default async function PublicProofPage({ params, searchParams }: Props) {
  const { id } = await params;
  const { s, f, c } = await searchParams;
  const isBody = c === "body";
  const att = await getAttestation(id, isBody ? NET.verifierBody : NET.verifier);
  // Decode + verify the readable statement on the server (the decode utilities
  // are server-only), then hand the plain result to the client view. The
  // reveal travels in `?s=` (the packed public signals) and is re-verified
  // here against the on-chain statement_hash, so it works for ANY proof.
  const subject = isBody ? null : resolveSubjectFromQuery(att, s);
  const body = isBody ? resolveBodyFromQuery(att, s) : null;
  // Pass `s` through too: if the server read came back empty (e.g. the Worker
  // couldn't reach the RPC), the client re-reads on-chain and re-verifies the
  // reveal in the browser. See lib/soroban-client.
  return (
    <PublicProof
      id={id}
      attestation={att}
      subject={subject}
      body={body}
      sParam={s ?? null}
      field={f ?? null}
    />
  );
}
