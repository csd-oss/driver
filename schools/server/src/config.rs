//! Server configuration from the environment.
//!
//! | Variable | Default | |
//! |---|---|---|
//! | `DATABASE_URL` | (required; `server/.cargo/config.toml` sets the local cluster) | |
//! | `BIND_ADDR` | `127.0.0.1:8090` | |
//! | `APP_URL` | `http://localhost:5190` | the web dashboard's origin (cookie writes must come from it) |
//! | `SCHOOLS_ALLOWED_ORIGINS` | – | extra browser origins, comma-separated (a phone on the LAN) |
//! | `SCHOOLS_WEB_DIST` | `../web/dist` if it exists | built dashboard to serve at `/` |
//! | `SCHOOLS_SEED` | `demo` | `demo` seeds the demo school when the database is empty; `none` doesn't |

use std::env;
use std::net::SocketAddr;
use std::path::PathBuf;
use url::Url;

#[derive(Debug, Clone)]
pub struct Config {
    pub database_url: String,
    pub bind: SocketAddr,
    pub app_url: Url,
    pub allowed_origins: Vec<String>,
    pub cookie_secure: bool,
    pub web_dist: Option<PathBuf>,
    pub seed_demo: bool,
}

fn var(name: &str) -> Option<String> {
    env::var(name).ok().filter(|v| !v.trim().is_empty())
}

impl Config {
    pub fn from_env() -> anyhow::Result<Self> {
        let database_url = var("DATABASE_URL").ok_or_else(|| anyhow::anyhow!("DATABASE_URL is required"))?;
        let app_url: Url = var("APP_URL")
            .unwrap_or_else(|| "http://localhost:5190".into())
            .parse()
            .map_err(|e| anyhow::anyhow!("APP_URL: {e}"))?;
        let bind: SocketAddr = var("BIND_ADDR")
            .unwrap_or_else(|| "127.0.0.1:8090".into())
            .parse()
            .map_err(|e| anyhow::anyhow!("BIND_ADDR: {e}"))?;
        let web_dist = var("SCHOOLS_WEB_DIST").map(PathBuf::from).or_else(|| {
            let candidates = [
                PathBuf::from("../web/dist"),
                PathBuf::from("schools/web/dist"),
                PathBuf::from(concat!(env!("CARGO_MANIFEST_DIR"), "/../web/dist")),
            ];
            candidates.into_iter().find(|p| p.join("index.html").exists())
        });
        Ok(Self {
            database_url,
            cookie_secure: app_url.scheme() == "https",
            app_url,
            bind,
            allowed_origins: var("SCHOOLS_ALLOWED_ORIGINS")
                .map(|v| {
                    v.split(',')
                        .map(|o| o.trim().trim_end_matches('/').to_owned())
                        .filter(|o| !o.is_empty())
                        .collect()
                })
                .unwrap_or_default(),
            web_dist,
            seed_demo: var("SCHOOLS_SEED").as_deref() != Some("none"),
        })
    }

    /// For tests: a loopback app URL, no web build.
    pub fn for_tests(database_url: String) -> Self {
        Self {
            database_url,
            bind: "127.0.0.1:0".parse().expect("valid"),
            app_url: "http://localhost:5190".parse().expect("valid"),
            allowed_origins: vec![],
            cookie_secure: false,
            web_dist: None,
            seed_demo: false,
        }
    }

    /// `scheme://host[:port]` of APP_URL.
    pub fn app_origin(&self) -> String {
        self.app_url.origin().ascii_serialization()
    }
}
