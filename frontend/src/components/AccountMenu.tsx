import { useEffect, useRef, useState, type FormEvent } from "react";
import { User01 } from "@untitledui/icons";
import { useAuth } from "../context/AuthContext";
import { useI18n } from "../i18n";
import { ApiError, billingApi } from "../lib/api";
import { Button } from "./base/buttons/button";

function formatDate(iso: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, { dateStyle: "long" }).format(new Date(iso));
}

export function AccountMenu() {
  const { user, logout, updateName } = useAuth();
  const { t, locale } = useI18n();
  const [open, setOpen] = useState(false);
  const [openingPortal, setOpeningPortal] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState("");
  const [savingName, setSavingName] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  if (!user) return null;

  const subscription = user.subscription;
  const planLabel = subscription?.is_active
    ? t(subscription.plan === "annual" ? "account.plan.annual" : "account.plan.monthly")
    : t("account.noSubscription");
  const dateLine =
    subscription?.is_active && subscription.current_period_end
      ? t(subscription.manageable ? "account.renews" : "account.accessUntil", {
          date: formatDate(subscription.current_period_end, locale),
        })
      : null;

  function startEditingName() {
    setNameDraft(user?.name ?? "");
    setError(null);
    setEditingName(true);
  }

  async function saveName(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSavingName(true);
    try {
      await updateName(nameDraft);
      setEditingName(false);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("account.nameError"));
    } finally {
      setSavingName(false);
    }
  }

  async function openPortal() {
    setError(null);
    setOpeningPortal(true);
    try {
      const { portal_url } = await billingApi.createPortalSession();
      window.location.assign(portal_url);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("account.portalError"));
      setOpeningPortal(false);
    }
  }

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-label={t("account.button")}
        aria-expanded={open}
        title={t("account.button")}
        className="flex size-9 shrink-0 cursor-pointer items-center justify-center rounded-lg text-tertiary ring-1 ring-secondary transition duration-100 ease-linear hover:bg-primary_hover hover:text-secondary"
      >
        <User01 className="size-4.5" />
      </button>

      {open && (
        <div className="absolute right-0 z-20 mt-2 flex w-72 flex-col gap-3 rounded-xl bg-primary p-4 shadow-xl ring-1 ring-secondary">
          <div className="min-w-0">
            {editingName ? (
              <form onSubmit={saveName} className="flex flex-col gap-2">
                <label htmlFor="account-name" className="text-xs font-semibold text-secondary">
                  {t("account.name")}
                </label>
                <input
                  id="account-name"
                  value={nameDraft}
                  onChange={(e) => setNameDraft(e.target.value)}
                  maxLength={60}
                  autoFocus
                  disabled={savingName}
                  placeholder={t("auth.name.placeholder")}
                  className="w-full rounded-lg bg-primary px-3 py-2 text-sm text-primary ring-1 ring-secondary ring-inset outline-none placeholder:text-placeholder focus:ring-2 focus:ring-brand disabled:opacity-50"
                />
                <div className="flex gap-2">
                  <Button type="submit" color="success" size="sm" isLoading={savingName} className="flex-1">
                    {t("account.save")}
                  </Button>
                  <Button
                    color="secondary"
                    size="sm"
                    isDisabled={savingName}
                    onClick={() => setEditingName(false)}
                    className="flex-1"
                  >
                    {t("account.cancel")}
                  </Button>
                </div>
              </form>
            ) : (
              <>
                <p className="truncate text-sm font-semibold text-primary" title={user.name ?? user.email}>
                  {user.name ?? t("account.noName")}
                </p>
                <button
                  type="button"
                  onClick={startEditingName}
                  className="cursor-pointer text-xs font-semibold text-brand-secondary hover:underline"
                >
                  {t("account.editName")}
                </button>
                <p className="mt-2 truncate text-sm text-secondary" title={user.email}>
                  {user.email}
                </p>
              </>
            )}
            <p className="mt-0.5 text-sm text-tertiary">{planLabel}</p>
            {dateLine && <p className="text-xs text-tertiary">{dateLine}</p>}
          </div>

          {subscription?.manageable && (
            <Button color="secondary" className="w-full" isLoading={openingPortal} onClick={openPortal}>
              {t("account.manage")}
            </Button>
          )}
          {error && <p className="text-xs text-error-primary">{error}</p>}
          <Button color="tertiary" className="w-full" onClick={logout}>
            {t("account.logout")}
          </Button>
        </div>
      )}
    </div>
  );
}
