import { Button } from "./base/buttons/button";
import { useI18n } from "../i18n";
import type { BillingPlan } from "../lib/api";
import { PLANS, type Plan } from "../lib/plans";
import { cx } from "../utils/cx";

interface PlanCardsProps {
  onSelect: (plan: BillingPlan) => void;
  buttonLabel: (plan: Plan) => string;
  loadingPlan?: BillingPlan | null;
}

export function PlanCards({ onSelect, buttonLabel, loadingPlan = null }: PlanCardsProps) {
  const { t } = useI18n();

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      {PLANS.map((plan) => (
        <div
          key={plan.id}
          className={cx(
            "flex flex-col gap-1 rounded-xl p-5 ring-1",
            plan.highlightKey ? "bg-secondary ring-2 ring-brand" : "bg-primary ring-secondary",
          )}
        >
          <div className="flex items-center justify-between">
            <h3 className="text-md font-semibold text-primary">{t(plan.nameKey)}</h3>
            {plan.highlightKey && <span className="text-xs font-semibold text-brand-secondary">{t(plan.highlightKey)}</span>}
          </div>
          <p className="mt-1 text-3xl font-bold text-primary">
            {plan.price} <span className="text-sm font-medium text-tertiary">{t(plan.cadenceKey)}</span>
          </p>
          <p className="text-sm text-tertiary">{t(plan.approxKey)}</p>
          <Button
            color={plan.highlightKey ? "success" : "secondary"}
            size="md"
            className="mt-4 w-full"
            isLoading={loadingPlan === plan.id}
            isDisabled={loadingPlan !== null}
            onClick={() => onSelect(plan.id)}
          >
            {buttonLabel(plan)}
          </Button>
        </div>
      ))}
    </div>
  );
}
