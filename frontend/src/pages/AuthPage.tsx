import { useEffect, useState, type FormEvent } from "react";
import { AlertCircle, Check, CreditCard01, Eye, EyeOff } from "@untitledui/icons";
import { Link, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { Button } from "../components/base/buttons/button";
import { Checkbox } from "../components/Checkbox";
import { MolkoAvatar } from "../components/MolkoAvatar";
import { TextInput } from "../components/TextInput";
import { useAuth } from "../context/AuthContext";
import { useDocumentTitle } from "../hooks/useDocumentTitle";
import { getLanguage, translateOrNull, useI18n, type MessageKey } from "../i18n";
import { ApiError, authApi, billingApi, googleStartUrl, setToken, waitlistApi, type BillingPlan } from "../lib/api";
import { FEATURE_KEYS, PLANS } from "../lib/plans";
import { cx } from "../utils/cx";

export type AuthMode = "login" | "register";

const MODES: { id: AuthMode; labelKey: MessageKey; path: string }[] = [
  { id: "login", labelKey: "auth.tab.login", path: "/login" },
  { id: "register", labelKey: "auth.tab.register", path: "/register" },
];

function PriceBox() {
  const { t } = useI18n();

  return (
    <div className="w-full rounded-xl bg-secondary p-5 text-left ring-1 ring-secondary">
      <p className="text-xs font-semibold tracking-wide text-tertiary uppercase">{t("auth.price.label")}</p>
      <p className="mt-1 text-3xl font-bold text-primary">
        $5 USD <span className="text-sm font-medium text-tertiary">{t("auth.price.perMonth")}</span>
      </p>
      <p className="text-sm text-tertiary">{t("auth.price.approx")}</p>
      <p className="mt-4 flex items-start gap-2 border-t border-secondary pt-4 text-sm text-secondary">
        <CreditCard01 className="mt-0.5 size-4 shrink-0 text-tertiary" aria-hidden />
        <span>{t("auth.price.notice")}</span>
      </p>
    </div>
  );
}

// Logotipo oficial de Google (colores de marca; las guías de Google piden no alterarlo).
function GoogleMark() {
  return (
    <svg viewBox="0 0 48 48" className="size-5" aria-hidden>
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
    </svg>
  );
}

function GoogleSignIn() {
  const { t } = useI18n();

  return (
    <div className="mt-6 flex flex-col gap-3">
      <Button
        color="secondary"
        size="lg"
        className="w-full"
        iconLeading={<GoogleMark />}
        onClick={() => window.location.assign(googleStartUrl(getLanguage()))}
      >
        {t("auth.google.button")}
      </Button>
      <p className="text-center text-xs text-tertiary">
        {t("auth.google.terms.before")}{" "}
        <Link to="/terms" target="_blank" rel="noopener" className="font-semibold text-brand-secondary hover:underline">
          {t("auth.google.terms.link")}
        </Link>
        {t("auth.google.terms.after")}
      </p>
      <div className="flex items-center gap-3 text-xs text-tertiary" role="separator">
        <span className="h-px flex-1 bg-border-secondary" />
        {t("auth.google.or")}
        <span className="h-px flex-1 bg-border-secondary" />
      </div>
    </div>
  );
}

// Elegir plan al registrarse: al enviar el formulario se crea la cuenta y se pasa directo al pago.
function PlanPicker({ value, onChange, disabled }: { value: BillingPlan; onChange: (plan: BillingPlan) => void; disabled: boolean }) {
  const { t } = useI18n();

  return (
    <fieldset className="flex flex-col gap-2" disabled={disabled}>
      <legend className="mb-1 text-sm font-semibold text-primary">{t("auth.plan.label")}</legend>
      <div className="grid grid-cols-2 gap-3" role="radiogroup" aria-label={t("auth.plan.label")}>
        {PLANS.map((plan) => {
          const selected = value === plan.id;
          return (
            <label
              key={plan.id}
              className={cx(
                "flex cursor-pointer flex-col gap-0.5 rounded-xl p-3 ring-1 transition duration-100 ease-linear has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-brand",
                selected ? "bg-secondary ring-2 ring-brand" : "bg-primary ring-secondary hover:bg-primary_hover",
                disabled && "cursor-not-allowed opacity-60",
              )}
            >
              <input
                type="radio"
                name="plan"
                value={plan.id}
                checked={selected}
                onChange={() => onChange(plan.id)}
                className="sr-only"
              />
              <span className="flex items-center justify-between gap-2 text-sm font-semibold text-primary">
                {t(plan.nameKey)}
                {plan.highlightKey && <span className="text-xs font-semibold text-brand-secondary">{t(plan.highlightKey)}</span>}
              </span>
              <span className="text-lg font-bold text-primary">
                {plan.price} <span className="text-xs font-medium text-tertiary">{t(plan.cadenceKey)}</span>
              </span>
              <span className="text-xs text-tertiary">{t(plan.approxKey)}</span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}

function ModeSwitch({ mode, onSelect }: { mode: AuthMode; onSelect: (mode: AuthMode) => void }) {
  const { t } = useI18n();

  return (
    <div className="flex gap-1.5 rounded-xl bg-secondary p-1 ring-1 ring-secondary" role="tablist">
      {MODES.map((option) => {
        const active = mode === option.id;
        return (
          <button
            key={option.id}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onSelect(option.id)}
            className={cx(
              "flex-1 cursor-pointer rounded-lg px-3 py-2 text-sm font-semibold transition duration-150 ease-linear",
              active ? "bg-primary text-primary shadow-xs-skeuomorphic" : "text-tertiary hover:bg-primary_hover hover:text-secondary",
            )}
          >
            {t(option.labelKey)}
          </button>
        );
      })}
    </div>
  );
}

export function AuthPage({ mode }: { mode: AuthMode }) {
  const { login, completeLogin } = useAuth();
  const { t } = useI18n();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  useDocumentTitle(t("title.default"));

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [plan, setPlan] = useState<BillingPlan>(() => (searchParams.get("plan") === "annual" ? "annual" : "monthly"));
  const [showPassword, setShowPassword] = useState(false);
  // Google regresa aquí con "?google_error=motivo": se muestra una vez y se limpia de la URL.
  const [error, setError] = useState<string | null>(() => {
    const reason = searchParams.get("google_error");
    return reason ? (translateOrNull(`errors.google_${reason}`) ?? t("errors.google_failed")) : null;
  });
  const [googleEnabled, setGoogleEnabled] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [signupsOpen, setSignupsOpen] = useState(true);
  const [waitlistJoined, setWaitlistJoined] = useState(false);

  useEffect(() => {
    if (searchParams.has("google_error")) {
      searchParams.delete("google_error");
      setSearchParams(searchParams, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  useEffect(() => {
    // Si no se puede consultar, se asume abierto: el backend igual hace cumplir el cupo.
    authApi
      .config()
      .then((config) => {
        setSignupsOpen(config.signups_open);
        setGoogleEnabled(config.google_enabled);
      })
      .catch(() => setSignupsOpen(true));
  }, []);

  const showWaitlist = mode === "register" && !signupsOpen;

  function switchMode(next: AuthMode) {
    setError(null);
    setWaitlistJoined(false);
    // La URL refleja la pestaña; se conserva a dónde quería ir la persona tras entrar.
    navigate(MODES.find((option) => option.id === next)!.path, { replace: true, state: location.state });
  }

  // Registrarse es comprar: se crea la cuenta y se abre el pago de Stripe con el plan elegido.
  // La sesión se guarda en el navegador antes de pagar (Stripe regresa a /app o /pricing).
  // Devuelve true cuando el navegador se va a Stripe (no hay que quitar el estado de carga).
  async function registerAndPay(): Promise<boolean> {
    const { access_token } = await authApi.register(email.trim(), password, name, acceptedTerms, getLanguage());
    setToken(access_token);
    try {
      const { checkout_url } = await billingApi.createCheckoutSession(plan);
      window.location.assign(checkout_url);
      return true;
    } catch {
      // La cuenta ya existe: se entra y GuestOnly lleva a la página de planes con un aviso para reintentar.
      navigate(`${location.pathname}${location.search}`, { replace: true, state: { ...(location.state as object | null), checkoutError: true } });
      await completeLogin(access_token);
      return false;
    }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    let leaving = false;
    try {
      if (showWaitlist) {
        await waitlistApi.join(email.trim());
        setWaitlistJoined(true);
      } else if (mode === "login") {
        await login(email.trim(), password);
      } else {
        leaving = await registerAndPay();
      }
    } catch (err) {
      if (mode === "register" && err instanceof ApiError && err.status === 403) setSignupsOpen(false);
      setError(err instanceof ApiError ? err.message : t("errors.network"));
    } finally {
      if (!leaving) setSubmitting(false);
    }
  }

  const heading = showWaitlist ? t("auth.waitlist.title") : mode === "login" ? t("auth.login.title") : t("auth.register.title");
  const subheading = showWaitlist
    ? t("auth.waitlist.subtitle")
    : mode === "login"
      ? t("auth.login.subtitle")
      : t("auth.register.subtitle");
  const submitLabel = showWaitlist ? t("auth.submit.waitlist") : mode === "login" ? t("auth.submit.login") : t("auth.submit.register");
  const needsTerms = mode === "register" && !showWaitlist;

  return (
    <div className="grid w-full max-w-4xl items-center gap-8 lg:grid-cols-[1fr_26rem] lg:gap-12">
      <section className="flex flex-col items-center gap-5 text-center lg:items-start lg:text-left">
        <MolkoAvatar size={112} />
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-primary sm:text-4xl">{t("auth.hero.title")}</h1>
          <p className="mt-3 text-md text-tertiary">{t("auth.hero.subtitle")}</p>
        </div>

        <PriceBox />

        <ul className="flex flex-col gap-2 text-left">
          {FEATURE_KEYS.map((key) => (
            <li key={key} className="flex items-start gap-2 text-sm text-secondary">
              <Check className="mt-0.5 size-4 shrink-0 text-success-primary" aria-hidden />
              {t(key)}
            </li>
          ))}
        </ul>
      </section>

      <section className="w-full rounded-2xl bg-primary p-6 shadow-xl ring-1 ring-secondary sm:p-8">
        <ModeSwitch mode={mode} onSelect={switchMode} />

        <h2 className="mt-6 text-2xl font-bold text-primary">{heading}</h2>
        <p className="mt-2 text-sm text-tertiary">{subheading}</p>

        {googleEnabled && !showWaitlist && !waitlistJoined && <GoogleSignIn />}

        {waitlistJoined ? (
          <p className="mt-6 rounded-lg bg-secondary p-4 text-sm text-secondary ring-1 ring-secondary" role="status">
            {t("auth.waitlist.joined")}
          </p>
        ) : (
          <form onSubmit={handleSubmit} className="mt-6 flex flex-col gap-4">
            {needsTerms && (
              <TextInput
                label={t("auth.name.label")}
                autoComplete="given-name"
                placeholder={t("auth.name.placeholder")}
                disabled={submitting}
                value={name}
                onChange={setName}
              />
            )}
            <TextInput
              label={t("auth.email.label")}
              type="email"
              autoComplete="email"
              placeholder={t("auth.email.placeholder")}
              required
              autoFocus
              disabled={submitting}
              value={email}
              onChange={setEmail}
            />
            {!showWaitlist && (
              <TextInput
                label={t("auth.password.label")}
                type={showPassword ? "text" : "password"}
                autoComplete={mode === "login" ? "current-password" : "new-password"}
                required
                minLength={mode === "register" ? 8 : undefined}
                hint={mode === "register" ? t("auth.password.hint") : undefined}
                disabled={submitting}
                value={password}
                onChange={setPassword}
                trailing={
                  <button
                    type="button"
                    onClick={() => setShowPassword((value) => !value)}
                    aria-label={showPassword ? t("auth.password.hide") : t("auth.password.show")}
                    aria-pressed={showPassword}
                    className="flex size-8 cursor-pointer items-center justify-center rounded-md text-tertiary transition duration-100 ease-linear hover:bg-primary_hover hover:text-secondary"
                  >
                    {showPassword ? <EyeOff className="size-4.5" /> : <Eye className="size-4.5" />}
                  </button>
                }
              />
            )}

            {needsTerms && <PlanPicker value={plan} onChange={setPlan} disabled={submitting} />}

            {needsTerms && (
              <Checkbox checked={acceptedTerms} onChange={setAcceptedTerms} disabled={submitting}>
                {t("auth.terms.before")}{" "}
                <Link
                  to="/terms"
                  target="_blank"
                  rel="noopener"
                  className="font-semibold text-brand-secondary hover:underline"
                  onClick={(e) => e.stopPropagation()}
                >
                  {t("auth.terms.link")}
                </Link>
                {t("auth.terms.after")}
              </Checkbox>
            )}

            {error && (
              <div role="alert" className="flex items-start gap-2 rounded-lg bg-error-primary p-3 text-sm text-error-primary">
                <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
                {error}
              </div>
            )}

            <Button
              type="submit"
              color="success"
              size="lg"
              isLoading={submitting}
              isDisabled={needsTerms && !acceptedTerms}
              className="w-full"
            >
              {mode === "register" && !showWaitlist && submitting ? t("auth.submit.registerBusy") : submitLabel}
            </Button>

            {mode === "register" && !showWaitlist && (
              <p className="text-center text-xs text-tertiary">{t("auth.note.register")}</p>
            )}
            {mode === "login" && <p className="text-center text-xs text-tertiary">{t("auth.note.login")}</p>}
          </form>
        )}
      </section>
    </div>
  );
}
