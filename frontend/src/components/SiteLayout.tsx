import { Link, Outlet, useLocation } from "react-router-dom";
import { AccountMenu } from "./AccountMenu";
import { Button } from "./base/buttons/button";
import { LanguageSwitcher } from "./LanguageSwitcher";
import { Logo } from "./Logo";
import { MolkoAvatar } from "./MolkoAvatar";
import { PatternBackground } from "./PatternBackground";
import { ThemeToggle } from "./ThemeToggle";
import { useAuth } from "../context/AuthContext";
import { useMediaQuery } from "../hooks/useMediaQuery";
import { useI18n } from "../i18n";
import { LEGAL } from "../lib/legal";

const LANDING_LINKS = [
  { href: "#how-it-works", labelKey: "nav.howItWorks" },
  { href: "#pricing", labelKey: "nav.pricing" },
  { href: "#faq", labelKey: "nav.faq" },
] as const;

function GuestActions() {
  const { t } = useI18n();

  return (
    <>
      <Button href="/login" color="tertiary" size="sm">
        {t("nav.login")}
      </Button>
      <Button href="/register" color="success" size="sm" className="hidden sm:inline-flex">
        {t("nav.register")}
      </Button>
    </>
  );
}

function SiteHeader({ inApp }: { inApp: boolean }) {
  const { user, loading, hasAccess } = useAuth();
  const { t } = useI18n();
  const isWide = useMediaQuery("(min-width: 640px)");
  const onLanding = useLocation().pathname === "/";

  const controls = (
    <div className="flex items-center justify-end gap-1.5 sm:gap-2">
      <LanguageSwitcher />
      {!loading && !user && <GuestActions />}
      {user && !inApp && hasAccess && (
        <Button href="/app" color="secondary" size="sm" className="hidden sm:inline-flex">
          {t("nav.goToApp")}
        </Button>
      )}
      <AccountMenu />
      <ThemeToggle />
    </div>
  );

  const logo = (
    <Link to="/" aria-label="Molko">
      <Logo />
    </Link>
  );

  if (inApp) {
    return (
      <header className="relative z-20 grid grid-cols-[1fr_auto_1fr] items-center border-b border-secondary px-4 py-4 sm:px-6">
        {logo}
        <MolkoAvatar size={isWide ? 96 : 72} />
        {controls}
      </header>
    );
  }

  return (
    <header className="relative z-20 flex items-center justify-between gap-3 border-b border-secondary px-4 py-4 sm:px-6">
      <div className="flex items-center gap-8">
        {logo}
        {onLanding && (
          <nav className="hidden items-center gap-6 md:flex">
            {LANDING_LINKS.map((link) => (
              <a key={link.href} href={link.href} className="text-sm font-medium text-tertiary hover:text-secondary">
                {t(link.labelKey)}
              </a>
            ))}
          </nav>
        )}
      </div>
      {controls}
    </header>
  );
}

function SiteFooter() {
  const { t } = useI18n();

  return (
    <footer className="relative z-10 border-t border-secondary px-4 py-6 sm:px-6">
      <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 text-sm text-tertiary sm:flex-row">
        <p>{t("footer.rights", { year: new Date().getFullYear() })}</p>
        <nav className="flex items-center gap-5">
          <Link to="/terms" className="hover:text-secondary hover:underline">
            {t("footer.terms")}
          </Link>
          {LEGAL.contactEmail && (
            <a href={`mailto:${LEGAL.contactEmail}`} className="hover:text-secondary hover:underline">
              {t("footer.contact")}
            </a>
          )}
        </nav>
      </div>
    </footer>
  );
}

export function SiteLayout() {
  const inApp = useLocation().pathname.startsWith("/app");

  return (
    <div className="relative flex min-h-screen flex-col bg-primary">
      <PatternBackground />
      <SiteHeader inApp={inApp} />
      <main className="relative z-10 flex flex-1 flex-col items-center gap-6 px-4 py-10 sm:py-16">
        <Outlet />
      </main>
      <SiteFooter />
    </div>
  );
}
