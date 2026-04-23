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
