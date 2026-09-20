import { useEffect, useState } from "react";
import { NavLink, Outlet, useNavigate, useOutletContext, useSearchParams } from "react-router-dom";
import { Greeting } from "../components/Greeting";
import { useDocumentTitle } from "../hooks/useDocumentTitle";
import { useI18n, type MessageKey } from "../i18n";
import { cx } from "../utils/cx";
import { DownloadPage } from "./DownloadPage";
import { EditorPage } from "./EditorPage";

interface AppOutletContext {
  initialSourceFile: File | null;
  useInEditor: (file: File) => void;
}

const TABS: { to: string; labelKey: MessageKey }[] = [
  { to: "/app/download", labelKey: "app.tab.download" },
  { to: "/app/editor", labelKey: "app.tab.editor" },
];

function TabBar() {
  const { t } = useI18n();

  return (
    <nav className="flex w-full max-w-xl gap-2 rounded-xl bg-secondary p-1.5 ring-1 ring-secondary">
      {TABS.map((tab) => (
        <NavLink
          key={tab.to}
          to={tab.to}
          className={({ isActive }) =>
            cx(
              "flex-1 cursor-pointer rounded-lg px-4 py-2.5 text-center text-sm font-semibold transition duration-150 ease-linear",
              isActive ? "bg-primary text-primary shadow-xs-skeuomorphic" : "text-tertiary hover:bg-primary_hover hover:text-secondary",
            )
          }
        >
          {t(tab.labelKey)}
        </NavLink>
      ))}
    </nav>
  );
}

// Layout de /app: saludo, pestañas y la pestaña activa. Al montarse (cada vez que se
// entra a la app) el saludo elige una frase nueva según la hora.
export function AppShell() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [initialSourceFile, setInitialSourceFile] = useState<File | null>(null);
  useDocumentTitle(t("title.default"));

  // Stripe deja "?checkout=success" al volver; ya cumplió su función.
  useEffect(() => {
    if (searchParams.has("checkout")) {
      searchParams.delete("checkout");
      setSearchParams(searchParams, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  const context: AppOutletContext = {
    initialSourceFile,
    useInEditor: (file) => {
      setInitialSourceFile(file);
      navigate("/app/editor");
    },
  };

  return (
    <>
      <Greeting />
      <TabBar />
      <Outlet context={context} />
    </>
  );
}

export function EditorRoute() {
  const { initialSourceFile } = useOutletContext<AppOutletContext>();
  return <EditorPage initialSourceFile={initialSourceFile} />;
}

export function DownloadRoute() {
  const { useInEditor } = useOutletContext<AppOutletContext>();
  return <DownloadPage onUseInEditor={useInEditor} />;
}
