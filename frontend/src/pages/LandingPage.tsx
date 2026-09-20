import { Check, Download01, PlayCircle, Scissors01, Shield01, Upload01, VideoRecorder } from "@untitledui/icons";
import type { FC } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "../components/base/buttons/button";
import { MolkoAvatar } from "../components/MolkoAvatar";
import { PlanCards } from "../components/PlanCards";
import { useAuth } from "../context/AuthContext";
import { useDocumentTitle } from "../hooks/useDocumentTitle";
import { useI18n, type MessageKey } from "../i18n";

interface Step {
  icon: FC<{ className?: string }>;
  titleKey: MessageKey;
  bodyKey: MessageKey;
}

const STEPS: Step[] = [
  { icon: Upload01, titleKey: "landing.step1.title", bodyKey: "landing.step1.body" },
  { icon: PlayCircle, titleKey: "landing.step2.title", bodyKey: "landing.step2.body" },
  { icon: Download01, titleKey: "landing.step3.title", bodyKey: "landing.step3.body" },
];

const FEATURES: Step[] = [
  { icon: VideoRecorder, titleKey: "landing.feature1.title", bodyKey: "landing.feature1.body" },
  { icon: Scissors01, titleKey: "landing.feature2.title", bodyKey: "landing.feature2.body" },
  { icon: Shield01, titleKey: "landing.feature3.title", bodyKey: "landing.feature3.body" },
  { icon: Check, titleKey: "landing.feature4.title", bodyKey: "landing.feature4.body" },
];

const FAQS: { q: MessageKey; a: MessageKey }[] = [
  { q: "landing.faq1.q", a: "landing.faq1.a" },
  { q: "landing.faq2.q", a: "landing.faq2.a" },
  { q: "landing.faq3.q", a: "landing.faq3.a" },
  { q: "landing.faq4.q", a: "landing.faq4.a" },
  { q: "landing.faq5.q", a: "landing.faq5.a" },
  { q: "landing.faq6.q", a: "landing.faq6.a" },
];

function SectionHeading({ id, title, subtitle }: { id?: string; title: string; subtitle?: string }) {
  return (
    <div id={id} className="scroll-mt-24 text-center">
      <h2 className="text-3xl font-bold tracking-tight text-primary">{title}</h2>
      {subtitle && <p className="mx-auto mt-3 max-w-xl text-md text-tertiary">{subtitle}</p>}
    </div>
  );
}

function IconCard({ item }: { item: Step }) {
  const { t } = useI18n();
  const Icon = item.icon;

  return (
    <div className="flex flex-col gap-3 rounded-xl bg-primary p-5 shadow-xs ring-1 ring-secondary">
      <span className="flex size-10 items-center justify-center rounded-lg bg-secondary text-secondary ring-1 ring-secondary">
        <Icon className="size-5" />
      </span>
      <h3 className="text-md font-semibold text-primary">{t(item.titleKey)}</h3>
      <p className="text-sm text-tertiary">{t(item.bodyKey)}</p>
    </div>
  );
}

export function LandingPage() {
  const { t } = useI18n();
  const { user, hasAccess } = useAuth();
  const navigate = useNavigate();
  useDocumentTitle(t("title.landing"));

  const primaryHref = user ? (hasAccess ? "/app" : "/pricing") : "/register";
  const primaryLabel = user && hasAccess ? t("nav.goToApp") : t("landing.hero.cta");

  return (
    <div className="flex w-full max-w-6xl flex-col gap-20 sm:gap-28">
      <section className="flex flex-col items-center gap-6 text-center">
        <MolkoAvatar size={128} />
        <span className="rounded-full bg-secondary px-3 py-1 text-xs font-semibold text-secondary ring-1 ring-secondary">
          {t("landing.hero.badge")}
        </span>
        <h1 className="max-w-3xl text-4xl font-bold tracking-tight text-primary sm:text-6xl">{t("landing.hero.title")}</h1>
        <p className="max-w-2xl text-lg text-tertiary">{t("landing.hero.subtitle")}</p>
        <div className="flex flex-col items-center gap-3 sm:flex-row">
          <Button href={primaryHref} color="success" size="xl">
            {primaryLabel}
          </Button>
          <Button
            color="secondary"
            size="xl"
            onClick={() => document.getElementById("pricing")?.scrollIntoView({ behavior: "smooth" })}
          >
            {t("landing.hero.ctaSecondary")}
          </Button>
        </div>
        <p className="text-sm text-tertiary">{t("landing.hero.note")}</p>
      </section>

      <section className="flex flex-col gap-10">
        <SectionHeading id="how-it-works" title={t("landing.steps.title")} subtitle={t("landing.steps.subtitle")} />
        <ol className="grid gap-4 md:grid-cols-3">
          {STEPS.map((step, index) => (
            <li key={step.titleKey} className="relative">
              <span className="absolute -top-3 left-5 z-10 flex size-7 items-center justify-center rounded-full bg-success-solid text-sm font-bold text-white">
                {index + 1}
              </span>
              <IconCard item={step} />
            </li>
          ))}
        </ol>
      </section>

      <section className="flex flex-col gap-10">
        <SectionHeading title={t("landing.features.title")} />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {FEATURES.map((feature) => (
            <IconCard key={feature.titleKey} item={feature} />
          ))}
        </div>
      </section>

      <section className="mx-auto flex w-full max-w-2xl flex-col gap-10">
        <SectionHeading id="pricing" title={t("landing.pricing.title")} subtitle={t("landing.pricing.subtitle")} />
        <PlanCards onSelect={(plan) => navigate(user ? "/pricing" : `/register?plan=${plan}`)} buttonLabel={() => t("landing.pricing.cta")} />
      </section>

      <section className="mx-auto flex w-full max-w-2xl flex-col gap-8">
        <SectionHeading id="faq" title={t("landing.faq.title")} />
        <div className="flex flex-col gap-3">
          {FAQS.map((faq) => (
            <details key={faq.q} className="group rounded-xl bg-primary p-5 ring-1 ring-secondary">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-md font-semibold text-primary">
                {t(faq.q)}
                <span aria-hidden className="text-tertiary transition group-open:rotate-45">
                  +
                </span>
              </summary>
              <p className="mt-3 text-sm text-tertiary">{t(faq.a)}</p>
            </details>
          ))}
        </div>
      </section>

      <section className="flex flex-col items-center gap-4 rounded-2xl bg-secondary px-6 py-12 text-center ring-1 ring-secondary">
        <h2 className="text-3xl font-bold tracking-tight text-primary">{t("landing.cta.title")}</h2>
        <p className="max-w-lg text-md text-tertiary">{t("landing.cta.subtitle")}</p>
        <Button href={primaryHref} color="success" size="xl">
          {primaryLabel}
        </Button>
      </section>
    </div>
  );
}
