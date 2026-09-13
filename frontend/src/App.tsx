import { EditorPage } from "./pages/EditorPage";

function Nav() {
  return (
    <header className="nav">
      <span className="brand">Molko</span>
    </header>
  );
}

export default function App() {
  return (
    <div className="app">
      <Nav />
      <main className="main">
        <EditorPage />
      </main>
    </div>
  );
}
