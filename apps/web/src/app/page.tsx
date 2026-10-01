import messages from '../messages/en.json';

export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col justify-center gap-4 px-6">
      <p className="text-sm uppercase tracking-wide text-neutral-500">{messages.app.stage}</p>
      <h1 className="text-4xl font-semibold">{messages.app.name}</h1>
      <p className="text-lg text-neutral-700">{messages.app.tagline}</p>
    </main>
  );
}
