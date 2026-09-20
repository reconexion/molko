import { Globe01 } from "@untitledui/icons";
import { LANGUAGES, useI18n, type Language } from "../i18n";

export function LanguageSwitcher() {
  const { language, setLanguage, t } = useI18n();

  return (
    <label className="relative flex h-9 items-center rounded-lg text-tertiary ring-1 ring-secondary transition duration-100 ease-linear focus-within:ring-2 focus-within:ring-brand hover:bg-primary_hover hover:text-secondary">
      <Globe01 className="pointer-events-none absolute left-2.5 size-4.5" aria-hidden />
      <select
        value={language}
        onChange={(e) => setLanguage(e.target.value as Language)}
        aria-label={t("language.label")}
        title={t("language.label")}
        className="h-full cursor-pointer appearance-none bg-transparent pr-3 pl-9 text-sm font-medium text-secondary outline-none"
      >
        {LANGUAGES.map((option) => (
          <option key={option.code} value={option.code}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}
