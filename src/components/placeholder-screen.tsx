// Scaffold placeholder: a title only, so every screen's route exists for both lanes.
// Frontend replaces each page's body with the real screen.
export function PlaceholderScreen({ id, title }: { id: string; title: string }) {
  return (
    <main className="mx-auto max-w-3xl p-6">
      <h1 className="text-h3 font-bold">{title}</h1>
      <p className="text-body-sm opacity-70">{id} · placeholder</p>
    </main>
  );
}
