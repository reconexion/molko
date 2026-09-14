import { PatternBackground } from "./components/PatternBackground";
import { EditorPage } from "./pages/EditorPage";

function Nav() {
  return (
    <header className="relative z-10 flex items-center justify-between border-b border-secondary px-6 py-4">
      <span className="text-lg font-bold text-primary">Molko</span>
    </header>
  );
}

export default function App() {
  return (
    <div className="relative flex min-h-screen flex-col bg-primary">
      <PatternBackground />
      <Nav />
      <main className="relative z-10 flex flex-1 justify-center px-4 py-10 sm:py-16">
        <EditorPage />
      </main>
    </div>
  );
}
