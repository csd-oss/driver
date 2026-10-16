//! The built dashboard (`web/dist`) served from disk, with index.html for every non-API path.

use axum::http::{Method, StatusCode, Uri};
use axum::response::{IntoResponse, Response};
use std::path::PathBuf;
use tower_http::services::{ServeDir, ServeFile};

pub fn service(dir: PathBuf) -> ServeDir<ServeFile> {
    let index = dir.join("index.html");
    ServeDir::new(dir).fallback(ServeFile::new(index))
}

/// No web build: a plain 404 that says where the dashboard runs in development.
pub async fn no_web(method: Method, uri: Uri) -> Response {
    if uri.path().starts_with("/api") || method != Method::GET {
        return crate::error::AppError::not_found("Cesta").into_response();
    }
    (
        StatusCode::NOT_FOUND,
        "The dashboard is not built. In development open the Vite server (schools/dev.sh prints the URL); \
         for a single binary run `npm run build` in schools/web first.",
    )
        .into_response()
}
