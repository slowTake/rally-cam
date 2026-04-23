import { createFileRoute, Link } from "@tanstack/react-router";

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
    <div className="relative min-h-screen overflow-hidden bg-background text-foreground flex flex-col items-center justify-center px-6">
      <img
        src="https://media1.tenor.com/m/LqNPvLVdzHoAAAAC/cat-ping.gif"
        alt=""
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 w-full h-full object-cover -z-20"
      />
      <div className="pointer-events-none absolute inset-0 bg-background/70 -z-10" />
      <div className="max-w-md w-full text-center space-y-8 relative z-10">
        <div className="space-y-3">
          <h1
            className="section-heading text-4xl sm:text-5xl tracking-tight fade-up"
            style={{ animationDelay: "0s" }}
          >
            Ping Pong
            <br />
            Highlights
          </h1>
          <p
            className="text-muted-foreground text-lg fade-up"
            style={{ animationDelay: "0.2s" }}
          >
            Record a match, get rally highlights.
          </p>
        </div>

        <div className="space-y-3">
          <Link to="/record" className="inline-block w-full fade-up" style={{ animationDelay: "0.4s" }}>
            <button type="button" className="start-btn" data-label="START RECORDING" aria-label="Start Recording" />
          </Link>
          <Link to="/gallery" className="inline-block w-full fade-up" style={{ animationDelay: "0.55s" }}>
            <button type="button" className="gallery-btn" data-label="VIEW GALLERY" aria-label="View Gallery" />
          </Link>
        </div>

        <p className="text-sm text-muted-foreground fade-up" style={{ animationDelay: "0.7s" }}>
          Tip: turn your phone sideways for best results.
        </p>
      </div>
    </div>
  );
}
