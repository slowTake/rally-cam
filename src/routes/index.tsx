import { createFileRoute, Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Ping Pong Highlights — Record & auto-clip rallies" },
      {
        name: "description",
        content:
          "Record a ping pong match from your phone and get rally highlights automatically.",
      },
      { property: "og:title", content: "Ping Pong Highlights" },
      {
        property: "og:description",
        content: "Record a match, get rally highlights.",
      },
    ],
  }),
  component: Index,
});

function DropI({ delay = 0 }: { delay?: number }) {
  return (
    <span className="relative inline-block align-baseline">
      <span aria-hidden className="invisible">i</span>
      {/* stem */}
      <span
        aria-hidden
        className="absolute left-0 right-0 bottom-0"
        style={{ height: "0.62em", background: "currentColor" }}
      />
      {/* dot drops in */}
      <span
        aria-hidden
        className="absolute left-1/2 -translate-x-1/2 rounded-full"
        style={{
          width: "0.18em",
          height: "0.18em",
          background: "currentColor",
          top: "0.04em",
          animation: `drop-i 0.9s cubic-bezier(0.5,1.6,0.4,1) ${delay}s both`,
        }}
      />
    </span>
  );
}

function Index() {
  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col items-center justify-center px-6">
      <div className="max-w-md w-full text-center space-y-8">
        <div className="space-y-3">
          <h1 className="section-heading text-4xl sm:text-5xl tracking-tight normal-case">
            P<DropI />NG PONG H<DropI delay={0.15} />GHL<DropI delay={0.3} />GHTS
          </h1>
          <p className="text-muted-foreground text-lg">
            Record a match, get rally highlights.
          </p>
        </div>

        <div className="space-y-3">
          <Link to="/record" className="inline-block w-full">
            <Button size="lg" className="w-full h-14 text-base">
              Start Recording
            </Button>
          </Link>
          <Link to="/gallery" className="inline-block w-full">
            <Button variant="secondary" size="lg" className="w-full h-12 text-base">
              View Gallery
            </Button>
          </Link>
        </div>

        <p className="text-sm text-muted-foreground">
          Tip: turn your phone sideways for best results.
        </p>
      </div>
    </div>
  );
}
