from fastapi import HTTPException


def api_error(
    status_code: int,
    code: str,
    message: str,
    *,
    headers: dict[str, str] | None = None,
    **params: str | int,
) -> HTTPException:
    """Error con un `code` estable que el frontend traduce a su idioma.

    `message` (en español) queda como respaldo para clientes que no conozcan el
    código; `params` son los valores que la traducción interpola (límites, minutos...).
    """
    detail: dict[str, object] = {"code": code, "message": message}
    if params:
        detail["params"] = params
    return HTTPException(status_code=status_code, detail=detail, headers=headers)
