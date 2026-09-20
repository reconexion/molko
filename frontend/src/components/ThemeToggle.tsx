import { Moon01, Sun } from "@untitledui/icons";
import { useTheme } from "../hooks/useTheme";
import { useI18n } from "../i18n";

export function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();
  const { t } = useI18n();
  const isDark = theme === "dark";

  return (
    <button
      type="button"
      onClick={toggleTheme}
      aria-label={isDark ? t("theme.toLight") : t("theme.toDark")}
      title={isDark ? t("theme.toLight") : t("theme.toDark")}
      className="flex size-9 shrink-0 cursor-pointer items-center justify-center rounded-lg text-tertiary ring-1 ring-secondary transition duration-100 ease-linear hover:bg-primary_hover hover:text-secondary"
    >
      {isDark ? <Sun className="size-4.5" /> : <Moon01 className="size-4.5" />}
    </button>
  );
}
