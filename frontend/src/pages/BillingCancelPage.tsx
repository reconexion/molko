import { Link } from "react-router-dom";

export function BillingCancelPage() {
  return (
    <div className="card">
      <h1>Pago cancelado</h1>
      <p>No se realizó ningún cargo. Puedes intentarlo de nuevo cuando quieras.</p>
      <Link className="button" to="/pricing">
        Volver a los planes
      </Link>
    </div>
  );
}
