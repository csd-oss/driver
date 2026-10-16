use axum::http::{HeaderMap, header};

/// Whether a browser request comes from the dashboard's own page (CSRF defence; the cookie is
/// also SameSite=Lax). With an `Origin` header it must be the app's origin, one of `extra`, or the
/// very host the request was sent to (the Vite dev server proxies `/api` keeping the `Host`).
/// Without one (curl, tests) only a `Sec-Fetch-Site: cross-site` refuses it.
pub fn from_own_page(headers: &HeaderMap, app_origin: &str, extra: &[String]) -> bool {
    match headers.get(header::ORIGIN).and_then(|v| v.to_str().ok()) {
        Some(origin) => {
            if origin == app_origin || extra.iter().any(|o| o == origin) {
                return true;
            }
            let host = headers.get(header::HOST).and_then(|v| v.to_str().ok());
            let origin_host = origin.split_once("://").map(|(_, rest)| rest);
            matches!((origin_host, host), (Some(o), Some(h)) if !o.is_empty() && o.eq_ignore_ascii_case(h))
        }
        None => headers
            .get("sec-fetch-site")
            .and_then(|v| v.to_str().ok())
            .is_none_or(|s| s != "cross-site"),
    }
}

pub fn user_agent(headers: &HeaderMap) -> Option<&str> {
    headers.get(header::USER_AGENT).and_then(|v| v.to_str().ok())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn h(pairs: &[(&'static str, &str)]) -> HeaderMap {
        let mut m = HeaderMap::new();
        for (k, v) in pairs {
            m.insert(*k, v.parse().unwrap());
        }
        m
    }

    #[test]
    fn own_page_checks() {
        let app = "http://localhost:5190";
        assert!(from_own_page(&h(&[("origin", app)]), app, &[]));
        assert!(from_own_page(&h(&[("origin", "http://192.168.1.5:5190"), ("host", "192.168.1.5:5190")]), app, &[]));
        assert!(!from_own_page(&h(&[("origin", "https://evil.example"), ("host", "localhost:8090")]), app, &[]));
        assert!(from_own_page(&HeaderMap::new(), app, &[]));
        assert!(!from_own_page(&h(&[("sec-fetch-site", "cross-site")]), app, &[]));
    }
}
