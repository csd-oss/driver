use schools::config::Config;
use schools::state::AppState;

const USAGE: &str = "usage: schools [serve | migrate | seed [--reset] | help]

  serve     migrate, seed the demo school when the database is empty (SCHOOLS_SEED=none skips it),
            serve the API (and the built dashboard, when web/dist exists) on BIND_ADDR
  migrate   apply the database migrations
  seed      create the demo school (idempotent); --reset first deletes everything";

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "schools=info,tower_http=info,sqlx=warn".into()),
        )
        .init();
    let args: Vec<String> = std::env::args().skip(1).collect();
    let command = args.first().cloned().unwrap_or_else(|| "serve".into());
    match command.as_str() {
        "serve" => serve().await,
        "migrate" => {
            let config = Config::from_env()?;
            let pool = schools::connect(&config.database_url).await?;
            schools::MIGRATOR.run(&pool).await?;
            println!("migrations applied");
            Ok(())
        }
        "seed" => {
            let config = Config::from_env()?;
            let pool = schools::connect(&config.database_url).await?;
            schools::MIGRATOR.run(&pool).await?;
            if args.iter().any(|a| a == "--reset") {
                schools::seed::reset(&pool).await?;
            }
            let report = schools::seed::seed_demo(&pool).await?;
            println!("{report}");
            Ok(())
        }
        "-h" | "--help" | "help" => {
            println!("{USAGE}");
            Ok(())
        }
        other => anyhow::bail!("unknown command `{other}`\n{USAGE}"),
    }
}

async fn serve() -> anyhow::Result<()> {
    let config = Config::from_env()?;
    let pool = schools::connect(&config.database_url).await?;
    schools::MIGRATOR.run(&pool).await?;
    if config.seed_demo {
        let report = schools::seed::seed_demo(&pool).await?;
        tracing::info!("{report}");
    }
    let bind = config.bind;
    if let Some(dir) = &config.web_dist {
        tracing::info!(dir = %dir.display(), "serving the dashboard");
    }
    let state = AppState::new(pool, config);
    let app = schools::app(state);
    let listener = tokio::net::TcpListener::bind(bind).await?;
    tracing::info!(%bind, "listening");
    axum::serve(listener, app.into_make_service_with_connect_info::<std::net::SocketAddr>())
        .with_graceful_shutdown(async {
            let _ = tokio::signal::ctrl_c().await;
        })
        .await?;
    Ok(())
}
