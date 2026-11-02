import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "Witness Portraits (devnet scaffold) - RELIC.FUN",
  description: "Placeholder gallery for the Witness Portraits pixel collection. Devnet only.",
  robots: { index: false, follow: false },
}

const PORTRAITS = [
  { id: "01", slug: "woman-with-jar", name: "Woman with the Clay Jar", description: "Dark-haired woman in a brown robe with a copper earring, carrying a clay water jar." },
  { id: "02", slug: "tablet-scribe", name: "Tablet Scribe", description: "Bearded man in a blue robe pressing cuneiform into a wet clay tablet." },
  { id: "03", slug: "shepherd-boy", name: "Shepherd Boy", description: "Boy in a striped wool cloak with a crook and a lamb under one arm." },
  { id: "04", slug: "potter", name: "Potter", description: "Older man with clay-covered hands and a leather apron, a half-built jar on the wheel." },
  { id: "05", slug: "weaver", name: "Weaver", description: "Woman in an indigo headscarf holding a loom shuttle with red and ochre threads." },
  { id: "06", slug: "spice-merchant", name: "Spice Merchant", description: "Turbaned merchant with rings and a small brass scale, sacks of saffron and cumin." },
  { id: "07", slug: "well-keeper-girl", name: "Well-Keeper Girl", description: "Girl with braids holding a rope and a bronze bucket at the village well." },
  { id: "08", slug: "camel-driver", name: "Camel-Driver", description: "Caravan driver with a sand scarf over his mouth, a camel head beside him at sunset." },
  { id: "09", slug: "oil-lamp-maker", name: "Oil-Lamp Maker", description: "Woman with copper earrings holding a lit clay oil lamp; its glow is the only light." },
  { id: "10", slug: "scribes-apprentice", name: "Scribe\u2019s Apprentice", description: "Young apprentice with a reed stylus and a cracked practice tablet." },
] as const

export default function WitnessPortraitsPage() {
  return (
    <main style={{ maxWidth: 1100, margin: "0 auto", padding: "48px 20px", color: "#eee" }}>
      <h1 style={{ fontSize: 32, marginBottom: 8 }}>Witness Portraits</h1>
      <p style={{ opacity: 0.8, marginBottom: 8 }}>
        Pixel portraits of everyday people of the ancient Near East. Scaffold only: all images are placeholders.
      </p>
      <p style={{ color: "#e0c060", marginBottom: 32 }}>Devnet only. No mainnet, no sale, no price.</p>
      <ul
        style={{
          listStyle: "none",
          padding: 0,
          display: "grid",
          gap: 20,
          gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
        }}
      >
        {PORTRAITS.map((p) => (
          <li key={p.id} style={{ background: "#15151d", borderRadius: 12, padding: 12 }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={`/witness-portraits/images/${p.id}-${p.slug}.svg`}
              alt={`${p.name} (placeholder)`}
              width={240}
              height={240}
              style={{ width: "100%", height: "auto", imageRendering: "pixelated", borderRadius: 8 }}
            />
            <h2 style={{ fontSize: 16, margin: "10px 0 4px" }}>
              #{p.id} {p.name}
            </h2>
            <p style={{ fontSize: 13, opacity: 0.75, margin: 0 }}>{p.description}</p>
          </li>
        ))}
      </ul>
    </main>
  )
}