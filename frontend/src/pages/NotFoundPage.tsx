import { Button } from "../components/base/buttons/button";
import { MolkoAvatar } from "../components/MolkoAvatar";
import { useDocumentTitle } from "../hooks/useDocumentTitle";
import { useI18n } from "../i18n";

export function NotFoundPage() {
  const { t } = useI18n();
  useDocumentTitle(t("title.notFound"));

  return (
    <div className="flex flex-col items-center gap-4 py-6 text-center">
      <MolkoAvatar size={128} />
      <h1 className="text-3xl font-bold tracking-tight text-primary">{t("notFound.title")}</h1>
      <p className="max-w-md text-md text-tertiary">{t("notFound.body")}</p>
      <Button href="/" color="success">
        {t("notFound.back")}
      </Button>
    </div>
  );
}
