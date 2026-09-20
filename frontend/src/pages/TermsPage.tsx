import { Link } from "react-router-dom";
import { useDocumentTitle } from "../hooks/useDocumentTitle";
import { useI18n } from "../i18n";
import { fillLegal } from "../lib/legal";
import { TERMS, TERMS_VERSION } from "../legal/terms";

export function TermsPage() {
  const { t, language, locale } = useI18n();
  useDocumentTitle(t("title.terms"));

  const document_ = TERMS[language];
  const fill = (text: string) => fillLegal(text, t);
  // Fecha del texto (AAAA-MM-DD); se le fija la hora para que no cambie de día por zona horaria.
  const updated = new Intl.DateTimeFormat(locale, { dateStyle: "long" }).format(new Date(`${TERMS_VERSION}T12:00:00`));

  return (
    <article className="w-full max-w-3xl rounded-2xl bg-primary p-6 shadow-xl ring-1 ring-secondary sm:p-10">
      <h1 className="text-3xl font-bold tracking-tight text-primary">{t("terms.title")}</h1>
      <p className="mt-2 text-sm text-tertiary">{t("terms.updated", { date: updated })}</p>
      <p className="mt-6 text-md text-secondary">{fill(document_.intro)}</p>

      <nav aria-label={t("terms.title")} className="mt-8 rounded-xl bg-secondary p-4 ring-1 ring-secondary">
        <ol className="grid list-decimal gap-1 pl-5 text-sm text-secondary sm:grid-cols-2">
          {document_.sections.map((section, index) => (
            <li key={section.title}>
              <a href={`#section-${index + 1}`} className="hover:underline">
                {section.title}
              </a>
            </li>
          ))}
        </ol>
      </nav>

      <div className="mt-8 flex flex-col gap-8">
        {document_.sections.map((section, index) => (
          <section key={section.title} id={`section-${index + 1}`} className="scroll-mt-24">
            <h2 className="text-lg font-semibold text-primary">
              {index + 1}. {section.title}
            </h2>
            {section.paragraphs.map((paragraph) => (
              <p key={paragraph} className="mt-3 text-sm leading-relaxed text-secondary">
                {fill(paragraph)}
              </p>
            ))}
          </section>
        ))}
      </div>

      <p className="mt-10 border-t border-secondary pt-6 text-sm">
        <Link to="/" className="font-semibold text-brand-secondary hover:underline">
          ← {t("notFound.back")}
        </Link>
      </p>
    </article>
  );
}
